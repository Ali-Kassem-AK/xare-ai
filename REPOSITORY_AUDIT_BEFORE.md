# REPOSITORY AUDIT (BEFORE MIGRATION)

## 1. Audit Summary Metrics

| Metric | Value |
|---|---|
| timestamp | 2026-09-08T21:26:24.321Z |
| totalDirectories | 11 |
| totalFiles | 31 |
| totalSourceFiles | 11 |
| totalJavaScriptFiles | 2 |
| totalTypeScriptFiles | 7 |
| totalJsonFiles | 4 |
| totalConfigFiles | 5 |
| totalWorkflowFiles | 2 |
| totalLinesOfSourceCode | 8149 |
| totalLinesInspected | 17236 |
| totalFilesInspected | 17 |
| binaryFiles | 13 |
| generatedFiles | 1 |
| skippedFiles | 0 |
| ignoredFiles | 0 |

## 2. File Inventory & Inspection Status

| Relative Path | Type | Status | Lines | Size (Bytes) | Storage Related | Purpose | SHA-256 (first 12) |
|---|---|---|---|---|---|---|---|
| `N8N_Xare_BACKEND/architecture.png` | binary | BINARY | 0 | 1065582 | NO | Architecture diagram graphic | `e922b15ea949` |
| `N8N_Xare_BACKEND/Global System Topology & Execution Flow.png` | binary | BINARY | 0 | 70248 | NO | System topology flow graphic | `cdb049eedd14` |
| `N8N_Xare_BACKEND/Xare AI.backup.json` | workflow | GENERATED | 4739 | 189687 | NO | Pre-migration backup snapshot of n8n workflow | `85e5030061db` |
| `N8N_Xare_BACKEND/Xare AI.json` | workflow | READ | 4739 | 189687 | YES | Master n8n workflow definition (126 nodes) | `85e5030061db` |
| `xare-ai-main/.gitignore` | config | READ | 12 | 80 | NO | Git ignore specifications | `44faa4b3159b` |
| `xare-ai-main/api/chat/stream.ts` | source | READ | 238 | 9927 | NO | Vercel Edge serverless endpoint for direct Gemini streaming | `4200f62c5038` |
| `xare-ai-main/api/upload/presign.ts` | source | READ | 281 | 10513 | YES | Vercel Edge serverless upload presigning endpoint | `23726f699b51` |
| `xare-ai-main/api/voice/token.ts` | source | READ | 68 | 2165 | NO | Vercel Edge serverless endpoint for Deepgram voice token | `5ae10c2bd994` |
| `xare-ai-main/index.html` | source | READ | 31 | 1360 | NO | Main HTML entry point with fonts & metadata | `9d3a800b149d` |
| `xare-ai-main/package-lock.json` | lockfile | READ | 4273 | 153122 | NO | npm dependency lockfile | `3a0d93762a49` |
| `xare-ai-main/package.json` | config | READ | 31 | 713 | NO | Node.js package manifest and dependencies | `ea2fbbb9b5a6` |
| `xare-ai-main/postcss.config.js` | config | READ | 7 | 86 | NO | PostCSS configuration for Tailwind | `374f669f08b1` |
| `xare-ai-main/public/android-chrome-192x192.png` | binary | BINARY | 0 | 33915 | NO | PWA icon asset | `7eae6f065f53` |
| `xare-ai-main/public/android-chrome-512x512.png` | binary | BINARY | 0 | 168938 | NO | PWA icon asset | `c17c156a75be` |
| `xare-ai-main/public/apple-touch-icon.png` | binary | BINARY | 0 | 30366 | NO | Apple touch icon asset | `7ed218b8b58d` |
| `xare-ai-main/public/assets/architecture.png` | binary | BINARY | 0 | 1065582 | NO | Architecture diagram web asset | `e922b15ea949` |
| `xare-ai-main/public/assets/Global System Topology & Execution Flow.png` | binary | BINARY | 0 | 70248 | NO | Global flow web asset | `cdb049eedd14` |
| `xare-ai-main/public/favicon-16x16.png` | binary | BINARY | 0 | 817 | NO | Browser favicon asset | `89516babd16b` |
| `xare-ai-main/public/favicon-32x32.png` | binary | BINARY | 0 | 2306 | NO | Browser favicon asset | `ff6c307c2e7b` |
| `xare-ai-main/public/favicon-48x48.png` | binary | BINARY | 0 | 4102 | NO | Browser favicon asset | `8c9878a2167c` |
| `xare-ai-main/public/favicon.ico` | binary | BINARY | 0 | 7400 | NO | Browser favicon asset | `4d7ff81ba98a` |
| `xare-ai-main/public/favicon.png` | binary | BINARY | 0 | 18006 | NO | Browser favicon asset | `dd9eb2945e33` |
| `xare-ai-main/public/favicon.svg` | binary | BINARY | 0 | 225666 | NO | Vector favicon asset | `b190e8b0a41d` |
| `xare-ai-main/public/site.webmanifest` | config | READ | 30 | 615 | NO | Web application manifest | `b8e181c512fb` |
| `xare-ai-main/README.md` | documentation | READ | 2 | 11 | NO | Project documentation readme | `45fd3549ddeb` |
| `xare-ai-main/src/App.tsx` | source | READ | 7015 | 306535 | YES | Core single-page application component with UI, state, file handlers, and AI routing | `307932f7d344` |
| `xare-ai-main/src/index.css` | source | READ | 119 | 3058 | NO | Global application stylesheet and animations | `fe8d58862f60` |
| `xare-ai-main/src/main.tsx` | source | READ | 12 | 281 | NO | React DOM root renderer | `093f9b0873c4` |
| `xare-ai-main/src/utils/storage.ts` | source | READ | 338 | 11346 | YES | Client-side upload orchestrator with progress simulation and caching | `b6c8b610d90c` |
| `xare-ai-main/tailwind.config.js` | config | READ | 13 | 215 | NO | Tailwind CSS utility configuration | `f22895ae5263` |
| `xare-ai-main/vite.config.ts` | config | READ | 27 | 682 | NO | Vite build and chunking configuration | `d92fc437f64b` |
