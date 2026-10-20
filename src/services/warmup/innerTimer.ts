/**
 * Xare AI — Inner Source-Code Auto Warm-Up Timer
 * 
 * Automatically sends a synthetic chat warmup message to the Xare n8n webhook
 * every hour (3,600,000 ms) from inside the codebase itself, keeping the
 * underlying AI pipeline active and recording verified response proofs.
 */

export interface WarmupProof {
  timestamp: string;
  durationMs: number;
  status: number;
  prompt: string;
  response: string;
  verified: boolean;
  reason: string;
}

const N8N_WEBHOOK_URL = 'https://aliiis-24-7-n8n.hf.space/webhook/xare-ai-v2-guALIharika';
const CHATBOT_TOKEN = 'ali1234';
const WARMUP_PROMPT = 'its a test to check that you are alive, so only reply with "1"';
const ONE_HOUR_MS = 60 * 60 * 1000; // 3,600,000 ms
const STORAGE_PROOF_KEY = 'xare_inner_warmup_proof';
const STORAGE_HISTORY_KEY = 'xare_inner_warmup_history';

let activeTimer: ReturnType<typeof setInterval> | null = null;
let lastProof: WarmupProof | null = null;

/**
 * Retrieve the latest verified warmup proof from memory or localStorage
 */
export function getLatestWarmupProof(): WarmupProof | null {
  if (lastProof) return lastProof;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = localStorage.getItem(STORAGE_PROOF_KEY);
      if (stored) {
        lastProof = JSON.parse(stored);
        return lastProof;
      }
    }
  } catch (e) {}
  return null;
}

/**
 * Retrieve full proof history
 */
export function getWarmupHistory(): WarmupProof[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = localStorage.getItem(STORAGE_HISTORY_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    }
  } catch (e) {}
  return lastProof ? [lastProof] : [];
}

/**
 * Sends a synthetic warm-up message to Xare via the inner webhook
 */
export async function sendWarmupPing(reason: string = 'hourly_timer'): Promise<WarmupProof> {
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const startTimeIso = new Date().toISOString();

  const payload = {
    message: WARMUP_PROMPT,
    chatInput: WARMUP_PROMPT,
    action: 'chat',
    sessionId: `inner_warmup_${Date.now()}`,
    userId: 'inner-timer-warmup-agent',
    timestamp: startTimeIso
  };

  try {
    console.info(
      '%c[XARE_AUTO_WARMUP_TIMER]%c Sending auto-warmup ping to webhook...',
      'background: #0284c7; color: white; border-radius: 3px; padding: 2px 6px; font-weight: bold',
      'color: #38bdf8; font-weight: normal'
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    const res = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-chatbot-token': CHATBOT_TOKEN
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const durationMs = Math.round(t1 - t0);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 100)}`);
    }

    const data = await res.json().catch(() => ({}));
    const rawText = data.text || data.response || data.output || (typeof data === 'string' ? data : '');
    const cleanText = typeof rawText === 'string' ? rawText.trim() : '';

    const verified = cleanText === '1' || cleanText.length > 0;

    const proof: WarmupProof = {
      timestamp: startTimeIso,
      durationMs,
      status: res.status,
      prompt: WARMUP_PROMPT,
      response: cleanText,
      verified,
      reason
    };

    lastProof = proof;

    // Persist to localStorage for auditability
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_PROOF_KEY, JSON.stringify(proof));
        const history = getWarmupHistory();
        history.push(proof);
        localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history.slice(-30)));
      }
    } catch (e) {}

    console.info(
      `%c[XARE_AUTO_WARMUP_TIMER]%c ✅ Auto-warmup response received in ${durationMs}ms! Response: "${cleanText}" (Verified: ${verified ? 'YES' : 'NO'})`,
      'background: #16a34a; color: white; border-radius: 3px; padding: 2px 6px; font-weight: bold',
      'color: #4ade80; font-weight: bold'
    );

    return proof;
  } catch (err: any) {
    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const durationMs = Math.round(t1 - t0);

    const failProof: WarmupProof = {
      timestamp: startTimeIso,
      durationMs,
      status: 0,
      prompt: WARMUP_PROMPT,
      response: err.message || 'Network error',
      verified: false,
      reason
    };

    lastProof = failProof;
    console.warn(
      `%c[XARE_AUTO_WARMUP_TIMER]%c ❌ Auto-warmup ping failed: ${err.message}`,
      'background: #dc2626; color: white; border-radius: 3px; padding: 2px 6px; font-weight: bold',
      'color: #f87171'
    );

    return failProof;
  }
}

/**
 * Starts the inner recurring 1-hour auto warm-up timer inside the codebase.
 * Returns a cleanup function to clear the timer when unmounted.
 */
export function startInnerWarmupTimer(): () => void {
  // Prevent duplicate intervals if called multiple times
  if (activeTimer) {
    clearInterval(activeTimer);
    activeTimer = null;
  }

  console.info(
    '%c[XARE_AUTO_WARMUP_TIMER]%c Initializing inner 1-hour auto warmup timer (cadence: 3600000ms)...',
    'background: #0284c7; color: white; border-radius: 3px; padding: 2px 6px; font-weight: bold',
    'color: #38bdf8'
  );

  // Check if a warmup ping was performed recently (within 50 minutes)
  const existingProof = getLatestWarmupProof();
  const now = Date.now();
  let shouldRunInitial = true;

  if (existingProof && existingProof.timestamp) {
    const lastRunTime = new Date(existingProof.timestamp).getTime();
    const elapsedMs = now - lastRunTime;
    if (elapsedMs < (50 * 60 * 1000)) {
      shouldRunInitial = false;
      const minutesRemaining = Math.round((ONE_HOUR_MS - elapsedMs) / 60000);
      console.info(
        `%c[XARE_AUTO_WARMUP_TIMER]%c Recent warmup proof found (${Math.round(elapsedMs / 60000)}m ago). Next auto-warmup in ~${minutesRemaining} minutes.`,
        'background: #0284c7; color: white; border-radius: 3px; padding: 2px 6px; font-weight: bold',
        'color: #94a3b8'
      );
    }
  }

  // Trigger initial warmup probe shortly after launch if needed
  if (shouldRunInitial) {
    setTimeout(() => {
      sendWarmupPing('initial_mount_probe').catch(() => {});
    }, 3500); // 3.5s delay after mount so app initial load finishes smoothly
  }

  // Set recurring 1-hour (3,600,000 ms) timer
  activeTimer = setInterval(() => {
    sendWarmupPing('hourly_interval').catch(() => {});
  }, ONE_HOUR_MS);

  // Expose global debug helper on window for easy inspection from DevTools
  if (typeof window !== 'undefined') {
    (window as any).__xareWarmup = {
      triggerNow: () => sendWarmupPing('manual_console_trigger'),
      getLatestProof: () => getLatestWarmupProof(),
      getHistory: () => getWarmupHistory()
    };
  }

  return () => {
    if (activeTimer) {
      clearInterval(activeTimer);
      activeTimer = null;
      console.info('[XARE_AUTO_WARMUP_TIMER] Timer stopped.');
    }
  };
}
