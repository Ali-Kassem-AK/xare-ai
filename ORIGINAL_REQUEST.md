# Original User Request

## 2026-09-09T12:35:31Z

# Teamwork Project Prompt — Draft

> Status: Launched  
> Goal: Craft prompt → get user approval → delegate to teamwork_preview  
> Requested team: Full autonomous engineering team (researchers, reviewers, implementers, QA, DevOps)  

Research, determine technical feasibility, benchmark, implement, and deploy a zero-cost, privacy-first, ephemeral file transport architecture for Xare AI that keeps files local whenever possible, completely avoids paid infrastructure or credit cards, bypasses Hugging Face file storage/relays, and maintains low-latency multimodal AI pipelines (Image, PDF, Audio up to 50 MB) on mobile devices.

Working directory: `C:\Users\alika\Desktop\SelfStudy\Xare_AI\xare-ai-main`  
Integrity mode: development  

---

## Requirements

### R1. Phase 0 Technical Feasibility Gate
Objectively prove or disprove whether a browser-local file (via Blob URL, IndexedDB, OPFS, Cache Storage, Service Worker, or local origin) can be directly fetched over HTTP GET by a remote headless server (`aliiis-24-7-n8n.hf.space`) across NAT/firewalls without a public intermediary or signaling bridge. If architecturally impossible, provide the complete physical/networking proof and pivot to the best viable zero-cost, zero-card ephemeral transport architecture.

### R2. Complete Codebase & n8n Workflow Audit
Generate a comprehensive, line-level audited inventory of all repository source files and reconstruct the complete 126-node n8n workflow graph (identifying trigger, conditionals, HTTP download nodes, binary routing, and AI inference nodes for Image, PDF, and Audio).

### R3. Zero-Cost, Privacy-First Ephemeral File Transport Implementation
Implement a modular, provider-agnostic file transport layer (`FileTransport` abstraction: `prepare`, `getReference`, `fetchStatus`, `cancel`, `cleanup`) that satisfies:
- **$0 Cost & Zero Billing:** No credit card, debit card, bank account, billing profile, or auto-converting trial.
- **No Hugging Face File Relay:** Files must not be stored on or proxied through Hugging Face container filesystems.
- **Background Pre-Upload UX:** File transport begins immediately upon user selection (T0) so network upload latency is concealed behind prompt typing.
- **Direct Remote Binary Retrieval:** n8n must retrieve raw binary bytes with accurate MIME headers via HTTP GET without HTML wrappers, cookies, or captcha blocks.
- **Aggressive Cleanup:** Temporary files must be purged immediately after AI response completion (< 500 ms) with automated fallback expiration.

### R4. Low-End Mobile & Concurrency Performance Engineering
Ensure the client implementation streams binaries without excessive memory copies (avoiding large Base64 strings in memory), supports 2 GB RAM mobile devices (iOS Safari, Android Chrome), and operates stably under concurrent uploads (2, 3, 5 files).

### R5. Multi-Agent Code Review, Regression Verification, and Production Deployment
Execute independent code reviews across architecture, frontend, mobile performance, security, and n8n compatibility. Validate full regression test suite (Text, Image, PDF, Audio). Commit changes, push to GitHub (`https://github.com/Ali-Kassem-AK/xare-ai`), trigger Vercel deployment, and verify live E2E functionality on `https://xare-ai.vercel.app`.

---

## Acceptance Criteria

### Feasibility & Architecture
- [ ] Technical proof or disproof of remote access to browser-local storage (Blob/OPFS/SW) documented with real network requests.
- [ ] Selected transport architecture operates strictly under $0 with zero payment method / billing required.
- [ ] Hugging Face container filesystem is not used for file transport or storage.

### Codebase & n8n Auditing
- [ ] Complete line-level audit report of repository source files produced with exact lines inspected and function maps.
- [ ] Complete n8n workflow graph reconstructed covering all 126 nodes and media routing paths.

### Performance & Mobile UX
- [ ] Perceived upload latency for files <= 10 MB is ~0 ms due to background pre-upload at T0.
- [ ] No client out-of-memory crashes on low-end mobile devices; no unbounded Base64 string duplications.
- [ ] Concurrency tests pass for 2, 3, and 5 simultaneous uploads without unhandled rejections.

### Security & Privacy
- [ ] No static secrets or private credentials exposed in client bundles.
- [ ] Temporary files are programmatically deleted immediately after downstream AI processing completes.
- [ ] Subsequent requests to deleted files return HTTP 404 / 403.

### Production Validation
- [ ] All 18 automated tests pass (100% pass rate).
- [ ] Clean working tree committed and pushed to `main` on GitHub.
- [ ] Production Vercel deployment verified live on `https://xare-ai.vercel.app` with real multimodal chat queries (Text, Image, PDF, Audio).
