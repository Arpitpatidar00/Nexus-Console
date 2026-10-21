# QA Checklist — Cloud (AWS)

| Dimension          | Scenario            | Verification Steps                                                          | Status |
| ------------------ | ------------------- | --------------------------------------------------------------------------- | :----: |
| **Happy Path**     | EC2 & Cost Explorer | Lists instances with tags and states; Cost Explorer reports on-demand costs |  [x]   |
| **Missing CLI**    | aws cli missing     | Falls back to reading ~/.aws/config profiles without crashing               |  [x]   |
| **Offline**        | Network down        | Cached cost data shown with timestamp; offline error banner on refresh      |  [x]   |
| **Prod Guard**     | EC2 reboot/stop     | Production EC2 instance mutations require native confirmation sheet         |  [x]   |
| **Cancel Confirm** | Dismiss dialog      | Canceling confirmation causes 0 calls to aws ec2 stop/start/reboot          |  [x]   |
| **Theme**          | Light + Dark        | Cloud instance cards and cost breakdown tables legible in light/dark        |  [x]   |
