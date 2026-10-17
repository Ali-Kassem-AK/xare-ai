#!/usr/bin/env node
/**
 * Xare AI — External Hourly Workflow Dispatcher & Monitor (Option A)
 * 
 * Securely triggers the deployed GitHub Actions workflow (.github/workflows/warmup.yml)
 * via authenticated GitHub REST API dispatch, enforces duplicate-prevention guards,
 * and monitors the end-to-end execution path.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const REPO_OWNER = 'Ali-Kassem-AK';
const REPO_NAME = 'xare-ai';
const WORKFLOW_FILE = 'warmup.yml';
const DEFAULT_BRANCH = 'main';
const COOLDOWN_MINUTES = 40;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    force: false,
    monitor: true,
    target: 'browser',
    repeat: '1',
    timeoutSec: 360
  };

  for (const arg of args) {
    if (arg === '--force') opts.force = true;
    else if (arg === '--no-monitor') opts.monitor = false;
    else if (arg.startsWith('--target=')) opts.target = arg.split('=')[1];
    else if (arg.startsWith('--repeat=')) opts.repeat = arg.split('=')[1];
    else if (arg.startsWith('--timeout=')) opts.timeoutSec = parseInt(arg.split('=')[1], 10) || 360;
  }
  return opts;
}

/**
 * Retrieve GitHub credential securely without printing or exposing it
 */
function getGitHubToken() {
  if (process.env.GITHUB_DISPATCH_TOKEN) {
    return process.env.GITHUB_DISPATCH_TOKEN.trim();
  }
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN.trim();
  }

  // Attempt retrieval from Git Credential Manager (stored securely in Windows Credential Manager)
  try {
    const res = execSync('git credential fill', {
      input: 'protocol=https\nhost=github.com\n\n',
      stdio: ['pipe', 'pipe', 'ignore']
    }).toString();
    const pwdLine = res.split('\n').find(l => l.startsWith('password='));
    if (pwdLine) {
      return pwdLine.substring('password='.length).trim();
    }
  } catch (err) {}

  return null;
}

function githubRequest(method, endpoint, token, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`);
    const headers = {
      'User-Agent': 'Xare-AI-Hourly-Dispatcher',
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const req = https.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        if (data) {
          try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function appendAuditLog(entry) {
  const docsDir = path.join(__dirname, '..', 'docs', 'warmup');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  const logFile = path.join(docsDir, 'dispatcher_audit.log');
  const line = `[${entry.timestamp}] EVENT=${entry.event} STATUS=${entry.status} RUN_ID=${entry.runId || 'N/A'} MSG="${entry.message}"\n`;
  fs.appendFileSync(logFile, line, 'utf8');

  const historyFile = path.join(docsDir, 'dispatcher_history.json');
  let history = [];
  if (fs.existsSync(historyFile)) {
    try { history = JSON.parse(fs.readFileSync(historyFile, 'utf8')); } catch (e) {}
  }
  history.push(entry);
  fs.writeFileSync(historyFile, JSON.stringify(history.slice(-100), null, 2), 'utf8');
}

async function checkRecentRuns(token, force) {
  const res = await githubRequest('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs?per_page=5`, token);
  if (res.status !== 200 || !res.body || !res.body.workflow_runs) {
    return { okToDispatch: true };
  }

  const runs = res.body.workflow_runs;

  // Safeguard 1: Overlapping Run Check
  const activeRun = runs.find(r => r.status === 'in_progress' || r.status === 'queued');
  if (activeRun) {
    return {
      okToDispatch: false,
      reason: `Active run #${activeRun.run_number} (ID: ${activeRun.id}) is currently ${activeRun.status}. Skipping dispatch to prevent overlapping runs.`
    };
  }

  // Safeguard 2: Cooldown Check
  if (!force && runs.length > 0) {
    const latestRun = runs[0];
    const createdTime = new Date(latestRun.created_at).getTime();
    const elapsedMinutes = (Date.now() - createdTime) / (1000 * 60);

    if (elapsedMinutes < COOLDOWN_MINUTES) {
      return {
        okToDispatch: false,
        reason: `Recent run #${latestRun.run_number} occurred at ${latestRun.created_at} (${elapsedMinutes.toFixed(1)}m ago). Cooldown threshold is ${COOLDOWN_MINUTES}m. Skipping duplicate dispatch.`
      };
    }
  }

  return { okToDispatch: true };
}

