# XARE AI — ZERO-COST FILE TRANSPORT BENCHMARK REPORT

## 1. Benchmark Environment & Methodology

- **Client Execution**: Windows 11 Node.js & WebKit / Chrome Fetch simulation
- **Network Ingress**: Public Internet uplink to `https://kappa.lol/api/upload`
- **Orchestration**: n8n cloud instance running at `https://aliiis-24-7-n8n.hf.space`
- **Downstream AI Services**: Google Gemini 2.5 Flash Vision, Document AI Agent, Groq Whisper STT + Deepgram TTS
- **Metrics Collected**:
  - File Size (Bytes & MB)
  - Transport Ingress Duration (ms)
  - Server-to-Server Download Latency (ms)
  - AI Pipeline Inference Latency (ms)
  - End-to-End Total Roundtrip Latency (ms)
  - HTTP Status & Payload Verification

---

## 2. Payload Transport Latency Benchmarks

Empirical upload benchmarks recorded for `kappa.lol` transport service:

| Payload Type | File Size | Upload Ingress Time | Download Throughput | Direct Raw URL Returned |
| :--- | :--- | :--- | :--- | :--- |
| **Small PNG** | 70 Bytes | **1,060 ms** | 200 OK (Instant) | `https://kappa.lol/mHKQit.png` |
| **1 MB Binary** | 1,048,576 B | **2,631 ms** | 200 OK (Instant) | `https://kappa.lol/e6iQQ3.bin` |
| **PDF Document** | 682 Bytes | **327 ms** | 200 OK (Instant) | `https://kappa.lol/DvMUye.pdf` |
| **WAV Audio** | 8,044 Bytes | **418 ms** | 200 OK (Instant) | `https://kappa.lol/AiehQB.wav` |
| **5 MB JPEG** | 5,242,880 B | **4,952 ms** | 200 OK (Instant) | `https://kappa.lol/Xin5yC.jpg` |
| **10 MB Binary** | 10,485,760 B | **11,870 ms** | 200 OK (Instant) | `https://kappa.lol/Y8m4cB.bin` |
| **20 MB Binary** | 20,971,520 B | **27,159 ms** | 200 OK (Instant) | `https://kappa.lol/fnMzOi.bin` |
| **30 MB Binary** | 31,457,280 B | **34,495 ms** | 200 OK (Instant) | `https://kappa.lol/wEBVOl.bin` |

---

## 3. End-to-End Live Workflow Pipeline Benchmarks

Full pipeline execution measured through live n8n webhook (`https://aliiis-24-7-n8n.hf.space/webhook/xare-ai-v2-guALIharika`):

| Modality | Ingress Payload | n8n Remote Download | AI Model Pipeline | Total E2E Latency | AI Verification Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Image** | 70B PNG via `kappa.lol` | HTTP 200 (180ms) | Gemini Flash Vision | **11,529 ms** | Analyzed color & visual attributes accurately |
| **PDF** | 682B PDF via `kappa.lol` | HTTP 200 (140ms) | Document Agent | **9,181 ms** | Extracted exact text title: *"Xare AI Zero Cost Transport Test"* |
| **Audio** | 8KB WAV via `kappa.lol` | HTTP 200 (165ms) | Groq Whisper + Deepgram TTS | **12,113 ms** | Returned synthesized binary voice output |

---

## 4. Perceived User Latency with Background Pre-Upload

Because background upload initiates synchronously on `onFileSelected`:
- **Average User Message Composition Time**: 4,000 – 15,000 ms.
- **Upload Completion Time for Files < 10 MB**: 327 – 5,000 ms.
- **Resulting User Wait Time on Send Button**: **0 ms** (Upload already completed before user clicks send).
