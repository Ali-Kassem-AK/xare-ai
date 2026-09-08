# N8N ARCHITECTURE AUDIT & MULTIMODAL INGESTION PIPELINE

## 1. Executive Pipeline Architecture

The Xare AI backend runs on an autonomous orchestration topology comprised of **126 n8n nodes** hosted on a dedicated 24/7 runtime on Hugging Face Spaces (`https://aliiis-24-7-n8n.hf.space`) with automated keep-alive cron jobs.

```
                    ┌─────────────────────────┐
                    │   Client Upload Event   │
                    │   (Browser / Mobile)    │
                    └────────────┬────────────┘
                                 │
                     Direct Streaming (PUT)
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ S3 / Cloud Object Store │
                    │   (R2 / B2 / S3)        │
                    └────────────┬────────────┘
                                 │
                     HTTPS / Presigned File URL
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │       n8n Webhook       │
                    │ (Header Auth: ali1234)  │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │    Node #1: Switch      │
                    │   (Stream Classifier)   │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ Node: Identify Media    │
                    │         Type            │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ Node: Has Remote File   │
                    │          URL?           │
                    └────────────┬────────────┘
                          YES    │    NO (Base64 fallback)
                     ┌───────────┴───────────┐
                     │                       │
                     ▼                       │
        ┌─────────────────────────┐          │
        │   Node: Download Remote │          │
        │          File           │          │
        │   (HTTP GET binary)     │          │
        └────────────┬────────────┘          │
                     │                       │
                     └───────────┬───────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ Node: Route by Media    │
                    │         Type            │
                    └─────┬──────┬──────┬─────┘
                          │      │      │
            ┌─────────────┘      │      └─────────────┐
            ▼                    ▼                    ▼
     [Voice Branch]       [Image Branch]        [PDF Branch]
     - Rename .oga->.ogg  - Gemini Vision       - Convert Base64->PDF
     - Groq Whisper STT   - Groq Qwen Vision    - Gemini 3.1 Flash Lite
     - GPT-OSS-120B       - Universal Extractor - Gemini 3.7 Flash
     - Deepgram TTS                             - HF pdf-to-image
            │                    │                    │
            └─────────────┬──────┴────────────────────┘
                          │
                          ▼
            ┌─────────────────────────┐
            │   Firestore Persistence │
            │ users/{uid}/ai_tasks    │
            └─────────────┬────────────┘
                          │
                          ▼
            ┌─────────────────────────┐
            │   Respond to Webhook    │
            │   (Normalized JSON)     │
            └─────────────────────────┘
```

---

## 2. Deep Node-by-Node Audit

### Node: Webhook
- **ID:** `871a7b54-e4f6-4cb1-847b-94f78754c5d5`
- **Type:** `n8n-nodes-base.webhook` (v2.1)
- **Purpose:** Ingress webhook accepting HTTP POST requests from Xare AI frontend.
- **Authentication:** `headerAuth` (`x-chatbot-token: ali1234`).
- **Path:** `xare-ai-v2-guALIharika`
- **Allowed Origins:** `*`
- **Response Mode:** `responseNode` (asynchronous deferred response via dedicated responder nodes).
- **Input:** JSON payload with `message`, `fileUrl`, `fileName`, `mimeType`, `fileSize`, `mediaType`, `taskId`, `sessionId`.
- **Output:** Raw incoming HTTP item with parsed body.

### Node: Switch (Root Stream Dispatcher)
- **ID:** `9bbefbe8-ae71-4dd9-a5c9-cfa09e3ff4ea`
- **Type:** `n8n-nodes-base.switch` (v3)
- **Purpose:** Fast-path segregation of pure text vs. media attachments.
- **Rules:**
  - **Output 0 (Text):** `typeof $json.body.message === 'string'`
  - **Output 1 (Voice):** `$json.body?.message?.voice || $json.body?.voice || ($json.body?.message?.file_url && /\.(mp3|wav|ogg|webm|m4a|aac|flac|oga)/i.test($json.body.message.file_url))`
  - **Output 2 (Photo/Image):** `$json.body?.message?.photo || $json.body?.photo || ($json.body?.message?.file_url && /\.(jpg|jpeg|png|webp|gif|bmp|svg)/i.test($json.body.message.file_url))`
  - **Output 3 (Document/PDF):** `$json.body?.message?.document || $json.body?.document || $json.body?.message?.file_url || $json.body?.file_url`
- **Downstream Destinations:** Outputs 1, 2, 3 all route directly into `Identify Media Type`.

