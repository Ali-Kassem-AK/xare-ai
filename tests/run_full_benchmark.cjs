const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// Create synthetic file buffers
function createSyntheticFile(sizeBytes, type) {
  const buf = Buffer.alloc(sizeBytes);
  if (type === 'image') {
    // JPEG magic bytes: FF D8 FF E0 ...
    buf[0] = 0xFF; buf[1] = 0xD8; buf[2] = 0xFF; buf[3] = 0xE0;
    buf[sizeBytes - 2] = 0xFF; buf[sizeBytes - 1] = 0xD9; // EOI
  } else if (type === 'pdf') {
    // PDF magic bytes: %PDF-1.4 ... %%EOF
    buf.write('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', 0);
    buf.write('\n%%EOF\n', sizeBytes - 10);
  } else if (type === 'audio') {
    // RIFF WAV magic bytes
    buf.write('RIFF', 0);
    buf.writeUInt32LE(sizeBytes - 8, 4);
    buf.write('WAVEfmt ', 8);
    buf.writeUInt32LE(16, 16); // subchunk size
    buf.writeUInt16LE(1, 20);  // PCM format
    buf.writeUInt16LE(1, 22);  // mono
    buf.writeUInt32LE(44100, 24); // sample rate
    buf.writeUInt32LE(88200, 28); // byte rate
    buf.writeUInt16LE(2, 32);  // block align
    buf.writeUInt16LE(16, 34); // bits per sample
    buf.write('data', 36);
    buf.writeUInt32LE(sizeBytes - 44, 40);
  }
  return buf;
}

async function measureUploadToKappa(fileBuf, filename, mimeType) {
  const t0 = Date.now();
  const fd = new FormData();
  fd.append('file', new Blob([fileBuf], { type: mimeType }), filename);
  const t1 = Date.now();
  const res = await fetch('https://kappa.lol/api/upload', {
    method: 'POST',
    body: fd,
    headers: { 'Origin': 'https://xare-ai.vercel.app' }
  });
  const t2 = Date.now();
  const json = await res.json().catch(() => ({}));
  const t3 = Date.now();
  return {
    status: res.status,
    uploadTimeMs: t2 - t1,
    urlReadyMs: t3 - t0,
    url: json.link,
    deleteKey: json.key,
    sizeBytes: fileBuf.length,
    success: res.ok && Boolean(json.link)
  };
}

async function measureUploadToLitterbox(fileBuf, filename, mimeType) {
  const t0 = Date.now();
  const fd = new FormData();
  fd.append('reqtype', 'fileupload');
  fd.append('time', '1h');
  fd.append('fileToUpload', new Blob([fileBuf], { type: mimeType }), filename);
  const t1 = Date.now();
  const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST',
    body: fd,
    headers: { 'Origin': 'https://xare-ai.vercel.app' }
  });
  const t2 = Date.now();
  const text = (await res.text()).trim();
  const t3 = Date.now();
  const isUrl = text.startsWith('http');
  return {
    status: res.status,
    uploadTimeMs: t2 - t1,
    urlReadyMs: t3 - t0,
    url: isUrl ? text : null,
    sizeBytes: fileBuf.length,
    success: res.ok && isUrl
  };
}

async function measureDownload(url) {
  const t0 = Date.now();
  const res = await fetch(url);
  const reader = res.body.getReader();
  let receivedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.length;
  }
  const t1 = Date.now();
  return {
    downloadTimeMs: t1 - t0,
    receivedBytes,
    status: res.status,
    contentType: res.headers.get('content-type')
  };
}

async function deleteFromKappa(deleteKey) {
  if (!deleteKey) return false;
  try {
    const res = await fetch('https://kappa.lol/api/delete?key=' + deleteKey);
    const j = await res.json().catch(() => ({}));
    return res.ok && j.success;
  } catch (e) {
    return false;
  }
}

async function runBenchmark() {
  console.log('=== STARTING MULTI-SIZE BENCHMARK ===');
  const sizes = [
    { label: '1 MB', bytes: 1 * 1024 * 1024, type: 'image', ext: 'jpg', mime: 'image/jpeg' },
    { label: '5 MB', bytes: 5 * 1024 * 1024, type: 'image', ext: 'png', mime: 'image/png' },
    { label: '10 MB', bytes: 10 * 1024 * 1024, type: 'pdf', ext: 'pdf', mime: 'application/pdf' },
    { label: '20 MB', bytes: 20 * 1024 * 1024, type: 'audio', ext: 'wav', mime: 'audio/wav' },
    { label: '30 MB', bytes: 30 * 1024 * 1024, type: 'pdf', ext: 'pdf', mime: 'application/pdf' },
    { label: '50 MB', bytes: 50 * 1024 * 1024, type: 'audio', ext: 'wav', mime: 'audio/wav' }
  ];

  const results = [];

  for (const item of sizes) {
    console.log(`\n--- Benchmarking ${item.label} (${item.type}) ---`);
    const fileBuf = createSyntheticFile(item.bytes, item.type);
    const filename = `benchmark_${item.label.replace(' ', '')}.${item.ext}`;

    // Test Kappa
    console.log(`Uploading ${item.label} to Kappa.lol...`);
    const kappaUp = await measureUploadToKappa(fileBuf, filename, item.mime).catch(e => ({ error: e.message }));
    console.log('Kappa upload result:', kappaUp.success ? `SUCCESS in ${kappaUp.uploadTimeMs}ms` : `FAILED: ${kappaUp.error || kappaUp.status}`);

    let kappaDown = null;
    if (kappaUp.success && kappaUp.url) {
      console.log(`Downloading ${item.label} from Kappa.lol...`);
      kappaDown = await measureDownload(kappaUp.url).catch(e => ({ error: e.message }));
      console.log('Kappa download result:', kappaDown.receivedBytes ? `Received ${kappaDown.receivedBytes} bytes in ${kappaDown.downloadTimeMs}ms` : `FAILED: ${kappaDown.error}`);
      
      // Test Deletion
      const delOk = await deleteFromKappa(kappaUp.deleteKey);
      console.log('Kappa delete result:', delOk ? 'Purged 200' : 'Failed');
    }

    // Test Litterbox
    console.log(`Uploading ${item.label} to Litterbox...`);
    const litterUp = await measureUploadToLitterbox(fileBuf, filename, item.mime).catch(e => ({ error: e.message }));
    console.log('Litterbox upload result:', litterUp.success ? `SUCCESS in ${litterUp.uploadTimeMs}ms` : `FAILED: ${litterUp.error || litterUp.status}`);

    let litterDown = null;
    if (litterUp.success && litterUp.url) {
      console.log(`Downloading ${item.label} from Litterbox...`);
      litterDown = await measureDownload(litterUp.url).catch(e => ({ error: e.message }));
      console.log('Litterbox download result:', litterDown.receivedBytes ? `Received ${litterDown.receivedBytes} bytes in ${litterDown.downloadTimeMs}ms` : `FAILED: ${litterDown.error}`);
    }

    results.push({
      size: item.label,
      sizeBytes: item.bytes,
      type: item.type,
      kappa: { upload: kappaUp, download: kappaDown },
      litterbox: { upload: litterUp, download: litterDown }
    });
  }

  fs.writeFileSync('benchmark_results.json', JSON.stringify(results, null, 2));
  console.log('\n=== BENCHMARK COMPLETE — SAVED benchmark_results.json ===');
}

runBenchmark();
