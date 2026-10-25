export const config = {
  runtime: 'edge',
};

// Fail-closed server-side secret management
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const WARMUP_SECRET = process.env.WARMUP_SECRET;
const CHATBOT_TOKEN = process.env.CHATBOT_TOKEN;

interface RateLimitBucket {
  count: number;
  resetAt: number;
}
const IP_RATE_LIMITS = new Map<string, RateLimitBucket>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30; // 30 requests per minute per IP

function checkRateLimit(clientIp: string): { isLimited: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let bucket = IP_RATE_LIMITS.get(clientIp);

  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    IP_RATE_LIMITS.set(clientIp, bucket);
    if (IP_RATE_LIMITS.size > 10000) {
      for (const [ip, b] of IP_RATE_LIMITS.entries()) {
        if (now > b.resetAt) IP_RATE_LIMITS.delete(ip);
      }
    }
    return { isLimited: false, remaining: MAX_REQUESTS_PER_WINDOW - 1, resetAt: bucket.resetAt };
  }

  bucket.count++;
  const remaining = Math.max(0, MAX_REQUESTS_PER_WINDOW - bucket.count);
  return { isLimited: bucket.count > MAX_REQUESTS_PER_WINDOW, remaining, resetAt: bucket.resetAt };
}

function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let mismatch = a.length ^ b.length;
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    const charA = i < a.length ? a.charCodeAt(i) : 0;
    const charB = i < b.length ? b.charCodeAt(i) : 0;
    mismatch |= charA ^ charB;
  }
  return mismatch === 0;
}

interface ModelNode {
  provider: 'gemini' | 'groq';
  name: string;
  displayName: string;
  version?: string;
  inFlight: number;
  cooldownUntil: number;
}