async function waitForRun(token, dispatchTimestamp, timeoutSec) {
  const deadline = Date.now() + (timeoutSec * 1000);
  let identifiedRun = null;

  console.log('   Polling GitHub Actions API to identify newly triggered workflow run...');

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 4000));
    const res = await githubRequest('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/runs?event=workflow_dispatch&per_page=5`, token);
    
    if (res.status === 200 && res.body && res.body.workflow_runs) {
      const match = res.body.workflow_runs.find(r => {
        const runCreatedAt = new Date(r.created_at).getTime();
        return runCreatedAt >= (dispatchTimestamp - 10000); // 10s clock skew margin
      });

      if (match) {
        identifiedRun = match;
        break;
      }
    }
    process.stdout.write('.');
  }
  console.log('');

  if (!identifiedRun) {
    throw new Error(`Timed out waiting for GitHub Actions to register workflow run after dispatch.`);
  }

  console.log(`   [STEP 3: RUN REGISTERED] Run #${identifiedRun.run_number} (ID: ${identifiedRun.id})`);
  console.log(`   HTML URL: ${identifiedRun.html_url}`);
  console.log(`   Status: ${identifiedRun.status} | Event: ${identifiedRun.event}`);

  // Monitor until completion
  console.log('   Monitoring run progress until completion...');
  while (Date.now() < deadline) {
    const runCheck = await githubRequest('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs/${identifiedRun.id}`, token);
    if (runCheck.status === 200 && runCheck.body) {
      const current = runCheck.body;
      if (current.status === 'completed') {
        return current;
      }
      process.stdout.write(`[${current.status}] `);
    }
    await new Promise(r => setTimeout(r, 6000));
  }

  throw new Error(`Workflow run ${identifiedRun.id} did not finish within ${timeoutSec} seconds.`);
}

