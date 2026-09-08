# STORAGE MIGRATION TEST REPORT

| Test ID | Test Name | Type | Expected | Actual | Status | Duration | Notes |
|---|---|---|---|---|---|---|---|
| TEST-001 | Filename with spaces | Unit | my_quarterly_report_2026.pdf | my_quarterly_report_2026.pdf | **PASS** | 0.1ms | — |
| TEST-002 | Filename with Arabic characters (safe ascii normalization) | Security/Unit | sanitized ascii string with .pdf | ____________________________.pdf | **PASS** | 0.0ms | Dangerous non-ascii codepoints converted to safe underscores |
| TEST-003 | Path traversal sequence prevention | Security | Traversal neutralized | _.._.._etc_passwd.jpg | **PASS** | 0.0ms | Sanitized to: _.._.._etc_passwd.jpg |
| TEST-004 | File ID collision resistance (10,000 iterations) | Stress/Unit | 10000 unique IDs | 10000 unique IDs | **PASS** | 6.4ms | Zero collisions across 10,000 consecutive generations |
| TEST-005 | Oversized file rejection (>50MB) | Validation | Rejection | Rejection | **PASS** | 0.0ms | — |
| TEST-006 | S3-compatible Presigned PUT URL generation | Integration | Valid AWS Signature V4 URL | Signed PUT URL generated | **PASS** | 19.9ms | — |
| TEST-007 | S3-compatible Presigned GET URL generation (2hr TTL) | Integration | Valid AWS Signature V4 GET URL | Signed GET URL generated | **PASS** | 1.6ms | — |
| TEST-008 | Identify Media Type - PDF classification | Unit | pdf | pdf | **PASS** | 0.2ms | — |
| TEST-009 | Identify Media Type - Image classification via MIME | Unit | image | image | **PASS** | 0.0ms | — |
| TEST-010 | Identify Media Type - Audio classification via .wav | Unit | audio | audio | **PASS** | 0.2ms | — |
| TEST-011 | Malformed S3 query diagnostic detection | Unit | warning assigned | Presigned storage URL appears to have malformed AWS/S3 query parameters. | **PASS** | 0.0ms | — |
| TEST-012 | N8N Workflow Connection Graph Integrity | Verification | 0 missing nodes | 0 missing nodes | **PASS** | 2.1ms | — |
| TEST-013 | Live E2E Image Pipeline via n8n Webhook | E2E/Integration | HTTP 200 with AI analysis | HTTP 200 (936 bytes) | **PASS** | 9324.9ms | Vision model successfully downloaded remote URL and analyzed image |
| TEST-014 | Live E2E PDF Pipeline via n8n Webhook | E2E/Integration | HTTP 200 with PDF analysis | HTTP 200 (316 bytes) | **PASS** | 27602.8ms | Document agent successfully analyzed PDF |
