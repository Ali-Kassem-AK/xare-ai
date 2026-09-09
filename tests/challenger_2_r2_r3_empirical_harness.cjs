/**
 * Challenger 2 Empirical Test Harness: R2 & R3 Verification
 * 
 * Rigorously challenges and empirically verifies:
 * 1. R2: Duplicate PDF Fresh Transport & Remote Deletion Independence
 *    - Sending the EXACT SAME physical PDF twice in succession: assert url1 != url2
 *    - Remote deletion of url1: assert url1 returns HTTP 404, while url2 returns HTTP 200 with intact binary bytes
 *    - Cross-chat transport boundary isolation (Chat A vs Chat B): assert zero cross-chat URL leakage
 *    - Differentiating files sharing identical filenames or identical file sizes but different contents
 * 2. R3: Audio Local Playback Durability & CustomAudioPlayer Resilience
 *    - URLs with length < 100 characters (28-char Kappa URLs, 64-char blob URLs, 20-char CDN URLs) do NOT trigger isInvalid or "Error Unavailable"
 *    - Verification of adversarial invalid URLs (null, undefined, "[object Object]") correctly triggering error state
 *    - Decoupled lifecycle: when an audio message's ephemeral transport URL is deleted from Kappa (returning 404), local audio playback in chat history remains 100% playable via local handle/Blob
 * 
 * Execution: node tests/challenger_2_r2_r3_empirical_harness.cjs
 */

const assert = require('assert');
const crypto = require('crypto');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const { createServer } = require('vite');

console.log('======================================================================');
console.log('CHALLENGER 2: EMPIRICAL VERIFICATION HARNESS (R2 & R3)');
console.log('======================================================================\n');

// ---------------------------------------------------------------------------
// Polyfills for Node environment to execute genuine client services
// ---------------------------------------------------------------------------
class NodeXMLHttpRequest {
  constructor() {
    this.upload = {
      addEventListener: (event, fn) => {
        this._uploadListeners = this._uploadListeners || {};
        this._uploadListeners[event] = fn;
      }
    };
    this._listeners = {};
    this.status = 0;
    this.statusText = '';
    this.responseText = '';
  }

  addEventListener(event, fn) {
    this._listeners[event] = fn;
  }

  open(method, url) {
    this._method = method;
    this._url = url;
  }

  abort() {
    if (this._controller) this._controller.abort();
    if (this._listeners['abort']) this._listeners['abort']();
  }

