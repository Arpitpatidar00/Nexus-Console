# QA Checklist — Databases

| Dimension          | Scenario                    | Verification Steps                                                         | Status |
| ------------------ | --------------------------- | -------------------------------------------------------------------------- | :----: |
| **Happy Path**     | Database discovery & tables | Discovers local databases (Postgres, MySQL, Redis) and lists tables safely |  [x]   |
| **Missing CLI**    | psql / mysql missing        | Reports CLI missing with install instructions                              |  [x]   |
| **Read-Only**      | Transaction protection      | Enforces default_transaction_read_only=on and timeout on all read queries  |  [x]   |
| **Prod Guard**     | Write queries on prod       | Writes disallowed for production connections                               |  [x]   |
| **Cancel Confirm** | Query rejection             | Destructive mutation queries rejected unless explicit user consent given   |  [x]   |
| **Theme**          | Light + Dark                | Table viewer grid and result rows high contrast in light/dark              |  [x]   |
