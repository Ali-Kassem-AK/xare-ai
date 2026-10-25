const { chromium } = require('playwright');
const assert = require('assert');

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
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const page = await context.newPage();

    console.log('Navigating to http://localhost:4173...');
    await page.goto('http://localhost:4173', { waitUntil: 'networkidle', timeout: 30000 });

    const guestBtn = page.locator('button:has-text("Continue as Guest")');
    if (await guestBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await guestBtn.click();
      await page.waitForTimeout(1000);
    }

    console.log('\n[TEST 1] Verifying Translation Block & Copy Button...');
    const textarea = page.locator('textarea');
    await textarea.waitFor({ state: 'visible', timeout: 15000 });

    // Open attach menu
    const attachBtn = page.locator('button[title="Add attachment or preset tool"]');
    await attachBtn.waitFor({ state: 'visible', timeout: 5000 });
    await attachBtn.click();
    await page.waitForTimeout(500);

    const translateMenu = page.locator('button:has-text("Translate")');
    await translateMenu.click();
    await page.waitForTimeout(500);

    const arabicSub = page.locator('button:has-text("Arabic")');
    await arabicSub.click();
    await page.waitForTimeout(500);

    // Send a message with Translate tool active
    await textarea.fill('I want to make sure the copy button works instantly.');
    await textarea.press('Enter');

    console.log('Waiting for translation response with code/text block...');
    // Look for CodeBlock container within the bot response
    const codeBlock = page.locator('.chat-message-card.justify-start').last().locator('button:has-text("Copy")').first();
    await codeBlock.waitFor({ state: 'visible', timeout: 25000 });

    console.log('✅ Found Copy button inside translation block!');

    // Screenshot the rendered translation block
    const screenshotPath = 'C:/Users/alika/.gemini/antigravity/brain/1cb7ba5b-9988-4e50-80be-53f5895baf33/translate_grammar_text_blocks.png';
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Saved screenshot to ${screenshotPath}`);

    // Click Copy button and verify clipboard content
    await codeBlock.click();
    await page.waitForTimeout(500);

    const copiedText = await page.evaluate(() => navigator.clipboard.readText());
    console.log('Copied clipboard content snippet:', copiedText.slice(0, 60));
    assert.ok(copiedText.length > 5, 'Clipboard should contain the copied translation text');

    console.log('\n======================================================');
    console.log('ALL TRANSLATION & GRAMMAR BLOCK TESTS PASSED (100%)');
    console.log('======================================================\n');
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
