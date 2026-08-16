export const config = {
  runtime: 'edge',
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyA8EzYKrwn5RRpTwShYcqVsPLdfPG-4aRg";

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id, x-chatbot-token',
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

  try {
    const authHeader = req.headers.get('Authorization') || req.headers.get('x-chatbot-token');
    const userId = req.headers.get('x-user-id');

    if (!authHeader && !userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing authentication credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.prompt !== 'string' || !body.prompt.trim()) {
      return new Response(JSON.stringify({ error: 'Bad Request: Missing or invalid prompt' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { prompt, systemInstruction } = body;

    // Upstream request to Google Gemini with SSE streaming
    const upstreamUrl = `https://generativelanguage.googleapis.com/v1alpha/models/gemini-3.1-flash-lite:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
    
    const upstreamPayload: any = {
      contents: [{ parts: [{ text: prompt }] }],
    };
    if (systemInstruction) {
      upstreamPayload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const controller = new AbortController();
    
    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(upstreamPayload),
      signal: controller.signal,
    });

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text().catch(() => '');
      return new Response(JSON.stringify({ error: `Upstream AI Provider Error: ${upstreamRes.status}`, details: errText }), {
        status: upstreamRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const upstreamReader = upstreamRes.body?.getReader();
    if (!upstreamReader) {
      return new Response(JSON.stringify({ error: 'Upstream stream unavailable' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Pipe the SSE stream cleanly with client disconnect abortion
    const stream = new ReadableStream({
      async start(controllerStream) {
        try {
          while (true) {
            const { done, value } = await upstreamReader.read();
            if (done) {
              controllerStream.close();
              break;
            }
            controllerStream.enqueue(value);
          }
        } catch (err: any) {
          controller.abort();
          controllerStream.error(err);
        }
      },
      cancel() {
        controller.abort();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'x-request-id': requestId,
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
