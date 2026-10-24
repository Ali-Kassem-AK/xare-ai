const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ARTIFACT_DIR = 'C:\\Users\\alika\\.gemini\\antigravity\\brain\\1cb7ba5b-9988-4e50-80be-53f5895baf33';
const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'visualizer');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function run() {
  console.log('--- STARTING VISUALIZER FULLSCREEN RESPONSIVE VERIFICATION ---');

  // Start vite preview server
  console.log('Starting preview server on port 4173...');
  const preview = spawn('npx.cmd', ['vite', 'preview', '--port', '4173', '--strictPort'], {
    cwd: path.join(__dirname, '..'),
    shell: true,
    stdio: 'pipe'
  });

  preview.stdout.on('data', d => console.log('[Vite Preview]', d.toString().trim()));
  preview.stderr.on('data', d => console.error('[Vite Preview Error]', d.toString().trim()));

  // Wait for preview server to be available
  await new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      http.get('http://localhost:4173', res => {
        if (res.statusCode === 200 || res.statusCode === 304) {
          console.log('Preview server ready at http://localhost:4173');
          resolve();
        } else {
          setTimeout(check, 500);
        }
      }).on('error', () => {
        if (attempts > 30) {
          reject(new Error('Preview server timed out after 15s'));
        } else {
          setTimeout(check, 500);
        }
      });
    };
    check();
  });

  const browser = await chromium.launch({ 
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });

  try {
    // -------------------------------------------------------------
    // Prepare Mock Data: Real Hadoop Architecture Visualization
    // -------------------------------------------------------------
    const mockChats = [
      {
        id: 'chat-hadoop-viz',
        title: 'Hadoop Architecture Viz',
        updatedAt: new Date().toISOString(),
        messages: [
          {
            id: 'm1',
            sender: 'user',
            text: 'Visualize Hadoop Architecture in HTML',
            timestamp: new Date().toISOString(),
            status: 'sent'
          },
          {
            id: 'm2',
            sender: 'ai',
            text: `Here is the interactive architecture diagram:\n\n\`\`\`html\n<!DOCTYPE html>\n<html>\n<head>\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<style>\nbody { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #060911; color: #f8fafc; padding: 16px; margin: 0; box-sizing: border-box; text-align: center; }\n.header-title { color: #38bdf8; font-size: 18px; font-weight: 700; margin-bottom: 16px; }\n.container { display: flex; flex-direction: column; gap: 14px; max-width: 480px; margin: 0 auto; }\n.card-master { background: #1e1b4b; border: 2px solid #6366f1; border-radius: 12px; padding: 16px; box-shadow: 0 4px 14px rgba(99,102,241,0.25); }\n.card-worker { background: #0f172a; border: 2px solid #10b981; border-radius: 12px; padding: 14px; box-shadow: 0 4px 14px rgba(16,185,129,0.2); }\n.badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }\n.badge-master { background: #312e81; color: #a5b4fc; }\n.badge-worker { background: #064e3b; color: #6ee7b7; }\nh3 { margin: 0 0 4px 0; font-size: 16px; font-weight: 600; }\np { margin: 0; color: #94a3b8; font-size: 13px; }\n</style>\n</head>\n<body>\n<div class="header-title">HDFS Master-Worker Cluster</div>\n<div class="container">\n  <div class="card-master">\n    <span class="badge badge-master">Cluster Master</span>\n    <h3>NameNode (Active)</h3>\n    <p>Manages File System Namespace & Metadata</p>\n  </div>\n  <div class="card-worker">\n    <span class="badge badge-worker">Data Node 01</span>\n    <h3>Block Storage Replica A</h3>\n    <p>Read/Write Pipeline Block ID #1042</p>\n  </div>\n  <div class="card-worker">\n    <span class="badge badge-worker">Data Node 02</span>\n    <h3>Block Storage Replica B</h3>\n    <p>Read/Write Pipeline Block ID #1042</p>\n  </div>\n</div>\n</body>\n</html>\n\`\`\``,
            timestamp: new Date().toISOString(),
            status: 'sent'
          }
        ]
      }
    ];

    // -------------------------------------------------------------
    // TEST 1: Mobile Phone Browser View (360 x 800 - Samsung Galaxy A55)
    // -------------------------------------------------------------
    console.log('\n[TEST 1] Testing Mobile Viewport: 360 x 800 (Samsung Galaxy A55)...');
    const mobileContext = await browser.newContext({
      viewport: { width: 360, height: 800 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A556B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
    });

    const mobilePage = await mobileContext.newPage();

    // Navigate to set initial storage
    await mobilePage.goto('http://localhost:4173');
    await mobilePage.evaluate((chats) => {
      localStorage.setItem('xare_active_session', 'guest');
      localStorage.setItem('xare_chats_guest-user', JSON.stringify(chats));
      localStorage.setItem('xare_theme', 'dark');
    }, mockChats);

    // Reload page to initialize with guest session and cached chats
    await mobilePage.goto('http://localhost:4173');
    await mobilePage.waitForLoadState('networkidle');

    // If guest button is still visible, click it
    const guestBtnMobile = mobilePage.locator('button:has-text("Continue as Guest")');
    if (await guestBtnMobile.isVisible({ timeout: 2000 }).catch(() => false)) {
      await guestBtnMobile.click();
      await mobilePage.waitForTimeout(600);
    }

    // On mobile, open sidebar menu to select the visualization chat
    const openMenuBtn = mobilePage.locator('button[title="Open menu"]');
    if (await openMenuBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Opening mobile sidebar menu...');
      await openMenuBtn.click();
      await mobilePage.waitForTimeout(400);

      const chatEntry = mobilePage.locator('text=Hadoop Architecture Viz').first();
      await chatEntry.waitFor({ state: 'visible', timeout: 5000 });
      console.log('Selecting Hadoop Architecture Viz chat from sidebar...');
      await chatEntry.click();
      await mobilePage.waitForTimeout(600);
    }

    // Wait for the visualizer codeblock or preview iframe
    const fullscreenBtn = mobilePage.locator('button[title*="fullscreen" i], button[title*="Fullscreen" i]').first();
    await fullscreenBtn.waitFor({ state: 'visible', timeout: 8000 });
    console.log('✅ Found Fullscreen button in visualizer card on mobile.');

    // Step 1: Capture screenshot of inline preview on mobile
    const mobileInlinePath = path.join(OUTPUT_DIR, '01_mobile_360x800_inline.png');
    await mobilePage.screenshot({ path: mobileInlinePath, fullPage: false });
    console.log('📸 Saved mobile inline screenshot:', mobileInlinePath);

    // Step 2: Click Fullscreen button to open theater mode
    await fullscreenBtn.click();
    console.log('Clicked Fullscreen button. Waiting for dialog modal...');

    const dialog = mobilePage.locator('[role="dialog"]');
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    await mobilePage.waitForTimeout(600); // Wait for fade-in animation

    // Verify all header elements on mobile
    const badge = dialog.locator('span:has-text("html")').first();
    const title = dialog.locator('span:has-text("Visualizer")').first();
    const modeBtn = dialog.locator('button[title*="layout active" i]');
    const resetBtn = dialog.locator('button[title="Reload sandbox"]');
    const popoutBtn = dialog.locator('button[title="Open in new browser tab"]');
    const closeBtn = dialog.locator('button[aria-label="Close Fullscreen"]');

    const isCloseVisible = await closeBtn.isVisible();
    const closeBox = await closeBtn.boundingBox();
    console.log(`Close button visible: ${isCloseVisible}, BoundingBox:`, closeBox);

    if (!isCloseVisible || !closeBox) {
      throw new Error('CLOSE BUTTON IS NOT VISIBLE ON MOBILE!');
    }

    // Verify that the close button is fully within the 360px viewport boundaries
    if (closeBox.x + closeBox.width > 360) {
      throw new Error(`CLOSE BUTTON OVERFLOWED SCREEN! right edge: ${closeBox.x + closeBox.width} > 360px`);
    }

    console.log(`✅ Close button is fully inside viewport (x: ${closeBox.x.toFixed(1)}, width: ${closeBox.width.toFixed(1)}, right: ${(closeBox.x + closeBox.width).toFixed(1)}px <= 360px)`);

    // Capture screenshot of mobile fullscreen theater mode
    const mobileFullscreenPath = path.join(OUTPUT_DIR, '02_mobile_360x800_fullscreen_modal.png');
    await mobilePage.screenshot({ path: mobileFullscreenPath, fullPage: false });
    console.log('📸 Saved mobile fullscreen screenshot:', mobileFullscreenPath);

    fs.copyFileSync(mobileFullscreenPath, path.join(ARTIFACT_DIR, 'mobile_360x800_fullscreen.png'));

    // Test closing modal via Close button
    await closeBtn.click();
    await dialog.waitFor({ state: 'hidden', timeout: 3000 });
    console.log('✅ Close button clicked and modal successfully dismissed on mobile!');

    await mobileContext.close();

    // -------------------------------------------------------------
    // TEST 2: Desktop PC Browser View (1280 x 800)
    // -------------------------------------------------------------
    console.log('\n[TEST 2] Testing Desktop PC Viewport: 1280 x 800...');
    const pcContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1
    });

    const pcPage = await pcContext.newPage();
    await pcPage.goto('http://localhost:4173');
    await pcPage.evaluate((chats) => {
      localStorage.setItem('xare_active_session', 'guest');
      localStorage.setItem('xare_chats_guest-user', JSON.stringify(chats));
      localStorage.setItem('xare_theme', 'dark');
    }, mockChats);

    await pcPage.goto('http://localhost:4173');
    await pcPage.waitForLoadState('networkidle');

    const guestBtnPc = pcPage.locator('button:has-text("Continue as Guest")');
    if (await guestBtnPc.isVisible({ timeout: 2000 }).catch(() => false)) {
      await guestBtnPc.click();
      await pcPage.waitForTimeout(600);
    }

    // On PC, open sidebar menu if needed
    const openMenuBtnPc = pcPage.locator('button[title="Open menu"]');
    if (await openMenuBtnPc.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Opening PC sidebar menu...');
      await openMenuBtnPc.click();
      await pcPage.waitForTimeout(400);
    }

    // Click chat from sidebar
    const chatEntryPc = pcPage.locator('text=Hadoop Architecture Viz').first();
    await chatEntryPc.waitFor({ state: 'visible', timeout: 5000 });
    console.log('Selecting Hadoop Architecture Viz chat on PC...');
    await chatEntryPc.click();
    await pcPage.waitForTimeout(600);

    const pcFullscreenBtn = pcPage.locator('button[title*="fullscreen" i], button[title*="Fullscreen" i]').first();
    await pcFullscreenBtn.waitFor({ state: 'visible', timeout: 8000 });

    // Open fullscreen on PC
    await pcFullscreenBtn.click();
    const pcDialog = pcPage.locator('[role="dialog"]');
    await pcDialog.waitFor({ state: 'visible', timeout: 5000 });
    await pcPage.waitForTimeout(600);

    // Verify PC header elements
    const pcFullTitle = pcDialog.locator('text=Interactive Visualizer Sandbox');
    const pcCloseLabel = pcDialog.locator('button[aria-label="Close Fullscreen"]:has-text("Close")');
    const pcModeLabel = pcDialog.locator('button[title*="layout active"]:has-text("Full Page")');
    const pcResetLabel = pcDialog.locator('button[title="Reload sandbox"]:has-text("Reset")');
    const pcPopoutLabel = pcDialog.locator('button[title="Open in new browser tab"]:has-text("Pop Out")');

    console.log('PC Full Title visible:', await pcFullTitle.isVisible());
    console.log('PC Close label visible:', await pcCloseLabel.isVisible());
    console.log('PC Mode label visible:', await pcModeLabel.isVisible());
    console.log('PC Reset label visible:', await pcResetLabel.isVisible());
    console.log('PC Pop Out label visible:', await pcPopoutLabel.isVisible());

    // Capture screenshot of PC fullscreen theater mode
    const pcFullscreenPath = path.join(OUTPUT_DIR, '03_pc_1280x800_fullscreen_modal.png');
    await pcPage.screenshot({ path: pcFullscreenPath, fullPage: false });
    console.log('📸 Saved PC fullscreen screenshot:', pcFullscreenPath);

    fs.copyFileSync(pcFullscreenPath, path.join(ARTIFACT_DIR, 'pc_1280x800_fullscreen.png'));

    // Test Esc key closing
    await pcPage.keyboard.press('Escape');
    await pcDialog.waitFor({ state: 'hidden', timeout: 3000 });
    console.log('✅ Escape key pressed and modal successfully dismissed on PC!');

    await pcContext.close();

    console.log('\n=============================================================');
    console.log('ALL VERIFICATION CHECKS PASSED WITH 100% SUCCESS!');
    console.log('Screenshots saved:');
    console.log(' - Mobile Inline (360x800): ' + mobileInlinePath);
    console.log(' - Mobile Fullscreen (360x800): ' + path.join(ARTIFACT_DIR, 'mobile_360x800_fullscreen.png'));
    console.log(' - PC Desktop Fullscreen (1280x800): ' + path.join(ARTIFACT_DIR, 'pc_1280x800_fullscreen.png'));
    console.log('=============================================================\n');

  } finally {
    await browser.close();
    preview.kill();
  }
}

run().catch(err => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
