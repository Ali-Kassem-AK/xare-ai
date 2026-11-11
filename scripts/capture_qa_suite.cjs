const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const outDir = 'C:/Users/alika/.gemini/antigravity/brain/1cb7ba5b-9988-4e50-80be-53f5895baf33/screenshots';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const viewports = [
  { name: 'small-smartphone', w: 360, h: 800 },
  { name: 'standard-smartphone', w: 390, h: 844 },
  { name: 'large-smartphone', w: 430, h: 932 },
  { name: 'tablet-portrait', w: 768, h: 1024 },
  { name: 'tablet-landscape', w: 1024, h: 768 },
  { name: 'standard-laptop', w: 1366, h: 768 },
  { name: 'large-laptop', w: 1440, h: 900 },
  { name: 'desktop', w: 1920, h: 1080 },
  { name: 'large-desktop', w: 2560, h: 1440 }
];

async function runSuite() {
  const browser = await chromium.launch({ channel: 'chrome' });

  console.log('--- Step 1: Capturing Auth Modal (360x800 and 1366x768) ---');
  for (const size of [{ w: 360, h: 800, name: 'mobile' }, { w: 1366, h: 768, name: 'desktop' }]) {
    const page = await browser.newPage({ viewport: { width: size.w, height: size.h } });
    await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, `qa_auth_modal_dark_${size.name}_${size.w}x${size.h}.png`) });

    // Toggle theme to light
    const themeBtn = await page.$('button[title*="theme" i], button[aria-label*="theme" i], header button:last-child');
    if (themeBtn) {
      await themeBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, `qa_auth_modal_light_${size.name}_${size.w}x${size.h}.png`) });
    }
    await page.close();
  }

  console.log('--- Step 2: Capturing Main Chat View across all 9 viewports (Dark & Light) ---');
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Bypass auth to land in chat
    const guestBtn = await page.$('button:has-text("Continue as Guest")');
    if (guestBtn) {
      await guestBtn.click();
      await page.waitForTimeout(800);
    }

    // Dismiss welcome popup if present
    const gotItBtn = await page.$('button:has-text("Got it"), button:has-text("Close"), button:has-text("Start")');
    if (gotItBtn) {
      await gotItBtn.click();
      await page.waitForTimeout(400);
    }

    // Verify horizontal scrollbar (must be 0 overflow)
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const hasHorizontalOverflow = scrollWidth > clientWidth;
    console.log(`Viewport ${vp.name} (${vp.w}x${vp.h}): scrollWidth=${scrollWidth}, clientWidth=${clientWidth}, overflow=${hasHorizontalOverflow}`);

    // Dark screenshot
    await page.screenshot({ path: path.join(outDir, `qa_chat_dark_${vp.name}_${vp.w}x${vp.h}.png`) });

    // Switch to Light Mode
    const buttons = await page.$$('header button');
    for (const b of buttons) {
      const html = await b.innerHTML();
      if (html.includes('Sun') || html.includes('Moon') || html.includes('lucide-sun') || html.includes('lucide-moon')) {
        await b.click();
        break;
      }
    }
    await page.waitForTimeout(400);

    // Light screenshot
    await page.screenshot({ path: path.join(outDir, `qa_chat_light_${vp.name}_${vp.w}x${vp.h}.png`) });

    await page.close();
  }

  console.log('--- Step 3: Capturing Mobile Menu / Sidebar on 360x800 ---');
  {
    const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
    await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const guestBtn = await page.$('button:has-text("Continue as Guest")');
    if (guestBtn) {
      await guestBtn.click();
      await page.waitForTimeout(800);
    }
    // Open mobile sidebar
    const menuBtn = await page.$('button[aria-label*="menu" i], button[title*="menu" i], header button:first-child');
    if (menuBtn) {
      await menuBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(outDir, `qa_mobile_menu_open_360x800.png`) });
    }
    await page.close();
  }

  await browser.close();
  console.log('QA suite capture complete!');
}

runSuite().catch(console.error);
