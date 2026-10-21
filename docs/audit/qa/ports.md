# QA Checklist — Ports & Chaos Proxy

| Dimension          | Scenario                  | Verification Steps                                                            | Status |
| ------------------ | ------------------------- | ----------------------------------------------------------------------------- | :----: |
| **Happy Path**     | Listening ports list      | lsof/netstat correctly identifies listening ports and binding processes       |  [x]   |
| **Chaos Proxy**    | Tokio TCP chaos forwarder | Starts on 127.0.0.1:<port>, injects latency/drops, tears down cleanly on exit |  [x]   |
| **Missing CLI**    | Missing utilities         | Degrades gracefully if helper CLI is unavailable                              |  [x]   |
| **Offline**        | Network down              | Local port inspection succeeds entirely locally                               |  [x]   |
| **Prod Guard**     | Killing port process      | Destructive terminate process action requires confirmation                    |  [x]   |
| **Cancel Confirm** | Cancel kill               | Terminating port cancelled leaves process and socket intact                   |  [x]   |
| **Theme**          | Light + Dark              | Port pills, status indicators, and process tags legible in light/dark         |  [x]   |
