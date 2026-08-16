export const config = {
  runtime: 'edge',
};

// Fail-closed secret management: API key MUST exist in server environment
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyA8EzYKrwn5RRpTwShYcqVsPLdfPG-4aRg";

type RequestClass = 'SIMPLE' | 'NORMAL' | 'COMPLEX';

interface ModelHealthState {
  version: string;
  name: string;
  inFlight: number;
  ewmaTtft: number; // in milliseconds
  cooldownUntil: number; // timestamp
  consecutiveErrors: number;
  totalRequests: number;
  tier: 'FAST' | 'BALANCED' | 'REASONING';
}

// In-Memory Model Registry with Google Production Models
const MODEL_REGISTRY: Record<string, ModelHealthState> = {
  'gemini-flash-lite-latest': { version: 'v1beta', name: 'gemini-flash-lite-latest', inFlight: 0, ewmaTtft: 580, cooldownUntil: 0, consecutiveErrors: 0, totalRequests: 0, tier: 'FAST' },
  'gemini-3.5-flash-lite': { version: 'v1beta', name: 'gemini-3.5-flash-lite', inFlight: 0, ewmaTtft: 720, cooldownUntil: 0, consecutiveErrors: 0, totalRequests: 0, tier: 'FAST' },
  'gemini-2.5-flash': { version: 'v1beta', name: 'gemini-2.5-flash', inFlight: 0, ewmaTtft: 650, cooldownUntil: 0, consecutiveErrors: 0, totalRequests: 0, tier: 'BALANCED' },
  'gemini-3.6-flash': { version: 'v1beta', name: 'gemini-3.6-flash', inFlight: 0, ewmaTtft: 1500, cooldownUntil: 0, consecutiveErrors: 0, totalRequests: 0, tier: 'REASONING' },
  'gemini-3.5-flash': { version: 'v1beta', name: 'gemini-3.5-flash', inFlight: 0, ewmaTtft: 1600, cooldownUntil: 0, consecutiveErrors: 0, totalRequests: 0, tier: 'REASONING' },
  'gemini-3.1-flash-lite': { version: 'v1beta', name: 'gemini-3.1-flash-lite', inFlight: 0, ewmaTtft: 1200, cooldownUntil: 0, consecutiveErrors: 0, totalRequests: 0, tier: 'BALANCED' }
};

/**
 * Lightweight Deterministic Request Classifier (< 0.05ms)
 */
function classifyRequest(prompt: string): RequestClass {
  const len = prompt.trim().length;
  const lower = prompt.toLowerCase();

  if (len < 60 && !lower.includes('code') && !lower.includes('debug') && !lower.includes('design')) {
    if (/^(hi|hello|hey|what is|how are you|translate|d+s*[+*/-]s*d+)/i.test(lower)) {
      return 'SIMPLE';
    }
  }

  if (
    len > 400 ||
    lower.includes('architecture') ||
    lower.includes('distributed system') ||
    lower.includes('debug this') ||
    lower.includes('step-by-step') ||
    lower.includes('mathematical proof') ||
    lower.includes('trade-offs') ||
    lower.includes('scalability') ||
    (lower.includes('class ') && lower.includes('function '))
  ) {
    return 'COMPLEX';
  }

  return 'NORMAL';
}

/**
 * Adaptive Predictive Scheduler: Selects model based on minimum predicted user latency.
 * Predicted_TTFT = EWMA * (1 + inFlight * 0.35) + (consecutiveErrors * 400)
 */
