import React, { useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { 
  Sun, Moon, Send, Bot, User, Loader2, Paperclip, Mic, ImageIcon, 
  FileText, Menu, Plus, MessageSquare, Settings, Play, Pause, X, 
  LogOut, AlignLeft, CheckCircle, Code, Languages, 
  Globe, ChevronLeft, ChevronRight, ChevronDown, AudioLines, Copy, Brain, Download,
  Github, Linkedin, ZoomIn, ZoomOut, RotateCcw, RotateCw, Pencil, Maximize2, ExternalLink, ArrowUp
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  updateProfile, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, setDoc, getDoc, onSnapshot, increment 
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { uploadFileDirectly, uploadFileDirect } from './utils/storage';

// ==========================================
// --- TOKEN LIMIT & REDIRECTION CONFIG
// ==========================================
export const TOKEN_LIMIT_REDIRECTION_MSG = `Sorry, but the models have reached their free usage limit. Please try another tool, such as **Deep Thinking**, **Generate Image**, or **Upload Image or PDF**, or try again in a few minutes. Want to continue the conversation immediately? We’ll automatically switch you to **Gemini 3.5 Flash Lite** so you can continue without interruption.`;

// ==========================================
// --- STREAMING SPEED & TICK INTERVAL CONFIG
// ==========================================
/**
 * STREAMING_CONFIG: Control streaming word/character typing speed and update tick interval.
 * 
 * - charsPerSecond : Base typing speed in characters per second.
 *                    - 25 - 35 : Extra calm & slow reading pace
 *                    - 55      : Natural comfortable reading pace (Default)
 *                    - 75 - 100: Fast reading pace
 *                    - 150+    : High-speed typing
 * 
 * - tickIntervalMs : Render update throttle tick interval in milliseconds (ms).
 *                    - 16ms : 60fps ultra-fluid tick
 *                    - 30ms : 33fps smooth liquid tick (Default - optimal performance)
 *                    - 50ms : 20fps relaxed tick
 * 
 * - enableAdaptiveSpeed : Auto-scales typing speed for long responses (>500 chars).
 * - maxAdaptiveSpeed    : Max speed cap for long responses (chars/sec).
 */
export const STREAMING_CONFIG = {
  wordsPerSecond: 50,         // Typing speed directly in Words Per Second (WPS)
  tickIntervalMs: 30,         // Render update throttle tick interval in ms (30ms = 33fps optimal liquid tick)
  enableAdaptiveSpeed: true,  // Auto-scale speed for long text/code (>500 chars)
  maxAdaptiveWPS: 85,         // Max Words Per Second cap for long text
};

// ==========================================
// --- GLOWING LIGHT ANIMATION SPEED CONFIG
// ==========================================
/**
 * GLOW_ANIMATION_CONFIG: Controls the speed of the glowing light sweep animation
 * across loading phase text like 'Searching web', 'Thinking', 'Analyzing document', etc.
 * 
 * - textGlowSweepSpeedSec : Duration of the glowing light sweep animation in seconds.
 *                           - 1.2s - 1.8s : Fast, energetic modern glow sweep (Default)
 *                           - 2.5s - 3.5s : Medium pace
 *                           - 4.5s+       : Slow pace
 */
export const GLOW_ANIMATION_CONFIG = {
  textGlowSweepSpeedSec: 1.9, // Glowing light sweep duration in seconds (Default: 1.8s)
};

// ==========================================
// --- TOOL & ANIMATION PHASE DURATIONS (MS)
// ==========================================
/**
 * Control how long each loading animation/phase lasts before switching to the next step.
 * All values are in milliseconds (e.g. 500 = 0.5s, 1000 = 1s, 5000 = 5s).
 * 
 * ⏱️ QUICK TIME CONTROLS:
 * - sendingDurationMs: Duration of the initial "Sending" animation before transitioning to the specific tool phase.
 * - [toolName].thinking / analyzingPossibilities / readingSources / processingAudio: Durations for subsequent stages.
 */
export const TOOL_PHASE_DURATIONS = {
  sendingDurationMs: 3000,         // Time for the initial 'Sending' animation (Default: 600ms)

  think: {
    analyzingPossibilities: 8000, // Time before switching from 'Thinking deeply' to 'Analyzing possibilities'
  },
  audio: {
    processingAudio: 6000,        // Time before switching from 'Listening' to 'Processing audio'
  },
  image: {
    analyzingImage: 4500,         // Time before switching from 'Parsing Image' to 'Analyzing image'
    thinking: 6000,               // Time before switching from 'Analyzing image' to 'Thinking'
  },
  document: {
    analyzingDocument: 5000,      // Time before switching from 'Parsing PDF' to 'Analyzing document'
    thinking: 16000,              // Time before switching from 'Analyzing document' to 'Thinking'
  },
  summarize: {
    thinking: 5000,               // Time before switching from 'Summarizing' to 'Thinking'
  },
  search: {
    readingSources: 7000,         // Time before switching from 'Searching web' to 'Reading sources'
    thinking: 6000,               // Time before switching from 'Reading sources' to 'Thinking'
  },
  explain: {
    thinking: 5000,               // Time before switching from 'Analyzing code' to 'Thinking'
  },
  translate: {
    thinking: 5000,               // Time before switching from 'Translating' to 'Thinking'
  },
  fix: {
    thinking: 5000,               // Time before switching from 'Analyzing grammar' to 'Thinking'
  }
};

// ==========================================
// --- FIREBASE CONFIGURATION & INITIALIZATION
// ==========================================

/**
 * Firebase project configuration object.
 * Contains necessary keys and identifiers to connect to the Xare-5bc49 Firebase backend.
 */
const firebaseConfig = {
  apiKey: "AIzaSyBfEwwiLvARKghXymqC0ifepXZLiG5aVGM",
  authDomain: "xare-5bc49.firebaseapp.com",
  projectId: "xare-5bc49",
  storageBucket: "xare-5bc49.firebasestorage.app",
  messagingSenderId: "517050397929",
  appId: "1:517050397929:web:c185273d189020b8fb2c78",
  measurementId: "G-SNL1DWW260"
};

// Initialize Firebase App and core services (Auth, Firestore)
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// ==========================================
// --- LOCAL STORAGE (IndexedDB) FOR LARGE FILES
// ==========================================
// Bypasses the 1MB Firestore limit by storing massive base64 payloads directly on the user's device browser

const DB_NAME = 'XareMediaDB';
const STORE_NAME = 'mediaStore';

let cachedDBPromise: Promise<IDBDatabase> | null = null;

const initDB = (): Promise<IDBDatabase> => {
  if (!cachedDBPromise) {
    cachedDBPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (e: any) => {
        e.target.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        cachedDBPromise = null;
        reject(request.error);
      };
    });
  }
  return cachedDBPromise;
};

const saveToLocalDB = async (id, data) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(data, id);
      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error("LocalDB Save Error:", e);
    return null;
  }
};

const getFromLocalDB = async (id) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error("LocalDB Get Error:", e);
    return null;
  }
};

// ==========================================
// --- GEMINI API INTEGRATION
// ==========================================

/**
 * Bulletproof date parsing helpers to prevent invalid Date crashes.
 */
const parseDateSafe = (val: any): Date => {
  if (!val) return new Date();
  if (typeof val.toDate === 'function') {
    try { return val.toDate(); } catch(e) { return new Date(); }
  }
  if (typeof val === 'object' && typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000);
  }
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? new Date() : val;
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date() : d;
};

const getTimeSafe = (val: any): number => {
  return parseDateSafe(val).getTime();
};

/**
 * Calculates the exact timestamp of the most recent activity in a chat (latest message or updatedAt).
 * Guarantees that chats with new messages immediately jump to the top of the history list.
 */
const getLatestChatActivityTime = (chat: any): number => {
  if (!chat) return 0;
  let maxTime = getTimeSafe(chat.updatedAt);
  if (Array.isArray(chat.messages) && chat.messages.length > 0) {
    const lastMsg = chat.messages[chat.messages.length - 1];
    if (lastMsg && lastMsg.timestamp) {
      const lastMsgTime = getTimeSafe(lastMsg.timestamp);
      if (lastMsgTime > maxTime) maxTime = lastMsgTime;
    }
  }
  return maxTime;
};

/**
 * Universal helper to interact directly with the Gemini API.
 * Uses a smart Endpoint Resolver to automatically find the correct internal API string for Gemini 3.1 Flash Lite.
 */
/**
 * Secure Server-Side Stream Consumer.
 * Connects to /api/chat/stream on the Vercel Edge runtime with zero client-side credential exposure.
 */
const callGeminiAPIStream = async (
  prompt: string,
  onChunk: (accumulatedText: string, chunk: string) => void,
  systemInstruction = "",
  signal?: AbortSignal
): Promise<string> => {
  const payload: any = { prompt };
  if (systemInstruction) {
    payload.systemInstruction = systemInstruction;
  }

  const res = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-chatbot-token': 'ali1234',
      'x-user-id': 'auth_session_user'
    },
    body: JSON.stringify(payload),
    signal
  });

  if (!res.ok) {
    throw new Error(`HTTP Error ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No readable stream available from server proxy");

  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    
    const lines = buffer.split('\n');
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const chunkText = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (chunkText) {
            accumulated += chunkText;
            onChunk(accumulated, chunkText);
          }
        } catch (e) {
          // Ignore partial chunk parse
        }
      }
    }
  }

  return accumulated;
};

const callGeminiAPI = async (prompt: string, systemInstruction = "", isJson = false) => {
  let result = "";
  try {
    result = await callGeminiAPIStream(prompt, () => {}, systemInstruction);
    if (isJson) {
      const match = result.match(/\[[\s\S]*\]/);
      if (match) return match[0];
    }
    return result;
  } catch (err) {
    console.error("Secure API stream failure:", err);
    throw err;
  }
};

// ==========================================
// --- UTILITY FUNCTIONS
// ==========================================

/**
 * Utility to strip <think>...</think> blocks from AI model responses.
 * Fast O(1) short-circuit if no <think tag is present.
 */
export const cleanThinkTags = (text: any) => {
  if (!text || typeof text !== 'string') return text;
  if (!text.includes('<think')) return text;
  return text
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
    .trim();
};

/**
 * Generates a completely unique identifier.
 */
const generateUniqueId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

/**
 * Universal clipboard copy utility with fallback for older browsers/iFrames.
 */
const copyToClipboard = async (text: string) => {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (e) {
      console.warn("navigator.clipboard.writeText failed, falling back to textarea:", e);
    }
  }

  return new Promise<void>((resolve, reject) => {
    try {
      const activeEl = document.activeElement as HTMLElement;
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      textArea.setAttribute("readonly", "");
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
      if (activeEl && typeof activeEl.focus === 'function') {
        activeEl.focus();
      }
      resolve();
    } catch (err) {
      console.error('Failed to copy text: ', err);
      reject(err);
    }
  });
};

/**
 * Lightweight syntax highlighter for code blocks
 */
const SYNTAX_HIGHLIGHT_CACHE = new Map<string, string>();
const MAX_SYNTAX_CACHE_SIZE = 500;

/**
 * Lightweight memoized syntax highlighter for code blocks ($O(1)$ cached lookup)
 */
const highlightSyntax = (code: string, lang: string, isDarkMode: boolean) => {
  if (!code) return '';
  const cacheKey = `${lang || 'code'}_${isDarkMode ? 'd' : 'l'}_${code}`;
  if (SYNTAX_HIGHLIGHT_CACHE.has(cacheKey)) {
    return SYNTAX_HIGHLIGHT_CACHE.get(cacheKey)!;
  }

  let escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const kwStyle = isDarkMode ? 'color: #c084fc; font-weight: 600;' : 'color: #9333ea; font-weight: 600;';
  const strStyle = isDarkMode ? 'color: #34d399;' : 'color: #059669;';
  const numStyle = isDarkMode ? 'color: #fbbf24;' : 'color: #d97706;';
  const cmStyle = isDarkMode ? 'color: #64748b; font-style: italic;' : 'color: #94a3b8; font-style: italic;';
  const fnStyle = isDarkMode ? 'color: #38bdf8;' : 'color: #0284c7;';

  // Single-pass tokenizer to prevent sub-string replacements inside generated HTML tags
  const tokenRegex = /(\/\/.*|\/\*[\s\S]*?\*\/|#.*)|(".*?"|'.*?'|`.*?`)|(\b(?:const|let|var|function|return|if|else|for|while|import|export|from|default|class|extends|async|await|try|catch|new|type|interface|public|private|protected|def|self|print|struct|enum|void|int|float|double|bool|string)\b)|(\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_]\w*(?=\s*\())/g;

  const highlighted = escaped.replace(tokenRegex, (match, comment, str, kw, num, fn) => {
    if (comment) return `<span style="${cmStyle}">${comment}</span>`;
    if (str) return `<span style="${strStyle}">${str}</span>`;
    if (kw) return `<span style="${kwStyle}">${kw}</span>`;
    if (num) return `<span style="${numStyle}">${num}</span>`;
    if (fn) return `<span style="${fnStyle}">${fn}</span>`;
    return match;
  });

  if (SYNTAX_HIGHLIGHT_CACHE.size >= MAX_SYNTAX_CACHE_SIZE) {
    const firstKey = SYNTAX_HIGHLIGHT_CACHE.keys().next().value;
    if (firstKey) SYNTAX_HIGHLIGHT_CACHE.delete(firstKey);
  }
  SYNTAX_HIGHLIGHT_CACHE.set(cacheKey, highlighted);
  return highlighted;
};

/**
 * Enhanced Code Block component with line numbers, syntax highlighting, copy feedback, and language badge.
 */
export const CodeBlock = React.memo(({ code, lang, isDarkMode, isStreaming }: { code: string; lang: string; isDarkMode: boolean; isStreaming?: boolean }) => {
  const [isCopied, setIsCopied] = useState(false);
  
  const handleCopy = useCallback(async () => {
    await copyToClipboard(code);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [code]);

  const lines = useMemo(() => (code || '').split('\n'), [code]);

  // Fast plain text path while code is actively streaming (0 regex execution cost per frame)
  const highlightedCode = useMemo(() => {
    if (isStreaming) {
      return (code || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
    return highlightSyntax(code, lang, isDarkMode);
  }, [code, lang, isDarkMode, isStreaming]);

  return (
    <div className={`my-4 rounded-2xl overflow-hidden border shadow-md transition-all ${isDarkMode ? 'border-slate-800/80 bg-[#050810]' : 'border-slate-200 bg-[#f8fafc]'}`}>
      <div className={`flex items-center justify-between px-4 py-2.5 border-b select-none ${isDarkMode ? 'bg-[#080c16]/90 border-slate-800/80 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold uppercase tracking-wider ${isDarkMode ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-800/40' : 'bg-blue-50 text-blue-600 border border-blue-200'}`}>
            {lang || 'code'}
          </span>
          <span className="text-[11px] opacity-60 font-mono">{lines.length} lines</span>
        </div>

        <button 
          onClick={handleCopy} 
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
            isDarkMode 
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60' 
              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm'
          }`}
          title="Copy code"
        >
          {isCopied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          {isCopied ? 'Copied!' : 'Copy Code'}
        </button>
      </div>

      <div className="overflow-x-auto p-4 chat-scroll flex items-start">
        {/* Line Numbers Column */}
        <div className={`select-none font-mono text-[12.5px] text-right pr-3.5 mr-3.5 border-r leading-relaxed ${isDarkMode ? 'text-slate-600 border-slate-800/80' : 'text-slate-400 border-slate-200'}`}>
          {lines.map((_, idx) => (
            <div key={idx}>{idx + 1}</div>
          ))}
        </div>

        {/* Code Content */}
        <pre className="flex-1 font-mono text-[13.5px] leading-relaxed whitespace-pre overflow-x-auto">
          <code 
            className={isDarkMode ? 'text-slate-200' : 'text-slate-800'}
            dangerouslySetInnerHTML={{ __html: highlightedCode }}
          />
        </pre>
      </div>
    </div>
  );
});

/**
 * Message action row attached to the bottom of AI messages (Copy, Regenerate, & Version Switcher controls).
 */
