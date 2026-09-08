# REPOSITORY AUDIT (AFTER MIGRATION)

## 1. Post-Migration Audit Summary Metrics

| Metric | Value |
|---|---|
| timestamp | 2026-09-08T21:30:22.969Z |
| totalDirectories | 15 |
| totalFiles | 46 |
| totalSourceFiles | 18 |
| totalJavaScriptFiles | 6 |
| totalTypeScriptFiles | 10 |
| totalJsonFiles | 5 |
| totalConfigFiles | 5 |
| totalWorkflowFiles | 2 |
| totalLinesOfSourceCode | 9048 |
| totalLinesInspected | 24119 |
| totalFilesInspected | 34 |
| binaryFiles | 12 |
| generatedFiles | 1 |
| skippedFiles | 0 |
| ignoredFiles | 0 |

## 2. File Inventory & Status

| Relative Path | Type | Status | Lines | Size (Bytes) | Storage Related | SHA-256 (first 12) |
|---|---|---|---|---|---|---|
| `N8N_Xare_BACKEND/architecture.png` | binary | BINARY | 0 | 1065582 | NO | `e922b15ea949` |
| `N8N_Xare_BACKEND/Global System Topology & Execution Flow.png` | binary | BINARY | 0 | 70248 | NO | `cdb049eedd14` |
| `N8N_Xare_BACKEND/Xare AI.backup.json` | json | READ | 4739 | 189687 | NO | `85e5030061db` |
| `N8N_Xare_BACKEND/Xare AI.json` | json | READ | 4739 | 190106 | YES | `05b93ecccd2d` |
| `xare-ai-main/.env.example` | source | READ | 40 | 1540 | NO | `adb0deb887ee` |
| `xare-ai-main/.gitignore` | source | READ | 12 | 80 | NO | `44faa4b3159b` |
| `xare-ai-main/api/chat/stream.ts` | source | READ | 238 | 9927 | NO | `4200f62c5038` |
| `xare-ai-main/api/upload/presign.ts` | source | READ | 280 | 10207 | YES | `6da2eb499fb6` |
| `xare-ai-main/api/voice/token.ts` | source | READ | 68 | 2165 | NO | `5ae10c2bd994` |
| `xare-ai-main/index.html` | source | READ | 31 | 1360 | NO | `9d3a800b149d` |
| `xare-ai-main/N8N_ARCHITECTURE_AUDIT.md` | documentation | READ | 182 | 11099 | NO | `a95ec7e7e82f` |
| `xare-ai-main/package-lock.json` | json | READ | 4585 | 165955 | NO | `ff14f440a230` |
| `xare-ai-main/package.json` | json | READ | 32 | 762 | NO | `bbade2ca8254` |
| `xare-ai-main/postcss.config.js` | source | READ | 7 | 86 | NO | `374f669f08b1` |
| `xare-ai-main/public/android-chrome-192x192.png` | binary | BINARY | 0 | 33915 | NO | `7eae6f065f53` |
| `xare-ai-main/public/android-chrome-512x512.png` | binary | BINARY | 0 | 168938 | NO | `c17c156a75be` |
| `xare-ai-main/public/apple-touch-icon.png` | binary | BINARY | 0 | 30366 | NO | `7ed218b8b58d` |
| `xare-ai-main/public/assets/architecture.png` | binary | BINARY | 0 | 1065582 | NO | `e922b15ea949` |
| `xare-ai-main/public/assets/Global System Topology & Execution Flow.png` | binary | BINARY | 0 | 70248 | NO | `cdb049eedd14` |
| `xare-ai-main/public/favicon-16x16.png` | binary | BINARY | 0 | 817 | NO | `89516babd16b` |
| `xare-ai-main/public/favicon-32x32.png` | binary | BINARY | 0 | 2306 | NO | `ff6c307c2e7b` |
| `xare-ai-main/public/favicon-48x48.png` | binary | BINARY | 0 | 4102 | NO | `8c9878a2167c` |
| `xare-ai-main/public/favicon.ico` | binary | BINARY | 0 | 7400 | NO | `4d7ff81ba98a` |
| `xare-ai-main/public/favicon.png` | binary | BINARY | 0 | 18006 | NO | `dd9eb2945e33` |
| `xare-ai-main/public/favicon.svg` | source | READ | 9 | 225666 | NO | `b190e8b0a41d` |
| `xare-ai-main/public/site.webmanifest` | source | READ | 30 | 615 | NO | `b8e181c512fb` |
| `xare-ai-main/README.md` | documentation | READ | 2 | 11 | NO | `45fd3549ddeb` |
| `xare-ai-main/repository-audit-before.json` | json | READ | 407 | 12749 | NO | `62bc9cdb4285` |
| `xare-ai-main/REPOSITORY_AUDIT_BEFORE.md` | documentation | READ | 59 | 4724 | NO | `90a89c25d331` |
| `xare-ai-main/scripts/audit_after.cjs` | source | READ | 142 | 4777 | NO | `e2cc93085fbd` |
| `xare-ai-main/scripts/audit_before.cjs` | source | READ | 185 | 9576 | NO | `ad74d23b335e` |
| `xare-ai-main/scripts/update_workflow.cjs` | source | READ | 129 | 5049 | NO | `0c4763065065` |
| `xare-ai-main/src/App.tsx` | source | READ | 7015 | 306507 | YES | `917f04299377` |
| `xare-ai-main/src/index.css` | source | READ | 119 | 3058 | NO | `fe8d58862f60` |
| `xare-ai-main/src/main.tsx` | source | READ | 12 | 281 | NO | `093f9b0873c4` |
| `xare-ai-main/src/services/storage/index.ts` | source | READ | 3 | 59 | YES | `e4d0e3ef3efb` |
| `xare-ai-main/src/services/storage/storageService.ts` | source | READ | 321 | 10629 | YES | `988f2bdcb309` |
| `xare-ai-main/src/services/storage/types.ts` | source | READ | 86 | 1925 | YES | `7cd3060b7fdb` |
| `xare-ai-main/src/utils/storage.ts` | source | READ | 9 | 293 | YES | `f9757904a4c8` |
| `xare-ai-main/STORAGE_ARCHITECTURE.md` | documentation | READ | 144 | 6845 | NO | `dde73e35e075` |
| `xare-ai-main/STORAGE_MIGRATION_TEST_REPORT.md` | documentation | READ | 19 | 2352 | NO | `9b1c7a4f1c13` |
| `xare-ai-main/STORAGE_SECURITY_AUDIT.md` | documentation | READ | 39 | 3427 | NO | `639892096c16` |
| `xare-ai-main/SUPABASE_PURGE_REPORT.md` | documentation | READ | 33 | 2043 | NO | `3e07cce13d70` |
| `xare-ai-main/tailwind.config.js` | source | READ | 13 | 215 | NO | `f22895ae5263` |
| `xare-ai-main/tests/storage.test.cjs` | source | READ | 363 | 15786 | YES | `204bf75cddf1` |
| `xare-ai-main/vite.config.ts` | source | READ | 27 | 682 | NO | `d92fc437f64b` |