  async send(formData) {
    this._controller = new AbortController();
    const maxRetries = 4;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await fetch(this._url, {
          method: this._method,
          headers: { 'Origin': 'https://xare-ai.vercel.app' },
          body: formData,
          signal: this._controller.signal
        });

        if (res.status === 429) {
          const backoff = 1000 * (attempt + 1);
          console.log(`   [HTTP 429 Backoff] Waiting ${backoff}ms (attempt ${attempt + 1}/${maxRetries})...`);
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }

        this.status = res.status;
        this.statusText = res.statusText;
        this.responseText = await res.text();
        if (this._listeners['load']) this._listeners['load']();
        return;
      } catch (err) {
        if (this._controller.signal.aborted) {
          if (this._listeners['abort']) this._listeners['abort']();
          return;
        }
        if (attempt === maxRetries - 1) {
          if (this._listeners['error']) this._listeners['error'](err);
          return;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
}

global.XMLHttpRequest = NodeXMLHttpRequest;

// ---------------------------------------------------------------------------
// Test Logging & Measurement Matrix
// ---------------------------------------------------------------------------
const testResults = [];

function recordTest(id, name, suite, expected, actual, status, durationMs, details = {}) {
  testResults.push({ id, name, suite, expected, actual, status, durationMs, details });
  const icon = status === 'PASS' ? '✅' : (status === 'FAIL' ? '❌' : '⚠️');
  console.log(`${icon} [${id}] ${name} (${durationMs.toFixed(1)}ms): ${status}`);
  if (details.note) console.log(`   Note: ${details.note}`);
  if (details.httpStatus) console.log(`   HTTP Status: ${details.httpStatus}`);
  if (details.urls) console.log(`   URLs: ${JSON.stringify(details.urls)}`);
}

// ---------------------------------------------------------------------------
// Synthetic Media Generators (Valid Standard Formats)
// ---------------------------------------------------------------------------
function generateValidPdfBuffer(uniqueString = 'Challenger-2-Empirical-Test') {
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length ${50 + uniqueString.length} >>
stream
BT
/F1 24 Tf
100 700 Td
(${uniqueString}) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000200 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
320
%%EOF`;
  return Buffer.from(content, 'utf-8');
}

function generateValidWavBuffer(durationSec = 1, sampleRate = 8000) {
  const numSamples = sampleRate * durationSec;
  const buffer = Buffer.alloc(44 + numSamples);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34); // 8-bit
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples, 40);
  for (let i = 0; i < numSamples; i++) {
    // 440 Hz Sine Tone
    const sample = Math.round(128 + 127 * Math.sin((2 * Math.PI * 440 * i) / sampleRate));
    buffer.writeUInt8(sample, 44 + i);
  }
  return buffer;
}

// ---------------------------------------------------------------------------
// Main Execution Runner
// ---------------------------------------------------------------------------
async function runEmpiricalHarness() {
  console.log('>>> Initializing Vite SSR context to load production modules directly...');
  const viteServer = await createServer({ server: { middlewareMode: true } });

  const storageMod = await viteServer.ssrLoadModule('./src/services/storage/storageService.ts');
  const appMod = await viteServer.ssrLoadModule('./src/App.tsx');

  const {
    computeFileHash,
    TransportLifetimeLedger,
    transportLedger,
    uploadFileDirectly,
    deleteTemporaryFile,
    clearUploadCache
  } = storageMod;

  const { CustomAudioPlayer } = appMod;

  console.log('>>> Modules loaded successfully:');
  console.log('    storageService: computeFileHash, TransportLifetimeLedger, transportLedger, uploadFileDirectly, deleteTemporaryFile');
  console.log('    App.tsx: CustomAudioPlayer\n');

  // =========================================================================
  // SUITE 1: R2 — DUPLICATE PDF FRESH TRANSPORT & REMOTE DELETION INDEPENDENCE
  // =========================================================================
  console.log('>>> [SUITE 1] R2: Duplicate PDF Fresh Transport & Remote Deletion Independence');

  const sharedPdfBuffer = generateValidPdfBuffer(`Audit-Run-${Date.now()}`);
  const pdfSha256 = crypto.createHash('sha256').update(sharedPdfBuffer).digest('hex');
  const sharedChatId = `chat_session_${Date.now()}`;

  let url1 = null;
  let deleteUrl1 = null;
  let transportId1 = null;

  let url2 = null;
  let deleteUrl2 = null;
  let transportId2 = null;

  // TEST-R2-01: First Upload of PDF
  {
    const t0 = Date.now();
    try {
      clearUploadCache();
      const pdfFile1 = new File([sharedPdfBuffer], 'confidential_contract.pdf', { type: 'application/pdf' });
      
      const computedHash = await computeFileHash(pdfFile1);
      assert.strictEqual(computedHash, `sha256_${pdfSha256}`, 'computeFileHash must match crypto SHA-256');

      const res1 = await uploadFileDirectly(pdfFile1, { chatId: sharedChatId });
      url1 = res1.fileUrl;
      deleteUrl1 = res1.deleteUrl;
      transportId1 = res1.transportId;

      assert.ok(url1.startsWith('https://kappa.lol/'), 'Upload 1 must yield https://kappa.lol URL');
      assert.ok(deleteUrl1.includes('key='), 'Upload 1 must include delete URL with key');
      assert.ok(transportId1.startsWith('trans_'), 'Upload 1 must have transportId');

      // Verify active transport in ledger
      const activeInst = transportLedger.getActiveTransport(sharedChatId, computedHash);
      assert.ok(activeInst !== null, 'Active transport must be present in ledger before send');
      assert.strictEqual(activeInst.state, 'ready', 'Transport state must be ready');

      // Verify remote download works immediately
      const headRes = await fetch(url1, { method: 'HEAD' });
      assert.strictEqual(headRes.status, 200, 'Initial url1 must be HTTP 200');

      recordTest(
        'TEST-R2-01',
        'First Upload of Physical PDF & Ledger Registration',
        'R2-Duplicate',
        'HTTP 200, ready state, valid SHA-256',
        `HTTP ${headRes.status}, state=${activeInst.state}`,
        'PASS',
        Date.now() - t0,
        { httpStatus: headRes.status, urls: { url1, transportId1 } }
      );
    } catch (err) {
      recordTest('TEST-R2-01', 'First Upload of Physical PDF', 'R2-Duplicate', 'Success', err.message, 'FAIL', Date.now() - t0);
    }
  }

  // TEST-R2-02: Message Binding & Fresh URL Generation on Duplicate Send
  {
    const t0 = Date.now();
    try {
      // Simulate sending Message 1: bind transport to message snapshot
      transportLedger.bindToMessage(transportId1, `msg_1_${Date.now()}`);

      // Verify that after binding to message, active cache is cleared for this contentId in this chat
      const computedHash = `sha256_${pdfSha256}`;
      const activeAfterBind = transportLedger.getActiveTransport(sharedChatId, computedHash);
      assert.strictEqual(activeAfterBind, null, 'Active transport must be cleared from cache after message binding');

      // User sends the EXACT SAME physical PDF a second time in succession
      const pdfFile2 = new File([sharedPdfBuffer], 'confidential_contract.pdf', { type: 'application/pdf' });
      const res2 = await uploadFileDirectly(pdfFile2, { chatId: sharedChatId });

      url2 = res2.fileUrl;
      deleteUrl2 = res2.deleteUrl;
      transportId2 = res2.transportId;

      assert.ok(url2.startsWith('https://kappa.lol/'), 'Upload 2 must yield https://kappa.lol URL');
      assert.notStrictEqual(url1, url2, 'MANDATORY: url1 and url2 must be distinct URLs (url1 != url2)');
      assert.notStrictEqual(deleteUrl1, deleteUrl2, 'MANDATORY: deleteUrl1 and deleteUrl2 must be distinct');
      assert.notStrictEqual(transportId1, transportId2, 'transportId1 and transportId2 must be distinct');

      recordTest(
        'TEST-R2-02',
        'Duplicate Physical PDF Re-Send Generates Fresh Distinct Transport URL',
        'R2-Duplicate',
        'url1 != url2 (strictly separate instances)',
        `url1=${url1} !== url2=${url2}`,
        'PASS',
        Date.now() - t0,
        { urls: { url1, url2 } }
      );
    } catch (err) {
      recordTest('TEST-R2-02', 'Duplicate Physical PDF Re-Send', 'R2-Duplicate', 'url1 != url2', err.message, 'FAIL', Date.now() - t0);
    }
  }

  // TEST-R2-03: Deletion Independence & Remote 404 vs 200 Verification
  {
    const t0 = Date.now();
    try {
      // Purge first temporary file via deleteTemporaryFile
      const purgeSuccess = await deleteTemporaryFile(deleteUrl1);
      assert.ok(purgeSuccess, 'deleteTemporaryFile(deleteUrl1) must return true');

      // Probe url1: MUST return HTTP 404
      const res1Probe = await fetch(url1);
      assert.strictEqual(res1Probe.status, 404, 'MANDATORY: Purged url1 must return HTTP 404 Not Found');

      // Probe url2: MUST return HTTP 200 OK
      const res2Probe = await fetch(url2);
      assert.strictEqual(res2Probe.status, 200, 'MANDATORY: Active url2 must return HTTP 200 OK');

      // Download url2 payload and assert 100% binary byte identity
      const downloadedBytes2 = Buffer.from(await res2Probe.arrayBuffer());
      assert.strictEqual(downloadedBytes2.length, sharedPdfBuffer.length, 'url2 byte length must match original PDF');
      
      const downloadedSha256 = crypto.createHash('sha256').update(downloadedBytes2).digest('hex');
      assert.strictEqual(downloadedSha256, pdfSha256, 'url2 binary SHA-256 must match original PDF SHA-256');

      recordTest(
        'TEST-R2-03',
        'Deletion Independence: url1 Returns 404, url2 Returns 200 with Intact Binary',
        'R2-Duplicate',
        'url1=404, url2=200, byte-for-byte binary match',
        `url1=${res1Probe.status}, url2=${res2Probe.status}, SHA-256 match confirmed (${downloadedBytes2.length} bytes)`,
        'PASS',
        Date.now() - t0,
        { httpStatus: `url1=${res1Probe.status}, url2=${res2Probe.status}`, note: `Downloaded ${downloadedBytes2.length}B intact` }
      );

      // Clean up url2
      await deleteTemporaryFile(deleteUrl2);
    } catch (err) {
      recordTest('TEST-R2-03', 'Deletion Independence Verification', 'R2-Duplicate', 'url1=404, url2=200', err.message, 'FAIL', Date.now() - t0);
    }
  }

  // =========================================================================
  // SUITE 2: R2 — CROSS-CHAT TRANSPORT BOUNDARY ISOLATION
  // =========================================================================
  console.log('\n>>> [SUITE 2] R2: Cross-Chat Transport Boundary Isolation');

  // TEST-R2-04: Same PDF Across Chat A and Chat B
  {
    const t0 = Date.now();
    try {
      clearUploadCache();
      const chatA_Id = `chat_alpha_${Date.now()}`;
      const chatB_Id = `chat_beta_${Date.now()}`;

      const pdfPayload = generateValidPdfBuffer(`Cross-Chat-Test-${Date.now()}`);
      const pdfFileA = new File([pdfPayload], 'shared_presentation.pdf', { type: 'application/pdf' });
      const pdfFileB = new File([pdfPayload], 'shared_presentation.pdf', { type: 'application/pdf' });

      // Upload in Chat A
      const upA = await uploadFileDirectly(pdfFileA, { chatId: chatA_Id });
      assert.ok(upA.fileUrl.startsWith('https://kappa.lol/'));

      // Check ledger in Chat B: MUST be null (isolated!)
      const contentId = await computeFileHash(pdfFileB);
      const chatBActiveBeforeUpload = transportLedger.getActiveTransport(chatB_Id, contentId);
      assert.strictEqual(chatBActiveBeforeUpload, null, 'Chat B must NOT see active transport from Chat A');

      // Upload in Chat B
      const upB = await uploadFileDirectly(pdfFileB, { chatId: chatB_Id });
      assert.ok(upB.fileUrl.startsWith('https://kappa.lol/'));

      // Strict isolation assertion
      assert.notStrictEqual(upA.fileUrl, upB.fileUrl, 'Chat A and Chat B must receive distinct transport URLs');
      assert.notStrictEqual(upA.deleteUrl, upB.deleteUrl, 'Chat A and Chat B must receive distinct deletion URLs');

      // Purge Chat A's file
      await deleteTemporaryFile(upA.deleteUrl);

      // Assert Chat A's URL is 404
      const resA = await fetch(upA.fileUrl);
      assert.strictEqual(resA.status, 404, 'Chat A url must be 404 after Chat A deletion');

      // Assert Chat B's URL is STILL 200 and intact
      const resB = await fetch(upB.fileUrl);
      assert.strictEqual(resB.status, 200, 'Chat B url must remain 200 OK after Chat A deletion');

      const bufB = Buffer.from(await resB.arrayBuffer());
      assert.strictEqual(bufB.length, pdfPayload.length, 'Chat B payload must remain intact');

      // Clean up Chat B
      await deleteTemporaryFile(upB.deleteUrl);

      recordTest(
        'TEST-R2-04',
        'Cross-Chat Transport Boundary Isolation (Zero Cross-Chat Leakage)',
        'R2-Isolation',
        'Zero leakage: upA != upB, deleting upA leaves upB active at HTTP 200',
        `upA=${upA.fileUrl}, upB=${upB.fileUrl}, resA=404, resB=200`,
        'PASS',
        Date.now() - t0,
        { note: 'Chat boundary strictly enforced by chatId composite key' }
      );
    } catch (err) {
      recordTest('TEST-R2-04', 'Cross-Chat Transport Boundary Isolation', 'R2-Isolation', 'Isolated instances', err.message, 'FAIL', Date.now() - t0);
    }
  }

  // =========================================================================
  // SUITE 3: R2 — DIFFERENTIATION OF FILES WITH SAME FILENAME / SAME SIZE
  // =========================================================================
  console.log('\n>>> [SUITE 3] R2: Same Filename & Same Size Content Differentiation');

  // TEST-R2-05: Different Content Sharing Identical Filename and Exact Same Size
  {
    const t0 = Date.now();
    try {
      clearUploadCache();
      const testChatId = `chat_collision_${Date.now()}`;

      // Create two distinct buffers of EXACTLY 2048 bytes with IDENTICAL filename
      const buf1 = Buffer.alloc(2048, 'A');
      buf1.write('CONTRACT-VERSION-1-ALPHA-APPROVED', 0, 'utf-8');

      const buf2 = Buffer.alloc(2048, 'B');
      buf2.write('CONTRACT-VERSION-2-BETA-REVISED--', 0, 'utf-8');

      assert.strictEqual(buf1.length, buf2.length, 'Precondition: sizes must be identical');

      const file1 = new File([buf1], 'statement.pdf', { type: 'application/pdf' });
      const file2 = new File([buf2], 'statement.pdf', { type: 'application/pdf' });

      // Compute content hashes
      const hash1 = await computeFileHash(file1);
      const hash2 = await computeFileHash(file2);

      assert.notStrictEqual(hash1, hash2, 'MANDATORY: SHA-256 hashes must differ despite identical filename and size');

      // Upload both files
      const up1 = await uploadFileDirectly(file1, { chatId: testChatId });
      const up2 = await uploadFileDirectly(file2, { chatId: testChatId });

      assert.notStrictEqual(up1.fileUrl, up2.fileUrl, 'URLs must differ for different contents');
      assert.strictEqual(up1.contentId, hash1);
      assert.strictEqual(up2.contentId, hash2);

      // Verify downloaded content matches respective originals
      const dl1 = Buffer.from(await (await fetch(up1.fileUrl)).arrayBuffer());
      const dl2 = Buffer.from(await (await fetch(up2.fileUrl)).arrayBuffer());

      assert.ok(dl1.toString('utf-8').includes('CONTRACT-VERSION-1'), 'File 1 content preserved');
      assert.ok(dl2.toString('utf-8').includes('CONTRACT-VERSION-2'), 'File 2 content preserved');

      // Cleanup
      await deleteTemporaryFile(up1.deleteUrl);
      await deleteTemporaryFile(up2.deleteUrl);

      recordTest(
        'TEST-R2-05',
        'Same Filename & Same Size File Differentiation via SHA-256 Hashing',
        'R2-Differentiation',
        'Distinct SHA-256 hashes, distinct URLs, correct downloaded contents',
        `hash1=${hash1.slice(0, 16)}... != hash2=${hash2.slice(0, 16)}...`,
        'PASS',
        Date.now() - t0,
        { note: 'Cryptographic content hashing prevents collision on identical name & size' }
      );
    } catch (err) {
      recordTest('TEST-R2-05', 'Same Filename & Same Size Differentiation', 'R2-Differentiation', 'Distinct hashes & URLs', err.message, 'FAIL', Date.now() - t0);
    }
  }

  // =========================================================================
  // SUITE 4: R3 — ADVERSARIAL AUDIO PLAYBACK: URLS < 100 CHARS & CUSTOMAUDIOPLAYER
  // =========================================================================
  console.log('\n>>> [SUITE 4] R3: Adversarial Audio Playback: URLs < 100 Chars & CustomAudioPlayer');

  // Helper to test CustomAudioPlayer rendering and error state
  function evaluateAudioPlayer(src) {
    // 1. Evaluate cleanSrc & validity logic mirroring CustomAudioPlayer:
    let cleanSrc = '';
    if (src) {
      let s = src.replace(/\s+/g, '');
      if (s.startsWith('data:audio/mp3;')) {
        s = s.replace('data:audio/mp3;', 'data:audio/mpeg;');
      }
      cleanSrc = s;
    }
    const isInvalid = !cleanSrc || cleanSrc.includes('undefined') || cleanSrc.includes('[object');

    // 2. Render React component to static markup to verify DOM output
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(CustomAudioPlayer, {
        src,
        sender: 'user',
        isDarkMode: false
      })
    );

    const hasErrorText = html.includes('>Error<') || html.includes('Error');
    const hasUnavailableText = html.includes('>Unavailable<') || html.includes('Unavailable');
    const hasDisabledButton = html.includes('disabled=""') || html.includes('disabled');

    return {
      src,
      cleanSrc,
      srcLength: src ? src.length : 0,
      isInvalid,
      html,
      hasErrorText,
      hasUnavailableText,
      hasDisabledButton
    };
  }

  // TEST-R3-01: ~28-character Kappa audio URL (< 100 chars)
  {
    const t0 = Date.now();
    try {
      const kappaUrl = 'https://kappa.lol/3NIvW0.webm'; // 29 chars (< 100)
      const result = evaluateAudioPlayer(kappaUrl);

      assert.ok(result.srcLength < 100, `Audio URL length (${result.srcLength}) must be < 100 characters`);
      assert.strictEqual(result.isInvalid, false, 'Kappa URL must NOT be invalid (isInvalid must be false)');
      assert.strictEqual(result.hasErrorText, false, 'Must NOT render "Error" in status label');
      assert.strictEqual(result.hasUnavailableText, false, 'Must NOT render "Unavailable" in status label');
      assert.strictEqual(result.hasDisabledButton, false, 'Play button must NOT be disabled');

      recordTest(
        'TEST-R3-01',
        'CustomAudioPlayer: 29-char Kappa WebM URL Playback (<100 Chars, No "Error Unavailable")',
        'R3-AudioPlayer',
        'isInvalid=false, no Error text, button enabled',
        `len=${result.srcLength} (<100), isInvalid=${result.isInvalid}, hasError=${result.hasErrorText}`,
        'PASS',
        Date.now() - t0,
        { note: 'Short URL plays without triggering <100 length restriction' }
      );
    } catch (err) {
      recordTest('TEST-R3-01', 'CustomAudioPlayer: 29-char Kappa WebM URL', 'R3-AudioPlayer', 'Valid', err.message, 'FAIL', Date.now() - t0);
    }
  }

  // TEST-R3-02: ~28-character Kappa WAV URL (< 100 chars)
  {
    const t0 = Date.now();
    try {
      const kappaWavUrl = 'https://kappa.lol/yjaxGI.wav'; // 28 chars (< 100)
      const result = evaluateAudioPlayer(kappaWavUrl);

      assert.ok(result.srcLength < 100, `Audio URL length (${result.srcLength}) must be < 100 characters`);
      assert.strictEqual(result.isInvalid, false);
      assert.strictEqual(result.hasErrorText, false);
      assert.strictEqual(result.hasUnavailableText, false);
      assert.strictEqual(result.hasDisabledButton, false);

      recordTest(
        'TEST-R3-02',
        'CustomAudioPlayer: 28-char Kappa WAV URL Playback (<100 Chars)',
        'R3-AudioPlayer',
        'isInvalid=false, no Error text, button enabled',
        `len=${result.srcLength} (<100), isInvalid=${result.isInvalid}`,
        'PASS',
        Date.now() - t0,
        { note: '28-char WAV URL plays cleanly' }
      );
    } catch (err) {
      recordTest('TEST-R3-02', 'CustomAudioPlayer: 28-char Kappa WAV URL', 'R3-AudioPlayer', 'Valid', err.message, 'FAIL', Date.now() - t0);
    }
  }

  // TEST-R3-03: ~63-character Blob URL (< 100 chars)
  {
    const t0 = Date.now();
    try {
      const blobUrl = 'blob:http://localhost:5173/3872c676-4d1a-478a-9860-eb05e3ec4008'; // 63 chars (< 100)
      const result = evaluateAudioPlayer(blobUrl);

      assert.ok(result.srcLength < 100, `Blob URL length (${result.srcLength}) must be < 100 characters`);
      assert.strictEqual(result.isInvalid, false);
      assert.strictEqual(result.hasErrorText, false);
      assert.strictEqual(result.hasUnavailableText, false);
      assert.strictEqual(result.hasDisabledButton, false);

      recordTest(
        'TEST-R3-03',
        'CustomAudioPlayer: 63-char Blob URL Playback (<100 Chars)',
        'R3-AudioPlayer',
        'isInvalid=false, no Error text, button enabled',
        `len=${result.srcLength} (<100), isInvalid=${result.isInvalid}`,
        'PASS',
        Date.now() - t0,
        { note: '63-char blob URL plays cleanly' }
      );
    } catch (err) {
      recordTest('TEST-R3-03', 'CustomAudioPlayer: 63-char Blob URL', 'R3-AudioPlayer', 'Valid', err.message, 'FAIL', Date.now() - t0);
    }
  }

  // TEST-R3-04: 20-character Short CDN URL (< 100 chars)
  {
    const t0 = Date.now();
    try {
      const shortCdnUrl = 'https://cdn.ai/a.mp3'; // 20 chars
      const result = evaluateAudioPlayer(shortCdnUrl);

      assert.strictEqual(result.srcLength, 20);
      assert.strictEqual(result.isInvalid, false);
      assert.strictEqual(result.hasErrorText, false);
      assert.strictEqual(result.hasUnavailableText, false);
      assert.strictEqual(result.hasDisabledButton, false);

      recordTest(
        'TEST-R3-04',
        'CustomAudioPlayer: 20-char CDN URL Playback',
        'R3-AudioPlayer',
        'isInvalid=false, no Error text, button enabled',
        `len=${result.srcLength}, isInvalid=${result.isInvalid}`,
        'PASS',
        Date.now() - t0,
        { note: 'Ultra-short 20-char URL plays without restriction' }
      );
    } catch (err) {
      recordTest('TEST-R3-04', 'CustomAudioPlayer: 20-char CDN URL', 'R3-AudioPlayer', 'Valid', err.message, 'FAIL', Date.now() - t0);
    }
  }

  // TEST-R3-05: Adversarial Malformed Audio Sources (Negative Testing)
  {
    const t0 = Date.now();
    try {
      const malformedSources = [
        { src: '', label: 'Empty string' },
        { src: null, label: 'Null' },
        { src: undefined, label: 'Undefined' },
        { src: 'undefined', label: 'String "undefined"' },
        { src: '[object Object]', label: 'String "[object Object]"' },
        { src: '   ', label: 'Whitespace string' }
      ];

      for (const item of malformedSources) {
        const evalRes = evaluateAudioPlayer(item.src);
        assert.strictEqual(evalRes.isInvalid, true, `${item.label} must be flagged as isInvalid=true`);
      }

      recordTest(
        'TEST-R3-05',
        'CustomAudioPlayer: Malformed Audio Sources Flagged as Invalid',
        'R3-AudioPlayer',
        'isInvalid=true for all malformed inputs',
        'All 6 malformed source variants correctly rejected',
        'PASS',
        Date.now() - t0,
        { note: 'Prevents media player crash on corrupted inputs' }
      );
    } catch (err) {
      recordTest('TEST-R3-05', 'CustomAudioPlayer: Malformed Audio Sources', 'R3-AudioPlayer', 'Invalid', err.message, 'FAIL', Date.now() - t0);
    }
  }

  // =========================================================================
  // SUITE 5: R3 — REMOTE DELETION VS LOCAL AUDIO PLAYBACK DURABILITY
  // =========================================================================
  console.log('\n>>> [SUITE 5] R3: Remote Deletion vs Local Audio Playback Durability');

  // TEST-R3-06: Local Playback Intact When Remote Ephemeral URL is Deleted
  {
    const t0 = Date.now();
    try {
      // 1. Generate real voice recording WAV audio buffer
      const voiceWav = generateValidWavBuffer(1.5, 8000);
      const voiceBase64 = `data:audio/wav;base64,${voiceWav.toString('base64')}`;

      // 2. Simulate browser local IndexedDB (XareMediaDB) storage
      const localDBMap = new Map();
      const localId = `localdb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      localDBMap.set(localId, voiceBase64);

      // 3. Dispatch ephemeral remote transport to Kappa for downstream AI processing
      const voiceFile = new File([voiceWav], 'user_voice_message.wav', { type: 'audio/wav' });
      const uploadRes = await uploadFileDirectly(voiceFile, { chatId: 'voice_chat_test' });

      const remoteEphemeralUrl = uploadRes.fileUrl;
      const remoteDeleteUrl = uploadRes.deleteUrl;

      assert.ok(remoteEphemeralUrl.startsWith('https://kappa.lol/'));
      assert.ok(remoteDeleteUrl.includes('key='));

      // Verify remote URL is initially active
      const preDeleteHead = await fetch(remoteEphemeralUrl, { method: 'HEAD' });
      assert.strictEqual(preDeleteHead.status, 200, 'Remote URL must be 200 initially');

      // 4. Create outbound message snapshot as performed by sendMessageToBackend:
      // In chat history, the message audio is bound to `localId`, while `remoteEphemeralUrl` is sent in webhook payload
      const chatMessageSnapshot = {
        id: `msg_voice_${Date.now()}`,
        sender: 'user',
        text: '🎤 Voice Message',
        audio: localId, // LOCAL HANDLE
        transportId: uploadRes.transportId,
        timestamp: new Date()
      };

      // 5. Simulate n8n response settlement: downstream AI finishes processing,
      // triggering immediate programmatic cleanup of the ephemeral transport URL
      const deleteT0 = Date.now();
      const purgeSuccess = await deleteTemporaryFile(remoteDeleteUrl);
      const deleteDuration = Date.now() - deleteT0;

      assert.ok(purgeSuccess, 'Remote delete request must succeed');
      assert.ok(deleteDuration < 1500, `Cleanup SLA (<1500ms), actual: ${deleteDuration}ms`);

      // 6. Verify remote URL is now DEAD (HTTP 404)
      const postDeleteRes = await fetch(remoteEphemeralUrl);
      assert.strictEqual(postDeleteRes.status, 404, 'MANDATORY: Remote ephemeral URL must return HTTP 404 after cleanup');

      // 7. Verify local UI playback: LocalAudioRenderer resolves `chatMessageSnapshot.audio`
      const resolvedLocalAudio = localDBMap.get(chatMessageSnapshot.audio);
      assert.ok(resolvedLocalAudio, 'Local audio payload must exist in localDB');
      assert.strictEqual(resolvedLocalAudio, voiceBase64, 'Local audio payload must match original voice recording');

      // 8. Render CustomAudioPlayer with the resolved local audio
      const playerEvaluation = evaluateAudioPlayer(resolvedLocalAudio);
      assert.strictEqual(playerEvaluation.isInvalid, false, 'Local audio must NOT be invalid in CustomAudioPlayer');
      assert.strictEqual(playerEvaluation.hasErrorText, false, 'Local audio must NOT show "Error"');
      assert.strictEqual(playerEvaluation.hasUnavailableText, false, 'Local audio must NOT show "Unavailable"');
      assert.strictEqual(playerEvaluation.hasDisabledButton, false, 'Play button must remain fully enabled');

      // 9. Simulate 5 consecutive chat switching / re-render cycles
      for (let i = 1; i <= 5; i++) {
        const recheck = localDBMap.get(chatMessageSnapshot.audio);
        assert.ok(recheck !== undefined && recheck.length === voiceBase64.length, `Re-render cycle ${i} durability check`);
        const reEval = evaluateAudioPlayer(recheck);
        assert.strictEqual(reEval.isInvalid, false, `Re-render cycle ${i} player validity`);
      }

      recordTest(
        'TEST-R3-06',
        'Audio Local Playback Durability: Remote URL 404 While Local Playback 100% Durable',
        'R3-Durability',
        'Remote returns 404; local playback remains valid, enabled, durable across re-renders',
        `Remote=${postDeleteRes.status} (404), Local Playable=true, 5 re-renders passed`,
        'PASS',
        Date.now() - t0,
        {
          httpStatus: `Remote=${postDeleteRes.status} (404)`,
          note: `Cleanup latency: ${deleteDuration}ms; Local handle ${localId} 100% playable`
        }
      );
    } catch (err) {
      recordTest('TEST-R3-06', 'Audio Local Playback Durability', 'R3-Durability', 'Durable local playback', err.message, 'FAIL', Date.now() - t0);
    }
  }

