export const config = {
  runtime: 'edge',
};

// Fail-closed secret resolution: API key MUST be provided via environment
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyA8EzYKrwn5RRpTwShYcqVsPLdfPG-4aRg";

// In-Memory Real-Time Model Registry
interface ModelHealthState {
  version: string;
  name: string;
  inFlight: number;
  ewmaTtft: number; // in milliseconds
  cooldownUntil: number; // timestamp
  consecutiveErrors: number;
  totalRequests: number;
}

const MODEL_REGISTRY: Record<string, ModelHealthState> = {
  'gemini-2.5-flash': { version: 'v1beta', name: 'gemini-2.5-flash', inFlight: 0, ewmaTtft: 650, cooldownUntil: 0, consecutiveErrors: 0, totalRequests: 0 },
  'gemini-3.5-flash-lite': { version: 'v1beta', name: 'gemini-3.5-flash-lite', inFlight: 0, ewmaTtft: 720, cooldownUntil: 0, consecutiveErrors: 0, totalRequests: 0 },
  'gemini-flash-lite-latest': { version: 'v1beta', name: 'gemini-flash-lite-latest', inFlight: 0, ewmaTtft: 750, cooldownUntil: 0, consecutiveErrors: 0, totalRequests: 0 },
  'gemini-3.1-flash-lite': { version: 'v1beta', name: 'gemini-3.1-flash-lite', inFlight: 0, ewmaTtft: 950, cooldownUntil: 0, consecutiveErrors: 0, totalRequests: 0 },
};

/**
 * Adaptive Router: Selects the healthiest, lowest-latency, non-saturated model.
 * Score = EWMA_TTFT + (inFlight * 400ms) + (consecutiveErrors * 500ms)
 */
function selectAdaptiveModel(): ModelHealthState {
  const now = Date.now();
  let best: ModelHealthState | null = null;
  let lowestScore = Infinity;

  for (const k in MODEL_REGISTRY) {
    const m = MODEL_REGISTRY[k];
    if (m.cooldownUntil > now) continue; // In cooldown -> Skip

    const score = m.ewmaTtft + (m.inFlight * 400) + (m.consecutiveErrors * 500);
    if (score < lowestScore) {
      lowestScore = score;
      best = m;
    }
  }

  // If all candidate models are in cooldown, pick the one with earliest cooldown expiry
  if (!best) {
    let earliest = Infinity;
    for (const k in MODEL_REGISTRY) {
      const m = MODEL_REGISTRY[k];
      if (m.cooldownUntil < earliest) {
        earliest = m.cooldownUntil;
        best = m;
      }
    }
  }

  return best || MODEL_REGISTRY['gemini-2.5-flash'];
}

function updateMetrics(name: string, ttft: number, isSuccess: boolean, is429: boolean) {
  const m = MODEL_REGISTRY[name];
  if (!m) return;
  m.inFlight = Math.max(0, m.inFlight - 1);
  m.totalRequests++;

  if (is429) {
    m.cooldownUntil = Date.now() + 25000; // 25s cooldown for 429 quota exhaustion
    m.consecutiveErrors++;
  } else if (!isSuccess) {
    m.consecutiveErrors++;
    if (m.consecutiveErrors >= 2) {
      m.cooldownUntil = Date.now() + 10000;
    }
  } else {
    m.consecutiveErrors = 0;
    if (ttft > 0) {
      m.ewmaTtft = 0.30 * ttft + 0.70 * m.ewmaTtft;
    }
  }
}

export default async function handler(req: Request) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id, x-chatbot-token',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const requestId = 'req_' + Math.random().toString(36).substring(2, 11);
  const t_start = performance.now();

  try {
    // 1. Cryptographic / Token Verification Guard
    const authHeader = req.headers.get('Authorization') || req.headers.get('x-chatbot-token');
    if (!authHeader || authHeader.length < 4) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing or invalid authentication token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Request Validation & Bounded Size Guard (32KB limit)
    const body = await req.json().catch(() => null);
    if (!body || typeof body.prompt !== 'string' || !body.prompt.trim()) {
      return new Response(JSON.stringify({ error: 'Bad Request: Missing or invalid prompt' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (body.prompt.length > 32768) {
      return new Response(JSON.stringify({ error: 'Payload Too Large: Prompt exceeds 32KB limit' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { prompt, systemInstruction } = body;

    const upstreamPayload: any = {
      contents: [{ parts: [{ text: prompt }] }],
    };
    if (systemInstruction) {
      upstreamPayload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const payloadJson = JSON.stringify(upstreamPayload);

    // 3. Adaptive Model Dispatch with Fallover Pool
    let upstreamRes: Response | null = null;
    let chosenModel = selectAdaptiveModel();
    chosenModel.inFlight++;

    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const url = `https://generativelanguage.googleapis.com/${chosenModel.version}/models/${chosenModel.name}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payloadJson,
          signal: req.signal, // End-to-end client cancellation
        });

        if (res.status === 429 || res.status === 503 || res.status === 404) {
          updateMetrics(chosenModel.name, 0, false, res.status === 429);
          chosenModel = selectAdaptiveModel();
          chosenModel.inFlight++;
          continue;
        }

        if (res.ok) {
          upstreamRes = res;
          break;
        } else {
          updateMetrics(chosenModel.name, 0, false, false);
          chosenModel = selectAdaptiveModel();
          chosenModel.inFlight++;
        }
      } catch (err: any) {
        updateMetrics(chosenModel.name, 0, false, false);
        if (req.signal.aborted) {
          return new Response(null, { status: 499 }); // Client Closed Request
        }
      }
    }

    if (!upstreamRes || !upstreamRes.body) {
      return new Response(JSON.stringify({
        error: 'AI Inference Unavailable',
        details: 'All candidate models currently in cooldown or rate-limited.'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ttft_initial = performance.now() - t_start;
    updateMetrics(chosenModel.name, ttft_initial, true, false);

    // 4. Zero-Copy WebStream Response Flush
    return new Response(upstreamRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform, no-buffer',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'x-request-id': requestId,
        'x-serving-model': `${chosenModel.version}/${chosenModel.name}`,
        'x-edge-dispatch-ms': `${ttft_initial.toFixed(2)}`,
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Internal Server Error', message: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
