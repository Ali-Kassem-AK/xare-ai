const fs = require('fs');

async function testOptionB() {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const samplePngBuffer = Buffer.from(samplePngBase64, 'base64');
  
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="reqtype"\r\n\r\nfileupload\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="time"\r\n\r\n1h\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="fileToUpload"; filename="test_pixel.png"\r\nContent-Type: image/png\r\n\r\n`
    ),
    samplePngBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  const upRes = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body
  });
  const fileUrl = (await upRes.text()).trim();
  console.log('Uploaded to Litterbox:', fileUrl);

  const payload = {
    sessionId: 'session_test_litterbox',
    userId: 'user_test_litterbox',
    message: {
      caption: 'What color is this image from temporary URL?',
      photo: [{ file_url: fileUrl }]
    },
    mediaType: 'image',
    mimeType: 'image/png',
    fileName: 'test_pixel.png',
    fileUrl: fileUrl
  };

  const t0 = Date.now();
  const n8nRes = await fetch('https://aliiis-24-7-n8n.hf.space/webhook/xare-ai-v2-guALIharika', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-chatbot-token': 'ali1234' },
    body: JSON.stringify(payload)
  });
  console.log('n8n status:', n8nRes.status, 'in', Date.now() - t0, 'ms');
  console.log('Response:', await n8nRes.text());
}

testOptionB();
