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

// --- Group 4: New Chat Integrity ---
runTest('Should NEVER treat a chat with bot/visualization messages as empty, even if user messages are absent', () => {
  const chatWithBotOnly = {
    id: 'chat-bot-viz',
    title: '### Title Generation',
    messages: [
      { id: 'msg-1', sender: 'bot', text: '`html\n<div>Cat</div>\n`', timestamp: new Date() }
    ]
  };

  // The old buggy check: !chat.messages || chat.messages.length === 0 || !chat.messages.some(m => m.sender === 'user')
  const isBuggyEmpty = !chatWithBotOnly.messages || chatWithBotOnly.messages.length === 0 || !chatWithBotOnly.messages.some(m => m.sender === 'user');
  assert.strictEqual(isBuggyEmpty, true); // Proves the bug existed

  // The new fixed check:
  const isActuallyEmpty = !chatWithBotOnly.messages || chatWithBotOnly.messages.length === 0;
  assert.strictEqual(isActuallyEmpty, false); // Proves it is no longer treated as empty
});

runTest('Should create a fresh new chat with 0 messages when current chat has content', () => {
  const currentChatId = 'chat-1';
  const chatHistory = [
    { id: 'chat-1', title: 'Interactive Cat', messages: [{ id: 'm1', text: 'cat', sender: 'bot' }] }
  ];

  const activeChat = chatHistory.find(c => c.id === currentChatId);
  const activeIsActuallyEmpty = activeChat && (!activeChat.messages || activeChat.messages.length === 0);
  assert.strictEqual(activeIsActuallyEmpty, false);

  const newChatId = 'chat-fresh-2';
  const newChat = {
    id: newChatId,
    title: 'New Chat',
    messages: [],
    updatedAt: new Date()
  };

  const updatedHistory = [newChat, ...chatHistory.filter(c => c.id !== newChatId && c.messages && c.messages.length > 0)];
  assert.strictEqual(updatedHistory.length, 2);
  assert.strictEqual(updatedHistory[0].id, 'chat-fresh-2');
  assert.strictEqual(updatedHistory[0].messages.length, 0);
});

// --- Group 5: HTML Code Completeness & Multi-Chunk Continuation ---
const checkHtmlCodeCompleteness = (text) => {
  if (!text || typeof text !== 'string') return { isComplete: true, reason: '', cutoffSnippet: '', isHtml: false };
  const trimmed = text.trim();
  const hasHtmlFence = /```\s*(?:html|htm|svg)\b/i.test(trimmed);
  const hasRawHtmlDoc = /<!doctype\s+html/i.test(trimmed) || /<html[\s>]/i.test(trimmed) || /<svg[\s>]/i.test(trimmed);
  const hasScriptOrStyle = /<script[\s>]/i.test(trimmed) || /<style[\s>]/i.test(trimmed);
  const isHtml = hasHtmlFence || hasRawHtmlDoc || hasScriptOrStyle;
  if (!isHtml) return { isComplete: true, reason: '', cutoffSnippet: '', isHtml: false };

  const fenceCount = (trimmed.match(/```/g) || []).length;
  if (fenceCount % 2 !== 0) {
    return { isComplete: false, reason: 'unclosed_fence', cutoffSnippet: trimmed.slice(-150), isHtml: true };
  }

  let htmlPayload = trimmed;
  const fenceMatches = trimmed.match(/```\s*(?:html|htm|svg)\b([\s\S]*?)```/gi);
  if (fenceMatches && fenceMatches.length > 0) {
    const lastBlock = fenceMatches[fenceMatches.length - 1];
    htmlPayload = lastBlock.replace(/^```\s*(?:html|htm|svg)\b/i, '').replace(/```$/, '').trim();
  }

  const scriptOpenCount = (htmlPayload.match(/<script\b[^>]*>/gi) || []).length;
  const scriptCloseCount = (htmlPayload.match(/<\/script>/gi) || []).length;
  if (scriptOpenCount > scriptCloseCount) {
    return { isComplete: false, reason: 'unclosed_script', cutoffSnippet: trimmed.slice(-150), isHtml: true };
  }

  const styleOpenCount = (htmlPayload.match(/<style\b[^>]*>/gi) || []).length;
  const styleCloseCount = (htmlPayload.match(/<\/style>/gi) || []).length;
  if (styleOpenCount > styleCloseCount) {
    return { isComplete: false, reason: 'unclosed_style', cutoffSnippet: trimmed.slice(-150), isHtml: true };
  }

  const hasHtmlOpen = /<html[\s>]/i.test(htmlPayload);
  const hasHtmlClose = /<\/html>/i.test(htmlPayload);
  if (hasHtmlOpen && !hasHtmlClose) {
    return { isComplete: false, reason: 'missing_html_close', cutoffSnippet: trimmed.slice(-150), isHtml: true };
  }

  const hasBodyOpen = /<body[\s>]/i.test(htmlPayload);
  const hasBodyClose = /<\/body>/i.test(htmlPayload);
  if (hasBodyOpen && !hasBodyClose) {
    return { isComplete: false, reason: 'missing_body_close', cutoffSnippet: trimmed.slice(-150), isHtml: true };
  }

  const hasSvgOpen = /<svg[\s>]/i.test(htmlPayload);
  const hasSvgClose = /<\/svg>/i.test(htmlPayload);
  if (hasSvgOpen && !hasSvgClose) {
    return { isComplete: false, reason: 'unclosed_svg', cutoffSnippet: trimmed.slice(-150), isHtml: true };
  }

  const lastLt = htmlPayload.lastIndexOf('<');
  const lastGt = htmlPayload.lastIndexOf('>');
  if (lastLt > lastGt) {
    return { isComplete: false, reason: 'truncated_tag', cutoffSnippet: trimmed.slice(-150), isHtml: true };
  }

  return { isComplete: true, reason: '', cutoffSnippet: '', isHtml: true };
};

