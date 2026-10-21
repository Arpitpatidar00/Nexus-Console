# QA Checklist — Network & Hosts

| Dimension          | Scenario                         | Verification Steps                                                                | Status |
| ------------------ | -------------------------------- | --------------------------------------------------------------------------------- | :----: |
| **Happy Path**     | Hosts manager & nettop bandwidth | Parses /etc/hosts entries in managed block; nettop measures per-process bandwidth |  [x]   |
| **Missing CLI**    | scutil / nettop missing          | Handles tool absence gracefully with fallback info                                |  [x]   |
| **Offline**        | Disconnected                     | Inspects local interfaces and hosts file completely offline                       |  [x]   |
| **Prod Guard**     | Writing /etc/hosts               | Changes to hosts file require root/admin privilege and confirmation               |  [x]   |
| **Cancel Confirm** | Dismiss hosts save               | Canceling leaves /etc/hosts untouched                                             |  [x]   |
| **Theme**          | Light + Dark                     | Bandwidth bar charts and host entry toggles clear in light/dark                   |  [x]   |
