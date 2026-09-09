/**
 * Adversarial Concurrency Stress Testing Harness for Xare AI Ephemeral File Transport
 * 
 * Simulates rapid-succession concurrent workloads:
 * - Phase 1: 2 Concurrent Files (Image + PDF)
 * - Phase 2: 3 Concurrent Files (Image + PDF + Audio)
 * - Phase 3: 5 Concurrent Files Under Rapid Succession (Diverse multimodal files)
 * 
 * Validates:
 * - Distinct URLs and programmatic delete keys (zero state collisions)
 * - Cryptographic SHA-256 checksum integrity of retrieved binaries
 * - Zero unhandled promise rejections or race condition anomalies
 * - Rapid concurrent deletion SLA (< 500 ms per deletion)
 * - Post-deletion HTTP 404 verification across all purged files
 */

const assert = require('assert');
const crypto = require('crypto');
const { performance } = require('perf_hooks');

// Track unhandled promise rejections aggressively
let unhandledRejectionCount = 0;
const unhandledRejections = [];
process.on('unhandledRejection', (reason, promise) => {
  unhandledRejectionCount++;
  unhandledRejections.push({ reason, promise });
  console.error('❌ [CRITICAL UNHANDLED REJECTION]:', reason);
});

// Test results accumulator
const testResults = [];

