# QA Checklist — Mac Clean

| Dimension          | Scenario             | Verification Steps                                                                 | Status |
| ------------------ | -------------------- | ---------------------------------------------------------------------------------- | :----: |
| **Happy Path**     | Space scan           | Scans developer caches (Xcode DerivedData, npm, cargo, brew) with exact byte sizes |  [x]   |
| **Missing CLI**    | Missing directories  | Non-existent cache directories are omitted without errors                          |  [x]   |
| **Offline**        | Completely offline   | Scans local filesystem directly without network dependence                         |  [x]   |
| **Prod Guard**     | Cleaning caches      | Trash actions prompt with exact path and reclaimed space                           |  [x]   |
| **Cancel Confirm** | Dismiss clean dialog | Canceling leaves all cache files untouched on disk                                 |  [x]   |
| **Theme**          | Light + Dark         | Donut charts, storage breakdown progress bars readable in light/dark               |  [x]   |
