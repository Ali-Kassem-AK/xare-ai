# XARE AI — STORAGE ARCHITECTURE DOCUMENTATION

## 1. Executive Summary & Migration Rationale

Xare AI's multimodal ingestion pipeline previously depended on **Supabase Storage** for large binary files (>5MB). The fatal issue with Supabase Free Tier is **project pausing after 7 days of inactivity**, which causes silent catastrophic failure of all user uploads and webhook processing. 

This migration completely eliminates Supabase Storage and introduces a **high-availability, provider-neutral S3-compatible cloud object storage architecture** compatible with:
1. **Cloudflare R2** (10 GB free forever, $0 egress fees, zero inactivity pausing)
2. **Backblaze B2** (10 GB free forever, 1 GB/day free egress, zero inactivity pausing, no credit card required)
3. **AWS S3 / MinIO** (Standard S3 protocol)

The architecture decouples the frontend from vendor-specific SDKs using a clean storage service abstraction layer.

---

## 2. Architecture Comparison: Before vs. After

### Before Migration (Supabase Storage)
```
User -> Browser -> Supabase Storage SDK -> Signed Upload URL -> Supabase Bucket
         │
         ▼
     Supabase Signed URL (with token=...)
         │
         ▼
    n8n Webhook -> Identify Media Type (Supabase warning) -> Has Supabase URL? -> Download Supabase File -> AI Pipeline
```

### After Migration (High-Availability Cloud Object Storage)
```
                    XARE AI FRONTEND
                           │
                           ▼
                  src/services/storage
                 (Storage Abstraction)
                           │
                 1. POST /api/upload/presign
                           │
                           ▼
                   Vercel Edge / API
               (@aws-sdk/s3-request-presigner)
                           │
                 2. Return Presigned PUT URL
                           │
                           ▼
                   Direct Fetch PUT
            (Binary stream, max 50MB)
                           │
                           ▼
               S3-Compatible Object Store
              (Cloudflare R2 / Backblaze B2)
                           │
                 3. Presigned / CDN GET URL
                           │
                           ▼
                      n8n Webhook
              (Header Auth: ali1234)
                           │
                           ▼
                  Identify Media Type
            (Universal syntax verification)
                           │
                           ▼
                 Has Remote File URL?
                           │
                           ▼
                  Download Remote File
                   (HTTP GET stream)
                           │
                 Route by Media Type
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
          Audio          Image           PDF
            │              │              │
            └──────────────┼──────────────┘
                           │
                           ▼
                      AI Pipeline
              (Gemini / Groq / Whisper)
                           │
                           ▼
                   Xare Frontend UI
```

---

## 3. Storage Provider Evaluation Matrix

| Criterion | Supabase Storage (Old) | Cloudflare R2 | Backblaze B2 | AWS S3 | Firebase Storage |
|---|---|---|---|---|---|
| **Free Storage Allowance** | 1 GB | **10 GB / month** | **10 GB forever** | 5 GB (12 mos only) | 5 GB (Spark) |
| **Bandwidth / Egress** | 2 GB / month | **Unlimited ($0 egress)** | 1 GB / day | Egress charged | 1 GB / day |
| **Inactivity Pausing** | **PAUSES AFTER 7 DAYS** | **NEVER PAUSES** | **NEVER PAUSES** | Never pauses | Never pauses |
| **Credit Card Required?** | No | Yes (to enable R2) | **NO** | Yes | No |
| **Direct Browser Upload** | Proprietary SDK | **S3 Presigned PUT** | **S3 Presigned PUT** | S3 Presigned PUT | Resumable SDK |
| **Public / Signed URLs** | Custom sign URL | **Standard SigV4 / CDN**| **Standard SigV4 / B2** | Standard SigV4 | Tokenized URL |
| **n8n Direct Download** | Yes (if active) | **Yes (100% reliable)**| **Yes (100% reliable)** | Yes | Yes |
| **Vendor Lock-in Risk** | High | **Zero (S3 Standard)** | **Zero (S3 Standard)** | Zero (S3 Standard)| High |

