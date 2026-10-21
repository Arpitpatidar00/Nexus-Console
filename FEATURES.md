# Stackroost — Features

Every feature in the app, end to end, in one place. Stackroost is a macOS menu-bar app for
your local dev setup: Homebrew services and packages, ports, your SSH servers, machine health,
disk cleanup and memory, Claude Code chats, and a built-in terminal.

## Contents

- [At a glance](#at-a-glance)
- [First launch and modules](#first-launch-and-modules)
- [Homebrew: Services, Packages, Sessions](#homebrew-services-packages-sessions)
- [Ports](#ports)
- [Servers (SSH)](#servers-ssh)
- [Doctor](#doctor)
- [Mac Clean: Storage and Memory](#mac-clean-storage-and-memory)
- [Claude Chats](#claude-chats)
- [Terminal](#terminal)
- [Menu bar, window and quitting](#menu-bar-window-and-quitting)
- [Settings](#settings)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Safety and privacy model](#safety-and-privacy-model)
- [Where things live](#where-things-live)

## At a glance

| Module       | Tabs                         | What it's for                                                                      | Runs in the background                                          | On by default |
| ------------ | ---------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------- |
| Homebrew     | Services, Packages, Sessions | Start/stop services, manage packages and versions                                  | A light check every few seconds (keeps the menu-bar count live) | Yes           |
| Ports        | Ports                        | See what's listening, kill what's stuck                                            | Nothing                                                         | Yes           |
| Servers      | Servers                      | Health, containers and logs of your own Linux servers over SSH                     | Optional re-check of connected servers                          | No (opt-in)   |
| Doctor       | Doctor                       | Read-only machine health checks and cleanup                                        | Optional daily VSCode cleanup                                   | Yes           |
| Mac Clean    | Storage, Memory              | Where your disk went, safe cleanup, memory and swap                                | Optional scheduled cleanup and low-disk warning                 | Yes           |
| Claude Chats | Claude Chats                 | Browse and archive Claude Code history                                             | Optional daily archiving                                        | Yes           |
| Docker       | Containers                   | Local container runtime, compose stacks, and logs                                  | Nothing                                                         | No (opt-in)   |
| Databases    | Databases                    | Local & remote database client, schema inspector _(Query editor & restore frozen)_ | Nothing                                                         | No (opt-in)   |
| Projects     | Projects                     | Git status, workspaces, saved commands, and GitHub PRs                             | Nothing                                                         | Yes           |
| Toolbox      | Dev Toolbox                  | Offline converters, regex tester, cron, hashes & tokens                            | Nothing                                                         | Yes           |
| Domains      | Domains & Uptime             | RDAP expiry, DNS lookup, SSL check _(Uptime monitoring frozen)_                    | Optional uptime monitoring (frozen)                             | No (opt-in)   |
| Secrets      | Secrets Scanner              | Detect committed secrets, unignored .env files & leaked keys                       | Nothing                                                         | No (opt-in)   |
| Cloud        | Cloud AWS                    | AWS profiles, EC2 read-only, S3 buckets _(Actions & Cost frozen)_                  | Nothing                                                         | No (opt-in)   |
| Backups      | Backups                      | _(Temporarily frozen while being rebuilt for safety)_                              | Nothing                                                         | No (opt-in)   |
| Network      | Network & Chaos              | Live per-app bandwidth, DNS flush _(/etc/hosts & Chaos frozen)_                    | Nothing                                                         | No (opt-in)   |
| Devices      | Simulators & AVDs            | iOS Simulators, Android AVDs, lifecycle controls                                   | Nothing                                                         | No (opt-in)   |
| Releases     | App Releases                 | _(Temporarily frozen while being rebuilt for safety)_                              | Nothing                                                         | No (opt-in)   |

*Note: "On by default" applies to fresh installs only; existing installs keep their enabled modules.

Settings is always reachable, whatever modules are on. The terminal is shared by every module.

## First launch and modules

- **First launch** shows one screen to pick modules (keys 1–6 toggle, Enter continues). Presets:
  Everything, Homebrew only, Claude Chats only.
- **Settings → Features** turns modules on and off later. Turning one off stops its background
  work immediately; its data stays.
- At least one module always stays on, so the window is never empty.
- **Claude Chats** only appears when Claude Code is installed.
- **Servers** is opt-in: it reads `~/.ssh` and reaches other machines, so it is never on unless you
  turn it on. Existing installs get new modules off until enabled.

## Homebrew: Services, Packages, Sessions

### Services

- Every Homebrew service with its **real** state. Real health checks probe known formulae (`redis-cli PING`, `pg_isready`, `mysqladmin ping`, `mongosh` ping) with a 2s timeout. A service brew calls "started" that isn't responding shows as **Starting** or **Not responding**, never fake green.
- **Port conflict warning**: checks if default formula port (e.g. 5432, 6379, 3306) is already bound by another process before starting.
- **Start, stop, restart** with one click; **Start all / Stop all** with one native confirm.
- **Linked vs unlinked**: linked services are registered with launchd and survive quitting the app;
  unlinked ones run for this session only and are stopped when you quit (configurable).
- **Install, uninstall, search** formulae and **switch versions** (`redis@6.2`, `postgresql@18`).
- **Add back** any service brew already runs, even one installed outside the app.
- **Grid or list** layout, **drag to reorder** cards, live CPU/memory per service.
- **Open CLI** (redis-cli, psql, mysql, mongosh, or a shell) and **live logs** in the terminal drawer.
- **Untrusted taps**: when Homebrew 6 refuses a third-party tap, a toast offers **Trust tap**
  (explained in a native sheet first).

### Packages

- Everything installed, with **outdated** marked. Upgrade one package or all of them.
- **Package info** and **dependents** (see what uses a package before you remove it).
- **Update Homebrew** (`brew update`) from Settings.

### Sessions

- A history of what you ran and how long services stayed up.
- The menu-bar title shows running services as `running/total`.

## Ports

- Every listening port with the process, PID, user, CPU and memory. Toggle **listening only / all
  connections**; search by port, PID or process.
- **Detached port detector**: flags orphan dev processes (Node, Bun, Vite, Python, etc. with PPID 1 and no controlling terminal) holding ports after terminal window was closed, with a clear warning badge.
- **Project directory owner**: identifies and displays the project name from process working directory.
- **Open in browser**: probes HTTP listener on demand with a fast 300ms HEAD check and opens in browser.
- **Favorite ports**: pin important ports (e.g. 3000, 5173, 8080) to the top of the table.
- **Kill** (SIGTERM), **Force** (SIGKILL), and **Kill with admin** via the native admin prompt when
  permission is denied. System-owned processes carry a warning.
- Nothing runs in the background.

## Servers (SSH)

See and manage your own Linux servers using your existing `~/.ssh/config`, keys and agent. No agent
on the servers, no account, no server of ours.

### Setup

1. Settings → Features → turn on **Servers**.
2. **Allow reading SSH config**: nothing in `~/.ssh` is read before this. Only `config` and the files
   it includes are ever read; never keys or `known_hosts`. Revoke any time in Settings.
3. **Import from SSH config**: tick hosts; set a **project** and an **environment** (dev, staging,
   prod, other) per host. The environment is pre-filled from the alias (`fameo-prod` → Prod).
4. Or **Add server** by hand (hostname, user, port, optional key file).

### Using it

- Hosts are grouped by **project**, prod last. Each row shows status as a dot plus words
  ("Not connected", "Healthy", "2 issues", "Host key not trusted").
- **Connect** is explicit by default, with an optional "Connect when Stackroost opens" toggle per host. One SSH connection per host is reused (the first command does the SSH handshake; later commands are fast).
- **Overview**: OS, kernel, uptime, CPU and load, memory, swap, disks, with live sparklines.
- **Containers**: state and health, CPU, memory, restarts, compose project. Per container: **live
  logs**, **shell inside**, **restart / stop / start / remove**.
- **Services**: running and failed systemd units, and PM2 apps (their secrets are never kept).
- **Ports**: listening TCP ports on the server.
- **Issues**: findings such as disk over 85 %, low memory, high load, restarting or unhealthy
  containers, failed units, PM2 errors, OOM kills, pending reboot, docker permission, each with an
  explanation and commands you can run yourself.
- **Host shell** in the terminal drawer; **Check all** re-checks every connected server at once.
- **Connection errors** show inline with the next step: Retry for network problems, **Open
  terminal** for host-key or key problems so you verify the fingerprint yourself. Host keys are never
  accepted for you.
- **History** lists every change the app made on a server.

### Safety

- Every container action shows a native confirm with the server name and **ENV in capitals**; on
  **prod** you first type the server's name, then confirm natively. Stop and remove are styled as
  danger.
- **Prod dead-man's switch**: auto-disconnects idle control masters (`ssh -O exit`) when the screen locks, system sleeps, or after N minutes of inactivity (default 10m).
- **PTY safety guarantee**: never kills a prod terminal if a foreground command (build, migration, script) is active; sends a notification instead. Copy recommends `tmux` for long prod jobs.
- **Tray PROD indicator**: the menu bar icon displays `[PROD]` whenever any production server connection is active.
- The app only sends a host id; Rust builds every command from constants and names the server
  itself reported.

### Background (optional)

Settings → Servers → **Check in the background** (5/15/30 min): re-checks servers that are already
connected and notifies only about **new** critical issues. It never connects on its own.

## Doctor

Read-only health checks with honest tags: **Speed**, **Storage** or **Info**. Disk cleanup is never
claimed to make the Mac faster.

- **Scopes**: System, Claude, VSCode, Browser, Disk, Startup.
- **Toolchain check**: verifies installed developer toolchains (Node, npm, pnpm, Rust, Python, Docker, Flutter, Dart) and flags issues.
- **Quick scan** streams findings as each check finishes; **Deep scan** adds a node_modules sweep and
  dev-cache sizes, with progress and Cancel.
- Checks include free disk, load vs cores, memory pressure and swap, Low Power Mode, Time Machine
  backup risk, startup items, VSCode orphaned workspace caches, database bloat and extensions,
  browser processes, audio, storage and extensions, Ollama models, Claude Code usage.
- **Fixes** run only when you press the button, each behind a native confirm (for example clear a dev
  cache, delete dead node_modules, VACUUM VSCode databases, remove orphaned pnpm stores).
- **History** of every change, and **Export** of the report.
- Optional **daily VSCode cleanup** while the app sits in the menu bar.

## Mac Clean: Storage and Memory

`~/mac-clean.sh` inside the app. Scans only read; the one thing that deletes is the cleanup
button. On a real Mac the app and `mac-clean.sh --dry-run` report the same numbers.

### Storage tab

The first scan runs when you open the tab (about 25 s), with a progress bar and Cancel; after that
only **Rescan** or a finished clean scans again.

| Section                 | What it shows                                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Disk summary            | Used, total and free; amber from 75 % used, red from 90 %; when you last cleaned                                                                          |
| Root causes             | Biggest first, each with the fix you apply: pending macOS update, large swap, Time Machine local snapshots, Docker disk image bigger than its contents    |
| Cleanup plan            | All cleanup items with size, status and tick box (below)                                                                                                  |
| Where your storage goes | Applications, Desktop, Library, Docker disk image, Homebrew, dev toolchains, Downloads, macOS volumes, other. **Click a row** for its 10 biggest children |
| Disk volumes            | System, Data, Preboot, Recovery, VM (swap), Update; oversized ones say "Larger than usual"                                                                |
| Inside the Data volume  | The **deep scan** (below)                                                                                                                                 |
| Large files             | Files of 1 GB or more in Desktop, Documents, Downloads, with **Reveal in Finder**                                                                         |
| Worth a look            | Other user accounts, pending update, big Trash, duplicate Homebrew versions, old node_modules, iPhone backups (reported only)                             |

The Library total leaves out other apps' containers, because reading them makes macOS ask "access
data from other apps". That space shows under "Other users & system data" until a deep scan.

### Cleanup items

| Item                                 | What it removes                                                     | Skipped when                        | Ticked by default |
| ------------------------------------ | ------------------------------------------------------------------- | ----------------------------------- | ----------------- |
| npm cache                            | `~/.npm/_cacache`, `_npx`, `_logs`                                  |                                     | Yes               |
| pnpm store                           | Packages no project uses (`pnpm store prune`)                       | pnpm not found                      | Yes               |
| Yarn cache                           | `~/Library/Caches/Yarn`                                             |                                     | Yes               |
| pip cache                            | `~/Library/Caches/pip`                                              |                                     | Yes               |
| Chrome cache                         | `~/Library/Caches/Google/Chrome`                                    | Chrome is open                      | Yes               |
| VS Code caches & logs                | Cache, CachedData, CachedExtensionVSIXs, Code Cache, GPUCache, logs | VS Code is open                     | Yes               |
| Antigravity caches                   | The same folders for Antigravity IDE, plus browser recordings       | Antigravity is open                 | Yes               |
| App logs                             | Files in `~/Library/Logs` older than 7 days                         |                                     | Yes               |
| Docker installer leftovers           | `~/Library/Application Support/com.docker.install`                  | Changed in the last day             | Yes               |
| Docker build cache & untagged images | `docker builder prune -af`, `docker image prune -f`                 | Docker not installed or not running | Yes               |
| Unused Docker images                 | Tagged images no container uses, each named in the confirm          | Docker not installed or not running | **No**            |
| Homebrew old versions & cache        | `brew cleanup --prune=all`, `brew autoremove`                       | Homebrew not installed              | Yes               |
| Idle Next.js builds                  | `.next` folders in your project folders untouched for 7 days        | Inside a protected project          | Yes               |
| Xcode DerivedData                    | `~/Library/Developer/Xcode/DerivedData`                             | Xcode is open                       | Yes               |
| Unavailable iOS simulators           | `xcrun simctl delete unavailable`                                   | Xcode not installed, or open        | Yes               |

### How a clean works

1. Tick items; the footer shows "Selected X of Y reclaimable".
2. **Clean selected…** measures every ticked item again and re-checks its skip rule.
3. One native sheet lists every item and size (and skips, with why). Cancel changes nothing.
4. Items are cleaned one at a time with live status per row.
5. `df` measures free space before and after; a banner shows what was **actually** freed.
6. The run goes into the cleanup **History**, and the report rescans.

### Deep scan

**Deep scan…** asks for your password once with the native macOS prompt, then a fixed, read-only
`du` script measures as administrator: other user accounts, your home's unmeasured folders (app
containers), /System, /Library, system databases, temp files (flagged over 3 GB), swap, installer
leftovers (flagged over 1 GB), and snapshots & purgeable space (flagged over 5 GB). About 2 minutes.
Nothing is ever deleted as administrator. Cancelling the prompt shows no error.

### Memory tab

Refreshes every 3 s while open and focused.

| Part         | What it shows                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| Pressure     | Normal, Warning or Critical, in words                                                                                |
| Composition  | App memory, Wired, Compressed, Cached files, Free (Activity Monitor's maths); Memory used = App + Wired + Compressed |
| Swap         | Used of total. **Swapping now** (slows the Mac) vs **left over** (harmless until restart)                            |
| Restart hint | Only when swap is over 2 GB after more than 7 days up                                                                |
| Top apps     | The 10 apps using the most memory, helpers rolled into their app (Chrome's 21 processes = one line); report only     |

### Safety rules

- Only inside your home folder; never the home folder itself.
- Never `.git`, `.ssh`, `.env*` or `src` folders, and never a path containing a protected name
  (default `Fameo`).
- Symlinks are removed as links, never followed; nothing that resolves outside your home.
- The app sends item names only; Rust decides the folders and measures them again at clean time.
- Skip rules are re-checked right before each item.
- Source code, node_modules, Trash, large files and other accounts are reported, never cleaned.

### Settings and automation

Settings → Mac Clean:

| Setting                           | Default   | Meaning                                                                                  |
| --------------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| Never touch paths containing      | Fameo     | Comma-separated names                                                                    |
| Project folders                   | ~/Desktop | Where idle `.next` builds and old node_modules are looked for                            |
| A .next build is idle after       | 7 days    |                                                                                          |
| Remove app logs older than        | 7 days    |                                                                                          |
| Report node_modules untouched for | 60 days   | Reported only                                                                            |
| Scheduled cleanup                 | Off       | Weekly, 2 weeks or monthly from the menu bar; default items only; notifies what it freed |
| Low-disk warning                  | Off       | 5, 10 or 20 GB; one notification per drop below, not one every few minutes               |

### Compared with mac-clean.sh

| Area           | mac-clean.sh                                   | Mac Clean                                                         |
| -------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| Report numbers | —                                              | Same storage map, volumes, item sizes and skips                   |
| Docker         | `docker system prune -af` (also tagged images) | Build cache + untagged images by default; tagged images opt-in    |
| pnpm           | Deletes the whole store                        | `pnpm store prune` keeps what projects use                        |
| Cleaning       | All-or-nothing `y/N`                           | Pick items, one confirm, live progress, measured result           |
| Deep scan      | `--deep` with `sudo`                           | Native password prompt, same breakdown                            |
| Scheduled runs | `--yes` from cron                              | Scheduled cleanup setting with a notification                     |
| Extras         | —                                              | Drill-down, large files, backups, simulators, Memory tab, history |

## Claude Chats

- Browse Claude Code chat history **per project**: live chats, archived chats and cache size.
- **Archive** old chats by age, **restore** them, or **delete** archived ones; every change behind a
  native confirm and recorded in a journal.
- Choose how long Claude Code keeps chats (**retention**).
- Optional **daily auto-archive** while the app sits in the menu bar.

## Terminal

- A real terminal drawer at the bottom of the window, with tabs (up to 8 sessions).
- Opened from: a Homebrew service (its CLI client or a shell, and live logs), a Servers host (an
  interactive `ssh` shell), or a container (live logs, or a shell inside it).
- Opening the same thing twice focuses its existing tab. Hiding the drawer keeps sessions running;
  quitting the app closes them.

## Menu bar, window and quitting

- The menu-bar icon shows `running/total` services and an **Active Services** menu to toggle them,
  plus **Open Dashboard** and **Quit**.
- Closing the window **hides** it to the menu bar; services keep running.
- **Quit** (Cmd+Q or the menu) closes terminals and SSH connections and, by default, stops services
  that were started unlinked this session.
- Only one copy of the app runs: opening it again brings the existing window forward.
- Desktop notifications for background tasks (archiving, VSCode cleanup, Servers, Mac Clean).

## Settings

- **Features**: which modules are on.
- **Appearance**: theme (system, light, dark) and the default Services layout (grid or list).
- **Homebrew**: status and `brew update`; **managed services** list.
- **Servers** (when on): refresh interval (5s, 10s, 30s, manual), background checks, revoke SSH
  config access.
- **Mac Clean** (when on): cleanup rules, scheduled cleanup, low-disk warning.

## Keyboard shortcuts

| Shortcut  | Action                                        |
| --------- | --------------------------------------------- |
| Cmd+1 … N | Switch tabs, in sidebar order                 |
| Cmd+,     | Open Settings                                 |
| Cmd+F     | Focus the current tab's search, if it has one |
| Cmd+Q     | Quit                                          |

## Safety and privacy model

- **No account, no telemetry, no server of ours.** Settings, sessions, archives and journals are plain
  files on your Mac.
- **Network**: Strictly controlled. OpenSSH to user-added servers; Homebrew package downloads; domain RDAP (`rdap.org`); public DNS resolvers (1.1.1.1, 8.8.8.8, 9.9.9.9) for propagation; update checks (`api.github.com`); AWS CLI when configured; local loopback Ollama (`127.0.0.1:11434`). Zero cloud telemetry.
- **Read-only by default.** Every change is a button you press, confirmed in a **native macOS sheet**
  shown by Rust (the web UI can't skip it), and written to a journal.
- **Admin rights** only through the native macOS prompt: Ports "Kill with admin", Mac Clean's
  read-only deep scan.
- **Honest labels**: findings are tagged Speed, Storage or Info; status is always words plus colour.

## Where things live

| Area         | Rust (`src-tauri/src/`)                                   | Frontend (`src/features/`)            |
| ------------ | --------------------------------------------------------- | ------------------------------------- |
| Homebrew     | `brew.rs`, `commands/services.rs`, `commands/packages.rs` | `services/`, `packages/`, `sessions/` |
| Ports        | `commands/ports.rs`, `util/lsof.rs`                       | `ports/`                              |
| Servers      | `remote/`, `commands/remote.rs`                           | `remote/`                             |
| Doctor       | `doctor/`, `commands/doctor.rs`                           | `doctor/`                             |
| Mac Clean    | `maclean/`, `commands/maclean.rs`                         | `maclean/`                            |
| Claude Chats | `doctor/claude.rs`, `commands/archiver.rs`                | `archiver/`                           |
| Terminal     | `pty.rs`                                                  | `terminal/`                           |
| Menu bar     | `tray.rs`, `quit.rs`                                      | `sessions/hooks/useTrayTitle.ts`      |

Tests: Rust unit tests sit beside the code, with real command output in `fixtures/`; the frontend
uses Vitest. `npm run test:remote` runs the Servers integration tests against a local SSH testbed
(`scripts/remote-testbed/`).
