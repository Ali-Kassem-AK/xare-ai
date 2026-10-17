# 24/7 Cloudflare Worker Hourly Warm-Up Dispatcher

This Cloudflare Worker runs in Cloudflare's global edge network completely independently of your local computer, 24 hours a day, 7 days a week.

## Schedule
Runs every 1 hour continuously at minute 35 UTC (`35 * * * *`).

## Deployment Instructions (Takes 60 seconds)

### 1. Configure the GitHub Dispatch Token Secret
Run the following command in terminal:
```bash
npx wrangler secret put GITHUB_DISPATCH_TOKEN
```
When prompted, paste your GitHub Fine-Grained Personal Access Token (created with `Ali-Kassem-AK/xare-ai` repo permission: `Actions: Read and write`).

### 2. Deploy to Cloudflare
```bash
npx wrangler deploy
```

Once deployed, Cloudflare's Cron Triggers will execute `scheduled()` every hour at minute 35 UTC, submitting the authenticated `POST` request directly to GitHub Actions API.
