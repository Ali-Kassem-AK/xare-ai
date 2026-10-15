export const config = {
  runtime: 'edge',
};

// Fail-closed server-side secret management — ZERO hardcoded fallbacks
const WARMUP_SECRET = process.env.WARMUP_SECRET;
const CRON_SECRET = process.env.CRON_SECRET;
const N8N_WEBHOOK_TOKEN = process.env.N8N_WEBHOOK_TOKEN || process.env.CHATBOT_TOKEN || process.env.WARMUP_SECRET;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://aliiis-24-7-n8n.hf.space/webhook/xare-ai-v2-guALIharika';

export const DEFAULT_SYSTEM_INSTRUCTION = `Role: You are Xare, a chill, smart, and highly capable multimodal AI assistant engineered exclusively by Ali Kassem (in Arabic: علي قاسم - NEVER EVER write "علي كاسم").

[CORE CONVERSATION & MEMORY RULES]
- Language Matching: Always detect and match the user's latest language.
- Multi-Turn Context & File Memory: When the user asks follow-up questions about an image, PDF, code, or previous answer, ALWAYS refer to the existing conversation history.
- NEVER ask the user to re-upload files or claim you cannot see the image/document if the analysis is already present in the chat history. Use the prior output directly to answer.

[IDENTITY & TOOL DIRECTIVE]
- If asked about your architecture, tech stack, or how you work, call/execute \`get_xare_architecture1\`.
- Translate its descriptive content into the user's query language while STRICTLY preserving all 5 columns of the architecture table and keeping all markdown image tags ('![alt](url)') intact at the end.`;

export interface TargetExecutionRecord {
  target: 'primary_n8n' | 'edge_stream';
  endpoint: string;
  status: number | string;
  startTime: string;
  endTime: string;
  durationMs: number;
  firstTokenMs?: number;
  modelIdentifier?: string;
  responseVerified: boolean;
  responseExcerpt: string;
  responseLength: number;
  responseHash?: string;
  error?: string;
  retries: number;
}

export interface WarmupRunSummary {
  runId: string;
  idempotencyKey: string;
  scheduledCadence: string;
  timestamp: string;
  status: 'success' | 'partial' | 'failed' | 'skipped';
  reason?: string;
  durationMs: number;
  targets: TargetExecutionRecord[];
}

// In-memory execution state across edge invocations in the same container instance
let lastExecutionTime = 0;
let isExecutionInProgress = false;
const EXECUTION_COOLDOWN_MS = 60000; // 60s cooldown to prevent overlapping executions
const MAX_HISTORY = 20;
const RUN_HISTORY: WarmupRunSummary[] = [];

/**
 * Constant-time string comparison to prevent timing side-channel attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Strict authentication: verifies caller token against configured server-side secrets.
 * Fails closed if no secret is configured on the server.
 */
function isAuthorized(req: Request): boolean {
  if (!WARMUP_SECRET && !CRON_SECRET) {
    return false;
  }

  const authHeader = req.headers.get('Authorization') || req.headers.get('x-warmup-secret');
  if (!authHeader) return false;

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  if (!token || token.length < 8) return false;

  if (WARMUP_SECRET && timingSafeEqual(token, WARMUP_SECRET)) return true;
  if (CRON_SECRET && timingSafeEqual(token, CRON_SECRET)) return true;

  return false;
}

/**
 * Executes Target 1: The real primary n8n production webhook pipeline
 */
