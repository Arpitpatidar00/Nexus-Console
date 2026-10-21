# QA Checklist — Doctor (System Diagnostics)

| Dimension          | Scenario             | Verification Steps                                                       | Status |
| ------------------ | -------------------- | ------------------------------------------------------------------------ | :----: |
| **Happy Path**     | System health checks | Gathers CPU, disk, memory, thermal, and audio power assertions           |  [x]   |
| **Missing CLI**    | Missing tool         | Checks that require optional tools skip with probe warning               |  [x]   |
| **Offline**        | Disconnected         | System probes execute entirely locally on macOS without WAN requirements |  [x]   |
| **Prod Guard**     | Fix / Kill action    | Process kills and fixes gate behind confirmation                         |  [x]   |
| **Cancel Confirm** | Cancel remediation   | Canceled remediation makes no changes to system state                    |  [x]   |
| **Theme**          | Light + Dark         | Finding severity badges (info, warning, danger) contrast checked         |  [x]   |
