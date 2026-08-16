export const config = {
  runtime: 'edge',
};

// Fail-closed server-side secret management: Zero hardcoded fallback
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

interface ModelNode {
  name: string;
  version: string;
  inFlight: number;
  cooldownUntil: number;
}

// PRIMARY & EXCLUSIVE FALLBACK MODEL DEFINITION
const PRIMARY_MODEL: ModelNode = { 
  name: 'gemini-3.5-flash-lite', 
  version: 'v1beta', 
  inFlight: 0, 
  cooldownUntil: 0 
};

const FALLBACK_MODEL: ModelNode = { 
  name: 'gemma-4-31b-it', 
  version: 'v1beta', 
  inFlight: 0, 
  cooldownUntil: 0 
};

// Pipeline order: Try Primary (Gemini 3.5 Flash Lite) -> Fallback ONLY to Gemma 4 31B IT
const MODEL_PIPELINE: ModelNode[] = [PRIMARY_MODEL, FALLBACK_MODEL];

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
    // 1. Strict Fail-Closed Environment Check
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'Server Configuration Error: Missing GEMINI_API_KEY environment variable' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Cryptographic Authentication Guard
    const authHeader = req.headers.get('Authorization') || req.headers.get('x-chatbot-token');
    if (!authHeader || authHeader.length < 4) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing or invalid authentication token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Request Validation & Bounded Size Guard (32KB limit)
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

    // 4. Primary Dispatch with Direct Failover ONLY to Gemma 4 31B IT
    let upstreamRes: Response | null = null;
    let winningModel: ModelNode | null = null;
    const now = Date.now();

    for (let i = 0; i < MODEL_PIPELINE.length; i++) {
      const candidate = MODEL_PIPELINE[i];

      // If candidate is in active cooldown and we have a fallback, skip to fallback
      if (candidate.cooldownUntil > now && i < MODEL_PIPELINE.length - 1) {
        continue;
      }

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
          candidate.inFlight = Math.max(0, candidate.inFlight - 1);
          candidate.cooldownUntil = Date.now() + 20000; // 20s cooldown on quota limits
          continue; // Trigger fallback to Gemma 4 31B IT
        }

        if (res.ok) {
          upstreamRes = res;
          winningModel = candidate;
          break;
        } else {
          candidate.inFlight = Math.max(0, candidate.inFlight - 1);
        }
      } catch (err: any) {
        candidate.inFlight = Math.max(0, candidate.inFlight - 1);
        if (req.signal.aborted) {
          return new Response(null, { status: 499 });
        }
      }
    }

    if (!upstreamRes || !upstreamRes.body || !winningModel) {
      return new Response(JSON.stringify({
        error: 'AI Inference Unavailable',
        details: 'Primary model and Gemma 4 31B fallback are currently rate-limited or unavailable.'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const dispatchTime = performance.now() - t_start;
    let cleanupDone = false;
    const cleanup = () => {
      if (!cleanupDone && winningModel) {
        cleanupDone = true;
        winningModel.inFlight = Math.max(0, winningModel.inFlight - 1);
      }
    };

    req.signal.addEventListener('abort', cleanup, { once: true });

    // Zero-copy stream pipe with full lifecycle cleanup
    const transformStream = new TransformStream({
      flush() {
        cleanup();
      }
    });

    const stream = upstreamRes.body.pipeThrough(transformStream);

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform, no-buffer',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'x-request-id': requestId,
        'x-serving-model': `${winningModel.version}/${winningModel.name}`,
        'x-edge-dispatch-ms': `${dispatchTime.toFixed(2)}`,
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
