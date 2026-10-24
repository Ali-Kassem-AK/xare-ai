const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\alika\\.gemini\\antigravity\\brain\\1cb7ba5b-9988-4e50-80be-53f5895baf33';

async function verifyDisabledButtons() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // Standalone HTML testing the exact CodeBlock rendering with disabled styling in dark mode
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    background-color: #030407;
    color: #f1f5f9;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 30px;
  }
  .card {
    border-radius: 16px;
    border: 1px solid rgba(30, 41, 59, 0.9);
    background-color: #050810;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    overflow: hidden;
    max-width: 900px;
    margin: 20px auto;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: rgba(8, 12, 22, 0.95);
    border-bottom: 1px solid rgba(30, 41, 59, 0.8);
    user-select: none;
  }
  .badge {
    padding: 2px 10px;
    border-radius: 9999px;
    font-size: 11px;
    font-family: monospace;
    font-weight: bold;
    text-transform: uppercase;
    background: rgba(8, 47, 73, 0.7);
    color: #22d3ee;
    border: 1px solid rgba(8, 145, 178, 0.4);
  }
  .btn-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .btn-disabled {
    opacity: 0.35;
    cursor: not-allowed;
    pointer-events: none;
    background: rgba(15, 23, 42, 0.4);
    color: #64748b;
    border: 1px solid rgba(30, 41, 59, 0.4);
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .btn-active-primary {
    background: rgba(6, 182, 212, 0.15);
    color: #67e8f9;
    border: 1px solid rgba(6, 182, 212, 0.3);
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
  }
  .btn-active-subtle {
    background: transparent;
    color: #94a3b8;
    border: none;
    padding: 4px 8px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
  }
  .btn-active-copy {
    background: rgba(30, 41, 59, 0.9);
    color: #e2e8f0;
    border: 1px solid rgba(51, 65, 85, 0.6);
    padding: 4px 12px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  .spinner-box {
    padding: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }
  .spinner {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 3px solid rgba(51, 65, 85, 0.3);
    border-top-color: #22d3ee;
    border-right-color: #3b82f6;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
</head>
<body>
  <div style="max-width: 900px; margin: 0 auto;">
    <h3 style="color: #38bdf8; margin-bottom: 8px;">🎮 AI/ML Engineering Mastery Simulator & Interactive Architecture Studio</h3>
    <div style="padding: 12px 16px; border-left: 4px solid #0284c7; background: rgba(8, 47, 73, 0.25); border-radius: 0 12px 12px 0; margin-bottom: 16px; font-size: 13.5px; color: #bae6fd;">
      <b>Core Takeaway:</b> This interactive, gamified studio transforms the 20 comprehensive AI/ML interview scenarios into an immersive hands-on workspace.
    </div>

    <!-- 1. Visualization rectangle DURING LOADING / STREAMING (Buttons Disabled) -->
    <h4 style="color: #94a3b8; margin-top: 24px;">1. During Loading / Rendering (Buttons Professionally Disabled & Muted):</h4>
    <div class="card" id="loading-card">
      <div class="header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="badge">HTML</span>
          <span style="font-size:11px; color:#64748b; font-family:monospace;">842 lines</span>
        </div>
        <div class="btn-group">
          <button class="btn-disabled" disabled title="Visualization is generating...">
            <span>📄</span> Full Page
          </button>
          <button class="btn-disabled" disabled title="Visualization is generating...">
            <span>↕</span> Expand
          </button>
          <button class="btn-disabled" disabled title="Visualization is generating...">
            <span>⛶</span> Fullscreen
          </button>
          <button class="btn-disabled" disabled title="Visualization is generating...">
            <span>↻</span> Reset
          </button>
          <button class="btn-disabled" disabled title="Visualization is generating...">
            <span>↗</span> Pop Out
          </button>
          <button class="btn-disabled" disabled title="Code is generating...">
            <span>📋</span> Copy Code
          </button>
        </div>
      </div>
      <div class="spinner-box">
        <div class="spinner"></div>
        <div style="text-align: center;">
          <div style="font-weight: 600; color: #f1f5f9; font-size: 14px;">Rendering interactive visualization...</div>
          <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Live sandbox will run instantly once complete</div>
        </div>
      </div>
    </div>

    <!-- 2. Visualization rectangle AFTER STREAMING COMPLETES (Buttons Active) -->
    <h4 style="color: #94a3b8; margin-top: 30px;">2. Once Visualization Completes (Buttons Fully Active):</h4>
    <div class="card" id="completed-card">
      <div class="header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="badge">HTML</span>
          <span style="font-size:11px; color:#64748b; font-family:monospace;">842 lines</span>
        </div>
        <div class="btn-group">
          <button class="btn-active-primary" title="Full Page layout active">
            <span>📄</span> Full Page
          </button>
          <button class="btn-active-subtle" title="Expand preview height">
            <span>↕</span> Expand
          </button>
          <button class="btn-active-subtle" title="Open fullscreen theater mode">
            <span>⛶</span> Fullscreen
          </button>
          <button class="btn-active-subtle" title="Reload visualization">
            <span>↻</span> Reset
          </button>
          <button class="btn-active-subtle" title="Open visualization in full browser tab">
            <span>↗</span> Pop Out
          </button>
          <button class="btn-active-copy" title="Copy code">
            <span>📋</span> Copy Code
          </button>
        </div>
      </div>
      <div style="padding: 24px; text-align: center; background: #060911;">
        <div style="padding: 16px; border-radius: 12px; background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(56, 189, 248, 0.4); max-width: 600px; margin: 0 auto;">
          <div style="color: #38bdf8; font-weight: bold; font-size: 16px;">AI/ML Engineering Simulator & Interview Master</div>
          <div style="color: #94a3b8; font-size: 13px; margin-top: 6px;">Live Interactive Sandbox Active & Responsive</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

  const htmlPath = path.resolve(__dirname, 'verify_buttons_style.html');
  fs.writeFileSync(htmlPath, htmlContent);

  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'));

  // Capture full comparison screenshot
  const screenshotPath = path.join(ARTIFACT_DIR, 'viz_buttons_disabled_verified.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Saved comparison screenshot to:', screenshotPath);

  // Capture zoomed-in crop of the disabled buttons header (matching user Image 3)
  const headerLocator = page.locator('#loading-card .header');
  const cropPath = path.join(ARTIFACT_DIR, 'viz_buttons_disabled_crop.png');
  await headerLocator.screenshot({ path: cropPath });
  console.log('Saved disabled buttons crop to:', cropPath);

  // Mobile viewport screenshot
  await page.setViewportSize({ width: 360, height: 800 });
  const mobileShotPath = path.join(ARTIFACT_DIR, 'viz_buttons_disabled_mobile.png');
  await page.screenshot({ path: mobileShotPath, fullPage: true });
  console.log('Saved mobile screenshot to:', mobileShotPath);

  await browser.close();
}

verifyDisabledButtons().catch(console.error);