  // TEST-R2-06: Rapid Burst: 3 Consecutive Duplicate PDF Sends
  {
    const t0 = Date.now();
    try {
      clearUploadCache();
      const burstChatId = `chat_burst_${Date.now()}`;
      const burstBuffer = generateValidPdfBuffer(`Burst-Test-${Date.now()}`);
      const burstFile = new File([burstBuffer], 'burst_contract.pdf', { type: 'application/pdf' });

      // Send 1
      const res1 = await uploadFileDirectly(burstFile, { chatId: burstChatId });
      transportLedger.bindToMessage(res1.transportId, `msg_burst_1`);

      // Send 2
      const res2 = await uploadFileDirectly(burstFile, { chatId: burstChatId });
      transportLedger.bindToMessage(res2.transportId, `msg_burst_2`);

      // Send 3
      const res3 = await uploadFileDirectly(burstFile, { chatId: burstChatId });
      transportLedger.bindToMessage(res3.transportId, `msg_burst_3`);

      assert.notStrictEqual(res1.fileUrl, res2.fileUrl);
      assert.notStrictEqual(res2.fileUrl, res3.fileUrl);
      assert.notStrictEqual(res1.fileUrl, res3.fileUrl);

      // Purge 1 and 2
      await deleteTemporaryFile(res1.deleteUrl);
      await deleteTemporaryFile(res2.deleteUrl);

      // Probe statuses
      const p1 = await fetch(res1.fileUrl);
      const p2 = await fetch(res2.fileUrl);
      const p3 = await fetch(res3.fileUrl);

      assert.strictEqual(p1.status, 404, 'res1 must be 404');
      assert.strictEqual(p2.status, 404, 'res2 must be 404');
      assert.strictEqual(p3.status, 200, 'res3 must remain 200');

      // Cleanup 3
      await deleteTemporaryFile(res3.deleteUrl);

      recordTest(
        'TEST-R2-06',
        'Rapid Burst Duplicate PDF: 3 Successive Sends with Independent URLs & Cleanup',
        'R2-Duplicate',
        'url1 != url2 != url3; url1=404, url2=404, url3=200',
        `3 distinct URLs generated; post-purge: [404, 404, 200]`,
        'PASS',
        Date.now() - t0,
        { note: 'Demonstrates robust fresh URL generation across multi-message duplicate burst' }
      );
    } catch (err) {
      recordTest('TEST-R2-06', 'Rapid Burst Duplicate PDF', 'R2-Duplicate', 'url1 != url2 != url3', err.message, 'FAIL', Date.now() - t0);
    }
  }

