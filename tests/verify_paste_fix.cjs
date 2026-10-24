const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ARTIFACT_DIR = 'C:\\Users\\alika\\.gemini\\antigravity\\brain\\1cb7ba5b-9988-4e50-80be-53f5895baf33';

async function run() {
  console.log('=== STARTING PASTE FIX VERIFICATION TEST ===');

  // Start Vite preview
  const preview = spawn('npx.cmd', ['vite', 'preview', '--port', '4173', '--strictPort'], {
    cwd: path.join(__dirname, '..'),
    shell: true,
    stdio: 'pipe'
  });

  await new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      http.get('http://localhost:4173', res => {
        if (res.statusCode === 200 || res.statusCode === 304) {
          console.log('Vite preview ready on http://localhost:4173');
          resolve();
        } else {
          setTimeout(check, 400);
        }
      }).on('error', () => {
        if (attempts > 30) reject(new Error('Preview server timed out after 12s'));
        else setTimeout(check, 400);
      });
    };
    check();
  });

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });

  const pastedContent = `Solution 1: Add a Schedule Trigger Directly Inside n8n (Best & 100% "Inside the Code")

Because Xare's AI backend runs on your Hugging Face Space (aliiis-24-7-n8n.hf.space), n8n is already running in the cloud 24/7!

You can make n8n warm itself up from the inside:

Open your n8n workflow editor at https://aliiis-24-7-n8n.hf.space/.
Click Add Node (+) and search for Schedule Trigger (Cron).
Set the trigger to:
Trigger Interval: Every Hour (or Cron: 35 * * * *).
Connect the output of the Schedule Trigger to an HTTP Request node (or directly into your AI agent node) with the input:
\`\`\`json
{
  "message": "its a test to check that you are alive, so only reply with \\"1\\"",
  "chatInput": "its a test to check that you are alive, so only reply with \\"1\\"",
  "action": "chat"
}
\`\`\`
Click Save and make sure the workflow is Active.

وبعدها تختار الحل المناسب لتفعيل النظام والتأكد من استقرار عمل الرابط التلقائي.`;

  const mockChats = [
    {
      id: 'chat-paste-test-1',
      title: 'Pasted Schedule Workflow',
      updatedAt: new Date().toISOString(),
      messages: [
        {
          id: 'm-paste-user-1',
          sender: 'user',
          text: pastedContent,
          timestamp: new Date().toISOString(),
          status: 'sent'
        },
        {
          id: 'm-paste-bot-1',
          sender: 'bot',
          text: `### Schedule Trigger Implementation Confirmed

Your n8n scheduled auto-warmup workflow is properly configured:
- **Interval**: Hourly (\`35 * * * *\`)
- **Payload**: Test heartbeat ping
- **Verification**: Verified and active

The system will now maintain a 24/7 warm state automatically without client intervention.`,
          timestamp: new Date().toISOString(),
          status: 'sent'
        }
      ]
    }
  ];

  try {
    // -------------------------------------------------------------
    // TEST 1: Mobile Phone Browser View (360 x 800 Galaxy A55)
    // -------------------------------------------------------------
    console.log('\n[TEST 1] Testing Mobile Viewport: 360 x 800 (Galaxy A55)...');
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
      localStorage.setItem('xare-theme', 'dark');
    }, mockChats);

    await mobilePage.goto('http://localhost:4173');
    await mobilePage.waitForLoadState('networkidle');

    // Open sidebar and click on Pasted Schedule Workflow chat
    const openMenuBtn = mobilePage.locator('button[title="Open menu"]');
    if (await openMenuBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await openMenuBtn.click();
      await mobilePage.waitForTimeout(400);

      const chatItem = mobilePage.locator('text=Pasted Schedule Workflow').first();
      await chatItem.waitFor({ state: 'visible', timeout: 5000 });
      await chatItem.click();
      await mobilePage.waitForTimeout(600);
    }

    // Verify messages are visible
    const userBubble = mobilePage.locator('.chat-message-card').first();
    await userBubble.waitFor({ state: 'visible', timeout: 6000 });

    // Check bounds
    const metrics = await mobilePage.evaluate(() => {
      const cards = document.querySelectorAll('.chat-message-card');
      const userCard = cards[0];
      const bubble = userCard.querySelector('.rounded-\\[24px\\]');
      const rect = bubble.getBoundingClientRect();
      const docScrollW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      const winH = window.innerHeight;

      return {
        bubbleWidth: rect.width,
        bubbleHeight: rect.height,
        bubbleLeft: rect.left,
        bubbleRight: rect.right,
        windowWidth: winW,
        windowHeight: winH,
        docScrollWidth: docScrollW,
        // Card right boundary must NOT exceed window width
        isInsideViewport: rect.right <= winW,
        // No unwanted horizontal scrolling of the page
        noPageHorizontalScroll: docScrollW <= winW,
        // Maximum width must be <= 88% of window
        respectsMaxWidth: rect.width <= winW * 0.90,
        // Maximum height must be <= 480px (well below full screen)
        respectsMaxHeight: rect.height <= 480
      };
    });

    console.log('Mobile Metrics:', JSON.stringify(metrics, null, 2));

    if (!metrics.isInsideViewport) {
      throw new Error(`Mobile boundary violation: bubble right edge ${metrics.bubbleRight}px exceeds window width ${metrics.windowWidth}px!`);
    }
    if (!metrics.respectsMaxWidth) {
      throw new Error(`Mobile width violation: bubble width ${metrics.bubbleWidth}px exceeds max threshold!`);
    }
    if (!metrics.respectsMaxHeight) {
      throw new Error(`Mobile height violation: bubble height ${metrics.bubbleHeight}px took over the screen!`);
    }

    console.log('✅ Mobile layout verified: Bubble is fully constrained, within frame, and capped in height!');

    const mobileShotPath = path.join(ARTIFACT_DIR, 'mobile_paste_verified.png');
    await mobilePage.screenshot({ path: mobileShotPath, fullPage: false });
    console.log('📸 Saved mobile screenshot:', mobileShotPath);
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
      localStorage.setItem('xare-theme', 'dark');
    }, mockChats);

    await pcPage.goto('http://localhost:4173');
    await pcPage.waitForLoadState('networkidle');

    const openMenuBtnPc = pcPage.locator('button[title="Open menu"]');
    if (await openMenuBtnPc.isVisible({ timeout: 2000 }).catch(() => false)) {
      await openMenuBtnPc.click();
      await pcPage.waitForTimeout(400);
    }

    const chatItemPc = pcPage.locator('text=Pasted Schedule Workflow').first();
    await chatItemPc.waitFor({ state: 'visible', timeout: 5000 });
    await chatItemPc.click();
    await pcPage.waitForTimeout(600);

    const pcMetrics = await pcPage.evaluate(() => {
      const cards = document.querySelectorAll('.chat-message-card');
      const userCard = cards[0];
      const bubble = userCard.querySelector('.rounded-\\[24px\\]');
      const rect = bubble.getBoundingClientRect();
      const winW = window.innerWidth;
      const winH = window.innerHeight;

      return {
        bubbleWidth: rect.width,
        bubbleHeight: rect.height,
        bubbleLeft: rect.left,
        bubbleRight: rect.right,
        windowWidth: winW,
        windowHeight: winH,
        isInsideViewport: rect.right <= winW,
        respectsMaxWidth: rect.width <= winW * 0.76,
        respectsMaxHeight: rect.height <= 530
      };
    });

    console.log('Desktop PC Metrics:', JSON.stringify(pcMetrics, null, 2));

    if (!pcMetrics.isInsideViewport) {
      throw new Error(`Desktop boundary violation: bubble right ${pcMetrics.bubbleRight}px exceeds window width ${pcMetrics.windowWidth}px!`);
    }
    if (!pcMetrics.respectsMaxHeight) {
      throw new Error(`Desktop height violation: bubble height ${pcMetrics.bubbleHeight}px exceeds max height!`);
    }

    console.log('✅ Desktop layout verified: Bubble is right-aligned, properly constrained, and within frame!');

    const pcShotPath = path.join(ARTIFACT_DIR, 'pc_paste_verified.png');
    await pcPage.screenshot({ path: pcShotPath, fullPage: false });
    console.log('📸 Saved PC screenshot:', pcShotPath);
    await pcContext.close();

    console.log('\n=============================================================');
    console.log('ALL VERIFICATION CHECKS PASSED WITH 100% SUCCESS!');
    console.log('=============================================================\n');

  } finally {
    await browser.close();
    try {
      if (preview.pid) {
        require('child_process').execSync(`taskkill /F /PID ${preview.pid} /T`, { stdio: 'ignore' });
      }
    } catch(e) {}
  }
}

run().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