function recordResult(phase, testName, expected, actual, passed, durationMs, details = {}) {
  testResults.push({ phase, testName, expected, actual, passed, durationMs, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${phase}] ${testName} (${durationMs.toFixed(1)}ms): ${passed ? 'PASS' : 'FAIL'}`);
  if (details.note) console.log(`   Note: ${details.note}`);
  if (!passed && details.error) console.log(`   Error: ${details.error}`);
}

// SHA-256 helper
function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Payload generators with distinct unique contents
function createPngBuffer(label = 'test') {
  // Minimal valid 1x1 PNG with metadata comment to make checksum distinct
  const uniqueId = crypto.randomBytes(16).toString('hex');
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const rawPng = Buffer.from(base64, 'base64');
  // Append trailing comment / unique bytes to ensure distinct hash
  const marker = Buffer.from(`\n# XARE-AI-${label}-${uniqueId}\n`);
  return Buffer.concat([rawPng, marker]);
}

function createPdfBuffer(title = 'Sample Document') {
  const docId = crypto.randomBytes(12).toString('hex');
  const pdfString = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 80 >> stream
BT
/F1 24 Tf
100 700 Td
(${title} - ${docId}) Tj
ET
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000234 00000 n 
0000000366 00000 n 
trailer << /Root 1 0 R /Size 6 >>
startxref
437
%%EOF`;
  return Buffer.from(pdfString);
}

function createLargePdfBuffer(targetSizeBytes = 2 * 1024 * 1024) {
  const header = Buffer.from('%PDF-1.4\n%âãÏÓ\n');
  const paddingSize = Math.max(0, targetSizeBytes - header.length - 20);
  const padding = Buffer.alloc(paddingSize, 0x20); // whitespace padding
  const trailer = Buffer.from('\n%%EOF\n');
  return Buffer.concat([header, padding, trailer]);
}

function createWavBuffer(durationSeconds = 1, freq = 440) {
  const sampleRate = 8000;
  const numSamples = Math.floor(sampleRate * durationSeconds);
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
    const t = i / sampleRate;
    const val = 128 + Math.floor(120 * Math.sin(2 * Math.PI * freq * t));
    buffer.writeUInt8(val, 44 + i);
  }
  return buffer;
}

function createTextBuffer(description = 'Data file') {
  const uniqueId = crypto.randomBytes(32).toString('hex');
  return Buffer.from(`Xare AI Ephemeral Concurrency Payload: ${description}\nUUID: ${uniqueId}\nTimestamp: ${new Date().toISOString()}\n`);
}

// Core upload function simulating transport upload
async function uploadToTransport(fileBuffer, filename, mimeType, maxRetries = 1) {
  const f = new FormData();
  f.append('file', new Blob([fileBuffer], { type: mimeType }), filename);

  const tStart = performance.now();
  const res = await fetch('https://kappa.lol/api/upload', {
    method: 'POST',
    headers: {
      'Origin': 'https://xare-ai.vercel.app',
      'User-Agent': 'XareAI-Challenger-ConcurrencyStress/1.0'
    },
    body: f
  });
  const tUpload = performance.now() - tStart;

  if (res.status === 429 && maxRetries > 0) {
    console.warn(`   ⚠️ [RATE_LIMIT_429] Received 429 for '${filename}', backing off 1200ms...`);
    await new Promise(r => setTimeout(r, 1200));
    return uploadToTransport(fileBuffer, filename, mimeType, maxRetries - 1);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();
  const directUrl = data.link + (data.ext && !data.link.endsWith(data.ext) ? data.ext : '');
  const deleteUrl = data.key ? `https://kappa.lol/api/delete?key=${data.key}` : undefined;

  return {
    filename,
    mimeType,
    size: fileBuffer.length,
    originalHash: sha256(fileBuffer),
    id: data.id,
    key: data.key,
    directUrl,
    deleteUrl,
    uploadDurationMs: tUpload,
    rawResponse: data
  };
}

// Download and verify integrity
async function verifyBinaryChecksum(uploadInfo) {
  const tStart = performance.now();
  const res = await fetch(uploadInfo.directUrl, {
    headers: { 'Cache-Control': 'no-cache' }
  });
  const tDownload = performance.now() - tStart;

  if (!res.ok) {
    throw new Error(`GET ${uploadInfo.directUrl} returned HTTP ${res.status}`);
  }

  const ab = await res.arrayBuffer();
  const downloadedBuf = Buffer.from(ab);
  const downloadedHash = sha256(downloadedBuf);

  const matched = downloadedHash === uploadInfo.originalHash;
  const sizeMatched = downloadedBuf.length === uploadInfo.size;

  return {
    filename: uploadInfo.filename,
    directUrl: uploadInfo.directUrl,
    downloadDurationMs: tDownload,
    originalHash: uploadInfo.originalHash,
    downloadedHash,
    matched,
    originalSize: uploadInfo.size,
    downloadedSize: downloadedBuf.length,
    sizeMatched,
    contentType: res.headers.get('content-type')
  };
}

// Programmatic deletion
async function executeProgrammaticDeletion(uploadInfo) {
  const tStart = performance.now();
  const res = await fetch(uploadInfo.deleteUrl, { method: 'GET' });
  const tDelete = performance.now() - tStart;

  if (!res.ok) {
    return {
      filename: uploadInfo.filename,
      deleteUrl: uploadInfo.deleteUrl,
      durationMs: tDelete,
      success: false,
      status: res.status,
      error: `HTTP ${res.status}`
    };
  }

  let json = {};
  try {
    json = await res.json();
  } catch (e) {}

  return {
    filename: uploadInfo.filename,
    deleteUrl: uploadInfo.deleteUrl,
    durationMs: tDelete,
    success: json.success === true || res.ok,
    status: res.status,
    response: json
  };
}

// Post-deletion 404 verification
async function verifyPostDeletion404(uploadInfo) {
  const tStart = performance.now();
  const res = await fetch(uploadInfo.directUrl, {
    method: 'GET',
    headers: { 'Cache-Control': 'no-cache, no-store' }
  });
  const tDuration = performance.now() - tStart;

  return {
    filename: uploadInfo.filename,
    directUrl: uploadInfo.directUrl,
    status: res.status,
    is404: res.status === 404,
    durationMs: tDuration
  };
}

// =========================================================================
// MAIN CONCURRENCY STRESS SUITE
// =========================================================================

async function runConcurrencyStressSuite() {
  console.log('======================================================================');
  console.log('XARE AI ADVERSARIAL CONCURRENCY STRESS TESTING HARNESS');
  console.log('Target: Zero-Cost Ephemeral Transport Under Rapid Succession');
  console.log('Workloads: 2 files, 3 files, and 5 files simultaneously');
  console.log('======================================================================\n');

  const suiteStartTime = performance.now();

  // -----------------------------------------------------------------------
  // PHASE 1: 2 CONCURRENT FILES (Image + PDF)
  // -----------------------------------------------------------------------
  console.log('>>> [PHASE 1] Simulating 2 Concurrent File Uploads (Image + PDF)...');
  const phase1Files = [
    { name: 'stress_image_p1.png', mime: 'image/png', buffer: createPngBuffer('p1') },
    { name: 'stress_contract_p1.pdf', mime: 'application/pdf', buffer: createPdfBuffer('Phase 1 Contract') }
  ];

  let p1Uploads = [];
  const t0_p1 = performance.now();
  try {
    p1Uploads = await Promise.all(
      phase1Files.map(f => uploadToTransport(f.buffer, f.name, f.mime))
    );
    const p1Duration = performance.now() - t0_p1;
    recordResult('PHASE-1-CONCURRENCY-2', '2 Simultaneous Uploads Completion', 'All 2 completed', `2/2 completed in ${p1Duration.toFixed(1)}ms`, true, p1Duration);
  } catch (err) {
    recordResult('PHASE-1-CONCURRENCY-2', '2 Simultaneous Uploads Completion', 'All 2 completed', err.message, false, performance.now() - t0_p1, { error: err.message });
  }

  if (p1Uploads.length === 2) {
    // Check URL uniqueness
    const urls = p1Uploads.map(u => u.directUrl);
    const keys = p1Uploads.map(u => u.key);
    const urlsUnique = new Set(urls).size === 2;
    const keysUnique = new Set(keys).size === 2;
    recordResult('PHASE-1-CONCURRENCY-2', 'Distinct URL and Key Generation', '2 distinct URLs & keys', `URLs unique: ${urlsUnique}, Keys unique: ${keysUnique}`, urlsUnique && keysUnique, 0, {
      note: `URLs: ${urls.join(', ')}`
    });

    // Check SHA-256 Checksum Integrity concurrently
    const t0_p1_dl = performance.now();
    const p1Verifications = await Promise.all(p1Uploads.map(u => verifyBinaryChecksum(u)));
    const p1ChecksumAllValid = p1Verifications.every(v => v.matched && v.sizeMatched);
    recordResult('PHASE-1-CONCURRENCY-2', 'Concurrent Checksum & Payload Integrity', '100% SHA-256 match', `${p1Verifications.filter(v => v.matched).length}/2 matched`, p1ChecksumAllValid, performance.now() - t0_p1_dl, {
      note: p1Verifications.map(v => `${v.filename}: ${v.matched ? 'MATCH' : 'MISMATCH'} (${v.downloadedSize} bytes)`).join('; ')
    });

    // Concurrently delete both files
    const t0_p1_del = performance.now();
    const p1Deletions = await Promise.all(p1Uploads.map(u => executeProgrammaticDeletion(u)));
    const p1DelTime = performance.now() - t0_p1_del;
    const p1AllSub500 = p1Deletions.every(d => d.durationMs < 500 && d.success);
    recordResult('PHASE-1-CONCURRENCY-2', 'Concurrent Deletion SLA (<500ms)', 'All < 500ms & success', `Max deletion: ${Math.max(...p1Deletions.map(d => d.durationMs)).toFixed(1)}ms, All <500ms: ${p1AllSub500}`, p1AllSub500, p1DelTime, {
      note: p1Deletions.map(d => `${d.filename}: ${d.durationMs.toFixed(1)}ms (HTTP ${d.status})`).join('; ')
    });

    // Concurrently verify post-deletion HTTP 404
    const t0_p1_404 = performance.now();
    const p1404s = await Promise.all(p1Uploads.map(u => verifyPostDeletion404(u)));
    const p1All404 = p1404s.every(r => r.is404);
    recordResult('PHASE-1-CONCURRENCY-2', 'Post-Deletion HTTP 404 Purge Proof', 'All return HTTP 404', `HTTP 404: ${p1404s.filter(r => r.is404).length}/2`, p1All404, performance.now() - t0_p1_404, {
      note: p1404s.map(r => `${r.filename}: HTTP ${r.status}`).join('; ')
    });
  }

  console.log('\n----------------------------------------------------------------------');

  // -----------------------------------------------------------------------
  // PHASE 2: 3 CONCURRENT FILES (Image + PDF + Audio)
  // -----------------------------------------------------------------------
  console.log('>>> [PHASE 2] Simulating 3 Concurrent File Uploads (Image + PDF + Audio)...');
  const phase2Files = [
    { name: 'stress_image_p2.png', mime: 'image/png', buffer: createPngBuffer('p2') },
    { name: 'stress_doc_p2.pdf', mime: 'application/pdf', buffer: createPdfBuffer('Phase 2 Document') },
    { name: 'stress_voice_p2.wav', mime: 'audio/wav', buffer: createWavBuffer(1.5, 520) }
  ];

  let p2Uploads = [];
  const t0_p2 = performance.now();
  try {
    p2Uploads = await Promise.all(
      phase2Files.map(f => uploadToTransport(f.buffer, f.name, f.mime))
    );
    const p2Duration = performance.now() - t0_p2;
    recordResult('PHASE-2-CONCURRENCY-3', '3 Simultaneous Uploads Completion', 'All 3 completed', `3/3 completed in ${p2Duration.toFixed(1)}ms`, true, p2Duration);
  } catch (err) {
    recordResult('PHASE-2-CONCURRENCY-3', '3 Simultaneous Uploads Completion', 'All 3 completed', err.message, false, performance.now() - t0_p2, { error: err.message });
  }

  if (p2Uploads.length === 3) {
    // Check URL and key uniqueness
    const urls = p2Uploads.map(u => u.directUrl);
    const keys = p2Uploads.map(u => u.key);
    const urlsUnique = new Set(urls).size === 3;
    const keysUnique = new Set(keys).size === 3;
    recordResult('PHASE-2-CONCURRENCY-3', 'Distinct URL and Key Generation', '3 distinct URLs & keys', `URLs unique: ${urlsUnique}, Keys unique: ${keysUnique}`, urlsUnique && keysUnique, 0, {
      note: `URLs: ${urls.join(', ')}`
    });

    // Check SHA-256 Checksum Integrity concurrently
    const t0_p2_dl = performance.now();
    const p2Verifications = await Promise.all(p2Uploads.map(u => verifyBinaryChecksum(u)));
    const p2ChecksumAllValid = p2Verifications.every(v => v.matched && v.sizeMatched);
    recordResult('PHASE-2-CONCURRENCY-3', 'Concurrent Checksum & Payload Integrity', '100% SHA-256 match', `${p2Verifications.filter(v => v.matched).length}/3 matched`, p2ChecksumAllValid, performance.now() - t0_p2_dl, {
      note: p2Verifications.map(v => `${v.filename}: ${v.matched ? 'MATCH' : 'MISMATCH'} (${v.downloadedSize} bytes)`).join('; ')
    });

    // Concurrently delete all 3 files
    const t0_p2_del = performance.now();
    const p2Deletions = await Promise.all(p2Uploads.map(u => executeProgrammaticDeletion(u)));
    const p2DelTime = performance.now() - t0_p2_del;
    const p2AllSub500 = p2Deletions.every(d => d.durationMs < 500 && d.success);
    recordResult('PHASE-2-CONCURRENCY-3', 'Concurrent Deletion SLA (<500ms)', 'All < 500ms & success', `Max deletion: ${Math.max(...p2Deletions.map(d => d.durationMs)).toFixed(1)}ms, All <500ms: ${p2AllSub500}`, p2AllSub500, p2DelTime, {
      note: p2Deletions.map(d => `${d.filename}: ${d.durationMs.toFixed(1)}ms (HTTP ${d.status})`).join('; ')
    });

    // Concurrently verify post-deletion HTTP 404
    const t0_p2_404 = performance.now();
    const p2404s = await Promise.all(p2Uploads.map(u => verifyPostDeletion404(u)));
    const p2All404 = p2404s.every(r => r.is404);
    recordResult('PHASE-2-CONCURRENCY-3', 'Post-Deletion HTTP 404 Purge Proof', 'All return HTTP 404', `HTTP 404: ${p2404s.filter(r => r.is404).length}/3`, p2All404, performance.now() - t0_p2_404, {
      note: p2404s.map(r => `${r.filename}: HTTP ${r.status}`).join('; ')
    });
  }

  console.log('\n----------------------------------------------------------------------');

  // -----------------------------------------------------------------------
  // PHASE 3: 5 CONCURRENT FILES UNDER RAPID SUCCESSION
  // -----------------------------------------------------------------------
  console.log('>>> [PHASE 3] Simulating 5 Concurrent File Uploads Under Rapid Succession...');
  const phase3Files = [
    { name: 'stress_image_alpha.png', mime: 'image/png', buffer: createPngBuffer('alpha') },
    { name: 'stress_doc_beta.pdf', mime: 'application/pdf', buffer: createPdfBuffer('Alpha Document') },
    { name: 'stress_voice_gamma.wav', mime: 'audio/wav', buffer: createWavBuffer(2, 600) },
    { name: 'stress_report_delta.pdf', mime: 'application/pdf', buffer: createPdfBuffer('Delta Audit Report') },
    { name: 'stress_notes_epsilon.txt', mime: 'text/plain', buffer: createTextBuffer('Rapid Burst 5 Epsilon') }
  ];

  let p3Uploads = [];
  const t0_p3 = performance.now();
  try {
    p3Uploads = await Promise.all(
      phase3Files.map(f => uploadToTransport(f.buffer, f.name, f.mime))
    );
    const p3Duration = performance.now() - t0_p3;
    recordResult('PHASE-3-CONCURRENCY-5', '5 Simultaneous Burst Uploads Completion', 'All 5 completed', `5/5 completed in ${p3Duration.toFixed(1)}ms`, true, p3Duration);
  } catch (err) {
    recordResult('PHASE-3-CONCURRENCY-5', '5 Simultaneous Burst Uploads Completion', 'All 5 completed', err.message, false, performance.now() - t0_p3, { error: err.message });
  }

  if (p3Uploads.length === 5) {
    // Check URL and key uniqueness across all 5 files
    const urls = p3Uploads.map(u => u.directUrl);
    const keys = p3Uploads.map(u => u.key);
    const urlsUnique = new Set(urls).size === 5;
    const keysUnique = new Set(keys).size === 5;
    recordResult('PHASE-3-CONCURRENCY-5', 'Distinct URL and Key Generation (5 Files)', '5 distinct URLs & keys', `URLs unique: ${urlsUnique} (${urls.length}), Keys unique: ${keysUnique}`, urlsUnique && keysUnique, 0, {
      note: `Unique endpoints verified across 5 concurrent bursts`
    });

    // Check SHA-256 Checksum Integrity concurrently for all 5 files
    const t0_p3_dl = performance.now();
    const p3Verifications = await Promise.all(p3Uploads.map(u => verifyBinaryChecksum(u)));
    const p3ChecksumAllValid = p3Verifications.every(v => v.matched && v.sizeMatched);
    recordResult('PHASE-3-CONCURRENCY-5', 'Concurrent Checksum & Payload Integrity (5 Files)', '100% SHA-256 match', `${p3Verifications.filter(v => v.matched).length}/5 matched`, p3ChecksumAllValid, performance.now() - t0_p3_dl, {
      note: p3Verifications.map(v => `${v.filename}: ${v.matched ? 'MATCH' : 'MISMATCH'}`).join('; ')
    });

    // Concurrently delete all 5 files simultaneously
    const t0_p3_del = performance.now();
    const p3Deletions = await Promise.all(p3Uploads.map(u => executeProgrammaticDeletion(u)));
    const p3DelTime = performance.now() - t0_p3_del;
    const p3AllSub500 = p3Deletions.every(d => d.durationMs < 500 && d.success);
    const maxDelDuration = Math.max(...p3Deletions.map(d => d.durationMs));
    const avgDelDuration = p3Deletions.reduce((acc, d) => acc + d.durationMs, 0) / p3Deletions.length;
    recordResult('PHASE-3-CONCURRENCY-5', 'Concurrent Deletion SLA (<500ms for 5 Files)', 'All 5 < 500ms & success', `Max: ${maxDelDuration.toFixed(1)}ms, Avg: ${avgDelDuration.toFixed(1)}ms, All <500ms: ${p3AllSub500}`, p3AllSub500, p3DelTime, {
      note: p3Deletions.map(d => `${d.filename}: ${d.durationMs.toFixed(1)}ms (HTTP ${d.status})`).join('; ')
    });

    // Concurrently verify post-deletion HTTP 404 for all 5 files
    const t0_p3_404 = performance.now();
    const p3404s = await Promise.all(p3Uploads.map(u => verifyPostDeletion404(u)));
    const p3All404 = p3404s.every(r => r.is404);
    recordResult('PHASE-3-CONCURRENCY-5', 'Post-Deletion HTTP 404 Purge Proof (5 Files)', 'All 5 return HTTP 404', `HTTP 404: ${p3404s.filter(r => r.is404).length}/5`, p3All404, performance.now() - t0_p3_404, {
      note: p3404s.map(r => `${r.filename}: HTTP ${r.status}`).join('; ')
    });
  }

  console.log('\n----------------------------------------------------------------------');

  // -----------------------------------------------------------------------
  // PHASE 5: IDENTICAL-FILE SIMULTANEOUS BURST CONCURRENCY
  // -----------------------------------------------------------------------
  console.log('>>> [PHASE 5] Simulating Identical File Ingress Under Simultaneous Concurrency...');
  const identicalBuf = createPngBuffer('identical-test');
  const identicalFiles = [
    { name: 'duplicate_copy_1.png', mime: 'image/png', buffer: identicalBuf },
    { name: 'duplicate_copy_2.png', mime: 'image/png', buffer: identicalBuf },
    { name: 'duplicate_copy_3.png', mime: 'image/png', buffer: identicalBuf }
  ];

  let p5Uploads = [];
  const t0_p5 = performance.now();
  try {
    p5Uploads = await Promise.all(
      identicalFiles.map(f => uploadToTransport(f.buffer, f.name, f.mime))
    );
    const p5Duration = performance.now() - t0_p5;
    recordResult('PHASE-5-IDENTICAL-BURST', 'Simultaneous Duplicate File Uploads', 'All 3 completed', `3/3 completed in ${p5Duration.toFixed(1)}ms`, true, p5Duration);
  } catch (err) {
    recordResult('PHASE-5-IDENTICAL-BURST', 'Simultaneous Duplicate File Uploads', 'All 3 completed', err.message, false, performance.now() - t0_p5, { error: err.message });
  }

  if (p5Uploads.length === 3) {
    const urls = p5Uploads.map(u => u.directUrl);
    const keys = p5Uploads.map(u => u.key);
    const urlsUnique = new Set(urls).size === 3;
    const keysUnique = new Set(keys).size === 3;
    recordResult('PHASE-5-IDENTICAL-BURST', 'Isolation of Concurrent Duplicate Uploads', '3 distinct URLs & keys', `URLs unique: ${urlsUnique}, Keys unique: ${keysUnique}`, urlsUnique && keysUnique, 0, {
      note: `Duplicate payloads receive distinct endpoints: ${urls.join(', ')}`
    });

    // Concurrently verify post-upload integrity
    const p5Verifications = await Promise.all(p5Uploads.map(u => verifyBinaryChecksum(u)));
    const p5ChecksumAllValid = p5Verifications.every(v => v.matched && v.sizeMatched);
    recordResult('PHASE-5-IDENTICAL-BURST', 'Duplicate Payloads Checksum Integrity', '100% SHA-256 match', `${p5Verifications.filter(v => v.matched).length}/3 matched`, p5ChecksumAllValid, 0);

    // Concurrently purge all 3 duplicates
    const p5Deletions = await Promise.all(p5Uploads.map(u => executeProgrammaticDeletion(u)));
    const p5AllSub500 = p5Deletions.every(d => d.durationMs < 500 && d.success);
    recordResult('PHASE-5-IDENTICAL-BURST', 'Duplicate Payloads Deletion SLA (<500ms)', 'All < 500ms', `All <500ms: ${p5AllSub500}`, p5AllSub500, 0);

    // Concurrently verify 404
    const p5404s = await Promise.all(p5Uploads.map(u => verifyPostDeletion404(u)));
    const p5All404 = p5404s.every(r => r.is404);
    recordResult('PHASE-5-IDENTICAL-BURST', 'Duplicate Payloads 404 Verification', 'All 404', `All 404: ${p5All404}`, p5All404, 0);
  }

  console.log('\n----------------------------------------------------------------------');

  // -----------------------------------------------------------------------
  // PHASE 6: MIXED SIZES CONCURRENCY STRESS (1MB Image + 2MB PDF + 1MB Audio)
  // -----------------------------------------------------------------------
  console.log('>>> [PHASE 6] Simulating Multi-Megabyte Concurrent Streams (1MB Image + 2MB PDF + 1MB Audio)...');
  const p6Files = [
    { name: 'large_image_1mb.jpg', mime: 'image/jpeg', buffer: Buffer.alloc(1024 * 1024, 0x41) },
    { name: 'large_doc_2mb.pdf', mime: 'application/pdf', buffer: createLargePdfBuffer(2 * 1024 * 1024) },
    { name: 'large_audio_1mb.wav', mime: 'audio/wav', buffer: createWavBuffer(128, 440) } // ~1MB
  ];

  let p6Uploads = [];
  const t0_p6 = performance.now();
  try {
    p6Uploads = await Promise.all(
      p6Files.map(f => uploadToTransport(f.buffer, f.name, f.mime))
    );
    const p6Duration = performance.now() - t0_p6;
    recordResult('PHASE-6-MULTI-MEGABYTE', 'Multi-MB Concurrent Uploads Completion', 'All 3 completed', `3/3 completed in ${p6Duration.toFixed(1)}ms (${(p6Files.reduce((a, b) => a + b.buffer.length, 0) / (1024*1024)).toFixed(1)} MB total)`, true, p6Duration);
  } catch (err) {
    recordResult('PHASE-6-MULTI-MEGABYTE', 'Multi-MB Concurrent Uploads Completion', 'All 3 completed', err.message, false, performance.now() - t0_p6, { error: err.message });
  }

  if (p6Uploads.length === 3) {
    const urls = p6Uploads.map(u => u.directUrl);
    const urlsUnique = new Set(urls).size === 3;
    recordResult('PHASE-6-MULTI-MEGABYTE', 'Distinct URLs for Multi-MB Concurrent Uploads', '3 distinct URLs', `URLs unique: ${urlsUnique}`, urlsUnique, 0);

    // Concurrently download and check checksums
    const p6Verifications = await Promise.all(p6Uploads.map(u => verifyBinaryChecksum(u)));
    const p6ChecksumAllValid = p6Verifications.every(v => v.matched && v.sizeMatched);
    recordResult('PHASE-6-MULTI-MEGABYTE', 'Multi-MB Checksum & Payload Integrity', '100% SHA-256 match', `${p6Verifications.filter(v => v.matched).length}/3 matched`, p6ChecksumAllValid, 0, {
      note: p6Verifications.map(v => `${v.filename}: ${v.matched ? 'MATCH' : 'MISMATCH'} (${(v.downloadedSize/(1024*1024)).toFixed(2)} MB)`).join('; ')
    });

    // Concurrently delete all multi-MB files
    const t0_p6_del = performance.now();
    const p6Deletions = await Promise.all(p6Uploads.map(u => executeProgrammaticDeletion(u)));
    const p6AllSub500 = p6Deletions.every(d => d.durationMs < 500 && d.success);
    recordResult('PHASE-6-MULTI-MEGABYTE', 'Multi-MB Concurrent Deletion SLA (<500ms)', 'All < 500ms', `Max: ${Math.max(...p6Deletions.map(d => d.durationMs)).toFixed(1)}ms, All <500ms: ${p6AllSub500}`, p6AllSub500, performance.now() - t0_p6_del, {
      note: p6Deletions.map(d => `${d.filename}: ${d.durationMs.toFixed(1)}ms (HTTP ${d.status})`).join('; ')
    });

    // Concurrently verify 404
    const p6404s = await Promise.all(p6Uploads.map(u => verifyPostDeletion404(u)));
    const p6All404 = p6404s.every(r => r.is404);
    recordResult('PHASE-6-MULTI-MEGABYTE', 'Multi-MB Post-Deletion HTTP 404 Verification', 'All 404', `All 404: ${p6All404}`, p6All404, 0);
  }

  console.log('\n----------------------------------------------------------------------');

  // -----------------------------------------------------------------------
  // PHASE 7: ZERO UNHANDLED REJECTION AUDIT & RACE CONDITION INVENTORY
  // -----------------------------------------------------------------------
  console.log('>>> [PHASE 7] Auditing Process Stability & Promise Rejection Boundaries...');
  const hasZeroUnhandled = unhandledRejectionCount === 0;
  recordResult('PHASE-7-STABILITY', 'Zero Unhandled Promise Rejections', '0 unhandled rejections', `Detected: ${unhandledRejectionCount}`, hasZeroUnhandled, 0, {
    note: hasZeroUnhandled ? 'No asynchronous leaks detected' : JSON.stringify(unhandledRejections)
  });

  const totalDuration = performance.now() - suiteStartTime;
  const passedCount = testResults.filter(t => t.passed).length;
  const totalCount = testResults.length;

  console.log('\n======================================================================');
  console.log(`STRESS TEST SUMMARY: ${passedCount} PASSED / ${totalCount} TOTAL (Duration: ${totalDuration.toFixed(1)}ms)`);
  console.log(`VERDICT: ${passedCount === totalCount && hasZeroUnhandled ? 'APPROVED' : 'REJECTED'}`);
  console.log('======================================================================\n');

  if (passedCount !== totalCount || !hasZeroUnhandled) {
    process.exitCode = 1;
  }
}

runConcurrencyStressSuite().catch(err => {
  console.error('Fatal crash in stress test suite:', err);
  process.exitCode = 1;
});
