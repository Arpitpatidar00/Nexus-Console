# QA Checklist — Devices (iOS Simulators & Android Emulators)

| Dimension          | Scenario                    | Verification Steps                                                       | Status |
| ------------------ | --------------------------- | ------------------------------------------------------------------------ | :----: |
| **Happy Path**     | Device listing & launch     | Lists available simulators via simctl and AVDs via emulator              |  [x]   |
| **Missing CLI**    | Xcode / Android SDK missing | Graceful empty list with helpful install banner; no crashes              |  [x]   |
| **Offline**        | Disconnected                | Operates locally on Mac developer tools                                  |  [x]   |
| **Prod Guard**     | Erase simulator             | Erase / wipe action requires native confirmation sheet                   |  [x]   |
| **Cancel Confirm** | Dismiss erase               | Canceling erase leaves simulator container and user data untouched       |  [x]   |
| **Theme**          | Light + Dark                | Device cards, state indicators (booted, shutdown), runtime tags readable |  [x]   |
