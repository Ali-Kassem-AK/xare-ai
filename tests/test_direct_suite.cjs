const fs = require('fs');
const assert = require('assert');

// -----------------------------------------------------------------------------
// XARE AI — DIRECT BINARY SUITE (TEST-DIRECT-001 through TEST-DIRECT-007)
// Plus Modality Tests (Image, PDF, Audio)
// -----------------------------------------------------------------------------

const WEBHOOK_URL = 'https://aliiis-24-7-n8n.hf.space/webhook/xare-ai-v2-guALIharika';
const CHATBOT_TOKEN = 'ali1234';

// Helper: Build a minimal valid PDF of specified approximate size
function createTestPdf(targetSizeBytes) {
  const header = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj\n4 0 obj<</Length ';
  const textContent = 'BT /F1 12 Tf 100 700 Td (Xare AI Zero Cost Direct Binary Test - Size ' + (targetSizeBytes / 1024 / 1024).toFixed(1) + 'MB) Tj ET\n';
  
  // Padding inside PDF stream
  const baseSize = 400;
  const paddingNeeded = Math.max(0, targetSizeBytes - baseSize);
  const paddingStream = Buffer.alloc(paddingNeeded, 0x20); // spaces
  const streamData = Buffer.concat([Buffer.from(textContent), paddingStream]);
  
  const mid = streamData.length + '>>stream\n';
  const postStream = '\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n0000000216 00000 n \ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n' + (400 + streamData.length) + '\n%%EOF';
  
  return Buffer.concat([Buffer.from(header), Buffer.from(mid), streamData, Buffer.from(postStream)]);
}

// Helper: Build a minimal valid uncompressed BMP/Image of specified size
function createTestBmp(targetSizeBytes) {
  // BMP 24-bit RGB
  const width = 1000;
  const rowBytes = Math.floor((width * 3 + 3) / 4) * 4;
  const neededRows = Math.max(1, Math.floor((targetSizeBytes - 54) / rowBytes));
  const pixelDataSize = neededRows * rowBytes;
  const totalFileSize = 54 + pixelDataSize;

  const header = Buffer.alloc(54);
  header.write('BM', 0); // Signature
  header.writeUInt32LE(totalFileSize, 2); // File size
  header.writeUInt32LE(54, 10); // Offset to pixel array
  header.writeUInt32LE(40, 14); // DIB Header size
  header.writeInt32LE(width, 18); // Width
  header.writeInt32LE(neededRows, 22); // Height
  header.writeUInt16LE(1, 26); // Color planes
  header.writeUInt16LE(24, 28); // Bits per pixel (24)
  header.writeUInt32LE(0, 30); // BI_RGB no compression
  header.writeUInt32LE(pixelDataSize, 34); // Image size

  const pixels = Buffer.alloc(pixelDataSize, 0x7F); // Gray pixels
  return Buffer.concat([header, pixels]);
}

// Helper: Build a minimal valid WAV of specified size
function createTestWav(targetSizeBytes) {
  const dataSize = Math.max(0, targetSizeBytes - 44);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // Mono
  header.writeUInt32LE(16000, 24); // 16kHz
  header.writeUInt32LE(32000, 28); // Byte rate (16000 * 2)
  header.writeUInt16LE(2, 32); // Block align
  header.writeUInt16LE(16, 34); // 16-bit
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  const audioData = Buffer.alloc(dataSize, 0); // Silence
  return Buffer.concat([header, audioData]);
}

async function sendMultipartRequest({ mediaType, mimeType, fileName, fileBuffer, promptText, timeoutMs = 60000 }) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

  // Determine media trigger property for Switch node:
  // Voice: voice=true
  // Image: photo=true
  // PDF: document=true
  let triggerFieldName = 'photo';
  if (mediaType === 'audio') triggerFieldName = 'voice';
  if (mediaType === 'pdf') triggerFieldName = 'document';

  const parts = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${triggerFieldName}"\r\n\r\ntrue\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="mediaType"\r\n\r\n${mediaType}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="mimeType"\r\n\r\n${mimeType}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="fileName"\r\n\r\n${fileName}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${promptText || 'Analyze this file'}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="data"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    ),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ];

  const body = Buffer.concat(parts);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const t0 = Date.now();
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'x-chatbot-token': CHATBOT_TOKEN
      },
      body: body,
      signal: controller.signal
    });
    clearTimeout(timeout);
    const duration = Date.now() - t0;
    const resText = await res.text();
    return {
      status: res.status,
      duration,
      body: resText,
      success: res.status === 200 && resText.length > 0
    };
  } catch (err) {
    clearTimeout(timeout);
    return {
      status: 0,
      duration: Date.now() - t0,
      error: err.name === 'AbortError' ? 'TIMEOUT' : err.message,
      success: false
    };
  }
}

