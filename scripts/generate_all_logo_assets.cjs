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
  console.log('Generating logo assets with optimized framing (slightly larger)...');
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

  const sizes = [
    { name: 'logo.png', size: 512 },
    { name: 'xare-logo.png', size: 512 },
    { name: 'android-chrome-512x512.png', size: 512 },
    { name: 'android-chrome-192x192.png', size: 192 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'favicon-48x48.png', size: 48 },
    { name: 'favicon-32x32.png', size: 32 },
    { name: 'favicon-16x16.png', size: 16 },
    { name: 'favicon.png', size: 512 }
  ];

  const generatedImages = {};

  for (const item of sizes) {
    const dataUrl = await page.evaluate((targetSize) => {
      const srcImg = document.getElementById('srcImg');
      const w = srcImg.naturalWidth;
      const h = srcImg.naturalHeight;

      // 1. Process master canvas with alpha keying
      const masterCv = document.createElement('canvas');
      masterCv.width = w;
      masterCv.height = h;
      const masterCtx = masterCv.getContext('2d');
      masterCtx.drawImage(srcImg, 0, 0);

      const imgData = masterCtx.getImageData(0, 0, w, h);
      const d = imgData.data;

      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const maxVal = Math.max(r, g, b);

        if (maxVal < 35) {
          d[i + 3] = 0;
        } else {
          const alpha = Math.min(255, ((maxVal - 35) / (255 - 35)) * 320);
          d[i + 3] = Math.round(alpha);
          if (maxVal < 140) {
            const boost = 140 / Math.max(1, maxVal);
            d[i] = Math.min(255, Math.round(r * boost * 0.8));
            d[i + 1] = Math.min(255, Math.round(g * boost * 1.1));
            d[i + 2] = Math.min(255, Math.round(b * boost * 1.2));
          }
        }
      }
      masterCtx.putImageData(imgData, 0, 0);

      // 2. Crop tightly around the glow (sx: 50, sy: 48, sw: 924, sh: 924) to enlarge the emblem inside the frame
      const cropW = 924;
      const cropH = 924;
      const cropX = 50;
      const cropY = 48;

      const targetCv = document.createElement('canvas');
      targetCv.width = targetSize;
      targetCv.height = targetSize;
      const targetCtx = targetCv.getContext('2d');
      targetCtx.imageSmoothingEnabled = true;
      targetCtx.imageSmoothingQuality = 'high';
      targetCtx.drawImage(masterCv, cropX, cropY, cropW, cropH, 0, 0, targetSize, targetSize);

      return targetCv.toDataURL('image/png');
    }, item.size);

    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    generatedImages[item.name] = { buffer, size: item.size, dataUrl };
    fs.writeFileSync(path.join(publicDir, item.name), buffer);
  }

  // 3. Generate multi-resolution favicon.ico
  const icoBuffer = buildIco([
    { width: 16, height: 16, buffer: generatedImages['favicon-16x16.png'].buffer },
    { width: 32, height: 32, buffer: generatedImages['favicon-32x32.png'].buffer },
    { width: 48, height: 48, buffer: generatedImages['favicon-48x48.png'].buffer }
  ]);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);

  // 4. Update SVG favicon
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <image href="${generatedImages['logo.png'].dataUrl}" width="512" height="512" filter="url(#glow)" />
</svg>
`;
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent);

  await browser.close();
  console.log('Optimized branding assets generated successfully!');
}

main().catch(console.error);
