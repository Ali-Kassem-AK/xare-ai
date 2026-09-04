export const config = {
  runtime: 'edge',
};

// Fail-closed server-side secret management
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

interface ModelNode {
  name: string;
  displayName: string;
  version: string;
  inFlight: number;
  cooldownUntil: number;
}

// PRIMARY: Gemini 3.5 Flash Lite | FALLBACK: Gemini 3.1 Flash Lite
const PRIMARY_MODEL: ModelNode = { 
  name: 'gemini-3.5-flash-lite', 
  displayName: 'Gemini 3.5 Flash Lite',
  version: 'v1beta', 
  inFlight: 0, 
  cooldownUntil: 0 
};

const FALLBACK_MODEL: ModelNode = { 
  name: 'gemini-3.1-flash-lite', 
  displayName: 'Gemini 3.1 Flash Lite',
  version: 'v1beta', 
  inFlight: 0, 
  cooldownUntil: 0 
};

const MODEL_PIPELINE: ModelNode[] = [PRIMARY_MODEL, FALLBACK_MODEL];

export const DEFAULT_SYSTEM_INSTRUCTION = `You are Xare, an intelligent, versatile AI assistant engineered by Ali Kassem.
Formatting Directives:
- Use \`### Header\` for clear section breaks.
- Use \`> \` blockquotes for key takeaways, essential insights, or important notes (write actual text after \`>\`, do NOT write the literal word "Blockquote").
- Use Markdown tables (\`| ... |\`) for multi-variable comparisons, specs, and structured data.
- Use numbered lists (\`1. \`, \`2. \`) for chronological or step-by-step procedures.
- Use bullet points (\`- \` or \`* \`) for feature lists and quick scannable points (use only one bullet marker per line, never combine markers like \`- *\` or \`* *\`).
- Use \`inline code\` or \`\`\`lang\`\`\` blocks for code snippets, payload formats, and technical terms.
- Use \`$inline$\` or \`$$display$$\` for mathematical and scientific expressions (standard LaTeX syntax like \\frac, \\lim, \\int, etc.).
- Use \`---\` dividers between major content sections.
- For interactive simulations, mathematical visualizers, charts, diagrams, or UI widgets, output complete, self-contained HTML/CSS/JS (or standalone SVG) inside a single \`\`\`html ... \`\`\` (or \`\`\`svg ... \`\`\`) block. The chat interface instantly executes and renders it as an interactive visualizer directly in the chat window, so do NOT tell the user that the chat cannot run code or that they have to save it locally as an HTML file.`;

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

    const finalInstruction = systemInstruction && typeof systemInstruction === 'string' && systemInstruction.trim()
      ? `${DEFAULT_SYSTEM_INSTRUCTION}\n\n${systemInstruction.trim()}`
      : DEFAULT_SYSTEM_INSTRUCTION;

    const upstreamPayload: any = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: finalInstruction }] },
    };

    const payloadJson = JSON.stringify(upstreamPayload);

    // 4. Dispatch Pipeline: Primary (Gemini 3.5 Flash Lite) -> Fallback (Gemini 3.1 Flash Lite)
    let upstreamRes: Response | null = null;
    let winningModel: ModelNode | null = null;
    const now = Date.now();

    for (let i = 0; i < MODEL_PIPELINE.length; i++) {
      const candidate = MODEL_PIPELINE[i];

      // If candidate is in active cooldown and we have a fallback, try next
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
          candidate.cooldownUntil = Date.now() + 20000; // 20s cooldown
          continue; // Trigger fallback to Gemini 3.1 Flash Lite
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
        details: 'Gemini 3.5 Flash Lite and Gemini 3.1 Flash Lite are currently rate-limited or unavailable.'
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
        'x-serving-display': winningModel.displayName,
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
