const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = 'C:/Users/alika/Desktop/SelfStudy/Xare_AI';

function hashFile(p) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  } catch (e) {
    return null;
  }
}

function countLines(p) {
  try {
    const data = fs.readFileSync(p, 'utf8');
    return data.split('\n').length;
  } catch (e) {
    return 0;
  }
}

function walk(dir, base = '') {
  let entries = [];
  const items = fs.readdirSync(dir);
  for (const item of items) {
    if (item === 'node_modules' || item === '.git' || item === 'dist') continue;
    const full = path.join(dir, item);
    const rel = base ? base + '/' + item : item;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      entries = entries.concat(walk(full, rel));
    } else {
      entries.push({ full, rel, stat });
    }
  }
  return entries;
}

const entries = walk(rootDir);

let totalDirs = 0;
function countDirs(dir) {
  let count = 1;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    if (item === 'node_modules' || item === '.git' || item === 'dist') continue;
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) count += countDirs(full);
  }
  return count;
}
totalDirs = countDirs(rootDir);

let totalSourceLines = 0;
let totalInspectedLines = 0;
let totalJsFiles = 0;
let totalTsFiles = 0;
let totalJsonFiles = 0;
let totalConfigFiles = 0;
let totalWorkflowFiles = 0;
let totalSourceFiles = 0;
let binaryFilesCount = 0;
let generatedFilesCount = 0;

const records = [];

for (const entry of entries) {
  const normRel = entry.rel.replace(/\\/g, '/');
  const ext = path.extname(entry.rel).toLowerCase();
  const isBinary = ext.match(/\.(png|ico|jpg|jpeg|pdf|mov)$/);
  const lineCount = isBinary ? 0 : countLines(entry.full);
  const hash = hashFile(entry.full);

  if (ext === '.js' || ext === '.cjs') totalJsFiles++;
  if (ext === '.ts' || ext === '.tsx') totalTsFiles++;
  if (ext === '.json') totalJsonFiles++;
  if (['.json', '.js', '.ts', '.cjs'].includes(ext) && (normRel.includes('config') || normRel.includes('.gitignore') || normRel.includes('package') || normRel.includes('manifest') || normRel.includes('.env'))) totalConfigFiles++;
  if (normRel.includes('N8N') && ext === '.json') totalWorkflowFiles++;

  if (['.ts', '.tsx', '.js', '.cjs', '.css', '.html'].includes(ext)) {
    totalSourceFiles++;
    totalSourceLines += lineCount;
  }

  if (isBinary) binaryFilesCount++;
  if (normRel.includes('backup') || normRel.includes('dist')) generatedFilesCount++;
  if (!isBinary) totalInspectedLines += lineCount;

  records.push({
    relativePath: normRel,
    fileType: isBinary ? 'binary' : (ext === '.json' ? 'json' : (ext === '.md' ? 'documentation' : 'source')),
    status: isBinary ? 'BINARY' : 'READ',
    lineCount: lineCount,
    sizeBytes: entry.stat.size,
    sha256: hash,
    isStorageRelated: normRel.includes('storage') || normRel.includes('presign') || normRel.includes('Xare AI.json') || normRel.includes('App.tsx')
  });
}

const summary = {
  timestamp: new Date().toISOString(),
  totalDirectories: totalDirs,
  totalFiles: records.length,
  totalSourceFiles,
  totalJavaScriptFiles: totalJsFiles,
  totalTypeScriptFiles: totalTsFiles,
  totalJsonFiles,
  totalConfigFiles,
  totalWorkflowFiles,
  totalLinesOfSourceCode: totalSourceLines,
  totalLinesInspected: totalInspectedLines,
  totalFilesInspected: records.filter(r => r.status === 'READ').length,
  binaryFiles: binaryFilesCount,
  generatedFiles: generatedFilesCount,
  skippedFiles: 0,
  ignoredFiles: 0
};

const fullAudit = { summary, files: records };
fs.writeFileSync('C:/Users/alika/Desktop/SelfStudy/Xare_AI/xare-ai-main/repository-audit-after.json', JSON.stringify(fullAudit, null, 2));

// Generate Markdown table
let md = '# REPOSITORY AUDIT (AFTER MIGRATION)\n\n';
md += '## 1. Post-Migration Audit Summary Metrics\n\n';
md += '| Metric | Value |\n|---|---|\n';
for (const [k, v] of Object.entries(summary)) {
  md += '| ' + k + ' | ' + v + ' |\n';
}

md += '\n## 2. File Inventory & Status\n\n';
md += '| Relative Path | Type | Status | Lines | Size (Bytes) | Storage Related | SHA-256 (first 12) |\n';
md += '|---|---|---|---|---|---|---|\n';
for (const r of records) {
  md += '| `' + r.relativePath + '` | ' + r.fileType + ' | ' + r.status + ' | ' + r.lineCount + ' | ' + r.sizeBytes + ' | ' + (r.isStorageRelated ? 'YES' : 'NO') + ' | `' + (r.sha256 ? r.sha256.substring(0, 12) : 'N/A') + '` |\n';
}

fs.writeFileSync('C:/Users/alika/Desktop/SelfStudy/Xare_AI/xare-ai-main/REPOSITORY_AUDIT_AFTER.md', md);
console.log('Post-migration audit written successfully!');
console.log(JSON.stringify(summary, null, 2));
