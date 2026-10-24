const { chromium } = require('playwright');
const { spawn, exec } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\alika\\.gemini\\antigravity\\brain\\1cb7ba5b-9988-4e50-80be-53f5895baf33';

async function testXareBidiE2E() {
  const rootDir = path.resolve(__dirname, '..');
  
  console.log('Starting Vite preview server on port 4173...');
  const preview = spawn('npx.cmd', ['vite', 'preview', '--port', '4173', '--strictPort'], {
    cwd: rootDir,
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
        if (attempts > 35) reject(new Error('Preview server timed out'));
        else setTimeout(check, 400);
      });
    };
    check();
  });

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    const sampleText = `### Round 2: ML + Statistics

| SCENARIO | CORE DIAGNOSIS & FIX | WHY? | EGYPTIAN ARABIC EXPLANATION |
| :--- | :--- | :--- | :--- |
| **1. 99% Fraud Model Missing Cases** | Inspect confusion matrix (false negatives), adjust decision threshold, use class weights or anomaly detection. | High accuracy is a deceptive metric on severe class imbalances; recall measures actual fraud caught. | الـ accuracy العالية مضللة مع الـ fraud. هركز على الـ Recall وأعتبر الـ threshold حسب التكلفة. |
| **2. Training vs Production Drop** | Check for overfitting, data leakage (future info), feature drift, and train-serving discrepancies. | Good training scores don't guarantee generalization to unseen real-world distributions. | غالباً فيه overfitting أو data leakage. وأراجع الـ validation هقارن أداء التدريب والـ features. |
| **3. Equal Accuracy, Different Recall** | Evaluate Precision, F1-score, PR-AUC, business cost of false positives vs. false negatives, and latency. | Business objectives dictate error tolerance; accuracy treats all misclassifications equally. | لو مش عايز أضيّع حالات مهمة أختر الـ precision الأعلى، بس لازم أراجع الـ recall وتكلفة الأخطاء. |
`;

    const mockChats = [
      {
        id: 'chat-bidi-test',
        title: 'ML Statistics Arabic Evaluation',
        updatedAt: new Date().toISOString(),
        messages: [
          {
            id: 'm-user-1',
            sender: 'user',
            text: 'ممكن تشرحلي المشاكل دي بالمصري مع مصطلحات الـ Machine Learning؟',
            timestamp: new Date().toISOString(),
            status: 'sent'
          },
          {
            id: 'm-bot-1',
            sender: 'bot',
            text: sampleText,
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

    const chatItem = page.locator('text=ML Statistics Arabic Evaluation').first();
    await chatItem.waitFor({ state: 'visible', timeout: 5000 });
    await chatItem.click();
    await page.waitForTimeout(1000);

    const table = page.locator('table').first();
    await table.waitFor({ state: 'visible', timeout: 8000 });
    console.log('✅ Found Table rendered in Xare chat!');

    // Inject suggestion buttons simulating triggerSuggestions
    await page.evaluate(() => {
      const sampleSuggestions = [
        "كيف يمكنني تطبيق 'Golden Interview Framework' عملياً عند مواجهة مشكلة معقدة في نظام الإنتاج؟",
        "ما هي أفضل الأدوات التي تنصح بها لمراقبة جودة مخرجات الـ LLMs وتجنب الـ Hallucinations؟"
      ];
      const bottomBar = document.querySelector('.chat-bottom-bar');
      if (bottomBar) {
        let sugContainer = bottomBar.querySelector('.flex.gap-2');
        if (!sugContainer) {
          sugContainer = document.createElement('div');
          sugContainer.className = 'flex gap-2 max-w-5xl mx-auto mb-3 overflow-x-auto chat-scroll pb-1 scrollbar-hide pointer-events-auto px-1';
          bottomBar.insertBefore(sugContainer, bottomBar.firstChild);
        }
        sugContainer.innerHTML = '';
        sampleSuggestions.forEach(sug => {
          const btn = document.createElement('button');
          const isArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(sug);
          btn.setAttribute('dir', isArabic ? 'rtl' : 'ltr');
          btn.className = 'whitespace-nowrap px-4 py-2 rounded-full text-[13px] font-medium border shadow-sm transition-all text-start bg-[#0c1324]/90 border-slate-700/60 text-blue-300';
          btn.textContent = sug;
          sugContainer.appendChild(btn);
        });
      }
    });

    await page.waitForTimeout(1000);

    // Verify DOM computed directions
    const checkReport = await page.evaluate(() => {
      const tbl = document.querySelector('table');
      const cells = Array.from(tbl.querySelectorAll('tbody tr td:last-child'));
      const buttons = Array.from(document.querySelectorAll('.chat-bottom-bar button.whitespace-nowrap'));

      return {
        arabicCells: cells.map(td => ({
          text: td.innerText.substring(0, 30),
          dir: td.getAttribute('dir'),
          computedDir: window.getComputedStyle(td).direction,
          textAlign: window.getComputedStyle(td).textAlign
        })),
        pills: buttons.map(b => ({
          text: b.innerText.substring(0, 30),
          dir: b.getAttribute('dir'),
          computedDir: window.getComputedStyle(b).direction
        }))
      };
    });

    console.log('BiDi Inspection Report:\n', JSON.stringify(checkReport, null, 2));

    // Desktop screenshot
    const pcScreenshotPath = path.join(ARTIFACT_DIR, 'xare_bidi_pc_verified.png');
    await page.screenshot({ path: pcScreenshotPath, fullPage: false });
    console.log('📸 Saved PC screenshot to:', pcScreenshotPath);

    // Mobile screenshot (360x800)
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

    const openMenuBtnMob = mobilePage.locator('button[title="Open menu"]');
    if (await openMenuBtnMob.isVisible({ timeout: 2000 }).catch(() => false)) {
      await openMenuBtnMob.click();
      await mobilePage.waitForTimeout(400);
    }

    const chatItemMob = mobilePage.locator('text=ML Statistics Arabic Evaluation').first();
    await chatItemMob.waitFor({ state: 'visible', timeout: 5000 });
    await chatItemMob.click();
    await mobilePage.waitForTimeout(1000);

    const mobileScreenshotPath = path.join(ARTIFACT_DIR, 'xare_bidi_mobile_verified.png');
    await mobilePage.screenshot({ path: mobileScreenshotPath, fullPage: false });
    console.log('📸 Saved Mobile screenshot to:', mobileScreenshotPath);

  } finally {
    await browser.close();
    if (preview.pid) {
      exec(`taskkill /F /PID ${preview.pid} /T`);
    }
  }
}

testXareBidiE2E().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
