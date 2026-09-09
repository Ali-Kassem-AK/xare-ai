# XARE AI — ZERO-COST FILE TRANSPORT RESEARCH REPORT

## 1. Executive Summary & Objective

This research report documents the exhaustive investigation into eliminating paid cloud storage (including Supabase Storage, Cloudflare R2, and Backblaze B2) from the Xare AI multimodal file-processing pipeline.

The user's absolute requirement:
- **Zero Payment**: No credit card, no debit card, no billing account, no paid subscriptions, no surprise charges.
- **Zero Supabase**: Complete excision of Supabase Storage.
- **No Hugging Face as Storage/Relay**: Do not host uploaded files on the ephemeral Hugging Face container filesystem due to sleep/wake cycles, storage volatility, and high latency.
- **Lightning-Fast Transport**: Files (Image, PDF, Audio up to 50 MB) must be transported immediately in the background upon user selection, yielding an ephemeral HTTPS URL.
- **n8n Server-to-Server Compatibility**: The generated URL must be directly downloadable by n8n's `Download Remote File` node without Cloudflare Bot Management, Turnstile, or CAPTCHA blocks.
- **Short TTL / Immediate Deletion**: Files exist only for the duration of AI processing, after which they are deleted or automatically expire.

---

## 2. Evaluation of Candidate Providers

We conducted empirical HTTP API tests across all primary candidate providers:

| Provider | Category | Cost / Billing Req | CORS Support | n8n Download Viability | Status / Empirical Finding |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **kappa.lol** | Ephemeral File Host | **Zero** (No card, no account) | **Full (`ACAO: *`)** | **100% Success (HTTP 200)** | **WINNER**. Up to 512MB, raw binary URL, programmatic `/api/delete?key=...` endpoint, zero bot challenge. |
| **uguu.se** | Ephemeral Host | **Zero** (No card, no account) | Missing CORS on POST | **100% Success (HTTP 200)** | Successful server-to-server download in n8n, but lacks browser CORS headers on upload. |
| **catbox.moe / litterbox** | Community File Host | **Zero** (No card, no account) | Missing CORS on POST | Blocked by User-Agent filter | Litterbox API returns `412 No file!` when browser User-Agent is sent. |
| **tmpfiles.org** | Ephemeral Host | **Zero** (No card, no account) | Full (`ACAO: *`) | **Fails (Returns HTML page)** | Direct link `/dl/:id/:file` returns an HTML landing page with dynamic tokens, causing AI to process HTML instead of binary. |
| **filebin.net** | Ephemeral Host | **Zero** (No card, no account) | Full (`ACAO: *`) | **Fails (Interstitial warning)** | Serves interstitial warning webpage requiring cookie confirmation on first download. |
| **pixeldrain.com** | File Host | Requires Basic Auth | N/A | **Fails (HTTP 401)** | Anonymous uploads now deprecated; requires registered API key. |
| **0x0.st** | Minimalist Host | Zero | N/A | **Fails (HTTP 503)** | Uploads temporarily disabled due to AI botnet spam. |
| **Cloudflare R2** | S3 Object Storage | Requires Card & Subscription | Full (configurable) | 100% Success | Disqualified due to mandatory payment method / credit card requirement. |
| **Backblaze B2** | S3 Object Storage | Requires Card or auto-deletes | Full (configurable) | 100% Success | Disqualified due to account deletion after 6 months of inactivity and card requirements. |
| **Hugging Face Relay**| Container Storage | Zero | N/A | Variable | Explicitly disqualified by user mandate (instability, sleep/wake cycles, storage ephemeral). |

---

## 3. Deep-Dive on Winning Provider: kappa.lol

### 3.1 What is kappa.lol?
`kappa.lol` is a modern, high-performance, open-access temporary file transport service built on fast CDN infrastructure.
- **Maximum File Size**: 512 MB (536,870,912 bytes), far exceeding the 50 MB requirement.
- **Browser Compatibility**: Fully enables `Access-Control-Allow-Origin: *` on both `OPTIONS` preflight and `POST` upload endpoints.
- **Direct Binary Delivery**: Raw file URLs (`https://kappa.lol/:id.:ext`) serve binary streams with correct `Content-Type` headers (`image/png`, `application/pdf`, `audio/wav`).
- **Zero Bot Blocking**: Allows headless automated downloads from cloud servers (such as n8n on Hugging Face Spaces) without Cloudflare Turnstile, CAPTCHAs, or 403 Forbidden responses.
- **Programmatic Deletion**: Every upload response returns a unique deletion key:
  `GET https://kappa.lol/api/delete?key=:key` -> `{"success": true}` immediately purges the file from the web (subsequent requests yield HTTP 404).

---

## 4. Architectural Findings on Transport Topologies

1. **Direct Browser-to-Transport Ingress**:
   - Vercel serverless functions enforce a strict **4.5 MB body limit** (`HTTP 413 Payload Too Large`).
   - Therefore, any file > 4.5 MB must bypass Vercel serverless proxies and be sent directly from the browser to the remote transport endpoint.
   - `kappa.lol`'s CORS headers permit direct browser streaming with native `XMLHttpRequest.upload` progress.

2. **Perceived-Speed Pre-Upload Optimization**:
   - Starting the upload at the exact millisecond the user attaches a file hides 100% of the upload latency behind prompt typing time.
   - When the user presses "Send", the URL is either already cached or within milliseconds of settling.

3. **Lifecycle Security**:
   - By capturing `deleteUrl` and calling it immediately upon AI completion, sensitive user documents and photos do not linger on third-party servers.
