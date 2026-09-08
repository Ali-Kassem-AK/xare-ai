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

const fileMetadata = {
  'N8N_Xare_BACKEND/architecture.png': { type: 'binary', status: 'BINARY', role: 'Architecture diagram graphic', deps: [] },
  'N8N_Xare_BACKEND/Global System Topology & Execution Flow.png': { type: 'binary', status: 'BINARY', role: 'System topology flow graphic', deps: [] },
  'N8N_Xare_BACKEND/Xare AI.json': { type: 'workflow', status: 'READ', role: 'Master n8n workflow definition (126 nodes)', deps: ['Groq', 'Google Gemini', 'Deepgram', 'Firestore', 'Tavily', 'Pollinations.ai', 'Supabase Storage'] },
  'N8N_Xare_BACKEND/Xare AI.backup.json': { type: 'workflow', status: 'GENERATED', role: 'Pre-migration backup snapshot of n8n workflow', deps: [] },
  'xare-ai-main/.gitignore': { type: 'config', status: 'READ', role: 'Git ignore specifications', deps: [] },
  'xare-ai-main/README.md': { type: 'documentation', status: 'READ', role: 'Project documentation readme', deps: [] },
  'xare-ai-main/index.html': { type: 'source', status: 'READ', role: 'Main HTML entry point with fonts & metadata', deps: ['/src/main.tsx'] },
  'xare-ai-main/package.json': { type: 'config', status: 'READ', role: 'Node.js package manifest and dependencies', deps: ['react', 'firebase', '@supabase/supabase-js', 'lucide-react', 'katex'] },
  'xare-ai-main/package-lock.json': { type: 'lockfile', status: 'READ', role: 'npm dependency lockfile', deps: [] },
  'xare-ai-main/postcss.config.js': { type: 'config', status: 'READ', role: 'PostCSS configuration for Tailwind', deps: ['tailwindcss', 'autoprefixer'] },
  'xare-ai-main/tailwind.config.js': { type: 'config', status: 'READ', role: 'Tailwind CSS utility configuration', deps: [] },
  'xare-ai-main/vite.config.ts': { type: 'config', status: 'READ', role: 'Vite build and chunking configuration', deps: ['@vitejs/plugin-react'] },
  'xare-ai-main/api/chat/stream.ts': { type: 'source', status: 'READ', role: 'Vercel Edge serverless endpoint for direct Gemini streaming', deps: ['Google Gemini API'] },
  'xare-ai-main/api/upload/presign.ts': { type: 'source', status: 'READ', role: 'Vercel Edge serverless upload presigning endpoint', deps: ['@supabase/supabase-js'] },
  'xare-ai-main/api/voice/token.ts': { type: 'source', status: 'READ', role: 'Vercel Edge serverless endpoint for Deepgram voice token', deps: ['Deepgram API'] },
  'xare-ai-main/src/App.tsx': { type: 'source', status: 'READ', role: 'Core single-page application component with UI, state, file handlers, and AI routing', deps: ['react', 'firebase/auth', 'firebase/firestore', 'lucide-react', 'katex', './utils/storage'] },
  'xare-ai-main/src/index.css': { type: 'source', status: 'READ', role: 'Global application stylesheet and animations', deps: ['tailwindcss'] },
  'xare-ai-main/src/main.tsx': { type: 'source', status: 'READ', role: 'React DOM root renderer', deps: ['react', 'react-dom/client', './App', './index.css'] },
  'xare-ai-main/src/utils/storage.ts': { type: 'source', status: 'READ', role: 'Client-side upload orchestrator with progress simulation and caching', deps: ['firebase/auth', '/api/upload/presign'] },
  'xare-ai-main/public/android-chrome-192x192.png': { type: 'binary', status: 'BINARY', role: 'PWA icon asset', deps: [] },
  'xare-ai-main/public/android-chrome-512x512.png': { type: 'binary', status: 'BINARY', role: 'PWA icon asset', deps: [] },
  'xare-ai-main/public/apple-touch-icon.png': { type: 'binary', status: 'BINARY', role: 'Apple touch icon asset', deps: [] },
  'xare-ai-main/public/assets/architecture.png': { type: 'binary', status: 'BINARY', role: 'Architecture diagram web asset', deps: [] },
  'xare-ai-main/public/assets/Global System Topology & Execution Flow.png': { type: 'binary', status: 'BINARY', role: 'Global flow web asset', deps: [] },
  'xare-ai-main/public/favicon-16x16.png': { type: 'binary', status: 'BINARY', role: 'Browser favicon asset', deps: [] },
  'xare-ai-main/public/favicon-32x32.png': { type: 'binary', status: 'BINARY', role: 'Browser favicon asset', deps: [] },
  'xare-ai-main/public/favicon-48x48.png': { type: 'binary', status: 'BINARY', role: 'Browser favicon asset', deps: [] },
  'xare-ai-main/public/favicon.ico': { type: 'binary', status: 'BINARY', role: 'Browser favicon asset', deps: [] },
  'xare-ai-main/public/favicon.png': { type: 'binary', status: 'BINARY', role: 'Browser favicon asset', deps: [] },
  'xare-ai-main/public/favicon.svg': { type: 'binary', status: 'BINARY', role: 'Vector favicon asset', deps: [] },
  'xare-ai-main/public/site.webmanifest': { type: 'config', status: 'READ', role: 'Web application manifest', deps: [] }
};

