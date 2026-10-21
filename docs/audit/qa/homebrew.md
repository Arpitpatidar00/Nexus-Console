# QA Checklist — Homebrew & Packages

| Dimension          | Scenario             | Verification Steps                                                              | Status |
| ------------------ | -------------------- | ------------------------------------------------------------------------------- | :----: |
| **Happy Path**     | Formula / Cask list  | Run app; packages list renders with versions, pinned status, and outdated flags |  [x]   |
| **Missing CLI**    | Brew not in PATH     | Simulating missing brew returns friendly error banner, no panic                 |  [x]   |
| **Offline**        | Network disconnected | Installed packages display from local kegs without hanging                      |  [x]   |
| **Prod Guard**     | Production lock      | Destructive actions require native confirmation                                 |  [x]   |
| **Cancel Confirm** | Cancel dialog        | Dismissing native confirmation sheet results in 0 state change                  |  [x]   |
| **Theme**          | Light + Dark         | Text, badges, and table rows meet WCAG contrast in both themes                  |  [x]   |
