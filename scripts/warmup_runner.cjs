#!/usr/bin/env node
/**
 * Xare AI — Automated 1-Hour Chat Warm-Up Subsystem CLI & CI/CD Runner
 * 
 * Dispatches automated synthetic messages ("Hi") every hour (35 * * * * UTC)
 * through the live Xare website chat interface via browser automation,
 * with support for direct upstream inference validation.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const N8N_WEBHOOK_TOKEN = process.env.N8N_WEBHOOK_TOKEN;
const WARMUP_SECRET = process.env.WARMUP_SECRET || process.env.CRON_SECRET;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://aliiis-24-7-n8n.hf.space/webhook/xare-ai-v2-guALIharika';
const VERCEL_APP_URL = process.env.VERCEL_APP_URL || 'https://xare-ai.vercel.app';
const WARMUP_PROMPT_MESSAGE = 'its a test to check that you are alive, so only reply with "1"';

const DEFAULT_SYSTEM_INSTRUCTION = `Role: You are Xare, a chill, smart, and highly capable multimodal AI assistant engineered exclusively by Ali Kassem (in Arabic: علي قاسم - NEVER EVER write "علي كاسم").

[CORE CONVERSATION & MEMORY RULES]
- Language Matching: Always detect and match the user's latest language.
- Multi-Turn Context & File Memory: When the user asks follow-up questions about an image, PDF, code, or previous answer, ALWAYS refer to the existing conversation history.
- NEVER ask the user to re-upload files or claim you cannot see the image/document if the analysis is already present in the chat history. Use the prior output directly to answer.`;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    target: 'browser', // Default to real browser UI automation as required
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
 * Launch Chromium resiliently across Linux (CI) and Windows/macOS local environments
 */
async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (err) {
    if (process.platform === 'win32') {
      try {
        return await chromium.launch({ channel: 'chrome', headless: true });
      } catch (e) {
        return await chromium.launch({ channel: 'msedge', headless: true });
      }
    }
    throw err;
  }
}

/**
 * Executes Target 0: Real User-Facing Xare Website Chat Interface (Browser Automation)
 */
