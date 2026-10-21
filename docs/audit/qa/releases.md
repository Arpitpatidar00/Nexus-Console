# QA Checklist — Releases & Fastlane

| Dimension          | Scenario                 | Verification Steps                                                            | Status |
| ------------------ | ------------------------ | ----------------------------------------------------------------------------- | :----: |
| **Happy Path**     | Release config detection | Detects pubspec.yaml, package.json, and Fastfile lanes (beta, release, etc.)  |  [x]   |
| **Missing CLI**    | fastlane missing         | Shows configured lanes and project versions even if fastlane is not installed |  [x]   |
| **Offline**        | Disconnected             | Inspects local project files without remote App Store / Play API calls        |  [x]   |
| **Prod Guard**     | Production lane trigger  | Building/releasing to production lanes requires confirmation                  |  [x]   |
| **Cancel Confirm** | Dismiss release prompt   | Canceling leaves release state unchanged                                      |  [x]   |
| **Theme**          | Light + Dark             | Lane buttons, version badges, build tags readable in light and dark mode      |  [x]   |