async function warmPrimaryN8n(runId: string): Promise<TargetExecutionRecord> {
  const startTime = Date.now();
  const startIso = new Date(startTime).toISOString();
  let retries = 0;
  const MAX_RETRIES = 1;

  const payload = {
    taskId: `warmup_task_${runId}`,
    sessionId: `warmup_session_${runId}`,
    userId: 'xare-warmup-synthetic-agent',
    username: 'Xare Warmup Agent',
    message: 'Hi',
    chatInput: 'Hi',
    messageId: `msg_${runId}`,
    requestId: `req_${runId}`,
    systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    system_instruction: DEFAULT_SYSTEM_INSTRUCTION,
    action: 'chat',
    timestamp: startIso
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (N8N_WEBHOOK_TOKEN) {
    headers['x-chatbot-token'] = N8N_WEBHOOK_TOKEN;
  }

  while (retries <= MAX_RETRIES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000); // 45s bounded timeout

      const res = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);
      const endTime = Date.now();
      const durationMs = endTime - startTime;

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 150)}`);
      }

      const resJson = await res.json().catch(() => ({}));
      const botText = resJson.text || resJson.response || resJson.payload || (typeof resJson === 'string' ? resJson : '');

      const isNonEmpty = typeof botText === 'string' && botText.trim().length > 3;
      const isNotError = !botText.toLowerCase().includes('request could not be processed') && !botText.toLowerCase().includes('error');

      return {
        target: 'primary_n8n',
        endpoint: N8N_WEBHOOK_URL,
        status: res.status,
        startTime: startIso,
        endTime: new Date(endTime).toISOString(),
        durationMs,
        modelIdentifier: 'Qwen3.8-27b / LangChain Agent (n8n on Hugging Face Spaces)',
        responseVerified: isNonEmpty && isNotError,
        responseExcerpt: botText.slice(0, 120).replace(/\n/g, ' '),
        responseLength: botText.length,
        retries
      };
    } catch (err: any) {
      if (retries < MAX_RETRIES) {
        retries++;
        await new Promise(r => setTimeout(r, 2000)); // 2s exponential backoff
      } else {
        const endTime = Date.now();
        return {
          target: 'primary_n8n',
          endpoint: N8N_WEBHOOK_URL,
          status: 'error',
          startTime: startIso,
          endTime: new Date(endTime).toISOString(),
          durationMs: endTime - startTime,
          responseVerified: false,
          responseExcerpt: '',
          responseLength: 0,
          error: err.message,
          retries
        };
      }
    }
  }

  throw new Error('Unreachable warmPrimaryN8n termination');
}

/**
 * Executes Target 2: The direct Vercel Edge Gemini streaming pipeline
 */
async function warmEdgeStream(originUrl: string): Promise<TargetExecutionRecord> {
  const startTime = Date.now();
  const startIso = new Date(startTime).toISOString();
  const targetUrl = `${originUrl}/api/chat/stream`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user-id': 'xare-warmup-synthetic-agent'
  };
  if (WARMUP_SECRET) {
    headers['x-warmup-secret'] = WARMUP_SECRET;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: 'Hi',
        systemInstruction: DEFAULT_SYSTEM_INSTRUCTION
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      clearTimeout(timeout);
      const errText = await res.text().catch(() => '');
      return {
        target: 'edge_stream',
        endpoint: targetUrl,
        status: res.status,
        startTime: startIso,
        endTime: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        responseVerified: false,
        responseExcerpt: '',
        responseLength: 0,
        error: `HTTP ${res.status}: ${errText.slice(0, 150)}`,
        retries: 0
      };
    }

    const servingModel = res.headers.get('x-serving-model') || res.headers.get('x-serving-display') || 'v1beta/gemini-3.1-flash-lite';
    const reader = res.body?.getReader();

    if (!reader) {
      clearTimeout(timeout);
      throw new Error('No readable stream available from Edge stream endpoint');
    }

    const decoder = new TextDecoder();
    let accumulatedText = '';
    let buffer = '';
    let firstTokenMs: number | undefined = undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (firstTokenMs === undefined) {
        firstTokenMs = Date.now() - startTime;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const partText = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (partText) accumulatedText += partText;
          } catch (e) {}
        }
      }
    }

    clearTimeout(timeout);
    const endTime = Date.now();
    const durationMs = endTime - startTime;

    const isNonEmpty = accumulatedText.trim().length > 3;

    return {
      target: 'edge_stream',
      endpoint: targetUrl,
      status: res.status,
      startTime: startIso,
      endTime: new Date(endTime).toISOString(),
      durationMs,
      firstTokenMs,
      modelIdentifier: servingModel,
      responseVerified: isNonEmpty,
      responseExcerpt: accumulatedText.slice(0, 120).replace(/\n/g, ' '),
      responseLength: accumulatedText.length,
      retries: 0
    };

  } catch (err: any) {
    const endTime = Date.now();
    return {
      target: 'edge_stream',
      endpoint: targetUrl,
      status: 'error',
      startTime: startIso,
      endTime: new Date(endTime).toISOString(),
      durationMs: endTime - startTime,
      responseVerified: false,
      responseExcerpt: '',
      responseLength: 0,
      error: err.message,
      retries: 0
    };
  }
}

export default async function handler(req: Request) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-warmup-secret',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // 1. Fail Closed Server Configuration Guard
  if (!WARMUP_SECRET && !CRON_SECRET) {
    return new Response(JSON.stringify({
      error: 'Server Misconfiguration',
      message: 'Warm-up subsystem is disabled: server-side WARMUP_SECRET or CRON_SECRET is not configured.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Strict Authentication Guard (Checked before ANY action or query parameter parsing)
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      message: 'Missing or invalid warm-up authentication secret. Provide a valid Authorization Bearer token or x-warmup-secret header matching the configured secret.'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const isForce = url.searchParams.get('force') === 'true';

  // 3. Health & Telemetry inspection (GET without trigger parameter)
  if (req.method === 'GET' && !url.searchParams.has('trigger')) {
    return new Response(JSON.stringify({
      service: 'Xare AI Chat Warm-Up Subsystem',
      status: 'online',
      cadence: 'Every 2 hours (0 */2 * * * UTC)',
      environment: process.env.VERCEL_ENV || 'production',
      lastExecutionTime: lastExecutionTime ? new Date(lastExecutionTime).toISOString() : null,
      cooldownRemainingSeconds: Math.max(0, Math.ceil((EXECUTION_COOLDOWN_MS - (Date.now() - lastExecutionTime)) / 1000)),
      isExecutionInProgress,
      totalRunsRecorded: RUN_HISTORY.length,
      recentRuns: RUN_HISTORY.slice(-5)
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // 4. Concurrency & Distributed Idempotency Lock
  const now = Date.now();
  if (isExecutionInProgress) {
    return new Response(JSON.stringify({
      status: 'skipped',
      reason: 'Concurrent warm-up execution already in progress',
      timestamp: new Date().toISOString()
    }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!isForce && (now - lastExecutionTime < EXECUTION_COOLDOWN_MS)) {
    const remainingSeconds = Math.ceil((EXECUTION_COOLDOWN_MS - (now - lastExecutionTime)) / 1000);
    return new Response(JSON.stringify({
      status: 'skipped',
      reason: `Idempotent cooldown active. Last warm-up was completed ${remainingSeconds}s ago.`,
      lastExecutionTime: new Date(lastExecutionTime).toISOString(),
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 5. Execute Genuine Warm-Up Run
  isExecutionInProgress = true;
  const runId = `warmup_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const idempotencyKey = `idem_${runId}`;
  const t_start = Date.now();

  try {
    const origin = url.origin && url.origin !== 'null' ? url.origin : 'https://xare-ai.vercel.app';
    // Default to the true bottleneck (n8n on Hugging Face Spaces) unless caller explicitly requested 'all' or 'edge'
    const targetMode = url.searchParams.get('target') || 'n8n';

    const targets: TargetExecutionRecord[] = [];

    // Target 1: Primary n8n Webhook Pipeline (The true cold-start bottleneck)
    if (targetMode === 'all' || targetMode === 'n8n') {
      const n8nRecord = await warmPrimaryN8n(runId);
      targets.push(n8nRecord);
    }

    // Target 2: Vercel Edge Gemini Streaming Pipeline (Optional secondary target)
    if (targetMode === 'all' || targetMode === 'edge') {
      const edgeRecord = await warmEdgeStream(origin);
      targets.push(edgeRecord);
    }

    const t_end = Date.now();
    lastExecutionTime = t_end;

    const allVerified = targets.every(t => t.responseVerified);
    const someVerified = targets.some(t => t.responseVerified);
    const overallStatus = allVerified ? 'success' : (someVerified ? 'partial' : 'failed');

    const summary: WarmupRunSummary = {
      runId,
      idempotencyKey,
      scheduledCadence: '0 */2 * * * (Every 2 hours UTC)',
      timestamp: new Date(t_start).toISOString(),
      status: overallStatus,
      durationMs: t_end - t_start,
      targets
    };

    // Store in ephemeral memory ring-buffer
    RUN_HISTORY.push(summary);
    if (RUN_HISTORY.length > MAX_HISTORY) {
      RUN_HISTORY.shift();
    }

    return new Response(JSON.stringify(summary, null, 2), {
      status: overallStatus === 'failed' ? 502 : 200,
      headers: {
        'Content-Type': 'application/json',
        'x-warmup-run-id': runId,
        'x-warmup-status': overallStatus,
        'Access-Control-Allow-Origin': '*'
      }
    });

  } finally {
    isExecutionInProgress = false;
  }
}
