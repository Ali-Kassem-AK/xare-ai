# Project: Xare AI Ephemeral File Transport Architecture

## Architecture

Xare AI is a high-performance multimodal AI web application (React, TypeScript, Vite, Tailwind CSS, Vercel Edge runtime) backed by an autonomous 126-node n8n workflow engine on Hugging Face Spaces (`https://aliiis-24-7-n8n.hf.space/webhook/xare-ai-v2-guALIharika`).

### Core Problem & Feasibility Gating (R1)
Direct remote HTTP GET retrieval of browser-local files (via Blob URLs, OPFS, IndexedDB, Cache Storage, Service Worker, or localhost) by a remote headless server across NAT/firewalls without a public intermediary is **physically and architecturally impossible** (RFC 1918/6598 private routing limits, gateway NAT firewall SYN dropping, browser sandbox socket restrictions, and memory-bound non-routable `blob:` URI schemes).

### Ephemeral Transport Solution (R3 & R4)
To achieve a **$0 cost, zero credit card, zero billing, privacy-first file transport** without using Hugging Face container disk storage/relay:
1. **Client T0 Background Pre-Upload**: When a user selects or drops a file (Image, PDF, Audio up to 50 MB), upload starts asynchronously in the background while the user is typing their prompt.
2. **Provider-Agnostic `FileTransport` Abstraction**:
   - `prepare(file: File)`: Validates size, computes SHA-256 fingerprint, initializes tracking.
   - `getReference(file: File, options?)`: Streams raw binary directly to the ephemeral transport provider (`https://kappa.lol/api/upload`) via `XMLHttpRequest` with progress tracking. Returns direct binary download URL and programmatic deletion URL.
   - `fetchStatus(fileId: string)`: Monitors upload progress and health.
   - `cancel(fileId: string)`: Aborts in-flight uploads.
   - `cleanup(fileId: string)`: Immediately purges the file from the provider (< 500 ms) via GET request to `/api/delete?key={key}` upon AI response settlement.
3. **Direct Raw Binary Ingestion by n8n**: The remote n8n node `Download Remote File` (`cc7bbfea-f8ab-44b4-8206-8644ad2d0922`, `typeVersion: 4.2`) retrieves the raw binary payload with accurate MIME headers via HTTP GET, completely bypassing Hugging Face container file storage.
4. **Low-End Mobile Memory Architecture**:
   - Files `<= 5 MB`: Allowed to generate local thumbnails/Base64 previews.
   - Files `> 5 MB` to `50 MB`: Handled strictly as raw binary `File` objects streamed via native `FormData` directly to the transport provider. No unbounded Base64 string allocations in V8 heap.
   - Bot image and audio responses are offloaded from RAM to browser IndexedDB (`XareMediaDB`).

---

## Feature Inventory

Every requirement and capability audited and assigned to a milestone:

| # | Feature | Description | Milestone | Source |
|---|---|---|---|---|
| 1 | Phase 0 Feasibility Proof | Physical/networking proof disproving direct browser-local fetch across NAT | M0 (Done) | Survey / R1 |
| 2 | Ephemeral Services Benchmark | Empirical evaluation of candidate services (Kappa.lol, Catbox, tmpfiles, file.io) | M0 (Done) | Survey / R1 |
| 3 | Codebase Source Audit | Complete line-level audited inventory of repository source files (91 files) | M0 (Done) | Survey / R2 |
| 4 | n8n 126-Node Graph Audit | Full topology reconstruction across 9 functional clusters & download node | M0 (Done) | Survey / R2 |
| 5 | Modular `FileTransport` Abstraction | Clean provider-agnostic interface (`prepare`, `getReference`, `fetchStatus`, `cancel`, `cleanup`) | M1 | R3 |
| 6 | Zero-Cost Ephemeral Adapter | $0, zero-card provider implementation with direct binary retrieval & <500ms deletion | M1 | R3 |
| 7 | T0 Background Pre-Upload UX | Immediate upload upon user selection concealing network latency behind prompt typing | M2 | R3 / R4 |
| 8 | Mobile Memory & Zero Base64 Leak | Binary streaming, <=5MB Base64 gating, 2GB RAM stability on Safari/Chrome | M2 | R4 |
| 9 | Concurrency & Queue Management | Concurrent multi-file upload support (2, 3, 5 files) without unhandled rejections | M3 | R4 |
| 10 | Security & Zero Secrets Scanning | Zero client secrets exposed; immediate programmatic deletion & 404 verification | M3 | R3 / R5 |
| 11 | 18 Automated Regression Tests | 100% pass rate across all 18 automated tests in `tests/zero_cost_transport.test.cjs` | M4 | R5 |
| 12 | Independent Multi-Agent Review | Reviewer & Challenger verification of architecture, frontend, mobile, security | M4 | R5 |
| 13 | Forensic Integrity Audit | Systematic runtime tracing, static analysis, zero-mock audit by Forensic Auditor | M4 | Protocol / R5 |
| 14 | Git Commit & Push to Main | Clean working tree committed and pushed to `https://github.com/Ali-Kassem-AK/xare-ai` | M5 | R5 |
| 15 | Vercel Production Deployment & Live E2E | Live production verification on `https://xare-ai.vercel.app` across Text, Image, PDF, Audio | M5 | R5 |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M0 | Survey & Feasibility Gating | R1 Technical Feasibility Gate, R2 Codebase Audit, R2 n8n 126-Node Workflow Graph | None | DONE |
| M1 | FileTransport Abstraction & Provider Layer | Modular interface contracts, Kappa.lol zero-cost provider adapter, sub-500ms cleanup | M0 | IN_PROGRESS |
| M2 | Background Pre-Upload & Mobile Memory Streaming | T0 upload triggering, raw binary streaming, <=5MB Base64 clamp, 2GB RAM safety | M1 | PLANNED |
| M3 | Concurrency Engineering & Security Verification | 2, 3, 5 concurrent upload handling, zero-secret scanning, post-deletion 404 proof | M2 | PLANNED |
| M4 | Regression Suite, Multi-Agent Review & Integrity Audit | 18 automated tests passing 100%, Reviewer approvals, Challenger stress-testing, Forensic Audit CLEAN | M3 | PLANNED |
| M5 | Production Git Push, Vercel Deployment & Live Verification | Clean commit, push to GitHub `main`, Vercel production deploy, live E2E verification | M4 | PLANNED |

