# E2E Test Infra: Xare AI Ephemeral File Transport Architecture

## Test Philosophy
- Opaque-box, requirement-driven verification derived from `ORIGINAL_REQUEST.md`.
- No assumptions on internal temporary storage or backend server states.
- 4-tier systematic approach: Category-Partition, Boundary Value Analysis (BVA), Pairwise Combinatorial, and Real-World Multimodal Workload Testing.
- Pass/Fail Semantics: 100% test pass rate across all automated suites, zero unhandled promise rejections, zero leaks of private credentials, zero residual files after test execution.

---

## Feature Inventory & Test Mapping

| # | Feature | Requirement Source | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Real-World) |
|---|---|---|:---:|:---:|:---:|:---:|
| F1 | Phase 0 Feasibility Gate Proof | R1 Feasibility | 5 tests | 5 tests | ✓ | ✓ |
| F2 | Codebase & n8n Graph Integrity | R2 Auditing | 5 tests | 5 tests | ✓ | ✓ |
| F3 | Ephemeral File Transport | R3 $0 Transport | 5 tests | 5 tests | ✓ | ✓ |
| F4 | Programmatic Cleanup (<500ms) | R3 Privacy & Deletion | 5 tests | 5 tests | ✓ | ✓ |
| F5 | T0 Background Pre-Upload | R3 / R4 UX Latency | 5 tests | 5 tests | ✓ | ✓ |
| F6 | Mobile Memory Safety (<=5MB Base64) | R4 2GB RAM Stability | 5 tests | 5 tests | ✓ | ✓ |
| F7 | Concurrency (2, 3, 5 files) | R4 Concurrency | 5 tests | 5 tests | ✓ | ✓ |
| F8 | Zero Secret Exposure | R5 Security | 5 tests | 5 tests | ✓ | ✓ |
| F9 | Live Multimodal n8n Execution | R5 E2E Pipelines | 5 tests | 5 tests | ✓ | ✓ |

---

## Test Architecture

- **Primary Test Runner**: Node.js automated test runner `tests/zero_cost_transport.test.cjs`.
  - Invocation: `node tests/zero_cost_transport.test.cjs`
  - Pass/Fail: Exit code 0 if all 18 tests pass; non-zero on any failure.
- **Latency & Ingress Health Runner**: `tests/measure_n8n_latency.cjs`.
  - Invocation: `node tests/measure_n8n_latency.cjs`
- **Secret Scanner**: `scripts/scan_secrets.cjs`.
  - Invocation: `node scripts/scan_secrets.cjs`
- **Production Build Verifier**:
  - Invocation: `npm run build`
  - Output check: `dist/index.html` and bundled assets generated cleanly without TypeScript/Vite errors.
- **Directory Layout**:
  - `tests/`: Automated regression test scripts and mock files.
  - `scripts/`: Verification and auditing scripts.
  - `n8n/`: Authoritative workflow definitions (`Xare AI.json`).

---

## Real-World Application Scenarios (Tier 4)

| # | Scenario | Features Exercised | Complexity |
|---|---|---|---|
| S1 | High-resolution smartphone photo upload (8 MB JPEG) with complex visual query | F3, F5, F6, F9 | High |
| S2 | Multi-page research paper PDF (15 MB) with extraction prompt | F3, F5, F6, F9 | High |
| S3 | Voice memo audio note (5 MB WAV) transcribed & analyzed | F3, F5, F6, F9 | Medium |
| S4 | Rapid consecutive file drops (3 files in 2 seconds) | F5, F7 | High |
| S5 | Immediate post-inference deletion verification (HTTP 404 confirmation) | F4, F8 | High |

---

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: >= 5 tests per major feature area (Image, PDF, Audio, Ingress, Egress).
- **Tier 2 (Boundary & Corner Cases)**: Edge cases (0-byte, 5 MB boundary, 50 MB limit, >50 MB rejection, Arabic/Unicode names, whitespace names).
- **Tier 3 (Cross-Feature Combinations)**: Upload + Typing concurrency; Multi-file concurrency (2, 3, 5 files); Failover to fallback providers.
- **Tier 4 (Real-World Multimodal)**: End-to-end execution through live n8n webhook for Image, PDF, and Audio.
- **Total Minimum Target**: 18 automated tests passing at 100% with sub-second verification.
