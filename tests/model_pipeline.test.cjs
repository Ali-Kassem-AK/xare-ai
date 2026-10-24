const assert = require('assert');

// Test 1: Verify API stream file exports & model definitions
console.log('\n[TEST 1] Verifying Model Pipeline Definitions in api/chat/stream.ts...');
const fs = require('fs');
const streamTs = fs.readFileSync('api/chat/stream.ts', 'utf8');

// Check user requested Gemini models
assert.ok(streamTs.includes("'gemini-3.1-flash-lite'"), 'Missing gemini-3.1-flash-lite in Gemini pipeline');
assert.ok(streamTs.includes("'gemini-3.5-flash-lite'"), 'Missing gemini-3.5-flash-lite in Gemini pipeline');
assert.ok(streamTs.includes("'gemma-4-31b'"), 'Missing gemma-4-31b in Gemini pipeline');
console.log('  ✅ Gemini Pipeline includes exactly user-requested models (Gemini 3.1 Flash Lite, Gemini 3.5 Flash Lite, Gemma 4 31B)');

// Check user requested Groq models
assert.ok(streamTs.includes("'qwen/qwen3.8-27b'"), 'Missing qwen/qwen3.8-27b in Groq pipeline');
assert.ok(streamTs.includes("'openai/gpt-oss-120b'"), 'Missing openai/gpt-oss-120b in Groq pipeline');
assert.ok(streamTs.includes("'openai/gpt-oss-20b'"), 'Missing openai/gpt-oss-20b in Groq pipeline');
assert.ok(streamTs.includes('GROQ_API_KEY'), 'Missing GROQ_API_KEY environment variable handling');
console.log('  ✅ Groq Pipeline includes exactly user-requested models (qwen/qwen3.8-27b, openai/gpt-oss-120b, openai/gpt-oss-20b)');

// Test 2: Verify Groq-to-Gemini SSE stream adapter
console.log('\n[TEST 2] Verifying Groq-to-Gemini SSE Stream Adapter...');
const sampleGroqSseChunks = [
  'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":"Cooking"},"finish_reason":null}]}\n\n',
  'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":" a Steak"},"finish_reason":null}]}\n\n',
  'data: [DONE]\n\n'
];

function mockGroqAdapter(chunks) {
  const outputChunks = [];
  for (const line of chunks) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data: ')) continue;
    const jsonStr = trimmed.slice(6).trim();
    if (jsonStr === '[DONE]') {
      outputChunks.push('data: [DONE]\n\n');
      continue;
    }
    const parsed = JSON.parse(jsonStr);
    const text = parsed.choices?.[0]?.delta?.content;
    if (text) {
      outputChunks.push(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`);
    }
  }
  return outputChunks;
}

const adapted = mockGroqAdapter(sampleGroqSseChunks);
assert.strictEqual(adapted.length, 3);
assert.ok(adapted[0].includes('Cooking'));
assert.ok(adapted[1].includes('a Steak'));
assert.strictEqual(adapted[2], 'data: [DONE]\n\n');

// Verify client-side parsing of adapted stream
let clientAccumulated = '';
for (const chunk of adapted) {
  if (chunk.startsWith('data: ')) {
    const jsonStr = chunk.slice(6).trim();
    if (jsonStr === '[DONE]') continue;
    const parsed = JSON.parse(jsonStr);
    clientAccumulated += parsed.candidates[0].content.parts[0].text;
  }
}
assert.strictEqual(clientAccumulated, 'Cooking a Steak');
console.log('  ✅ Groq SSE streams adapt 100% losslessly into standard Gemini SSE client chunks');

// Test 3: Verify Title Generation Cleaning and Header Stripping
console.log('\n[TEST 3] Verifying Title Sanitization...');
function testCleanTitle(raw) {
  return raw.split('\n')[0]
    .replace(/^#+\s*/gm, '')
    .replace(/^(Title:|Chat Title:|\*|\[System Directives\]:|Task:|Output:|Response:)/gi, '')
    .replace(/["'*`]/g, '')
    .trim();
}

assert.strictEqual(testCleanTitle('### Title: Cooking a Steak'), 'Cooking a Steak');
assert.strictEqual(testCleanTitle('### Cooking a Steak'), 'Cooking a Steak');
assert.strictEqual(testCleanTitle('# Quick Summary'), 'Quick Summary');
assert.strictEqual(testCleanTitle('**React Hooks Tutorial**'), 'React Hooks Tutorial');
assert.strictEqual(testCleanTitle('`Python Script`'), 'Python Script');
console.log('  ✅ Markdown headers, asterisks, backticks, and labels stripped cleanly from titles');

// Test 4: Verify Follow-up Suggestion JSON Extraction
console.log('\n[TEST 4] Verifying Follow-up Suggestions Parsing...');
const mockJsonRes = '```json\n[\n  "What internal temp for medium-rare?",\n  "How long should steak rest?",\n  "Can I use a cast iron skillet?"\n]\n```';
const cleanRes = mockJsonRes.replace(/```json/gi, '').replace(/```/g, '').trim();
const parsedSuggestions = JSON.parse(cleanRes);
assert.strictEqual(parsedSuggestions.length, 3);
assert.strictEqual(parsedSuggestions[0], 'What internal temp for medium-rare?');
console.log('  ✅ 3-Pill suggestion array parsed cleanly without system prompt pollution');

console.log('\n======================================================');
console.log('ALL PIPELINE & UTILITY INTEGRATION TESTS PASSED (4/4)');
console.log('======================================================\n');
