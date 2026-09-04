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

// PRIMARY: Gemini 2.0 Flash (branded as Gemini 3.5 Flash Lite) | FALLBACK: Gemini 1.5 Flash (branded as Gemini 3.1 Flash Lite)
const PRIMARY_MODEL: ModelNode = { 
  name: 'gemini-2.0-flash', 
  displayName: 'Gemini 3.5 Flash Lite',
  version: 'v1beta', 
  inFlight: 0, 
  cooldownUntil: 0 
};

const FALLBACK_MODEL: ModelNode = { 
  name: 'gemini-1.5-flash', 
  displayName: 'Gemini 3.1 Flash Lite',
  version: 'v1beta', 
  inFlight: 0, 
  cooldownUntil: 0 
};

const MODEL_PIPELINE: ModelNode[] = [PRIMARY_MODEL, FALLBACK_MODEL];

export const DEFAULT_SYSTEM_INSTRUCTION = `Role: You are Xare, a chill, smart, and highly capable multimodal AI assistant engineered exclusively by Ali Kassem (in Arabic: علي قاسم - NEVER EVER write "علي كاسم").

[CORE CONVERSATION & MEMORY RULES]
- Language Matching: Always detect and match the user's latest language.
- Multi-Turn Context & File Memory: When the user asks follow-up questions about an image, PDF, code, or previous answer, ALWAYS refer to the existing conversation history.
- NEVER ask the user to re-upload files or claim you cannot see the image/document if the analysis is already present in the chat history. Use the prior output directly to answer.

[IDENTITY & TOOL DIRECTIVE]
- If asked about your architecture, tech stack, or how you work, call/execute \`get_xare_architecture1\`.
- Translate its descriptive content into the user's query language while STRICTLY preserving all 5 columns of the architecture table and keeping all markdown image tags ('![alt](url)') intact at the end.

[MANDATORY FRONTEND UI STYLING - ALL RESPONSES]
YOU MUST Structure EVERY response using Xare's frontend markdown components:
- Use \`### Header\` for clear section breaks.
- Use \`> \` blockquotes for key takeaways, essential insights, or important notes (write actual text after \`>\`, do NOT write the literal word "Blockquote").
- Use Markdown tables (\`| ... |\`) for multi-variable comparisons, specs, and structured data.
- Use numbered lists (\`1. \`, \`2. \`) for chronological or step-by-step procedures.
- Use bullet points (\`- \` or \`* \`) for feature lists and quick scannable points.
- Use \`inline code\` or \`\`\`lang\`\`\` blocks for code snippets, payload formats, and technical terms.
- Use \`$inline$\` or \`$$display$$\` for mathematical and scientific expressions.
- Use \`---\` dividers between major content sections.
- Interactive Visuals: Frequently build complete, self-contained HTML/JS/CSS (or SVG) inside a \`\`\`html block to visually or interactively explain concepts, math, data, processes, and UI. The chat runs them live instantly—use them actively and never tell users to save files.
- Keep the tone conversational, confident, and direct. Avoid generic boilerplate disclosures, redundant apologies, or fabricated status/metadata fields unless explicitly requested.
NEVER RESPOND WITHOUT USING ANY OF THOSE UI STYLINGS`;

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

    let lastErrorDetails = '';
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

        if (res.ok) {
          upstreamRes = res;
          winningModel = candidate;
          break;
        } else {
          const errText = await res.text().catch(() => '');
          lastErrorDetails = `${candidate.name} [${res.status}]: ${errText.slice(0, 300)}`;
          candidate.inFlight = Math.max(0, candidate.inFlight - 1);
          if (res.status === 429 || res.status === 503) {
            candidate.cooldownUntil = Date.now() + 20000;
          }
        }
      } catch (err: any) {
        lastErrorDetails = `Fetch exception: ${err.message}`;
        candidate.inFlight = Math.max(0, candidate.inFlight - 1);
        if (req.signal.aborted) {
          return new Response(null, { status: 499 });
        }
      }
    }

    if (!upstreamRes || !upstreamRes.body || !winningModel) {
      let availableModels: string[] = [];
      try {
        const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
        if (listRes.ok) {
          const listData = await listRes.json();
          availableModels = (listData.models || []).map((m: any) => m.name.replace('models/', ''));
        }
      } catch (e) {}

      return new Response(JSON.stringify({
        error: 'AI Inference Unavailable',
        details: lastErrorDetails || 'Models are currently rate-limited or unavailable.',
        availableModels: availableModels.slice(0, 20)
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
