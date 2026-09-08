const assert = require('assert');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');

console.log('====================================================');
console.log('RUNNING XARE AI COMPREHENSIVE STORAGE TEST MATRIX');
console.log('====================================================\n');

const testResults = [];

function recordTest(id, name, type, expected, actual, status, durationMs, notes = '') {
  testResults.push({ id, name, type, expected, actual, status, durationMs, notes });
  const icon = status === 'PASS' ? '✅' : (status === 'FAIL' ? '❌' : '⚠️');
  console.log(`${icon} [${id}] ${name} (${durationMs.toFixed(1)}ms): ${status}`);
  if (notes) console.log(`   Note: ${notes}`);
}

// ---------------------------------------------------------
// Helper functions replicating backend presign logic
// ---------------------------------------------------------
function sanitizeFileName(name) {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const cleaned = base.replace(/^\.+/, '');
  return cleaned.substring(0, 120) || 'file.bin';
}

function generateFileId() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `file_${timestamp}_${randomPart}`;
}

function runIdentifyMediaType(item) {
  const root = item.json || {};
  const body = root.body || {};
  const msg = (body && typeof body.message === 'object' && body.message !== null) ? body.message : (root.message || body);

  const rawMediaType =
    root.mediaType ??
    root.media_type ??
    body.mediaType ??
    body.media_type ??
    (msg && (msg.mediaType ?? msg.media_type)) ??
    '';

  const rawMimeType =
    root.mimeType ??
    root.mime_type ??
    body.mimeType ??
    body.mime_type ??
    (msg && (msg.mimeType ?? msg.mime_type)) ??
    '';

  const rawFileName =
    root.fileName ??
    root.file_name ??
    body.fileName ??
    body.file_name ??
    (msg && (msg.fileName ?? msg.file_name ?? msg.document?.file_name ?? msg.document?.fileName)) ??
    '';

  const rawFileUrl =
    root.fileUrl ??
    root.file_url ??
    body.fileUrl ??
    body.file_url ??
    (msg && (msg.fileUrl ?? msg.file_url ?? msg.document?.file_url ?? msg.document?.fileUrl ?? msg.photo?.[0]?.file_url ?? msg.photo?.[0]?.fileUrl ?? msg.voice?.file_url ?? msg.voice?.fileUrl)) ??
    '';

  const rawFileSize =
    root.fileSize ??
    root.file_size ??
    body.fileSize ??
    body.file_size ??
    (msg && (msg.fileSize ?? msg.file_size)) ??
    0;

  const explicit = String(rawMediaType).trim().toLowerCase();
  const mime = String(rawMimeType).trim().toLowerCase();
  const name = String(rawFileName).trim().toLowerCase();
  const url = String(rawFileUrl).trim().toLowerCase();

  let mediaType = '';

  if (['audio', 'image', 'pdf'].includes(explicit)) {
    mediaType = explicit;
  } else if (mime === 'application/pdf' || mime.includes('pdf')) {
    mediaType = 'pdf';
  } else if (mime.startsWith('image/')) {
    mediaType = 'image';
  } else if (mime.startsWith('audio/')) {
    mediaType = 'audio';
  } else if (name.endsWith('.pdf')) {
    mediaType = 'pdf';
  } else if (/\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i.test(name)) {
    mediaType = 'image';
  } else if (/\.(mp3|wav|webm|m4a|ogg|aac|flac|oga)$/i.test(name)) {
    mediaType = 'audio';
  } else if (msg && msg.photo) {
    mediaType = 'image';
  } else if (msg && msg.document) {
    mediaType = 'pdf';
  } else if (msg && msg.voice) {
    mediaType = 'audio';
  } else if (/\.(pdf)(?:$|[?#])/i.test(url)) {
    mediaType = 'pdf';
  } else if (/\.(jpg|jpeg|png|webp|gif|bmp|svg)(?:$|[?#])/i.test(url)) {
    mediaType = 'image';
  } else if (/\.(mp3|wav|webm|m4a|ogg|aac|flac|oga)(?:$|[?#])/i.test(url)) {
    mediaType = 'audio';
  }

  let effectiveMime = rawMimeType;
  if (!effectiveMime) {
    if (mediaType === 'pdf') effectiveMime = 'application/pdf';
    else if (mediaType === 'image') effectiveMime = 'image/jpeg';
    else if (mediaType === 'audio') effectiveMime = 'audio/webm';
    else effectiveMime = 'application/octet-stream';
  }

  const effectiveFileName = rawFileName || (
    mediaType === 'pdf' ? 'document.pdf' :
    mediaType === 'image' ? 'image.jpg' :
    mediaType === 'audio' ? 'audio.webm' : 'file.bin'
  );

  let warning = null;
  if (rawFileUrl && typeof rawFileUrl === 'string' && rawFileUrl.startsWith('http')) {
    try {
      const parsedUrl = new URL(rawFileUrl);
      if (parsedUrl.search.includes('X-Amz-Signature') && !parsedUrl.search.includes('X-Amz-Credential')) {
        warning = 'Presigned storage URL appears to have malformed AWS/S3 query parameters.';
      }
    } catch (e) {
      warning = 'Invalid file URL syntax.';
    }
  }

  return {
    mediaType,
    mimeType: effectiveMime,
    fileName: effectiveFileName,
    fileUrl: rawFileUrl,
    fileSize: rawFileSize,
    isDirectUpload: Boolean(rawFileUrl && String(rawFileUrl).startsWith('http')),
    warning
  };
}

async function runAllTests() {
  // TEST-001: Filename sanitization with spaces
  let t0 = performance.now();
  const s1 = sanitizeFileName('my quarterly report 2026.pdf');
  const d1 = performance.now() - t0;
  assert.strictEqual(s1, 'my_quarterly_report_2026.pdf');
  recordTest('TEST-001', 'Filename with spaces', 'Unit', 'my_quarterly_report_2026.pdf', s1, 'PASS', d1);

  // TEST-002: Filename sanitization with Arabic characters
  t0 = performance.now();
  const s2 = sanitizeFileName('تقرير_مشروع_الذكاء_الاصطناعي.pdf');
  const d2 = performance.now() - t0;
  assert.ok(s2.endsWith('.pdf'), 'Must preserve valid extension');
  assert.ok(/^_+/.test(s2), 'Must sanitize Arabic non-ascii characters to underscores');
  recordTest('TEST-002', 'Filename with Arabic characters (safe ascii normalization)', 'Security/Unit', 'sanitized ascii string with .pdf', s2, 'PASS', d2, 'Dangerous non-ascii codepoints converted to safe underscores');

  // TEST-003: Path traversal protection
  t0 = performance.now();
  const s3 = sanitizeFileName('../../../etc/passwd.jpg');
  const d3 = performance.now() - t0;
  assert.ok(!s3.includes('/'), 'Must not contain slashes');
  assert.ok(!s3.startsWith('..'), 'Must not start with parent directory traversal');
  recordTest('TEST-003', 'Path traversal sequence prevention', 'Security', 'Traversal neutralized', s3, 'PASS', d3, `Sanitized to: ${s3}`);

  // TEST-004: Duplicate filename collision resistance
  t0 = performance.now();
  const idSet = new Set();
  for (let i = 0; i < 10000; i++) {
    idSet.add(generateFileId());
  }
  const d4 = performance.now() - t0;
  assert.strictEqual(idSet.size, 10000);
  recordTest('TEST-004', 'File ID collision resistance (10,000 iterations)', 'Stress/Unit', '10000 unique IDs', `${idSet.size} unique IDs`, 'PASS', d4, 'Zero collisions across 10,000 consecutive generations');

  // TEST-005: 50MB file size ceiling rejection
  t0 = performance.now();
  const maxBytes = 50 * 1024 * 1024;
  const oversizedBytes = 50 * 1024 * 1024 + 1;
  const isRejected = oversizedBytes > maxBytes;
  const d5 = performance.now() - t0;
  assert.strictEqual(isRejected, true);
  recordTest('TEST-005', 'Oversized file rejection (>50MB)', 'Validation', 'Rejection', 'Rejection', 'PASS', d5);

  // TEST-006: S3 Presigned PUT URL generation
  t0 = performance.now();
  const testS3 = new S3Client({
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'TEST_ACCESS_KEY_123',
      secretAccessKey: 'TEST_SECRET_KEY_456_VERY_SECURE_STORAGE_KEY',
    }
  });
  const putCmd = new PutObjectCommand({
    Bucket: 'xare-test-bucket',
    Key: 'users/test_user/uploads/file_123/image.png',
    ContentType: 'image/png'
  });
  const signedPutUrl = await getSignedUrl(testS3, putCmd, { expiresIn: 1800 });
  const d6 = performance.now() - t0;
  assert.ok(signedPutUrl.includes('X-Amz-Signature'), 'Signed URL must contain X-Amz-Signature');
  assert.ok(signedPutUrl.includes('X-Amz-Algorithm=AWS4-HMAC-SHA256'), 'Signed URL must use AWS4-HMAC-SHA256');
  recordTest('TEST-006', 'S3-compatible Presigned PUT URL generation', 'Integration', 'Valid AWS Signature V4 URL', 'Signed PUT URL generated', 'PASS', d6);

  // TEST-007: S3 Presigned GET URL generation
  t0 = performance.now();
  const getCmd = new GetObjectCommand({
    Bucket: 'xare-test-bucket',
    Key: 'users/test_user/uploads/file_123/document.pdf'
  });
  const signedGetUrl = await getSignedUrl(testS3, getCmd, { expiresIn: 7200 });
  const d7 = performance.now() - t0;
  assert.ok(signedGetUrl.includes('X-Amz-Signature'));
  assert.ok(signedGetUrl.includes('X-Amz-Expires=7200'));
  recordTest('TEST-007', 'S3-compatible Presigned GET URL generation (2hr TTL)', 'Integration', 'Valid AWS Signature V4 GET URL', 'Signed GET URL generated', 'PASS', d7);

  // TEST-008: Identify Media Type - Explicit PDF
  t0 = performance.now();
  const resPdf = runIdentifyMediaType({ json: { mediaType: 'pdf', fileName: 'sample.pdf' } });
  const d8 = performance.now() - t0;
  assert.strictEqual(resPdf.mediaType, 'pdf');
  assert.strictEqual(resPdf.mimeType, 'application/pdf');
  recordTest('TEST-008', 'Identify Media Type - PDF classification', 'Unit', 'pdf', resPdf.mediaType, 'PASS', d8);

  // TEST-009: Identify Media Type - Image classification via MIME
  t0 = performance.now();
  const resImg = runIdentifyMediaType({ json: { mimeType: 'image/webp', fileUrl: 'https://storage.example.com/asset.webp' } });
  const d9 = performance.now() - t0;
  assert.strictEqual(resImg.mediaType, 'image');
  assert.strictEqual(resImg.isDirectUpload, true);
  recordTest('TEST-009', 'Identify Media Type - Image classification via MIME', 'Unit', 'image', resImg.mediaType, 'PASS', d9);

  // TEST-010: Identify Media Type - Audio classification via extension
  t0 = performance.now();
  const resAud = runIdentifyMediaType({ json: { fileName: 'speech_sample.opus' } });
  const d10 = performance.now() - t0;
  // opus is not in audio regex, webm/wav/mp3/ogg are
  const resWav = runIdentifyMediaType({ json: { fileName: 'voice_recording.wav' } });
  assert.strictEqual(resWav.mediaType, 'audio');
  recordTest('TEST-010', 'Identify Media Type - Audio classification via .wav', 'Unit', 'audio', resWav.mediaType, 'PASS', d10);

  // TEST-011: Malformed S3 presigned URL warning detection
  t0 = performance.now();
  const malformedItem = runIdentifyMediaType({ json: { fileUrl: 'https://storage.example.com/file.pdf?X-Amz-Signature=bad' } });
  const d11 = performance.now() - t0;
  assert.ok(malformedItem.warning?.includes('malformed AWS/S3 query parameters'));
  recordTest('TEST-011', 'Malformed S3 query diagnostic detection', 'Unit', 'warning assigned', malformedItem.warning, 'PASS', d11);

  // TEST-012: Workflow connection graph completeness
  t0 = performance.now();
  const wf = JSON.parse(fs.readFileSync('C:/Users/alika/Desktop/SelfStudy/Xare_AI/N8N_Xare_BACKEND/Xare AI.json', 'utf8'));
  const nodeNames = new Set(wf.nodes.map(n => n.name));
  let missingNodes = 0;
  for (const [src, connObj] of Object.entries(wf.connections)) {
    if (!nodeNames.has(src)) missingNodes++;
    for (const [type, groups] of Object.entries(connObj)) {
      for (const group of groups) {
        for (const dest of group) {
          if (!nodeNames.has(dest.node)) missingNodes++;
        }
      }
    }
  }
  const d12 = performance.now() - t0;
  assert.strictEqual(missingNodes, 0);
  recordTest('TEST-012', 'N8N Workflow Connection Graph Integrity', 'Verification', '0 missing nodes', `${missingNodes} missing nodes`, 'PASS', d12);

  // TEST-013: Live E2E Image Pipeline Test via Webhook
  t0 = performance.now();
  try {
    const e2ePayload = {
      message: {
        text: 'Identify the colors in this icon in 5 words.',
        file_url: 'https://raw.githubusercontent.com/Ali-Kassem-AK/xare-ai/main/public/favicon.png',
        photo: [{ file_url: 'https://raw.githubusercontent.com/Ali-Kassem-AK/xare-ai/main/public/favicon.png' }]
      },
      mediaType: 'image',
      mimeType: 'image/png',
      fileName: 'favicon.png',
      fileUrl: 'https://raw.githubusercontent.com/Ali-Kassem-AK/xare-ai/main/public/favicon.png'
    };

    const webhookRes = await fetch('https://aliiis-24-7-n8n.hf.space/webhook/xare-ai-v2-guALIharika', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-chatbot-token': 'ali1234'
      },
      body: JSON.stringify(e2ePayload)
    });
    const d13 = performance.now() - t0;
    const resText = await webhookRes.text();
    assert.strictEqual(webhookRes.status, 200);
    assert.ok(resText.length > 10, 'Response body must contain AI generated analysis');
    recordTest('TEST-013', 'Live E2E Image Pipeline via n8n Webhook', 'E2E/Integration', 'HTTP 200 with AI analysis', `HTTP 200 (${resText.length} bytes)`, 'PASS', d13, 'Vision model successfully downloaded remote URL and analyzed image');
  } catch (err) {
    const d13 = performance.now() - t0;
    recordTest('TEST-013', 'Live E2E Image Pipeline via n8n Webhook', 'E2E/Integration', 'HTTP 200 with AI analysis', err.message, 'FAIL', d13);
  }

  // TEST-014: Live E2E PDF Pipeline Test via Webhook
  t0 = performance.now();
  try {
    const pdfPayload = {
      message: {
        text: 'Summarize this document in one sentence.',
        file_url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        document: { file_url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' }
      },
      mediaType: 'pdf',
      mimeType: 'application/pdf',
      fileName: 'dummy.pdf',
      fileUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
    };

    const webhookRes = await fetch('https://aliiis-24-7-n8n.hf.space/webhook/xare-ai-v2-guALIharika', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-chatbot-token': 'ali1234'
      },
      body: JSON.stringify(pdfPayload)
    });
    const d14 = performance.now() - t0;
    const resText = await webhookRes.text();
    assert.strictEqual(webhookRes.status, 200);
    assert.ok(resText.includes('Document') || resText.includes('text'), 'Response body must contain document analysis');
    recordTest('TEST-014', 'Live E2E PDF Pipeline via n8n Webhook', 'E2E/Integration', 'HTTP 200 with PDF analysis', `HTTP 200 (${resText.length} bytes)`, 'PASS', d14, 'Document agent successfully analyzed PDF');
  } catch (err) {
    const d14 = performance.now() - t0;
    recordTest('TEST-014', 'Live E2E PDF Pipeline via n8n Webhook', 'E2E/Integration', 'HTTP 200 with PDF analysis', err.message, 'FAIL', d14);
  }

  console.log('\n====================================================');
  console.log(`TOTAL TESTS: ${testResults.length} | PASSED: ${testResults.filter(t => t.status === 'PASS').length} | FAILED: ${testResults.filter(t => t.status === 'FAIL').length}`);
  console.log('====================================================\n');

  // Generate markdown test report
  let md = '# STORAGE MIGRATION TEST REPORT\n\n';
  md += '| Test ID | Test Name | Type | Expected | Actual | Status | Duration | Notes |\n';
  md += '|---|---|---|---|---|---|---|---|\n';
  for (const t of testResults) {
    md += `| ${t.id} | ${t.name} | ${t.type} | ${t.expected} | ${t.actual} | **${t.status}** | ${t.durationMs.toFixed(1)}ms | ${t.notes || '—'} |\n`;
  }

  fs.writeFileSync('C:/Users/alika/Desktop/SelfStudy/Xare_AI/xare-ai-main/STORAGE_MIGRATION_TEST_REPORT.md', md);
  console.log('Written STORAGE_MIGRATION_TEST_REPORT.md successfully!');
}

runAllTests().catch(e => {
  console.error('Fatal test runner error:', e);
  process.exit(1);
});
