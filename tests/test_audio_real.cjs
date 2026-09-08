const fs = require('fs');

async function test() {
  const oggRes = await fetch('https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg');
  const oggBuffer = Buffer.from(await oggRes.arrayBuffer());
  console.log('Downloaded real speech ogg, size:', oggBuffer.length, 'bytes');

  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const parts = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="sessionId"\r\n\r\nsession_test_voice\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="userId"\r\n\r\nuser_test_voice\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="taskId"\r\n\r\ntask_test_voice\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="voice"\r\n\r\ntrue\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="mediaType"\r\n\r\naudio\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="mimeType"\r\n\r\naudio/ogg\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="fileName"\r\n\r\nExample.oga\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="data"; filename="Example.oga"\r\nContent-Type: audio/ogg\r\n\r\n`
    ),
    oggBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ];
  const body = Buffer.concat(parts);

  const t0 = Date.now();
  const res = await fetch('https://aliiis-24-7-n8n.hf.space/webhook/xare-ai-v2-guALIharika', {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'x-chatbot-token': 'ali1234'
    },
    body: body
  });
  console.log('Status:', res.status, 'Time:', Date.now() - t0, 'ms');
  const text = await res.text();
  console.log('Response length:', text.length);
  console.log('Response snippet:', text.substring(0, 300));
}
test();
