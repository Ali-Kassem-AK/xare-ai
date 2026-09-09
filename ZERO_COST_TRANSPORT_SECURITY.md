# XARE AI — ZERO-COST FILE TRANSPORT SECURITY SPECIFICATION

## 1. Security & Threat Modeling

Transporting user files over public web services introduces critical security requirements around data privacy, credential exposure, collision attacks, and post-processing retention.

---

## 2. Security Controls & Mitigations

### 2.1 Zero Client-Side Secret Leakage
- **Finding**: The browser client bundle contains **0 secret keys**, 0 service-role credentials, 0 AWS access keys, and 0 payment tokens.
- **Verification**: Tested via automated static analysis in `TEST-016` (0 secret substrings found in `dist/assets/*.js`).

### 2.2 Ephemeral Lifecycle & Immediate Post-Processing Deletion
- **Risk**: User documents or photos lingering on public storage endpoints.
- **Mitigation**:
  - `kappa.lol` generates a cryptographically random delete key on upload (e.g. `key: "5Q0dX12Sn3FDwrpr"`).
  - The client stores this delete key in the local state.
  - When n8n finishes AI processing and the response is rendered in `completeBotResponse()`, the frontend calls `deleteTemporaryFile(deleteUrl)`.
  - The service responds with `{"success": true}`, and subsequent requests to the file URL yield **HTTP 404 Not Found**.
  - If a user cancels the attachment before sending, the file is immediately purged from the server.

### 2.3 Collision Resistance & Path Sanitization
- **Risk**: File overwrites or directory traversal attacks.
- **Mitigation**:
  - `kappa.lol` assigns unguessable 6-character random alphanumeric object identifiers (e.g. `mHKQit`).
  - Filenames provided by users do not influence the server-side storage path, preventing directory traversal (`../`) and shell injection.
  - Authentic file extensions (`.png`, `.pdf`, `.wav`) are verified to ensure downstream MIME parsers receive valid types.

### 2.4 Payload Validation & Abuse Prevention
- **Client-Side Hard Ceiling**: Files exceeding 50 MB are blocked instantly before any network call (`TEST-009`).
- **MIME Verification**: Both file magic bytes and explicit extensions are validated in the frontend and canonicalized in n8n's `Identify Media Type`.
