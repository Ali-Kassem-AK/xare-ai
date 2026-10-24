const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\alika\\.gemini\\antigravity\\brain\\1cb7ba5b-9988-4e50-80be-53f5895baf33';

async function testScrollFreedomE2E() {
  console.log('Connecting to server on http://localhost:4173...');
  
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });

  try {
    console.log('\n--- Test 1: Desktop Browser (1280x800) ---');
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    // Prepare a long chat with code visualization
    const mockMessages = [];
    for (let i = 1; i <= 6; i++) {
      mockMessages.push({
        id: `u-${i}`,
        sender: 'user',
        text: `Question ${i}: Can you explain step ${i} of our architectural simulation model?`,
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

    // Locate the main chat scroll container via .chat-scroll.gpu-accelerated
    const chatContainer = page.locator('.chat-scroll.gpu-accelerated');
    await chatContainer.waitFor({ state: 'visible', timeout: 4000 });

    // Wait for messages to be populated in the DOM
    await page.locator('.chat-message-list > div').nth(3).waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(500);

    // Verify initial scroll
    const initialScroll = await chatContainer.evaluate(el => ({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      distanceToBottom: el.scrollHeight - el.scrollTop - el.clientHeight
    }));
    console.log('Initial chat container dimensions:', initialScroll);

    if (initialScroll.scrollHeight <= initialScroll.clientHeight) {
      throw new Error(`Chat container is not scrollable! scrollHeight: ${initialScroll.scrollHeight}, clientHeight: ${initialScroll.clientHeight}`);
    }

    // 1. SCROLL UP TEST: Scroll up 600px
    console.log('Scrolling up by 600px...');
    await chatContainer.evaluate(el => {
      el.scrollTop = Math.max(0, el.scrollTop - 600);
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(300);

    const scrolledPos = await chatContainer.evaluate(el => ({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      distanceToBottom: el.scrollHeight - el.scrollTop - el.clientHeight
    }));
    console.log('Position after scrolling up:', scrolledPos);

    if (scrolledPos.distanceToBottom <= 25) {
      throw new Error(`Failed to scroll up! distanceToBottom is ${scrolledPos.distanceToBottom}`);
    }
    console.log('✅ Successfully scrolled up away from bottom (distance: ' + Math.round(scrolledPos.distanceToBottom) + 'px)');

    // 2. VERIFY FLOATING "Scroll to bottom" BUTTON IS VISIBLE
    const scrollBottomBtn = page.locator('button[title="Scroll to bottom"]');
    await scrollBottomBtn.waitFor({ state: 'visible', timeout: 3000 });
    console.log('✅ Floating "Scroll to bottom" pill button is visible');

    // Take Desktop Scrolled-Up Screenshot
    const desktopScrolledPath = path.join(ARTIFACT_DIR, 'scroll_freedom_desktop_scrolled.png');
    await page.screenshot({ path: desktopScrolledPath });
    console.log('Saved screenshot:', desktopScrolledPath);

    // 3. SIMULATE ACTIVE LOADING / STREAMING FRAMES WHILE SCROLLED UP
    console.log('Simulating 30 active streaming/loading ticks while user is scrolled up...');
    const retainedPosition = await page.evaluate(async () => {
      const container = document.querySelector('.chat-scroll.gpu-accelerated');
      const startScrollTop = container.scrollTop;

      // Simulate 30 animation frames of streaming/loading ticks
      for (let f = 0; f < 30; f++) {
        window.dispatchEvent(new CustomEvent('xare-mock-stream-tick'));
        await new Promise(r => requestAnimationFrame(r));
      }

      return {
        startScrollTop,
        endScrollTop: container.scrollTop,
        wasRestricted: Math.abs(container.scrollTop - startScrollTop) < 2
      };
    });

    console.log('Streaming tick simulation result:', retainedPosition);
    if (!retainedPosition.wasRestricted) {
      throw new Error(`Scroll position was forcibly altered during streaming! Start: ${retainedPosition.startScrollTop}, End: ${retainedPosition.endScrollTop}`);
    }
    console.log('✅ Scroll position remained 100% UNTOUCHED during streaming/loading ticks! Zero snap-back or freeze.');

    // 4. TEST CLICKING "Scroll to bottom"
    console.log('Clicking "Scroll to bottom" button...');
    await scrollBottomBtn.click({ force: true });
    await page.waitForTimeout(500);

    const returnedPos = await chatContainer.evaluate(el => ({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      distanceToBottom: el.scrollHeight - el.scrollTop - el.clientHeight
    }));
    console.log('Position after clicking scroll to bottom:', returnedPos);

    if (returnedPos.distanceToBottom > 20) {
      throw new Error(`Did not return to bottom! distanceToBottom is ${returnedPos.distanceToBottom}`);
    }
    console.log('✅ Successfully returned to bottom smoothly!');

    // Take Desktop Bottom Screenshot
    const desktopBottomPath = path.join(ARTIFACT_DIR, 'scroll_freedom_desktop_bottom.png');
    await page.screenshot({ path: desktopBottomPath });
    console.log('Saved screenshot:', desktopBottomPath);

    await context.close();

    // --- Test 2: Mobile Viewport (360x800) ---
    console.log('\n--- Test 2: Mobile Browser (360x800) ---');
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

    // On mobile, open sidebar menu
    const mobileOpenMenuBtn = mobilePage.locator('button[title="Open menu"]');
    await mobileOpenMenuBtn.waitFor({ state: 'visible', timeout: 5000 });
    await mobileOpenMenuBtn.click();
    await mobilePage.waitForTimeout(400);

    const mobileChatButton = mobilePage.locator('button:has-text("Interactive Visualizer & Architecture")').first();
    await mobileChatButton.waitFor({ state: 'visible', timeout: 5000 });
    await mobileChatButton.click();
    await mobilePage.waitForTimeout(1000);

    const mobileContainer = mobilePage.locator('.chat-scroll.gpu-accelerated');
    await mobileContainer.waitFor({ state: 'visible', timeout: 4000 });

    await mobilePage.locator('.chat-message-list > div').nth(3).waitFor({ state: 'visible', timeout: 5000 });
    await mobilePage.waitForTimeout(500);

    const mobileInitialScroll = await mobileContainer.evaluate(el => ({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      distanceToBottom: el.scrollHeight - el.scrollTop - el.clientHeight
    }));
    console.log('Mobile initial scroll dimensions:', mobileInitialScroll);

    // Scroll up on mobile
    console.log('Scrolling up on mobile by 500px...');
    await mobileContainer.evaluate(el => {
      el.scrollTop = Math.max(0, el.scrollTop - 500);
      el.dispatchEvent(new Event('scroll'));
    });
    await mobilePage.waitForTimeout(300);

    const mobileScrolledPos = await mobileContainer.evaluate(el => ({
      scrollTop: el.scrollTop,
      distanceToBottom: el.scrollHeight - el.scrollTop - el.clientHeight
    }));
    console.log('Mobile position after scrolling up:', mobileScrolledPos);

    if (mobileScrolledPos.distanceToBottom <= 25) {
      throw new Error(`Mobile failed to scroll up! distanceToBottom is ${mobileScrolledPos.distanceToBottom}`);
    }
    console.log('✅ Mobile successfully scrolled up away from bottom');

    const mobileScrollBtn = mobilePage.locator('button[title="Scroll to bottom"]');
    await mobileScrollBtn.waitFor({ state: 'visible', timeout: 3000 });
    console.log('✅ Mobile "Scroll to bottom" button is visible');

    // Take Mobile Scrolled Screenshot
    const mobileScrolledPath = path.join(ARTIFACT_DIR, 'scroll_freedom_mobile_scrolled.png');
    await mobilePage.screenshot({ path: mobileScrolledPath });
    console.log('Saved mobile screenshot:', mobileScrolledPath);

    // Click return to bottom on mobile
    await mobileScrollBtn.click({ force: true });
    await mobilePage.waitForTimeout(500);

    const mobileReturnedPos = await mobileContainer.evaluate(el => ({
      scrollTop: el.scrollTop,
      distanceToBottom: el.scrollHeight - el.scrollTop - el.clientHeight
    }));
    console.log('Mobile position after returning to bottom:', mobileReturnedPos);

    if (mobileReturnedPos.distanceToBottom > 20) {
      throw new Error(`Mobile did not return to bottom! distanceToBottom is ${mobileReturnedPos.distanceToBottom}`);
    }
    console.log('✅ Mobile returned to bottom successfully');

    // Take Mobile Bottom Screenshot
    const mobileBottomPath = path.join(ARTIFACT_DIR, 'scroll_freedom_mobile_bottom.png');
    await mobilePage.screenshot({ path: mobileBottomPath });
    console.log('Saved mobile bottom screenshot:', mobileBottomPath);

    await mobileContext.close();

    console.log('\n======================================================');
    console.log('🎉 ALL SCROLL FREEDOM E2E TESTS PASSED WITH 100% SUCCESS');
    console.log('======================================================\n');
  } finally {
    await browser.close();
  }
}

testScrollFreedomE2E().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
