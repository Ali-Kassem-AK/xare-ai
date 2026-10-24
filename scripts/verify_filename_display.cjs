const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ARTIFACT_DIR = 'C:\\Users\\alika\\.gemini\\antigravity\\brain\\1cb7ba5b-9988-4e50-80be-53f5895baf33';
const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'filename_display');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function run() {
  console.log('--- STARTING FILENAME DISPLAY VERIFICATION ---');

  // Start vite preview server
  console.log('Starting preview server on port 4173...');
  const preview = spawn('npx.cmd', ['vite', 'preview', '--port', '4173', '--strictPort'], {
    cwd: path.join(__dirname, '..'),
    shell: true,
    stdio: 'pipe'
  });

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
    const mockChats = [
      {
        id: 'chat-doc-test',
        title: 'Book Analysis & Review',
        updatedAt: new Date().toISOString(),
        messages: [
          {
            id: 'm-doc-1',
            sender: 'user',
            text: 'is it a good book and if its related to cats tell me',
            document: 'https://example.com/files/Complete_Guide_To_Cats.pdf',
            fileName: 'Complete_Guide_To_Cats.pdf',
            timestamp: new Date().toISOString(),
            status: 'sent'
          },
          {
            id: 'm-ai-1',
            sender: 'ai',
            text: '### Book Analysis & Review\n\n**Final Verdict:** Yes, this is a comprehensive guide on domestic and wild feline behavior, covering nutrition, care, and health.\n\n### Details\n- **Topic:** Feline Care & Psychology\n- **Related to Cats:** 100% Yes\n- **Target Audience:** Cat owners and enthusiasts',
            timestamp: new Date().toISOString(),
            status: 'sent'
          }
        ]
      }
    ];

    // -------------------------------------------------------------
    // TEST 1: Mobile Phone Browser View (360 x 800)
    // -------------------------------------------------------------
    console.log('\n[TEST 1] Testing Mobile Viewport: 360 x 800 (matching user phone screen)...');
    const mobileContext = await browser.newContext({
      viewport: { width: 360, height: 800 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });

    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto('http://localhost:4173');
    await mobilePage.evaluate((chats) => {
      localStorage.setItem('xare_active_session', 'guest');
      localStorage.setItem('xare_chats_guest-user', JSON.stringify(chats));
      localStorage.setItem('xare_theme', 'dark');
    }, mockChats);

    await mobilePage.goto('http://localhost:4173');
    await mobilePage.waitForLoadState('networkidle');

    // Open sidebar menu and select the chat
    const openMenuBtn = mobilePage.locator('button[title="Open menu"]');
    if (await openMenuBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await openMenuBtn.click();
      await mobilePage.waitForTimeout(400);

      const chatEntry = mobilePage.locator('text=Book Analysis & Review').first();
      await chatEntry.waitFor({ state: 'visible', timeout: 5000 });
      await chatEntry.click();
      await mobilePage.waitForTimeout(600);
    }

    // Check that "Complete_Guide_To_Cats.pdf" is displayed
    const fileNameLocator = mobilePage.locator('text=Complete_Guide_To_Cats.pdf');
    await fileNameLocator.waitFor({ state: 'visible', timeout: 8000 });
    console.log('✅ Found displayed file name: "Complete_Guide_To_Cats.pdf"');

    // Verify that the old hardcoded "PDF Document" string is NOT present in the card
    const oldHardcodedText = await mobilePage.locator('p:has-text("PDF Document")').count();
    console.log('Old hardcoded "PDF Document" element count:', oldHardcodedText);
    if (oldHardcodedText > 0) {
      throw new Error('FAILED: "PDF Document" is still displayed instead of the file name!');
    }

    // Capture screenshot of mobile phone view
    const mobileShotPath = path.join(OUTPUT_DIR, '01_mobile_filename_displayed.png');
    await mobilePage.screenshot({ path: mobileShotPath, fullPage: false });
    console.log('📸 Saved mobile screenshot:', mobileShotPath);
    fs.copyFileSync(mobileShotPath, path.join(ARTIFACT_DIR, 'mobile_filename_displayed.png'));

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

    const openMenuBtnPc = pcPage.locator('button[title="Open menu"]');
    if (await openMenuBtnPc.isVisible({ timeout: 2000 }).catch(() => false)) {
      await openMenuBtnPc.click();
      await pcPage.waitForTimeout(400);
    }

    const chatEntryPc = pcPage.locator('text=Book Analysis & Review').first();
    await chatEntryPc.waitFor({ state: 'visible', timeout: 5000 });
    await chatEntryPc.click();
    await pcPage.waitForTimeout(600);

    const pcFileNameLocator = pcPage.locator('text=Complete_Guide_To_Cats.pdf');
    await pcFileNameLocator.waitFor({ state: 'visible', timeout: 8000 });
    console.log('✅ Found displayed file name on Desktop: "Complete_Guide_To_Cats.pdf"');

    const pcShotPath = path.join(OUTPUT_DIR, '02_pc_filename_displayed.png');
    await pcPage.screenshot({ path: pcShotPath, fullPage: false });
    console.log('📸 Saved PC screenshot:', pcShotPath);
    fs.copyFileSync(pcShotPath, path.join(ARTIFACT_DIR, 'pc_filename_displayed.png'));

    await pcContext.close();

    console.log('\n=============================================================');
    console.log('ALL VERIFICATION CHECKS PASSED WITH 100% SUCCESS!');
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
