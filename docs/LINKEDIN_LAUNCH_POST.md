# LinkedIn Launch Post — Xare AI

> **Usage Note**: Copy Either Option A (Engineering Deep-Dive) or Option B (Concise Product Showcase) below. Replace the `[YOUR_LINKEDIN_OR_DEMO_VIDEO_LINK]` placeholder if you attach a screen-recording video or GIF.

---

## Option A — AI Systems & Architecture Deep-Dive (Recommended for Engineers & Technical Recruiters)

Over the past few months, I’ve been engineering **Xare AI** — a hybrid multimodal AI workspace built to solve three common bottlenecks in full-stack AI applications: serverless payload limits on media uploads, broken chat history when using temporary file hosts, and UI frame drops during high-speed token streaming.

Instead of routing every request through a single backend, Xare AI splits execution across three specialized paths:

1. **Direct Vercel Edge SSE Streaming (`/api/chat/stream`)**
   Standard chat and interactive `Build` requests stream directly from Google Gemini at the Edge. On the frontend, a custom external store (`STREAMING_TEXT_VAULT` + React `useSyncExternalStore`) isolates token updates to the active message card at 60fps without re-rendering the application tree.

2. **Self-Healing Interactive HTML5 / Canvas / WebGL Sandbox**
   When generating large interactive visualizations or web apps, an automated continuation engine (`checkHtmlCodeCompleteness` + `cleanAndMergeContinuation`) detects truncated HTML/JS/SVG tags and stitches up to 8 continuation passes before mounting the sandboxed `iframe`—complete with 63 built-in interactive presets and a runtime error bridge.

3. **5-Pipeline n8n Multimodal Orchestration & Ephemeral Media Transport**
   For Deep Thinking, Image Generation (Flux), Computer Vision, PDF Document QA, and Voice Notes (Groq Whisper STT + Deepgram TTS), Xare AI pre-uploads attachments in the background on selection, deduplicates files per chat using SHA-256 hashing (`TransportLifetimeLedger`), purges remote ephemeral URLs immediately after webhook processing, and persists media locally in IndexedDB (`XareMediaDB`) so chat history never breaks.

4. **Bi-Directional Real-Time Voice Orb**
   Live voice calls stream 48kHz PCM audio over WebSockets (`DeepgramOrb`) combining Deepgram `flux-general-en`, Groq inference, and 24kHz `aura-2-minerva-en` synthesis with dual Web Audio API frequency visualizers.

🔗 **Live App**: https://xare-ai.vercel.app
💻 **GitHub Repository & Architecture Docs**: https://github.com/Ali-Kassem-AK/xare-ai

I’ve documented the full system topology, n8n workflow template, media transport state machine, and verification test harnesses in the repository README. Feedback from fellow AI engineers and builders is always welcome!

#AIEngineering #TypeScript #React #n8n #FullStackDevelopment #MultimodalAI #Vercel #WebAudioAPI #SoftwareArchitecture #OpenSource

---

## Option B — Concise Product & Portfolio Post

Excited to share the open-source repository and architecture showcase for **Xare AI** — a multimodal AI workspace I designed and built from the ground up!

**What’s inside the repo:**
- **Hybrid Execution Engine**: Direct Vercel Edge SSE streaming for fast chat & code generation + a 70-node, 5-pipeline n8n workflow template for Deep Thinking, Image Generation, Vision, PDF OCR/QA, and Voice Notes.
- **Live Interactive Sandbox**: Runs generated HTML5, SVG, Canvas, and WebGL apps directly in chat with automatic multi-chunk code continuation and 63 built-in presets.
- **Real-Time Voice Orb**: Bi-directional WebSocket voice calls powered by the Web Audio API, Deepgram, and Groq.
- **Zero-Cost Ephemeral Transport + IndexedDB Persistence**: SHA-256 deduplicated background uploads with immediate post-inference remote cleanup and permanent local playback.

🌐 **Try the Live App**: https://xare-ai.vercel.app
📂 **Explore the Code & Architecture on GitHub**: https://github.com/Ali-Kassem-AK/xare-ai

#AI #WebDevelopment #ReactJS #TypeScript #n8n #GenerativeAI #SoftwareEngineering #Portfolio
