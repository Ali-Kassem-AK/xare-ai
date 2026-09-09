# XARE AI — ZERO-COST LIGHTNING-FAST FILE TRANSPORT ARCHITECTURE

## 1. Architectural Overview

The Xare AI Zero-Cost File Transport Architecture replaces permanent paid cloud storage with an ephemeral, zero-billing, high-speed file transport pipeline.

```
┌────────────────────────────────────────────────────────┐
│                      XARE BROWSER                      │
│                                                        │
│ 1. User selects Image, PDF, or Audio (< 50MB)          │
│ 2. Instant optimistic badge in prompt bar (0ms)        │
│ 3. Background transport begins IMMEDIATELY             │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ Immediate multipart/form-data POST
                            │ Progress tracked natively via xhr.upload
                            ▼
┌────────────────────────────────────────────────────────┐
│             EPHEMERAL TRANSPORT SERVICE                │
│                     (kappa.lol)                        │
│                                                        │
│ - Zero billing, zero credit card, zero subscriptions   │
│ - Returns direct HTTPS URL: https://kappa.lol/:id.:ext │
│ - Returns immediate delete key: /api/delete?key=:key   │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ Ephemeral HTTPS URL cached in client state
                            │ User clicks "Send"
                            ▼
┌────────────────────────────────────────────────────────┐
│                   n8n WEBHOOK INGRESS                  │
│       POST /webhook/xare-ai-v2-guALIharika             │
│                                                        │
│ Sends canonical contract:                              │
│ { fileUrl, fileName, mimeType, fileSize, mediaType }   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│              NODE: Identify Media Type                 │
│ Canonical metadata normalization across Image/PDF/Audio│
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│              NODE: Download Remote File                │
│ Server-to-server HTTP GET downloads raw binary stream  │
│ (Zero Cloudflare bot challenges, zero Turnstile)       │
└───────────────────────────┬────────────────────────────┘
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
     ┌──────────────┐┌──────────────┐┌──────────────┐
     │ Gemini Vision││Document Agent││  Groq Whisper│
     │    (Image)   ││    (PDF)     ││  + TTS Voice │
     └───────┬──────┘└──────┬───────┘└──────┬───────┘
             └──────────────┼───────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                  XARE AI BOT RESPONSE                  │
│  - Response streamed back to user UI                   │
│  - Frontend executes deleteTemporaryFile(deleteUrl)    │
│  - File permanently purged from public web (HTTP 404)  │
└────────────────────────────────────────────────────────┘
```

---

## 2. Key Components & Responsibilities

### 2.1 Client Service (`src/services/storage/storageService.ts`)
- **`uploadFileDirectly(file, options)`**:
  - Validates hard ceiling (50 MB).
  - Checks in-memory cache to prevent duplicate uploads during prompt retries.
  - Opens `XMLHttpRequest` directly to `https://kappa.lol/api/upload` with `file` form field.
  - Registers `onProgress` listener via `xhr.upload.onprogress`.
  - Registers `onTaskCreated` callback providing `{ cancel: () => xhr.abort() }` for cancellation.
  - Resolves verified `UploadResult` containing `fileUrl` and `deleteUrl`.
- **`deleteTemporaryFile(deleteUrl)`**:
  - Asynchronously calls `/api/delete?key=:key` upon message completion or user attachment removal.
- **Dormant Enterprise Fallback**:
  - Encapsulates `uploadViaS3Presigned` so that if `VITE_ENABLE_REMOTE_STORAGE === 'true'`, custom enterprise S3/R2 endpoints can still be utilized without rewriting code.

### 2.2 Frontend Integration (`src/App.tsx`)
- **`startBackgroundUpload(file, type)`**:
  - Triggered synchronously on `onFileSelected` event.
  - Mounts attachment badge in prompt bar immediately (0ms user-perceived delay).
  - Fires `uploadFileDirectly` in the background while the user types their prompt.
  - Stores `uploadPromise` and `uploadTaskHandle` in `pendingAttachment`.
- **`handleSendMessage()`**:
  - If background upload has already completed (`preUploadResult`), obtains URL in 0ms and sends immediately.
  - If background upload is still in flight (`preUploadPromise`), awaits the promise.
  - Injects canonical metadata (`fileUrl`, `fileName`, `mimeType`, `fileSize`, `mediaType`, `storageProvider: 'zero-cost-transport'`) into the n8n payload.
  - Dispatches to n8n webhook.
  - Hooks `deleteTemporaryFile` into `completeBotResponse` to purge the temporary file once the AI answer arrives.

### 2.3 Downstream n8n Integration
- **Zero Webhook Mutation Needed**:
  - The webhook continues to receive the identical canonical contract:
    - `fileUrl` / `file_url`
    - `fileName` / `file_name`
    - `mimeType` / `mime_type`
    - `fileSize` / `file_size`
    - `mediaType` / `media_type`
  - `Identify Media Type` classifies the modality accurately.
  - `Download Remote File` fetches the raw binary stream directly.
