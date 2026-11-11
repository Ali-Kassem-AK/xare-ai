const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const projectRoot = 'C:/Users/alika/.gemini/antigravity/scratch/xare-ai';
const publicDir = path.join(projectRoot, 'public');
const srcLogoPath = 'C:/Users/alika/.gemini/antigravity/brain/1cb7ba5b-9988-4e50-80be-53f5895baf33/.user_uploaded/media_1794393083677_428697f3.jpg';

function buildIco(images) {
  const count = images.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + count * dirEntrySize;

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.width === 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height === 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(img.buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += img.buffer.length;
  }

  return Buffer.concat([header, ...dirEntries, ...images.map(img => img.buffer)]);
}

async function main() {
  console.log('Generating pure standalone enlarged X logo & favicon assets (no background circle)...');
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });

  const srcBase64 = fs.readFileSync(srcLogoPath).toString('base64');

  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <body style="margin:0; background:#000;">
        <img id="srcImg" src="data:image/jpeg;base64,${srcBase64}" />
      </body>
    </html>
  `);

  await page.waitForFunction(() => {
    const el = document.getElementById('srcImg');
    return el && el.complete && el.naturalWidth > 0;
  });

  const assets = await page.evaluate(() => {
    const img = document.getElementById('srcImg');
    const w = img.naturalWidth;
    const h = img.naturalHeight;

    // Center: X=511, Y=509.
    // Body bounds: width: 552, height: 510.
    // Ultra-tight crop (535px) so the X touches the edges and fills 100% of the canvas:
    const tightSize = 535;
    const tightX = 511 - tightSize / 2;
    const tightY = 509 - tightSize / 2;

    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const maxVal = Math.max(r, g, b);

      if (maxVal < 18) {
        d[i + 3] = 0;
      } else {
        const norm = (maxVal - 18) / (255 - 18);
        const alpha = Math.min(255, Math.pow(norm, 0.75) * 320);
        d[i + 3] = Math.round(alpha);

        // Dark royal sapphire blue core with luminous cyan-sapphire glowing edges
        const nr = Math.min(255, Math.round((r * 0.72 + b * 0.28) * 1.4));
        const ng = Math.min(255, Math.round((g * 0.78) * 1.4));
        const nb = Math.min(255, Math.round((b * 1.55 + 35) * 1.4));

        d[i] = nr;
        d[i + 1] = ng;
        d[i + 2] = nb;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Generator function for pure standalone X (transparent background, NO circle)
    function renderStandaloneX(targetSize, cropBoxSize = tightSize) {
      const outCv = document.createElement('canvas');
      outCv.width = targetSize;
      outCv.height = targetSize;
      const outCtx = outCv.getContext('2d');
      outCtx.imageSmoothingEnabled = true;
      outCtx.imageSmoothingQuality = 'high';

      const cropX = 511 - cropBoxSize / 2;
      const cropY = 509 - cropBoxSize / 2;

      // Pure transparent background
      outCtx.drawImage(cv, cropX, cropY, cropBoxSize, cropBoxSize, 0, 0, targetSize, targetSize);
      return outCv.toDataURL('image/png');
    }

    // Transparent UI Logo (standard framing for header/hero/voice orb)
    function renderUILogo(targetSize) {
      const outCv = document.createElement('canvas');
      outCv.width = targetSize;
      outCv.height = targetSize;
      const outCtx = outCv.getContext('2d');
      outCtx.imageSmoothingEnabled = true;
      outCtx.imageSmoothingQuality = 'high';
      outCtx.drawImage(cv, 50, 48, 924, 924, 0, 0, targetSize, targetSize);
      return outCv.toDataURL('image/png');
    }

    return {
      logo512: renderUILogo(512),
      f16: renderStandaloneX(16),
      f32: renderStandaloneX(32),
      f48: renderStandaloneX(48),
      f128: renderStandaloneX(128),
      f192: renderStandaloneX(192),
      f512: renderStandaloneX(512)
    };
  });

  const filesToWrite = [
    { name: 'logo.png', dataUrl: assets.logo512 },
    { name: 'xare-logo.png', dataUrl: assets.logo512 },
    { name: 'favicon.png', dataUrl: assets.f512 },
    { name: 'favicon-16x16.png', dataUrl: assets.f16, width: 16, height: 16 },
    { name: 'favicon-32x32.png', dataUrl: assets.f32, width: 32, height: 32 },
    { name: 'favicon-48x48.png', dataUrl: assets.f48, width: 48, height: 48 },
    { name: 'apple-touch-icon.png', dataUrl: assets.f192, width: 192, height: 192 },
    { name: 'android-chrome-192x192.png', dataUrl: assets.f192, width: 192, height: 192 },
    { name: 'android-chrome-512x512.png', dataUrl: assets.f512, width: 512, height: 512 }
  ];

  const icoImages = [];
  for (const item of filesToWrite) {
    const buf = Buffer.from(item.dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    fs.writeFileSync(path.join(publicDir, item.name), buf);
    console.log(`Generated: public/${item.name}`);

    if (item.name.startsWith('favicon-')) {
      icoImages.push({ width: item.width, height: item.height, buffer: buf });
    }
  }

  // Multi-resolution favicon.ico
  const icoBuffer = buildIco(icoImages);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
  console.log('Generated: public/favicon.ico');

  // SVG Favicon: Pure standalone transparent X
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="100%" height="100%">
  <image href="${assets.f128}" width="128" height="128" />
</svg>
`;
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent);
  console.log('Generated: public/favicon.svg');

  await browser.close();
  console.log('All standalone X logo and favicon assets successfully generated!');
}

main().catch(console.error);
