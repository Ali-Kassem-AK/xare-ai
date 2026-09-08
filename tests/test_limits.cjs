const fs = require('fs');

async function testPayloadSize() {
  const url = 'https://aliiis-24-7-n8n.hf.space/webhook/xare-ai-v2-guALIharika';
  const token = 'ali1234';

  console.log('================================================================');
  console.log('PROBING N8N / HUGGING FACE NETWORK & PAYLOAD LIMITS');
  console.log('================================================================\n');

  // Test 1: Baseline Health Check
  console.log('--- TEST BASELINE: Small JSON ---');
  try {
    const t0 = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-chatbot-token': token
      },
      body: JSON.stringify({
        message: 'Ping test baseline',
        action: 'chat'
      })
    });
    console.log(`Small baseline status: ${res.status} in ${Date.now() - t0}ms`);
  } catch (err) {
    console.log('Small baseline error:', err.message);
  }

  // Test sizes
  const sizesMb = [5, 10, 15, 20, 30, 40, 50];

  console.log('\n--- TESTING PROGRESSIVE PAYLOAD SIZES (MULTIPART / FORM-DATA) ---');
  for (const sizeMb of sizesMb) {
    const byteLength = sizeMb * 1024 * 1024;
    console.log(`\nTesting multipart size: ${sizeMb} MB (${byteLength} bytes)...`);
    
    const dummyBuffer = Buffer.alloc(byteLength, 0x41);
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
    const headerPart = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="probe_${sizeMb}mb.dat"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
    );
    const textPart = Buffer.from(
      `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="message"\r\n\r\n` +
      `Test payload ${sizeMb}MB\r\n` +
      `--${boundary}--\r\n`
    );
    
    const body = Buffer.concat([headerPart, dummyBuffer, textPart]);
    const t0 = Date.now();

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'x-chatbot-token': token
        },
        body: body
      });
      const duration = Date.now() - t0;
      const text = await res.text();
      console.log(`Result ${sizeMb}MB Multipart: Status=${res.status}, Duration=${duration}ms, ResponseSnippet=${text.substring(0, 150).replace(/\n/g, ' ')}`);
    } catch (err) {
      console.log(`Result ${sizeMb}MB Multipart: FAILED (${err.message}) in ${Date.now() - t0}ms`);
    }
  }

  console.log('\n--- TESTING PROGRESSIVE PAYLOAD SIZES (JSON WITH BASE64) ---');
  for (const sizeMb of [5, 10, 12, 15, 20]) {
    const rawBytes = sizeMb * 1024 * 1024;
    console.log(`\nTesting JSON base64 size: ~${sizeMb} MB raw file (${rawBytes} bytes)...`);
    const dummy = Buffer.alloc(rawBytes, 0x42).toString('base64');
    const jsonBody = JSON.stringify({
      message: {
        text: `Probe JSON ${sizeMb}MB`,
        document: {
          file_id: `data:application/pdf;base64,${dummy}`
        }
      },
      mediaType: 'pdf',
      mimeType: 'application/pdf',
      fileName: `probe_${sizeMb}mb.pdf`,
      fileSize: rawBytes
    });

    console.log(`JSON body string size: ${(jsonBody.length / (1024 * 1024)).toFixed(2)} MB`);
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chatbot-token': token
        },
        body: jsonBody
      });
      const duration = Date.now() - t0;
      const text = await res.text();
      console.log(`Result ${sizeMb}MB JSON: Status=${res.status}, Duration=${duration}ms, ResponseSnippet=${text.substring(0, 150).replace(/\n/g, ' ')}`);
    } catch (err) {
      console.log(`Result ${sizeMb}MB JSON: FAILED (${err.message}) in ${Date.now() - t0}ms`);
    }
  }
}

testPayloadSize();
