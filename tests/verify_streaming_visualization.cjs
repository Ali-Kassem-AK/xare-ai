const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ARTIFACT_DIR = 'C:\\Users\\alika\\.gemini\\antigravity\\brain\\1cb7ba5b-9988-4e50-80be-53f5895baf33';

async function run() {
  console.log('=== STARTING STREAMING VISUALIZATION VERIFICATION ===');

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
          console.log('Preview server ready on port 4173');
          resolve();
        } else {
          setTimeout(check, 400);
        }
      }).on('error', () => {
        if (attempts > 30) reject(new Error('Preview server timed out'));
        else setTimeout(check, 400);
      });
    };
    check();
  });

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    const vizResponseText = `### ما الذي يجب مراقبته بعد إطلاق النظام في الإنتاج؟ (Monitoring):

- **ليه؟** الموديل ممكن يشتغل تقنياً (Uptime) بس بيدي إجابات غلط أو بيكلف فلوس طائلة من غير ما تحس.
- **بالمصري:** بنراقب 5 حاجات رئيسية: الاستقرار والأخطاء (Reliability)، السرعة والـ (Latency Performance)، التكلفة واستهلاك الـ (Tokens Cost)، جودة الإجابات والـ (Retrieval AI Quality)، وأمان وداتا وسرية النظام (Data & Security).

\`\`\`html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui, sans-serif; background: #0b1120; color: #f8fafc; padding: 20px; text-align: center; }
    .card { background: rgba(30, 41, 59, 0.7); border: 1px solid #38bdf8; border-radius: 16px; padding: 24px; max-width: 500px; margin: 0 auto; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h2 { color: #38bdf8; font-size: 20px; margin-bottom: 12px; }
    p { font-size: 14px; line-height: 1.6; color: #cbd5e1; }
    .badge { display: inline-block; background: #0369a1; color: #e0f2fe; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: bold; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>💡 الخلاصة الذهبية للمقابلات</h2>
    <p>الإجابة الصح مش هي اسم أداة أو مكتبة، دي طريقتك في تحليل المشكلة من أولها لآخرها في مقابلات AI/ML: <b>Trade-offs</b></p>
    <div class="badge">Monitoring In Production</div>
  </div>
</body>
</html>
\`\`\``;

    const mockChats = [
      {
        id: 'chat-streaming-viz',
        title: 'Production Monitoring & Visualization',
        updatedAt: new Date().toISOString(),
        messages: [
          {
            id: 'm-user-1',
            sender: 'user',
            text: 'ما الذي يجب مراقبته بعد إطلاق النظام في الإنتاج؟ اعرضلي كمان كارت تفاعلي ملخص للخلاصة',
            timestamp: new Date().toISOString(),
            status: 'sent'
          },
          {
            id: 'm-bot-1',
            sender: 'bot',
            text: vizResponseText,
            timestamp: new Date().toISOString(),
            status: 'sent'
          }
        ]
      }
    ];

    await page.goto('http://localhost:4173');
    await page.evaluate((chats) => {
      localStorage.setItem('xare_active_session', 'guest');
      localStorage.setItem('xare_chats_guest-user', JSON.stringify(chats));
      localStorage.setItem('xare-theme', 'dark');
    }, mockChats);

    await page.goto('http://localhost:4173');
    await page.waitForLoadState('networkidle');

    const openMenuBtn = page.locator('button[title="Open menu"]');
    if (await openMenuBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await openMenuBtn.click();
      await page.waitForTimeout(400);
    }

    const chatItem = page.locator('text=Production Monitoring & Visualization').first();
    await chatItem.waitFor({ state: 'visible', timeout: 5000 });
    await chatItem.click();
    await page.waitForTimeout(1000);

    // Verify that the response text and live preview iframe exist
    const arabicText = page.locator('text=بنراقب 5 حاجات رئيسية');
    await arabicText.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✅ Found Arabic message text in chat');

    // Verify live preview iframe
    const iframe = page.locator('iframe[title="Interactive Visualizer Sandbox"]').first();
    await iframe.waitFor({ state: 'visible', timeout: 8000 });
    console.log('✅ Interactive live preview iframe rendered successfully');

    // Verify that the old fake "Building live sandbox..." window is NOT rendered
    const fakeWindow = await page.locator('text=Building live sandbox...').count();
    console.log('Fake window occurrences (must be 0):', fakeWindow);
    if (fakeWindow > 0) {
      throw new Error('FAILED: Fake placeholder window was still present!');
    }

    // Capture screenshot of completed visualization
    const completedShotPath = path.join(ARTIFACT_DIR, 'streaming_visualization_completed.png');
    await page.screenshot({ path: completedShotPath, fullPage: false });
    console.log('📸 Saved completed visualization screenshot:', completedShotPath);

    // Also test Mobile Viewport (360 x 800)
    console.log('\nTesting Mobile Viewport (360 x 800)...');
    const mobileContext = await browser.newContext({
      viewport: { width: 360, height: 800 },
      deviceScaleFactor: 2
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

    const mobileMenu = mobilePage.locator('button[title="Open menu"]');
    if (await mobileMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
      await mobileMenu.click();
      await mobilePage.waitForTimeout(400);
      const mItem = mobilePage.locator('text=Production Monitoring & Visualization').first();
      await mItem.click();
      await mobilePage.waitForTimeout(800);
    }

    const mobileIframe = mobilePage.locator('iframe[title="Interactive Visualizer Sandbox"]').first();
    await mobileIframe.waitFor({ state: 'visible', timeout: 8000 });
    console.log('✅ Mobile live preview iframe verified');

    const mobileShotPath = path.join(ARTIFACT_DIR, 'streaming_visualization_mobile.png');
    await mobilePage.screenshot({ path: mobileShotPath, fullPage: false });
    console.log('📸 Saved mobile visualization screenshot:', mobileShotPath);

    await context.close();
    await mobileContext.close();

    console.log('\n=============================================================');
    console.log('ALL STREAMING VISUALIZATION TESTS PASSED WITH 100% SUCCESS!');
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
