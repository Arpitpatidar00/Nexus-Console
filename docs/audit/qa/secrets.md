# QA Checklist — Secrets & Redaction

| Dimension          | Scenario                       | Verification Steps                                                           | Status |
| ------------------ | ------------------------------ | ---------------------------------------------------------------------------- | :----: |
| **Happy Path**     | Environment variable discovery | Scans local repo .env files, redacts sensitive keys (API_KEY, SECRET, TOKEN) |  [x]   |
| **Missing CLI**    | Independent                    | Operates via Rust filesystem reads without external processes                |  [x]   |
| **Offline**        | Disconnected                   | Entirely offline local inspection                                            |  [x]   |
| **Prod Guard**     | Reveal secret values           | Requires user interaction to unmask values                                   |  [x]   |
| **Cancel Confirm** | Cancel edit                    | Canceling secret file edit preserves original file on disk                   |  [x]   |
| **Theme**          | Light + Dark                   | Masked/revealed tokens readable with proper password glyph styling           |  [x]   |
