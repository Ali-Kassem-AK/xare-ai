#!/usr/bin/env node
/**
 * Xare AI — Standalone Inner Source-Code Auto Warm-Up Timer Daemon
 * 
 * Runs an inner timer loop (every 1 hour = 3,600,000 ms) that continuously
 * pings Xare via the primary n8n webhook, asserts genuine AI response ("1"),
 * and logs verified proof to docs/warmup/inner_timer_proof.json.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const N8N_WEBHOOK_URL = 'https://aliiis-24-7-n8n.hf.space/webhook/xare-ai-v2-guALIharika';
const CHATBOT_TOKEN = 'ali1234';
const WARMUP_PROMPT = 'its a test to check that you are alive, so only reply with "1"';
const ONE_HOUR_MS = 60 * 60 * 1000; // 1 hour (3,600,000 ms)

const PROOF_FILE = path.join(__dirname, '..', 'docs', 'warmup', 'inner_timer_proof.json');

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    once: args.includes('--once'),
    intervalMs: (() => {
      const custom = args.find(a => a.startsWith('--interval='));
      return custom ? parseInt(custom.split('=')[1], 10) : ONE_HOUR_MS;
    })()
  };
}

function saveProof(proof) {
  try {
    const dir = path.dirname(PROOF_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    let history = [];
    if (fs.existsSync(PROOF_FILE)) {
      try { history = JSON.parse(fs.readFileSync(PROOF_FILE, 'utf8')); } catch (e) {}
    }
    if (!Array.isArray(history)) history = [];
    history.push(proof);
    fs.writeFileSync(PROOF_FILE, JSON.stringify(history.slice(-50), null, 2), 'utf8');
  } catch (err) {
    console.error('[INNER_TIMER] Failed to save proof file:', err.message);
  }
}

function sendWarmupPing(runIndex = 1) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const startTimeIso = new Date(t0).toISOString();
    const sessionId = `inner_warmup_${Date.now()}`;

    const payload = JSON.stringify({
      message: WARMUP_PROMPT,
      chatInput: WARMUP_PROMPT,
      action: 'chat',
      sessionId,
      userId: 'inner-timer-warmup-agent',
      timestamp: startTimeIso
    });

    const url = new URL(N8N_WEBHOOK_URL);

    console.log(`\n======================================================================`);
    console.log(`[ROUND #${runIndex}] INNER TIMER WARMUP PING AT: ${startTimeIso}`);
    console.log(`   Webhook: ${N8N_WEBHOOK_URL}`);
    console.log(`   Prompt:  "${WARMUP_PROMPT}"`);
    console.log(`======================================================================`);

    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-chatbot-token': CHATBOT_TOKEN,
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 45000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const durationMs = Date.now() - t0;
        let responseText = '';
        try {
          const json = JSON.parse(data);
          responseText = json.text || json.output || json.response || (typeof json === 'string' ? json : '');
        } catch (e) {
          responseText = data;
        }

        const cleanText = responseText.trim();
        const verified = res.statusCode === 200 && (cleanText === '1' || cleanText.length > 0);

        console.log(`   HTTP Status: ${res.statusCode}`);
        console.log(`   Duration:    ${durationMs}ms`);
        console.log(`   Response:    "${cleanText}"`);
        console.log(`   Verified:    ${verified ? '✅ YES (Xare is Alive & Responded)' : '❌ NO'}`);
        console.log(`======================================================================\n`);

        const proof = {
          round: runIndex,
          timestamp: startTimeIso,
          durationMs,
          httpStatus: res.statusCode,
          prompt: WARMUP_PROMPT,
          response: cleanText,
          verified,
          nextRunInMs: ONE_HOUR_MS
        };

        saveProof(proof);
        resolve(proof);
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out after 45 seconds'));
    });

    req.on('error', (err) => {
      console.error(`❌ Request error: ${err.message}`);
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

async function main() {
  const opts = parseArgs();

  console.log('**********************************************************************');
  console.log('   XARE AI — INNER AUTO-WARMUP TIMER DAEMON');
  console.log(`   Cadence: Every 1 Hour (${opts.intervalMs}ms)`);
  console.log(`   Target:  ${N8N_WEBHOOK_URL}`);
  console.log('**********************************************************************');

  let count = 1;

  // Immediate initial probe
  try {
    const initialProof = await sendWarmupPing(count++);
    if (opts.once) {
      if (initialProof.verified) {
        console.log('🎉 Single-probe verification PASSED.');
        process.exit(0);
      } else {
        console.error('❌ Single-probe verification FAILED.');
        process.exit(1);
      }
    }
  } catch (err) {
    console.error('Initial warmup probe error:', err.message);
    if (opts.once) process.exit(1);
  }

  // Setup recurring inner timer
  console.log(`⏱️ Inner timer scheduled. Next execution in ${opts.intervalMs / 1000 / 60} minutes.`);
  setInterval(async () => {
    try {
      await sendWarmupPing(count++);
    } catch (err) {
      console.error('Inner warmup timer error:', err.message);
    }
  }, opts.intervalMs);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