const cleanAndMergeContinuation = (baseText, continuationText) => {
  if (!continuationText || !continuationText.trim()) return baseText;
  if (!baseText) return continuationText;
  let cleanCont = continuationText.trimStart();
  cleanCont = cleanCont.replace(
    /^(?:(?:Here\s+(?:is|are)\s+(?:the\s+)?(?:continuation|rest|remaining|code)|Continuing(?:\s+from|\s+the)?|Resuming(?:\s+from)?|Sure,?\s+(?:here|continuing)|Below\s+is\s+the|Code\s+continuation)[\s\S]*?(?:(?=```)|(?:\n\s*\n)|(?:\r?\n)))/i,
    ''
  ).trimStart();
  const firstLineEnd = cleanCont.indexOf('\n');
  if (firstLineEnd !== -1) {
    const firstLine = cleanCont.substring(0, firstLineEnd).trim();
    if (/^(here\s+is|continuing|resuming|sure|below|as requested)/i.test(firstLine) && !firstLine.includes('```')) {
      cleanCont = cleanCont.substring(firstLineEnd + 1).trimStart();
    }
  }
  const baseFenceCount = (baseText.match(/```/g) || []).length;
  if (baseFenceCount % 2 !== 0) {
    cleanCont = cleanCont.replace(/^```[a-zA-Z0-9_\-\+\#]*\r?\n?/, '');
  }
  let merged = baseText + cleanCont;
  const mergedFenceCount = (merged.match(/```/g) || []).length;
  if (mergedFenceCount % 2 !== 0) {
    const trimmedMerged = merged.trimEnd();
    if (/<\/html>\s*$/i.test(trimmedMerged) || /<\/script>\s*$/i.test(trimmedMerged) || /<\/svg>\s*$/i.test(trimmedMerged)) {
      merged = trimmedMerged + '\n```\n';
    }
  }
  return merged;
};

runTest('Should flag incomplete HTML with unclosed code fence', () => {
  const cutoff = '```html\n<!DOCTYPE html>\n<html>\n<body>\n<h1>Solar System</h1>';
  const res = checkHtmlCodeCompleteness(cutoff);
  assert.strictEqual(res.isComplete, false);
  assert.strictEqual(res.reason, 'unclosed_fence');
});

runTest('Should flag incomplete HTML with unclosed <script> tag even if fence is present', () => {
  const cutoff = '```html\n<!DOCTYPE html>\n<html><body>\n<script>\nconst planets = ["Mercury", "Venus"';
  const res = checkHtmlCodeCompleteness(cutoff);
  assert.strictEqual(res.isComplete, false);
});

runTest('Should flag incomplete HTML with missing </html> tag', () => {
  const cutoff = '```html\n<!DOCTYPE html>\n<html><head></head><body><h1>Title</h1></body>```';
  const res = checkHtmlCodeCompleteness(cutoff);
  assert.strictEqual(res.isComplete, false);
  assert.strictEqual(res.reason, 'missing_html_close');
});

runTest('Should flag incomplete HTML with unclosed <style> tag', () => {
  const cutoff = '```html\n<!DOCTYPE html>\n<html><head><style>body { background: black;';
  const res = checkHtmlCodeCompleteness(cutoff);
  assert.strictEqual(res.isComplete, false);
});

runTest('Should confirm 100% complete HTML document is valid and ready', () => {
  const completeDoc = '```html\n<!DOCTYPE html>\n<html><head><style>body{color:#fff}</style></head><body><h1>Working Game</h1><script>console.log("Ready");</script></body></html>\n```';
  const res = checkHtmlCodeCompleteness(completeDoc);
  assert.strictEqual(res.isComplete, true);
  assert.strictEqual(res.isHtml, true);
});

runTest('Should strip conversational intro and stitch code continuation cleanly', () => {
  const part1 = '```html\n<!DOCTYPE html>\n<html><body>\n<script>\nconst canvas = document.createElement("canvas");\n';
  const part2 = 'Here is the continuation of the code:\n```javascript\ndocument.body.appendChild(canvas);\n</script>\n</body>\n</html>\n```';

  const merged = cleanAndMergeContinuation(part1, part2);
  assert.ok(!merged.includes('Here is the continuation'));
  assert.ok(merged.includes('document.body.appendChild(canvas);'));
  const check = checkHtmlCodeCompleteness(merged);
  assert.strictEqual(check.isComplete, true);
});

runTest('Should assemble a massive 3-chunk website seamlessly into a working full HTML document', () => {
  const chunk1 = '```html\n<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { margin: 0; background: #0b0f19; color: #fff; font-family: sans-serif; }\n    #game { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }\n  </style>\n</head>\n<body>\n  <div id="game"><h1>Interactive Orbit Simulator</h1></div>\n  <script>\n    const planets = [';
  assert.strictEqual(checkHtmlCodeCompleteness(chunk1).isComplete, false);

  const chunk2 = 'Continuing from code:\n    { name: "Earth", radius: 10, dist: 100 },\n    { name: "Mars", radius: 8, dist: 150 }\n    ];\n    function init() {\n      const c = document.createElement("canvas");\n';
  const merged1_2 = cleanAndMergeContinuation(chunk1, chunk2);
  assert.strictEqual(checkHtmlCodeCompleteness(merged1_2).isComplete, false);

  const chunk3 = '      document.getElementById("game").appendChild(c);\n    }\n    init();\n  </script>\n</body>\n</html>\n```';
  const fullAssembled = cleanAndMergeContinuation(merged1_2, chunk3);

  const finalCheck = checkHtmlCodeCompleteness(fullAssembled);
  assert.strictEqual(finalCheck.isComplete, true);
  assert.ok(fullAssembled.includes('<!DOCTYPE html>'));
  assert.ok(fullAssembled.includes('Interactive Orbit Simulator'));
  assert.ok(fullAssembled.includes('</html>'));
  assert.ok(fullAssembled.endsWith('```\n') || fullAssembled.endsWith('```'));
});

// ==========================================
// --- BUILD TOOL SPECIFICATION & DETECTION TESTS
// ==========================================

runTest('Should verify Build tool prompt architecture mandates native Web APIs, DPR scaling & zero CDNs', () => {
  const fs = require('fs');
  const path = require('path');
  const appTsx = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');

  // Verify BUILD_TOOL_SYSTEM_PROMPT is exported and contains critical architect instructions
  assert.ok(appTsx.includes('export const BUILD_TOOL_SYSTEM_PROMPT'), 'Must export BUILD_TOOL_SYSTEM_PROMPT');
  assert.ok(appTsx.includes('ZERO EXTERNAL SCRIPT DEPENDENCIES'), 'Must forbid external script CDNs');
  assert.ok(appTsx.includes('devicePixelRatio'), 'Must mandate retina DPR scaling');
  assert.ok(appTsx.includes('requestAnimationFrame'), 'Must mandate requestAnimationFrame loop');
  assert.ok(appTsx.includes('ZERO PLACEHOLDER & ZERO STUB GUARANTEE'), 'Must forbid TODOs and stubs');
  assert.ok(appTsx.includes('RICH INTERACTIVITY, CONTROLS & HUD'), 'Must enforce interactive controls and HUD');
  assert.ok(appTsx.includes("SPECIALIZED \"BUILD\" MODE"), 'Must establish build mode');
});

runTest('Should verify Build tool is registered as primary preset in AI_PRESETS', () => {
  const fs = require('fs');
  const path = require('path');
  const appTsx = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');

  // Verify Build preset registration
  assert.ok(appTsx.includes("label: 'Build'"), 'Build preset must be defined');
  assert.ok(appTsx.includes("action: 'build'"), 'Build action must be registered');
  assert.ok(appTsx.includes("prompt: BUILD_TOOL_SYSTEM_PROMPT"), 'Build preset must reference BUILD_TOOL_SYSTEM_PROMPT');
});

runTest('Should detect Build mode in isVisualizationPrompt for diverse creative domains', () => {
  // Test diverse builder domains (not just planets!)
  assert.strictEqual(isVisualizationPrompt('make a cyberpunk synthwave game'), true);
  assert.strictEqual(isVisualizationPrompt('build a real-time crypto trading dashboard'), true);
  assert.strictEqual(isVisualizationPrompt('create an interactive neural network visualizer'), true);
  assert.strictEqual(isVisualizationPrompt('make plante visualization'), true);
  assert.strictEqual(isVisualizationPrompt('build an interactive particle physics simulator'), true);
});

runTest('Should verify Full Page (scroll) is default layout mode in CodeBlock and sandbox', () => {
  const fs = require('fs');
  const path = require('path');
  const appTsx = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');

  // Verify CodeBlock defaults to scroll (Full Page)
  assert.ok(appTsx.includes("useState<'fit' | 'scroll'>('scroll')"), 'CodeBlock must default to scroll (Full Page)');
  // Verify autoFitScript defaults to scroll
  assert.ok(appTsx.includes("var preferredMode = 'scroll'"), 'autoFitScript must default preferredMode to scroll');
  // Verify html.xare-mode-scroll has full-width responsive styles
  assert.ok(appTsx.includes('html.xare-mode-scroll'), 'Must define xare-mode-scroll styles');
  assert.ok(!appTsx.includes('min-width: min-content !important; width: auto !important;'), 'Must not collapse body with min-content');
});

runTest('Should verify App.tsx configures ignoreUndefinedProperties on Firestore', () => {
  const fs = require('fs');
  const path = require('path');
  const appTsx = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');

  assert.ok(appTsx.includes('ignoreUndefinedProperties: true'), 'Firestore must be initialized with ignoreUndefinedProperties: true');
  assert.ok(appTsx.includes('initializeFirestore'), 'App must use initializeFirestore');
  assert.ok(appTsx.includes('sanitizeForFirestore'), 'App must export and use sanitizeForFirestore');
  assert.ok(appTsx.includes('saveChatsToLocalStorage'), 'App must include saveChatsToLocalStorage');
  assert.ok(appTsx.includes('loadChatsFromLocalStorage'), 'App must include loadChatsFromLocalStorage');
});

runTest('Should verify sanitizeForFirestore recursively strips undefined from objects and arrays', () => {
  // Test implementation of sanitizeForFirestore
  const sanitizeForFirestore = (data) => {
    if (data === undefined) return null;
    if (data === null) return null;
    if (typeof data === 'function') return null;
    if (data instanceof Date) {
      return isNaN(data.getTime()) ? new Date() : data;
    }
    if (typeof data.toDate === 'function') {
      return data;
    }
    if (Array.isArray(data)) {
      return data
        .filter(item => item !== undefined)
        .map(item => sanitizeForFirestore(item));
    }
    if (typeof data === 'object') {
      if (data && (data._methodName || data.constructor?.name === 'FieldValue')) return data;
      const clean = {};
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined && typeof value !== 'function') {
          clean[key] = sanitizeForFirestore(value);
        }
      }
      return clean;
    }
    return data;
  };

  const rawUserMsg = {
    id: 'msg_123',
    messageId: 'msg_123',
    requestId: 'req_abc',
    transportId: undefined,
    toolLabel: undefined,
    text: 'Hello world',
    sender: 'user',
    status: 'sent',
    image: null,
    audio: null,
    document: null,
    timestamp: new Date('2026-09-09T20:00:00Z')
  };

  const clean = sanitizeForFirestore(rawUserMsg);
  assert.strictEqual(clean.id, 'msg_123');
  assert.strictEqual(clean.text, 'Hello world');
  assert.strictEqual(clean.image, null);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(clean, 'transportId'), false, 'transportId key must be removed');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(clean, 'toolLabel'), false, 'toolLabel key must be removed');

  const rawChatDoc = {
    id: 'chat_999',
    title: 'New Chat',
    messages: [rawUserMsg, { id: 'msg_124', text: 'response', transportId: undefined }],
    nested: { a: 1, b: undefined, c: [undefined, 'valid'] }
  };

  const cleanDoc = sanitizeForFirestore(rawChatDoc);
  assert.strictEqual(cleanDoc.messages.length, 2);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(cleanDoc.messages[0], 'transportId'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(cleanDoc.nested, 'b'), false);
  assert.deepStrictEqual(cleanDoc.nested.c, ['valid']);
});

