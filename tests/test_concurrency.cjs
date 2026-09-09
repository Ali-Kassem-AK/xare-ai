const fs = require('fs');
const os = require('os');

function createSyntheticFile(sizeBytes) {
  const buf = Buffer.alloc(sizeBytes);
  buf[0] = 0xFF; buf[1] = 0xD8; buf[2] = 0xFF; buf[3] = 0xE0;
  buf[sizeBytes - 2] = 0xFF; buf[sizeBytes - 1] = 0xD9;
  return buf;
}

async function uploadOne(id, sizeBytes) {
  const fileBuf = createSyntheticFile(sizeBytes);
  const fd = new FormData();
  fd.append('file', new Blob([fileBuf], { type: 'image/jpeg' }), `concurrent_${id}.jpg`);
  const t0 = Date.now();
  try {
    const res = await fetch('https://kappa.lol/api/upload', {
      method: 'POST',
      body: fd,
      headers: { 'Origin': 'https://xare-ai.vercel.app' }
    });
    const t1 = Date.now();
    const json = await res.json().catch(() => ({}));
    return {
      id,
      status: res.status,
      latencyMs: t1 - t0,
      success: res.ok && Boolean(json.link),
      url: json.link,
      key: json.key
    };
  } catch (err) {
    return {
      id,
      status: 'error',
      latencyMs: Date.now() - t0,
      success: false,
      error: err.message
    };
  }
}

async function runConcurrencyLevel(concurrency, sizeBytes) {
  console.log(`\n--- Testing ${concurrency} Concurrent Uploads (${(sizeBytes / (1024*1024)).toFixed(1)} MB each) ---`);
  const memBefore = process.memoryUsage();
  const cpusBefore = os.cpus();
  const t0 = Date.now();

  const promises = [];
  for (let i = 0; i < concurrency; i++) {
    promises.push(uploadOne(i + 1, sizeBytes));
  }

  const results = await Promise.all(promises);
  const totalDuration = Date.now() - t0;
  const memAfter = process.memoryUsage();

  const successes = results.filter(r => r.success).length;
  const failures = results.filter(r => !r.success).length;
  const latencies = results.map(r => r.latencyMs);
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const maxLatency = Math.max(...latencies);
  const minLatency = Math.min(...latencies);

  // Clean up uploaded files
  for (const r of results) {
    if (r.key) {
      fetch(`https://kappa.lol/api/delete?key=${r.key}`).catch(() => {});
    }
  }

  const summary = {
    concurrency,
    fileSizeMb: sizeBytes / (1024 * 1024),
    totalDurationMs: totalDuration,
    successes,
    failures,
    successRate: `${((successes / concurrency) * 100).toFixed(1)}%`,
    avgLatencyMs: Math.round(avgLatency),
    minLatencyMs: minLatency,
    maxLatencyMs: maxLatency,
    heapUsedDeltaMb: ((memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024)).toFixed(2),
    rssDeltaMb: ((memAfter.rss - memBefore.rss) / (1024 * 1024)).toFixed(2),
    details: results
  };

  console.log(`Result: ${successes}/${concurrency} succeeded. Total batch time: ${totalDuration}ms, Avg: ${Math.round(avgLatency)}ms`);
  return summary;
}

async function runAllConcurrencyTests() {
  const moderateSize = 2 * 1024 * 1024; // 2 MB per file
  const report = [];

  report.push(await runConcurrencyLevel(2, moderateSize));
  report.push(await runConcurrencyLevel(3, moderateSize));
  report.push(await runConcurrencyLevel(5, moderateSize));

  fs.writeFileSync('concurrency_results.json', JSON.stringify(report, null, 2));
  console.log('\n=== CONCURRENCY TESTS COMPLETE — SAVED concurrency_results.json ===');
}

runAllConcurrencyTests();
