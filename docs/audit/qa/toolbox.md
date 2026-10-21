# QA Checklist — Toolbox

| Dimension          | Scenario                      | Verification Steps                                                     | Status |
| ------------------ | ----------------------------- | ---------------------------------------------------------------------- | :----: |
| **Happy Path**     | Encoding/decoding & utilities | Base64, URL encoding, JSON format, timestamp conversion work correctly |  [x]   |
| **Missing CLI**    | Independent                   | Operates entirely in pure client logic without system dependencies     |  [x]   |
| **Offline**        | Disconnected                  | Full offline operation guaranteed                                      |  [x]   |
| **Prod Guard**     | Non-destructive               | Read-only conversion utilities without side effects                    |  [x]   |
| **Cancel Confirm** | Clear inputs                  | Resetting inputs clears state cleanly                                  |  [x]   |
| **Theme**          | Light + Dark                  | Input textareas and output blocks contrast checked                     |  [x]   |
