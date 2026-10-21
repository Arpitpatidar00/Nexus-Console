# QA Checklist — Docker & Local Containers

| Dimension          | Scenario                | Verification Steps                                                          | Status |
| ------------------ | ----------------------- | --------------------------------------------------------------------------- | :----: |
| **Happy Path**     | Compose & Containers    | Lists local containers with ID, status, ports, health, and compose projects |  [x]   |
| **Missing CLI**    | Docker daemon down      | Detects daemon status (Colima, OrbStack, Desktop) and reports gracefully    |  [x]   |
| **Offline**        | Disconnected            | Inspects local docker socket/daemon without internet access                 |  [x]   |
| **Prod Guard**     | Stop / Remove container | Destructive removals check state (cannot remove running container directly) |  [x]   |
| **Cancel Confirm** | Dismiss action          | Canceled dialog leaves container state unchanged                            |  [x]   |
| **Theme**          | Light + Dark            | Container state chips (running, exited, restarting) legible in light/dark   |  [x]   |
