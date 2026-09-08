# Xare AI — Autonomous Multimodal AI Engine

Production multimodal AI assistant engineered exclusively by **Ali Kassem**, built with React, Vite, Tailwind CSS, Vercel Edge functions, Firebase, and a 126-node **n8n** orchestration backend running 24/7 on Hugging Face Spaces.

---

## 1. High-Availability S3-Compatible Storage Architecture

Xare AI uses a **provider-neutral, high-availability S3-compatible cloud object storage architecture** (supporting Cloudflare R2, Backblaze B2, AWS S3, and MinIO) for all large file uploads (up to **50MB/file**):

```
Client (Browser / Mobile)
   │
   ▼
1. Presign Request (POST /api/upload/presign)
   │
   ▼
2. Direct S3 Presigned PUT Upload (Streams directly to Object Storage)
   │
   ▼
3. Presigned / Public HTTPS File URL
   │
   ▼
4. n8n Webhook Ingress (x-chatbot-token: ali1234)
   │
   ▼
5. Identify Media Type -> Download Remote File (Direct HTTP GET)
   │
   ▼
6. Multimodal AI Analysis (Gemini Vision / PDF / Groq Whisper / Deepgram)
   │
   ▼
7. Xare Frontend UI Response
```

### Key Highlights
- **Zero Inactivity Pausing:** Replaced legacy Supabase Storage to eliminate project freezing after 7 days of inactivity.
- **Zero Secret Leakage:** Access keys and secret keys remain strictly server-side; client uploads via ephemeral AWS Signature V4 URLs.
- **50MB Direct Streaming:** Bypasses serverless function payload limits by streaming raw binaries directly from the browser to cloud storage.
- **100% Provider Neutral:** Switch between Cloudflare R2, Backblaze B2, AWS S3, or MinIO simply by setting standard environment variables.

---

## 2. Environment Configuration

Copy `.env.example` to `.env` or configure in Vercel project settings:

```bash
# S3-Compatible Cloud Storage (Cloudflare R2 / Backblaze B2 / AWS S3)
STORAGE_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
STORAGE_REGION=auto
STORAGE_BUCKET=xare-files
STORAGE_ACCESS_KEY_ID=<access_key>
STORAGE_SECRET_ACCESS_KEY=<secret_key>
STORAGE_PUBLIC_URL=https://<custom_domain_or_pub_url>

# Serverless Edge APIs
GEMINI_API_KEY=<gemini_api_key>
DEEPGRAM_API_KEY=<deepgram_api_key>
CHATBOT_TOKEN=ali1234
```

---

## 3. Project Structure

```
├── api/
│   ├── chat/stream.ts         # Vercel Edge direct Gemini streaming
│   ├── upload/presign.ts       # S3 presigned upload & download URL generator
│   └── voice/token.ts         # Deepgram ephemeral voice token generator
├── src/
│   ├── services/storage/      # Modular provider-neutral storage abstraction
│   ├── utils/storage.ts       # Storage entrypoint & backward compatibility
│   ├── App.tsx                # Master single-page application & AI routing
│   └── main.tsx               # Application entrypoint
├── N8N_Xare_BACKEND/          # n8n production workflow export & topology
└── tests/                     # Automated unit, security & live E2E test suites
```

---

## 4. Verification & Testing

To execute the test matrix:
```bash
npm run build
node tests/storage.test.cjs
```
