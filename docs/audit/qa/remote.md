# QA Checklist — Remote Servers & SSH

| Dimension          | Scenario                    | Verification Steps                                                                   | Status |
| ------------------ | --------------------------- | ------------------------------------------------------------------------------------ | :----: |
| **Happy Path**     | SSH config probe            | Reads config, opens ControlMaster multiplexed connection, collects metrics           |  [x]   |
| **Missing CLI**    | ssh/ssh-keyscan missing     | Returns AppError::Io / AppError::NotFound without crashing                           |  [x]   |
| **Offline**        | Host unreachable            | Timeout fires cleanly after deadline, marks host as Unreachable                      |  [x]   |
| **Prod Guard**     | Prod container stop/restart | Prod env prompts with explicit PROD warning & exact command before execution         |  [x]   |
| **Cancel Confirm** | User clicks cancel          | Confirmation canceled produces zero remote command execution and no journal mutation |  [x]   |
| **Theme**          | Light + Dark                | Server cards, CPU/memory sparklines, terminal drawers contrast verified              |  [x]   |
