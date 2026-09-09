const assert = require('assert');

const sortMessagesChronologically = (msgs) => {
  if (!Array.isArray(msgs)) return [];
  return [...msgs].sort((a, b) => {
    const getTime = (m) => {
      if (!m) return 0;
      if (m.timestamp) {
        if (typeof m.timestamp === 'number') return m.timestamp;
        if (typeof m.timestamp.toMillis === 'function') return m.timestamp.toMillis();
        if (typeof m.timestamp.toDate === 'function') return m.timestamp.toDate().getTime();
        const parsed = new Date(m.timestamp).getTime();
        if (!isNaN(parsed)) return parsed;
      }
      return 0;
    };
    const tA = getTime(a);
    const tB = getTime(b);
    if (tA !== tB) return tA - tB;
    if (a?.sender === 'user' && b?.sender === 'bot') return -1;
    if (a?.sender === 'bot' && b?.sender === 'user') return 1;
    return 0;
  });
};

const isHtmlVisualizationResponse = (text) => {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (/`\s*(?:html|htm|svg)\b/i.test(trimmed)) return true;
  if (/<!doctype\s+html/i.test(trimmed) || /<html[\s>]/i.test(trimmed) || /<svg[\s>]/i.test(trimmed)) return true;
  return false;
};

const isVisualizationPrompt = (text) => {
  if (!text || typeof text !== 'string') return false;
  return /\b(html|visualization|visualize|diagram|interactive|simulation|svg|canvas|dashboard|landing page|website|webpage|ui design|game)\b/i.test(text);
};

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log('  [PASS] ' + name);
    passed++;
  } catch (err) {
    console.error('  [FAIL] ' + name + ':', err.message);
  }
}

console.log('=== RUNNING MESSAGE ORDERING & HTML STREAMING TESTS ===\n');

runTest('Should sort user message before bot message when bot message appears first in array', () => {
  const t0 = new Date('2026-09-09T15:00:00.000Z');
  const t1 = new Date('2026-09-09T15:00:05.000Z');

  const inverted = [
    { id: 'bot-1', sender: 'bot', text: 'Hello, how can I help?', timestamp: t1 },
    { id: 'user-1', sender: 'user', text: 'hi', timestamp: t0 }
  ];

  const sorted = sortMessagesChronologically(inverted);
  assert.strictEqual(sorted[0].id, 'user-1');
  assert.strictEqual(sorted[1].id, 'bot-1');
});

runTest('Should sort user message before bot message on exact identical timestamp tie', () => {
  const now = new Date('2026-09-09T15:10:00.000Z');

  const sameTime = [
    { id: 'bot-1', sender: 'bot', text: 'Bot answer', timestamp: now },
    { id: 'user-1', sender: 'user', text: 'User prompt', timestamp: now }
  ];

  const sorted = sortMessagesChronologically(sameTime);
  assert.strictEqual(sorted[0].sender, 'user');
  assert.strictEqual(sorted[1].sender, 'bot');
});

runTest('Should maintain multi-turn order across 4 conversational turns', () => {
  const msgs = [
    { id: 'bot-2', sender: 'bot', text: 'Turn 2 answer', timestamp: 400 },
    { id: 'user-1', sender: 'user', text: 'Turn 1 prompt', timestamp: 100 },
    { id: 'bot-1', sender: 'bot', text: 'Turn 1 answer', timestamp: 200 },
    { id: 'user-2', sender: 'user', text: 'Turn 2 prompt', timestamp: 300 }
  ];

  const sorted = sortMessagesChronologically(msgs);
  assert.deepStrictEqual(sorted.map(m => m.id), ['user-1', 'bot-1', 'user-2', 'bot-2']);
});

runTest('Should correctly handle Firestore Timestamp objects with toMillis()', () => {
  const firestoreUser = {
    id: 'user-1',
    sender: 'user',
    timestamp: { toMillis: () => 1000 }
  };
  const firestoreBot = {
    id: 'bot-1',
    sender: 'bot',
    timestamp: { toMillis: () => 2000 }
  };

  const sorted = sortMessagesChronologically([firestoreBot, firestoreUser]);
  assert.strictEqual(sorted[0].id, 'user-1');
  assert.strictEqual(sorted[1].id, 'bot-1');
});

runTest('Should detect HTML code block (`html)', () => {
  const code = 'Here is the code:\n`html\n<!DOCTYPE html>\n<html><body><h1>Cat</h1></body></html>\n`';
  assert.strictEqual(isHtmlVisualizationResponse(code), true);
});

runTest('Should detect unclosed HTML code block during generation', () => {
  const partialCode = '`html\n<div class="cube">\n  <style>\n    .cube { width: 100px; }';
  assert.strictEqual(isHtmlVisualizationResponse(partialCode), true);
});

runTest('Should detect SVG code block (`svg)', () => {
  const svg = '`svg\n<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" /></svg>\n`';
  assert.strictEqual(isHtmlVisualizationResponse(svg), true);
});

runTest('Should detect raw HTML document starting with <!doctype html>', () => {
  const doc = '<!DOCTYPE html>\n<html><head></head><body><h1>Dashboard</h1></body></html>';
  assert.strictEqual(isHtmlVisualizationResponse(doc), true);
});

runTest('Should NOT flag Python code blocks as HTML visualizations', () => {
  const pyCode = 'Here is a script:\n`python\ndef calculate_sum(a, b):\n    return a + b\n`';
  assert.strictEqual(isHtmlVisualizationResponse(pyCode), false);
});

runTest('Should NOT flag regular conversational text as HTML visualizations', () => {
  const text = 'Hello there! I am ready to help you with your coding and creative projects.';
  assert.strictEqual(isHtmlVisualizationResponse(text), false);
});

runTest('Should NOT flag SQL or Bash code as HTML visualizations', () => {
  const sql = '`sql\nSELECT * FROM users WHERE active = 1;\n`';
  const bash = '`ash\ncurl -X POST https://example.com/api\n`';
  assert.strictEqual(isHtmlVisualizationResponse(sql), false);
  assert.strictEqual(isHtmlVisualizationResponse(bash), false);
});

runTest('Should detect visualization prompt keywords', () => {
  assert.strictEqual(isVisualizationPrompt('create an html visualization of the solar system'), true);
  assert.strictEqual(isVisualizationPrompt('build an interactive simulation of gravity'), true);
  assert.strictEqual(isVisualizationPrompt('draw an svg diagram of a network'), true);
  assert.strictEqual(isVisualizationPrompt('design a modern landing page for my app'), true);
});

runTest('Should NOT detect visualization on regular chat queries', () => {
  assert.strictEqual(isVisualizationPrompt('what is the distance from the earth to the moon?'), false);
  assert.strictEqual(isVisualizationPrompt('write a python script to parse CSV files'), false);
  assert.strictEqual(isVisualizationPrompt('explain quantum computing in simple terms'), false);
});

console.log('\n=== RESULTS: ' + passed + '/' + total + ' TESTS PASSED ===\n');
if (passed !== total) process.exit(1);
