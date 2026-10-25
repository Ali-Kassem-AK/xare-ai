const { chromium } = require('playwright');
const path = require('path');
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
    const page = await context.newPage();

    // Start vite preview or navigate to local server
    console.log('Navigating to http://localhost:4173...');
    await page.goto('http://localhost:4173', { waitUntil: 'networkidle', timeout: 30000 });

    // Handle guest login if present
    const guestBtn = page.locator('button:has-text("Continue as Guest")');
    if (await guestBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await guestBtn.click();
      await page.waitForTimeout(1000);
    }

    // Locate chat textarea
    const textarea = page.locator('textarea');
    await textarea.waitFor({ state: 'visible', timeout: 15000 });
    await textarea.fill('Hello world, tell me a 1-sentence joke.');
    await textarea.press('Enter');

    console.log('Sent initial message, waiting for user bubble...');
    // Locate the user message card
    const userCard = page.locator('.chat-message-card.justify-end').first();
    await userCard.waitFor({ state: 'visible', timeout: 10000 });

    // Hover over user card to reveal action buttons
    await userCard.hover();
    await page.waitForTimeout(500);

    // Look for edit prompt button (pencil)
    const editBtn = page.locator('button[title="Edit prompt"]').first();
    await editBtn.waitFor({ state: 'visible', timeout: 5000 });
    console.log('Clicking Edit prompt button...');
    await editBtn.click();

    await page.waitForTimeout(800);

    // Check for "Cancel" and "Send" buttons
    const cancelBtn = page.locator('button:has-text("Cancel")').first();
    const sendBtn = page.locator('button:has-text("Send")').first();

    assert.ok(await cancelBtn.isVisible(), 'Cancel button should be visible in edit mode');
    assert.ok(await sendBtn.isVisible(), 'Send button should be visible in edit mode');
    console.log('✅ Found Cancel and Send buttons inside modern edit container!');

    // Capture screenshot of the edit prompt UI
    const screenshotPath = 'C:/Users/alika/.gemini/antigravity/brain/1cb7ba5b-9988-4e50-80be-53f5895baf33/chatgpt_edit_prompt_modern.png';
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Saved screenshot to ${screenshotPath}`);

    // Test editing text and clicking Send
    const editTextarea = userCard.locator('textarea').first();
    await editTextarea.fill('Hello world, give me 3 quick tips for learning TypeScript.');
    await page.waitForTimeout(400);

    console.log('Clicking Send button...');
    await sendBtn.click();
    await page.waitForTimeout(1500);

    // Verify user card updated
    const updatedText = await userCard.textContent();
    assert.ok(updatedText.includes('TypeScript'), 'User card should reflect updated text after Send');
    console.log('✅ Edit prompt submitted and updated user card successfully!');

    console.log('\nALL EDIT PROMPT UI TESTS PASSED WITH 100% SUCCESS!');
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
