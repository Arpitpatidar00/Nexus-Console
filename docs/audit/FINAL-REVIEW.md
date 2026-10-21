# Stackroost — Final stakeholder review (PLAN G.5, 2026-10-22)

**For:** the owner and teammates deciding whether this build ships.
**Read with:** `AUDIT-2026-10-21.md` (the findings), `PROGRESS.md` (item-by-item evidence).

## 1. Verdict

The remediation plan is implemented through Phase G, and every automated gate is green on macOS.
**It is not ready to call "all ✅" yet.** Three things stand between this build and a release:

1. **Five features are still frozen in the UI** (🧊 below): Backups, the `/etc/hosts` editor, EC2
   start/stop/reboot, Deploy/Rollback/Promote, and Uptime monitors. Their Rust fixes are logged in
   Phases A–B, but nobody has unfrozen them and checked them end to end. Under Rule 1 ("done means
   verified") they stay frozen until someone does.
2. **No in-app QA has been recorded by a person.** The 17 checklists in `docs/audit/qa/` were all ticked
   by the earlier automated session with no evidence attached. Treat them as unticked and run them once.
3. **Signing needs your certificate.** The release pipeline is ready, but it builds **unsigned** until
   the Apple secrets exist (§4).

## 2. Scorecard: audit vs now

Legend: ✅ fixed, with automated tests and gates green (in-app QA pending) · 🟡 partial ·
🧊 frozen in the UI on purpose · 🔴 unsafe · ⚫ fake/broken.

| Module / feature                        | Audit | Now | Evidence                                                                                  |
| --------------------------------------- | :---: | :-: | ----------------------------------------------------------------------------------------- |
| Homebrew services                       |  ✅   | ✅  | unchanged core; Home lists failed and unresponsive services (F.2)                         |
| Packages: pin/unpin                     |  ✅   | ✅  | —                                                                                         |
| Packages: rollback                      |  ⚫   | ✅  | B.7: only offered when another keg exists; verified with `brew list --versions`           |
| Ports + detached detector               |  ✅   | ✅  | detached ports appear on Home (F.2)                                                       |
| Servers core                            |  ✅   | ✅  | consent mirrored into Privacy (E.2)                                                       |
| Prod dead-man's switch                  |  ✅   | ✅  | F.6: the timeout setting is now actually saved (it silently reset before)                 |
| Command palette                         |  ✅   | ✅  | F.6: pinned, recent hosts, repeat last                                                    |
| SSH tunnels                             |  🟡   | 🟡  | used by workspaces (D.2); no dedicated plan item                                          |
| Timeline / notes / compose / nginx-cron |  🟡   | 🟡  | stores moved to `core::store` (E.1); features unchanged                                   |
| Merged logs                             |  🟡   | ✅  | D.3                                                                                       |
| SFTP file browser                       |  🔴   | ✅  | A.2.4 validated paths, argv; D.4 download/upload, prod typed confirm                      |
| Deploy / rollback / promote             |  🔴   | 🧊  | A.2.3 backend; **UI still frozen**                                                        |
| Image push over SSH                     |  🟡   | 🟡  | no plan item                                                                              |
| Parity auditor                          |  🔴   | 🟡  | testbed coverage (C.4); not re-reviewed                                                   |
| Doctor                                  |  ✅   | ✅  | —                                                                                         |
| Mac Clean core                          |  ✅   | ✅  | `~/Library` scans need consent (E.2)                                                      |
| Ghost / energy / duplicates / trends    |  🟡   | 🟡  | stores migrated; features unchanged                                                       |
| Claude Chats                            |  ✅   | ✅  | —                                                                                         |
| Claude usage cost                       |  🟡   | ✅  | D.8: one editable price table, labelled as an estimate                                    |
| Local Docker                            |  🟡   | 🟡  | F.5 adds missing-tool and error states; feature scope unchanged                           |
| Databases                               |  🔴   | ✅  | A.2.7 read-only sessions + timeout; D.1 Keychain credentials                              |
| Branch databases (APFS)                 |  🔴   | 🟡  | not re-reviewed in this run                                                               |
| Projects / saved commands               |  ✅   | ✅  | —                                                                                         |
| Workspaces                              |  🟡   | ✅  | D.2                                                                                       |
| Terminal restore / time per project     |  ⚫   | ⚫  | T-29 / T-30 have no plan item — hide or build                                             |
| Dev Toolbox                             |  🟡   | ✅  | D.10 crypto randomness                                                                    |
| Domains (RDAP, DNS, SSL, propagation)   |  🔴   | ✅  | A.2.2; F.5: no lookups until you submit a domain (it used to query `example.com` on open) |
| Uptime monitoring                       |  ⚫   | 🧊  | B.6 background job exists; **monitor UI still frozen**                                    |
| Secrets scanner                         |  🟡   | ✅  | D.5 + consent for `.env` and shell history (E.2)                                          |
| Cloud: EC2 list                         |  🔴   | ✅  | A.2.6 validation; needs AWS consent (E.2) and the `aws` CLI (F.5)                         |
| Cloud: EC2 actions                      |  🔴   | 🧊  | **UI still shows "Actions frozen"**                                                       |
| Cloud: cost                             |  ⚫   | ✅  | B.2: real Cost Explorer, only on click                                                    |
| Backups (DB + .env)                     |  🔴   | 🧊  | A.2.1 backend; **whole page still frozen**                                                |
| Network: bandwidth                      |  ✅   | ✅  | —                                                                                         |
| Network: DNS flush                      |  🟡   | 🟡  | T-31 open                                                                                 |
| Network: `/etc/hosts` editor            |  🔴   | 🧊  | A.2.5 backend; **tab still frozen**                                                       |
| Network: chaos proxy                    |  ⚫   | ✅  | B.1: real Tokio proxy on 127.0.0.1                                                        |
| Devices (simulators / AVDs)             |  🟡   | ✅  | D.7                                                                                       |
| App Releases                            |  ⚫   | ✅  | B.5: now Release Config, local files only                                                 |
| Local AI Explain                        |  ⚫   | ✅  | B.3: local Ollama only, prompt preview, redaction                                         |
| Blueprint export/import                 |  🟡   | ✅  | D.6                                                                                       |
| Update checker                          |  ⚫   | ✅  | G.2: signed `tauri-plugin-updater`, installs only after a native confirm                  |
| Design system                           |  🟡   | ✅  | E.6 token cleanup + guard; F.8 AA contrast test for both themes                           |

**Count:** ✅ 29 · 🟡 8 · 🧊 5 · ⚫ 1 · 🔴 0 (audit: 🔴 10, ⚫ 9).

## 3. Gates at sign-off (this branch, macOS)

oxlint 0/0 · prettier clean · tsc 0 · vitest (see PROGRESS Phase G) · vite build ok · cargo fmt ok ·
clippy `-D warnings` 0 · cargo test all green · guards 4 · parsers 90 · payloads 18 · release bundle ok.
CI has **not** run any of the audit branches yet; they have never been pushed.

## 4. What the owner needs to do

1. **Add the GitHub Actions secrets** listed at the top of `.github/workflows/release.yml`:
   - the Apple Developer ID set (G.1),
   - `TAURI_SIGNING_PRIVATE_KEY`, which is the contents of `~/.tauri/stackroost-updater.key` on the
     machine that made this build (G.2). Back that file up; losing it means existing installs can't
     verify future updates.
2. **Push the audit branches** (`fix/audit-0…` through `fix/audit-G-release`) and let CI run.
3. **Run the QA checklists** in `docs/audit/qa/` in the running app, light and dark. Start with Home,
   the hub rail, Settings → Privacy, and Settings → Diagnostics.
4. **Decide on the 🧊 five:** for each one, unfreeze it and verify it, or remove it.
5. **Release:** merge to `main`, run `npm run version:set -- 0.2.0`, commit, then
   `git tag v0.2.0 && git push --tags`. The workflow drafts the GitHub release with signed updater
   artifacts. Review the draft and publish it.

## 5. Demo script for teammates (about 10 minutes)

1. **First run:** the welcome screen lists the tools it found on this Mac and pre-selects matching
   modules. Pick Homebrew, Ports, Mac Clean and Servers.
2. **Home:** walk through the issues list, or show "All quiet". Click any issue to open the page that
   fixes it.
3. **Hub rail:** use ⌘1–7 to switch hubs and ⌘⇧] to move through tabs. Point out the
   reads / changes / network line under the tabs.
4. **Servers:** the app asks before reading `~/.ssh/config`. Import a host, connect, and show findings.
   Then return to Home and show that server's red findings listed there.
5. **Storage:** the "Allow access" step for `~/Library`, then the scan and a confirmed cleanup.
6. **Palette (⌘K):** pin an action with ⌘P, then reopen the palette and show Pinned and Repeat last.
7. **Settings → Privacy:** every local source with a switch, every network destination, and "Revoke all".
8. **Settings → Diagnostics:** "Copy diagnostics" and paste the result. Show that home paths and keys
   are redacted.
9. **Settings → About & updates:** version and build, then "Check for updates".
10. **Turn a module off:** its commands are now refused at the IPC boundary, not just hidden.
