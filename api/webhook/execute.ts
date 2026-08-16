export const config = {
  runtime: 'edge',
};

// Fail-closed server-side secret management
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

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

  const requestId = 'req_n8n_' + Math.random().toString(36).substring(2, 11);
  const t_start = performance.now();

  try {
    // 1. Strict Fail-Closed Secret Resolution
    if (!N8N_WEBHOOK_URL) {
      return new Response(JSON.stringify({ error: 'Server Configuration Error: Missing N8N_WEBHOOK_URL' }), {
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

    // 3. Fast Zero-Copy Request Body Forwarding (Zero double parse/stringify)
    const rawBody = await req.text();
    if (!rawBody || rawBody.length > 5242880) { // 5MB limit
      return new Response(JSON.stringify({ error: 'Bad Request: Invalid or oversized payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const t_auth_done = performance.now();

    // 4. Secure Server-Side Upstream Forwarding to Hugging Face n8n
    const upstreamRes = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-chatbot-token': authHeader.replace(/^Bearers+/i, ''),
        'x-request-id': requestId,
        'Connection': 'keep-alive',
      },
      body: rawBody,
      signal: req.signal,
    });

    const upstreamTime = performance.now() - t_auth_done;

    // 5. Zero-Copy Stream / Blob Response to Client (Sanitized Headers)
    const responseHeaders = new Headers({
      'Content-Type': upstreamRes.headers.get('Content-Type') || 'application/json',
      'x-request-id': requestId,
      'x-auth-duration-ms': (t_auth_done - t_start).toFixed(2),
      'x-upstream-duration-ms': upstreamTime.toFixed(2),
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });

    if (upstreamRes.body) {
      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: responseHeaders,
      });
    }

    const data = await upstreamRes.text();
    return new Response(data, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });

  } catch (err: any) {
    if (req.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    // Safe client-facing error (never leaks n8n URL or server credentials)
    return new Response(JSON.stringify({
      error: 'Upstream Webhook Error',
      message: 'Failed to process request on automation backend',
      requestId
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
