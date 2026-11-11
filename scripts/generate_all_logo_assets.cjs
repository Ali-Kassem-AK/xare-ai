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
  console.log('Generating complete set of high-contrast logo & favicon assets...');
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

    // Body bounds: minX: 235, maxX: 787 (552px), minY: 254, maxY: 764 (510px)
    // Center: X=511, Y=509.
    const tightSize = 560;
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

      if (maxVal < 25) {
        d[i + 3] = 0;
      } else {
        const alpha = Math.min(255, ((maxVal - 25) / (255 - 25)) * 360);
        d[i + 3] = Math.round(alpha);

        // Rich royal sapphire dark blue with luminous accents:
        const nr = Math.min(255, Math.round((r * 0.65 + b * 0.22) * 1.35));
        const ng = Math.min(255, Math.round((g * 0.72) * 1.35));
        const nb = Math.min(255, Math.round((b * 1.45 + 25) * 1.35));

        d[i] = nr;
        d[i + 1] = ng;
        d[i + 2] = nb;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // 1. Transparent UI Logo (Header, Hero, Live call orb)
    function generateTransparentLogo(targetSize) {
      const outCv = document.createElement('canvas');
      outCv.width = targetSize;
      outCv.height = targetSize;
      const outCtx = outCv.getContext('2d');
      outCtx.imageSmoothingEnabled = true;
      outCtx.imageSmoothingQuality = 'high';
      outCtx.drawImage(cv, 50, 48, 924, 924, 0, 0, targetSize, targetSize);
      return outCv.toDataURL('image/png');
    }

    // 2. High-contrast circular tab favicon badge (100% full-bleed parity with GitHub/Vercel)
    function generateCircularFavicon(size) {
      const outCv = document.createElement('canvas');
      outCv.width = size;
      outCv.height = size;
      const outCtx = outCv.getContext('2d');
      outCtx.imageSmoothingEnabled = true;
      outCtx.imageSmoothingQuality = 'high';

      // Midnight obsidian solid circular backing
      outCtx.fillStyle = '#020617';
      outCtx.beginPath();
      const r = size / 2 - 0.75;
      outCtx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
      outCtx.fill();

      // High-contrast sapphire/cyan outer rim
      outCtx.strokeStyle = '#3b82f6';
      outCtx.lineWidth = Math.max(1, size * 0.035);
      outCtx.stroke();

      // Tight emblem filling ~90% of the circle
      const pad = Math.round(size * 0.055);
      const drawSize = size - pad * 2;
      outCtx.drawImage(cv, tightX, tightY, tightSize, tightSize, pad, pad, drawSize, drawSize);

      return outCv.toDataURL('image/png');
    }

    return {
      logo512: generateTransparentLogo(512),
      f16: generateCircularFavicon(16),
      f32: generateCircularFavicon(32),
      f48: generateCircularFavicon(48),
      f128: generateCircularFavicon(128),
      f192: generateCircularFavicon(192),
      f512: generateCircularFavicon(512)
    };
  });

  const transparentFiles = [
    { name: 'logo.png', dataUrl: assets.logo512 },
    { name: 'xare-logo.png', dataUrl: assets.logo512 },
    { name: 'favicon.png', dataUrl: assets.logo512 }
  ];

  const faviconFiles = [
    { name: 'favicon-16x16.png', dataUrl: assets.f16, width: 16, height: 16 },
    { name: 'favicon-32x32.png', dataUrl: assets.f32, width: 32, height: 32 },
    { name: 'favicon-48x48.png', dataUrl: assets.f48, width: 48, height: 48 },
    { name: 'apple-touch-icon.png', dataUrl: assets.f192, width: 192, height: 192 },
    { name: 'android-chrome-192x192.png', dataUrl: assets.f192, width: 192, height: 192 },
    { name: 'android-chrome-512x512.png', dataUrl: assets.f512, width: 512, height: 512 }
  ];

  for (const item of transparentFiles) {
    const buf = Buffer.from(item.dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    fs.writeFileSync(path.join(publicDir, item.name), buf);
    console.log(`Generated transparent UI asset: public/${item.name}`);
  }

  const icoImages = [];
  for (const item of faviconFiles) {
    const buf = Buffer.from(item.dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    fs.writeFileSync(path.join(publicDir, item.name), buf);
    console.log(`Generated favicon asset: public/${item.name}`);

    if (item.name.startsWith('favicon-')) {
      icoImages.push({ width: item.width, height: item.height, buffer: buf });
    }
  }

  // Multi-resolution favicon.ico
  const icoBuffer = buildIco(icoImages);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
  console.log('Generated: public/favicon.ico');

  // SVG Favicon
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="100%" height="100%">
  <image href="${assets.f128}" width="128" height="128" />
</svg>
`;
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent);
  console.log('Generated: public/favicon.svg');

  await browser.close();
  console.log('All branding and favicon assets successfully generated!');
}

main().catch(console.error);
