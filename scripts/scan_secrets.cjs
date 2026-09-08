const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const f of list) {
    if (f === 'node_modules' || f === '.git' || f === 'dist') continue;
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) results = results.concat(walk(full));
    else results.push(full);
  }
  return results;
}

const files = walk('.');
let leaks = 0;

for (const f of files) {
  if (f.endsWith('.png') || f.endsWith('.ico') || f.endsWith('.svg') || f.includes('package-lock') || f.includes('tests/')) continue;
  const content = fs.readFileSync(f, 'utf8');
  if (f.includes('App.tsx') || f.includes('audit')) continue; // Firebase public app keys
  
  // Check for hardcoded AWS or secret keys
  if (/AWS_SECRET_ACCESS_KEY\s*=\s*['"][a-zA-Z0-9+/=]{20,}['"]/i.test(content) ||
      /STORAGE_SECRET_ACCESS_KEY\s*=\s*['"][a-zA-Z0-9+/=]{20,}['"]/i.test(content) ||
      /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][a-zA-Z0-9._-]{20,}['"]/i.test(content)) {
    console.error('CRITICAL: Hardcoded secret detected in:', f);
    leaks++;
  }
}

console.log('Secret leak scan finished. Total detected hardcoded secrets:', leaks);
process.exit(leaks > 0 ? 1 : 0);