---

## Interface Contracts

### `FileTransport` Interface (`src/services/storage/types.ts`)
```typescript
export interface FileTransportPrepareOptions {
  file: File;
  onProgress?: (percent: number, loaded: number, total: number) => void;
  signal?: AbortSignal;
}

export interface FileTransportResult {
  fileId: string;
  fileUrl: string;
  deleteUrl: string;
  provider: 'zero-cost' | 'firebase' | 's3-direct';
  fileName: string;
  fileSize: number;
  mimeType: string;
  expiresAt?: number;
}

export interface IFileTransportProvider {
  prepare(file: File): Promise<{ ready: boolean; fingerprint: string }>;
  upload(options: FileTransportPrepareOptions): Promise<FileTransportResult>;
  cancel(fileId: string): void;
  cleanup(deleteUrl: string): Promise<boolean>;
  getStatus(fileId: string): 'idle' | 'uploading' | 'completed' | 'failed';
}
```

### Client ↔ n8n Webhook Contract
- **Endpoint**: `POST https://aliiis-24-7-n8n.hf.space/webhook/xare-ai-v2-guALIharika`
- **Headers**:
  - `Content-Type: application/json`
  - `x-chatbot-token: ali1234`
- **Payload**:
  ```json
  {
    "chatInput": "User message prompt",
    "fileUrl": "https://kappa.lol/3NIvW0.txt",
    "file_url": "https://kappa.lol/3NIvW0.txt",
    "mediaType": "image" | "pdf" | "audio",
    "mimeType": "image/png",
    "fileName": "sample.png",
    "fileSize": 1048576,
    "taskId": "task-uuid",
    "sessionId": "session-uuid",
    "userId": "user-uuid"
  }
  ```
- **Settlement**:
  - Direct HTTP webhook response or Firestore snapshot (`users/{userId}/ai_tasks/{taskId}`).
  - Immediate trigger of `IFileTransportProvider.cleanup(deleteUrl)` within < 500 ms.

---

## Code Layout

- `src/App.tsx`: Main React application, UI state machine, file ingress handlers, chat streaming.
- `src/services/storage/`:
  - `types.ts`: Storage & transport type definitions and interfaces.
  - `storageService.ts`: Storage service implementation, zero-cost transport provider adapter, pre-upload manager.
- `api/`: Vercel Edge serverless functions:
  - `chat/stream.ts`: Chat streaming proxy.
  - `upload/presign.ts`: Presigned URL endpoint (enterprise fallback).
  - `voice/token.ts`: Voice token generation.
- `n8n/Xare AI.json`: Complete 126-node workflow definition.
- `tests/`:
  - `zero_cost_transport.test.cjs`: Master automated test matrix (18 tests).
  - `measure_n8n_latency.cjs`: Latency & health check test for n8n webhook.
- `scripts/`:
  - `scan_secrets.cjs`: Pre-deployment security secret scanner.
