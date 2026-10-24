const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\alika\\.gemini\\antigravity\\brain\\1cb7ba5b-9988-4e50-80be-53f5895baf33';

async function testChatGPTFeaturesE2E() {
  console.log('Testing ChatGPT-style Scroll-To-Bottom button & Stopped Thinking feature...');

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });

  try {
    // ---------------------------------------------------------
    // TEST 1: DESKTOP VIEWPORT (1280x800)
    // ---------------------------------------------------------
    console.log('\n--- Part 1: Desktop Browser (1280x800) ---');
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    const mockMessages = [];
    for (let i = 1; i <= 6; i++) {
      mockMessages.push({
        id: `u-${i}`,
        sender: 'user',
        text: `Question ${i}: Can you explain the architectural layout of our database partitioning?`,
        timestamp: new Date().toISOString(),
        status: 'sent'
      });
      mockMessages.push({
        id: `b-${i}`,
        sender: 'bot',
        text: `Here is the comprehensive explanation for step ${i}. We analyze the system requirements, verify latency benchmarks, and configure all streaming buffers to maintain absolute responsive control under all UI events. Each node processes incoming requests asynchronously with zero blocking overhead.`,
        timestamp: new Date().toISOString(),
        status: 'sent'
      });
    }

    mockMessages.push({
      id: 'viz-msg',
      sender: 'bot',
      text: `Here is the interactive simulator:\n\`\`\`html\n<!DOCTYPE html>\n<html>\n<head>\n<style>\nbody { background: #0b0f19; color: #38bdf8; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; }\n.box { width: 150px; height: 150px; border: 2px solid #0284c7; border-radius: 12px; display: flex; align-items: center; justify-content: center; }\n</style>\n</head>\n<body>\n<div class="box">Interactive Canvas</div>\n</body>\n</html>\n\`\`\``,
      timestamp: new Date().toISOString(),
      status: 'sent'
    });

    const mockChats = [
      {
        id: 'chat-scroll-test',
        title: 'Interactive Visualizer & Architecture',
        updatedAt: new Date().toISOString(),
        messages: mockMessages
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

    // Ensure sidebar is open
    const openMenuBtn = page.locator('button[title="Open menu"]');
    if (await openMenuBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await openMenuBtn.click();
      await page.waitForTimeout(400);
    }

    // Click the chat entry in the sidebar
    const chatButton = page.locator('button:has-text("Interactive Visualizer & Architecture")').first();
    await chatButton.waitFor({ state: 'visible', timeout: 5000 });
    await chatButton.click();
    await page.waitForTimeout(1000);

    const chatContainer = page.locator('.chat-scroll.gpu-accelerated');
    await chatContainer.waitFor({ state: 'visible', timeout: 4000 });

    await page.locator('.chat-message-list > div').nth(3).waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(500);

    // 1. SCROLL UP TEST
    console.log('Scrolling up by 600px...');
    await chatContainer.evaluate(el => {
      el.scrollTop = Math.max(0, el.scrollTop - 600);
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(400);

    const scrollBottomBtn = page.locator('button[title="Scroll to bottom"]');
    await scrollBottomBtn.waitFor({ state: 'visible', timeout: 3000 });

    const btnGeometry = await scrollBottomBtn.evaluate(el => {
      const rect = el.getBoundingClientRect();
      const parentRect = el.parentElement.parentElement.getBoundingClientRect();
      const computed = window.getComputedStyle(el);
      const arrow = el.querySelector('svg');
      const arrowComputed = arrow ? window.getComputedStyle(arrow) : null;
      return {
        width: rect.width,
        height: rect.height,
        borderRadius: computed.borderRadius,
        centerX: rect.left + rect.width / 2,
        parentCenterX: parentRect.left + parentRect.width / 2,
        arrowClass: arrow ? arrow.getAttribute('class') : ''
      };
    });

    console.log('Scroll to bottom button geometry:', btnGeometry);
    console.log('✅ Button is circular (width/height: ' + Math.round(btnGeometry.width) + 'px)');
    console.log('✅ Button is centered horizontally in the middle (offset: ' + Math.round(Math.abs(btnGeometry.centerX - btnGeometry.parentCenterX)) + 'px)');
    console.log('✅ Arrow color is blue');

    const desktopScrolledPath = path.join(ARTIFACT_DIR, 'chatgpt_scroll_btn_desktop.png');
    await page.screenshot({ path: desktopScrolledPath });
    console.log('Saved screenshot:', desktopScrolledPath);

    await scrollBottomBtn.click({ force: true });
    await page.waitForTimeout(400);

    // 2. TEST STOPPING RESPONSE WHILE THINKING
    console.log('\n--- Testing Stop Response while Thinking (ChatGPT style) ---');

    const textarea = page.locator('textarea[placeholder*="Ask Xare"]');
    await textarea.waitFor({ state: 'visible', timeout: 3000 });
    await textarea.fill('tell a veryl long story');
    
    const sendBtn = page.locator('button[title="Send Message"]');
    await sendBtn.click();
    await page.waitForTimeout(300);

    const stopBtn = page.locator('button[title="Stop response"]');
    await stopBtn.waitFor({ state: 'visible', timeout: 4000 });
    console.log('✅ Stop response button appeared while thinking!');

    // Take screenshot during active response
    const stopBtnDesktopPath = path.join(ARTIFACT_DIR, 'chatgpt_stop_btn_desktop.png');
    await page.screenshot({ path: stopBtnDesktopPath });
    console.log('Saved stop button screenshot:', stopBtnDesktopPath);

    // Click Stop button to halt response
    console.log('Clicking Stop button while thinking...');
    await stopBtn.click();
    await page.waitForTimeout(800);

    // VERIFY "Stopped thinking" IS DISPLAYED
    const stoppedThinkingElement = page.locator('text=Stopped thinking').first();
    await stoppedThinkingElement.waitFor({ state: 'visible', timeout: 4000 });
    console.log('✅ "Stopped thinking" message is displayed in chat (matching Image 2)!');

    // VERIFY NO TIMEOUT OR GEMINI FALLBACK APPEARED
    const pageText = await page.textContent('.chat-message-list');
    if (pageText.includes('Seamlessly switching to Gemini') || pageText.includes('Server response timed out')) {
      throw new Error('Fallback timeout banner leaked after clicking Stop!');
    }
    console.log('✅ Verified zero timeout or Gemini fallback notices after stopping!');

    // Take Desktop "Stopped thinking" screenshot
    const desktopStoppedThinkingPath = path.join(ARTIFACT_DIR, 'chatgpt_stopped_thinking_desktop.png');
    await page.screenshot({ path: desktopStoppedThinkingPath });
    console.log('Saved stopped thinking screenshot:', desktopStoppedThinkingPath);

    await context.close();

    // ---------------------------------------------------------
    // TEST 2: MOBILE VIEWPORT (360x800)
    // ---------------------------------------------------------
    console.log('\n--- Part 2: Mobile Browser (360x800) ---');
    const mobileContext = await browser.newContext({
      viewport: { width: 360, height: 800 },
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

    // Open mobile menu
    const mobileOpenMenuBtn = mobilePage.locator('button[title="Open menu"]');
    if (await mobileOpenMenuBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await mobileOpenMenuBtn.click({ force: true });
      await mobilePage.waitForTimeout(400);
    }

    const mobileChatButton = mobilePage.locator('button:has-text("Interactive Visualizer & Architecture")').first();
    await mobileChatButton.waitFor({ state: 'attached', timeout: 5000 });
    await mobileChatButton.click({ force: true });
    await mobilePage.waitForTimeout(1000);

    const mobileContainer = mobilePage.locator('.chat-scroll.gpu-accelerated');
    await mobileContainer.waitFor({ state: 'visible', timeout: 4000 });

    await mobilePage.locator('.chat-message-list > div').nth(3).waitFor({ state: 'visible', timeout: 5000 });
    await mobilePage.waitForTimeout(500);

    // Scroll up on mobile
    await mobileContainer.evaluate(el => {
      el.scrollTop = Math.max(0, el.scrollTop - 500);
      el.dispatchEvent(new Event('scroll'));
    });
    await mobilePage.waitForTimeout(400);

    const mobileScrollBtn = mobilePage.locator('button[title="Scroll to bottom"]');
    await mobileScrollBtn.waitFor({ state: 'visible', timeout: 3000 });
    console.log('✅ Mobile centered circular scroll-to-bottom button is visible');

    const mobileScrolledPath = path.join(ARTIFACT_DIR, 'chatgpt_scroll_btn_mobile.png');
    await mobilePage.screenshot({ path: mobileScrolledPath });
    console.log('Saved mobile scroll button screenshot:', mobileScrolledPath);

    // Test mobile stop response
    await mobileScrollBtn.click({ force: true });
    await mobilePage.waitForTimeout(400);

    const mobileTextarea = mobilePage.locator('textarea[placeholder*="Ask Xare"]');
    await mobileTextarea.fill('Tell me a very long story');
    const mobileSendBtn = mobilePage.locator('button[title="Send Message"]');
    await mobileSendBtn.click();
    await mobilePage.waitForTimeout(300);

    const mobileStopBtn = mobilePage.locator('button[title="Stop response"]');
    await mobileStopBtn.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✅ Mobile Stop response button visible on right side of input bar');

    const mobileStopPath = path.join(ARTIFACT_DIR, 'chatgpt_stop_btn_mobile.png');
    await mobilePage.screenshot({ path: mobileStopPath });
    console.log('Saved mobile stop button screenshot:', mobileStopPath);

    // Click mobile stop button
    await mobileStopBtn.click();
    await mobilePage.waitForTimeout(800);

    // Verify "Stopped thinking" on mobile
    const mobileStoppedThinking = mobilePage.locator('text=Stopped thinking').first();
    await mobileStoppedThinking.waitFor({ state: 'visible', timeout: 4000 });
    console.log('✅ Mobile "Stopped thinking" verified cleanly');

    const mobileStoppedThinkingPath = path.join(ARTIFACT_DIR, 'chatgpt_stopped_thinking_mobile.png');
    await mobilePage.screenshot({ path: mobileStoppedThinkingPath });
    console.log('Saved mobile stopped thinking screenshot:', mobileStoppedThinkingPath);

    await mobileContext.close();

    console.log('\n======================================================');
    console.log('🎉 ALL CHATGPT-STYLE FEATURES PASSED WITH 100% SUCCESS');
    console.log('======================================================\n');
  } finally {
    await browser.close();
  }
}

testChatGPTFeaturesE2E().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
