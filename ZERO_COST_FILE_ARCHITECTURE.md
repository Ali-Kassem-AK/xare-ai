# XARE AI — ZERO-COST FILE TRANSPORT ARCHITECTURAL SPECIFICATION

## 1. Architectural Mission Statement

To establish a 100% permanently free, zero-billing, zero-subscription multimodal file transport architecture for Xare AI that enables browser clients to reliably transport images, PDFs, and audio recordings up to 50 MB directly into the live n8n backend for AI processing without requiring permanent cloud object storage or payment credentials.

---

## 2. Fundamental Technical Principle

A remote URL that an orchestrator (n8n) can fetch must ultimately point to bytes that exist somewhere accessible over the public Internet.

A browser-generated `blob:`, `file:`, local filesystem path, or browser-only object URL cannot simply be transmitted to n8n as a URL and fetched remotely.

Therefore, four distinct architectural topologies exist:

- **Option A (Direct Binary Ingress):** Client transmits raw bytes directly to n8n over HTTP multipart/form-data. Bytes reside in transit and ephemeral memory buffer only for the duration of the request execution.
- **Option B (Temporary Public File URL):** Client uploads bytes to an external third-party ephemeral host with a short TTL (e.g. 1 hour). n8n downloads from the temporary HTTPS URL, then the file expires.
- **Option C (Self-Hosted Temporary Relay):** Client uploads bytes to an intermediate application server (e.g. Vercel Edge or container), which returns a short-lived URL for n8n before deleting.
- **Option D (Permanent Object Storage Fallback):** Client streams bytes to dedicated cloud object storage (Cloudflare R2, Backblaze B2, AWS S3) via presigned URLs. Files persist until lifecycle rules delete them.

---

## 3. Visual Architectural Comparison

### CURRENT DEPLOYED ARCHITECTURE (S3/R2 Fallback)

```
┌─────────────────┐       1. Presign Request       ┌──────────────────────┐
│  Browser Client │ ─────────────────────────────> │ Vercel Edge Serverless│
│   (Xare AI UI)  │ <───────────────────────────── │  (/api/upload/presign)│
└────────┬────────┘       2. Signed PUT & GET URL  └──────────────────────┘
         │
         │ 3. Direct Binary PUT (SigV4)
         ▼
┌─────────────────────────┐
│ Cloudflare R2 / S3      │
│ (Requires Subscription) │
└────────┬────────────────┘
         │
         │ 4. POST { fileUrl: "https://..." }
         ▼
┌─────────────────────────┐
│   n8n Webhook Ingress   │
└────────┬────────────────┘
         │
         │ 5. Download Remote File (HTTP GET)
         ▼
┌─────────────────────────┐
│ Multimodal AI Pipelines │ (Gemini Vision / Document Agent / Whisper STT)
└─────────────────────────┘
```
**Fatal Flaw:** Cloudflare R2 requires an active payment method / credit card subscription to provision buckets, violating the zero-cost requirement.

---

### OPTION A: DIRECT BINARY MULTIPART TRANSPORT (WINNING ARCHITECTURE)

```
┌────────────────────────────────────────────────────────┐
│                      Browser Client                    │
│                       (Xare AI UI)                     │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ 1. POST /webhook/xare-ai-v2-guALIharika
                            │    Content-Type: multipart/form-data
                            │    Headers: x-chatbot-token: ali1234
                            │    Fields:
                            │      - taskId, sessionId, userId, username
                            │      - message, caption, action, mediaType
                            │      - photo=true | document=true | voice=true
                            │      - data: [Raw Binary File Buffer up to 50MB]
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             Hugging Face Spaces Ingress Proxy          │
│                (aliiis-24-7-n8n.hf.space)              │
│       - Verified Ingress Limit: >50 MB                 │
│       - Zero Cloudflare Bot Challenge for Direct POST  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                   n8n Webhook Node                     │
│       - Form text fields -> $json.body                 │
│       - Binary file -> $binary.data                    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             Node #1: Switch (Dispatcher)               │
│       - photo=true    -> Output 2 (Image)              │
│       - document=true -> Output 3 (PDF)                │
│       - voice=true    -> Output 1 (Voice)              │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             Node: Identify Media Type                  │
│       - Canonical metadata extraction                  │
│       - isDirectUpload = false                         │
│       - Passes existing $binary.data unmodified        │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             Node: Has Remote File URL?                 │
│       - fileUrl is empty -> Output 1 (False)           │
│       - BYPASSES Remote Download completely!           │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             Node: Route by Media Type                  │
│            (Routes binary stream directly)             │
└──────────────┬────────────────────┬────────────────────┘
               │                    │                    │
               ▼                    ▼                    ▼
     ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
     │  Voice Cluster   │  │  Image Cluster   │  │   PDF Cluster    │
     │ - Rename .oga    │  │ - Gemini 3.1     │  │ - Convert Base64 │
     │ - Groq Whisper   │  │   Vision         │  │   (Pass-through) │
     │ - Deepgram TTS   │  │                  │  │ - Document Agent │
     └─────────┬────────┘  └────────┬─────────┘  └────────┬─────────┘
               │                    │                     │
               └────────────────────┼─────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────┐
│             Firestore Persistence & Response           │
│                (users/{uid}/ai_tasks)                  │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ HTTP 200 (JSON or TTS Audio Stream)
                            ▼
┌────────────────────────────────────────────────────────┐
│                      Browser Client                    │
│                  (Interactive UI Render)               │
└────────────────────────────────────────────────────────┘
```
**Key Advantages:**
1. Completely Free: $0.00 infrastructure cost.
2. Zero payment credentials: No card, bank account, or subscription required.
3. Zero storage accumulation: Ephemeral memory buffer only during active execution.
4. Up to 50 MB proven: Passes 5MB, 10MB, 15MB, 20MB, 30MB, 40MB, 50MB files cleanly.
5. Zero third-party network hops: Client communicates directly with n8n orchestrator.

