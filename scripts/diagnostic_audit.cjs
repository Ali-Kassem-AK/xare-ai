const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Node-Diagnostic-Audit' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, text: data });
        }
      });
    }).on('error', reject);
  });
}

async function runAudit() {
  console.log('====================================================');
  console.log('GITHUB ACTIONS SCHEDULER DIAGNOSTIC AUDIT');
  console.log('====================================================\n');

  // 1. Workflow Metadata
  console.log('[1] Inspecting Workflow Metadata...');
  const wf = await get('https://api.github.com/repos/Ali-Kassem-AK/xare-ai/actions/workflows/warmup.yml');
  console.log('Workflow ID:', wf.body.id);
  console.log('Name:', wf.body.name);
  console.log('State:', wf.body.state);
  console.log('Path:', wf.body.path);
  console.log('Created At:', wf.body.created_at);
  console.log('Updated At:', wf.body.updated_at);

  // 2. Head Commit on main
  console.log('\n[2] Inspecting Head Commit on main...');
  const commit = await get('https://api.github.com/repos/Ali-Kassem-AK/xare-ai/commits/main');
  console.log('SHA:', commit.body.sha);
  console.log('Author:', commit.body.commit.author);
  console.log('Committer:', commit.body.commit.committer);
  console.log('Message:', commit.body.commit.message);

  // 3. Workflow File Contents on main
  console.log('\n[3] Inspecting .github/workflows/warmup.yml contents on main...');
  const fileContentRes = await get('https://api.github.com/repos/Ali-Kassem-AK/xare-ai/contents/.github/workflows/warmup.yml?ref=main');
  const decodedContent = Buffer.from(fileContentRes.body.content, 'base64').toString('utf8');
  console.log('First 15 lines of committed YAML on main:');
  console.log(decodedContent.split('\n').slice(0, 15).join('\n'));

  // 4. Repository Metadata
  console.log('\n[4] Inspecting Repository Metadata & Default Branch...');
  const repo = await get('https://api.github.com/repos/Ali-Kassem-AK/xare-ai');
  console.log('Repo Name:', repo.body.full_name);
  console.log('Default Branch:', repo.body.default_branch);
  console.log('Visibility:', repo.body.visibility);
  console.log('Archived:', repo.body.archived);
  console.log('Disabled:', repo.body.disabled);
  console.log('Fork:', repo.body.fork);
  console.log('Pushed At:', repo.body.pushed_at);

  // 5. Complete Workflow Runs Audit & Actors
  console.log('\n[5] Auditing Complete Workflow Runs & Trigger Actors...');
  const runs = await get('https://api.github.com/repos/Ali-Kassem-AK/xare-ai/actions/runs?per_page=30');
  console.log(`Total Runs Returned: ${runs.body.workflow_runs.length}\n`);
  
  runs.body.workflow_runs.forEach((r, idx) => {
    console.log(`Run #${r.run_number} (ID: ${r.id})`);
    console.log(`  Event: ${r.event}`);
    console.log(`  Actor: ${r.actor ? r.actor.login : 'none'} (Type: ${r.actor ? r.actor.type : 'none'})`);
    console.log(`  Triggering Actor: ${r.triggering_actor ? r.triggering_actor.login : 'none'}`);
    console.log(`  Created At: ${r.created_at}`);
    console.log(`  Conclusion: ${r.conclusion}`);
    console.log(`  Head SHA: ${r.head_sha}`);
    console.log(`  Workflow: ${r.name}`);
    console.log('----------------------------------------------------');
  });
}

runAudit().catch(console.error);