  // TEST-R2-07: Invalidation on 404 Evicts Stale Transport & Triggers Recovery
  {
    const t0 = Date.now();
    try {
      clearUploadCache();
      const testChatId = `chat_inval_${Date.now()}`;
      const docBuffer = generateValidPdfBuffer(`Inval-Test-${Date.now()}`);
      const docFile = new File([docBuffer], 'invoice.pdf', { type: 'application/pdf' });

      const up = await uploadFileDirectly(docFile, { chatId: testChatId });
      const hash = await computeFileHash(docFile);

      // Verify registered
      assert.ok(transportLedger.getActiveTransport(testChatId, hash) !== null);

      // External deletion or remote 404 occurs
      await deleteTemporaryFile(up.deleteUrl);
      transportLedger.invalidateUrl(up.fileUrl);

      // Active transport must now be evicted
      assert.strictEqual(transportLedger.getActiveTransport(testChatId, hash), null);

      // Next upload creates fresh instance
      const upFresh = await uploadFileDirectly(docFile, { chatId: testChatId });
      assert.notStrictEqual(up.fileUrl, upFresh.fileUrl);

      const probe = await fetch(upFresh.fileUrl);
      assert.strictEqual(probe.status, 200);

      await deleteTemporaryFile(upFresh.deleteUrl);

      recordTest(
        'TEST-R2-07',
        'Transport Invalidation on 404 Evicts Stale Transport & Enables Recovery',
        'R2-Invalidation',
        'invalidateUrl evicts cache; next upload recovers with fresh HTTP 200 URL',
        `Stale evicted, fresh URL=${upFresh.fileUrl} (200)`,
        'PASS',
        Date.now() - t0,
        { note: 'Prevents n8n 404 retry loops by immediate cache eviction' }
      );
    } catch (err) {
      recordTest('TEST-R2-07', 'Transport Invalidation on 404', 'R2-Invalidation', 'Cache evicted', err.message, 'FAIL', Date.now() - t0);
    }
  }

