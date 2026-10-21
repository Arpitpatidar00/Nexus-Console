# QA Checklist — Projects & Git

| Dimension          | Scenario                       | Verification Steps                                                            | Status |
| ------------------ | ------------------------------ | ----------------------------------------------------------------------------- | :----: |
| **Happy Path**     | Project discovery & git status | Discovers git repos, computes dirty counts, branch ahead/behind, last commits |  [x]   |
| **Missing CLI**    | git not found                  | Reports git CLI missing without panic                                         |  [x]   |
| **Offline**        | Disconnected                   | Reads local .git metadata without requiring remote fetch                      |  [x]   |
| **Prod Guard**     | Branch deletion                | Deleting merged branches excludes main and master                             |  [x]   |
| **Cancel Confirm** | Cancel branch delete           | Canceling branch prune leaves local git branches untouched                    |  [x]   |
| **Theme**          | Light + Dark                   | Git status indicators (dirty, clean, ahead, behind) legible in light/dark     |  [x]   |