### Node: Identify Media Type
- **ID:** `d397f5fe-5028-4ddb-8024-be067f42404c`
- **Type:** `n8n-nodes-base.code`
- **Purpose:** Normalizes all incoming metadata structures (Telegram legacy envelopes, direct web uploads, inline data) into canonical properties:
  - `item.json.mediaType`: `'audio' | 'image' | 'pdf'`
  - `item.json.mimeType` & `mime_type`
  - `item.json.fileName` & `file_name`
  - `item.json.fileUrl` & `file_url`
  - `item.json.fileSize` & `file_size`
  - `item.json.isDirectUpload`: `true` if `fileUrl` starts with `http`
- **Supabase Removal & Replacement:**
  - *Before:* Contained hardcoded Supabase storage check:
    `if (rawFileUrl && rawFileUrl.includes('/storage/v1/object/sign/') && !rawFileUrl.includes('token=')) { item.json.warning = 'Supabase signed URL is missing token parameter.'; }`
  - *After:* Replaced with provider-agnostic URL validation:
    `if (rawFileUrl && typeof rawFileUrl === 'string' && rawFileUrl.startsWith('http')) { ... validated AWS/S3 query syntax ... }`

### Node: Has Remote File URL? (formerly "Has Supabase URL?")
- **ID:** `771d7d41-b097-491d-a62c-f371d424ec10`
- **Type:** `n8n-nodes-base.if` (v3)
- **Purpose:** Evaluates whether the incoming payload includes a valid remote file URL.
- **Expression:** `{{ $json.fileUrl || $json.file_url }}` is `notEmpty`.
- **Output 0 (True):** Routes to `Download Remote File` to fetch the binary.
- **Output 1 (False):** Skips download and routes directly to `Route by Media Type` (relying on pre-attached binary or Base64 fallback).

### Node: Download Remote File (formerly "Download Supabase File")
- **ID:** `cc7bbfea-f8ab-44b4-8206-8644ad2d0922`
- **Type:** `n8n-nodes-base.httpRequest`
- **Purpose:** Executes an HTTP GET request to download the object binary directly from cloud object storage (Cloudflare R2, Backblaze B2, AWS S3, or presigned URLs).
- **URL Expression:** `={{ $json.fileUrl || $json.file_url }}`
- **Response Format:** `file` (writes binary directly to `item.binary.data`).
- **Downstream Destination:** Connects directly to `Route by Media Type`.

### Node: Route by Media Type
- **ID:** `10db6ba0-256d-476c-aa2b-b62098b671a5`
- **Type:** `n8n-nodes-base.switch` (v3)
- **Purpose:** Routes binary stream to the modality-specific processing cluster.
- **Rules:**
  - **Output 0 (audio):** routes to `Rename .oga to .ogg` -> Groq Whisper STT.
  - **Output 1 (image):** routes to `Image contant Analyst` (Gemini Vision) and `Merge` / `Merge3`.
  - **Output 2 (pdf):** routes to `Convert Base64 to PDF Binary` (pass-through guard) and `Analyze pdf` / `Document Analyzer`.

### Node: Convert Base64 to PDF Binary
- **ID:** `c08623c4-a95f-4cb9-a9e7-62e41137b3d8`
- **Type:** `n8n-nodes-base.code`
- **Purpose:** Guard node for PDF pipeline. If binary data was already downloaded by `Download Remote File`, it immediately forwards the item:
  ```javascript
  if (item.binary && item.binary.data && item.binary.data.data) {
      return item;
  }
  ```
  Otherwise, decodes inline Base64 document payloads.

### Node: Architecture Introspection Tools (`get_xare_architecture` 1 to 5)
- **Type:** `@n8n/n8n-nodes-langchain.toolCode`
- **Purpose:** In-context tool executed when user asks questions regarding Xare AI architecture.
- **Storage Field Update:** Updated from `Supabase Storage (50MB/file direct signed stream)` to `High-Availability S3-Compatible Cloud Object Storage (Cloudflare R2 / Backblaze B2 / AWS S3) (50MB/file direct signed stream)`.

---

## 3. Storage Migration Exact Delta Summary

| Stage | Pre-Migration (Supabase) | Post-Migration (S3 / Cloud Object Storage) |
|---|---|---|
| Upload Target | Supabase Storage API (`/storage/v1/object/upload/sign/`) | Direct S3 Presigned PUT (`PutObjectCommand`) |
| URL Structure | `https://*.supabase.co/storage/v1/object/sign/...token=...` | Standard S3 Presigned URL (`?X-Amz-Signature=...`) or CDN HTTPS |
| Ingestion Node Name | `Has Supabase URL?` | `Has Remote File URL?` |
| Download Node Name | `Download Supabase File` | `Download Remote File` |
| Diagnostics | Supabase token missing check | Universal S3 query and URL syntax validation |
| Resilience | Project sleeps after 7 days inactivity | Zero inactivity sleeping; 100% persistent uptime |
