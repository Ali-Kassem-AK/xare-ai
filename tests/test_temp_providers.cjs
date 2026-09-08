const fs = require('fs');

async function testTemporaryProviders() {
  console.log('================================================================');
  console.log('TESTING OPTION B CANDIDATES — TEMPORARY FILE HOSTS');
  console.log('================================================================\n');

  // Candidate 1: Litterbox (Catbox.moe)
  console.log('--- Candidate 1: Litterbox (Catbox.moe) ---');
  try {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="reqtype"\r\n\r\nfileupload\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="time"\r\n\r\n1h\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="fileToUpload"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\n`
      ),
      Buffer.from('Xare AI Temporary File Test Content'),
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const t0 = Date.now();
    const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body
    });
    const d = Date.now() - t0;
    const url = (await res.text()).trim();
    console.log(`Litterbox Upload: Status=${res.status} in ${d}ms, URL=${url}`);

    if (url.startsWith('http')) {
      const t1 = Date.now();
      const getRes = await fetch(url);
      console.log(`Litterbox Download: Status=${getRes.status} in ${Date.now() - t1}ms, CORS=${getRes.headers.get('access-control-allow-origin')}`);
    }
  } catch (err) {
    console.log('Litterbox Failed:', err.message);
  }

  // Candidate 2: tmpfiles.org
  console.log('\n--- Candidate 2: tmpfiles.org ---');
  try {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="input_file"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\n`
      ),
      Buffer.from('Xare AI Temporary File Test Content'),
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const t0 = Date.now();
    const res = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body
    });
    const d = Date.now() - t0;
    const json = await res.json();
    console.log(`tmpfiles.org Upload: Status=${res.status} in ${d}ms, Data:`, JSON.stringify(json));
  } catch (err) {
    console.log('tmpfiles.org Failed:', err.message);
  }

  // Candidate 3: file.io
  console.log('\n--- Candidate 3: file.io ---');
  try {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\n`
      ),
      Buffer.from('Xare AI Temporary File Test Content'),
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const t0 = Date.now();
    const res = await fetch('https://file.io/?expires=1d', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body
    });
    const d = Date.now() - t0;
    const json = await res.json();
    console.log(`file.io Upload: Status=${res.status} in ${d}ms, Data:`, JSON.stringify(json));
  } catch (err) {
    console.log('file.io Failed:', err.message);
  }
}

testTemporaryProviders();