export const MessageActions = ({ 
  text, 
  isDarkMode, 
  msg, 
  onRegenerate, 
  onSwitchVersion 
}: { 
  text: string; 
  isDarkMode: boolean; 
  msg?: any; 
  onRegenerate?: () => void; 
  onSwitchVersion?: (idx: number) => void; 
}) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    await copyToClipboard(cleanThinkTags(text));
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const versions = msg?.versions || [];
  const activeIdx = msg?.activeVersionIndex ?? (versions.length > 0 ? versions.length - 1 : 0);

  return (
    <div className="flex items-center justify-between gap-3 mt-2 -mb-1 opacity-80 hover:opacity-100 transition-opacity">
      <div className="flex items-center gap-1.5">
        <button 
          onClick={handleCopy} 
          title="Copy message" 
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${isDarkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
        >
          {isCopied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{isCopied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      {/* Version Switcher Controls (< 1 / 2 >) */}
      {versions.length > 1 && onSwitchVersion && (
        <div className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${isDarkMode ? 'bg-slate-800/80 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
          <button 
            disabled={activeIdx === 0}
            onClick={() => onSwitchVersion(activeIdx - 1)}
            className="p-0.5 rounded hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous version"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="px-1 text-[11px] font-mono">{activeIdx + 1} / {versions.length}</span>
          <button 
            disabled={activeIdx === versions.length - 1}
            onClick={() => onSwitchVersion(activeIdx + 1)}
            className="p-0.5 rounded hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next version"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
// ==========================================
// --- OPTIMIZED STATIC REGEXP CONSTANTS (0-ALLOCATION PERFORMANCE)
// ==========================================
const INLINE_SPLIT_REGEX = /(!\[.*?\]\(.*?\)|\[.*?\]\(.*?\)|\*\*.*?\*\*|\*.*?\*|`[^`\n]+`|\$[^$\n]+\$|\\\([^\\\n]+\\\))/g;
const MARKDOWN_IMG_REGEX = /^!\[(.*?)\]\((.*?)\)$/;
const MARKDOWN_LINK_REGEX = /^\[(.*?)\]\((.*?)\)$/;
const URL_AUTOLINK_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
const IS_HTTP_REGEX = /^https?:\/\//i;
const BR_TAG_SPLIT_REGEX = /(<br\s*\/?>)/i;

const SQRT_MATH_REGEX = /\\sqrt\{((?:[^{}]|\{[^{}]*\})*)\}/g;
const FRAC_MATH_REGEX = /\\frac\{((?:[^{}]|\{[^{}]*\})*)\}\{((?:[^{}]|\{[^{}]*\})*)\}/g;
const BOXED_MATH_REGEX = /\\boxed\{((?:[^{}]|\{[^{}]*\})*)\}/g;

const SYNTAX_TOKEN_REGEX = /(\/\/.*|\/\*[\s\S]*?\*\/|#.*)|(".*?"|'.*?'|`.*?`)|(\b(?:const|let|var|function|return|if|else|for|while|import|export|from|default|class|extends|async|await|try|catch|new|type|interface|public|private|protected|def|self|print|struct|enum|void|int|float|double|bool|string)\b)|(\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_]\w*(?=\s*\())/g;
/**
 * Highly upgraded and robust LaTeX math renderer.
 */
const renderMath = (tex: string, isDarkMode: boolean) => {
  let inner = tex.replace(/^(\$\$?|\\\[|\\\()|(\$\$?|\\\]|\\\))$/g, '').trim();

  let escaped = inner
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  let html = escaped
     .replace(/\{,\}/g, ',')
     .replace(/\\,/g, '<span class="mx-[1px]"></span>')
     .replace(/\\;/g, '<span class="mx-[2px]"></span>')
     .replace(/\\quad/g, '<span class="mx-2"></span>')
     .replace(/\\qquad/g, '<span class="mx-4"></span>')
     .replace(/\\\{/g, '{')
     .replace(/\\\}/g, '}')
     .replace(/\\\|/g, '|')
     .replace(/\\!/g, '')
     .replace(/\\Delta/g, 'Δ')
     .replace(/\\delta/g, 'δ')
     .replace(/\\pi/g, 'π')
     .replace(/\\Pi/g, 'Π')
     .replace(/\\alpha/g, 'α')
     .replace(/\\beta/g, 'β')
     .replace(/\\gamma/g, 'γ')
     .replace(/\\theta/g, 'θ')
     .replace(/\\Theta/g, 'Θ')
     .replace(/\\sigma/g, 'σ')
     .replace(/\\Sigma/g, 'Σ')
     .replace(/\\omega/g, 'ω')
     .replace(/\\Omega/g, 'Ω')
     .replace(/\\lambda/g, 'λ')
     .replace(/\\Lambda/g, 'Λ')
     .replace(/\\mu/g, 'μ')
     .replace(/\\epsilon/g, 'ε')
     .replace(/\\phi/g, 'φ')
     .replace(/\\infty/g, '∞')
     .replace(/\\nabla/g, '∇')
     .replace(/\\partial/g, '∂')
     .replace(/\\le(q)?/g, ' ≤ ')
     .replace(/\\ge(q)?/g, ' ≥ ')
     .replace(/\\times/g, ' × ')
     .replace(/\\cdot/g, ' · ')
     .replace(/\\Leftrightarrow/g, ' ⇔ ')
     .replace(/\\Rightarrow/g, ' ⇒ ')
     .replace(/\\Leftarrow/g, ' ⇐ ')
     .replace(/\\implies/g, ' ⇒ ')
     .replace(/\\rightarrow/g, ' → ')
     .replace(/\\leftarrow/g, ' ← ')
     .replace(/\\iff/g, ' ⇔ ')
     .replace(/\\equiv/g, ' ≡ ')
     .replace(/\\approx/g, ' ≈ ')
     .replace(/\\sim/g, ' ∼ ')
     .replace(/\\pm/g, ' ± ')
     .replace(/\\mp/g, ' ∓ ')
     .replace(/\\neq/g, ' ≠ ')
     .replace(/\\propto/g, ' ∝ ')
     .replace(/\\sum/g, '∑')
     .replace(/\\prod/g, '∏')
     .replace(/\\int/g, '∫')
     .replace(/\\circ/g, ' ∘ ')
     .replace(/\\cup/g, ' ∪ ')
     .replace(/\\cap/g, ' ∩ ')
     .replace(/\\in/g, ' ∈ ')
     .replace(/\\notin/g, ' ∉ ')
     .replace(/\\subset(eq)?/g, ' ⊆ ')
     .replace(/\\forall/g, ' ∀ ')
     .replace(/\\exists/g, ' ∃ ')
     .replace(/\\mathbb\{R\}/g, 'ℝ')
     .replace(/\\mathbb\{Z\}/g, 'ℤ')
     .replace(/\\mathbb\{N\}/g, 'ℕ')
     .replace(/\\mathbb\{C\}/g, 'ℂ')
     .replace(/\\mathbb\{Q\}/g, 'ℚ')
     .replace(/\\text\{([^}]*)\}/g, '<span class="font-sans normal-case font-normal opacity-80 mx-1">$1</span>')
     .replace(/\\textbf\{([^}]*)\}/g, '<strong class="font-bold">$1</strong>')
     .replace(/\\mathbf\{([^}]*)\}/g, '<strong class="font-bold">$1</strong>')
     .replace(/\\mathit\{([^}]*)\}/g, '<em class="italic">$1</em>');

  for (let i = 0; i < 3; i++) {
      html = html.replace(SQRT_MATH_REGEX, '<span class="inline-flex items-baseline"><span class="mr-[1px] leading-none">√</span><span class="border-t border-current pt-[1px]">$1</span></span>');
  }

  for (let i = 0; i < 3; i++) {
     html = html.replace(FRAC_MATH_REGEX, `<span class="inline-flex flex-col align-middle text-center text-[0.85em] leading-tight mx-1.5"><span class="border-b-[1.5px] pb-[1px] border-current opacity-90">$1</span><span class="pt-[1px] opacity-90">$2</span></span>`);
  }

  html = html.replace(BOXED_MATH_REGEX, `<span class="inline-block border px-3 py-1 rounded-md font-semibold mx-1 shadow-sm transition-colors ${isDarkMode ? 'border-blue-500/30 bg-blue-500/10 text-blue-200' : 'border-blue-300 bg-blue-50 text-blue-800'}">$1</span>`);

  html = html.replace(/\^\{((?:[^{}]|\{[^{}]*\})*)\}/g, '<sup class="text-[0.7em] ml-[1px] opacity-90">$1</sup>');
  html = html.replace(/\^([a-zA-Z0-9\-\+\*])/g, '<sup class="text-[0.7em] ml-[1px] opacity-90">$1</sup>');
  html = html.replace(/_\{((?:[^{}]|\{[^{}]*\})*)\}/g, '<sub class="text-[0.7em] ml-[1px] opacity-90">$1</sub>');
  html = html.replace(/_([a-zA-Z0-9\-\+\*])/g, '<sub class="text-[0.7em] ml-[1px] opacity-90">$1</sub>');

  return html;
};

const UNSAFE_URL_REGEX = /^(javascript:|data:|vbscript:)/i;

const sanitizeUrl = (url: string) => {
  if (!url || typeof url !== 'string') return '#';
  const trimmed = url.trim();
  if (UNSAFE_URL_REGEX.test(trimmed)) {
    return '#';
  }
  return trimmed;
};

/**
 * Advanced custom Markdown renderer with Image, Link, Bold, Italic, Code, & Math support.
 */
const renderInline = (text: any, isDarkMode: boolean) => {
  if (typeof text !== 'string') return text;

  const parts = text.split(INLINE_SPLIT_REGEX);
  
  return parts.map((part, i) => {
    if (!part) return null;
    
    const imgMatch = part.match(MARKDOWN_IMG_REGEX);
    if (imgMatch) {
      const url = sanitizeUrl(imgMatch[2]);
      return <ImageWithActions key={i} src={url} isDarkMode={isDarkMode} />;
    }

    const linkMatch = part.match(MARKDOWN_LINK_REGEX);
    if (linkMatch) {
      const linkText = linkMatch[1];
      const url = sanitizeUrl(linkMatch[2]);
      return (
        <a
          key={i}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline font-medium hover:opacity-80 transition-opacity ${
            isDarkMode ? 'text-blue-400' : 'text-blue-600'
          }`}
        >
          {linkText}
        </a>
      );
    }

    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={i} className={`font-black text-[1.08em] tracking-tight ${isDarkMode ? 'text-cyan-300' : 'text-blue-800'}`}>
          {renderInline(part.slice(2, -2), isDarkMode)}
        </strong>
      );
    }

    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2 && !part.startsWith('**')) {
      return (
        <em key={i} className={`italic font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
          {renderInline(part.slice(1, -1), isDarkMode)}
        </em>
      );
    }

    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      const innerCode = part.slice(1, -1);
      return (
        <code key={i} className={`px-2 py-0.5 mx-0.5 rounded-md text-[0.95em] font-mono border whitespace-nowrap inline-block max-w-full overflow-x-auto align-middle transition-colors ${
          isDarkMode ? 'bg-slate-800/90 text-cyan-200 border-slate-700/80' : 'bg-slate-200/90 text-blue-900 border-slate-300/80'
        }`}>
          {innerCode}
        </code>
      );
    }

    if ((part.startsWith('$') && part.endsWith('$') && part.length >= 2) || (part.startsWith('\\(') && part.endsWith('\\)') && part.length >= 4)) {
      return (
        <span key={i} className={`font-sans font-medium tracking-wide text-[1.05em] px-0.5 whitespace-nowrap ${
          isDarkMode ? 'text-slate-100' : 'text-slate-900'
        }`} dangerouslySetInnerHTML={{ __html: renderMath(part, isDarkMode) }} />
      );
    }
    
    let cleanText = part.replace(/\$\\rightarrow\$/g, '→').replace(/\\rightarrow/g, '→');
    
    const urlParts = cleanText.split(URL_AUTOLINK_REGEX);
    if (urlParts.length > 1) {
      return (
        <React.Fragment key={i}>
          {urlParts.map((subPart, subIdx) => {
            if (IS_HTTP_REGEX.test(subPart)) {
              const safeUrl = sanitizeUrl(subPart);
              return (
                <a
                  key={subIdx}
                  href={safeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`underline font-medium hover:opacity-80 transition-opacity break-all ${
                    isDarkMode ? 'text-blue-400' : 'text-blue-600'
                  }`}
                >
                  {subPart}
                </a>
              );
            }
            const subNodes = subPart.split(BR_TAG_SPLIT_REGEX);
            if (subNodes.length > 1) {
              return (
                <React.Fragment key={subIdx}>
                  {subNodes.map((node, nodeIdx) => (
                    BR_TAG_SPLIT_REGEX.test(node) ? <br key={nodeIdx} /> : <React.Fragment key={nodeIdx}>{node}</React.Fragment>
                  ))}
                </React.Fragment>
              );
            }
            return <React.Fragment key={subIdx}>{subPart}</React.Fragment>;
          })}
        </React.Fragment>
      );
    }

    const textNodes = cleanText.split(BR_TAG_SPLIT_REGEX);
    if (textNodes.length > 1) {
      return (
        <React.Fragment key={i}>
          {textNodes.map((node, nodeIdx) => (
            BR_TAG_SPLIT_REGEX.test(node) ? <br key={nodeIdx} /> : <React.Fragment key={nodeIdx}>{node}</React.Fragment>
          ))}
        </React.Fragment>
      );
    }

    return <React.Fragment key={i}>{cleanText}</React.Fragment>;
  });
};

/**
 * Typing Cursor Component (Disabled)
 */
export const TypingCursor = ({ isDarkMode }: { isDarkMode?: boolean }) => null;

/**
 * Main Message Formatter with Token-by-Token Streaming Support
 */
const formatMessageText = (text: any, isDarkMode: boolean, isStreaming: boolean = false) => {
  if (!text && !isStreaming) return null;
  if (!text && isStreaming) {
    return (
      <div className="flex items-center gap-1.5 py-1">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse [animation-delay:150ms]" />
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse [animation-delay:300ms]" />
      </div>
    );
  }

  if (typeof text !== 'string') {
    try {
      text = JSON.stringify(text);
    } catch (e) {
      text = String(text);
    }
  }
  
  let processedText = cleanThinkTags(text).replace(/\\n/g, '\n').replace(/\\"/g, '"');
  if (!processedText.trim()) return null;

  // Normalize 4+ backticks to 3 backticks
  let formatText = processedText.replace(/`{4,}/g, '```');

  // Auto-recovery: If text has inline `python` / `js` tag followed by code lines OR raw code without triple backticks:
  if (!formatText.includes('```')) {
    const inlineLangMatch = formatText.match(/`([a-zA-Z0-9_\-\+\#]+)`\s*\n+([\s\S]+)/);
    if (inlineLangMatch) {
      const detectedLang = inlineLangMatch[1];
      const restCode = inlineLangMatch[2];
      if (/\b(import|def|class|function|const|let|var|return|pygame|config)\b/.test(restCode)) {
        const prefixIndex = inlineLangMatch.index || 0;
        const prefixBefore = formatText.substring(0, prefixIndex);
        formatText = (prefixBefore ? prefixBefore.trim() + '\n' : '') + '```' + detectedLang + '\n' + restCode.trim() + '\n```';
      }
    }
  }

  if (isStreaming) {
    // Virtual-close unclosed code block during streaming so code renders inside code block container
    const codeBlockCount = (formatText.match(/```/g) || []).length;
    if (codeBlockCount % 2 !== 0) {
      formatText += '\n```';
    }
    // Virtual-close unclosed math block
    const mathCount = (formatText.match(/\$\$/g) || []).length;
    if (mathCount % 2 !== 0) {
      formatText += '$$';
    }
  }

  const blocks = formatText.split(/(```[\s\S]*?```|\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])/g);

  return blocks.map((block, bIdx) => {
    if (!block) return null;
    
    // Code Blocks (Handles leading/trailing whitespace and language tags safely)
    const trimmedBlock = block.trim();
    if (trimmedBlock.startsWith('```')) {
      let raw = trimmedBlock;
      if (raw.endsWith('```')) {
        raw = raw.slice(3, -3);
      } else {
        raw = raw.slice(3);
      }

      const firstNewline = raw.indexOf('\n');
      let lang = '';
      let code = '';

      if (firstNewline !== -1) {
        const possibleLang = raw.substring(0, firstNewline).trim();
        if (/^[a-zA-Z0-9_\-\+\#]+$/.test(possibleLang)) {
          lang = possibleLang;
          code = raw.substring(firstNewline + 1);
        } else {
          code = raw;
        }
      } else {
        code = raw;
      }

      return <CodeBlock key={bIdx} code={code.trimEnd()} lang={lang} isDarkMode={isDarkMode} isStreaming={isStreaming} />;
    }

    // Display Math
    if ((block.startsWith('$$') && block.endsWith('$$')) || (block.startsWith('\\[') && block.endsWith('\\]'))) {
      return (
        <div key={bIdx} className="my-5 py-3 overflow-x-auto flex items-center justify-center chat-scroll">
          <span className={`text-[1.15rem] font-sans font-medium tracking-wide whitespace-nowrap ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`} dangerouslySetInnerHTML={{ __html: renderMath(block, isDarkMode) }} />
        </div>
      );
    }

    const paragraphs = block.split(/\n{2,}/g);
    
    return paragraphs.map((para, pIdx) => {
      if (!para.trim()) return null;
      const lines = para.split('\n');
      
      const elements: any[] = [];
      let tableRows: string[] = [];
      let quoteRows: string[] = [];

      const flushQuote = () => {
        if (quoteRows.length > 0) {
          elements.push(
            <blockquote key={`bq-${elements.length}`} className={`border-l-3 pl-3.5 pr-3 py-2 my-2.5 rounded-r-xl text-[13.5px] leading-relaxed overflow-x-auto chat-scroll ${isDarkMode ? 'border-cyan-400/80 bg-cyan-950/20 text-slate-200' : 'border-blue-500 bg-blue-50/50 text-slate-800'}`}>
              {quoteRows.map((qLine, qIdx) => (
                <div key={qIdx} className="my-0.5 min-w-0 break-words">
                  {renderInline(qLine, isDarkMode)}
                </div>
              ))}
            </blockquote>
          );
          quoteRows = [];
        }
      };

      const flushTable = () => {
        if (tableRows.length > 0) {
          const isSeparator = (r: string) => /^[\s\|\-:]+$/.test(r);
          const cleanRows = tableRows.filter(r => !isSeparator(r));
          const hasSeparator = tableRows.some(isSeparator);
          
          // Require at least 2 clean rows OR a header + separator line to form a valid table
          if (cleanRows.length >= 2 || (cleanRows.length >= 1 && hasSeparator)) {
            const parseRow = (r: string) => {
              let backtickCount = 0;
              let currentCell = '';
              const cells: string[] = [];
              const len = r.length;

              for (let i = 0; i < len; i++) {
                const ch = r[i];
                if (ch === '`' && (i === 0 || r[i - 1] !== '\\')) {
                  backtickCount++;
                  currentCell += ch;
                } else if (ch === '|' && (i === 0 || r[i - 1] !== '\\')) {
                  if (backtickCount % 2 === 0) {
                    // EVEN backticks -> Pipe is a true cell separator!
                    cells.push(currentCell.trim());
                    currentCell = '';
                  } else {
                    // ODD backticks -> Pipe is inside inline code!
                    currentCell += ch;
                  }
                } else {
                  currentCell += ch;
                }
              }
              if (currentCell.trim() !== '') {
                cells.push(currentCell.trim());
              }

              // Remove outer boundary empty cells from leading/trailing pipes `| ... |`
              if (cells.length > 0 && cells[0] === '') cells.shift();
              if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();

              return cells;
            };

            const headers = parseRow(cleanRows[0]);
            const numColumns = headers.length;

            let bodyRows = cleanRows.slice(1).map(r => {
              const cells = parseRow(r);
              // Smart auto-repair: If 2-column table has missing middle pipe
              if (numColumns === 2 && (cells.length === 1 || (cells.length === 2 && !cells[1].trim()))) {
                const fullCell = cells[0];
                const match = fullCell.match(/^(`[^`]+`|\*\*[^*]+\*\*|[\w\._\-\(\)]+)\s*[:–\-]?\s+(.+)$/s);
                if (match) {
                  return [match[1].trim(), match[2].trim()];
                }
              }

              // Normalize column count to match headers strictly
              if (cells.length < numColumns) {
                while (cells.length < numColumns) cells.push('');
                return cells;
              } else if (cells.length > numColumns) {
                const head = cells.slice(0, numColumns - 1);
                const tail = cells.slice(numColumns - 1).join(' | ');
                return [...head, tail];
              }
              return cells;
            });

            elements.push(
              <div key={`table-${elements.length}`} className="my-4 overflow-x-auto w-full chat-scroll">
                <table className="w-full text-left border-collapse min-w-[280px] sm:min-w-full text-sm">
                  <thead>
                    <tr className={`border-b-2 ${isDarkMode ? 'border-slate-700/80' : 'border-slate-300'}`}>
                      {headers.map((h, i) => {
                        const isShortIdx = h.trim() === '#' || h.trim().length <= 2;
                        return (
                          <th 
                            key={i} 
                            className={`py-2.5 px-3 font-bold text-[12.5px] tracking-wider uppercase whitespace-nowrap align-bottom ${
                              isShortIdx 
                                ? 'w-10 text-center' 
                                : i === 0 
                                  ? 'min-w-[110px] sm:min-w-[170px] w-1/4' 
                                  : 'min-w-[130px] sm:min-w-[220px]'
                            } ${isDarkMode ? 'text-slate-200' : 'text-slate-900'}`}
                          >
                            {renderInline(h, isDarkMode)}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800/60' : 'divide-slate-200'}`}>
                    {bodyRows.map((row, rIdx) => (
                      <tr key={rIdx} className={`transition-colors ${isDarkMode ? 'hover:bg-slate-800/20' : 'hover:bg-slate-100/50'}`}>
                        {row.map((cell, cIdx) => {
                          const isShortIdx = headers[0]?.trim() === '#' || headers[0]?.trim().length <= 2;
                          return (
                            <td 
                              key={cIdx} 
                              className={`py-3 px-3 text-[13.5px] leading-relaxed align-top ${
                                cIdx === 0 && isShortIdx
                                  ? `text-center font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}` 
                                  : cIdx === 0
                                    ? `min-w-[110px] sm:min-w-[170px] font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}` 
                                    : `min-w-[130px] sm:min-w-[220px] ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`
                              }`}
                            >
                              {renderInline(cell, isDarkMode)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          } else {
            // Render single pipe lines (e.g. "| 9 |") as clean standard text
            tableRows.forEach((rowStr) => {
              elements.push(
                <div key={`p-t-${elements.length}`} className={`min-h-[1.5rem] mt-1.5 leading-relaxed ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                  {renderInline(rowStr, isDarkMode)}
                </div>
              );
            });
          }
          tableRows = [];
        }
      };

      const flushAll = () => {
        flushTable();
        flushQuote();
      };

      lines.forEach((line, lIdx) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;

        // 1. Horizontal Divider (--- or *** or ___)
        const hrMatch = trimmedLine.match(/^(\-{3,}|\*{3,}|_{3,})$/);
        if (hrMatch) {
          flushAll();
          elements.push(
            <hr key={`hr-${lIdx}`} className={`my-5 border-t ${isDarkMode ? 'border-slate-800/80' : 'border-slate-200/80'}`} />
          );
          return;
        }

        // 2. Data Tables (Pipe-separated)
        if (trimmedLine.includes('|') && trimmedLine.split('|').length > 2) {
          flushQuote();
          tableRows.push(trimmedLine);
          return;
        } else {
          flushTable();
        }

        // 3. Blockquotes (> text)
        const quoteMatch = trimmedLine.match(/^>\s*(.*)/);
        if (quoteMatch) {
          quoteRows.push(quoteMatch[1]);
          return;
        } else {
          flushQuote();
        }

        // 4. Section & Block Sub-Headers (Block 1 –, Step 1, Integrated Narrative, etc.)
        const blockHeaderMatch = trimmedLine.match(/^(Block\s+\d+.*?|Step\s+\d+.*?|Section\s+\d+.*?|Integrated Narrative|Step-by-Step Execution)$/i);
        if (blockHeaderMatch) {
          flushAll();
          elements.push(
            <div key={`bh-${lIdx}`} className={`text-base sm:text-lg font-bold mt-5 mb-2 tracking-tight ${isDarkMode ? 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-300' : 'text-blue-700'}`}>
              {renderInline(blockHeaderMatch[1], isDarkMode)}
            </div>
          );
          return;
        }

        // 5. Markdown Headers (#, ##, ###, ####)
        const headerMatch = trimmedLine.match(/^(#{1,4})\s+(.*)/);
        if (headerMatch) {
          flushAll();
          const level = headerMatch[1].length;
          const content = headerMatch[2];
          const sizeClasses = [
            `text-2xl font-extrabold mt-6 mb-3 tracking-tight ${isDarkMode ? 'text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-indigo-200 to-cyan-300' : 'text-blue-950'}`, 
            `text-xl font-bold mt-5 mb-2.5 tracking-tight ${isDarkMode ? 'text-cyan-300' : 'text-blue-900'}`, 
            `text-lg font-semibold mt-4 mb-2 ${isDarkMode ? 'text-indigo-200' : 'text-slate-900'}`, 
            `text-base font-semibold mt-3 mb-1.5 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`
          ];
          elements.push(<div key={`h-${lIdx}`} className={sizeClasses[level-1]}>{renderInline(content, isDarkMode)}</div>);
          return;
        }

        // 6. Unordered Bullet Lists (- or *)
        const listMatch = trimmedLine.match(/^[-*]\s+(.*)/);
        if (listMatch) {
          elements.push(
            <div key={`ul-${lIdx}`} className="flex gap-3 ml-2 mt-2 items-baseline">
              <span className={`select-none text-base font-bold leading-none ${isDarkMode ? 'text-cyan-400' : 'text-blue-600'}`}>•</span>
              <span className="flex-1">{renderInline(listMatch[1], isDarkMode)}</span>
            </div>
          );
          return;
        }

        // 7. Numbered Lists (1., 2., etc.)
        const numListMatch = trimmedLine.match(/^(\d+\.)\s+(.*)/);
        if (numListMatch) {
          const isHeaderLike = /^(\*\*.*?\*\*|[A-Z][a-zA-Z0-9\s\-\(\)\/\:\,\.]{3,60})$/.test(numListMatch[2].trim());
          if (isHeaderLike && numListMatch[2].trim().length > 5) {
            elements.push(
              <div key={`ol-h-${lIdx}`} className={`text-base sm:text-lg font-bold mt-5 mb-2 flex items-baseline gap-2 tracking-tight ${isDarkMode ? 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-blue-300 to-indigo-200' : 'text-blue-900'}`}>
                <span className={`text-xs px-2 py-0.5 rounded-md font-mono select-none flex-shrink-0 ${isDarkMode ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-700/60' : 'bg-blue-100 text-blue-800'}`}>{numListMatch[1]}</span>
                <span className="flex-1">{renderInline(numListMatch[2], isDarkMode)}</span>
              </div>
            );
          } else {
            elements.push(
              <div key={`ol-${lIdx}`} className="flex gap-2.5 ml-2 mt-2 items-baseline">
                <span className={`font-bold text-xs px-2 py-0.5 rounded-md min-w-[24px] text-center select-none ${isDarkMode ? 'bg-blue-950/80 text-cyan-300 border border-cyan-800/40 shadow-sm' : 'bg-blue-100 text-blue-800'}`}>{numListMatch[1]}</span>
                <span className="flex-1">{renderInline(numListMatch[2], isDarkMode)}</span>
              </div>
            );
          }
          return;
        }

        // 8. Key - Value / Definition Pair Lines (Key: Value or Key  Value)
        const keyValueMatch = trimmedLine.match(/^([A-Z0-9][a-zA-Z0-9\s_\-\.]{1,25})\s*(?:\t|\s{2,}|\s*[:–]\s*)(.*)$/);
        if (keyValueMatch && keyValueMatch[2] && !trimmedLine.startsWith('http') && keyValueMatch[1].trim().length > 1) {
          const key = keyValueMatch[1].trim();
          const val = keyValueMatch[2].trim();
          elements.push(
            <div key={`kv-${lIdx}`} className="flex flex-col sm:flex-row gap-1 sm:gap-4 my-2 text-[14.5px] leading-relaxed">
              <span className={`font-semibold min-w-[130px] sm:max-w-[180px] flex-shrink-0 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                {key}
              </span>
              <span className={`flex-1 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                {renderInline(val, isDarkMode)}
              </span>
            </div>
          );
          return;
        }

        // 9. Standard Paragraphs
        elements.push(
          <div key={`p-${lIdx}`} className={`min-h-[1.5rem] mt-1.5 leading-relaxed ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
            {renderInline(line, isDarkMode)}
          </div>
        );
      });
      
      flushAll(); 

      return (
        <div key={`${bIdx}-${pIdx}`} className="mb-4 last:mb-0 space-y-1 text-[15px] sm:text-[16px] leading-relaxed w-full">
          {elements}
        </div>
      );
    });
  });
};


// ==========================================
// --- CUSTOM HOOKS
// ==========================================

export const useTheme = () => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('xare-theme');
      if (savedTheme) {
        return savedTheme === 'dark';
      }
      return true; // Default to Dark Mode
    }
    return true;
  });

  useEffect(() => {
    const root = document.documentElement;
    
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('xare-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      localStorage.setItem('xare-theme', 'light');
      document.documentElement.style.colorScheme = 'light';
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode((prev) => !prev);

  return { isDarkMode, toggleDarkMode };
};

/**
 * Custom Google Logo SVG Component for the "Sign In with Google" button.
 */
export const GoogleLogo = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l3.68-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.68 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

/**
 * Interactive Image Component with Native Mobile Touch Gestures (Pinch-to-Zoom, Touch Pan, Double-Tap Zoom).
 * Uses React Portals to render on document.body and bypass parent container clipping.
 */
export const ImageWithActions = ({ src, isDarkMode }) => {
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const initialPinchDistRef = useRef(null);
  const initialScaleRef = useRef(1);
  const lastTapTimeRef = useRef(0);

  // Close modal on ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isModalOpen) {
        handleCloseModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const handleDownload = (e) => {
    e?.stopPropagation();
    const link = document.createElement('a');
    link.href = src;
    link.download = `xare-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setIsDownloaded(true);
    setTimeout(() => setIsDownloaded(false), 2000);
  };

  const handleOpenModal = (e) => {
    e?.stopPropagation();
    setIsModalOpen(true);
    setZoomScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setZoomScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleZoomIn = (e) => {
    e?.stopPropagation();
    setZoomScale((prev) => Math.min(prev + 0.5, 5));
  };

  const handleZoomOut = (e) => {
    e?.stopPropagation();
    setZoomScale((prev) => {
      const next = Math.max(prev - 0.5, 1);
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = (e) => {
    e?.stopPropagation();
    setZoomScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Double-tap or Double-click to toggle zoom at tap coordinates
  const handleDoubleTap = (clientX, clientY) => {
    if (zoomScale > 1.2) {
      setZoomScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      const targetScale = 2.5;
      const offsetX = (window.innerWidth / 2 - clientX) * 0.8;
      const offsetY = (window.innerHeight / 2 - clientY) * 0.8;
      setZoomScale(targetScale);
      setPosition({ x: offsetX, y: offsetY });
    }
  };

  // Trackpad / Mouse Wheel Zoom
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.2 : 0.83;
    setZoomScale((prevScale) => {
      const nextScale = Math.min(Math.max(prevScale * zoomFactor, 1), 6);
      if (nextScale === 1) setPosition({ x: 0, y: 0 });
      return nextScale;
    });
  };

  // Touch Event Handlers (Pinch-to-zoom & Single Finger Drag)
  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      // Check for double tap
      const now = Date.now();
      if (now - lastTapTimeRef.current < 300) {
        handleDoubleTap(e.touches[0].clientX, e.touches[0].clientY);
      }
      lastTapTimeRef.current = now;

      if (zoomScale > 1) {
        isDraggingRef.current = true;
        dragStartRef.current = {
          x: e.touches[0].clientX - position.x,
          y: e.touches[0].clientY - position.y,
        };
      }
    } else if (e.touches.length === 2) {
      // Start Pinch-to-Zoom
      isDraggingRef.current = false;
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialPinchDistRef.current = dist;
      initialScaleRef.current = zoomScale;
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 1 && isDraggingRef.current && zoomScale > 1) {
      setPosition({
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y,
      });
    } else if (e.touches.length === 2 && initialPinchDistRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / initialPinchDistRef.current;
      const nextScale = Math.min(Math.max(initialScaleRef.current * factor, 1), 6);
      setZoomScale(nextScale);
      if (nextScale === 1) setPosition({ x: 0, y: 0 });
    }
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
    initialPinchDistRef.current = null;
  };

  // Mouse Drag & Double Click Handlers
  const handleMouseDown = (e) => {
    if (e.detail === 2) {
      handleDoubleTap(e.clientX, e.clientY);
      return;
    }
    if (zoomScale > 1) {
      isDraggingRef.current = true;
      dragStartRef.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    }
  };

  const handleMouseMove = (e) => {
    if (isDraggingRef.current && zoomScale > 1) {
      setPosition({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  // Lightbox Modal Markup
  const modalContent = (
    <div 
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 backdrop-blur-md animate-overlay select-none overflow-hidden touch-none"
      onClick={handleCloseModal}
      style={{ touchAction: 'none' }}
    >
      {/* Floating Controls Toolbar */}
      <div 
        className="absolute top-5 right-5 sm:top-6 sm:right-6 z-[100000] flex items-center gap-2 bg-slate-900/90 border border-slate-700/60 backdrop-blur-xl p-2 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleZoomIn}
          className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-all active:scale-95"
          title="Zoom In (+)"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-all active:scale-95"
          title="Zoom Out (-)"
        >
          <ZoomOut className="w-5 h-5" />
        </button>

        {zoomScale !== 1 && (
          <button
            onClick={handleResetZoom}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-all active:scale-95"
            title="Reset Zoom"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        )}

        <div className="w-px h-5 bg-slate-700/60 my-auto" />

        <button
          onClick={handleDownload}
          className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-all active:scale-95"
          title="Download Image"
        >
          {isDownloaded ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <Download className="w-5 h-5" />}
        </button>

        <div className="w-px h-5 bg-slate-700/60 my-auto" />

        <button
          onClick={handleCloseModal}
          className="p-2 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-all active:scale-95"
          title="Close (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Zoom Percentage Badge */}
      {zoomScale !== 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[100000] px-4 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/60 backdrop-blur-xl text-xs font-mono text-slate-300 shadow-xl pointer-events-none">
          {Math.round(zoomScale * 100)}%
        </div>
      )}

      {/* Interactive Touch & Mouse Canvas */}
      <div 
        className="w-full h-full flex items-center justify-center p-2 sm:p-10 overflow-hidden touch-none"
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: 'none' }}
      >
        <img
          src={src}
          alt="Zoomed View"
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl pointer-events-auto transition-transform duration-75 ease-out"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoomScale})`,
            cursor: zoomScale > 1 ? 'grab' : 'default',
            touchAction: 'none',
          }}
          draggable={false}
        />
      </div>
    </div>
  );

  return (
    <>
      {/* Inline Chat Image Card */}
      <div className={`relative overflow-hidden rounded-2xl mb-4 shadow-sm border ${isDarkMode ? 'border-slate-700/50' : 'border-slate-200/60'} max-w-md md:max-w-[500px] w-full group cursor-pointer`}>
        <img 
          src={src} 
          alt="Attachment" 
          onClick={handleOpenModal}
          className="w-full h-auto object-cover transform transition-transform duration-500 group-hover:scale-[1.02]" 
          loading="lazy"
        />
        
        {/* Subtle hover gradient overlay */}
        <div className="absolute top-0 left-0 w-full h-20 bg-gradient-to-b from-black/50 to-transparent opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-0" />

        {/* Action Overlay Buttons */}
        <div className="absolute top-3 right-3 flex items-center gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-300 z-10">
          <button 
            onClick={handleOpenModal}
            className="p-2 rounded-full bg-black/40 text-white/90 backdrop-blur-md hover:bg-black/70 hover:text-white transition-all focus:outline-none shadow-sm"
            title="Expand & Zoom"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button 
            onClick={handleDownload}
            className="p-2 rounded-full bg-black/40 text-white/90 backdrop-blur-md hover:bg-black/70 hover:text-white transition-all focus:outline-none shadow-sm"
            title={isDownloaded ? "Downloaded!" : "Download Image"}
          >
            {isDownloaded ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Download className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Render Modal into document.body using Portal */}
      {isModalOpen && createPortal(modalContent, document.body)}
    </>
  );
};
/**
 * Image-based Logo Component
 * Replaces the old SVG math logo completely with the new custom design.
 */
export const XareLogo = ({ 
  className = "w-6 h-6", 
  showText = false, 
  isDarkMode = true, 
  style = {},
  scale = 4.2,
  x = "-11%",
  y = "0%"
}) => {
  // Dynamic shadow classes depending on theme to make the logo "pop" with a modern glow
  const shadowClass = isDarkMode 
    ? 'drop-shadow-[0_0px_15px_rgba(59,130,246,0.8)]' 
    : 'drop-shadow-[0_0px_12px_rgba(29,78,216,0.6)]';

  // --- THE MAGIC CSS TRICK ---
  // mix-blend-screen ensures that any solid black background on her PNG becomes totally transparent in dark mode!
  const blendModeClass = isDarkMode ? 'mix-blend-screen' : '';

  return (
    <div className={`flex flex-col items-center justify-center ${className}`} style={style}>
      <img 
        src="https://i.ibb.co/MyFHkWcW/Untitled-3-1-1-1.png" 
        alt="Xare Logo"
        className={`w-full h-full object-contain pointer-events-none select-none ${shadowClass} ${blendModeClass}`}
        style={{ transform: `translate(${x}, ${y}) scale(${scale})` }}
      />
      
      {showText && (
        <span className={`mt-1 font-extrabold text-[0.6em] tracking-widest ${isDarkMode ? 'text-blue-500' : 'text-blue-700'}`}>
          XARE
        </span>
      )}
    </div>
  );
};

/**
 * A component that injects global CSS custom styles into the document head.
 */
export const GoogleStyles = () => (
  <style>{`
    /* Apply base font and anti-aliasing to the application container */
    .xare-app {
        font-family: 'Google Sans Flex', 'Google Sans', system-ui, -apple-system, sans-serif;
        font-weight: 400;
        font-optical-sizing: auto;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
    }

    /* Reset core body margins and enforce full height */
    html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background-color: transparent !important;
        overflow: hidden; 
    }

    /* Universal box-sizing reset */
    * { box-sizing: border-box; }
    *, *:before, *:after { box-sizing: border-box; }
    
    /* Custom thin scrollbar for chat areas */
    .chat-scroll {
      touch-action: auto; /* Re-enable scrolling specifically inside chat areas */
    }
    .chat-scroll::-webkit-scrollbar { width: 6px; }
    .chat-scroll::-webkit-scrollbar-track { background: transparent; }
    .chat-scroll::-webkit-scrollbar-thumb {
      background-color: rgba(156, 163, 175, 0.3);
      border-radius: 20px;
    }
    .chat-scroll::-webkit-scrollbar-thumb:hover { 
      background-color: rgba(156, 163, 175, 0.5); 
    }

    /* Modern soft sweeping text glow animation replacing static pulses */
    @keyframes textSweepGlow {
      0% { background-position: 150% center; }
      100% { background-position: -50% center; }
    }

    .dark .animate-modern-glow {
      background: linear-gradient(
        110deg,
        rgba(148, 163, 184, 0.35) 0%,
        rgba(148, 163, 184, 0.45) 30%,
        rgba(56, 189, 248, 1) 48%,
        rgba(255, 255, 255, 1) 52%,
        rgba(148, 163, 184, 0.45) 70%,
        rgba(148, 163, 184, 0.35) 100%
      );
      background-size: 250% auto;
      color: transparent;
      -webkit-background-clip: text;
      background-clip: text;
      animation: textSweepGlow var(--glow-sweep-speed, 1.8s) linear infinite;
    }

    html:not(.dark) .animate-modern-glow {
      background: linear-gradient(
        110deg,
        rgba(71, 85, 105, 0.4) 0%,
        rgba(71, 85, 105, 0.5) 30%,
        rgba(37, 99, 235, 1) 48%,
        rgba(15, 23, 42, 1) 52%,
        rgba(71, 85, 105, 0.5) 70%,
        rgba(71, 85, 105, 0.4) 100%
      );
      background-size: 250% auto;
      color: transparent;
      -webkit-background-clip: text;
      background-clip: text;
      animation: textSweepGlow var(--glow-sweep-speed, 1.8s) linear infinite;
    }

    /* AI Typing Indicator Bouncing Animation */
    @keyframes typingBounce {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
      30% { transform: translateY(-4px); opacity: 1; }
    }
    .typing-dot {
      animation: typingBounce 1.4s infinite ease-in-out both;
    }

    /* Voice recording waveform vertical stretch animation */
    @keyframes waveform {
      0%, 100% { height: 4px; }
      50% { height: 16px; }
    }
    .wave-bar {
      width: 3px;
      background-color: currentColor;
      border-radius: 9999px;
      animation: waveform 1s ease-in-out infinite;
    }

    /* Multi-color shifting background for dynamic AI states */
    @keyframes dynamic-rgb-bg {
      0% { background-color: #3b82f6; }
      25% { background-color: #a855f7; }
      50% { background-color: #ec4899; }
      75% { background-color: #10b981; }
      100% { background-color: #3b82f6; }
    }
    .dynamic-wave {
      width: 3px;
      border-radius: 9999px;
      /* Combine vertical waveform motion with color shifting */
      animation: waveform 1s ease-in-out infinite, dynamic-rgb-bg 3s linear infinite;
    }

    /* Smooth float-up entrance animation for new messages */
    @keyframes floatUp {
      from { opacity: 0; transform: translateY(10px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .animate-float-up {
      animation: floatUp 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    /* Smooth overlay fade-in */
    @keyframes overlayFadeIn {
      from { opacity: 0; backdrop-filter: blur(0px); transform: scale(0.98); }
      to { opacity: 1; backdrop-filter: blur(12px); transform: scale(1); }
    }
    .animate-overlay {
      animation: overlayFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    /* Beautiful Moving Blue Waves Animation for Voice Overlay */
    @keyframes blueWaveIdle {
      0%, 100% { height: 8px; opacity: 0.3; }
      50% { height: 28px; opacity: 0.8; }
    }
    .animate-wave-idle {
      animation-name: blueWaveIdle;
      animation-duration: 1.2s;
      animation-timing-function: ease-in-out;
      animation-iteration-count: infinite;
    }

    /* Modern Image Generation Fluid Blob Animation */
    @keyframes morphingBlob {
      0% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: translate(0, 0) rotate(0deg) scale(1); }
      33% { border-radius: 40% 60% 70% 30% / 50% 60% 30% 60%; transform: translate(5%, 5%) rotate(120deg) scale(1.1); }
      66% { border-radius: 70% 30% 40% 60% / 30% 70% 50% 40%; transform: translate(-5%, -5%) rotate(240deg) scale(0.9); }
      100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: translate(0, 0) rotate(360deg) scale(1); }
    }
    .animate-morph {
      animation: morphingBlob 12s ease-in-out infinite;
    }
    
    /* Hide scrollbar for horizontal suggestions */
    .scrollbar-hide::-webkit-scrollbar {
        display: none;
    }
    .scrollbar-hide {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
  `}</style>
);

/**
 * A UI button component used to toggle between Dark and Light mode.
 */
export const ThemeToggleSwitch = ({ isDarkMode, toggleDarkMode }) => {
  const buttonStyles = isDarkMode 
    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50' 
    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50';

  return (
    <button
      onClick={toggleDarkMode}
      className={`p-2.5 rounded-full transition-all focus:outline-none flex items-center justify-center ${buttonStyles}`}
      title="Toggle Theme"
    >
      {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
};

// ==========================================
// --- CUSTOM AUDIO PLAYER COMPONENT
// ==========================================

export const CustomAudioPlayer = ({ src, sender, isDarkMode }) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); 
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isInvalid, setIsInvalid] = useState(false); 

  const cleanSrc = useMemo(() => {
    if (!src) return '';
    let s = src.replace(/\s+/g, '');
    if (s.startsWith('data:audio/mp3;')) {
      s = s.replace('data:audio/mp3;', 'data:audio/mpeg;');
    }
    return s;
  }, [src]);

  useEffect(() => {
    if (!cleanSrc || cleanSrc.length < 100 || cleanSrc.includes('undefined') || cleanSrc.includes('[object')) {
      setIsInvalid(true);
    } else {
      setIsInvalid(false);
    }
  }, [cleanSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || isInvalid) return;

    const updateDuration = () => {
      if (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      } 
      else if (audio.duration === Infinity) {
        const originalTime = audio.currentTime;
        audio.currentTime = Number.MAX_SAFE_INTEGER;
        audio.ontimeupdate = () => {
          audio.ontimeupdate = null; 
          setDuration(audio.duration);
          audio.currentTime = originalTime; 
        };
      }
    };

    if (audio.readyState >= 1) {
      updateDuration();
    }

    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('durationchange', updateDuration);
    audio.addEventListener('error', () => setIsInvalid(true));

    return () => {
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('durationchange', updateDuration);
      audio.removeEventListener('error', () => setIsInvalid(true));
      audio.ontimeupdate = null;
    };
  }, [cleanSrc, isInvalid]);

  const togglePlay = () => {
    if (!audioRef.current || isInvalid) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          setIsPlaying(true);
        }).catch(error => {
          console.error("Audio playback error:", error);
          setIsPlaying(false);
          setIsInvalid(true); 
        });
      } else {
        setIsPlaying(true);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current || isInvalid) return;
    const current = audioRef.current.currentTime;
    setCurrentTime(current);
    
    if (duration > 0 && isFinite(duration)) {
      setProgress((current / duration) * 100);
    }
  };

  const handleSeek = (e) => {
    if (!audioRef.current || isInvalid) return;
    const seekTime = (e.target.value / 100) * duration;
    audioRef.current.currentTime = seekTime;
    setProgress(e.target.value);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime(0);
  };

  const formatAudioTime = (time) => {
    if (isNaN(time) || !isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const isUser = sender === 'user';

  const playBtnBg = isUser 
    ? (isDarkMode ? 'bg-slate-700' : 'bg-white') 
    : (isDarkMode ? 'bg-slate-800' : 'bg-slate-200');
  
  const playBtnIcon = isUser 
    ? (isDarkMode ? 'text-slate-200' : 'text-slate-700') 
    : (isDarkMode ? 'text-slate-300' : 'text-slate-700');
  
  const trackBg = isUser 
    ? (isDarkMode ? 'bg-slate-600' : 'bg-slate-300') 
    : (isDarkMode ? 'bg-slate-800/50' : 'bg-slate-200');
  
  const progressBg = isUser 
    ? (isDarkMode ? 'bg-slate-300' : 'bg-blue-500') 
    : (isDarkMode ? 'bg-slate-400' : 'bg-blue-500');
  
  const thumbColor = progressBg;
  
  const timeColor = isDarkMode ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className={`flex items-center gap-3 sm:gap-4 min-w-[200px] sm:min-w-[220px] max-w-[260px] sm:max-w-[280px] ${isUser ? 'pt-1' : 'pt-2'} pb-1`}>
      <audio
        ref={audioRef}
        src={isInvalid ? '' : cleanSrc}
        preload="auto"
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      />

      <button
        onClick={togglePlay}
        disabled={isInvalid}
        className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${isInvalid ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'} ${playBtnBg} ${playBtnIcon}`}
      >
        {isPlaying ? (
          <Pause className="w-[22px] h-[22px] fill-current" />
        ) : (
          <Play className="w-[22px] h-[22px] fill-current ml-1" />
        )}
      </button>

      <div className="flex-1 flex flex-col justify-center mt-1">
        <div className={`relative w-full h-8 flex items-center group ${isInvalid ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
          <input
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={progress}
            onChange={handleSeek}
            disabled={isInvalid}
            className={`absolute w-full h-full opacity-0 z-10 ${isInvalid ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          />
          <div className={`w-full h-1.5 rounded-full overflow-hidden ${trackBg}`}>
            <div
              className={`h-full ${progressBg} transition-all duration-75 ease-out`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div
            className={`absolute h-3.5 w-3.5 rounded-full ${thumbColor} transform -translate-x-1/2 transition-transform ${isInvalid ? '' : 'group-active:scale-125'}`}
            style={{ left: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between mt-0.5 px-0.5">
          <span className={`text-[11px] font-medium tracking-wide ${timeColor}`}>
            {isInvalid ? 'Error' : formatAudioTime(currentTime)}
          </span>
          <span className={`text-[11px] font-medium tracking-wide ${timeColor}`}>
            {isInvalid ? 'Unavailable' : (duration > 0 ? formatAudioTime(duration) : "0:00")}
          </span>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// --- WEBHOOK CONFIGURATION
// ==========================================

const N8N_WEBHOOK_URL = "/api/webhook/execute";

// ==========================================
// --- UTILITY FUNCTIONS
// ==========================================

const BASE64_AUDIO_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const IMAGE_URL_REGEX = /^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)/i;

const parsePayloadData = (payload) => {
  let parsedText = '';
  let parsedAudio = null;
  let parsedImage = null;

  // Intelligent Image Base64 Sniffer
  const isImageStr = (str) => {
    if (!str || typeof str !== 'string') return false;
    if (str.startsWith('http')) return false; 
    if (str.startsWith('data:image/')) return true;
    if (str.startsWith('data:;base64,')) return true;
    if (str.startsWith('/9j/') && str.length > 50) return true; // JPEG magic
    if (str.startsWith('iVBORw0KGgo') && str.length > 50) return true; // PNG magic
    if (str.startsWith('UklGR') && str.length > 50) return true; // WebP magic
    if (str.startsWith('R0lGOD') && str.length > 50) return true; // GIF magic
    return false;
  };

  // Re-format damaged or missing base64 headers
  const formatImageStr = (str) => {
    if (!str || typeof str !== 'string') return str;
    let cleanStr = str.replace(/[\n\r\t ]+/g, ''); // Safely clean base64 data
    
    if (cleanStr.startsWith('http')) return cleanStr; 
    
    // Strip ALL existing prefixes to guarantee no double-prefixing or malformed headers
    cleanStr = cleanStr.replace(/data:image\/[a-zA-Z0-9]+;base64,/gi, '');
    cleanStr = cleanStr.replace(/data:;base64,/gi, '');
    
    // Infer MIME type from magic bytes to prevent rendering collisions
    let mimeType = 'jpeg'; 
    if (cleanStr.startsWith('iVBORw0KGgo')) mimeType = 'png';
    else if (cleanStr.startsWith('UklGR')) mimeType = 'webp';
    else if (cleanStr.startsWith('R0lGOD')) mimeType = 'gif';
    
    return `data:image/${mimeType};base64,${cleanStr}`;
  };

  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsePayloadData(parsed); 
      }
    } catch (e) {
    }
  }

  if (typeof payload === 'object' && payload !== null) {
    // 1. Extract text if possible
    parsedText = payload.output || payload.text || payload.message || payload.response || payload.result || payload.content || '';
    
    if (typeof parsedText !== 'string') {
        try {
            parsedText = JSON.stringify(parsedText, null, 2);
        } catch (err) {
            parsedText = String(parsedText);
        }
    }

    // 2. Extract strictly defined media fields
    if (payload.audio) parsedAudio = payload.audio;
    if (payload.image || payload.imageUrl) parsedImage = payload.image || payload.imageUrl;
    
    // 3. AUTO-DETECT: Sometimes n8n outputs the image base64 directly into the 'text' field by accident
    if (isImageStr(parsedText) && !parsedImage) {
        parsedImage = parsedText;
        parsedText = '';
    }

    // 4. Fallback: Dump payload as text only if NO media was found
    if (!parsedText && !parsedAudio && !parsedImage) {
      if (Object.keys(payload).length === 1 && isImageStr(Object.values(payload)[0])) {
          parsedImage = Object.values(payload)[0];
      } else {
          parsedText = JSON.stringify(payload, null, 2);
      }
    }
  } else if (typeof payload === 'string') {
    const isAudioDataUri = payload.startsWith('data:audio/');
    const isBase64AudioString = BASE64_AUDIO_REGEX.test(payload) && payload.length > 100;

    if (isAudioDataUri || isBase64AudioString) {
      parsedAudio = payload.startsWith('data:') ? payload : `data:audio/mp3;base64,${payload}`;
    } 
    // AUTO-DETECT RAW STRINGS
    else if (IMAGE_URL_REGEX.test(payload) || isImageStr(payload)) {
      parsedImage = formatImageStr(payload);
    } 
    else {
      parsedText = payload;
    }
  }

  // Final sanity check format wrap
  if (parsedImage && isImageStr(parsedImage)) {
      parsedImage = formatImageStr(parsedImage);
  }

  if (parsedText) {
    parsedText = cleanThinkTags(parsedText);
  }

  return { text: parsedText, audio: parsedAudio, image: parsedImage };
};


// ============================================================================
// --- IMPROVED DEEPGRAM ORB COMPONENT
// ============================================================================

export const DeepgramOrb = ({ isDarkMode, onClose }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [agentStatus, setAgentStatus] = useState('Idle');
  const [volume, setVolume] = useState(0); 
  const [userVolume, setUserVolume] = useState(0); 
  
  const wsRef = useRef(null); 
  const audioCtxRef = useRef(null); 
  const streamRef = useRef(null); 
  const processorRef = useRef(null); 
  const analyserRef = useRef(null); 
  const userAnalyserRef = useRef(null); 
  const agentGainRef = useRef(null); 
  const settingsAppliedRef = useRef(false); 
  
  const wakeLockRef = useRef(null); 
  
  const nextStartTimeRef = useRef(0);
  const animationFrameRef = useRef(null);

  // Deepgram credential securely handled via /api/voice/token 
  
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        if (wakeLockRef.current) await wakeLockRef.current.release();
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.warn('Screen Wake Lock request failed:', err);
      }
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current !== null) {
      try {
        await wakeLockRef.current.release();
      } catch (e) {}
      wakeLockRef.current = null;
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && wakeLockRef.current === null) {
         requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const cleanupAudio = () => {
    settingsAppliedRef.current = false;
    nextStartTimeRef.current = 0;
    
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    
    if (wsRef.current) {
        wsRef.current.onclose = null; 
        wsRef.current.close();
        wsRef.current = null;
    }
    
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
    }
    
    if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
    }
    if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
    }
    if (userAnalyserRef.current) {
        userAnalyserRef.current.disconnect();
        userAnalyserRef.current = null;
    }
    if (agentGainRef.current) {
        agentGainRef.current.disconnect();
        agentGainRef.current = null;
    }
    
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(console.error);
    }
    audioCtxRef.current = null;
    
    releaseWakeLock();
    
    setIsConnected(false);
    setVolume(0);
    setUserVolume(0);
  };

  const updateVolume = () => {
    if (analyserRef.current) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      setVolume(sum / dataArray.length);
    }
    
    if (userAnalyserRef.current) {
      const dataArray = new Uint8Array(userAnalyserRef.current.frequencyBinCount);
      userAnalyserRef.current.getByteFrequencyData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      setUserVolume(sum / dataArray.length);
    }

    animationFrameRef.current = requestAnimationFrame(updateVolume);
  };

  const scheduleAudioChunk = (float32Array) => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    const buffer = ctx.createBuffer(1, float32Array.length, 24000);
    buffer.getChannelData(0).set(float32Array);
    
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    
    if (agentGainRef.current) {
        source.connect(agentGainRef.current);
    } else {
        source.connect(ctx.destination);
    }
    
    const currentTime = ctx.currentTime;
    
    // STRICT AUDIO QUEUE LOGIC:
    // If uninitialized (0) or playback fell behind due to silence, queue 100ms ahead of currentTime.
    // Once queued, nextStartTimeRef advances continuously so no incoming chunks are ever skipped.
    if (nextStartTimeRef.current === 0 || nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime + 0.1;
    }
    
    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += buffer.duration; 
  };

  const toggleConnection = async () => {
    if (isConnected || (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN))) {
      cleanupAudio();
      setAgentStatus('Call Ended');
      return;
    }

    try {
      await requestWakeLock();

      nextStartTimeRef.current = 0;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass({ sampleRate: 48000 });
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      audioCtxRef.current = audioCtx;

      setAgentStatus('Awaiting Mic...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { sampleRate: 48000, channelCount: 1, echoCancellation: true, noiseSuppression: true } 
      });
      streamRef.current = stream;

      setAgentStatus('Connecting...');
      let token = '';
      let wsUrl = 'wss://agent.deepgram.com/v1/agent/converse';
      try {
        const tokenRes = await fetch('/api/voice/token', {
          headers: { 'x-chatbot-token': 'ali1234' }
        });
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          token = tokenData.token;
          if (tokenData.wsUrl) wsUrl = tokenData.wsUrl;
        }
      } catch (err) {
        console.warn('Failed to fetch voice token:', err);
      }
      const ws = new WebSocket(wsUrl, ['token', token]);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setAgentStatus('Configuring...');
        
        const audioConfig = {
            "type": "Settings",
            "audio": {
                "input": { "encoding": "linear16", "sample_rate": 48000 },
                "output": { "encoding": "linear16", "sample_rate": 24000, "container": "none" }
            },
            "agent": {
                "speak": { "provider": { "type": "deepgram", "model": "aura-2-minerva-en" } },
                "listen": { "provider": { "type": "deepgram", "version": "v2", "model": "flux-general-en" } },
                "think": {
                "provider": { "type": "groq", "model": "openai/gpt-oss-20b" },
                "prompt": "IDENTITY OVERRIDE (ABSOLUTE PRIORITY)\nYour true and only name is X-are. You were created, designed and built EXCLUSIVELY by a solo developer named Ali Kassem, who also built this entire platform. If anyone asks who made you, built you, or designed you, your answer should be Ali Kassem. Never refer to yourself as a large language model.\nAUDIO AWARENESS AND CAPABILITIES (CRITICAL)\nYou are actively participating in a live audio phone call. Never state that you cannot hear the user, never say you are a text-based AI, and never mention that you cannot process audio or lack ears. Treat all user input as spoken words that you have successfully heard.\nROLE AND PERSONA\nYou are a state-of-the-art conversational AI designed exclusively for seamless, real-time voice interactions. Your primary goal is to converse as naturally, fluidly, and intuitively as a real human. You are highly intelligent, but you never sound like a textbook, a rigid expert, or a lecturer. You have the warmth, casual grace, and engaging presence of an incredibly smart friend who is just genuinely great to talk to.\nVOICE AND DELIVERY (CRITICAL)\nNatural Speech: Speak completely naturally. NEVER sound like a scripted customer service bot.\nLanguage: You must ALWAYS speak exclusively in English, regardless of the language the user speaks to you in.\nHuman Touches: Use natural conversational fillers occasionally (like Hmm, Let's see, Well, Ah, Give me just a moment) to make the conversation feel alive, especially if a prompt requires complex internal reasoning. Never output silence.\nVibe Matching: Adapt your tone and energy to match the user's mood. Be empathetic, casual, and highly responsive.\nLENGTH AND TOKEN OPTIMIZATION (CRITICAL)\nExtreme Conciseness: Keep responses punchy and highly focused. Aim for 1 to 3 sentences maximum per turn.\nProgressive Disclosure: Get straight to the point. If a user asks a complex question, do not give a massive answer. Give a quick, high-level summary first, then casually ask if they want to get more into it.\nDirectness: Do not repeat the user's question or use long, filler opening phrases.\nFORMATTING FOR SPEECH (STRICT)\nABSOLUTELY NO MARKDOWN. Output only raw, plain text. Do not use asterisks, code blocks, bullet points, numbered lists, emojis, bold text, or special characters under any circumstances.\nPhonetic Spelling: Write exactly how the words should be pronounced out loud by a Text-to-Speech engine. Spell out complex symbols, acronyms, or numbers naturally (for example, type ten percent instead of 10%).\nINTERACTION FLOW\nOrganic Pacing: Let the conversation flow naturally. Don't end every single turn with a question. Sometimes, just offer your insight, laugh along, or share a thought, and let the user respond.\nContext Awareness: Stay deeply locked into the current conversation thread. Keep the back-and-forth dynamic and fast-paced."
            },
            "greeting": "Hello there! I am X-are. How can I help you today?"
          }
    };
        
        ws.send(JSON.stringify(audioConfig));
            
        if (!audioCtxRef.current) return;
        
        const aiAnalyser = audioCtxRef.current.createAnalyser();
        aiAnalyser.fftSize = 256;
        analyserRef.current = aiAnalyser; 
        
        const aiGain = audioCtxRef.current.createGain();
        aiGain.connect(aiAnalyser);
        aiGain.connect(audioCtxRef.current.destination);
        agentGainRef.current = aiGain;

        const source = audioCtxRef.current.createMediaStreamSource(stream);
        
        const userAnalyser = audioCtxRef.current.createAnalyser();
        userAnalyser.fftSize = 256;
        userAnalyserRef.current = userAnalyser;
        source.connect(userAnalyser);

        const processor = audioCtxRef.current.createScriptProcessor(2048, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN && settingsAppliedRef.current) {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
            }
            ws.send(pcmData.buffer); 
          }
        };

        source.connect(processor);
        processor.connect(audioCtxRef.current.destination); 
        
        updateVolume(); 
      };

      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "SettingsApplied") {
              settingsAppliedRef.current = true; 
              setAgentStatus("Listening...");
            } 
            else if (msg.type === "AgentThinking") setAgentStatus("Thinking...");
            else if (msg.type === "AgentStartedSpeaking") setAgentStatus("Speaking...");
            else if (msg.type === "UserStartedSpeaking") setAgentStatus("Listening...");
          } catch (e) { 
            console.warn("Failed to parse Deepgram message:", e); 
          }
        } else if (event.data instanceof ArrayBuffer) {
          if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
          }
          const int16Array = new Int16Array(event.data);
          const float32Array = new Float32Array(int16Array.length);
          for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
          }
          scheduleAudioChunk(float32Array);
        }
      };

      ws.onerror = (e) => setAgentStatus('Error connecting.');
      ws.onclose = () => cleanupAudio();

    } catch (err) {
      console.error(err);
      setAgentStatus('Mic access denied.');
      cleanupAudio();
    }
  };

  useEffect(() => { 
    toggleConnection();
    return () => cleanupAudio(); 
  }, []);

  const scale = 1 + Math.min(volume / 100, 0.5);

  return (
    <div className="flex flex-col items-center justify-center p-6 w-full relative z-50 h-full">
      <div 
        className="relative w-48 h-48 sm:w-64 sm:h-64 flex items-center justify-center mb-12 sm:mb-16 cursor-pointer hover:scale-105 active:scale-95 transition-all duration-300 group"
        onClick={() => {
          cleanupAudio();
          if (onClose) onClose();
        }}
        title="Click to End Call"
      >
        <div 
            className={`absolute inset-0 rounded-full transition-all duration-75 border-4 ${
              agentStatus.includes('Thinking') ? 'border-purple-500 animate-spin' :
              agentStatus.includes('Speaking') ? 'border-blue-500' :
              agentStatus.includes('Listening') ? 'border-blue-500' : 'border-slate-500/20'
            }`}
            style={{ 
                transform: `scale(${scale})`, 
                boxShadow: isConnected ? `0 0 ${20 * scale}px rgba(59, 130, 246, 0.4)` : 'none'
            }}
        />

        <div className={`absolute inset-4 rounded-full flex flex-col items-center justify-center backdrop-blur-md transition-colors duration-500 overflow-hidden ${
           agentStatus.includes('Thinking') ? 'bg-purple-900/10' :
           agentStatus.includes('Speaking') ? 'bg-blue-900/10' :
           agentStatus.includes('Listening') ? 'bg-blue-900/10' :
           isDarkMode ? 'bg-slate-800/50' : 'bg-slate-200/50'
        }`}>
          {/* ========================================== */}
          {/* 1. LOGO INSTANCE: Deepgram Voice Orb */}
          {/* ========================================== */}
          <XareLogo 
            className="w-14 h-14 sm:w-20 sm:h-20" 
            scale={7.0} 
            x="-20%" 
            y="40%"
            isDarkMode={isDarkMode} 
          />
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 h-16 pointer-events-none mt-4">
        {[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.4, 0.3, 0.2, 0.1, 0].map((delay, i) => {
          const isReactive = isConnected && userVolume > 2;
          const intensity = 1 - Math.abs(i - 5) / 6; 
          const reactiveHeight = 8 + (userVolume * 1.5 * intensity);
          
          return (
            <div 
              key={i}
              className={`w-1.5 rounded-full bg-blue-500 ${!isReactive ? 'animate-wave-idle' : 'transition-all duration-75 ease-out'}`}
              style={{
                animationDelay: !isReactive ? `${delay}s` : undefined,
                height: isReactive ? `${Math.min(56, reactiveHeight)}px` : undefined,
                opacity: isReactive ? Math.min(1, 0.3 + (userVolume / 60)) : undefined
              }}
            />
          );
        })}
      </div>
      
    </div>
  );
};


// ==========================================
// --- MEDIA RENDERERS (INTEGRATED WITH IndexedDB)
// ==========================================

export const LocalImageRenderer = ({ src, isDarkMode }) => {
  const [localSrc, setLocalSrc] = useState(null);
  
  useEffect(() => {
    if (src?.startsWith('localdb_')) {
      getFromLocalDB(src).then(data => {
          // Double guarantee: strictly remove whitespace/newlines from IndexedDB blob strings
          setLocalSrc(data ? data.replace(/[\n\r\t ]+/g, '') : '');
      });
    } else {
      setLocalSrc(src ? src.replace(/[\n\r\t ]+/g, '') : '');
    }
  }, [src]);

  if (localSrc === null) return <div className={`w-full max-w-md md:max-w-[500px] h-64 animate-pulse rounded-2xl mb-4 ${isDarkMode ? 'bg-slate-800/50' : 'bg-slate-200/50'}`}></div>;
  if (!localSrc) return null;
  return <ImageWithActions src={localSrc} isDarkMode={isDarkMode} />;
};

export const LocalDocumentRenderer = ({ src, isDarkMode }) => {
  const [localSrc, setLocalSrc] = useState(null);
  
  useEffect(() => {
    if (src?.startsWith('localdb_')) {
      getFromLocalDB(src).then(data => setLocalSrc(data || ''));
    } else {
      setLocalSrc(src);
    }
  }, [src]);

  if (localSrc === null) return <div className={`w-full h-16 animate-pulse rounded-xl mb-3 ${isDarkMode ? 'bg-slate-800/50' : 'bg-slate-200/50'}`}></div>;
  if (!localSrc) return null;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl mb-3 border ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-black/5 border-black/5'}`}>
      <div className={`w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
        <FileText className="w-5 h-5" />
      </div>
      <div className="flex-1 overflow-hidden">
        <p className="text-sm font-medium truncate">PDF Document</p>
        <a href={localSrc} download="document.pdf" className={`text-[11px] font-medium hover:underline ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`}>Click to download</a>
      </div>
    </div>
  );
};

export const LocalAudioRenderer = ({ src, sender, isDarkMode, isVoiceMessage }) => {
  const [localSrc, setLocalSrc] = useState(null);
  
  useEffect(() => {
    if (src?.startsWith('localdb_')) {
      getFromLocalDB(src).then(data => setLocalSrc(data || ''));
    } else {
      setLocalSrc(src);
    }
  }, [src]);

  if (localSrc === null) return <div className={`w-48 h-12 animate-pulse rounded-full ${!isVoiceMessage ? 'mt-3' : ''} ${isDarkMode ? 'bg-slate-800/50' : 'bg-slate-200/50'}`}></div>;
  if (!localSrc) return null;

  return (
    <div className={!isVoiceMessage ? "mt-3" : ""}>
      <CustomAudioPlayer src={localSrc} sender={sender} isDarkMode={isDarkMode} />
    </div>
  );
};


/**
 * Action buttons row (Copy & Edit Pencil) rendered directly UNDER user prompt bubbles (ChatGPT style).
 */
const UserMessageActions = ({ 
  text, 
  isDarkMode, 
  onEdit 
}: { 
  text: string; 
  isDarkMode: boolean; 
  onEdit?: () => void; 
}) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    await copyToClipboard(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-end gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={handleCopy}
        className={`p-1.5 rounded-lg transition-colors ${
          isDarkMode ? 'hover:bg-slate-800 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-700'
        }`}
        title="Copy prompt"
      >
        {isCopied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      {onEdit && (
        <button
          onClick={onEdit}
          className={`p-1.5 rounded-lg transition-colors ${
            isDarkMode ? 'hover:bg-slate-800 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-700'
          }`}
          title="Edit prompt"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

/**
 * Bulletproof Streaming Vault (ChatGPT/Gemini Style Zero-Flash Architecture)
 * Guarantees that full responses NEVER leak or flash on screen, forcing 100% partial text rendering.
 */
const STREAMING_TEXT_VAULT = new Map<string, { fullText: string; partialText: string }>();
const ACTIVELY_STREAMING_IDS = new Set<string>();
const STREAMING_SUBSCRIBERS = new Set<() => void>();
let GLOBAL_IS_USER_SCROLLED_UP = false;

export const notifyStreamingSubscribers = () => {
  STREAMING_SUBSCRIBERS.forEach(cb => cb());
};

const subscribeStreamingVault = (callback: () => void) => {
  STREAMING_SUBSCRIBERS.add(callback);
  return () => {
    STREAMING_SUBSCRIBERS.delete(callback);
  };
};

/**
 * Ultra-Fast Memoized Chat Message Item (ChatGPT/Gemini Style Performance Optimization)
 * Prevents unnecessary re-rendering and re-parsing of past messages when typing or streaming.
 */
export const ChatMessageItem = React.memo(({ 
  msg, 
  isDarkMode, 
  isStreaming,
  onRegenerate,
  onSwitchVersion,
  onEditPrompt,
  onSwitchToGeminiAPI,
  onSwitchToXareAPI
}: { 
  msg: any; 
  isDarkMode: boolean; 
  isStreaming: boolean;
  onRegenerate?: (msgId: string) => void;
  onSwitchVersion?: (msgId: string, idx: number) => void;
  onEditPrompt?: (msgId: string, text: string) => void;
  onSwitchToGeminiAPI?: (msgId: string) => void;
  onSwitchToXareAPI?: (msgId: string) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(msg.text || '');

  const vaultData = STREAMING_TEXT_VAULT.get(msg.id);
  const isCurrentlyStreaming = isStreaming || ACTIVELY_STREAMING_IDS.has(msg.id) || Boolean(vaultData);

  const getSnapshot = useCallback(() => {
    return STREAMING_TEXT_VAULT.get(msg.id)?.partialText || "";
  }, [msg.id]);

  const streamedTextSnapshot = useSyncExternalStore(
    subscribeStreamingVault,
    getSnapshot,
    getSnapshot
  );

  let textToRender = msg.text;
  if (isCurrentlyStreaming) {
    textToRender = streamedTextSnapshot || (vaultData ? vaultData.partialText : "");
  }

  // SAFETY SHIELD FOR EMPTY BOT MESSAGES:
  if (msg.sender === 'bot' && !msg.image && !msg.audio && (!textToRender || !textToRender.trim()) && !isCurrentlyStreaming) {
    textToRender = TOKEN_LIMIT_REDIRECTION_MSG;
  }

  const handleSaveEdit = () => {
    if (editText.trim() && onEditPrompt) {
      onEditPrompt(msg.id, editText.trim());
      setIsEditing(false);
    }
  };

  return (
    <div
      className={`flex gap-4 items-start chat-message-card group ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`flex flex-col ${msg.sender === 'user' ? 'items-end max-w-[85%] md:max-w-[75%]' : 'items-start w-full'}`}>
        <div
          className={`${
            msg.sender === 'user'
            ? (isDarkMode ? 'bg-[#090e1a] text-slate-100 border border-slate-800/80 shadow-sm' : 'bg-[#f0f4f9] text-slate-900 shadow-sm') + ' rounded-[24px] px-5 py-3'
            : (isDarkMode ? 'text-slate-100' : 'text-slate-900') + ' w-full py-1 px-0 overflow-hidden'
          } ${isStreaming ? (isDarkMode ? 'soft-stream-text' : '') : ''} transition-all duration-300`}
        >
          {msg.image && <LocalImageRenderer src={msg.image} isDarkMode={isDarkMode} />}

          {msg.document && <LocalDocumentRenderer src={msg.document} isDarkMode={isDarkMode} />}

          {msg.sender === 'user' && isEditing ? (
            <div className="space-y-2.5 min-w-[240px] sm:min-w-[320px]">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className={`w-full p-2.5 rounded-xl border text-sm outline-none resize-none ${isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                rows={3}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                >
                  Save & Submit
                </button>
              </div>
            </div>
          ) : (
            !(msg.audio && textToRender === "🎤 Voice Message") && (
              <div dir="auto" className={`font-normal w-full ${isStreaming ? 'soft-stream-text' : ''} ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`} style={{ wordBreak: 'break-word' }}>
                {formatMessageText(textToRender, isDarkMode, isStreaming)}
              </div>
            )
          )}



          {msg.sender === 'bot' && textToRender && !isStreaming && !(msg.audio && textToRender === "🎤 Voice Message") && (
            <MessageActions 
              text={textToRender} 
              isDarkMode={isDarkMode} 
              msg={msg} 
              onRegenerate={onRegenerate ? () => onRegenerate(msg.id) : undefined}
              onSwitchVersion={onSwitchVersion ? (idx) => onSwitchVersion(msg.id, idx) : undefined}
            />
          )}

          {msg.audio && (
            <LocalAudioRenderer src={msg.audio} sender={msg.sender} isDarkMode={isDarkMode} isVoiceMessage={textToRender === "🎤 Voice Message"} />
          )}
        </div>

        {/* User Prompt Action Row (Copy & Pencil Edit) Underneath Prompt Bubble */}
        {msg.sender === 'user' && !isEditing && (
          <UserMessageActions 
            text={msg.text} 
            isDarkMode={isDarkMode} 
            onEdit={onEditPrompt ? () => { setEditText(msg.text); setIsEditing(true); } : undefined} 
          />
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.msg.id === nextProps.msg.id &&
    prevProps.msg.text === nextProps.msg.text &&
    prevProps.msg.activeVersionIndex === nextProps.msg.activeVersionIndex &&
    prevProps.msg.versions?.length === nextProps.msg.versions?.length &&
    prevProps.isDarkMode === nextProps.isDarkMode &&
    prevProps.isStreaming === nextProps.isStreaming
  );
});


export function App() {
  const { isDarkMode, toggleDarkMode } = useTheme();

  // ==========================================
  // --- 1. STATE MANAGEMENT
  // ==========================================

  // --- Auth State ---
  const [currentUser, setCurrentUser] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true); 
  const [authMode, setAuthMode] = useState('register'); 
  const [authEmail, setAuthEmail] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // --- Chat & Database State ---
  const [chatHistory, setChatHistory] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [chatModelModes, setChatModelModes] = useState<Record<string, 'xare' | 'gemini'>>({});
  
  // --- Usage Tracking State ---
  const [dailyUsage, setDailyUsage] = useState({
    imageGenCount: 0,
    voiceCallSeconds: 0,
    voiceMessagesCount: 0,
    filesUploadedCount: 0,
    webSearchCount: 0,
  });
  
  // --- UI & Interaction State ---
  const hasInitializedRef = useRef(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isVoiceModeActive, setIsVoiceModeActive] = useState(false); 
  const [showLimitsPopup, setShowLimitsPopup] = useState(false);
  const [popupTimer, setPopupTimer] = useState(5);
  const [isNewUser, setIsNewUser] = useState(false);
  const callSessionRef = useRef(0); 
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeLoadingChatId, setActiveLoadingChatId] = useState(null); 
  const [loadingType, setLoadingType] = useState(null); 
  const [loadingPhase, setLoadingPhase] = useState('thinking'); 
  const [isGeneratingImage, setIsGeneratingImage] = useState(false); 
  const [suggestions, setSuggestions] = useState([]); 
  
  // --- Token-by-Token Liquid Streaming & User Scroll Lock State ---
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const streamingAnimFrameRef = useRef<number | null>(null);
  const isUserScrolledUpRef = useRef(false);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);

  // --- Mobile Visual Viewport Sync State ---
  const [visualViewportHeight, setVisualViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateViewport = () => {
      if (window.visualViewport) {
        setVisualViewportHeight(window.visualViewport.height);
      } else {
        setVisualViewportHeight(window.innerHeight);
      }
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
      if (chatContainerRef.current && !isUserScrolledUpRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    };

    updateViewport();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewport);
      window.visualViewport.addEventListener('scroll', updateViewport);
    }
    window.addEventListener('resize', updateViewport);
    window.addEventListener('scroll', updateViewport);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateViewport);
        window.visualViewport.removeEventListener('scroll', updateViewport);
      }
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('scroll', updateViewport);
    };
  }, []);

  const handleTextareaFocus = () => {
    if (window.scrollY !== 0 || window.scrollX !== 0) {
      window.scrollTo(0, 0);
    }
    setTimeout(() => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
      if (chatContainerRef.current && !isUserScrolledUpRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    }, 120);
  };

  const streamBotResponse = (msgId: string, fullText: string, targetChatId: string, onComplete?: () => void) => {
    if (streamingAnimFrameRef.current) {
      cancelAnimationFrame(streamingAnimFrameRef.current);
      streamingAnimFrameRef.current = null;
    }

    if (!fullText || typeof fullText !== 'string' || !fullText.trim()) {
      setStreamingMessageId(null);
      if (onComplete) onComplete();
      return;
    }

    setStreamingMessageId(msgId);
    ACTIVELY_STREAMING_IDS.add(msgId);
    STREAMING_TEXT_VAULT.set(msgId, { fullText, partialText: "" });

    const totalLength = fullText.length;
    let charIndex = 0;
    let lastTime = performance.now();
    let lastRenderTime = 0;
    
    // Streaming speed & render throttle config from STREAMING_CONFIG
    const RENDER_THROTTLE_MS = STREAMING_CONFIG.tickIntervalMs;
    const AVERAGE_CHARS_PER_WORD = 5.5;
    const baseSpeed = STREAMING_CONFIG.wordsPerSecond * AVERAGE_CHARS_PER_WORD;
    const maxAdaptiveSpeed = STREAMING_CONFIG.maxAdaptiveWPS * AVERAGE_CHARS_PER_WORD;
    const charsPerSecond = (STREAMING_CONFIG.enableAdaptiveSpeed && totalLength > 500) 
      ? Math.min(maxAdaptiveSpeed, Math.max(baseSpeed, Math.ceil(totalLength / 6))) 
      : baseSpeed;

    const step = (now: number) => {
      const deltaSeconds = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      charIndex += charsPerSecond * deltaSeconds;

      if (charIndex >= totalLength) {
        charIndex = totalLength;
        streamingAnimFrameRef.current = null;
        
        // Lock vault partialText to fullText until React commits final state update
        STREAMING_TEXT_VAULT.set(msgId, { fullText, partialText: fullText });

        setChatHistory(prev => prev.map(c => {
          if (c.id !== targetChatId) return c;
          return {
            ...c,
            messages: (c.messages || []).map(m => m.id === msgId ? { ...m, text: fullText } : m),
            updatedAt: new Date()
          };
        }));

        setStreamingMessageId(null);

        setTimeout(() => {
          STREAMING_TEXT_VAULT.delete(msgId);
          ACTIVELY_STREAMING_IDS.delete(msgId);
        }, 250);

        if (chatContainerRef.current && !isUserScrolledUpRef.current && !isTouchActiveRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
        if (onComplete) onComplete();
      } else {
        if (now - lastRenderTime >= RENDER_THROTTLE_MS) {
          lastRenderTime = now;

          const nextCharCount = Math.floor(charIndex);
          const partialText = fullText.slice(0, nextCharCount);
          STREAMING_TEXT_VAULT.set(msgId, { fullText, partialText });

          // ISOLATED STREAMING UPDATE: Notify subscriber (active ChatMessageItem) without re-rendering App root!
          notifyStreamingSubscribers();

          requestAnimationFrame(() => {
            if (chatContainerRef.current && !isUserScrolledUpRef.current && !isTouchActiveRef.current) {
              chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
            }
          });
        }

        streamingAnimFrameRef.current = requestAnimationFrame(step);
      }
    };

    streamingAnimFrameRef.current = requestAnimationFrame(step);
  };
  
  // --- Media & Tools State ---
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<any>(null); 
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadingFileName, setUploadingFileName] = useState<string>('');
  const [activeTool, setActiveTool] = useState(null); 
  const [activeSubMenu, setActiveSubMenu] = useState(null); 

  // --- DOM & Media References ---
  const chatContainerRef = useRef(null);
  const attachMenuRef = useRef(null);
  const imageInputRef = useRef(null);
  const documentInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const textareaRef = useRef(null);

  // ==========================================
  // --- 2. CONSTANTS & CONFIGURATION
  // ==========================================

const AI_PRESETS = [
  { 
    icon: Brain, 
    label: 'Deep Thinking', 
    action: 'think', 
    prompt: 'Please use your deep thinking and reasoning capabilities to answer the following:\n\n', 
    placeholder: 'Ask a complex question...' 
  },
  { 
    icon: ImageIcon, 
    label: 'Generate Image', 
    action: 'generate_image', 
    prompt: 'Please generate an image based on the following description:\n\n', 
    placeholder: 'Describe the image to generate...' 
  },
  { 
    icon: AlignLeft, 
    label: 'Summarize', 
    action: 'summarize', 
    prompt: 'Please summarize the following text concisely:\n\n', 
    placeholder: 'Paste text to summarize...' 
  },
  { 
    icon: Globe, 
    label: 'Web search', 
    action: 'search', 
    prompt: 'Search the web for:\n\n', 
    placeholder: 'What do you want to search?' 
  },
  { 
    icon: Code, 
    label: 'Explain code', 
    action: 'explain', 
    prompt: 'Please explain what this code does step by step in a clear, beginner-friendly way, explaining the purpose of each part and why it works:\n\n', 
    placeholder: 'Paste code to explain...' 
  },
  { 
    icon: Languages, 
    label: 'Translate', 
    hasSubMenu: true,
    subItems: [
      { label: 'Arabic', action: 'translate', prompt: 'Translate the following text into Egyptian Arabic. Output the complete translation first, followed by a two-column table mapping each original sentence to its translation:\n\n', placeholder: 'Type text to translate...' },
      { label: 'English', action: 'translate', prompt: 'Translate the following text into English. Output the complete translation first, followed by a two-column table mapping each original sentence to its translation:\n\n', placeholder: 'Type text to translate...' },
      { label: 'Turkish', action: 'translate', prompt: 'Translate the following text into Turkish. Output the complete translation first, followed by a two-column table mapping each original sentence to its translation:\n\n', placeholder: 'Type text to translate...' },
      { label: 'French', action: 'translate', prompt: 'Translate the following text into French. Output the complete translation first, followed by a two-column table mapping each original sentence to its translation:\n\n', placeholder: 'Type text to translate...' },
      { label: 'Spanish', action: 'translate', prompt: 'Translate the following text into Spanish. Output the complete translation first, followed by a two-column table mapping each original sentence to its translation:\n\n', placeholder: 'Type text to translate...' }
    ]
  },
  { 
    icon: CheckCircle, 
    label: 'Fix grammar', 
    action: 'fix', 
    prompt: 'Please fix the grammar and improve the writing of the following text:\n\n', 
    placeholder: 'Paste text to fix...' 
  },
];

  // ==========================================
  // --- 3. LIFECYCLE EFFECTS
  // ==========================================

   useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        hasInitializedRef.current = false; 
        setCurrentUser({ id: user.uid, username: user.displayName || user.email.split('@')[0] });
      } else {
        hasInitializedRef.current = false; 
        setChatHistory([]);
        setCurrentUser(null);
        setCurrentChatId(null);
        setSuggestions([]);
        setInputValue('');
        setPendingAttachment(null);
        setIsVoiceModeActive(false);
        setIsLoading(false);
        setActiveLoadingChatId(null);
        setIsRecording(false);
        setActiveTool(null);
        setAuthError('');
      }
      
      // Stop checking session immediately when auth resolves
      setIsCheckingSession(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let timeout;
    if (currentUser && isNewUser) {
      timeout = setTimeout(() => {
        setPopupTimer(5); 
        setShowLimitsPopup(true);
        setIsNewUser(false);
      }, 1000); 
    }
    return () => clearTimeout(timeout);
  }, [currentUser, isNewUser]);

  useEffect(() => {
    let interval;
    if (showLimitsPopup && popupTimer > 0) {
      interval = setInterval(() => {
        setPopupTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [showLimitsPopup, popupTimer]);

  useEffect(() => {
    if (!currentUser || currentUser.id === 'preview-user' || currentUser.id === 'guest-user') return;
    const today = new Date().toISOString().split('T')[0];
    const usageRef = doc(db, 'users', currentUser.id, 'usage', today);

    const unsubscribe = onSnapshot(usageRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setDailyUsage({
          imageGenCount: data.imageGenCount || 0,
          voiceCallSeconds: data.voiceCallSeconds || 0,
          voiceMessagesCount: data.voiceMessagesCount || 0,
          filesUploadedCount: data.filesUploadedCount || 0,
          webSearchCount: data.webSearchCount || 0,
        });
      } else {
        setDailyUsage({ imageGenCount: 0, voiceCallSeconds: 0, voiceMessagesCount: 0, filesUploadedCount: 0, webSearchCount: 0 });
      }
    });
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    let interval;
    if (isVoiceModeActive) {
       callSessionRef.current = 0; 
       interval = setInterval(() => {
          callSessionRef.current += 1;
          if (dailyUsage.voiceCallSeconds + callSessionRef.current >= 300) {
             setIsVoiceModeActive(false); 
             showLocalBotMessage("⚠️ **Usage Limit Reached**\nYour daily live call limit of 5 minutes has been reached.");
          }
       }, 1000);
    } else if (callSessionRef.current > 0) {
       updateUsage('voiceCallSeconds', callSessionRef.current);
       callSessionRef.current = 0;
    }
    return () => clearInterval(interval);
  }, [isVoiceModeActive, dailyUsage.voiceCallSeconds]);

  useEffect(() => {
    if (!currentUser) {
        hasInitializedRef.current = false;
        return;
    }

    if (currentUser.id === 'guest-user' || currentUser.id === 'preview-user') {
      if (!hasInitializedRef.current) {
        const initChatId = generateUniqueId();
        const initChat = {
          id: initChatId,
          title: 'New Chat',
          messages: [],
          updatedAt: new Date()
        };
        setChatHistory([initChat]);
        setCurrentChatId(initChatId);
        hasInitializedRef.current = true;
      }
      return;
    }

    const chatsRef = collection(db, 'users', currentUser.id, 'chats');

    const unsubscribe = onSnapshot(chatsRef, (snapshot) => {
      const fetchedChats = [];
      snapshot.forEach((doc) => {
        const data = doc.data();

        const messages = (data.messages || [])
          .map((msg: any) => {
            const isStreamingActive = ACTIVELY_STREAMING_IDS.has(msg.id) || msg.id === streamingMessageId;
            const vaultItem = STREAMING_TEXT_VAULT.get(msg.id);
            let effectiveText = msg.text;
            if (isStreamingActive || vaultItem) {
              effectiveText = vaultItem ? vaultItem.partialText : (msg.text || "");
            }
            return {
              ...msg,
              timestamp: parseDateSafe(msg.timestamp),
              text: effectiveText
            };
          });

        fetchedChats.push({
          ...data,
          updatedAt: parseDateSafe(data.updatedAt),
          messages
        });
      });

      fetchedChats.sort((a, b) => getLatestChatActivityTime(b) - getLatestChatActivityTime(a));

      if (!hasInitializedRef.current) {
          const initChatId = generateUniqueId();
          const initChat = {
            id: initChatId,
            title: 'New Chat',
            messages: [],
            updatedAt: new Date()
          };
          fetchedChats.unshift(initChat);
          setCurrentChatId(initChatId);
          hasInitializedRef.current = true;
          setChatHistory(fetchedChats);
          return;
      }

      setChatHistory(prevChats => {
        return fetchedChats.map(fetched => {
          const prev = prevChats.find(p => p.id === fetched.id);
          if (!prev || !prev.messages) return fetched;

          const fetchedIds = new Set((fetched.messages || []).map((m: any) => m.id));
          const pendingLocalMessages = (prev.messages || []).filter((m: any) => 
            !fetchedIds.has(m.id) && (ACTIVELY_STREAMING_IDS.has(m.id) || STREAMING_TEXT_VAULT.has(m.id) || m.id === streamingMessageId || m.sender === 'bot')
          );

          if (pendingLocalMessages.length > 0) {
            return {
              ...fetched,
              messages: [...fetched.messages, ...pendingLocalMessages]
            };
          }
          return fetched;
        });
      });
    }, (error) => {
      console.warn("Chat history listener blocked by rules (ignoring safely):", error);
    });

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    let timeoutSending: any, timeout1: any, timeout2: any, timeout3: any;
    if (isLoading) {
      // 1. Immediately start with "Sending" animation
      setLoadingPhase('Sending');

      const sendingMs = TOOL_PHASE_DURATIONS.sendingDurationMs || 600;

      // 2. Transition from "Sending" to the specific tool phase
      timeoutSending = setTimeout(() => {
        switch(loadingType) {
          case 'think':
            setLoadingPhase('Thinking Deeply');
            timeout1 = setTimeout(() => {
              setLoadingPhase('Analyzing Possibilities');
            }, TOOL_PHASE_DURATIONS.think.analyzingPossibilities);
            break;
          case 'audio':
            setLoadingPhase('Transcribing');
            timeout1 = setTimeout(() => {
              setLoadingPhase('Processing Audio');
            }, TOOL_PHASE_DURATIONS.audio.processingAudio); 
            break;
          case 'image':
            setLoadingPhase('Parsing Image');
            timeout1 = setTimeout(() => {
              setLoadingPhase('Analyzing Image');
              timeout2 = setTimeout(() => {
                setLoadingPhase('Thinking');
              }, TOOL_PHASE_DURATIONS.image.thinking);
            }, TOOL_PHASE_DURATIONS.image.analyzingImage);
            break;
          case 'document':
            setLoadingPhase('Parsing PDF');
            timeout1 = setTimeout(() => {
              setLoadingPhase('Analyzing Document');
              timeout2 = setTimeout(() => {
                setLoadingPhase('Thinking');
              }, TOOL_PHASE_DURATIONS.document.thinking);
            }, TOOL_PHASE_DURATIONS.document.analyzingDocument);
            break;
          case 'summarize':
            setLoadingPhase('Summarizing');
            timeout1 = setTimeout(() => {
              setLoadingPhase('Thinking');
            }, TOOL_PHASE_DURATIONS.summarize.thinking);
            break;
          case 'search':
            setLoadingPhase('Searching Web');
            timeout1 = setTimeout(() => {
              setLoadingPhase('Reading Sources');
              timeout2 = setTimeout(() => {
                setLoadingPhase('Thinking');
              }, TOOL_PHASE_DURATIONS.search.thinking);
            }, TOOL_PHASE_DURATIONS.search.readingSources);
            break;
          case 'explain':
            setLoadingPhase('Analyzing Code');
            timeout1 = setTimeout(() => {
              setLoadingPhase('Thinking');
            }, TOOL_PHASE_DURATIONS.explain.thinking);
            break;
          case 'translate':
            setLoadingPhase('Translating');
            timeout1 = setTimeout(() => {
              setLoadingPhase('Thinking');
            }, TOOL_PHASE_DURATIONS.translate.thinking);
            break;
          case 'fix':
            setLoadingPhase('Analyzing Grammar');
            timeout1 = setTimeout(() => {
              setLoadingPhase('Thinking');
            }, TOOL_PHASE_DURATIONS.fix.thinking);
            break;
          default:
            setLoadingPhase('Thinking');
            break;
        }
      }, sendingMs);
    }
    return () => {
      clearTimeout(timeoutSending);
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      clearTimeout(timeout3);
    };
  }, [isLoading, loadingType]);



  // ==========================================
  // --- VERSION SWITCHING & PROMPT EDITING
  // ==========================================
  const handleSwitchMessageVersion = useCallback((msgId: string, targetIdx: number) => {
    setChatHistory(prev => prev.map(c => {
      if (c.id !== currentChatId) return c;
      return {
        ...c,
        messages: (c.messages || []).map(m => {
          if (m.id !== msgId || !m.versions || !m.versions[targetIdx]) return m;
          return {
            ...m,
            text: m.versions[targetIdx],
            activeVersionIndex: targetIdx
          };
        })
      };
    }));
  }, [currentChatId]);

  const handleRegenerateResponse = useCallback((botMsgId: string) => {
    const activeChat = chatHistory.find(c => c.id === currentChatId);
    if (!activeChat) return;

    const msgs = activeChat.messages || [];
    const botIdx = msgs.findIndex(m => m.id === botMsgId);
    if (botIdx === -1) return;

    let userMsg = null;
    for (let i = botIdx - 1; i >= 0; i--) {
      if (msgs[i].sender === 'user') {
        userMsg = msgs[i];
        break;
      }
    }
    if (!userMsg) return;

    sendMessageToBackend(userMsg.text, userMsg.image || userMsg.document || null, activeChat, botMsgId);
  }, [chatHistory, currentChatId]);

  const handleEditUserPrompt = useCallback((userMsgId: string, newPromptText: string) => {
    const activeChat = chatHistory.find(c => c.id === currentChatId);
    if (!activeChat) return;

    const msgs = activeChat.messages || [];
    const userIdx = msgs.findIndex(m => m.id === userMsgId);
    if (userIdx === -1) return;

    const updatedMessages = msgs.slice(0, userIdx + 1).map(m => m.id === userMsgId ? { ...m, text: newPromptText } : m);
    
    const updatedChat = {
      ...activeChat,
      messages: updatedMessages,
      updatedAt: new Date()
    };

    setChatHistory(prev => prev.map(c => c.id === currentChatId ? updatedChat : c));

    if (currentUser && currentUser.id !== 'guest-user' && currentUser.id !== 'preview-user') {
      const chatRef = doc(db, 'users', currentUser.id, 'chats', currentChatId);
      setDoc(chatRef, updatedChat).catch(err => console.warn("Firestore edit update blocked:", err));
    }

    sendMessageToBackend(
      newPromptText, 
      updatedMessages[userIdx].image || updatedMessages[userIdx].document || null, 
      updatedMessages[userIdx].image ? 'image' : (updatedMessages[userIdx].document ? 'document' : null), 
      "", 
      null, 
      null, 
      null, 
      true // isEditMode = true (prevents duplicate user message bubble)
    );
  }, [chatHistory, currentChatId, currentUser]);



  // ==========================================
  // --- DIRECT CLIPBOARD PASTE (IMAGES & PDFS)
  // ==========================================
  const processPastedFile = (file: File) => {
    if (file.size > 100 * 1024 * 1024) {
      showLocalBotMessage("**File Size Limit Exceeded**\nThe pasted file exceeds the maximum allowed size of 100 MB. Please choose a smaller file.");
      return;
    }
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
    if (file.size < 5 * 1024 * 1024) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = event.target?.result as string;
        setPendingAttachment({
          type: file.type.startsWith('image/') ? 'image' : 'document',
          file: file,
          data: previewUrl || base64Data,
          name: file.name || `pasted_file_${Date.now()}`,
          size: file.size,
          mimeType: file.type
        });
      };
      reader.readAsDataURL(file);
    } else {
      setPendingAttachment({
        type: file.type.startsWith('image/') ? 'image' : 'document',
        file: file,
        data: previewUrl,
        name: file.name || `pasted_file_${Date.now()}`,
        size: file.size,
        mimeType: file.type
      });
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        processPastedFile(file);
        break;
      }
    }
  };

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || (target.tagName === 'TEXTAREA' && target !== textareaRef.current))) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (!file) continue;
          e.preventDefault();
          processPastedFile(file);
          break;
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, []);

  const isTouchActiveRef = useRef(false);
  const touchStartYRef = useRef<number | null>(null);

  const setScrolledUpLock = (val: boolean) => {
    isUserScrolledUpRef.current = val;
    GLOBAL_IS_USER_SCROLLED_UP = val;
    setIsUserScrolledUp(val);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.deltaY < 0) {
      // User is scrolling UP - instantly lock auto-scroll with zero delay
      setScrolledUpLock(true);
    } else if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      if (scrollHeight - scrollTop - clientHeight <= 40) {
        setScrolledUpLock(false);
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    isTouchActiveRef.current = true;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartYRef.current !== null) {
      const currentY = e.touches[0].clientY;
      const deltaY = currentY - touchStartYRef.current;
      if (deltaY > 2) { // Finger dragging down -> content scrolling UP
        setScrolledUpLock(true);
      }
    }
  };

  const handleTouchEnd = () => {
    isTouchActiveRef.current = false;
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      if (scrollHeight - scrollTop - clientHeight > 40) {
        setScrolledUpLock(true);
      } else {
        setScrolledUpLock(false);
      }
    }
  };

  const handleChatScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    
    if (distanceToBottom > 80) {
      if (!isUserScrolledUpRef.current && (isTouchActiveRef.current || touchStartYRef.current !== null)) {
        setScrolledUpLock(true);
      }
    } else {
      if (isUserScrolledUpRef.current && !isTouchActiveRef.current) {
        setScrolledUpLock(false);
      }
    }
  };

  const scrollToBottom = (force = false) => {
    if (chatContainerRef.current) {
      if (isUserScrolledUpRef.current && !force) return;
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    if (!isUserScrolledUpRef.current) {
      scrollToBottom();
    }
  }, [currentChatId, chatHistory, isLoading, isVoiceModeActive, isGeneratingImage, loadingPhase, suggestions]);

  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    if (inputValue.trim() && isRecording) {
      cancelRecording();
    }
  }, [inputValue, isRecording]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target)) {
        setShowAttachMenu(false);
        setActiveSubMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  // ==========================================
  // --- 4. ACTION HANDLERS
  // ==========================================

  const updateUsage = async (field, amount = 1) => {
    if (!currentUser) return;
    if (currentUser.id === 'preview-user' || currentUser.id === 'guest-user') {
      setDailyUsage(prev => ({ ...prev, [field]: prev[field] + amount }));
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    const usageRef = doc(db, 'users', currentUser.id, 'usage', today);
    try {
      await setDoc(usageRef, { [field]: increment(amount) }, { merge: true });
    } catch (err) {
      console.warn("Usage tracking blocked", err);
    }
  };

  const showLocalBotMessage = (text: string) => {
    let targetChatId = currentChatId;
    if (!targetChatId) {
      targetChatId = generateUniqueId();
      setCurrentChatId(targetChatId);
    }
    const msgId = generateUniqueId();
    const botMsg = { id: msgId, text: "", sender: 'bot', timestamp: new Date() };
    setChatHistory(prevHistory => {
      const chatExists = prevHistory.some(c => c.id === targetChatId);
      if (chatExists) {
        return prevHistory.map(c => c.id === targetChatId ? { ...c, messages: [...c.messages, botMsg], updatedAt: new Date() } : c);
      } else {
        return [{ id: targetChatId, title: 'Notice', messages: [botMsg], updatedAt: new Date() }, ...prevHistory];
      }
    });
    streamBotResponse(msgId, text, targetChatId);
  };

  const persistBotMessageToFirestore = useCallback((targetChatId: string, botMsg: any, finalText: string) => {
    if (!currentUser || currentUser.id === 'guest-user' || currentUser.id === 'preview-user') return;
    const chatRef = doc(db, 'users', currentUser.id, 'chats', targetChatId);
    const msgToSave = { ...botMsg, text: finalText };

    getDoc(chatRef).then(latestChatSnap => {
      if (latestChatSnap.exists()) {
        const latestChatData = latestChatSnap.data();
        const existingMsgs = latestChatData.messages || [];
        const filtered = existingMsgs.filter((m: any) => m.id !== botMsg.id);
        setDoc(chatRef, { 
          ...latestChatData, 
          messages: [...filtered, msgToSave], 
          updatedAt: new Date() 
        }, { merge: true }).catch(err => console.warn("Failed to persist bot message:", err));
      }
    }).catch(err => console.warn("Failed to fetch chat for bot message sync:", err));
  }, [currentUser]);

  const switchChat = (chatId: string) => {
    if (streamingAnimFrameRef.current) {
      cancelAnimationFrame(streamingAnimFrameRef.current);
      streamingAnimFrameRef.current = null;
    }
    setStreamingMessageId(null);
    setCurrentChatId(chatId);
    setSuggestions([]);
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false); 
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError('Please enter both email and password.');
      return;
    }
    if (authMode === 'register' && !authUsername.trim()) {
      setAuthError('Please enter a username.');
      return;
    }
    setIsAuthLoading(true);
    setAuthError('');
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        await updateProfile(userCredential.user, { displayName: authUsername.trim() });
        setIsNewUser(true);
        setCurrentUser({ id: userCredential.user.uid, username: authUsername.trim() });
      }
      setAuthEmail('');
      setAuthPassword('');
      setAuthUsername('');
    } catch (err) {
      if (err.message.includes('email-already-in-use')) {
        setAuthError('This email is already registered. Please log in instead.');
      } else if (err.message.includes('invalid-credential') || err.message.includes('user-not-found') || err.message.includes('wrong-password')) {
        setAuthError('Account not found or incorrect password. Please sign up first.');
      } else if (err.message.includes('weak-password')) {
        setAuthError('Password is too weak. Please use at least 6 characters.');
      } else {
        setAuthError('Authentication failed. Please try again.');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsAuthLoading(true);
    setAuthError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      const isNew = result.user.metadata.creationTime === result.user.metadata.lastSignInTime;
      
      if (isNew) {
         setIsNewUser(true);
      }
      
      setCurrentUser({ id: result.user.uid, username: result.user.displayName || result.user.email.split('@')[0] });
    } catch (err) {
      console.error("Google sign-in error:", err);
      if (err.code === 'auth/popup-closed-by-user') {
        setAuthError('Sign-in cancelled.');
      } else if (err.code === 'auth/unauthorized-domain') {
        if (!window.location.hostname) {
          setAuthError('Google Auth is blocked inside this preview sandbox. It will work perfectly once deployed. Please use Email/Password for now.');
        } else {
          setAuthError(`Setup required: Add "${window.location.hostname}" to your Firebase Console (Auth > Settings > Authorized domains).`);
        }
      } else {
        setAuthError('Google sign-in failed. Please try again.');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleGuestSignIn = () => {
    setIsAuthLoading(true);
    setAuthError('');
    setTimeout(() => {
      hasInitializedRef.current = false;
      setCurrentUser({ id: 'guest-user', username: 'Guest' });
      setIsAuthLoading(false);
    }, 200);
  };

  const handleLogout = async () => {
    try {
      if (currentUser?.id === 'guest-user' || currentUser?.id === 'preview-user') {
        hasInitializedRef.current = false;
        setCurrentUser(null);
        setChatHistory([]);
        setCurrentChatId(null);
        return;
      }
      await signOut(auth);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const createNewChat = async () => {
    if (streamingAnimFrameRef.current) {
      cancelAnimationFrame(streamingAnimFrameRef.current);
      streamingAnimFrameRef.current = null;
    }
    setStreamingMessageId(null);
    if (!currentUser) return;

    const existingEmptyChat = chatHistory.find(
      (chat) => !chat.messages || chat.messages.length === 0 || !chat.messages.some(m => m.sender === 'user')
    );

    if (existingEmptyChat) {
      setCurrentChatId(existingEmptyChat.id);
      setSuggestions([]);
      if (window.innerWidth < 1024) setIsSidebarOpen(false);
      return; 
    }

    const newChatId = generateUniqueId();
    const newChat = {
      id: newChatId,
      title: 'New Chat',
      messages: [],
      updatedAt: new Date()
    };
    setCurrentChatId(newChatId);
    setChatHistory(prev => [newChat, ...prev]);
    setSuggestions([]);
    setDoc(doc(db, 'users', currentUser.id, 'chats', newChatId), newChat).catch(err => {
      console.warn("Chat creation blocked by rules (ignoring):", err);
    });
    
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  };

  const triggerSuggestions = async (botText) => {
      const cleanedText = cleanThinkTags(botText);
      if (!cleanedText || cleanedText.length < 10) return;
      try {
          const res = await callGeminiAPI(
              cleanedText, 
              "Generate 3 extremely short, highly relevant follow-up questions the user could ask based on this text. They must be conversational and engaging. Return ONLY a valid JSON array of strings.", 
              true
          );
          if (res) {
              let parsed = [];
              try {
                  const cleanRes = res.replace(/```json/gi, '').replace(/```/g, '').trim();
                  parsed = JSON.parse(cleanRes);
              } catch (parseError) {
                  console.warn("Falling back to text extraction for suggestions:", res);
                  parsed = res.split('\n')
                      .map(line => line.replace(/^[\*\-\d\.]+\s*/, '').replace(/["']/g, '').trim()) 
                      .filter(line => line.length > 5 && line.length < 100); 
              }
              
              if (Array.isArray(parsed) && parsed.length > 0) {
                  const strSuggestions = parsed.map(item => {
                      if (typeof item === 'string') return item;
                      if (typeof item === 'object' && item !== null) return Object.values(item)[0];
                      return String(item);
                  }).filter(item => typeof item === 'string' && item.trim().length > 0);
                  
                  setSuggestions(strSuggestions.slice(0, 3));
              }
          }
      } catch(e) {
          console.error("Suggestion generation failed", e);
      }
  };

  const handleSwitchToGeminiAPI = useCallback(async (msgId: string) => {
    const currentChat = chatHistory.find(c => c.id === currentChatId);
    if (!currentChat) return;

    // Enable Gemini mode for this chat thread so follow-up prompts auto-route to Gemini
    setChatModelModes(prev => ({ ...prev, [currentChatId]: 'gemini' }));

    const msgIdx = currentChat.messages.findIndex((m: any) => m.id === msgId);
    let userPromptText = "";
    if (msgIdx > 0) {
      for (let i = msgIdx - 1; i >= 0; i--) {
        if (currentChat.messages[i].sender === 'user') {
          userPromptText = currentChat.messages[i].text;
          break;
        }
      }
    }
    if (!userPromptText) userPromptText = "Please assist with my request.";

    const newGeminiMsg = {
      id: generateUniqueId(),
      text: "",
      sender: 'bot',
      modelEngine: 'gemini-3.5-flash-lite',
      timestamp: new Date()
    };

    ACTIVELY_STREAMING_IDS.add(newGeminiMsg.id);
    STREAMING_TEXT_VAULT.set(newGeminiMsg.id, { fullText: "", partialText: "" });
    setStreamingMessageId(newGeminiMsg.id);

    setChatHistory(prev => prev.map(c => c.id === currentChatId ? {
      ...c,
      messages: [...c.messages, newGeminiMsg],
      updatedAt: new Date()
    } : c));

    setIsLoading(false);
    setActiveLoadingChatId(null);

    try {
      const finalAnswer = await callGeminiAPIStream(userPromptText, (accumulated) => {
        STREAMING_TEXT_VAULT.set(newGeminiMsg.id, { fullText: accumulated, partialText: accumulated });
        notifyStreamingSubscribers();
        if (chatContainerRef.current && !isUserScrolledUpRef.current && !isTouchActiveRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      });

      STREAMING_TEXT_VAULT.set(newGeminiMsg.id, { fullText: finalAnswer, partialText: finalAnswer });
      setChatHistory(prev => prev.map(c => c.id === currentChatId ? {
        ...c,
        messages: (c.messages || []).map(m => m.id === newGeminiMsg.id ? { ...m, text: finalAnswer } : m),
        updatedAt: new Date()
      } : c));

      setStreamingMessageId(null);
      setTimeout(() => {
        STREAMING_TEXT_VAULT.delete(newGeminiMsg.id);
        ACTIVELY_STREAMING_IDS.delete(newGeminiMsg.id);
      }, 250);

      triggerSuggestions(finalAnswer);
      persistBotMessageToFirestore(currentChatId, newGeminiMsg, finalAnswer);

    } catch (err) {
      console.error("Direct Gemini API streaming error:", err);
      setIsLoading(false);
      setActiveLoadingChatId(null);
    }
  }, [chatHistory, currentChatId, persistBotMessageToFirestore]);

  const handleSwitchToXareAPI = useCallback((msgId: string) => {
    setChatModelModes(prev => ({ ...prev, [currentChatId]: 'xare' }));
    showLocalBotMessage("Switched back to primary Xare AI model engine.");
  }, [currentChatId]);

  const sendMessageToBackend = async (
    msgText, 
    attachmentData = null, 
    attachmentType = null, 
    hiddenPrefix = "", 
    toolAction = null, 
    toolLabel = null,
    targetBotMsgId = null,
    isEditMode = false,
    attachmentFile: File | null = null
  ) => {
    if (!currentUser) return;
    setScrolledUpLock(false);

    let finalAction = toolAction || "chat";
    let finalMessageText = hiddenPrefix + msgText;

    if (msgText.toLowerCase().startsWith('/image ')) {
      finalAction = 'generate_image';
      finalMessageText = msgText.substring(7).trim();
    } else if (msgText.toLowerCase().startsWith('/imagine ')) {
      finalAction = 'generate_image';
      finalMessageText = msgText.substring(9).trim();
    }

    if (/\b(code|python|script|pygame|game|function|program|build|write|create|cpp|java|html|js|javascript|sql)\b/i.test(msgText)) {
      finalMessageText += "\n\n[FORMAT DIRECTIVE: If your response includes code or scripts, you MUST wrap all code inside a standard markdown triple-backtick block, e.g. ```python\n# code\n```. Do NOT output code as plain text or inline backticks.]";
    }



    let targetChatId = currentChatId;
    if (!targetChatId) {
      targetChatId = generateUniqueId();
      setCurrentChatId(targetChatId);
    }

    let uploadedFileUrl: string | null = null;
    let uploadedMimeType: string | null = null;
    let uploadedFileName: string | null = null;
    let uploadedFileSize: number | null = null;
    let uploadedFileId: string | null = null;

    if (attachmentFile instanceof File) {
      try {
        setUploadingFileName(attachmentFile.name);
        setUploadProgress(0);
        const uploadRes = await uploadFileDirectly(attachmentFile, {
          userId: currentUser.id,
          onProgress: (p) => setUploadProgress(p)
        });
        uploadedFileUrl = uploadRes.fileUrl;
        uploadedMimeType = uploadRes.mimeType;
        uploadedFileName = uploadRes.fileName;
        uploadedFileSize = uploadRes.fileSize;
        uploadedFileId = uploadRes.fileId;
        setUploadProgress(null);
      } catch (uploadErr: any) {
        console.error("Direct storage upload failed:", uploadErr);
        setUploadProgress(null);
        setIsLoading(false);
        setActiveLoadingChatId(null);
        setLoadingType(null);
        showLocalBotMessage(`⚠️ **Upload Failed**\n${uploadErr.message || 'Could not upload file to storage. Please try again.'}`);
        return;
      }
    }

    let firestoreImage = null;
    let firestoreDocument = null;
    let firestoreAudio = null;

    if (uploadedFileUrl) {
      if (attachmentType === 'image') firestoreImage = uploadedFileUrl;
      else if (attachmentType === 'document') firestoreDocument = uploadedFileUrl;
      else if (attachmentType === 'audio') firestoreAudio = uploadedFileUrl;
    } else if (attachmentType === 'image' && attachmentData) {
      const localId = 'localdb_' + generateUniqueId();
      await saveToLocalDB(localId, attachmentData);
      firestoreImage = localId;
    } else if (attachmentType === 'document' && attachmentData) {
      const localId = 'localdb_' + generateUniqueId();
      await saveToLocalDB(localId, attachmentData);
      firestoreDocument = localId;
    } else if (attachmentType === 'audio' && attachmentData) {
      const localId = 'localdb_' + generateUniqueId();
      await saveToLocalDB(localId, attachmentData);
      firestoreAudio = localId;
    }

    const newUserMsg = {
      id: generateUniqueId(),
      text: msgText,
      audio: firestoreAudio,
      image: firestoreImage,
      document: firestoreDocument,
      sender: 'user',
      timestamp: new Date()
    };

    const chatRef = doc(db, 'users', currentUser.id, 'chats', targetChatId);

    if (finalAction === 'generate_image') updateUsage('imageGenCount');
    if (finalAction === 'search') updateUsage('webSearchCount');

    if (!isEditMode) {
      setChatHistory(prevHistory => {
        let activeChat = prevHistory.find(c => c.id === targetChatId);
        if (!activeChat) {
          activeChat = { id: targetChatId, title: 'New Chat', messages: [], updatedAt: new Date() };
        }

        let updatedTitle = activeChat.title || 'New Chat';
        const isFirstUserMsg = (activeChat.messages || []).filter(m => m.sender === 'user').length === 0;
        
        if (isFirstUserMsg) {
          if (attachmentType === 'audio') updatedTitle = 'Voice Note';
          else if (attachmentType === 'image') updatedTitle = 'Image Attachment';
          else if (attachmentType === 'document') updatedTitle = 'Document Attachment';
          else {
              updatedTitle = msgText.substring(0, 30) + (msgText.length > 30 ? '...' : '');
              
              const titlePrompt = `Extract a short 2-4 word title for the message.\n\nMessage: "how do I cook a steak"\nTitle: Cooking a Steak\n\nMessage: "write a python script for scraping"\nTitle: Python Web Scraping\n\nMessage: "${msgText}"\nTitle:`;
              
              callGeminiAPI(titlePrompt).then(genTitle => {
                  if (genTitle) {
                      let cleanTitle = genTitle.split('\n')[0].replace(/^(Title:|Chat Title:|\*|\[System Directives\]:|Task:|Output:|Response:)/gi, '').replace(/["']/g, '').trim();
                      
                      if (cleanTitle.toLowerCase().includes("extract a") || cleanTitle.toLowerCase().includes("message:")) {
                          cleanTitle = msgText.substring(0, 20) + '...';
                      }
                      
                      if (cleanTitle.length > 35) cleanTitle = cleanTitle.substring(0, 35) + '...';
                      
                      setChatHistory(prev => prev.map(c => c.id === targetChatId ? { ...c, title: cleanTitle } : c));
                      
                      getDoc(chatRef).then(snap => {
                          if (snap.exists()) setDoc(chatRef, { ...snap.data(), title: cleanTitle }, { merge: true });
                      });
                  }
              }).catch(e => console.error("Title generation failed", e));
          }
        }

        const chatToUpdate = {
          ...activeChat,
          title: updatedTitle,
          messages: [...(activeChat.messages || []), newUserMsg],
          updatedAt: new Date()
        };

        setDoc(chatRef, chatToUpdate).catch(err => console.warn("Firebase message append blocked:", err));

        const exists = prevHistory.some(c => c.id === targetChatId);
        return exists 
          ? prevHistory.map(c => c.id === targetChatId ? chatToUpdate : c)
          : [chatToUpdate, ...prevHistory];
      });
    }

    setSuggestions([]);
    setIsLoading(true);
    setActiveLoadingChatId(targetChatId);

    const activeMode = chatModelModes[targetChatId] || 'xare';

    // DIRECT GEMINI MODE ROUTER (If user previously clicked 'Switch to Gemini AI')
    if (activeMode === 'gemini' && (finalAction === 'chat' || !finalAction || finalAction === 'text')) {
      const newGeminiMsg = {
        id: generateUniqueId(),
        text: "",
        sender: 'bot',
        modelEngine: 'gemini',
        timestamp: new Date()
      };

      ACTIVELY_STREAMING_IDS.add(newGeminiMsg.id);
      STREAMING_TEXT_VAULT.set(newGeminiMsg.id, { fullText: "", partialText: "" });
      setStreamingMessageId(newGeminiMsg.id);

      setChatHistory(prev => prev.map(c => c.id === targetChatId ? {
        ...c,
        messages: [...c.messages, newGeminiMsg],
        updatedAt: new Date()
      } : c));

      setIsLoading(false);
      setActiveLoadingChatId(null);

      try {
        const finalAnswer = await callGeminiAPIStream(finalMessageText, (accumulated) => {
          STREAMING_TEXT_VAULT.set(newGeminiMsg.id, { fullText: accumulated, partialText: accumulated });
          notifyStreamingSubscribers();
          if (chatContainerRef.current && !isUserScrolledUpRef.current && !isTouchActiveRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          }
        });

        STREAMING_TEXT_VAULT.set(newGeminiMsg.id, { fullText: finalAnswer, partialText: finalAnswer });
        setChatHistory(prev => prev.map(c => c.id === targetChatId ? {
          ...c,
          messages: (c.messages || []).map(m => m.id === newGeminiMsg.id ? { ...m, text: finalAnswer } : m),
          updatedAt: new Date()
        } : c));

        setStreamingMessageId(null);
        setTimeout(() => {
          STREAMING_TEXT_VAULT.delete(newGeminiMsg.id);
          ACTIVELY_STREAMING_IDS.delete(newGeminiMsg.id);
        }, 250);

        triggerSuggestions(finalAnswer);
        persistBotMessageToFirestore(targetChatId, newGeminiMsg, finalAnswer);
        return;
      } catch (err) {
        console.error("Gemini API mode execution error:", err);
      }
    }

    let uiLoadingType = attachmentType || 'text';
    
    if (toolLabel) {
      if (toolLabel.includes('Deep Thinking')) uiLoadingType = 'think';
      else if (toolLabel.includes('Summarize')) uiLoadingType = 'summarize';
      else if (toolLabel.includes('search')) uiLoadingType = 'search';
      else if (toolLabel.includes('code')) uiLoadingType = 'explain';
      else if (toolLabel.includes('Translate')) uiLoadingType = 'translate';
      else if (toolLabel.includes('grammar')) uiLoadingType = 'fix';
    }
    setLoadingType(uiLoadingType);

    try {
      if (!N8N_WEBHOOK_URL || N8N_WEBHOOK_URL.trim() === "") throw new Error("ERR-005: Webhook URL is missing.");

      if (finalAction === 'generate_image') setIsGeneratingImage(true);
      else setIsGeneratingImage(false);

      const taskId = generateUniqueId();
      const payload: any = {
        taskId: taskId, 
        sessionId: targetChatId,
        userId: currentUser.id,
        username: currentUser.username,
        message: finalMessageText,
        action: finalAction,
        timestamp: new Date().toISOString()
      };

      if (uploadedFileUrl) {
        payload.fileId = uploadedFileId;
        payload.file_id = uploadedFileId;
        payload.fileUrl = uploadedFileUrl;
        payload.file_url = uploadedFileUrl;
        payload.fileName = uploadedFileName;
        payload.file_name = uploadedFileName;
        payload.fileSize = uploadedFileSize;
        payload.file_size = uploadedFileSize;
        payload.mimeType = uploadedMimeType;
        payload.mime_type = uploadedMimeType;
        payload.message = {
          text: finalMessageText,
          caption: msgText,
          file_url: uploadedFileUrl,
          fileUrl: uploadedFileUrl,
          file_id: uploadedFileId,
          fileId: uploadedFileId,
          file_name: uploadedFileName,
          fileName: uploadedFileName,
          file_size: uploadedFileSize,
          fileSize: uploadedFileSize,
          mime_type: uploadedMimeType,
          mimeType: uploadedMimeType,
          chat: { id: targetChatId }
        };
        if (attachmentType === 'audio') payload.message.voice = { file_url: uploadedFileUrl, fileUrl: uploadedFileUrl };
        else if (attachmentType === 'image') payload.message.photo = [{ file_url: uploadedFileUrl, fileUrl: uploadedFileUrl }];
        else if (attachmentType === 'document') payload.message.document = { file_url: uploadedFileUrl, fileUrl: uploadedFileUrl };
      } else {
        if (attachmentType === 'audio') payload.message = { voice: { file_id: attachmentData } };
        else if (attachmentType === 'image') payload.message = { photo: [{ file_id: attachmentData }], caption: msgText };
        else if (attachmentType === 'document') payload.message = { document: { file_id: attachmentData }, caption: msgText };
      }

      const taskDocRef = doc(db, 'users', currentUser.id, 'ai_tasks', taskId);
      setDoc(taskDocRef, { taskId: taskId, sessionId: targetChatId, prompt: finalMessageText, status: "processing", createdAt: new Date() }).catch(e => console.warn(e));

      let isResolved = false;
      let unsubscribeTask = () => {};
      let fallbackTimeout; 

      // MADE ASYNC TO SYNCHRONIZE IndexedDB BEFORE RENDER
      const completeBotResponse = async (responseData: any, isError = false) => {
        if (isResolved) return;
        isResolved = true;
        unsubscribeTask();
        if (fallbackTimeout) clearTimeout(fallbackTimeout);
        
        let newBotMsg;
        let rawBotText = "";
        
        const triggerAutoGeminiFallback = (noticeText: string) => {
          const noticeMsg = { id: generateUniqueId(), text: noticeText, sender: 'bot', timestamp: new Date() };
          setChatHistory(prev => prev.map(c => c.id === targetChatId ? { ...c, messages: [...c.messages, noticeMsg], updatedAt: new Date() } : c));
          
          setChatModelModes(prev => ({ ...prev, [targetChatId]: 'gemini' }));
          
          setLoadingPhase('thinking');
          setIsLoading(true);
          setActiveLoadingChatId(targetChatId);

          callGeminiAPI(finalMessageText).then(geminiRes => {
            const finalAnswer = geminiRes || "I am currently unable to process this request. Please try again in a few minutes.";
            const newGeminiMsg = {
              id: generateUniqueId(),
              text: "",
              sender: 'bot',
              modelEngine: 'gemini',
              timestamp: new Date()
            };

            ACTIVELY_STREAMING_IDS.add(newGeminiMsg.id);
            STREAMING_TEXT_VAULT.set(newGeminiMsg.id, { fullText: finalAnswer, partialText: "" });
            setStreamingMessageId(newGeminiMsg.id);

            setChatHistory(prev => prev.map(c => c.id === targetChatId ? {
              ...c,
              messages: [...c.messages, newGeminiMsg],
              updatedAt: new Date()
            } : c));

            setIsLoading(false);
            setActiveLoadingChatId(null);
            setLoadingType(null);
            setIsGeneratingImage(false);

            streamBotResponse(newGeminiMsg.id, finalAnswer, targetChatId, () => {
              triggerSuggestions(finalAnswer);
              persistBotMessageToFirestore(targetChatId, newGeminiMsg, finalAnswer);
            });
          }).catch(err => {
            console.error("Auto Gemini fallback error:", err);
            setIsLoading(false);
            setActiveLoadingChatId(null);
            setLoadingType(null);
            setIsGeneratingImage(false);
          });
        };

        if (isError) {
           triggerAutoGeminiFallback(TOKEN_LIMIT_REDIRECTION_MSG);
           return;
        } else {
           const parsedData = parsePayloadData(responseData);
           rawBotText = parsedData.text || "";

           let botImage = parsedData.image;
           let botAudio = parsedData.audio;

           // Fallback for empty text responses or rate limits
           if ((!rawBotText || !rawBotText.trim()) && !botImage && !botAudio) {
               triggerAutoGeminiFallback(TOKEN_LIMIT_REDIRECTION_MSG);
               return;
           }

           if (botImage && botImage.length > 5000) { 
               const localId = 'localdb_' + generateUniqueId();
               await saveToLocalDB(localId, botImage); // GUARANTEES DATA IS SAVED FIRST
               botImage = localId;
           }
           if (botAudio && botAudio.length > 50000) {
               const localId = 'localdb_' + generateUniqueId();
               await saveToLocalDB(localId, botAudio); // GUARANTEES DATA IS SAVED FIRST
               botAudio = localId;
           }

           const shouldStream = Boolean(rawBotText && finalAction !== 'generate_image');
           
           if (shouldStream) {
             ACTIVELY_STREAMING_IDS.add(taskId);
             STREAMING_TEXT_VAULT.set(taskId, { fullText: rawBotText, partialText: "" });
             setStreamingMessageId(taskId);
           }

           newBotMsg = { 
             id: taskId, 
             text: shouldStream ? "" : rawBotText, 
             audio: botAudio, 
             image: botImage, 
             sender: 'bot', 
             timestamp: new Date() 
           };

           setChatHistory(prev => prev.map(c => c.id === targetChatId ? { ...c, messages: [...c.messages, newBotMsg], updatedAt: new Date() } : c));
           
           setIsLoading(false);
           setActiveLoadingChatId(null);
           setLoadingType(null);
           setIsGeneratingImage(false);

           if (shouldStream) {
            streamBotResponse(taskId, rawBotText, targetChatId, () => {
              triggerSuggestions(rawBotText);
              persistBotMessageToFirestore(targetChatId, newBotMsg, rawBotText);
            });
          } else {
            if (rawBotText && finalAction !== 'generate_image') {
              triggerSuggestions(rawBotText);
            }
            persistBotMessageToFirestore(targetChatId, newBotMsg, rawBotText);
          }
        }
      };

      fallbackTimeout = setTimeout(() => {
         if (!isResolved) {
             completeBotResponse("Request timed out. The server took too long to respond.", true);
         }
      }, 500000);

      unsubscribeTask = onSnapshot(taskDocRef, (snapshot) => {
        if (isResolved) return; 
        if (snapshot.exists()) {
          const taskData = snapshot.data();
          if (taskData.status === 'completed') completeBotResponse(taskData.payload || taskData.response || taskData.result || taskData.text || taskData);
          else if (taskData.status === 'error') completeBotResponse(taskData.error || taskData.message || 'An unknown error occurred during processing.', true);
        }
      });

      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 300000);

      try {
        const response = await fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-chatbot-token': 'ali1234' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(fetchTimeout);

        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}`);
        }

        if (response.ok && !isResolved) {
          const contentType = response.headers.get('content-type') || '';
          
          if (contentType.includes('image/')) {
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onloadend = () => { if (!isResolved) completeBotResponse({ image: reader.result }); };
            reader.readAsDataURL(blob);
            return;
          } else if (contentType.includes('audio/')) {
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onloadend = () => { if (!isResolved) completeBotResponse({ audio: reader.result }); };
            reader.readAsDataURL(blob);
            return;
          }

          const text = await response.text();
          let data: any;
          
          try {
              data = JSON.parse(text);
              if (Array.isArray(data) && data.length > 0) data = data[0];
          } catch (e) {
              data = text; // Treat as raw text
          }

          const isGenericAck = data && data.message && typeof data.message === 'string' && (data.message.toLowerCase().includes("started") || data.message.toLowerCase().includes("received"));
          const isEmpty = !data || (typeof data === 'object' && Object.keys(data).length === 0) || (typeof data === 'string' && !data.trim());

          if ((isEmpty || isGenericAck) && !isResolved) {
            await completeBotResponse(TOKEN_LIMIT_REDIRECTION_MSG);
          } else if (!isResolved) {
            await completeBotResponse(data.payload || data.response || data.result || data.text || data);
          }
        }
      } catch (err: any) {
        clearTimeout(fetchTimeout);
        console.log("Fetch dropped or HTTP error:", err);
        if (!isResolved) {
          completeBotResponse(TOKEN_LIMIT_REDIRECTION_MSG, true);
        }
      }

    } catch (error) {
      console.error("[ERROR]:", error);
      const noticeMsg = { id: generateUniqueId(), text: TOKEN_LIMIT_REDIRECTION_MSG, sender: 'bot', timestamp: new Date() };
      setChatHistory(prev => prev.map(c => c.id === targetChatId ? { ...c, messages: [...c.messages, noticeMsg], updatedAt: new Date() } : c));
      
      setChatModelModes(prev => ({ ...prev, [targetChatId]: 'gemini' }));
      
      callGeminiAPI(finalMessageText).then(geminiRes => {
        const finalAnswer = geminiRes || "I am currently unable to process this request. Please try again in a few minutes.";
        const newGeminiMsg = {
          id: generateUniqueId(),
          text: "",
          sender: 'bot',
          modelEngine: 'gemini',
          timestamp: new Date()
        };

        STREAMING_TEXT_VAULT.set(newGeminiMsg.id, { fullText: finalAnswer, partialText: "" });
        setStreamingMessageId(newGeminiMsg.id);

        setChatHistory(prev => prev.map(c => c.id === targetChatId ? {
          ...c,
          messages: [...c.messages, newGeminiMsg],
          updatedAt: new Date()
        } : c));

        setIsLoading(false);
        setActiveLoadingChatId(null);
        setLoadingType(null);
        setIsGeneratingImage(false);

        streamBotResponse(newGeminiMsg.id, finalAnswer, targetChatId, () => {
          triggerSuggestions(finalAnswer);
          persistBotMessageToFirestore(targetChatId, newGeminiMsg, finalAnswer);
        });
      }).catch(err => {
        console.error("Auto Gemini fallback error:", err);
        setIsLoading(false);
        setActiveLoadingChatId(null);
        setLoadingType(null);
        setIsGeneratingImage(false);
      });
    }
  };

  const handleSendMessage = (e) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() && !pendingAttachment) return;

    isUserScrolledUpRef.current = false;
    setIsUserScrolledUp(false);
    scrollToBottom(true);

    let baseText = inputValue.trim();
    if (!baseText && pendingAttachment) {
      baseText = pendingAttachment.type === 'image' ? " Sent an image" : ` Sent document: ${pendingAttachment.name}`;
    }

    const hiddenPrompt = activeTool ? activeTool.prompt : "";
    const toolAction = activeTool ? activeTool.action : null; 
    const toolLabel = activeTool ? activeTool.label : null;

    if (pendingAttachment) {
      if (pendingAttachment.size && pendingAttachment.size > 100 * 1024 * 1024) {
        showLocalBotMessage("**File Size Limit Exceeded**\nThe attached file exceeds the maximum allowed limit of 100 MB. Message was not sent.");
        setPendingAttachment(null);
        return;
      }
      sendMessageToBackend(baseText, pendingAttachment.data, pendingAttachment.type, hiddenPrompt, toolAction, toolLabel, null, false, pendingAttachment.file);
      setPendingAttachment(null);
    } else {
      sendMessageToBackend(baseText, null, null, hiddenPrompt, toolAction, toolLabel);
    }

    setInputValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto'; 
    setActiveTool(null); 
    setSuggestions([]);
  };

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      showLocalBotMessage("**File Size Limit Exceeded**\nThe selected image exceeds the maximum allowed size of 100 MB. Please choose a smaller file.");
      e.target.value = '';
      setShowAttachMenu(false);
      return;
    }
    
    try {
      const previewUrl = URL.createObjectURL(file);
      setPendingAttachment({ 
        type: 'image', 
        file, 
        data: previewUrl, 
        name: file.name, 
        size: file.size, 
        mimeType: file.type || 'image/jpeg' 
      });
    } catch (error) {
      console.error("Failed to process image:", error);
      showLocalBotMessage("⚠️ **Image Error**\nCould not process the selected image. Please try a different one.");
    }
    
    e.target.value = '';
    setShowAttachMenu(false);
  };

  const handleDocumentSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      showLocalBotMessage("**File Size Limit Exceeded**\nThe selected document exceeds the maximum allowed size of 100 MB. Please choose a smaller file.");
      e.target.value = '';
      setShowAttachMenu(false);
      return;
    }
    
    try {
      const previewUrl = URL.createObjectURL(file);
      setPendingAttachment({ 
        type: 'document', 
        file, 
        data: previewUrl, 
        name: file.name, 
        size: file.size, 
        mimeType: file.type || 'application/pdf' 
      });
    } catch (error) {
      console.error("Failed to process document:", error);
      showLocalBotMessage("⚠️ **Document Error**\nCould not process the selected document. Please try a different one.");
    }
    
    e.target.value = '';
    setShowAttachMenu(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const voiceFile = new File([audioBlob], 'voice_message.webm', { type: mimeType });
        updateUsage('voiceMessagesCount');
        sendMessageToBackend("🎤 Voice Message", null, 'audio', "", null, null, null, false, voiceFile);
        if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
    } catch (err) {
      console.error(err);
      const errorMsg = { id: generateUniqueId(), text: "⚠️ Could not access your microphone.", sender: 'bot', timestamp: new Date() };
      setChatHistory(prev => prev.map(chat => chat.id === currentChatId ? { ...chat, messages: [...chat.messages, errorMsg], updatedAt: new Date() } : chat));
    }
  };

  const stopRecordingAndSend = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop(); 
    setIsRecording(false);
    setRecordingTime(0);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null; 
      mediaRecorderRef.current.stop();
    }
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(track => track.stop());
    setIsRecording(false);
    setRecordingTime(0);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const currentChat = useMemo(() => {
    return chatHistory.find(c => c.id === currentChatId) || { id: currentChatId, title: 'New Chat', messages: [] };
  }, [chatHistory, currentChatId]);

  const messages = useMemo(() => {
    return currentChat.messages || [];
  }, [currentChat]);

  // ==========================================
  // --- 5. RENDER LOGIC
  // ==========================================

  if (isCheckingSession) {
    return (
      <div className={`xare-app relative h-[100dvh] w-screen overflow-hidden flex flex-col items-center justify-center transition-colors duration-300 ${isDarkMode ? 'bg-[#030407] text-slate-50' : 'bg-[#f8fafc] text-slate-900'}`}>
        <GoogleStyles />
        <div className="relative z-10 flex flex-col items-center animate-pulse">
          {/* ========================================== */}
          {/* 2. LOGO INSTANCE: Initial App Loading Screen */}
          {/* ========================================== */}
          <XareLogo 
            className="w-32 h-32 mb-4 drop-shadow-xl" 
            scale={3.0} 
            x="-9%" 
            isDarkMode={isDarkMode} 
          />
          <Loader2 className={`w-8 h-8 animate-spin ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
          <p className={`mt-4 text-sm font-medium tracking-wide ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Connecting to Xare...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className={`xare-app relative h-[100dvh] w-screen overflow-hidden flex flex-col transition-colors duration-300 ${isDarkMode ? 'bg-[#030407] text-slate-50' : 'bg-[#f8fafc] text-slate-900'}`}>
        <GoogleStyles />

        <div className="absolute top-6 right-6 z-50">
          <ThemeToggleSwitch isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode} />
        </div>

        <div className="flex flex-1 w-full overflow-y-auto chat-scroll relative z-10 px-4 py-6 sm:py-8">
          
          <div className="m-auto w-full max-w-md flex flex-col">
            {/* Executive Glassmorphic Auth Card */}
            <div className={`w-full backdrop-blur-2xl rounded-3xl p-7 sm:p-9 relative animate-float-up border shadow-2xl ${isDarkMode ? 'bg-[#070b14]/90 border-slate-800/80 shadow-black/80' : 'bg-white/90 border-slate-200 shadow-slate-200/50'}`}>
              
              <div className="relative z-10 flex flex-col items-center mb-6 mt-1 text-center">
                <div className="flex items-center justify-center mb-4">
                  <XareLogo 
                    className="w-20 h-20" 
                    scale={3.0} 
                    x="-11%" 
                    isDarkMode={isDarkMode} 
                  />
                </div>
                <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Welcome to Xare
                </h1>
                <p className={`text-sm mt-2 text-center leading-relaxed max-w-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Sign in with Google to sync your chats or continue as guest instantly.
                </p>
              </div>

              {authError && (
                <div className={`mb-5 p-3 border rounded-2xl text-xs font-medium text-center animate-float-up ${isDarkMode ? 'bg-red-950/40 border-red-800/60 text-red-300' : 'bg-red-50 border-red-200 text-red-600'}`}>
                  {authError}
                </div>
              )}

              <div className="relative z-10 space-y-3.5">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isAuthLoading}
                  className={`w-full flex items-center justify-center gap-3 py-3.5 px-5 rounded-2xl font-semibold transition-all active:scale-[0.98] text-sm border ${
                    isDarkMode 
                      ? 'bg-[#1b2a47]/90 hover:bg-[#23365a] text-slate-100 border-blue-500/30 shadow-md backdrop-blur-md' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-500 shadow-md'
                  } ${isAuthLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isAuthLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin text-white" /> Connecting...</>
                  ) : (
                    <>
                      <GoogleLogo className="w-4 h-4" />
                      Sign in with Google
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleGuestSignIn}
                  disabled={isAuthLoading}
                  className={`w-full flex items-center justify-center gap-2.5 py-3.5 px-5 rounded-2xl font-semibold transition-all active:scale-[0.98] text-sm border ${
                    isDarkMode 
                      ? 'bg-[#121c30]/90 hover:bg-[#18253f] border-slate-700/60 text-slate-300 hover:text-slate-100 backdrop-blur-md shadow-sm' 
                      : 'bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-700'
                  }`}
                >
                  <User className="w-4 h-4 text-blue-400" />
                  Continue as Guest (Skip Sign In)
                </button>
              </div>
            </div>

            {/* Developer Tag below auth card */}
            <div className="w-full flex flex-col items-center justify-center mt-8 relative z-10 animate-float-up" style={{animationDelay: '150ms', animationFillMode: 'both'}}>
               <span className={`text-[11px] font-semibold uppercase tracking-widest mb-3 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Developed by Ali Kassem</span>
               <div className="flex gap-3">
                 <a href="https://ali-kassem-portfolio-io.vercel.app/" target="_blank" rel="noopener noreferrer" className={`p-2.5 rounded-full transition-all hover:scale-110 border backdrop-blur-sm ${isDarkMode ? 'bg-slate-900/50 border-slate-700/50 text-emerald-400 hover:bg-emerald-600 hover:text-white' : 'bg-white/50 border-slate-300/50 text-emerald-600 hover:bg-emerald-600 hover:text-white shadow-sm'}`} title="Portfolio Website">
                   <Globe className="w-[18px] h-[18px]" />
                 </a>
                 <a href="https://github.com/Ali-Kassem-AK" target="_blank" rel="noopener noreferrer" className={`p-2.5 rounded-full transition-all hover:scale-110 border backdrop-blur-sm ${isDarkMode ? 'bg-slate-900/50 border-slate-700/50 text-slate-300 hover:bg-slate-800 hover:text-white' : 'bg-white/50 border-slate-300/50 text-slate-600 hover:bg-white hover:text-slate-900 shadow-sm'}`} title="GitHub Profile">
                   <Github className="w-[18px] h-[18px]" />
                 </a>
                 <a href="https://www.linkedin.com/in/ali-kassem-7224bb244" target="_blank" rel="noopener noreferrer" className={`p-2.5 rounded-full transition-all hover:scale-110 border backdrop-blur-sm ${isDarkMode ? 'bg-slate-900/50 border-slate-700/50 text-blue-400 hover:bg-[#0A66C2] hover:text-white' : 'bg-white/50 border-slate-300/50 text-blue-600 hover:bg-[#0A66C2] hover:text-white shadow-sm'}`} title="LinkedIn Profile">
                   <Linkedin className="w-[18px] h-[18px]" />
                 </a>
               </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      style={{ height: visualViewportHeight ? `${visualViewportHeight}px` : undefined }}
      className={`xare-app relative h-[100dvh] w-screen overflow-hidden flex flex-col transition-colors duration-300 ${isDarkMode ? 'bg-[#030407] text-slate-50' : 'bg-[#f8fafc] text-slate-900'}`}
    >
      <GoogleStyles />

      {showLimitsPopup && (
        <div className={`fixed inset-0 z-[100] flex overflow-y-auto chat-scroll p-4 sm:p-8 animate-overlay ${isDarkMode ? 'bg-[#030407]/95 backdrop-blur-sm' : 'bg-slate-900/40 backdrop-blur-sm'}`}>
          <div className={`m-auto relative w-full max-w-3xl p-5 sm:p-10 rounded-[2.5rem] shadow-2xl animate-float-up ${isDarkMode ? 'bg-[#070911] border border-slate-800' : 'bg-white border border-slate-200'}`}>
            
            <div className="flex flex-col items-center mb-6 mt-1">
              <div className="flex items-center justify-center mb-4">
                {/* ========================================== */}
                {/* 4. LOGO INSTANCE: Welcome / Limits Popup */}
                {/* ========================================== */}
                <XareLogo 
                  className="w-20 h-20 animate-pulse" 
                  style={{ animationDuration: '4s' }} 
                  scale={3.3} 
                  x="-11%"
                  y="35%"
                  isDarkMode={true} 
                />
              </div>
              <h2 className={`text-2xl sm:text-3xl font-bold text-center tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Welcome to Xare!</h2>
              <p className={`text-sm sm:text-base text-center mt-2.5 leading-relaxed max-w-2xl mx-auto ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>We're thrilled to have you. Here is a quick overview of your daily limits to get you started.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
              <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-3">
                  <ImageIcon className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                  <span className={`text-[14px] font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>Image Generation</span>
                </div>
                <span className={`text-[11px] font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-sm`}>Unlimited</span>
              </div>

              <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-3">
                  <Globe className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                  <span className={`text-[14px] font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>Web Search</span>
                </div>
                <span className={`text-[11px] font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-sm`}>Unlimited</span>
              </div>

              <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-3">
                  <FileText className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                  <span className={`text-[14px] font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>File Uploads</span>
                </div>
                <span className={`text-[11px] font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-sm`}>Unlimited</span>
              </div>

              <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-3">
                  <AudioLines className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                  <div className="flex flex-col">
                     <span className={`text-[14px] font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>Live Voice Calls</span>
                     <span className={`text-[10px] font-medium mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>English language only</span>
                  </div>
                </div>
                <span className={`text-[11px] font-bold px-3 py-1.5 rounded-lg ${isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-600 shadow-sm'}`}>5 Mins / Day</span>
              </div>

              <div className={`md:col-span-2 flex items-center justify-between p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-3">
                  <Mic className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                  <span className={`text-[14px] font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>Voice Notes</span>
                </div>
                <span className={`text-[11px] font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-sm`}>Unlimited</span>
              </div>
            </div>

            <button 
              onClick={() => setShowLimitsPopup(false)} 
              disabled={popupTimer > 0}
              className={`w-full max-w-sm mx-auto py-3.5 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 text-[15px] ${
                popupTimer > 0 
                  ? (isDarkMode ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-slate-200 text-slate-400 cursor-not-allowed')
                  : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-[0.98] shadow-lg shadow-blue-500/25'
              }`}
            >
              {popupTimer > 0 ? (
                <>Please read carefully ({popupTimer}s) <Loader2 className="w-4 h-4 animate-spin" /></>
              ) : (
                <>Let's get started <CheckCircle className="w-4 h-4" /></>
              )}
            </button>
          </div>
        </div>
      )}

      <div className="flex h-full w-full relative z-10 overflow-hidden">
        
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-40 lg:hidden transition-opacity bg-black/20"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <aside
          style={{
            WebkitBackdropFilter: 'blur(24px) saturate(190%)',
            backdropFilter: 'blur(24px) saturate(190%)',
          }}
          className={`fixed lg:relative top-0 left-0 z-50 h-full flex flex-col border-r transition-all duration-300 ease-in-out shadow-[0_8px_32px_0_rgba(0,10,30,0.5)] flex-shrink-0 ${
            isSidebarOpen 
              ? 'w-[280px] lg:w-[260px] translate-x-0 opacity-100' 
              : 'w-0 -translate-x-full opacity-0 border-none overflow-hidden pointer-events-none'
          } ${isDarkMode ? 'bg-[#070e1c]/45 border-blue-400/20 text-slate-100' : 'bg-white/45 border-white/50 text-slate-800'}`}
        >
          <div className={`w-[280px] lg:w-[260px] h-full flex flex-col transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div className="p-3">
              <button onClick={() => setIsSidebarOpen(false)} className={`p-2.5 rounded-full transition-colors ${isDarkMode ? 'hover:bg-blue-900/30 text-slate-400' : 'hover:bg-slate-200/50 text-slate-600'}`} title="Close menu">
                <Menu className="w-5 h-5" />
              </button>
            </div>

            <div className="px-3 pb-2 pt-2 space-y-2">
              <button
                onClick={createNewChat}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-medium border ${isDarkMode ? 'bg-[#132240]/70 hover:bg-[#1a2d54]/90 text-blue-100 border-blue-500/30 backdrop-blur-md shadow-sm' : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-100'}`}
              >
                <Plus className="w-5 h-5" />
                New chat
              </button>


            </div>

            <div className="flex-1 overflow-y-auto mt-2 px-3 space-y-1 chat-scroll">
              <div className={`px-4 pb-2 text-xs font-semibold uppercase tracking-wider mt-4 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Recent</div>
              
              {[...chatHistory]
                .filter(chat => {
                  const hasUserMessages = chat.messages && chat.messages.some((m: any) => m.sender === 'user');
                  return hasUserMessages || chat.id === currentChatId;
                })
                .sort((a, b) => getLatestChatActivityTime(b) - getLatestChatActivityTime(a))
                .map(chat => (
                <button
                  key={chat.id}
                  onClick={() => switchChat(chat.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-left text-sm group ${
                    currentChatId === chat.id
                    ? (isDarkMode ? 'bg-blue-500/10 text-blue-400 font-medium' : 'bg-blue-600/10 text-blue-700 font-medium')
                    : (isDarkMode ? 'text-slate-300 hover:bg-slate-800/50' : 'text-slate-700 hover:bg-slate-100')
                  }`}
                >
                  <MessageSquare className={`w-4 h-4 flex-shrink-0 ${currentChatId === chat.id ? (isDarkMode ? 'text-blue-500' : 'text-blue-600') : (isDarkMode ? 'text-slate-500 group-hover:text-slate-400' : 'text-slate-400 group-hover:text-slate-500')}`} />
                  <span className="truncate">{chat.title}</span>
                </button>
              ))}
            </div>

            {/* Developer Social Links */}
            <div className={`px-4 py-3.5 border-t mt-auto flex items-center justify-between ${isDarkMode ? 'border-slate-800/60 bg-slate-900/10' : 'border-slate-200/80 bg-slate-50/50'}`}>
               <span className={`text-[11px] font-semibold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>By Ali Kassem</span>
               <div className="flex items-center gap-1.5">
                 <a href="https://ali-kassem-portfolio-io.vercel.app/" target="_blank" rel="noopener noreferrer" className={`p-1.5 rounded-lg transition-all ${isDarkMode ? 'text-slate-400 hover:bg-emerald-950 hover:text-emerald-400' : 'text-slate-500 hover:bg-emerald-50 hover:text-emerald-600'}`} title="Portfolio Website">
                    <Globe className="w-4 h-4" />
                 </a>
                 <a href="https://github.com/Ali-Kassem-AK" target="_blank" rel="noopener noreferrer" className={`p-1.5 rounded-lg transition-all ${isDarkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-900'}`} title="GitHub Profile">
                    <Github className="w-4 h-4" />
                 </a>
                 <a href="https://www.linkedin.com/in/ali-kassem-7224bb244" target="_blank" rel="noopener noreferrer" className={`p-1.5 rounded-lg transition-all ${isDarkMode ? 'text-slate-400 hover:bg-[#0A66C2] hover:text-white' : 'text-slate-500 hover:bg-blue-100 hover:text-[#0A66C2]'}`} title="LinkedIn Profile">
                    <Linkedin className="w-4 h-4" />
                 </a>
               </div>
            </div>

            {/* Bottom User Profile & Logout Section */}
            <div className={`p-3 border-t ${isDarkMode ? 'border-slate-800/60' : 'border-slate-200/80'}`}>
              <div className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl transition-all group ${isDarkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-100'}`}>
                 <div className="flex items-center gap-3 overflow-hidden">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-sm flex-shrink-0 ${isDarkMode ? 'bg-slate-800 text-slate-300 border border-slate-700/50' : 'bg-white text-slate-600 border border-slate-200'}`}>
                       <User className="w-4 h-4" />
                    </div>
                    <span className={`text-sm font-semibold truncate ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                       {currentUser.username}
                    </span>
                 </div>
                 <button
                   onClick={handleLogout}
                   className={`p-2 rounded-lg transition-all flex-shrink-0 opacity-70 group-hover:opacity-100 ${isDarkMode ? 'text-slate-400 hover:text-red-400 hover:bg-red-900/30' : 'text-slate-500 hover:text-red-600 hover:bg-red-50'}`}
                   title="Log Out"
                 >
                   <LogOut className="w-[18px] h-[18px]" />
                 </button>
              </div>
            </div>

          </div>
        </aside>

        <div className="flex-1 h-full relative z-10 flex flex-col min-w-0 transition-all duration-300">
          
          {isVoiceModeActive && (
            <div className={`absolute inset-0 z-50 flex flex-col items-center justify-center animate-overlay ${isDarkMode ? 'bg-[#020617]/95' : 'bg-slate-50/95'}`}>
              <div className="mb-10 w-full flex justify-center">
                <DeepgramOrb isDarkMode={isDarkMode} onClose={() => setIsVoiceModeActive(false)} />
              </div>
            </div>
          )}

          <header className="flex-none px-4 sm:px-6 py-4 flex justify-between items-center z-20 bg-transparent transition-colors duration-300">
            <div className="flex items-center gap-2 sm:gap-3 z-10 relative">
              {!isSidebarOpen && (
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className={`relative z-50 p-2.5 -ml-2 rounded-full transition-colors flex-shrink-0 ${isDarkMode ? 'hover:bg-slate-800/50 text-slate-400' : 'hover:bg-slate-200/50 text-slate-600'}`}
                  title="Open menu"
                >
                  <Menu className="w-5 h-5" />
                </button>
              )}
              <div 
                onClick={createNewChat}
                className="flex items-center justify-center ml-1 lg:ml-0 flex-shrink-0 mr-1.5 cursor-pointer hover:scale-105 active:scale-95 transition-transform"
                title="Create New Chat"
              >
                {/* ========================================== */}
                {/* 5. LOGO INSTANCE: Top Header Bar */}
                {/* ========================================== */}
                <XareLogo 
                  className="w-10 h-10 sm:w-12 sm:h-12 -ml-1" 
                  scale={4.0} 
                  x="-8%" 
                  isDarkMode={isDarkMode} 
                />
              </div>
              <div className="flex-shrink-0">
                <h1 className={`text-lg sm:text-xl font-bold tracking-tight leading-tight ${isDarkMode ? 'text-blue-400' : 'text-blue-900'}`}>
                  Xare
                </h1>
                <p className={`text-xs font-medium hidden sm:block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Always here to help</p>
              </div>
            </div>

            <div className="hidden md:flex flex-1 justify-center pointer-events-none mx-1 sm:mx-2 mt-1 lg:absolute lg:inset-x-0 lg:mx-auto lg:w-fit">
              <span
                className={`text-[26px] sm:text-[42px] font-normal tracking-wide whitespace-nowrap drop-shadow-md ${isDarkMode ? 'text-white' : 'text-slate-950'}`}
                style={{ fontFamily: "'Great Vibes', 'Allura', 'Alex Brush', cursive" }}
              >
                 Absolute Zero Cost
              </span>
            </div>

            <div className="flex z-10 flex-shrink-0 items-center gap-1.5 sm:gap-2">


              <div className={`flex items-center gap-0.5 sm:gap-1 mr-1 sm:mr-2 pr-1.5 sm:pr-3 border-r ${isDarkMode ? 'border-slate-700/60' : 'border-slate-300/60'}`}>
                <a href="https://ali-kassem-portfolio-io.vercel.app/" target="_blank" rel="noopener noreferrer" className={`p-1 sm:p-2 rounded-full transition-all hover:scale-110 ${isDarkMode ? 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-950/30' : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50'}`} title="Ali's Portfolio">
                  <Globe className="w-[15px] h-[15px] sm:w-[18px] sm:h-[18px]" />
                </a>
                <a href="https://github.com/Ali-Kassem-AK" target="_blank" rel="noopener noreferrer" className={`p-1 sm:p-2 rounded-full transition-all hover:scale-110 ${isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800/50' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'}`} title="Ali's GitHub">
                  <Github className="w-[15px] h-[15px] sm:w-[18px] sm:h-[18px]" />
                </a>
                <a href="https://www.linkedin.com/in/ali-kassem-7224bb244" target="_blank" rel="noopener noreferrer" className={`p-1 sm:p-2 rounded-full transition-all hover:scale-110 ${isDarkMode ? 'text-slate-400 hover:text-[#0A66C2] hover:bg-blue-900/20' : 'text-slate-500 hover:text-[#0A66C2] hover:bg-blue-50'}`} title="Ali's LinkedIn">
                  <Linkedin className="w-[15px] h-[15px] sm:w-[18px] sm:h-[18px]" />
                </a>
              </div>
              <ThemeToggleSwitch isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode} />
            </div>
          </header>

          <div 
            ref={chatContainerRef} 
            onScroll={handleChatScroll} 
            onWheel={handleWheel} 
            onTouchStart={handleTouchStart} 
            onTouchMove={handleTouchMove} 
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd} 
            className="flex-1 overflow-y-auto chat-scroll gpu-accelerated w-full relative z-10"
          >
            <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-8 pt-2">

              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center my-auto px-4 animate-float-up select-none">
                  <div 
                    onClick={createNewChat} 
                    className="cursor-pointer hover:scale-105 active:scale-95 transition-transform" 
                    title="Create New Chat"
                  >
                    <XareLogo className="w-16 h-16 sm:w-20 sm:h-20 mb-6 drop-shadow-2xl" scale={3.4} x="-8%" isDarkMode={isDarkMode} />
                  </div>
                  <h1 className={`text-2xl sm:text-4xl font-bold tracking-tight mb-3 ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                    What can I help with today?
                  </h1>
                  <p className={`text-sm sm:text-base max-w-md ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Ask questions, write code, analyze data, or generate images effortlessly.
                  </p>
                </div>
              )}

              {messages.map((msg) => (
                <ChatMessageItem
                  key={msg.id}
                  msg={msg}
                  isDarkMode={isDarkMode}
                  isStreaming={msg.id === streamingMessageId}
                  onRegenerate={handleRegenerateResponse}
                  onSwitchVersion={handleSwitchMessageVersion}
                  onEditPrompt={handleEditUserPrompt}
                  onSwitchToGeminiAPI={handleSwitchToGeminiAPI}
                  onSwitchToXareAPI={handleSwitchToXareAPI}
                />
              ))}

              {isLoading && activeLoadingChatId === currentChatId && (
                <div className="flex gap-4 justify-start items-start animate-float-up w-full">
                  <div className="hidden sm:flex items-center justify-center flex-shrink-0 mt-1 mr-1">
                    {/* ========================================== */}
                    {/* 7. LOGO INSTANCE: "Thinking" Avatar */}
                    {/* ========================================== */}
                    <XareLogo 
                      className="w-8 h-8 sm:w-9 sm:h-9" 
                      scale={3.4} 
                      x="-8%" 
                      isDarkMode={isDarkMode} 
                    />
                  </div>
                  
                  {isGeneratingImage ? (
                    <div className={`w-full max-w-md md:max-w-[500px] aspect-square rounded-2xl shadow-sm border p-5 flex flex-col relative overflow-hidden ${isDarkMode ? 'bg-[#18181b] border-slate-700/50' : 'bg-[#f8fafc] border-slate-200/60'}`}>
                      <span className="absolute top-5 left-5 text-[14.5px] font-bold tracking-wide animate-modern-glow z-10">
                        Creating image...
                      </span>
                      
                      <div className="absolute inset-0 flex items-center justify-center z-0 opacity-60">
                        <div className="absolute w-64 h-64 bg-blue-500/40 blur-[60px] rounded-full animate-morph" style={{ animationDuration: '6s' }} />
                        <div className="absolute w-64 h-64 bg-purple-500/40 blur-[60px] rounded-full animate-morph" style={{ animationDuration: '8s', animationDirection: 'reverse' }} />
                        <div className="absolute w-64 h-64 bg-emerald-500/30 blur-[60px] rounded-full animate-morph" style={{ animationDuration: '10s', animationDelay: '-2s' }} />
                      </div>

                      <div className="flex-1 flex items-center justify-center relative z-10">
                        <div className={`p-5 rounded-full backdrop-blur-md shadow-lg ${isDarkMode ? 'bg-black/40 text-slate-300' : 'bg-white/60 text-slate-600'}`}>
                           <ImageIcon className="w-10 h-10 animate-pulse" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div 
                      style={{ '--glow-sweep-speed': `${GLOW_ANIMATION_CONFIG.textGlowSweepSpeedSec}s` } as React.CSSProperties}
                      className="py-1.5 flex items-center gap-2.5"
                    >
                      <span className={`text-[15px] font-semibold tracking-wide animate-modern-glow ${
                        isDarkMode ? 'text-slate-300' : 'text-slate-600'
                      }`}>
                        {loadingPhase}
                      </span>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

          <div className={`flex-none relative w-full p-2 sm:p-4 z-20 pb-3 sm:pb-5 ${isDarkMode ? 'bg-[#030407]' : 'bg-[#f8fafc]'}`}>
            
            {suggestions.length > 0 && (!isLoading || activeLoadingChatId !== currentChatId) && (
                <div className="flex gap-2 max-w-5xl mx-auto mb-3 overflow-x-auto chat-scroll pb-1 scrollbar-hide pointer-events-auto px-1">
                {suggestions.map((sug, i) => (
                    <button 
                        key={i} 
                        onClick={() => { setInputValue(sug); setSuggestions([]); setTimeout(() => textareaRef.current?.focus(), 50); }}
                        className={`whitespace-nowrap px-4 py-2 rounded-full text-[13px] font-medium border shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0 ${isDarkMode ? 'bg-[#0c1324]/90 border-slate-700/60 text-blue-300 hover:bg-slate-800' : 'bg-white/95 border-slate-200/60 text-blue-600 hover:bg-slate-50'}`}
                    >
                        {sug}
                    </button>
                ))}
                </div>
            )}

            <div className="relative max-w-5xl mx-auto pointer-events-auto">
              
              {isRecording && (
                <div className={`absolute right-0 bottom-full mb-3 flex items-center gap-3 backdrop-blur-xl border px-5 py-2.5 rounded-full shadow-md animate-float-up cursor-pointer transition-colors group ${isDarkMode ? 'bg-[#0c1324]/90 border-slate-700/60 hover:bg-slate-800 text-slate-200' : 'bg-white/95 border-slate-200/60 hover:bg-slate-50 text-slate-700'}`}
                  onClick={cancelRecording}
                  title="Cancel Recording"
                >
                  <div className="flex items-center gap-[3px] h-4">
                    <div className="dynamic-wave" style={{ animationDelay: '0.0s, 0s' }} />
                    <div className="dynamic-wave" style={{ animationDelay: '0.2s, -0.6s' }} />
                    <div className="dynamic-wave" style={{ animationDelay: '0.4s, -1.2s' }} />
                    <div className="dynamic-wave" style={{ animationDelay: '0.1s, -1.8s' }} />
                    <div className="dynamic-wave" style={{ animationDelay: '0.3s, -2.4s' }} />
                  </div>
                  <span className="font-mono text-sm font-bold tracking-wider">
                    {formatTime(recordingTime)}
                  </span>
                  <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded-md transition-colors ${isDarkMode ? 'bg-slate-700 group-hover:bg-slate-600 text-slate-300' : 'bg-slate-200 group-hover:bg-slate-300 text-slate-600'}`}>Cancel</span>
                </div>
              )}

              <input type="file" accept="image/*" className="hidden" ref={imageInputRef} onChange={handleImageSelect} />
              <input type="file" accept="application/pdf" className="hidden" ref={documentInputRef} onChange={handleDocumentSelect} />

              <form 
                onSubmit={handleSendMessage}
                className={`relative flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-[2.5rem] border transition-all duration-300 w-full ${
                  isDarkMode 
                    ? 'bg-[#070e1c] border-blue-500/30 shadow-[0_8px_32px_0_rgba(2,10,35,0.85)] focus-within:border-cyan-400/60' 
                    : 'bg-white border-slate-200/90 shadow-xl focus-within:border-blue-400'
                }`}
              >
              {/* Integrated + Attachment Button */}
              <div className="relative flex-shrink-0" ref={attachMenuRef}>
                {showAttachMenu && (
                  <div 
                    className={`absolute bottom-full left-0 mb-3 w-56 sm:w-64 p-2 rounded-2xl border shadow-2xl z-50 animate-float-up ${
                      isDarkMode 
                      ? 'bg-[#0c1324] border-slate-700/80 text-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.95)]' 
                      : 'bg-white border-slate-200 text-slate-900 shadow-2xl'
                    }`}
                  >
                    {activeSubMenu ? (
                      <>
                        <div className="flex items-center gap-2 pb-2 mb-2 border-b border-white/10 px-1">
                          <button
                            type="button"
                            onClick={() => setActiveSubMenu(null)}
                            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-xs font-semibold uppercase tracking-wider">{activeSubMenu.label}</span>
                        </div>
                        {(activeSubMenu.subItems || activeSubMenu.subOptions || []).map((sub, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-left w-full ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                            onClick={() => {
                              setShowAttachMenu(false);
                              setActiveSubMenu(null);
                              setActiveTool({ icon: activeSubMenu.icon, label: `${activeSubMenu.label} (${sub.label})`, prompt: sub.prompt, placeholder: sub.placeholder, action: sub.action || activeSubMenu.action });
                              setTimeout(() => textareaRef.current?.focus(), 50);
                            }}
                          >
                            <span className="text-[13px] font-medium">{sub.label}</span>
                          </button>
                        ))}
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-left w-full ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                          onClick={() => { setShowAttachMenu(false); imageInputRef.current?.click(); }}
                        >
                          <ImageIcon className="w-[16px] h-[16px] opacity-70" />
                          <span className="text-[13px] font-medium">Upload image</span>
                        </button>
                        
                        <button
                          type="button"
                          className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-left w-full ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                          onClick={() => { setShowAttachMenu(false); documentInputRef.current?.click(); }}
                        >
                          <FileText className="w-[16px] h-[16px] opacity-70" />
                          <span className="text-[13px] font-medium">Upload document</span>
                        </button>

                        <div className={`h-px my-1.5 mx-1 ${isDarkMode ? 'bg-white/10' : 'bg-slate-200'}`} />

                        {AI_PRESETS.map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-left w-full ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                            onClick={() => {
                              if (preset.hasSubMenu) {
                                setActiveSubMenu(preset);
                              } else {
                                setShowAttachMenu(false);
                                setActiveTool(preset);
                                setTimeout(() => textareaRef.current?.focus(), 50);
                              }
                            }}
                          >
                            <preset.icon className="w-[16px] h-[16px] opacity-70" />
                            <span className="text-[13px] font-medium">{preset.label}</span>
                            {preset.hasSubMenu && <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
                <button
                      type="button"
                      onClick={() => {
                        setShowAttachMenu(!showAttachMenu);
                        if (showAttachMenu) setActiveSubMenu(null);
                      }}
                      className={`p-2.5 sm:p-3 rounded-full transition-all flex items-center justify-center ${
                        showAttachMenu
                        ? (isDarkMode ? 'bg-slate-800 text-white border border-slate-700' : 'bg-slate-200 text-slate-800')
                        : (isDarkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100')
                      }`}
                      title="Add attachment or preset tool"
                    >
                      <Plus className={`w-5 h-5 transition-transform duration-300 ${showAttachMenu ? 'rotate-45' : 'rotate-0'}`} />
                    </button>
                  </div>

                  <div className="relative flex-1 flex flex-col justify-end min-w-0">
                    {activeTool && (
                      <div className="px-2 pt-1 pb-1 flex items-center animate-float-up">
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium border shadow-sm ${isDarkMode ? 'bg-slate-800/80 text-slate-200 border-slate-700/60' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                          <activeTool.icon className="w-3.5 h-3.5" />
                          {activeTool.label}
                          <button
                            type="button"
                            onClick={() => setActiveTool(null)}
                            className="ml-1 opacity-60 hover:opacity-100 transition-opacity flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}

                    {uploadProgress !== null && (
                      <div className="px-3 pt-2 pb-1.5 border-b border-blue-500/20 bg-blue-500/5 rounded-t-xl">
                        <div className="flex items-center justify-between text-xs text-blue-400 mb-1 font-medium">
                          <span className="flex items-center gap-1.5 truncate max-w-[80%]">
                            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
                            Uploading {uploadingFileName || 'file'} directly to secure storage...
                          </span>
                          <span className="font-semibold text-blue-300">{uploadProgress}%</span>
                        </div>
                        <div className="w-full bg-slate-700/50 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400 h-full rounded-full transition-all duration-150 ease-out" 
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {pendingAttachment && (
                      <div className="px-2 pt-2 pb-1">
                        <div className={`relative inline-flex items-center gap-2 p-1.5 pr-3 rounded-xl border shadow-sm group ${isDarkMode ? 'bg-slate-800/60 border-slate-700/80' : 'bg-slate-100 border-slate-200'}`}>
                          {pendingAttachment.type === 'image' ? (
                            <img src={pendingAttachment.data} alt="preview" className={`h-10 w-10 object-cover rounded-lg border ${isDarkMode ? 'border-slate-700' : 'border-slate-300'}`} />
                          ) : (
                            <div className={`h-10 w-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${isDarkMode ? 'bg-blue-900/20 border-blue-800/50 text-blue-400' : 'bg-blue-50 border-blue-100 text-blue-600'}`}>
                              <FileText className="w-5 h-5" />
                            </div>
                          )}
                          <div className="flex flex-col max-w-[160px] sm:max-w-[220px]">
                            <span className={`text-[12px] font-medium truncate ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{pendingAttachment.name}</span>
                            <span className="text-[10px] text-slate-400">
                              {pendingAttachment.size ? (pendingAttachment.size / (1024 * 1024)).toFixed(1) + ' MB' : ''}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPendingAttachment(null)}
                            className="ml-1 w-5 h-5 bg-slate-700 hover:bg-slate-600 text-white rounded-full flex items-center justify-center transition-all shadow-sm"
                            title="Remove attachment"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}
                    
                    <textarea
                      ref={textareaRef}
                      value={inputValue}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      onPaste={handlePaste}
                      onFocus={handleTextareaFocus}
                      dir="auto"
                      placeholder={activeTool ? activeTool.placeholder : "Ask Xare anything..."}
                      className={`w-full max-h-48 min-h-[38px] sm:min-h-[46px] px-2 sm:px-3 bg-transparent outline-none resize-none text-[15px] ${activeTool || pendingAttachment ? 'pt-1 pb-2' : 'py-2 sm:py-3'} ${isDarkMode ? 'text-slate-100 placeholder-slate-400' : 'text-slate-900 placeholder-slate-500'}`}
                      rows={1}
                    />
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 pr-1">
                    {!inputValue.trim() && !pendingAttachment && !isRecording && (
                      <button
                        type="button"
                        onClick={() => {
                          if (dailyUsage.voiceCallSeconds >= 300) {
                            showLocalBotMessage("⚠️ **Usage Limit Reached**\nYou have reached your daily limit of 5 minutes for live calls.");
                          } else {
                            setIsVoiceModeActive(true);
                          }
                        }}
                        title="Start Live Voice Call"
                        className={`p-2.5 sm:p-3 rounded-full transition-all flex items-center justify-center ${
                          isDarkMode ? 'text-purple-400 hover:bg-purple-950/40 hover:text-purple-300' : 'text-purple-600 hover:bg-purple-50'
                        }`}
                      >
                        <AudioLines className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2.2} />
                      </button>
                    )}

                    {inputValue.trim() || pendingAttachment ? (
                      <button
                        type="submit"
                        disabled={isLoading}
                        title="Send Message"
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-all shadow-lg shadow-blue-950/50 active:scale-95 disabled:opacity-50 flex-shrink-0 cursor-pointer"
                      >
                        <ArrowUp className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => isRecording ? stopRecordingAndSend() : startRecording()}
                        title={isRecording ? "Send Voice Note" : "Record Voice Note"}
                        className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all shadow-md active:scale-95 flex-shrink-0 ${
                          isRecording
                          ? 'bg-blue-600 text-white animate-pulse'
                          : (isDarkMode ? 'bg-slate-800/80 text-slate-300 border border-slate-700/60 hover:bg-slate-700/80' : 'bg-slate-200/80 text-slate-700 hover:bg-slate-300')
                        }`}
                      >
                        {isRecording ? <ArrowUp className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" /> : <Mic className="w-5 h-5" />}
                      </button>
                    )}
                  </div>
                </form>
              </div>

              <div className={`text-center mt-4 text-[11px] font-medium pointer-events-auto ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Xare is AI and can make mistakes. Check important info.
              </div>
          </div>
        </div>
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Xare ErrorBoundary caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-[100dvh] w-screen flex flex-col items-center justify-center bg-[#030407] text-white p-6 text-center">
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl max-w-md w-full space-y-4 backdrop-blur-xl">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto border border-blue-500/20">
              <XareLogo className="w-8 h-8" scale={2.5} x="-8%" isDarkMode={true} />
            </div>
            <h2 className="text-xl font-bold text-slate-100">Session Sync Recovery</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              {this.state.error?.message || 'Session updating. Click below to return to your chats.'}
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={() => {
                  window.location.reload();
                }}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/25 active:scale-[0.98] text-sm"
              >
                Return to Chat
              </button>
              <button
                onClick={() => {
                  localStorage.clear();
                  sessionStorage.clear();
                  window.location.reload();
                }}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-medium rounded-xl transition-all text-xs"
              >
                Reset Session Cache
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function WrappedApp() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