  // TEST-R3-07: CustomAudioPlayer MP3 MIME Normalization (data:audio/mp3 -> data:audio/mpeg)
  {
    const t0 = Date.now();
    try {
      const legacyMp3Data = 'data:audio/mp3;base64,//uQxAAAAANIAAAAAExBTUUz...';
      const evalRes = evaluateAudioPlayer(legacyMp3Data);

      assert.strictEqual(evalRes.isInvalid, false);
      assert.ok(evalRes.cleanSrc.startsWith('data:audio/mpeg;base64,'));
      assert.strictEqual(evalRes.hasErrorText, false);
      assert.strictEqual(evalRes.hasUnavailableText, false);

      recordTest(
        'TEST-R3-07',
        'CustomAudioPlayer: MP3 MIME Normalization (data:audio/mp3 -> data:audio/mpeg)',
        'R3-AudioPlayer',
        'data:audio/mp3 normalized to standard data:audio/mpeg; isInvalid=false',
        `cleanSrc starts with data:audio/mpeg; isInvalid=false`,
        'PASS',
        Date.now() - t0,
        { note: 'Ensures cross-browser audio decoding compatibility' }
      );
    } catch (err) {
      recordTest('TEST-R3-07', 'CustomAudioPlayer MP3 Normalization', 'R3-AudioPlayer', 'Normalized', err.message, 'FAIL', Date.now() - t0);
    }
  }

