# ARCHITECTURAL DECISION RECORD (ADR) — ZERO-COST FILE TRANSPORT

## ADR-003: Selection of Ephemeral File Transport over Cloud Object Storage

- **Status**: **ACCEPTED & IMPLEMENTED**
- **Date**: 2026-09-09
- **Deciders**: Lead Autonomous Software Architect, Full-Stack DevOps & Security Team

---

## 1. Context & Problem Statement

The previous migration attempt introduced Cloudflare R2 as an S3-compatible cloud object storage replacement for Supabase Storage. However:
1. Cloudflare R2 requires an active payment method / credit card subscription to provision buckets.
2. The user explicitly and strictly demanded **ZERO credit cards, ZERO debit cards, ZERO billing profiles, and ZERO subscriptions**.
3. Files processed by Xare AI do not need permanent cloud persistence; they only require temporary transit accessibility so that the n8n orchestrator can download the binary and forward it to downstream multimodal AI models (Gemini Vision, Document AI Agent, Groq Whisper STT).

---

## 2. Decision Drivers

- **Zero Billing Gate**: Under no circumstances may the user be required to submit payment details.
- **Payload Capacity**: Support for files up to 50 MB (bypassing Vercel's 4.5 MB serverless limit).
- **Client Latency**: Immediate background upload on attachment selection to achieve 0ms user-perceived wait time on message send.
- **Server Accessibility**: Automated HTTP GET requests from n8n must succeed with raw binary responses and zero bot challenge interference.
- **Privacy & Security**: Ephemeral lifecycle with programmatic post-processing deletion.

---

## 3. Considered Options

1. **Cloudflare R2**: High durability, S3 API, but requires credit card subscription. *(REJECTED)*
2. **Backblaze B2**: Free 10GB, but requires credit card or deletes inactive accounts after 6 months. *(REJECTED)*
3. **Hugging Face Container Filesystem**: Free, but explicitly rejected by user due to container restarts, sleep cycles, and high latency. *(REJECTED)*
4. **Third-Party Ephemeral Services (tmpfiles, filebin, catbox)**: Free, but plagued by bot filtering, HTML interstitial pages, or missing CORS headers. *(REJECTED)*
5. **kappa.lol**: 100% Free, zero card, built-in CORS (`ACAO: *`), direct raw binary delivery, verified n8n downloads across Image, PDF, and Audio, 512MB capacity, programmatic delete API. *(ACCEPTED)*

---

## 4. Decision & Implementation

1. **Primary Transport**: Adopt `kappa.lol` as the primary Zero-Cost Ephemeral Transport provider.
2. **Modular Storage Abstraction**: Keep `src/services/storage/` as a decoupled abstraction. Retain S3/R2 presigning as a dormant fallback activated only when `VITE_ENABLE_REMOTE_STORAGE === 'true'`.
3. **Background Ingress**: `startBackgroundUpload` in `src/App.tsx` fires immediately upon file selection.
4. **Lifecycle Cleanup**: Call `deleteTemporaryFile` upon completion of `completeBotResponse` to wipe temporary files from the web.

---

## 5. Consequences

- **Positive**: Complete freedom from credit card requirements, zero cloud storage bills, lightning-fast perceived upload speed, zero server-to-server bot challenges.
- **Mitigated Risks**: If external network fails or offline mode occurs, files <= 5MB gracefully fallback to direct Base64 encoding. Enterprise users can activate S3 via single environment flag.
