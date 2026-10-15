#!/usr/bin/env node
/**
 * Xare AI — Automated Chat Warm-Up Subsystem CLI & CI/CD Runner
 * 
 * Executes verified synthetic user turns containing exactly "Hi" across
 * production inference pipelines to eliminate cold-start latency.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WARMUP_SECRET = process.env.WARMUP_SECRET || process.env.CRON_SECRET;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://aliiis-24-7-n8n.hf.space/webhook/xare-ai-v2-guALIharika';
const VERCEL_APP_URL = process.env.VERCEL_APP_URL || 'https://xare-ai.vercel.app';

if (!WARMUP_SECRET) {
  console.error('\n❌ FATAL CONFIGURATION ERROR: Missing required WARMUP_SECRET or CRON_SECRET environment variable.');
  console.error('To run the warm-up runner, provide a valid secret:');
  console.error('  WARMUP_SECRET="<secret>" node scripts/warmup_runner.cjs\n');
  process.exit(1);
}

const DEFAULT_SYSTEM_INSTRUCTION = `Role: You are Xare, a chill, smart, and highly capable multimodal AI assistant engineered exclusively by Ali Kassem (in Arabic: علي قاسم - NEVER EVER write "علي كاسم").

[CORE CONVERSATION & MEMORY RULES]
- Language Matching: Always detect and match the user's latest language.
- Multi-Turn Context & File Memory: When the user asks follow-up questions about an image, PDF, code, or previous answer, ALWAYS refer to the existing conversation history.
- NEVER ask the user to re-upload files or claim you cannot see the image/document if the analysis is already present in the chat history. Use the prior output directly to answer.`;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    target: 'n8n', // Default to the true bottleneck (n8n on Hugging Face Spaces)
    repeat: 1,
    report: false,
    direct: false,
    endpoint: false,
    live: true
  };

  for (const arg of args) {
    if (arg.startsWith('--target=')) opts.target = arg.split('=')[1];
    else if (arg.startsWith('--repeat=')) opts.repeat = parseInt(arg.split('=')[1], 10) || 1;
    else if (arg === '--report') opts.report = true;
    else if (arg === '--direct') opts.direct = true;
    else if (arg === '--endpoint') opts.endpoint = true;
    else if (arg === '--live') opts.live = true;
  }
  return opts;
}

/**
 * Executes Target 1 directly: Primary n8n Chat Webhook
 */
