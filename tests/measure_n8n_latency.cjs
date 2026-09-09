async function testN8nLatency() {
  console.log('Testing n8n network latency to Hugging Face Spaces...');
  const times = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    try {
      const res = await fetch('https://aliiis-24-7-n8n.hf.space/webhook/xare-ai-v2-guALIharika', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-chatbot-token': 'ali1234' },
        body: JSON.stringify({
          sessionId: 'test_latency_session',
          userId: 'test_latency_user',
          message: 'ping test',
          action: 'chat',
          timestamp: new Date().toISOString()
        })
      });
      const t1 = Date.now();
      times.push(t1 - t0);
      console.log('Probe ' + (i + 1) + ': status=' + res.status + ' in ' + (t1 - t0) + 'ms');
    } catch(e) {
      console.log('Probe ' + (i + 1) + ' failed:', e.message);
    }
  }
  const avg = times.reduce((a,b)=>a+b, 0) / times.length;
  console.log('Average n8n HF Space round-trip time: ' + avg.toFixed(1) + 'ms');
}
testN8nLatency();
