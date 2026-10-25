const { chromium } = require('playwright');

(async () => {
  let browser = null;
  try {
    try {
      browser = await chromium.launch({ headless: true });
    } catch (e) {
      browser = await chromium.launch({ channel: 'chrome', headless: true });
    }

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    console.log('Navigating to http://localhost:4173...');
    await page.goto('http://localhost:4173', { waitUntil: 'networkidle', timeout: 30000 });

    const guestBtn = page.locator('button:has-text("Continue as Guest")');
    if (await guestBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await guestBtn.click();
      await page.waitForTimeout(1000);
    }

    const textarea = page.locator('textarea');
    await textarea.waitFor({ state: 'visible', timeout: 15000 });

    // 1. Screenshot Empty State (Mic button visible)
    const chatBar = page.locator('form.chat-input-form');
    await chatBar.screenshot({
      path: 'C:/Users/alika/.gemini/antigravity/brain/1cb7ba5b-9988-4e50-80be-53f5895baf33/chatgpt_style_button_empty.png'
    });
    console.log('Saved chatgpt_style_button_empty.png');

    // 2. Screenshot Typing State (Send button visible)
    await textarea.fill('Hello Xare!');
    await page.waitForTimeout(300);
    await chatBar.screenshot({
      path: 'C:/Users/alika/.gemini/antigravity/brain/1cb7ba5b-9988-4e50-80be-53f5895baf33/chatgpt_style_button_send.png'
    });
    console.log('Saved chatgpt_style_button_send.png');

    // 3. Screenshot Streaming State (Stop button visible)
    await textarea.press('Enter');
    await page.waitForTimeout(800);
    await chatBar.screenshot({
      path: 'C:/Users/alika/.gemini/antigravity/brain/1cb7ba5b-9988-4e50-80be-53f5895baf33/chatgpt_style_button_stop.png'
    });
    console.log('Saved chatgpt_style_button_stop.png');

    // Wait and stop response
    const stopBtn = page.locator('button[title="Stop response"]');
    if (await stopBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await stopBtn.click();
      console.log('Clicked stop response button');
    }

    console.log('\n======================================================');
    console.log('BUTTON SIZING VISUAL VERIFICATION COMPLETE');
    console.log('======================================================\n');
  } catch (err) {
    console.error('Visual verification error:', err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
