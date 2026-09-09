# XARE AI — ZERO-COST TRANSPORT PROVIDER COMPARISON MATRIX

## 1. Multi-Provider Assessment Matrix

The table below summarizes all tested candidate providers against the strict requirements of Xare AI:

| Provider | Financial Model | Credit/Debit Card Required? | Browser CORS (`ACAO`) | Server Download Viability | Max File Size | Deletion Support | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **kappa.lol** | **100% Free** | **NO** | **YES (`*`)** | **YES (HTTP 200)** | **512 MB** | **YES (`/api/delete`)** | **SELECTED WINNER** |
| **uguu.se** | 100% Free | NO | NO (No ACAO on POST) | YES (HTTP 200) | 100 MB | Auto-expires (3h) | Candidate (CORS blocked) |
| **catbox.moe** | 100% Free | NO | NO (Blocked by UA) | Blocked (412) | 200 MB | Manual | Disqualified (UA filters) |
| **tmpfiles.org** | 100% Free | NO | YES (`*`) | NO (Returns HTML) | 10 GB | Auto-expires | Disqualified (HTML interstitial) |
| **filebin.net** | 100% Free | NO | YES (`*`) | NO (Warning page) | None | Manual | Disqualified (Warning interstitial) |
| **pixeldrain** | Freemium | Requires API Key | N/A | NO (HTTP 401) | 10 GB | N/A | Disqualified (Requires API auth) |
| **0x0.st** | 100% Free | NO | N/A | NO (HTTP 503) | 512 MB | Auto-expires | Disqualified (Service halted) |
| **Cloudflare R2** | Paid / Freemium | **YES (Mandatory Card)**| Configurable | YES | 5 TB | S3 Lifecycle | Disqualified (Card required) |
| **Backblaze B2** | Paid / Freemium | **YES (Card or 6mo kill)**| Configurable | YES | 5 TB | S3 Lifecycle | Disqualified (Card/Inactivity purge) |
| **Supabase Storage**| Freemium | Inactivity Pausing | Configurable | YES | 50 MB | Custom | Disqualified (Excised from repo) |
| **Hugging Face FS**| Free Container | NO | N/A | Ephemeral | Container disk| Ephemeral | Disqualified (User mandate) |

---

## 2. Decision Logic

1. **Why kappa.lol Won**:
   - Genuinely zero-cost with no payment information ever collected.
   - Built-in `Access-Control-Allow-Origin: *` allows direct browser uploads up to 50MB, bypassing the 4.5MB Vercel serverless limit.
   - Open HTTP GET access without Cloudflare Turnstile bot checks ensures n8n downloads raw bytes every time.
   - Programmatic deletion key allows instant privacy cleanup once AI inference completes.

2. **Why Others Failed**:
   - R2/B2 require credit cards or billing profiles.
   - tmpfiles and filebin return HTML pages instead of raw binary streams when requested via automated HTTP GET.
   - Uguu lacks browser CORS headers on upload.
   - Catbox filters browser User-Agents.
