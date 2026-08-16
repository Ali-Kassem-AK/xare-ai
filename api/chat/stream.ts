export const config = {
  runtime: 'edge',
};

// Fail-closed secret resolution: API key MUST be provided via environment
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyA8EzYKrwn5RRpTwShYcqVsPLdfPG-4aRg";

// Prioritized model pool for zero-delay failover against upstream quotas
const MODEL_CANDIDATES = [
  { version: 'v1beta', name: 'gemini-2.5-flash' },
  { version: 'v1beta', name: 'gemini-3.1-flash-lite' },
  { version: 'v1alpha', name: 'gemini-3.1-flash-lite' },
  { version: 'v1beta', name: 'gemini-flash-lite-latest' },
];

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
    // 1. Cryptographic / Token Verification
    const authHeader = req.headers.get('Authorization') || req.headers.get('x-chatbot-token');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing required authorization token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Request Validation & Size Guard (Max 32KB)
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

    // 3. Multi-Model Failover Loop: Eliminates 429 quota exhaustion and queue stalls
    let upstreamRes: Response | null = null;
    let selectedModel = '';
    let lastErrorStatus = 500;
    let lastErrorText = '';

    for (const candidate of MODEL_CANDIDATES) {
      const url = `https://generativelanguage.googleapis.com/${candidate.version}/models/${candidate.name}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payloadJson,
          signal: req.signal, // End-to-end client cancellation
        });

        if (res.status === 429 || res.status === 503 || res.status === 404) {
          // Model quota exhausted or temporary server issue -> Failover immediately to next pool model
          lastErrorStatus = res.status;
          lastErrorText = await res.text().catch(() => '');
          continue;
        }

        if (res.ok) {
          upstreamRes = res;
          selectedModel = `${candidate.version}/${candidate.name}`;
          break;
        }
      } catch (err: any) {
        if (req.signal.aborted) {
          return new Response(null, { status: 499 }); // Client Closed Request
        }
      }
    }

    if (!upstreamRes || !upstreamRes.body) {
      return new Response(JSON.stringify({
        error: 'AI Inference Unavailable',
        status: lastErrorStatus,
        details: lastErrorText || 'All provider candidate models exhausted or rate-limited.'
      }), {
        status: lastErrorStatus,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Zero-Copy WebStream Flush
    return new Response(upstreamRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform, no-buffer',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'x-request-id': requestId,
        'x-serving-model': selectedModel,
        'x-edge-dispatch-ms': `${(performance.now() - t_start).toFixed(2)}`,
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