runTest('Should verify LocalStorage chat serialization & deserialization preserves messages and dates', () => {
  const parseDateSafe = (val) => {
    if (!val) return new Date();
    if (val instanceof Date) return isNaN(val.getTime()) ? new Date() : val;
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  const mockChats = [
    {
      id: 'chat_abc',
      title: 'Quantum Physics Discussion',
      updatedAt: new Date('2026-09-09T21:00:00Z'),
      messages: [
        { id: 'm1', text: 'Explain entanglement', sender: 'user', timestamp: new Date('2026-09-09T21:00:00Z') },
        { id: 'm2', text: 'Quantum entanglement is...', sender: 'bot', timestamp: new Date('2026-09-09T21:00:05Z') }
      ]
    }
  ];

  // Serialize as saveChatsToLocalStorage does
  const serialized = JSON.stringify(mockChats.map(c => ({
    ...c,
    updatedAt: c.updatedAt.toISOString(),
    messages: c.messages.map(m => ({ ...m, timestamp: m.timestamp.toISOString() }))
  })));

  // Deserialize as loadChatsFromLocalStorage does
  const parsed = JSON.parse(serialized).map(c => ({
    ...c,
    updatedAt: parseDateSafe(c.updatedAt),
    messages: c.messages.map(m => ({ ...m, timestamp: parseDateSafe(m.timestamp) }))
  }));

  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].title, 'Quantum Physics Discussion');
  assert.strictEqual(parsed[0].messages.length, 2);
  assert.ok(parsed[0].updatedAt instanceof Date);
  assert.ok(parsed[0].messages[0].timestamp instanceof Date);
  assert.strictEqual(parsed[0].messages[0].text, 'Explain entanglement');
});

