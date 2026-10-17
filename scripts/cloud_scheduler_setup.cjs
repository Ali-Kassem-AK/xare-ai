#!/usr/bin/env node
/**
 * Xare AI — Cloud Scheduler Manager & Automation Suite (Option A Cloud)
 * 
 * Manages 24/7 cloud-hosted schedulers (cron-job.org API and Cloudflare Workers)
 * to trigger the GitHub Actions workflow (.github/workflows/warmup.yml) hourly.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const REPO_OWNER = 'Ali-Kassem-AK';
const REPO_NAME = 'xare-ai';
const WORKFLOW_FILE = 'warmup.yml';
const DISPATCH_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/dispatches`;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    apiKey: process.env.CRONJOB_API_KEY || null,
    githubToken: process.env.GITHUB_DISPATCH_TOKEN || process.env.GITHUB_TOKEN || null,
    test: false,
    history: false,
    jobId: null
  };

  for (const arg of args) {
    if (arg.startsWith('--api-key=')) opts.apiKey = arg.split('=')[1];
    else if (arg.startsWith('--github-token=')) opts.githubToken = arg.split('=')[1];
    else if (arg.startsWith('--job-id=')) opts.jobId = parseInt(arg.split('=')[1], 10);
    else if (arg === '--test') opts.test = true;
    else if (arg === '--history') opts.history = true;
  }
  return opts;
}

function requestJson(url, options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, text: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function main() {
  const opts = parseArgs();

  console.log('======================================================================');
  console.log('   XARE AI — 24/7 CLOUD-HOSTED SCHEDULER MANAGER');
  console.log('   Target Cadence: Every 1 Hour (Minute 35 UTC: 35 * * * *)');
  console.log('======================================================================\n');

  console.log('Target GitHub Actions Workflow Dispatch Endpoint:');
  console.log(`   URL: ${DISPATCH_URL}`);
  console.log(`   Method: POST`);
  console.log(`   Branch: main`);
  console.log(`   Inputs: { "target": "browser", "repeat": "1" }\n`);

  // Print exact configuration for cron-job.org (Web UI & REST API)
  console.log('----------------------------------------------------------------------');
  console.log('1. CLOUD SCHEDULER SPECIFICATION (cron-job.org)');
  console.log('----------------------------------------------------------------------');
  console.log('To run this 24/7 in the cloud without relying on your local computer:\n');
  console.log('A. Web Console Setup (Takes 60 seconds):');
  console.log('   1. Sign in or register at https://cron-job.org (100% Free, 24/7 cloud execution)');
  console.log('   2. Click "Create Cronjob"');
  console.log(`   3. Title: Xare AI 1-Hour Chat Warm-Up Subsystem`);
  console.log(`   4. URL: ${DISPATCH_URL}`);
  console.log(`   5. Schedule: User-defined (Minutes: 35, Hours: Every hour, Days/Months: Every)`);
  console.log(`   6. Request Method: POST`);
  console.log('   7. Request Headers:');
  console.log('      - Accept: application/vnd.github+json');
  console.log('      - Authorization: Bearer <YOUR_NARROWLY_SCOPED_GITHUB_PAT>');
  console.log('      - X-GitHub-Api-Version: 2022-11-28');
  console.log('      - User-Agent: Xare-Cloud-Scheduler-CronJobOrg');
  console.log('      - Content-Type: application/json');
  console.log('   8. Request Body (Raw JSON):');
  console.log('      {"ref": "main", "inputs": {"target": "browser", "repeat": "1"}}');
  console.log('   9. Advanced Settings: Save responses = YES, Failure notifications = YES\n');

  console.log('B. Generating Narrowly Scoped GitHub Credential:');
  console.log('   1. Go to: https://github.com/settings/tokens?type=beta (Fine-grained personal access tokens)');
  console.log('   2. Token name: Xare-Cloud-Scheduler-Hourly');
  console.log('   3. Expiration: 90 days or custom');
  console.log(`   4. Repository access: Only select repositories -> Ali-Kassem-AK/xare-ai`);
  console.log('   5. Permissions:');
  console.log('      - Actions: Read and write');
  console.log('   6. Click "Generate token" and copy it directly into cron-job.org.\n');

  if (opts.apiKey) {
    console.log('----------------------------------------------------------------------');
    console.log('2. AUTOMATED API DEPLOYMENT (cron-job.org REST API)');
    console.log('----------------------------------------------------------------------');

    if (!opts.githubToken) {
      console.error('❌ Error: --github-token or GITHUB_DISPATCH_TOKEN is required to deploy via API.');
      process.exit(1);
    }

    const payload = {
      job: {
        url: DISPATCH_URL,
        enabled: true,
        title: 'Xare AI 1-Hour Chat Warm-Up Subsystem',
        saveResponses: true,
        auth: {
          enable: false
        },
        schedule: {
          timezone: 'UTC',
          expiresAt: 0,
          hours: [-1],
          mdays: [-1],
          minutes: [35],
          months: [-1],
          wdays: [-1]
        },
        extendedData: {
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${opts.githubToken}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'Xare-Cloud-Scheduler-CronJobOrg',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              target: 'browser',
              repeat: '1'
            }
          }),
          requestMethod: 1 // POST
        }
      }
    };

    try {
      console.log('   Creating cloud cron job via cron-job.org API...');
      const res = await requestJson('https://api.cron-job.org/jobs', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${opts.apiKey}`
        }
      }, payload);

      if (res.status === 200 || res.status === 201) {
        console.log(`   ✅ Cloud Job Created Successfully! Job ID: ${res.body.jobId}`);
        console.log('   Schedule: Hourly at minute 35 UTC');
      } else {
        console.error(`   ❌ Failed with status ${res.status}:`, res.body || res.text);
      }
    } catch (e) {
      console.error('   ❌ API Error:', e.message);
    }
  }

  console.log('======================================================================\n');
}

main().catch(console.error);