async function executePrimaryN8nDirect(runId) {
  const t0 = Date.now();
  const startIso = new Date(t0).toISOString();
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

  while (retries <= MAX_RETRIES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);

      const res = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chatbot-token': WARMUP_SECRET
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);
      const t1 = Date.now();
      const durationMs = t1 - t0;

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 150)}`);
      }

      const resJson = await res.json().catch(() => ({}));
      const botText = resJson.text || resJson.response || resJson.payload || (typeof resJson === 'string' ? resJson : '');

      const isNonEmpty = typeof botText === 'string' && botText.trim().length > 3;
      const isNotError = !botText.toLowerCase().includes('request could not be processed') && !botText.toLowerCase().includes('error');
      const hash = crypto.createHash('sha256').update(botText).digest('hex').substring(0, 16);

      return {
        target: 'primary_n8n',
        endpoint: N8N_WEBHOOK_URL,
        status: res.status,
        startTime: startIso,
        endTime: new Date(t1).toISOString(),
        durationMs,
        modelIdentifier: 'Qwen3.8-27b / LangChain Agent (n8n on Hugging Face Spaces)',
        responseVerified: isNonEmpty && isNotError,
        responseExcerpt: botText.slice(0, 120).replace(/\n/g, ' '),
        responseLength: botText.length,
        responseHash: hash,
        retries
      };
    } catch (err) {
      if (retries < MAX_RETRIES) {
        retries++;
        await new Promise(r => setTimeout(r, 2000));
      } else {
        const t1 = Date.now();
        return {
          target: 'primary_n8n',
          endpoint: N8N_WEBHOOK_URL,
          status: 'error',
          startTime: startIso,
          endTime: new Date(t1).toISOString(),
          durationMs: t1 - t0,
          responseVerified: false,
          responseExcerpt: '',
          responseLength: 0,
          responseHash: null,
          error: err.message,
          retries
        };
      }
    }
  }
}

/**
 * Executes Target 2 directly: Vercel Edge Gemini Streaming Pipeline
 */
async function executeEdgeStreamDirect() {
  const t0 = Date.now();
  const startIso = new Date(t0).toISOString();
  const endpoint = `${VERCEL_APP_URL}/api/chat/stream`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-warmup-secret': WARMUP_SECRET,
        'Authorization': `Bearer ${WARMUP_SECRET}`,
        'x-user-id': 'xare-warmup-synthetic-agent'
      },
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
        endpoint,
        status: res.status,
        startTime: startIso,
        endTime: new Date().toISOString(),
        durationMs: Date.now() - t0,
        responseVerified: false,
        responseExcerpt: '',
        responseLength: 0,
        responseHash: null,
        error: `HTTP ${res.status}: ${errText.slice(0, 150)}`,
        retries: 0
      };
    }

    const servingModel = res.headers.get('x-serving-model') || res.headers.get('x-serving-display') || 'gemini-3.1-flash-lite';
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No readable body stream returned');

    const decoder = new TextDecoder();
    let accumulatedText = '';
    let buffer = '';
    let firstTokenMs = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (firstTokenMs === null) {
        firstTokenMs = Date.now() - t0;
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
    const t1 = Date.now();
    const isNonEmpty = accumulatedText.trim().length > 3;
    const hash = crypto.createHash('sha256').update(accumulatedText).digest('hex').substring(0, 16);

    return {
      target: 'edge_stream',
      endpoint,
      status: res.status,
      startTime: startIso,
      endTime: new Date(t1).toISOString(),
      durationMs: t1 - t0,
      firstTokenMs,
      modelIdentifier: servingModel,
      responseVerified: isNonEmpty,
      responseExcerpt: accumulatedText.slice(0, 120).replace(/\n/g, ' '),
      responseLength: accumulatedText.length,
      responseHash: hash,
      retries: 0
    };
  } catch (err) {
    return {
      target: 'edge_stream',
      endpoint,
      status: 'error',
      startTime: startIso,
      endTime: new Date().toISOString(),
      durationMs: Date.now() - t0,
      responseVerified: false,
      responseExcerpt: '',
      responseLength: 0,
      responseHash: null,
      error: err.message,
      retries: 0
    };
  }
}

/**
 * Calls the deployed /api/warmup endpoint
 */
async function executeWarmupEndpoint() {
  const t0 = Date.now();
  const endpoint = `${VERCEL_APP_URL}/api/warmup?force=true`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-warmup-secret': WARMUP_SECRET
    }
  });

  const durationMs = Date.now() - t0;
  const json = await res.json().catch(() => ({}));

  return {
    endpointCallStatus: res.status,
    endpointDurationMs: durationMs,
    payload: json
  };
}

async function main() {
  const opts = parseArgs();
  console.log('======================================================================');
  console.log('   XARE AI — AUTOMATIC 2-HOUR CHAT WARM-UP SUB-SYSTEM');
  console.log('   Target Cadence: Every 2 Hours (0 */2 * * * UTC)');
  console.log('======================================================================\n');
  console.log(`Execution Mode: ${opts.endpoint ? 'Vercel Serverless Endpoint' : 'Direct Upstream Inference'}`);
  console.log(`Target Filter: ${opts.target} | Iterations: ${opts.repeat}\n`);

  const allRuns = [];

  for (let i = 0; i < opts.repeat; i++) {
    const runId = `warmup_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const idempotencyKey = `idem_${runId}`;
    console.log(`[TRIAL ${i + 1}/${opts.repeat}] Starting Warm-Up Run ID: ${runId}`);

    const targets = [];

    if (opts.target === 'all' || opts.target === 'n8n') {
      console.log(`  -> Dispatching genuine 'Hi' to Primary n8n Webhook (${N8N_WEBHOOK_URL})...`);
      const n8nResult = await executePrimaryN8nDirect(runId);
      targets.push(n8nResult);
      console.log(`     Status: ${n8nResult.status} | Duration: ${n8nResult.durationMs}ms | Verified: ${n8nResult.responseVerified ? 'YES (Genuine AI Content)' : 'NO'}`);
      if (n8nResult.responseExcerpt) {
        console.log(`     Response: "${n8nResult.responseExcerpt}..."`);
      }
      if (n8nResult.error) {
        console.log(`     Error: ${n8nResult.error}`);
      }
    }

    if (opts.target === 'all' || opts.target === 'edge') {
      console.log(`  -> Dispatching genuine 'Hi' to Vercel Edge Stream (${VERCEL_APP_URL}/api/chat/stream)...`);
      const edgeResult = await executeEdgeStreamDirect();
      targets.push(edgeResult);
      console.log(`     Status: ${edgeResult.status} | TTFT: ${edgeResult.firstTokenMs}ms | Total: ${edgeResult.durationMs}ms | Verified: ${edgeResult.responseVerified ? 'YES (Genuine AI Content)' : 'NO'}`);
      if (edgeResult.responseExcerpt) {
        console.log(`     Response: "${edgeResult.responseExcerpt}..."`);
      }
      if (edgeResult.error) {
        console.log(`     Error: ${edgeResult.error}`);
      }
    }

    const allVerified = targets.every(t => t.responseVerified);
    const summary = {
      runId,
      idempotencyKey,
      scheduledCadence: '0 */2 * * * (Every 2 hours UTC)',
      timestamp: new Date().toISOString(),
      status: allVerified ? 'success' : 'partial_or_failed',
      targets
    };

    allRuns.push(summary);

    if (i < opts.repeat - 1) {
      console.log('  Waiting 3s before next iteration...');
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // Summary Table
  console.log('\n======================================================================');
  console.log('   WARM-UP EXECUTION AUDIT SUMMARY');
  console.log('======================================================================');
  for (const run of allRuns) {
    console.log(`\nRun: ${run.runId} | Status: ${run.status} | Timestamp: ${run.timestamp}`);
    for (const t of run.targets) {
      console.log(`  • [${t.target.toUpperCase()}] status=${t.status} duration=${t.durationMs}ms ttft=${t.firstTokenMs || 'N/A'}ms verified=${t.responseVerified} model=${t.modelIdentifier || 'unknown'}`);
    }
  }
  console.log('\n======================================================================\n');

  // If --report requested, write evidence to docs/warmup/evidence.json
  if (opts.report) {
    const docsDir = path.join(__dirname, '..', 'docs', 'warmup');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }
    const evidencePath = path.join(docsDir, 'evidence.json');
    let existingEvidence = [];
    if (fs.existsSync(evidencePath)) {
      try {
        existingEvidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
      } catch (e) {}
    }
    const updated = [...existingEvidence, ...allRuns].slice(-50);
    fs.writeFileSync(evidencePath, JSON.stringify(updated, null, 2), 'utf8');
    console.log(`✅ Durable evidence saved to: ${evidencePath}`);
  }

  const hasFailures = allRuns.some(r => r.targets.some(t => !t.responseVerified));
  if (hasFailures) {
    console.warn('⚠️ Some targets failed verification.');
    process.exit(1);
  } else {
    console.log('🎉 ALL WARM-UP PIPELINE TARGETS VERIFIED SUCCESSFULLY.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal warm-up runner error:', err);
  process.exit(1);
});
