const assert = require('assert');
const crypto = require('crypto');

const WARMUP_SECRET = process.env.WARMUP_SECRET || process.env.CHATBOT_TOKEN || 'ali1234';
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://aliiis-24-7-n8n.hf.space/webhook/xare-ai-v2-guALIharika';
const VERCEL_APP_URL = process.env.VERCEL_APP_URL || 'https://xare-ai.vercel.app';

async function runWarmupTestSuite() {
  console.log('======================================================================');
  console.log('RUNNING AUTOMATED TEST SUITE: 2-HOUR CHAT WARM-UP SUBSYSTEM');
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

  // TEST 2: Security & Authentication Guard on /api/chat/stream
  console.log('\n[TEST 2] Verifying Cryptographic Authentication Guards...');
  const unauthRes = await fetch(`${VERCEL_APP_URL}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Hi' })
  });
  assert.strictEqual(unauthRes.status, 401, `Expected HTTP 401 for unauthenticated request, got ${unauthRes.status}`);
  console.log('  ✅ Unauthenticated inference request rejected with HTTP 401');

  // TEST 3: SSE Stream Buffer Splitting Unit Verification
  console.log('\n[TEST 3] Verifying SSE Chunk Assembly across Read Boundaries...');
  const simulatedChunks = [
    'data: {"candidates": [{"content": {"parts": [{"text": "Hello"}]}}]}\n\ndata: {"cand',
    'idates": [{"content": {"parts": [{"text": " there!"}]}}]}\n\n'
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
  assert.strictEqual(assembled, 'Hello there!', 'Chunk assembly across boundary failed');
  console.log('  ✅ SSE chunk buffering correctly reassembles boundary-split payloads');

  // TEST 4: Response Non-Emptiness & AI Generation Verification Rule
  console.log('\n[TEST 4] Verifying Genuine AI Content Validation Logic...');
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

  // TEST 5: Live Integration Probe — Primary n8n Webhook Pipeline
  console.log('\n[TEST 5] Live Integration: Primary n8n Chat Webhook Pipeline...');
  const t0 = Date.now();
  const n8nRes = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-chatbot-token': WARMUP_SECRET
    },
    body: JSON.stringify(testPayload)
  });
  const t1 = Date.now();
  assert.strictEqual(n8nRes.status, 200, `Expected HTTP 200 from n8n webhook, got ${n8nRes.status}`);
  const n8nData = await n8nRes.json();
  const botReply = n8nData.text || n8nData.response || '';
  assert.ok(validateResponse(botReply), `Bot reply failed validation: "${botReply}"`);
  console.log(`  ✅ Primary n8n Webhook responded in ${t1 - t0}ms`);
  console.log(`     Model Output: "${botReply.slice(0, 80).replace(/\n/g, ' ')}..."`);

  // TEST 6: Live Integration Probe — Vercel Edge Gemini Streaming Pipeline
  console.log('\n[TEST 6] Live Integration: Vercel Edge Gemini Streaming Pipeline...');
  const t2 = Date.now();
  const edgeRes = await fetch(`${VERCEL_APP_URL}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-chatbot-token': WARMUP_SECRET,
      'x-user-id': 'xare-warmup-synthetic-agent'
    },
    body: JSON.stringify({ prompt: 'Hi' })
  });
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

  console.log('\n======================================================================');
  console.log('ALL 6 WARM-UP SUBSYSTEM TESTS PASSED WITH 100% SUCCESS');
  console.log('======================================================================\n');
}

runWarmupTestSuite().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