async function executeBrowserUI(runId) {
  const t0 = Date.now();
  const startIso = new Date(t0).toISOString();
  let browser = null;

  const docsDir = path.join(__dirname, '..', 'docs', 'warmup');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }
  const beforeSendPath = path.join(docsDir, 'before_send.png');
  const afterResponsePath = path.join(docsDir, 'after_response.png');

  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    console.log(`     Navigating to ${VERCEL_APP_URL}...`);
    await page.goto(VERCEL_APP_URL, { waitUntil: 'networkidle', timeout: 35000 });

    // Handle guest authentication modal if present
    const guestBtn = page.locator('button:has-text("Continue as Guest")');
    if (await guestBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('     Entering as guest session...');
      await guestBtn.click();
      await page.waitForTimeout(1000);
    }

    // Locate the user chat textarea
    const textarea = page.locator('textarea');
    await textarea.waitFor({ state: 'visible', timeout: 15000 });

    // Type the synthetic message
    console.log(`     Typing "${WARMUP_PROMPT_MESSAGE}" into user chat input...`);
    await textarea.fill(WARMUP_PROMPT_MESSAGE);
    await page.waitForTimeout(500);

    // Capture pre-submission screenshot
    await page.screenshot({ path: beforeSendPath });
    console.log(`     Saved pre-submission screenshot: ${beforeSendPath}`);

    // Submit message via Enter key
    console.log('     Submitting message via Enter key...');
    await textarea.press('Enter');

    // Wait for the response to appear and complete
    console.log('     Waiting for AI response in chat interface...');
    let botText = '';
    let responseFound = false;

    for (let i = 0; i < 45; i++) {
      await page.waitForTimeout(1000);

      // Check for Xare's assistant message card (.chat-message-card.justify-start)
      const botCards = await page.locator('.chat-message-card.justify-start').allTextContents().catch(() => []);
      const isSending = (await page.locator('text=Sending').count().catch(() => 0)) > 0;
      const isReading = (await page.locator('text=Reading Prompt').count().catch(() => 0)) > 0;
      const isThinking = (await page.locator('text=Understanding Context').count().catch(() => 0)) > 0;

      if (botCards.length > 0 && !isSending && !isReading && !isThinking) {
        // Strip UI action buttons (e.g. "Copy", "Regenerate") from excerpt
        const candidate = botCards[0].replace(/Copy/g, '').replace(/Regenerate/g, '').trim();
        if (candidate.length >= 1) {
          botText = candidate;
          responseFound = true;
          break;
        }
      }

      // Secondary selector check (.prose, .chat-content-text)
      const contentTexts = await page.locator('.chat-content-text').allTextContents().catch(() => []);
      if (contentTexts.length > 1 && !isSending && !isReading && !isThinking) {
        const candidate = contentTexts[contentTexts.length - 1].trim();
        if (candidate.length >= 1) {
          botText = candidate;
          responseFound = true;
          break;
        }
      }
    }

    const t1 = Date.now();
    const durationMs = t1 - t0;

    // Capture post-response screenshot
    await page.screenshot({ path: afterResponsePath });
    console.log(`     Saved post-response screenshot: ${afterResponsePath}`);

    await browser.close();
    browser = null;

    const isNonEmpty = responseFound && botText.trim().length >= 1;
    const isNotError = !botText.toLowerCase().includes('request could not be processed') && !botText.toLowerCase().includes('error');
    const hash = crypto.createHash('sha256').update(botText).digest('hex').substring(0, 16);

    return {
      target: 'browser_ui',
      endpoint: VERCEL_APP_URL,
      status: responseFound ? 200 : 'no_response',
      startTime: startIso,
      endTime: new Date(t1).toISOString(),
      durationMs,
      modelIdentifier: 'Xare Web UI (Live Chat Interface)',
      responseVerified: isNonEmpty && isNotError,
      responseExcerpt: botText.slice(0, 120).replace(/\n/g, ' '),
      responseLength: botText.length,
      responseHash: hash,
      retries: 0,
      evidenceScreenshots: [
        'docs/warmup/before_send.png',
        'docs/warmup/after_response.png'
      ]
    };
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    const t1 = Date.now();
    return {
      target: 'browser_ui',
      endpoint: VERCEL_APP_URL,
      status: 'error',
      startTime: startIso,
      endTime: new Date(t1).toISOString(),
      durationMs: t1 - t0,
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
    message: WARMUP_PROMPT_MESSAGE,
    chatInput: WARMUP_PROMPT_MESSAGE,
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
          'x-chatbot-token': N8N_WEBHOOK_TOKEN
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
        prompt: WARMUP_PROMPT_MESSAGE,
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

  // Strict Fail-Closed Credentials Validation for upstream targets
  if (opts.endpoint) {
    if (!WARMUP_SECRET) {
      console.error('\n❌ FATAL CONFIGURATION ERROR: Missing required WARMUP_SECRET environment variable for warm-up endpoint.\n');
      process.exit(1);
    }
  } else {
    if ((opts.target === 'n8n' || opts.target === 'all') && !N8N_WEBHOOK_TOKEN) {
      console.warn('\n⚠️ WARNING: N8N_WEBHOOK_TOKEN not set; direct n8n calls will fail closed.');
    }
    if ((opts.target === 'edge' || opts.target === 'all') && !WARMUP_SECRET) {
      console.warn('\n⚠️ WARNING: WARMUP_SECRET not set; direct edge stream calls will fail closed.');
    }
  }

  console.log('======================================================================');
  console.log('   XARE AI — AUTOMATIC 1-HOUR CHAT WARM-UP SUB-SYSTEM');
  console.log('   Target Cadence: Every 1 Hour (35 * * * * UTC)');
  console.log('======================================================================\n');
  console.log(`Execution Mode: ${opts.endpoint ? 'Vercel Serverless Endpoint' : 'Automated Synthetic Run'}`);
  console.log(`Target: ${opts.target} | Iterations: ${opts.repeat}\n`);

  const allRuns = [];

  for (let i = 0; i < opts.repeat; i++) {
    const runId = `warmup_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const idempotencyKey = `idem_${runId}`;
    console.log(`[TRIAL ${i + 1}/${opts.repeat}] Starting 1-Hour Warm-Up Run ID: ${runId}`);

    const targets = [];

    // Target 0: Real Browser UI
    if (opts.target === 'all' || opts.target === 'browser' || opts.target === 'browser_ui') {
      console.log(`  -> Dispatching synthetic message through real Xare Website UI (${VERCEL_APP_URL})...`);
      const browserResult = await executeBrowserUI(runId);
      targets.push(browserResult);
      console.log(`     Status: ${browserResult.status} | Duration: ${browserResult.durationMs}ms | Verified: ${browserResult.responseVerified ? 'YES (Genuine AI Content in UI)' : 'NO'}`);
      if (browserResult.responseExcerpt) {
        console.log(`     Response: "${browserResult.responseExcerpt}..."`);
      }
      if (browserResult.error) {
        console.log(`     Error: ${browserResult.error}`);
      }
    }

    // Target 1: n8n Direct Webhook
    if (opts.target === 'all' || opts.target === 'n8n') {
      console.log(`  -> Dispatching synthetic message to Primary n8n Webhook (${N8N_WEBHOOK_URL})...`);
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

    // Target 2: Edge Streaming Direct
    if (opts.target === 'all' || opts.target === 'edge') {
      console.log(`  -> Dispatching synthetic message to Vercel Edge Stream (${VERCEL_APP_URL}/api/chat/stream)...`);
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
      scheduledCadence: '35 * * * * (Every 1 hour UTC)',
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
      console.log(`  • [${t.target.toUpperCase()}] status=${t.status} duration=${t.durationMs}ms verified=${t.responseVerified} model=${t.modelIdentifier || 'unknown'}`);
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
    console.log('🎉 ALL 1-HOUR CHAT WARM-UP TARGETS VERIFIED SUCCESSFULLY.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal warm-up runner error:', err);
  process.exit(1);
});
