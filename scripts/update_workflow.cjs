const fs = require('fs');
const path = require('path');

const wfPath = 'C:/Users/alika/Desktop/SelfStudy/Xare_AI/N8N_Xare_BACKEND/Xare AI.json';
const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));

console.log('Original workflow nodes:', wf.nodes.length);

// 1. Update Identify Media Type node
const identifyNode = wf.nodes.find(n => n.name === 'Identify Media Type');
if (identifyNode && identifyNode.parameters && identifyNode.parameters.jsCode) {
  let code = identifyNode.parameters.jsCode;
  
  // Replace Supabase diagnostic check with provider-agnostic check
  const oldCheck = `    // Diagnostics / Error check for missing URL on direct upload
    if (rawFileUrl && rawFileUrl.includes('/storage/v1/object/sign/') && !rawFileUrl.includes('token=')) {
      item.json.warning = 'Supabase signed URL is missing token parameter.';
    }`;

  const newCheck = `    // Diagnostics / Error check for missing URL or malformed query on direct upload
    if (rawFileUrl && typeof rawFileUrl === 'string' && rawFileUrl.startsWith('http')) {
      try {
        const parsedUrl = new URL(rawFileUrl);
        if (parsedUrl.search.includes('X-Amz-Signature') && !parsedUrl.search.includes('X-Amz-Credential')) {
          item.json.warning = 'Presigned storage URL appears to have malformed AWS/S3 query parameters.';
        }
      } catch (e) {
        item.json.warning = 'Invalid file URL syntax.';
      }
    }`;

  if (code.includes(oldCheck)) {
    code = code.replace(oldCheck, newCheck);
    identifyNode.parameters.jsCode = code;
    console.log('Successfully updated Identify Media Type diagnostics');
  } else {
    // Fallback replacement of the substring
    code = code.replace(/if\s*\(rawFileUrl\s*&&[^}]+Supabase signed URL is missing token parameter\.[^}]+\}/s, newCheck.trim());
    identifyNode.parameters.jsCode = code;
    console.log('Replaced Identify Media Type via regex');
  }
}

// 2. Update Convert Base64 to PDF Binary node
const pdfBinaryNode = wf.nodes.find(n => n.name === 'Convert Base64 to PDF Binary');
if (pdfBinaryNode && pdfBinaryNode.parameters && pdfBinaryNode.parameters.jsCode) {
  pdfBinaryNode.parameters.jsCode = pdfBinaryNode.parameters.jsCode.replace(
    '// If binary file is already downloaded from Supabase Storage, preserve it and forward directly!',
    '// If binary file is already downloaded from Object Storage, preserve it and forward directly!'
  );
  console.log('Updated Convert Base64 to PDF Binary comment');
}

// 3. Update get_xare_architecture nodes
for (const n of wf.nodes) {
  if (n.name.startsWith('get_xare_architecture') && n.parameters && n.parameters.jsCode) {
    let js = n.parameters.jsCode;
    js = js.replace(/Supabase \(50MB\/file direct signed stream\)/g, 'Cloud Object Storage (50MB/file direct signed stream)');
    js = js.replace(/\*\*Supabase Storage\*\*/g, '**Cloud Object Storage (S3/R2/B2)**');
    js = js.replace(/client to Supabase;/g, 'client to Cloud Object Storage;');
    js = js.replace(/Download Supabase File/g, 'Download Remote File');
    js = js.replace(/Supabase binary/g, 'Remote object binary');
    n.parameters.jsCode = js;
    console.log('Updated architecture tool:', n.name);
  }
}

// 4. Rename Nodes in wf.nodes and wf.connections
const renameMap = {
  'Download Supabase File': 'Download Remote File',
  'Has Supabase URL?': 'Has Remote File URL?'
};

for (const n of wf.nodes) {
  if (renameMap[n.name]) {
    console.log('Renaming node:', n.name, '->', renameMap[n.name]);
    n.name = renameMap[n.name];
  }
}

// Update wf.connections
const newConnections = {};
for (const [srcNode, connObj] of Object.entries(wf.connections)) {
  const newSrc = renameMap[srcNode] || srcNode;
  const newConnObj = {};
  
  for (const [connType, outputGroups] of Object.entries(connObj)) {
    newConnObj[connType] = outputGroups.map(group => {
      return group.map(dest => {
        return {
          ...dest,
          node: renameMap[dest.node] || dest.node
        };
      });
    });
  }
  newConnections[newSrc] = newConnObj;
}
wf.connections = newConnections;

// Validate all connections connect to existing nodes
const nodeNameSet = new Set(wf.nodes.map(n => n.name));
let brokenLinks = 0;
for (const [src, connObj] of Object.entries(wf.connections)) {
  if (!nodeNameSet.has(src)) {
    console.error('ERROR: Source node not in nodes list:', src);
    brokenLinks++;
  }
  for (const [connType, outputGroups] of Object.entries(connObj)) {
    outputGroups.forEach((group, idx) => {
      group.forEach(dest => {
        if (!nodeNameSet.has(dest.node)) {
          console.error('ERROR: Destination node not in nodes list:', dest.node);
          brokenLinks++;
        }
      });
    });
  }
}

if (brokenLinks === 0) {
  console.log('Connection validation: 100% SUCCESS! All connections are valid and intact.');
  fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2));
  console.log('Saved updated Xare AI.json successfully!');
} else {
  console.error('Aborting save due to broken links:', brokenLinks);
  process.exit(1);
}