---

### OPTION B: TEMPORARY PUBLIC FILE URL (EVALUATED & REJECTED)

```
Browser ──(Upload)──> Third-Party Host (Litterbox / tmpfiles.org)
                             │
                      Temporary HTTPS URL
                             │
                             ▼
n8n ──(HTTP GET Download)──> Third-Party Host
                             │
                             ▼
                 ❌ BLOCKED BY CLOUDFLARE BOT PROTECTION
                    (n8n server receives 403 Forbidden / Challenge)
```
**Rejection Rationale:**
Live empirical testing demonstrated that third-party temporary upload hosts (e.g. Catbox/Litterbox) employ Cloudflare bot detection. When n8n's cloud runner attempts an automated programmatic GET request to download the file, Cloudflare blocks the request, resulting in empty payloads and AI pipeline failures.

---

### OPTION C: SELF-HOSTED TEMPORARY RELAY (EVALUATED & REJECTED)

```
Browser ──(POST >5MB)──> Vercel Edge Serverless Function
                             │
                             ▼
                 ❌ HTTP 413 FUNCTION_PAYLOAD_TOO_LARGE
                    (Vercel hard limit: 4.5 MB body size)
```
**Rejection Rationale:**
Vercel's serverless and edge infrastructure enforces an absolute, non-configurable request body size limit of **4.5 MB**. Any client payload exceeding 4.5 MB is rejected at the Vercel edge gateway before application code executes. Building a temporary relay on Vercel is physically impossible for files > 5MB.

---

### OPTION D: PERMANENT OBJECT STORAGE (RESERVED AS RETROFIT FALLBACK)

```
Browser ──(SigV4 PUT)──> Cloudflare R2 / AWS S3 / Backblaze B2
                             │
                      Presigned GET URL
                             │
                             ▼
n8n ──(HTTP GET)───────> Cloudflare R2 / AWS S3 / Backblaze B2
```
**Status:** Preserved 100% in codebase as inactive fallback. If an administrator ever supplies S3/R2 credentials in environment variables, the system hot-swaps to this pipeline without code modifications.

---

## 4. Winning Architecture Decision Matrix

| Dimension | Option A (Direct Binary) | Option B (Temp URL) | Option C (Vercel Relay) | Option D (Cloudflare R2) |
|---|---|---|---|---|
| **Zero Dollar Cost** | **YES ($0.00)** | YES ($0.00) | YES ($0.00) | **NO (Requires Card)** |
| **No Credit Card Required** | **YES (No Card)** | YES (No Card) | YES (No Card) | **NO (Requires Card)** |
| **No Subscription Required** | **YES (None)** | YES (None) | YES (None) | **NO (Requires Sub)** |
| **Files > 5 MB Supported** | **YES (Up to 50MB)** | YES (1 GB) | **NO (Max 4.5MB)** | YES (50 MB) |
| **Image Pipeline Working** | **YES (Gemini Vision)** | NO (Blocked by CF) | NO (>5MB blocked) | BLOCKED (No creds) |
| **PDF Pipeline Working** | **YES (Document Agent)**| NO (Blocked by CF) | NO (>5MB blocked) | BLOCKED (No creds) |
| **Audio Pipeline Working** | **YES (Whisper+Deepgram)**| NO (Blocked by CF) | NO (>5MB blocked) | BLOCKED (No creds) |
| **Cloudflare Bot Immunity** | **100% Immune** | Vulnerable (Fails) | Immune | Immune |
| **Inactivity Sleeping Risk** | **ZERO (24/7 HF Space)**| Medium | ZERO | ZERO |
| **Security / Data Leakage** | **Zero persistence** | Public URL exposed | Ephemeral buffer | Long-term bucket |
| **Architectural Verdict** | 🏆 **WINNER** | ❌ **REJECTED** | ❌ **REJECTED** | ⚠️ **FALLBACK ONLY** |

---

## 5. Implementation Topology

1. **Frontend (`src/App.tsx`):**
   - Automatically detects presence of file attachment.
   - For all files up to 50 MB, constructs native browser `FormData`.
   - Attaches `photo`, `document`, or `voice` trigger flags matching n8n Switch router rules.
   - Streams multipart payload directly to `https://aliiis-24-7-n8n.hf.space/webhook/xare-ai-v2-guALIharika`.
2. **Backend Orchestrator (n8n):**
   - Webhook receives multipart stream.
   - Places file into `$binary.data`.
   - Routes through `Switch` -> `Identify Media Type`.
   - `Has Remote File URL?` skips download because `fileUrl` is null.
   - Passes `$binary.data` directly into Gemini Vision, Document Agent, and Groq Whisper.
   - Returns AI completion and synthesized speech to frontend.