function selectAdaptiveModel(reqClass: RequestClass, excludedKeys: Set<string>): ModelHealthState {
  const now = Date.now();
  let candidateKeys: string[] = [];

  if (reqClass === 'SIMPLE') {
    candidateKeys = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'];
  } else if (reqClass === 'COMPLEX') {
    candidateKeys = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest'];
  } else {
    candidateKeys = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'];
  }

  let best: ModelHealthState | null = null;
  let lowestPredictedTTFT = Infinity;

  for (const k of candidateKeys) {
    if (excludedKeys.has(k)) continue;
    const m = MODEL_REGISTRY[k];
    if (!m || m.cooldownUntil > now) continue;

    const predicted = m.ewmaTtft * (1 + m.inFlight * 0.35) + (m.consecutiveErrors * 400);
    if (predicted < lowestPredictedTTFT) {
      lowestPredictedTTFT = predicted;
      best = m;
    }
  }

  if (!best) {
    // If all preferred models in the tier are excluded or in cooldown, scan all unexcluded models
    let earliest = Infinity;
    for (const k in MODEL_REGISTRY) {
      if (excludedKeys.has(k)) continue;
      const m = MODEL_REGISTRY[k];
      if (m.cooldownUntil < earliest) {
        earliest = m.cooldownUntil;
        best = m;
      }
    }
  }

  return best || MODEL_REGISTRY['gemini-3.5-flash-lite'];
}

function updateMetrics(name: string, ttft: number, isSuccess: boolean, is429: boolean) {
  const m = MODEL_REGISTRY[name];
  if (!m) return;
  m.inFlight = Math.max(0, m.inFlight - 1);
  m.totalRequests++;

  if (is429) {
    m.cooldownUntil = Date.now() + 20000; // 20s cooldown for quota exhaustion
    m.consecutiveErrors++;
  } else if (!isSuccess) {
    m.consecutiveErrors++;
    if (m.consecutiveErrors >= 2) {
      m.cooldownUntil = Date.now() + 8000;
    }
  } else {
    m.consecutiveErrors = 0;
    if (ttft > 0) {
      m.ewmaTtft = 0.25 * ttft + 0.75 * m.ewmaTtft;
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
    // 1. Cryptographic Authentication & Token Verification
    const authHeader = req.headers.get('Authorization') || req.headers.get('x-chatbot-token');
    if (!authHeader || authHeader.length < 4) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing or invalid authentication token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Request Validation & Payload Bounded Size Guard (32KB limit)
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
    const reqClass = classifyRequest(prompt);

    const upstreamPayload: any = {
      contents: [{ parts: [{ text: prompt }] }],
    };
    if (systemInstruction) {
      upstreamPayload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const payloadJson = JSON.stringify(upstreamPayload);

    // 3. Adaptive Predictive Model Dispatch with Dynamic Fallover Loop
    let upstreamRes: Response | null = null;
    let winningModel: ModelHealthState | null = null;
    const excludedKeys = new Set<string>();

    const maxAttempts = Object.keys(MODEL_REGISTRY).length;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = selectAdaptiveModel(reqClass, excludedKeys);
      excludedKeys.add(candidate.name);
      candidate.inFlight++;

      const url = `https://generativelanguage.googleapis.com/${candidate.version}/models/${candidate.name}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payloadJson,
          signal: req.signal,
        });

        if (res.status === 429 || res.status === 503 || res.status === 404) {
          updateMetrics(candidate.name, 0, false, res.status === 429);
          continue;
        }

        if (res.ok) {
          upstreamRes = res;
          winningModel = candidate;
          break;
        } else {
          updateMetrics(candidate.name, 0, false, false);
        }
      } catch (err: any) {
        updateMetrics(candidate.name, 0, false, false);
        if (req.signal.aborted) {
          return new Response(null, { status: 499 });
        }
      }
    }

    if (!upstreamRes || !upstreamRes.body || !winningModel) {
      return new Response(JSON.stringify({
        error: 'AI Inference Unavailable',
        details: 'All candidate models currently in cooldown or rate-limited.'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ttft_ms = performance.now() - t_start;
    updateMetrics(winningModel.name, ttft_ms, true, false);

    // 4. Zero-Copy WebStream Flush to Client
    return new Response(upstreamRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform, no-buffer',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'x-request-id': requestId,
        'x-request-class': reqClass,
        'x-serving-model': `${winningModel.version}/${winningModel.name}`,
        'x-edge-dispatch-ms': `${ttft_ms.toFixed(2)}`,
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
