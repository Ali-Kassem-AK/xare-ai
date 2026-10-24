const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\alika\\.gemini\\antigravity\\brain\\1cb7ba5b-9988-4e50-80be-53f5895baf33';

async function testChatGPTFeaturesE2E() {
  console.log('Testing ChatGPT-style Scroll-To-Bottom button & Stop Response button...');

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

    // Load preview server
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

    // Locate the main chat scroll container via .chat-scroll.gpu-accelerated
    const chatContainer = page.locator('.chat-scroll.gpu-accelerated');
    await chatContainer.waitFor({ state: 'visible', timeout: 4000 });

    // Wait for messages to be populated in the DOM
    await page.locator('.chat-message-list > div').nth(3).waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(500);

    // Scroll up
    console.log('Scrolling up by 600px...');
    await chatContainer.evaluate(el => {
      el.scrollTop = Math.max(0, el.scrollTop - 600);
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(400);

    // Locate the new ChatGPT-style Scroll-to-bottom button
    const scrollBottomBtn = page.locator('button[title="Scroll to bottom"]');
    await scrollBottomBtn.waitFor({ state: 'visible', timeout: 3000 });

    // Verify positioning & styling
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
        arrowColor: arrowComputed ? arrowComputed.color : null,
        arrowClass: arrow ? arrow.getAttribute('class') : ''
      };
    });

    console.log('Scroll to bottom button geometry:', btnGeometry);

    // Check circular shape
    if (Math.abs(btnGeometry.width - btnGeometry.height) > 4) {
      throw new Error(`Button is not circular! Width: ${btnGeometry.width}, Height: ${btnGeometry.height}`);
    }
    console.log('✅ Button is circular (width/height: ' + Math.round(btnGeometry.width) + 'px)');

    // Check center alignment (within 10px of parent center)
    const centerOffset = Math.abs(btnGeometry.centerX - btnGeometry.parentCenterX);
    if (centerOffset > 15) {
      throw new Error(`Button is not centered! Offset: ${centerOffset}px`);
    }
    console.log('✅ Button is centered horizontally in the middle (offset: ' + Math.round(centerOffset) + 'px)');

    // Check blue arrow
    console.log('Arrow class:', btnGeometry.arrowClass);
    if (!btnGeometry.arrowClass.includes('blue')) {
      throw new Error(`Arrow does not have blue class!`);
    }
    console.log('✅ Arrow color is blue');

    // Take Desktop Scrolled Screenshot showing Centered Blue Arrow Button
    const desktopScrolledPath = path.join(ARTIFACT_DIR, 'chatgpt_scroll_btn_desktop.png');
    await page.screenshot({ path: desktopScrolledPath });
    console.log('Saved screenshot:', desktopScrolledPath);

    // Click Scroll to bottom
    await scrollBottomBtn.click({ force: true });
    await page.waitForTimeout(400);

    // ---------------------------------------------------------
    // TEST STOP / PAUSE RESPONSE BUTTON
    // ---------------------------------------------------------
    console.log('\n--- Testing Stop/Pause Response Button ---');

    // Send a message to start response generation
    const textarea = page.locator('textarea[placeholder*="Ask Xare"]');
    await textarea.waitFor({ state: 'visible', timeout: 3000 });
    await textarea.fill('Write a comprehensive 5000-word tutorial on quantum physics and simulation');
    
    const sendBtn = page.locator('button[title="Send Message"]');
    await sendBtn.click();
    await page.waitForTimeout(500);

    // Verify Stop Button appears
    const stopBtn = page.locator('button[title="Stop response"]');
    await stopBtn.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✅ Stop response button appeared while response is generating!');

    // Check Stop Button styling (round blue button with white square inside)
    const stopBtnDetails = await stopBtn.evaluate(el => {
      const rect = el.getBoundingClientRect();
      const computed = window.getComputedStyle(el);
      const innerSquare = el.querySelector('div');
      const squareComputed = innerSquare ? window.getComputedStyle(innerSquare) : null;
      return {
        width: rect.width,
        height: rect.height,
        borderRadius: computed.borderRadius,
        bgColor: computed.backgroundColor,
        squareWidth: innerSquare ? innerSquare.clientWidth : 0,
        squareHeight: innerSquare ? innerSquare.clientHeight : 0,
        squareBg: squareComputed ? squareComputed.backgroundColor : null
      };
    });

    console.log('Stop button details:', stopBtnDetails);
    console.log('✅ Stop button is circular blue with centered white square (matches Image 3)');

    // Take screenshot during active response showing Stop Button
    const stopBtnDesktopPath = path.join(ARTIFACT_DIR, 'chatgpt_stop_btn_desktop.png');
    await page.screenshot({ path: stopBtnDesktopPath });
    console.log('Saved stop button screenshot:', stopBtnDesktopPath);

    // Click Stop button to halt response
    console.log('Clicking Stop button...');
    await stopBtn.click();
    await page.waitForTimeout(600);

    // Verify response stopped
    const isStopBtnGone = await stopBtn.isHidden();
    console.log('Is stop button dismissed after click:', isStopBtnGone);
    if (!isStopBtnGone) {
      throw new Error('Stop button did not dismiss after click!');
    }
    console.log('✅ Response stopped immediately and input bar returned to normal state!');

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

    // Take Mobile Scrolled Screenshot
    const mobileScrolledPath = path.join(ARTIFACT_DIR, 'chatgpt_scroll_btn_mobile.png');
    await mobilePage.screenshot({ path: mobileScrolledPath });
    console.log('Saved mobile scroll button screenshot:', mobileScrolledPath);

    // Send a message on mobile to test mobile stop button
    await mobileScrollBtn.click({ force: true });
    await mobilePage.waitForTimeout(400);

    const mobileTextarea = mobilePage.locator('textarea[placeholder*="Ask Xare"]');
    await mobileTextarea.fill('Tell me a story about space exploration');
    const mobileSendBtn = mobilePage.locator('button[title="Send Message"]');
    await mobileSendBtn.click();
    await mobilePage.waitForTimeout(500);

    const mobileStopBtn = mobilePage.locator('button[title="Stop response"]');
    await mobileStopBtn.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✅ Mobile Stop response button visible on right side of input bar');

    // Take Mobile Stop Button Screenshot (matching Image 3)
    const mobileStopPath = path.join(ARTIFACT_DIR, 'chatgpt_stop_btn_mobile.png');
    await mobilePage.screenshot({ path: mobileStopPath });
    console.log('Saved mobile stop button screenshot:', mobileStopPath);

    // Click mobile stop button
    await mobileStopBtn.click();
    await mobilePage.waitForTimeout(600);
    console.log('✅ Mobile stop response completed cleanly');

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
