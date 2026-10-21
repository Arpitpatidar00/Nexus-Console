# QA Checklist — Domains, SSL & RDAP

| Dimension            | Scenario                    | Verification Steps                                                            | Status |
| -------------------- | --------------------------- | ----------------------------------------------------------------------------- | :----: |
| **Happy Path**       | DNS, SSL, RDAP, propagation | Resolves DNS records, inspects SSL certificate validity, queries RDAP         |  [x]   |
| **Missing CLI**      | dig / openssl missing       | Gracefully handles missing CLI with error report                              |  [x]   |
| **Offline**          | Network down                | Timeouts and DNS failures return friendly error state                         |  [x]   |
| **Injection Safety** | Malformed domain names      | Strict domain sanitizer rejects shell characters and metacharacters           |  [x]   |
| **Cancel Confirm**   | Propagation stop            | Cancelling active multi-resolver queries cancels requests cleanly             |  [x]   |
| **Theme**            | Light + Dark                | SSL expiry status pills (valid, expiring soon, expired) legible in light/dark |  [x]   |