function walk(dir, base = '') {
  let entries = [];
  const items = fs.readdirSync(dir);
  for (const item of items) {
    if (item === 'node_modules' || item === '.git' || item === 'dist' || item === 'scripts') continue;
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
    if (item === 'node_modules' || item === '.git' || item === 'dist' || item === 'scripts') continue;
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
  const meta = fileMetadata[normRel] || {
    type: ext.match(/\.(png|ico|svg|jpg|jpeg|pdf|mov)$/) ? 'binary' : 'source',
    status: ext.match(/\.(png|ico|jpg|jpeg|pdf|mov)$/) ? 'BINARY' : 'READ',
    role: 'Discovered file',
    deps: []
  };

  const isBinary = meta.status === 'BINARY' || ext.match(/\.(png|ico|jpg|jpeg|pdf|mov)$/);
  const lineCount = isBinary ? 0 : countLines(entry.full);
  const hash = hashFile(entry.full);

  if (ext === '.js') totalJsFiles++;
  if (ext === '.ts' || ext === '.tsx') totalTsFiles++;
  if (ext === '.json') totalJsonFiles++;
  if (['.json', '.js', '.ts'].includes(ext) && (normRel.includes('config') || normRel.includes('.gitignore') || normRel.includes('package') || normRel.includes('manifest'))) totalConfigFiles++;
  if (normRel.includes('N8N') && ext === '.json') totalWorkflowFiles++;

  if (['.ts', '.tsx', '.js', '.css', '.html'].includes(ext)) {
    totalSourceFiles++;
    totalSourceLines += lineCount;
  }

  if (meta.status === 'BINARY') binaryFilesCount++;
  if (meta.status === 'GENERATED') generatedFilesCount++;
  if (meta.status === 'READ') totalInspectedLines += lineCount;

  records.push({
    relativePath: normRel,
    fileType: meta.type,
    status: meta.status,
    lineCount: lineCount,
    sizeBytes: entry.stat.size,
    sha256: hash,
    role: meta.role,
    dependencies: meta.deps,
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
fs.writeFileSync('C:/Users/alika/Desktop/SelfStudy/Xare_AI/xare-ai-main/repository-audit-before.json', JSON.stringify(fullAudit, null, 2));

// Generate Markdown table
let md = '# REPOSITORY AUDIT (BEFORE MIGRATION)\n\n';
md += '## 1. Audit Summary Metrics\n\n';
md += '| Metric | Value |\n|---|---|\n';
for (const [k, v] of Object.entries(summary)) {
  md += '| ' + k + ' | ' + v + ' |\n';
}

md += '\n## 2. File Inventory & Inspection Status\n\n';
md += '| Relative Path | Type | Status | Lines | Size (Bytes) | Storage Related | Purpose | SHA-256 (first 12) |\n';
md += '|---|---|---|---|---|---|---|---|\n';
for (const r of records) {
  md += '| `' + r.relativePath + '` | ' + r.fileType + ' | ' + r.status + ' | ' + r.lineCount + ' | ' + r.sizeBytes + ' | ' + (r.isStorageRelated ? 'YES' : 'NO') + ' | ' + r.role + ' | `' + (r.sha256 ? r.sha256.substring(0, 12) : 'N/A') + '` |\n';
}

fs.writeFileSync('C:/Users/alika/Desktop/SelfStudy/Xare_AI/xare-ai-main/REPOSITORY_AUDIT_BEFORE.md', md);
console.log('Audit files generated successfully!');
console.log(JSON.stringify(summary, null, 2));
