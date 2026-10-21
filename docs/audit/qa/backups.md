# QA Checklist — Backups & Snapshots

| Dimension          | Scenario                  | Verification Steps                                                   | Status |
| ------------------ | ------------------------- | -------------------------------------------------------------------- | :----: |
| **Happy Path**     | APFS & Database snapshots | Lists local APFS snapshots and database dump files with timestamps   |  [x]   |
| **Missing CLI**    | tmutil / apfs missing     | Graceful fallback when APFS features unavailable                     |  [x]   |
| **Offline**        | Disconnected              | Entirely local operation                                             |  [x]   |
| **Prod Guard**     | Restore / Delete snapshot | Restoring or deleting snapshots gates behind native confirmation     |  [x]   |
| **Cancel Confirm** | Dismiss restore           | Canceling snapshot restore leaves current database and volume intact |  [x]   |
| **Theme**          | Light + Dark              | Snapshot timeline and size tags contrast checked                     |  [x]   |
