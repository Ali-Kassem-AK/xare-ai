const fs = require('fs');

async function testUploads() {
  const testPayload = Buffer.from('Xare AI Synthetic Test Payload - ' + Date.now());

  // 1. Test Kappa.lol
  console.log('--- TESTING KAPPA.LOL ---');
  try {
    const fd = new FormData();
    fd.append('file', new Blob([testPayload], { type: 'text/plain' }), 'synthetic_test.txt');
    const t0 = Date.now();
    const res = await fetch('https://kappa.lol/api/upload', {
      method: 'POST',
      body: fd,
      headers: { 'Origin': 'https://xare-ai.vercel.app' }
    });
    const t1 = Date.now();
    const acao = res.headers.get('access-control-allow-origin');
    const json = await res.json();
    console.log('Kappa.lol POST status:', res.status, 'Time:', t1 - t0, 'ms', 'ACAO:', acao);
    console.log('Kappa.lol Response:', json);
    if (json.link) {
      const getRes = await fetch(json.link);
      console.log('Kappa.lol GET status:', getRes.status, 'Content-Type:', getRes.headers.get('content-type'), 'Len:', getRes.headers.get('content-length'));
    }
    if (json.key) {
      const delRes = await fetch('https://kappa.lol/api/delete?key=' + json.key);
      const delJson = await delRes.json().catch(() => ({}));
      console.log('Kappa.lol DELETE status:', delRes.status, 'Response:', delJson);
      const getAfterDel = await fetch(json.link);
      console.log('Kappa.lol GET after delete status:', getAfterDel.status);
    }
  } catch(e) {
    console.log('Kappa error:', e.message);
  }

  // 2. Test tmpfiles.org
  console.log('\n--- TESTING TMPFILES.ORG ---');
  try {
    const fd = new FormData();
    fd.append('input_file', new Blob([testPayload], { type: 'text/plain' }), 'synthetic_test.txt');
    const t0 = Date.now();
    const res = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: fd,
      headers: { 'Origin': 'https://xare-ai.vercel.app' }
    });
    const t1 = Date.now();
    const acao = res.headers.get('access-control-allow-origin');
    const json = await res.json();
    console.log('tmpfiles.org POST status:', res.status, 'Time:', t1 - t0, 'ms', 'ACAO:', acao);
    console.log('tmpfiles.org Response:', json);
    if (json.data && json.data.url) {
      const pageUrl = json.data.url;
      const dlUrl = pageUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
      console.log('Page URL:', pageUrl, 'Download URL:', dlUrl);
      const getRes = await fetch(dlUrl);
      console.log('tmpfiles.org GET dl status:', getRes.status, 'Content-Type:', getRes.headers.get('content-type'), 'Len:', getRes.headers.get('content-length'));
      const text = await getRes.text();
      console.log('tmpfiles.org GET starts with HTML?:', text.startsWith('<!doctype') || text.startsWith('<html') || text.includes('<html>'));
    }
  } catch(e) {
    console.log('tmpfiles error:', e.message);
  }

  // 3. Test Litterbox (Catbox.moe)
  console.log('\n--- TESTING LITTERBOX (CATBOX) ---');
  try {
    const fd = new FormData();
    fd.append('reqtype', 'fileupload');
    fd.append('time', '1h');
    fd.append('fileToUpload', new Blob([testPayload], { type: 'text/plain' }), 'synthetic_test.txt');
    const t0 = Date.now();
    const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
      method: 'POST',
      body: fd,
      headers: { 'Origin': 'https://xare-ai.vercel.app' }
    });
    const t1 = Date.now();
    const acao = res.headers.get('access-control-allow-origin');
    const txt = await res.text();
    console.log('Litterbox POST status:', res.status, 'Time:', t1 - t0, 'ms', 'ACAO:', acao, 'Text:', txt.slice(0, 100));
  } catch(e) {
    console.log('Litterbox error:', e.message);
  }

  // 4. Test Uguu.se
  console.log('\n--- TESTING UGUU.SE ---');
  try {
    const fd = new FormData();
    fd.append('files[]', new Blob([testPayload], { type: 'text/plain' }), 'synthetic_test.txt');
    const t0 = Date.now();
    const res = await fetch('https://uguu.se/upload.php', {
      method: 'POST',
      body: fd,
      headers: { 'Origin': 'https://xare-ai.vercel.app' }
    });
    const t1 = Date.now();
    const acao = res.headers.get('access-control-allow-origin');
    const json = await res.json().catch(() => ({}));
    console.log('Uguu.se POST status:', res.status, 'Time:', t1 - t0, 'ms', 'ACAO:', acao, 'Resp:', json);
  } catch(e) {
    console.log('Uguu error:', e.message);
  }

  // 5. Test Filebin.net
  console.log('\n--- TESTING FILEBIN.NET ---');
  try {
    const binId = 'xare_test_' + Date.now();
    const t0 = Date.now();
    const res = await fetch('https://filebin.net/' + binId + '/synthetic_test.txt', {
      method: 'POST',
      body: testPayload,
      headers: { 'Content-Type': 'text/plain', 'Origin': 'https://xare-ai.vercel.app' }
    });
    const t1 = Date.now();
    const acao = res.headers.get('access-control-allow-origin');
    const json = await res.json().catch(() => ({}));
    console.log('Filebin POST status:', res.status, 'Time:', t1 - t0, 'ms', 'ACAO:', acao, 'Resp:', json);
    if (res.ok) {
      const getRes = await fetch('https://filebin.net/' + binId + '/synthetic_test.txt');
      console.log('Filebin GET status:', getRes.status, 'Content-Type:', getRes.headers.get('content-type'));
      const text = await getRes.text();
      console.log('Filebin GET is HTML?:', text.startsWith('<!DOCTYPE') || text.startsWith('<html'));
    }
  } catch(e) {
    console.log('Filebin error:', e.message);
  }

  // 6. Test Pixeldrain
  console.log('\n--- TESTING PIXELDRAIN ---');
  try {
    const fd = new FormData();
    fd.append('file', new Blob([testPayload], { type: 'text/plain' }), 'synthetic_test.txt');
    const res = await fetch('https://pixeldrain.com/api/file', {
      method: 'POST',
      body: fd,
      headers: { 'Origin': 'https://xare-ai.vercel.app' }
    });
    const json = await res.json().catch(() => ({}));
    console.log('Pixeldrain POST status:', res.status, 'Resp:', json);
  } catch(e) {
    console.log('Pixeldrain error:', e.message);
  }

  // 7. Test file.io
  console.log('\n--- TESTING FILE.IO ---');
  try {
    const fd = new FormData();
    fd.append('file', new Blob([testPayload], { type: 'text/plain' }), 'synthetic_test.txt');
    const t0 = Date.now();
    const res = await fetch('https://file.io/?expires=1d', {
      method: 'POST',
      body: fd,
      headers: { 'Origin': 'https://xare-ai.vercel.app' }
    });
    const t1 = Date.now();
    const acao = res.headers.get('access-control-allow-origin');
    const json = await res.json().catch(() => ({}));
    console.log('file.io POST status:', res.status, 'Time:', t1 - t0, 'ms', 'ACAO:', acao, 'Resp:', json);
    if (json.link) {
      const getRes = await fetch(json.link);
      console.log('file.io GET status:', getRes.status, 'Content-Type:', getRes.headers.get('content-type'));
    }
  } catch(e) {
    console.log('file.io error:', e.message);
  }

  // 8. Test 0x0.st
  console.log('\n--- TESTING 0x0.ST ---');
  try {
    const fd = new FormData();
    fd.append('file', new Blob([testPayload], { type: 'text/plain' }), 'synthetic_test.txt');
    const res = await fetch('https://0x0.st', {
      method: 'POST',
      body: fd,
      headers: { 'Origin': 'https://xare-ai.vercel.app' }
    });
    const txt = await res.text().catch(() => '');
    console.log('0x0.st POST status:', res.status, 'Body:', txt.slice(0, 100));
  } catch(e) {
    console.log('0x0.st error:', e.message);
  }
}

testUploads();