async function main() {
  const opts = parseArgs();
  const startTime = Date.now();
  const startIso = new Date(startTime).toISOString();

  console.log('======================================================================');
  console.log('   XARE AI — EXTERNAL HOURLY WORKFLOW DISPATCHER (OPTION A)');
  console.log(`   Invocation Time: ${startIso}`);
  console.log('======================================================================\n');

  console.log(`[STEP 1: EXTERNAL SCHEDULER INVOCATION]`);
  console.log(`   Authoritative Scheduler: External Dispatcher Service`);
  console.log(`   Repository: ${REPO_OWNER}/${REPO_NAME}`);
  console.log(`   Workflow: ${WORKFLOW_FILE} on branch '${DEFAULT_BRANCH}'`);
  console.log(`   Input Payload: target=${opts.target}, repeat=${opts.repeat}, force=${opts.force}\n`);

  appendAuditLog({
    timestamp: startIso,
    event: 'EXTERNAL_SCHEDULER_INVOKED',
    status: 'STARTING',
    message: `External scheduler invoked with target=${opts.target}, force=${opts.force}`
  });

  // Verify and obtain credential securely
  const token = getGitHubToken();
  if (!token) {
    const err = 'No GitHub credential found. Set GITHUB_DISPATCH_TOKEN environment variable or configure Windows Credential Manager.';
    console.error(`❌ FATAL: ${err}\n`);
    appendAuditLog({
      timestamp: new Date().toISOString(),
      event: 'CREDENTIAL_ERROR',
      status: 'FAILED',
      message: err
    });
    process.exit(1);
  }
  console.log('   ✅ GitHub API credential successfully retrieved from secure vault (token masked).\n');

  // Check duplicate & cooldown safeguards
  console.log('[STEP 1.1: DUPLICATE & COOLDOWN VERIFICATION]');
  const guard = await checkRecentRuns(token, opts.force);
  if (!guard.okToDispatch) {
    console.log(`   🛡️ ${guard.reason}`);
    console.log('   Exiting cleanly. No redundant workflow dispatch submitted.\n');
    appendAuditLog({
      timestamp: new Date().toISOString(),
      event: 'DISPATCH_SKIPPED_COOLDOWN',
      status: 'GUARD_BLOCKED',
      message: guard.reason
    });
    process.exit(0);
  }
  console.log('   ✅ Guard check passed: No active runs and cooldown threshold satisfied.\n');

  // Submit Workflow Dispatch
  console.log('[STEP 2: SUBMITTING WORKFLOW DISPATCH TO GITHUB ACTIONS API]');
  const dispatchPayload = {
    ref: DEFAULT_BRANCH,
    inputs: {
      target: opts.target,
      repeat: opts.repeat,
      force: opts.force ? 'true' : 'false'
    }
  };

  const dispatchRes = await githubRequest(
    'POST',
    `/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    token,
    dispatchPayload
  );

  if (dispatchRes.status !== 204) {
    const err = `GitHub API rejected dispatch with HTTP ${dispatchRes.status}: ${JSON.stringify(dispatchRes.body)}`;
    console.error(`❌ ${err}\n`);
    appendAuditLog({
      timestamp: new Date().toISOString(),
      event: 'DISPATCH_REJECTED',
      status: `HTTP_${dispatchRes.status}`,
      message: err
    });
    process.exit(1);
  }

  console.log('   ✅ HTTP 204 No Content: Workflow dispatch successfully accepted by GitHub Actions API.\n');
  appendAuditLog({
    timestamp: new Date().toISOString(),
    event: 'DISPATCH_ACCEPTED',
    status: 'HTTP_204',
    message: 'Workflow dispatch accepted by GitHub Actions API'
  });

  if (!opts.monitor) {
    console.log('Monitoring disabled (--no-monitor). Dispatch completed successfully.');
    process.exit(0);
  }

  // Monitor the triggered run
  console.log('[STEP 3: MONITORING TRIGGERED RUN IN PRODUCTION CI]');
  try {
    const completedRun = await waitForRun(token, startTime, opts.timeoutSec);
    const durationSec = Math.round((Date.now() - startTime) / 1000);

    console.log(`\n======================================================================`);
    console.log(`   RUN #${completedRun.run_number} COMPLETED WITH CONCLUSION: ${completedRun.conclusion.toUpperCase()}`);
    console.log(`   Duration: ${durationSec}s | Conclusion: ${completedRun.conclusion}`);
    console.log(`   Workflow Run URL: ${completedRun.html_url}`);
    console.log(`======================================================================\n`);

    appendAuditLog({
      timestamp: new Date().toISOString(),
      event: 'RUN_COMPLETED',
      status: completedRun.conclusion,
      runId: completedRun.id,
      runNumber: completedRun.run_number,
      htmlUrl: completedRun.html_url,
      durationSec,
      message: `Workflow completed with conclusion: ${completedRun.conclusion}`
    });

    if (completedRun.conclusion !== 'success') {
      console.error(`❌ Workflow run completed with non-success conclusion: ${completedRun.conclusion}`);
      process.exit(1);
    }

    console.log('🎉 EXTERNAL HOURLY DISPATCH & CI RUN VERIFIED SUCCESSFULLY.');
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ MONITORING ERROR: ${err.message}\n`);
    appendAuditLog({
      timestamp: new Date().toISOString(),
      event: 'MONITORING_TIMEOUT_OR_ERROR',
      status: 'ERROR',
      message: err.message
    });
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal dispatcher error:', err.message);
  process.exit(1);
});
