const fs = require('fs');

async function testMultipartE2E() {
  const url = 'https://aliiis-24-7-n8n.hf.space/webhook/xare-ai-v2-guALIharika';
  const token = 'ali1234';

  console.log('================================================================');
  console.log('TESTING MULTIPART FORM-DATA E2E WITH REAL MEDIA PIPELINE');
  console.log('================================================================\n');

  // Small valid PNG image (1x1 red dot)
  const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const samplePngBuffer = Buffer.from(samplePngBase64, 'base64');

  // Test A: Multipart with field name 'data'
  console.log('--- TEST A: Multipart with field name "data" ---');
  const boundaryA = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const bodyA = Buffer.concat([
    Buffer.from(
      `--${boundaryA}\r\n` +
      `Content-Disposition: form-data; name="mediaType"\r\n\r\n` +
      `image\r\n` +
      `--${boundaryA}\r\n` +
      `Content-Disposition: form-data; name="mimeType"\r\n\r\n` +
      `image/png\r\n` +
      `--${boundaryA}\r\n` +
      `Content-Disposition: form-data; name="fileName"\r\n\r\n` +
      `test_image.png\r\n` +
      `--${boundaryA}\r\n` +
      `Content-Disposition: form-data; name="message[photo][0][file_url]"\r\n\r\n` +
      `\r\n` +
      `--${boundaryA}\r\n` +
      `Content-Disposition: form-data; name="message[caption]"\r\n\r\n` +
      `What color is this 1x1 image?\r\n` +
      `--${boundaryA}\r\n` +
      `Content-Disposition: form-data; name="data"; filename="test_image.png"\r\n` +
      `Content-Type: image/png\r\n\r\n`
    ),
    samplePngBuffer,
    Buffer.from(`\r\n--${boundaryA}--\r\n`)
  ]);

  try {
    const t0 = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundaryA}`,
        'x-chatbot-token': token
      },
      body: bodyA
    });
    const d = Date.now() - t0;
    const text = await res.text();
    console.log(`Test A (Multipart 'data'): Status=${res.status}, Duration=${d}ms`);
    console.log(`Response snippet: ${text.substring(0, 300)}`);
  } catch (err) {
    console.log(`Test A failed: ${err.message}`);
  }

  // Test B: Multipart with field name 'file'
  console.log('\n--- TEST B: Multipart with field name "file" ---');
  const boundaryB = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const bodyB = Buffer.concat([
    Buffer.from(
      `--${boundaryB}\r\n` +
      `Content-Disposition: form-data; name="mediaType"\r\n\r\n` +
      `image\r\n` +
      `--${boundaryB}\r\n` +
      `Content-Disposition: form-data; name="mimeType"\r\n\r\n` +
      `image/png\r\n` +
      `--${boundaryB}\r\n` +
      `Content-Disposition: form-data; name="fileName"\r\n\r\n` +
      `test_image.png\r\n` +
      `--${boundaryB}\r\n` +
      `Content-Disposition: form-data; name="message[caption]"\r\n\r\n` +
      `What color is this 1x1 image?\r\n` +
      `--${boundaryB}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="test_image.png"\r\n` +
      `Content-Type: image/png\r\n\r\n`
    ),
    samplePngBuffer,
    Buffer.from(`\r\n--${boundaryB}--\r\n`)
  ]);

  try {
    const t0 = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundaryB}`,
        'x-chatbot-token': token
      },
      body: bodyB
    });
    const d = Date.now() - t0;
    const text = await res.text();
    console.log(`Test B (Multipart 'file'): Status=${res.status}, Duration=${d}ms`);
    console.log(`Response snippet: ${text.substring(0, 300)}`);
  } catch (err) {
    console.log(`Test B failed: ${err.message}`);
  }
}

testMultipartE2E();
