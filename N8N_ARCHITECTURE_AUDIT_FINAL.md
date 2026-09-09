# N8N ARCHITECTURE AUDIT (FINAL PRODUCTION VALIDATION)

## 1. Orchestration Environment

- **Webhook Endpoint**: `https://aliiis-24-7-n8n.hf.space/webhook/xare-ai-v2-guALIharika`
- **Total Nodes in Workflow**: 126
- **Connection Graph Health**: 100% (0 broken connections, 0 dangling nodes)
- **Authentication**: Custom HTTP Header `x-chatbot-token: ali1234`
- **Hosting Topology**: n8n container on Hugging Face Spaces (used solely as workflow engine; **NOT** used as a file storage or transport relay).

---

## 2. Ingress & Processing Pipeline

```
Webhook Ingress
       ↓
Input Normalization
       ↓
Identify Media Type (Canonical properties: mediaType, mimeType, fileName, fileUrl, fileSize)
       ↓
Download Remote File (HTTP GET binary stream from https://kappa.lol/...)
       ↓
Modality Router (Dispatcher Switch)
 ┌─────┼─────┐
 ▼     ▼     ▼
Image  PDF  Audio
 │     │     │
 ▼     ▼     ▼
Gemini Doc   Groq Whisper STT
Vision Agent + Deepgram TTS
 │     │     │
 └─────┼─────┘
       ↓
Response Aggregator & Payload Formatter
       ↓
Webhook Response to Xare AI Client
```

---

## 3. Critical Node Invariant Verification

### 3.1 Node: `Identify Media Type`
- Canonical properties extracted and mapped to `$json`:
  - `mediaType` ('image' | 'pdf' | 'audio')
  - `mimeType` (e.g. 'image/png', 'application/pdf', 'audio/wav')
  - `fileName` (sanitized basename with extension)
  - `fileUrl` (canonical HTTPS URL pointing to raw bytes)
  - `fileSize` (byte length)
  - `isDirectUpload`: `true` (since `fileUrl` starts with `https://`)

### 3.2 Node: `Download Remote File`
- When `isDirectUpload` is true, executes native HTTP GET to `item.json.fileUrl`.
- **Validation**:
  - `kappa.lol` delivers raw binary streams with direct 200 OK headers.
  - Zero Cloudflare Bot Management or Turnstile challenges encountered.
  - Verified live across PNG, PDF, and WAV binaries in `TEST-011`, `TEST-012`, and `TEST-013`.