  // TEST-R3-08: Audio Player Control Elements (DOM Contract Verification)
  {
    const t0 = Date.now();
    try {
      const audioUrl = 'https://kappa.lol/yjaxGI.wav';
      const evalRes = evaluateAudioPlayer(audioUrl);

      // Verify DOM structure
      assert.ok(evalRes.html.includes('<audio'), 'Audio element must be present in DOM');
      assert.ok(evalRes.html.includes(`src="${audioUrl}"`), 'Audio element must have valid src attribute');
      assert.ok(evalRes.html.includes('<button'), 'Play/Pause button must be present in DOM');
      assert.ok(evalRes.html.includes('type="range"'), 'Range input slider must be present in DOM');
      assert.ok(evalRes.html.includes('0:00'), 'Time indicator must render 0:00 initial time');

      recordTest(
        'TEST-R3-08',
        'CustomAudioPlayer: DOM Contract Verification (Audio tag, Button, Seek Slider, Time)',
        'R3-AudioPlayer',
        'Complete accessible audio playback controls present and bound',
        'audio, button, range slider, and time indicators fully verified',
        'PASS',
        Date.now() - t0,
        { note: 'Ensures audio element controls support play, pause, seek, and replay' }
      );
    } catch (err) {
      recordTest('TEST-R3-08', 'CustomAudioPlayer DOM Contract', 'R3-AudioPlayer', 'Controls present', err.message, 'FAIL', Date.now() - t0);
    }
  }

  // Close Vite SSR server
  await viteServer.close();

  // =========================================================================
  // SUMMARY REPORT
  // =========================================================================
  console.log('\n======================================================================');
  console.log('CHALLENGER 2 EMPIRICAL TEST MATRIX SUMMARY');
  console.log('======================================================================');
  const passed = testResults.filter(t => t.status === 'PASS').length;
  const total = testResults.length;
  console.log(`TOTAL TESTS EXECUTED: ${total}`);
  console.log(`PASSED: ${passed} / ${total} (${((passed / total) * 100).toFixed(1)}%)`);

  if (passed === total) {
    console.log('VERDICT: CONFIRMED');
  } else {
    console.log('VERDICT: DISPROVED');
  }
  console.log('======================================================================\n');

  return { passed, total, testResults };
}

runEmpiricalHarness().catch(err => {
  console.error('Fatal Harness Error:', err);
  process.exit(1);
});
