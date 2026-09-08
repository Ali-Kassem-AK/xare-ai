const fs = require('fs');

async function test() {
  const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const samplePngBuffer = Buffer.from(samplePngBase64, 'base64');
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

  const parts = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="photo"\r\n\r\ntrue\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="mediaType"\r\n\r\nimage\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="mimeType"\r\n\r\nimage/png\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="fileName"\r\n\r\npixel.png\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="data"; filename="pixel.png"\r\nContent-Type: image/png\r\n\r\n`
    ),
    samplePngBuffer,
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
  console.log('Body:', await res.text());
}
test();
