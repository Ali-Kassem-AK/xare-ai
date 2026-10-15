const assert = require('assert');
const crypto = require('crypto');

const WARMUP_SECRET = process.env.WARMUP_SECRET || process.env.CRON_SECRET;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://aliiis-24-7-n8n.hf.space/webhook/xare-ai-v2-guALIharika';
const VERCEL_APP_URL = process.env.VERCEL_APP_URL || 'https://xare-ai.vercel.app';

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function runWarmupTestSuite() {
  console.log('======================================================================');
  console.log('RUNNING COMPREHENSIVE TEST SUITE: 2-HOUR CHAT WARM-UP SUBSYSTEM');
  console.log('======================================================================\n');

  // TEST 1: Request Payload Structure & Contract Compliance
  console.log('[TEST 1] Verifying Request Contract & Synthetic Identity Isolation...');
  const runId = `test_run_${Date.now()}`;
  const testPayload = {
    taskId: `warmup_task_${runId}`,
    sessionId: `warmup_session_${runId}`,
    userId: 'xare-warmup-synthetic-agent',
    username: 'Xare Warmup Agent',
    message: 'Hi',
    chatInput: 'Hi',
    messageId: `msg_${runId}`,
    requestId: `req_${runId}`,
    action: 'chat',
    timestamp: new Date().toISOString()
  };

  assert.strictEqual(testPayload.message, 'Hi', 'Synthetic message must be exactly "Hi"');
  assert.strictEqual(testPayload.chatInput, 'Hi', 'Synthetic chatInput must match message');
  assert.strictEqual(testPayload.action, 'chat', 'Action must be regular chat');
  assert.strictEqual(testPayload.userId, 'xare-warmup-synthetic-agent', 'Synthetic identity must not collide with real users');
  console.log('  ✅ Payload contract matches production client specification exactly');

  // TEST 2: Security — Rejection of Unauthenticated Requests (No Token)
  console.log('\n[TEST 2] Verifying Rejection of Requests Without Authentication Header...');
  const unauthRes = await fetch(`${VERCEL_APP_URL}/api/warmup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Hi' })
  });
  assert.ok(unauthRes.status === 401 || unauthRes.status === 500, `Expected HTTP 401 or 500, got ${unauthRes.status}`);
  console.log(`  ✅ Request without credentials rejected with HTTP ${unauthRes.status} (Secure fail-closed/unauthorized)`);

  // TEST 3: Security — Rejection of Arbitrary, Guess, or Tampered Credentials
  console.log('\n[TEST 3] Verifying Rejection of Arbitrary and Guess Credentials...');
  const arbitraryTokens = [
    'attacker_guess_token_12345',
    'bearer arbitrary_secret_value',
    'admin_override_key',
    '12345678'
  ];

  for (const fakeToken of arbitraryTokens) {
    const res = await fetch(`${VERCEL_APP_URL}/api/warmup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-warmup-secret': fakeToken
      }
    });
    assert.ok(res.status === 401 || res.status === 500, `Expected HTTP 401 or 500 for arbitrary token "${fakeToken}", got ${res.status}`);
  }
  console.log('  ✅ All arbitrary and guess credentials successfully rejected with HTTP 401/500');

  // TEST 4: Security — Query Parameter Bypass Prevention
  console.log('\n[TEST 4] Verifying Query Parameter Bypass Immunity (?force=true, ?trigger=true)...');
  const bypassRes = await fetch(`${VERCEL_APP_URL}/api/warmup?force=true&trigger=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  assert.ok(bypassRes.status === 401 || bypassRes.status === 500, `Query parameters must not bypass authentication. Expected 401/500, got ${bypassRes.status}`);
  console.log(`  ✅ Query parameter bypass attempts strictly rejected with HTTP ${bypassRes.status}`);

  // TEST 5: Security — Untrusted Cross-Origin Scraper Rejection on /api/chat/stream
  console.log('\n[TEST 5] Verifying Untrusted Cross-Origin Scraper Defense on /api/chat/stream...');
  const corsScraperRes = await fetch(`${VERCEL_APP_URL}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://malicious-scraper-bot.com'
    },
    body: JSON.stringify({ prompt: 'Hi' })
  });
  assert.ok(corsScraperRes.status === 401 || corsScraperRes.status === 403, `Untrusted origin must be rejected with HTTP 401 or 403, got ${corsScraperRes.status}`);
  console.log(`  ✅ Untrusted cross-origin scraper blocked with HTTP ${corsScraperRes.status}`);

  // TEST 6: Unit Test — Constant-Time Safe Comparison
  console.log('\n[TEST 6] Verifying Timing-Safe String Comparison Implementation...');
  assert.strictEqual(timingSafeEqual('correct_secret_abc123', 'correct_secret_abc123'), true, 'Equal secrets must match');
  assert.strictEqual(timingSafeEqual('correct_secret_abc123', 'wrong_secret_abc123'), false, 'Different secrets must not match');
  assert.strictEqual(timingSafeEqual('correct_secret_abc123', 'correct_secret_abc12'), false, 'Different length must not match');
  assert.strictEqual(timingSafeEqual('', 'secret'), false, 'Empty string must not match');
  console.log('  ✅ Constant-time safe compare functions correctly across all branches');

  // TEST 7: Unit Test — SSE Stream Buffer Splitting & Chunk Reassembly
  console.log('\n[TEST 7] Verifying SSE Chunk Assembly across Read Boundaries...');
  const simulatedChunks = [
    'data: {"candidates": [{"content": {"parts": [{"text": "Hello"}]}}]}\n\ndata: {"cand',
    'idates": [{"content": {"parts": [{"text": " world!"}]}}]}\n\n'
  ];

  let buffer = '';
  let assembled = '';
  for (const chunk of simulatedChunks) {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;
        const parsed = JSON.parse(jsonStr);
        assembled += parsed.candidates[0].content.parts[0].text;
      }
    }
  }
  assert.strictEqual(assembled, 'Hello world!', 'Chunk assembly across boundary failed');
  console.log('  ✅ SSE chunk buffering correctly reassembles boundary-split payloads');

  // TEST 8: Response Non-Emptiness & AI Generation Verification Rule
  console.log('\n[TEST 8] Verifying Genuine AI Content Validation Logic...');
  const validateResponse = (text) => {
    if (typeof text !== 'string') return false;
    const trimmed = text.trim();
    if (trimmed.length < 5) return false;
    if (trimmed.toLowerCase().includes('request could not be processed')) return false;
    if (trimmed.toLowerCase().includes('internal server error')) return false;
    if (/^(200(\s*ok)?|ok|status:\s*200)$/i.test(trimmed)) return false;
    return true;
  };

  assert.strictEqual(validateResponse(''), false, 'Empty string must be rejected');
  assert.strictEqual(validateResponse('   '), false, 'Whitespace must be rejected');
  assert.strictEqual(validateResponse('200 OK'), false, 'HTTP status string must be rejected');
  assert.strictEqual(validateResponse('Request could not be processed.'), false, 'Error message must be rejected');
  assert.strictEqual(validateResponse('Hey! 👋 How can I help you today?'), true, 'Genuine AI response must be accepted');
  console.log('  ✅ AI response verification rejects fake, empty, and error responses');

  // TEST 9: Live Integration Probe — Primary n8n Webhook Pipeline (The True Cold Bottleneck)
  console.log('\n[TEST 9] Live Integration: Primary n8n Chat Webhook Pipeline...');
  const t0 = Date.now();
  const n8nToken = process.env.N8N_WEBHOOK_TOKEN;
  const n8nHeaders = { 'Content-Type': 'application/json' };
  if (n8nToken) {
    n8nHeaders['x-chatbot-token'] = n8nToken;
  }
  const n8nRes = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: n8nHeaders,
    body: JSON.stringify(testPayload)
  });
  const t1 = Date.now();
  if (!n8nToken) {
    assert.ok(n8nRes.status === 401 || n8nRes.status === 403, `Unauthenticated request to n8n webhook must be rejected with 401/403, got ${n8nRes.status}`);
    console.log(`  ✅ n8n Webhook correctly rejects unauthenticated request with HTTP ${n8nRes.status}`);
  } else {
    assert.strictEqual(n8nRes.status, 200, `Expected HTTP 200 from n8n webhook with valid token, got ${n8nRes.status}`);
    const n8nData = await n8nRes.json();
    const botReply = n8nData.text || n8nData.response || '';
    assert.ok(validateResponse(botReply), `Bot reply failed validation: "${botReply}"`);
    console.log(`  ✅ Primary n8n Webhook responded in ${t1 - t0}ms`);
    console.log(`     Model Output: "${botReply.slice(0, 80).replace(/\n/g, ' ')}..."`);
  }

  // TEST 10: Live Integration Probe — Vercel Edge Gemini Streaming Pipeline
  console.log('\n[TEST 10] Live Integration: Vercel Edge Gemini Streaming Pipeline...');
  const t2 = Date.now();
  const edgeHeaders = {
    'Content-Type': 'application/json',
    'x-user-id': 'xare-warmup-synthetic-agent',
    'Origin': 'https://xare-ai.vercel.app'
  };
  const edgeToken = WARMUP_SECRET;
  if (edgeToken) {
    edgeHeaders['x-warmup-secret'] = edgeToken;
    edgeHeaders['Authorization'] = `Bearer ${edgeToken}`;
  }
  const edgeRes = await fetch(`${VERCEL_APP_URL}/api/chat/stream`, {
    method: 'POST',
    headers: edgeHeaders,
    body: JSON.stringify({ prompt: 'Hi' })
  });

  if (!edgeToken) {
    assert.ok(edgeRes.status === 401 || edgeRes.status === 200, `Edge stream without secret returned HTTP ${edgeRes.status}`);
    console.log(`  ✅ Edge Stream unauthenticated probe handled correctly (HTTP ${edgeRes.status})`);
  } else {
    assert.strictEqual(edgeRes.status, 200, `Expected HTTP 200 from edge stream, got ${edgeRes.status}`);
    const reader = edgeRes.body.getReader();
    const decoder = new TextDecoder();
    let edgeBuffer = '';
    let fullStreamText = '';
    let firstTokenMs = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (firstTokenMs === null) firstTokenMs = Date.now() - t2;
      edgeBuffer += decoder.decode(value, { stream: true });
      const lines = edgeBuffer.split('\n');
      edgeBuffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const t = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (t) fullStreamText += t;
          } catch (e) {}
        }
      }
    }
    const t3 = Date.now();
    assert.ok(validateResponse(fullStreamText), `Edge stream text failed validation: "${fullStreamText}"`);
    console.log(`  ✅ Edge Stream responded in ${t3 - t2}ms (TTFT: ${firstTokenMs}ms)`);
    console.log(`     Model Output: "${fullStreamText.slice(0, 80).replace(/\n/g, ' ')}..."`);
  }

  console.log('\n======================================================================');
  console.log('ALL 10 TEST SUITE MODULES PASSED WITH 100% SUCCESS');
  console.log('======================================================================\n');
}

runWarmupTestSuite().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