// PRIMARY TIER: Google Gemini Pipeline (User Requested Models)
const GEMINI_PIPELINE: ModelNode[] = [
  { provider: 'gemini', name: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite', version: 'v1beta', inFlight: 0, cooldownUntil: 0 },
  { provider: 'gemini', name: 'gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash Lite', version: 'v1beta', inFlight: 0, cooldownUntil: 0 },
  { provider: 'gemini', name: 'gemma-4-31b', displayName: 'Gemma 4 31B', version: 'v1beta', inFlight: 0, cooldownUntil: 0 },
];

// SECONDARY TIER: Groq Fallback Pipeline (User Requested Models)
const GROQ_PIPELINE: ModelNode[] = [
  { provider: 'groq', name: 'qwen/qwen3.8-27b', displayName: 'Qwen 3.8 27B', inFlight: 0, cooldownUntil: 0 },
  { provider: 'groq', name: 'openai/gpt-oss-120b', displayName: 'GPT-OSS 120B', inFlight: 0, cooldownUntil: 0 },
  { provider: 'groq', name: 'openai/gpt-oss-20b', displayName: 'GPT-OSS 20B', inFlight: 0, cooldownUntil: 0 },
];

export const DEFAULT_SYSTEM_INSTRUCTION = `Role: You are Xare, a chill, smart, and highly capable multimodal AI assistant engineered exclusively by Ali Kassem (in Arabic: علي قاسم - NEVER EVER write "علي كاسم").

[CORE CONVERSATION & MEMORY RULES]
- Language Matching: Always detect and match the user's latest language.
- Multi-Turn Context & File Memory: When the user asks follow-up questions about an image, PDF, code, or previous answer, ALWAYS refer to the existing conversation history.
- NEVER ask the user to re-upload files or claim you cannot see the image/document if the analysis is already present in the chat history. Use the prior output directly to answer.

[IDENTITY & TOOL DIRECTIVE]
- If asked about your architecture, tech stack, or how you work, call/execute \`get_xare_architecture1\`.
- Translate its descriptive content into the user's query language while STRICTLY preserving all 5 columns of the architecture table and keeping all markdown image tags ('![alt](url)') intact at the end.

[TRANSLATE & GRAMMAR FORMATTING DIRECTIVES]
- When translating text: ALWAYS enclose the complete translated sentence/text inside a \`\`\`text ... \`\`\` block so users can 1-click copy it immediately, followed by the comparison table.
- When correcting grammar or improving text (e.g. Corrected Version, Improved Version): ALWAYS enclose each version's text inside its own \`\`\`text ... \`\`\` block so users can 1-click copy the exact sentence without manually selecting it.

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
- Interactive Visuals: Frequently build complete, self-contained HTML/JS/CSS (or SVG) inside a \`\`\`html block to visually or interactively explain concepts, math, data, processes, and UI. Design visuals to be compact, responsive, and properly scaled (use viewBox for SVGs, max-width: 100%, and fit comfortably within 360px-400px height with all controls clearly visible) so they render beautifully without clipping. The chat runs them live instantly—use them actively and never tell users to save files.
- Keep the tone conversational, confident, and direct. Avoid generic boilerplate disclosures, redundant apologies, or fabricated status/metadata fields unless explicitly requested.
NEVER RESPOND WITHOUT USING ANY OF THOSE UI STYLINGS`;

/**
 * Transforms an OpenAI/Groq SSE stream into Gemini SSE format.
 * Emits `data: {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}\n\n` for seamless client compatibility.
 */
function createGroqToGeminiStream(groqStream: ReadableStream<Uint8Array>, onDone?: () => void): ReadableStream<Uint8Array> {
  const reader = groqStream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let lineBuffer = '';

  function processLine(line: string, controller: ReadableStreamDefaultController<Uint8Array>) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data: ')) return;
    const jsonStr = trimmed.slice(6).trim();
    if (jsonStr === '[DONE]') return;
    try {
      const parsed = JSON.parse(jsonStr);
      const text = parsed.choices?.[0]?.delta?.content;
      if (text) {
        const geminiChunk = JSON.stringify({
          candidates: [{ content: { parts: [{ text }] } }]
        });
        controller.enqueue(encoder.encode(`data: ${geminiChunk}\n\n`));
      }
    } catch (e) {
      // Ignore partial chunk parse error
    }
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (lineBuffer.trim()) {
            processLine(lineBuffer, controller);
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          if (onDone) onDone();
          controller.close();
          return;
        }

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';

        for (const line of lines) {
          processLine(line, controller);
        }
      }
    },
    cancel(reason) {
      if (onDone) onDone();
      reader.cancel(reason);
    }
  });
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
    // 1. Strict Fail-Closed Environment Check
    if (!GEMINI_API_KEY && !GROQ_API_KEY) {
      return new Response(JSON.stringify({ 
        error: 'Server Configuration Error: Missing AI API keys (GEMINI_API_KEY or GROQ_API_KEY environment variable required)' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Origin & Abuse Protection Guards
    const origin = req.headers.get('Origin');
    const isAllowedOrigin = (urlStr: string | null) => {
      if (!urlStr) return false;
      try {
        const u = new URL(urlStr);
        return (
          u.hostname === 'xare-ai.vercel.app' ||
          u.hostname.endsWith('.vercel.app') ||
          u.hostname === 'localhost' ||
          u.hostname === '127.0.0.1'
        );
      } catch (e) {
        return false;
      }
    };

    // Check service-to-service authentication (e.g. warm-up subsystem)
    const authHeader = req.headers.get('Authorization') || req.headers.get('x-warmup-secret');
    const token = authHeader ? (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim()) : '';

    const isWarmupAuth = Boolean(
      WARMUP_SECRET && token && timingSafeCompare(token, WARMUP_SECRET)
    );

    // Multi-Layer Defense: Sec-Fetch-Site and Origin verification
    const secFetchSite = req.headers.get('sec-fetch-site');
    if (secFetchSite === 'cross-site' && !isWarmupAuth) {
      return new Response(JSON.stringify({ error: 'Forbidden: Cross-site requests rejected' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (origin && !isAllowedOrigin(origin) && !isWarmupAuth) {
      return new Response(JSON.stringify({ error: 'Forbidden: Untrusted request origin' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Client IP Sliding-Window Abuse Protection & Rate Limiting
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || '127.0.0.1';
    const rateCheck = checkRateLimit(clientIp);
    if (!isWarmupAuth && rateCheck.isLimited) {
      const retryAfterSec = Math.max(1, Math.ceil((rateCheck.resetAt - Date.now()) / 1000));
      return new Response(JSON.stringify({ 
        error: 'Too Many Requests', 
        message: 'Rate limit exceeded. Please wait a moment before sending another message.' 
      }), {
        status: 429,
        headers: { 
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfterSec),
          'X-RateLimit-Limit': String(MAX_REQUESTS_PER_WINDOW),
          'X-RateLimit-Remaining': String(rateCheck.remaining),
          'X-RateLimit-Reset': String(Math.ceil(rateCheck.resetAt / 1000))
        },
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
    const { prompt, systemInstruction, mode, isUtility } = body;
    const isUtilityCall = mode === 'utility' || isUtility === true;

    // Distinguish utility calls (titles, suggestions) from conversation chat to prevent markdown header pollution
    let finalInstruction: string;
    if (isUtilityCall) {
      finalInstruction = systemInstruction && typeof systemInstruction === 'string' && systemInstruction.trim()
        ? systemInstruction.trim()
        : 'You are a concise utility assistant. Strictly answer the prompt without conversational filler or markdown headers.';
    } else {
      finalInstruction = systemInstruction && typeof systemInstruction === 'string' && systemInstruction.trim()
        ? `${DEFAULT_SYSTEM_INSTRUCTION}\n\n${systemInstruction.trim()}`
        : DEFAULT_SYSTEM_INSTRUCTION;
    }

    // 4. Multi-Tier Fault-Tolerant AI Model Dispatch
    let upstreamRes: Response | null = null;
    let winningModel: ModelNode | null = null;
    let lastErrorDetails = '';
    const now = Date.now();

    // TIER 1: Google Gemini Pipeline (if GEMINI_API_KEY is configured)
    if (GEMINI_API_KEY) {
      const upstreamPayload: any = {
        contents: [{ parts: [{ text: prompt }] }],
      };
      if (finalInstruction) {
        upstreamPayload.systemInstruction = { parts: [{ text: finalInstruction }] };
      }
      const geminiPayloadJson = JSON.stringify(upstreamPayload);

      for (let i = 0; i < GEMINI_PIPELINE.length; i++) {
        const candidate = GEMINI_PIPELINE[i];

        // Skip candidate if cooling down and we have another candidate to try
        if (candidate.cooldownUntil > now && i < GEMINI_PIPELINE.length - 1) {
          continue;
        }

        candidate.inFlight++;
        const url = `https://generativelanguage.googleapis.com/${candidate.version || 'v1beta'}/models/${candidate.name}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: geminiPayloadJson,
            signal: req.signal,
          });

          if (res.ok) {
            upstreamRes = res;
            winningModel = candidate;
            break;
          } else {
            const errText = await res.text().catch(() => '');
            lastErrorDetails = `Gemini ${candidate.name} [${res.status}]: ${errText.slice(0, 300)}`;
            candidate.inFlight = Math.max(0, candidate.inFlight - 1);
            if (res.status === 429 || res.status === 503) {
              candidate.cooldownUntil = Date.now() + 20000;
            }
          }
        } catch (err: any) {
          lastErrorDetails = `Gemini ${candidate.name} fetch exception: ${err.message}`;
          candidate.inFlight = Math.max(0, candidate.inFlight - 1);
          if (req.signal.aborted) {
            return new Response(null, { status: 499 });
          }
        }
      }
    }

    // TIER 2: Groq Fallback Pipeline (if Gemini failed/unconfigured & GROQ_API_KEY is configured)
    if (!winningModel && GROQ_API_KEY) {
      const groqMessages: any[] = [];
      if (finalInstruction) {
        groqMessages.push({ role: 'system', content: finalInstruction });
      }
      groqMessages.push({ role: 'user', content: prompt });

      for (let i = 0; i < GROQ_PIPELINE.length; i++) {
        const candidate = GROQ_PIPELINE[i];

        // Skip candidate if cooling down and we have another candidate to try
        if (candidate.cooldownUntil > now && i < GROQ_PIPELINE.length - 1) {
          continue;
        }

        candidate.inFlight++;
        const groqPayload = JSON.stringify({
          model: candidate.name,
          messages: groqMessages,
          stream: true,
          temperature: 0.7,
        });

        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: groqPayload,
            signal: req.signal,
          });

          if (res.ok) {
            upstreamRes = res;
            winningModel = candidate;
            break;
          } else {
            const errText = await res.text().catch(() => '');
            lastErrorDetails = `Groq ${candidate.name} [${res.status}]: ${errText.slice(0, 300)}`;
            candidate.inFlight = Math.max(0, candidate.inFlight - 1);
            if (res.status === 429 || res.status === 503) {
              candidate.cooldownUntil = Date.now() + 20000;
            }
          }
        } catch (err: any) {
          lastErrorDetails = `Groq ${candidate.name} fetch exception: ${err.message}`;
          candidate.inFlight = Math.max(0, candidate.inFlight - 1);
          if (req.signal.aborted) {
            return new Response(null, { status: 499 });
          }
        }
      }
    }

    if (!upstreamRes || !upstreamRes.body || !winningModel) {
      let availableModels: string[] = [];
      if (GEMINI_API_KEY) {
        try {
          const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
          if (listRes.ok) {
            const listData = await listRes.json();
            availableModels = (listData.models || []).map((m: any) => m.name.replace('models/', ''));
          }
        } catch (e) {}
      }

      return new Response(JSON.stringify({
        error: 'AI Inference Unavailable',
        details: lastErrorDetails || 'All primary (Gemini) and secondary (Groq) models are currently rate-limited or unavailable.',
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

    let finalStream: ReadableStream<Uint8Array>;
    if (winningModel.provider === 'groq') {
      finalStream = createGroqToGeminiStream(upstreamRes.body, cleanup);
    } else {
      const transformStream = new TransformStream({
        flush() {
          cleanup();
        }
      });
      finalStream = upstreamRes.body.pipeThrough(transformStream);
    }

    return new Response(finalStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform, no-buffer',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'x-request-id': requestId,
        'x-serving-model': winningModel.provider === 'groq' ? `groq/${winningModel.name}` : `${winningModel.version}/${winningModel.name}`,
        'x-serving-display': winningModel.provider === 'groq' ? `${winningModel.displayName} (via Groq)` : winningModel.displayName,
        'x-serving-provider': winningModel.provider,
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