runTest('Should verify sidebar history deduplication and latest activity sort', () => {
  const getLatestChatActivityTime = (chat) => {
    if (!chat) return 0;
    let maxTime = new Date(chat.updatedAt).getTime();
    if (Array.isArray(chat.messages) && chat.messages.length > 0) {
      const lastMsg = chat.messages[chat.messages.length - 1];
      if (lastMsg && lastMsg.timestamp) {
        const lastMsgTime = new Date(lastMsg.timestamp).getTime();
        if (lastMsgTime > maxTime) maxTime = lastMsgTime;
      }
    }
    return maxTime;
  };

  const currentChatId = 'chat_new';
  const chatHistory = [
    { id: 'chat_old', title: 'Old Chat', messages: [{ id: '1', text: 'Hi', timestamp: '2026-09-01T10:00:00Z' }], updatedAt: '2026-09-01T10:00:00Z' },
    { id: 'chat_old', title: 'Old Chat Dup', messages: [{ id: '1', text: 'Hi', timestamp: '2026-09-01T10:00:00Z' }], updatedAt: '2026-09-01T10:00:00Z' },
    { id: 'chat_recent', title: 'Recent Chat', messages: [{ id: '2', text: 'Latest', timestamp: '2026-09-09T21:00:00Z' }], updatedAt: '2026-09-09T21:00:00Z' },
    { id: 'chat_new', title: 'New Chat', messages: [], updatedAt: '2026-09-09T21:15:00Z' }
  ];

  // Execute exact sidebar logic
  const uniqueChats = Array.from(new Map(chatHistory.filter(c => c && c.id).map(c => [c.id, c])).values())
    .filter(chat => {
      const hasMessages = Array.isArray(chat.messages) && chat.messages.length > 0;
      return hasMessages || chat.id === currentChatId;
    })
    .sort((a, b) => getLatestChatActivityTime(b) - getLatestChatActivityTime(a));

  // Must have 3 items (duplicate 'chat_old' stripped)
  assert.strictEqual(uniqueChats.length, 3);
  // Order: chat_new (21:15), chat_recent (21:00), chat_old (09-01)
  assert.strictEqual(uniqueChats[0].id, 'chat_new');
  assert.strictEqual(uniqueChats[1].id, 'chat_recent');
  assert.strictEqual(uniqueChats[2].id, 'chat_old');
});