async function runDirectTests() {
  console.log('================================================================');
  console.log('RUNNING OPTION A — DIRECT BINARY MULTIPART TEST SUITE');
  console.log('Testing 5MB, 10MB, 15MB, 20MB, 30MB, 40MB, 50MB');
  console.log('================================================================\n');

  const testMatrix = [
    { id: 'TEST-DIRECT-001', sizeMb: 5, mediaType: 'image', mimeType: 'image/bmp', ext: 'bmp', prompt: 'What color is this image?' },
    { id: 'TEST-DIRECT-002', sizeMb: 10, mediaType: 'pdf', mimeType: 'application/pdf', ext: 'pdf', prompt: 'What is written in this PDF?' },
    { id: 'TEST-DIRECT-003', sizeMb: 15, mediaType: 'pdf', mimeType: 'application/pdf', ext: 'pdf', prompt: 'Summarize this document.' },
    { id: 'TEST-DIRECT-004', sizeMb: 20, mediaType: 'audio', mimeType: 'audio/wav', ext: 'wav', prompt: 'Transcribe this voice message.' },
    { id: 'TEST-DIRECT-005', sizeMb: 30, mediaType: 'pdf', mimeType: 'application/pdf', ext: 'pdf', prompt: 'Analyze this large document.' },
    { id: 'TEST-DIRECT-006', sizeMb: 40, mediaType: 'pdf', mimeType: 'application/pdf', ext: 'pdf', prompt: 'Analyze this large document.' },
    { id: 'TEST-DIRECT-007', sizeMb: 50, mediaType: 'pdf', mimeType: 'application/pdf', ext: 'pdf', prompt: 'Analyze this maximum size document.' }
  ];

  const results = [];

  for (const test of testMatrix) {
    const targetBytes = test.sizeMb * 1024 * 1024;
    console.log(`\nExecuting ${test.id}: ${test.sizeMb} MB (${test.mediaType.toUpperCase()})...`);

    let buffer;
    if (test.mediaType === 'image') buffer = createTestBmp(targetBytes);
    else if (test.mediaType === 'audio') buffer = createTestWav(targetBytes);
    else buffer = createTestPdf(targetBytes);

    console.log(`Generated buffer of actual size ${(buffer.length / (1024 * 1024)).toFixed(2)} MB`);

    const res = await sendMultipartRequest({
      mediaType: test.mediaType,
      mimeType: test.mimeType,
      fileName: `test_${test.sizeMb}mb.${test.ext}`,
      fileBuffer: buffer,
      promptText: test.prompt,
      timeoutMs: 90000 // 90s timeout for large uploads
    });

    const statusBadge = res.success ? 'PASS' : (res.status === 200 ? 'PARTIAL_200_EMPTY' : 'FAIL');
    console.log(`Result ${test.id}: HTTP ${res.status}, Status=${statusBadge}, Duration=${res.duration}ms`);
    if (res.body) {
      console.log(`   Response snippet: ${res.body.substring(0, 180).replace(/\n/g, ' ')}`);
    } else if (res.error) {
      console.log(`   Error: ${res.error}`);
    }

    results.push({
      ...test,
      actualSizeBytes: buffer.length,
      httpStatus: res.status,
      durationMs: res.duration,
      responseSnippet: (res.body || res.error || '').substring(0, 200),
      status: statusBadge
    });
  }

  // Also run standard modality tests (small realistic files)
  console.log('\n================================================================');
  console.log('RUNNING MODALITY TESTS (REALISTIC SIZES)');
  console.log('================================================================\n');

  // Small realistic Image (PNG)
  console.log('Testing Real Image Modality (PNG)...');
  const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const imgRes = await sendMultipartRequest({
    mediaType: 'image',
    mimeType: 'image/png',
    fileName: 'icon.png',
    fileBuffer: Buffer.from(samplePngBase64, 'base64'),
    promptText: 'Describe this image color.',
    timeoutMs: 30000
  });
  console.log(`Image Modality Result: HTTP ${imgRes.status}, Time: ${imgRes.duration}ms, Success: ${imgRes.success}`);
  if (imgRes.body) console.log(`   Response: ${imgRes.body.substring(0, 150)}`);

  // Small realistic PDF
  console.log('\nTesting Real PDF Modality (PDF)...');
  const pdfRes = await sendMultipartRequest({
    mediaType: 'pdf',
    mimeType: 'application/pdf',
    fileName: 'sample_doc.pdf',
    fileBuffer: createTestPdf(100 * 1024), // 100 KB
    promptText: 'What is written in this document?',
    timeoutMs: 30000
  });
  console.log(`PDF Modality Result: HTTP ${pdfRes.status}, Time: ${pdfRes.duration}ms, Success: ${pdfRes.success}`);
  if (pdfRes.body) console.log(`   Response: ${pdfRes.body.substring(0, 150)}`);

  // Small realistic Audio (WAV)
  console.log('\nTesting Real Audio Modality (WAV)...');
  const audioRes = await sendMultipartRequest({
    mediaType: 'audio',
    mimeType: 'audio/wav',
    fileName: 'voice.wav',
    fileBuffer: createTestWav(50 * 1024), // 50 KB
    promptText: 'Listen to this voice message.',
    timeoutMs: 30000
  });
  console.log(`Audio Modality Result: HTTP ${audioRes.status}, Time: ${audioRes.duration}ms, Success: ${audioRes.success}`);
  if (audioRes.body) console.log(`   Response bytes: ${audioRes.body.length}`);

  // Write results JSON for audit
  fs.writeFileSync('tests/direct_suite_results.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    results,
    modalities: {
      image: { status: imgRes.status, durationMs: imgRes.duration, snippet: (imgRes.body || '').substring(0, 150) },
      pdf: { status: pdfRes.status, durationMs: pdfRes.duration, snippet: (pdfRes.body || '').substring(0, 150) },
      audio: { status: audioRes.status, durationMs: audioRes.duration, length: (audioRes.body || '').length }
    }
  }, null, 2));

  console.log('\nResults saved to tests/direct_suite_results.json');
}

runDirectTests().catch(err => {
  console.error('Fatal error running direct suite:', err);
});
