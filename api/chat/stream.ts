export const config = {
  runtime: 'edge',
};

// Fail-closed server-side secret management
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// EXCLUSIVE MODEL: Gemma 4 31B IT (Single Dedicated Model)
const MODEL_NAME = 'gemma-4-31b-it';
const MODEL_VERSION = 'v1beta';

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

  const requestId = 'req_gemma_' + Math.random().toString(36).substring(2, 11);
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

    // 4. Dispatch ONLY to Gemma 4 31B IT
    const url = `https://generativelanguage.googleapis.com/${MODEL_VERSION}/models/${MODEL_NAME}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

    const upstreamRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payloadJson,
      signal: req.signal,
    });

    if (!upstreamRes.ok) {
      const errorText = await upstreamRes.text().catch(() => 'Unknown upstream error');
      return new Response(JSON.stringify({
        error: 'Gemma 4 31B Inference Error',
        status: upstreamRes.status,
        details: errorText
      }), {
        status: upstreamRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const dispatchTime = performance.now() - t_start;

    // Zero-copy stream pipe directly to browser
    return new Response(upstreamRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform, no-buffer',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'x-request-id': requestId,
        'x-serving-model': `${MODEL_VERSION}/${MODEL_NAME}`,
        'x-edge-dispatch-ms': `${dispatchTime.toFixed(2)}`,
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (err: any) {
    if (req.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    return new Response(JSON.stringify({ error: 'Internal Server Error', message: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