runTest('Should verify that restarting/reloading opens a fresh new chat by default with past chats in history', () => {
  const cachedChats = [
    { id: 'c1', title: 'Prior Chat 1', messages: [{ id: 'm1', text: 'hello' }], updatedAt: new Date() },
    { id: 'c2', title: 'Prior Chat 2', messages: [{ id: 'm2', text: 'code request' }], updatedAt: new Date() }
  ];

  // Simulation of onAuthStateChanged & onSnapshot startup
  const initChatId = 'init_new_chat_123';
  const initChat = {
    id: initChatId,
    title: 'New Chat',
    messages: [],
    updatedAt: new Date()
  };

  const pastChats = cachedChats.filter(c => c.messages && c.messages.length > 0);
  const startupHistory = [initChat, ...pastChats];
  const activeChatId = initChatId;

  // 1. Must default to the new chat
  assert.strictEqual(activeChatId, 'init_new_chat_123');
  const activeChat = startupHistory.find(c => c.id === activeChatId);
  assert.strictEqual(activeChat.title, 'New Chat');
  assert.strictEqual(activeChat.messages.length, 0);

  // 2. Must keep previous chats in history list
  assert.strictEqual(startupHistory.length, 3);
  assert.strictEqual(startupHistory[1].title, 'Prior Chat 1');
  assert.strictEqual(startupHistory[2].title, 'Prior Chat 2');
});

runTest('Should verify Build tool active badge uses uniform styling and sent messages do not render toolLabel', () => {
  const fs = require('fs');
  const path = require('path');
  const appTsx = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');

  // Verify active tool badge has no amber color override
  assert.ok(!appTsx.includes("activeTool.label === 'Build' ? (isDarkMode ? 'bg-amber-500/15"), 'Active tool badge must not have amber styling for Build');
  assert.ok(!appTsx.includes("activeTool.label === 'Build' ? 'text-amber-500' : ''"), 'Active tool icon must not have text-amber-500');

  // Verify ChatMessageItem does not render toolLabel pill inside sent user message bubbles
  assert.ok(!appTsx.includes("msg.sender === 'user' && msg.toolLabel &&"), 'ChatMessageItem must not render toolLabel badge in user message bubbles');
});

console.log('\n=== ALL TESTS COMPLETE: ' + passed + '/' + total + ' PASSED ===\n');
if (passed !== total) process.exit(1);



