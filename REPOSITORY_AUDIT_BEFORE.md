# REPOSITORY AUDIT (BEFORE MIGRATION)

## 1. Audit Summary Metrics

| Metric | Value |
|---|---|
| timestamp | 2026-09-08T22:48:06.652Z |
| totalDirectories | 16 |
| totalFiles | 60 |
| totalSourceFiles | 14 |
| totalJavaScriptFiles | 2 |
| totalTypeScriptFiles | 10 |
| totalJsonFiles | 9 |
| totalConfigFiles | 5 |
| totalWorkflowFiles | 2 |
| totalLinesOfSourceCode | 8317 |
| totalLinesInspected | 25840 |
| totalFilesInspected | 44 |
| binaryFiles | 15 |
| generatedFiles | 1 |
| skippedFiles | 0 |
| ignoredFiles | 0 |

## 2. File Inventory & Inspection Status

| Relative Path | Type | Status | Lines | Size (Bytes) | Storage Related | Purpose | SHA-256 (first 12) |
|---|---|---|---|---|---|---|---|
| `N8N_Xare_BACKEND/architecture.png` | binary | BINARY | 0 | 1065582 | NO | Architecture diagram graphic | `e922b15ea949` |
| `N8N_Xare_BACKEND/Global System Topology & Execution Flow.png` | binary | BINARY | 0 | 70248 | NO | System topology flow graphic | `cdb049eedd14` |
| `N8N_Xare_BACKEND/Xare AI.backup.json` | workflow | GENERATED | 4739 | 189687 | NO | Pre-migration backup snapshot of n8n workflow | `85e5030061db` |
| `N8N_Xare_BACKEND/Xare AI.json` | workflow | READ | 4739 | 190106 | YES | Master n8n workflow definition (126 nodes) | `05b93ecccd2d` |
| `xare-ai-main/.env.example` | source | READ | 41 | 1847 | NO | Discovered file | `c1ffd45ca5e3` |
| `xare-ai-main/.env.local` | source | READ | 3 | 1337 | NO | Discovered file | `16c63a398c0e` |
| `xare-ai-main/.gitignore` | config | READ | 13 | 95 | NO | Git ignore specifications | `ceaf6966aa27` |
| `xare-ai-main/.vercel/project.json` | source | READ | 1 | 112 | NO | Discovered file | `90c920a92973` |
| `xare-ai-main/.vercel/README.txt` | source | READ | 12 | 520 | NO | Discovered file | `f5d1ed0f5032` |
| `xare-ai-main/api/chat/stream.ts` | source | READ | 238 | 9927 | NO | Vercel Edge serverless endpoint for direct Gemini streaming | `4200f62c5038` |
| `xare-ai-main/api/upload/presign.ts` | source | READ | 355 | 12801 | YES | Vercel Edge serverless upload presigning endpoint | `6379678a9669` |
| `xare-ai-main/api/voice/token.ts` | source | READ | 68 | 2165 | NO | Vercel Edge serverless endpoint for Deepgram voice token | `5ae10c2bd994` |
| `xare-ai-main/DEPLOYMENT_REPORT.md` | source | READ | 143 | 8363 | NO | Discovered file | `6357cdac76b2` |
| `xare-ai-main/index.html` | source | READ | 31 | 1360 | NO | Main HTML entry point with fonts & metadata | `9d3a800b149d` |
| `xare-ai-main/n8n/architecture.png` | binary | BINARY | 0 | 1065582 | NO | Discovered file | `e922b15ea949` |
| `xare-ai-main/n8n/Global System Topology & Execution Flow.png` | binary | BINARY | 0 | 70248 | NO | Discovered file | `cdb049eedd14` |
| `xare-ai-main/n8n/Xare AI.json` | source | READ | 4739 | 194844 | YES | Discovered file | `67c8dc27c4e4` |
| `xare-ai-main/N8N_ARCHITECTURE_AUDIT.md` | source | READ | 182 | 11280 | NO | Discovered file | `5ec70a8bafc3` |
| `xare-ai-main/package-lock.json` | lockfile | READ | 4585 | 165955 | NO | npm dependency lockfile | `ff14f440a230` |
| `xare-ai-main/package.json` | config | READ | 32 | 762 | NO | Node.js package manifest and dependencies | `bbade2ca8254` |
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
| `xare-ai-main/README.md` | documentation | READ | 90 | 3176 | NO | Project documentation readme | `3d82f2651581` |
| `xare-ai-main/repository-audit-after.json` | source | READ | 526 | 16866 | NO | Discovered file | `f55ee8d43f30` |
| `xare-ai-main/repository-audit-before.json` | source | READ | 407 | 13155 | NO | Discovered file | `9b9db63fe489` |
| `xare-ai-main/REPOSITORY_AUDIT_AFTER.md` | source | READ | 84 | 5993 | NO | Discovered file | `80b773843bb6` |
| `xare-ai-main/REPOSITORY_AUDIT_BEFORE.md` | source | READ | 59 | 4782 | NO | Discovered file | `370fb807d586` |
| `xare-ai-main/src/App.tsx` | source | READ | 7020 | 306941 | YES | Core single-page application component with UI, state, file handlers, and AI routing | `6e30853f801e` |
| `xare-ai-main/src/index.css` | source | READ | 119 | 3058 | NO | Global application stylesheet and animations | `fe8d58862f60` |
| `xare-ai-main/src/main.tsx` | source | READ | 12 | 281 | NO | React DOM root renderer | `093f9b0873c4` |
| `xare-ai-main/src/services/storage/index.ts` | source | READ | 3 | 61 | YES | Discovered file | `0dd3b9250d7f` |
| `xare-ai-main/src/services/storage/storageService.ts` | source | READ | 329 | 11161 | YES | Discovered file | `49548c32de84` |
| `xare-ai-main/src/services/storage/types.ts` | source | READ | 86 | 2010 | YES | Discovered file | `1ee73f02e01c` |
| `xare-ai-main/src/utils/storage.ts` | source | READ | 9 | 301 | YES | Client-side upload orchestrator with progress simulation and caching | `faff331a7309` |
| `xare-ai-main/STORAGE_ARCHITECTURE.md` | source | READ | 200 | 9318 | NO | Discovered file | `1cbf5477c998` |
| `xare-ai-main/STORAGE_MIGRATION_TEST_REPORT.md` | source | READ | 69 | 6996 | NO | Discovered file | `8f84fd46ece7` |
| `xare-ai-main/STORAGE_SECURITY_AUDIT.md` | source | READ | 41 | 3900 | NO | Discovered file | `94463135c3bb` |
| `xare-ai-main/SUPABASE_PURGE_REPORT.md` | source | READ | 35 | 2446 | NO | Discovered file | `cf84315ffdfc` |
| `xare-ai-main/tailwind.config.js` | config | READ | 13 | 215 | NO | Tailwind CSS utility configuration | `f22895ae5263` |
| `xare-ai-main/tests/direct_suite_results.json` | source | READ | 113 | 4213 | NO | Discovered file | `289ab1f324c1` |
| `xare-ai-main/tests/storage.test.cjs` | source | READ | 689 | 31895 | YES | Discovered file | `1e862b8817aa` |
| `xare-ai-main/tests/test_audio_real.cjs` | source | READ | 40 | 1834 | NO | Discovered file | `11adeb55e3cd` |
| `xare-ai-main/tests/test_direct_suite.cjs` | source | READ | 254 | 11188 | NO | Discovered file | `3d1fbbf15617` |
| `xare-ai-main/tests/test_limits.cjs` | source | READ | 113 | 3928 | NO | Discovered file | `fd707893544d` |
| `xare-ai-main/tests/test_multipart_e2e.cjs` | source | READ | 106 | 3851 | NO | Discovered file | `84a5255ea16c` |
| `xare-ai-main/tests/test_multipart_photo.cjs` | source | READ | 34 | 1386 | NO | Discovered file | `da535ac98ae2` |
| `xare-ai-main/tests/test_option_b_e2e.cjs` | source | READ | 50 | 1822 | NO | Discovered file | `92dd0b581656` |
| `xare-ai-main/tests/test_temp_providers.cjs` | source | READ | 93 | 3621 | NO | Discovered file | `117e8cb2e6df` |
| `xare-ai-main/vite.config.ts` | config | READ | 27 | 682 | NO | Vite build and chunking configuration | `d92fc437f64b` |