### Concrete Production Selection: Cloudflare R2
- **Selected Concrete Production Provider:** **Cloudflare R2**
- **Protocol Standard:** **S3-Compatible Protocol** via AWS SDK v3 (`@aws-sdk/client-s3`).
- **Rationale:**
  1. **Zero Egress Fees:** Cloudflare R2 eliminates all egress data transfer fees, guaranteeing zero cost spikes as multi-tenant document and media volume scales.
  2. **Global Anycast Performance:** Direct edge routing guarantees ultra-low presigned PUT and signed GET latency (<50ms globally) for browser uploads and n8n webhook downloads.
  3. **Generous Tier:** 10 GB free permanent monthly object storage without inactivity pauses or sleep cycles.
  4. **Strict Standard S3 API Compatibility:** Uses AWS Signature Version 4 (SigV4) authentication.
- **Provider Interchangeability:** The S3-compatible abstraction layer in `src/services/storage/` and `api/upload/presign.ts` remains 100% provider-agnostic. Secondary providers (Backblaze B2, AWS S3, MinIO) can be hot-swapped via environment variables without altering application code.

---

## 4. Security Architecture

1. **Zero Secret Leakage to Client:**
   - Client-side JavaScript never receives AWS Access Keys, Secret Keys, or Master Credentials.
   - Presigned upload URLs are generated exclusively on server-side Vercel endpoints (`/api/upload/presign`).
2. **Short-Lived Ephemeral Authorization:**
   - Presigned PUT Upload URLs expire in **30 minutes** (1,800 seconds).
   - Presigned GET Download URLs expire in **2 hours** (7,200 seconds).
3. **Collision-Resistant & Isolated Object Paths:**
   - Every file key follows: `users/${trustedUserId}/uploads/${fileId}/${sanitizedFileName}`
   - `fileId` is generated using a timestamp base36 + 8 cryptographically pseudo-random alphanumeric characters.
   - `trustedUserId` is derived from verified JWT / session headers, preventing path forgery.
4. **Filename & Path Traversal Sanitization:**
   - Directory traversal sequences (`../`, `..\\`) and dangerous characters are strictly stripped. Non-ASCII characters are safely normalized to underscores.
5. **Hard 50MB Pre-Upload Ceiling:**
   - Enforced immediately on the client before network allocation, and redundantly validated on the presign endpoint before signing.

---

## 5. Future Provider Migration Strategy

Because all client interactions go through `src/services/storage/` and server-side presigning follows the standard S3 API, Cloudflare R2 serves as the active production provider, while alternative S3-compatible providers (Backblaze B2, AWS S3, MinIO, Wasabi) require **ZERO code changes** to swap:
```bash
# Active Concrete Production Provider (Cloudflare R2):
STORAGE_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
STORAGE_REGION=auto
STORAGE_BUCKET=xare-files
STORAGE_ACCESS_KEY_ID=<r2_key>
STORAGE_SECRET_ACCESS_KEY=<r2_secret>

# Alternative: Backblaze B2:
# STORAGE_ENDPOINT=https://s3.us-east-005.backblazeb2.com
# STORAGE_REGION=us-east-005
# STORAGE_BUCKET=xare-files
# STORAGE_ACCESS_KEY_ID=<b2_key>
# STORAGE_SECRET_ACCESS_KEY=<b2_secret>
```
The application dynamically configures itself at runtime based on these standard environment variables.

---

## 6. Cloudflare R2 Production Bucket Configuration & CORS Policy

To support direct browser uploads via presigned PUT URLs, the Cloudflare R2 bucket must be created and configured with the following Cross-Origin Resource Sharing (CORS) policy:

### Bucket Specification
- **Bucket Name:** `xare-files`
- **Region:** `auto` (Cloudflare Anycast global edge)

### Bucket CORS JSON Policy
```json
[
  {
    "AllowedOrigins": [
      "https://xare-ai.vercel.app",
      "https://*.vercel.app",
      "http://localhost:5173",
      "http://localhost:3000"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "HEAD"
    ],
    "AllowedHeaders": [
      "Content-Type",
      "Content-Length",
      "x-amz-*"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

### Vercel Production Environment Activation Commands
Once an R2 API token (Object Read & Write) is created in the Cloudflare dashboard:
```bash
npx vercel env add STORAGE_ENDPOINT production         # Value: https://<account_id>.r2.cloudflarestorage.com
npx vercel env add STORAGE_ACCESS_KEY_ID production     # Value: <access_key_id>
npx vercel env add STORAGE_SECRET_ACCESS_KEY production # Value: <secret_access_key>
npx vercel env add STORAGE_BUCKET production            # Value: xare-files
npx vercel env add STORAGE_REGION production            # Value: auto
```
Following variable addition, run `npx vercel --prod` to deploy with storage fully activated.

