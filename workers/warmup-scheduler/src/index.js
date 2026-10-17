/**
 * Cloudflare Worker — 24/7 Serverless Hourly Warmup Dispatcher
 * Triggered by Cloudflare Cron Triggers at minute 35 every hour.
 */

export default {
  async scheduled(event, env, ctx) {
    const targetUrl = "https://api.github.com/repos/Ali-Kassem-AK/xare-ai/actions/workflows/warmup.yml/dispatches";
    const token = env.GITHUB_DISPATCH_TOKEN;

    if (!token) {
      console.error("FATAL: GITHUB_DISPATCH_TOKEN secret is not configured in Cloudflare Worker.");
      return;
    }

    const payload = {
      ref: "main",
      inputs: {
        target: "browser",
        repeat: "1"
      }
    };

    try {
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Xare-Cloudflare-Worker-Scheduler/1.0",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      console.log(`[Cloudflare Scheduler] Dispatched GitHub Actions workflow. HTTP Status: ${res.status}`);
      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Cloudflare Scheduler] GitHub API Error: ${errText}`);
      }
    } catch (err) {
      console.error(`[Cloudflare Scheduler] Fetch error: ${err.message}`);
    }
  },

  async fetch(request, env, ctx) {
    return new Response(JSON.stringify({
      service: "Xare AI Cloudflare Hourly Warmup Scheduler",
      status: "active",
      cronSchedule: "35 * * * * (Every hour at minute 35 UTC)",
      workflow: ".github/workflows/warmup.yml"
    }, null, 2), {
      headers: { "Content-Type": "application/json" }
    });
  }
};
