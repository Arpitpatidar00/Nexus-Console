# Stackroost

Your Mac's developer console, in one window.

![Free](https://img.shields.io/badge/100%25-Free-brightgreen?style=for-the-badge)
![No ads](https://img.shields.io/badge/Ads-None-blue?style=for-the-badge)
![No tracking](https://img.shields.io/badge/Tracking-None-blueviolet?style=for-the-badge)
![Local-first](https://img.shields.io/badge/Your%20data-Stays%20on%20your%20Mac-orange?style=for-the-badge)
![MIT license](https://img.shields.io/badge/License-MIT-lightgrey?style=for-the-badge)

|                                                                 |                                                                                                                  |
| :-------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------- |
| ✅&nbsp;&nbsp;**Free&nbsp;to&nbsp;use**&nbsp;&nbsp;&nbsp;&nbsp; | Every feature. No paid tier, no trial, no locked buttons.                                                        |
| ✅&nbsp;&nbsp;**No&nbsp;ads**&nbsp;&nbsp;&nbsp;&nbsp;           | Nothing is sold to you inside the app. Ever.                                                                     |
| ✅&nbsp;&nbsp;**No&nbsp;tracking**&nbsp;&nbsp;&nbsp;&nbsp;      | No analytics, no telemetry, no account, no server. Your data never leaves your Mac without your explicit intent. |

Stackroost is a developer desktop utility that manages your [Homebrew](https://brew.sh) services and
packages, monitors listening ports, checks machine health, manages remote Linux servers over OpenSSH,
cleans storage dev caches, and embeds a terminal.

Built with Tauri 2 (Rust) + React 19 + Tailwind CSS. Runs on macOS 11 or newer.

## Why you'll like it

- **Free, ad-free, and private.** No telemetry, no third-party tracking, no accounts.
- **Light on resources.** Native Rust core, compact floating glass UI, sits in the menu bar.
- **Pick what you need.** Turn modules on or off in Settings. The app hides what you don't use.

## What's inside

The app is split into modular features. Each one is optional and configurable.

### Homebrew

- **Services** shows every Homebrew service with its real state, so a service that says "started"
  but is not actually healthy is marked as starting, not green. Start, stop and restart with one
  click. Install, uninstall, search for new formulae and switch versions.
- **Packages** lists everything you have installed and marks what is outdated. Upgrade one package
  or all of them, run `brew update`, read package info, and see what depends on a package before
  you remove it.
- **Sessions** keeps a history of running service durations and startup states.

### Ports

See which process is listening on which port, and kill stuck processes by PID. Force kill and admin
escalation are available when a process will not terminate cleanly.

### Servers

Manage your Linux servers over OpenSSH using your existing `~/.ssh/config` and local SSH keys:

- **Health probes:** Real-time CPU, RAM, swap, load averages, uptime, and disk capacity.
- **Docker & Compose:** Inspect running containers, health states, restart counts, and live logs.
- **Systemd & PM2:** Monitor active system services, failed units, and Node.js process managers.
- **Safety first:** Read-only by default. Destructive mutations require explicit confirmation.

### Doctor

Read-only health diagnosis for your Mac. It inspects disk state, VSCode caches, browsers, Claude
Code, and Ollama, reporting actionable items under honest tags (`Speed`, `Storage`, `Info`). Probes
only read; fixes only run when you confirm the action.

### Mac Clean

Understand where your disk space went and reclaim storage safely:

- **Storage breakdown:** Visual drilldown into large directories, orphaned `node_modules`, and caches.
- **Safe cache clean:** Clear dev caches (npm, pnpm, Gradle, HuggingFace, Xcode DerivedData).
- **Memory & Swap:** Real-time RAM composition (wired, active, compressed) and swap pressure monitoring.

### Claude Chats

Browse your Claude Code chat history per project and export archives to clean JSON. This module
only appears if Claude Code is installed on your Mac.

### Terminal

An integrated multi-session PTY terminal drawer (supporting up to 8 concurrent sessions) with
shortcuts to drop into local shell or remote SSH sessions directly.

## Install and run

On a fresh Mac, setup takes three commands:

```bash
git clone <this-repo> && cd Stackroost
npm run setup           # checks Xcode CLT, brew, node 22+, rustup
npm start               # runs the app in development
```

## Everyday commands

```bash
npm start               # develop (Tauri + Vite)
npm run release         # production build (.app and .dmg)
npm test                # vitest unit tests
npm run typecheck       # tsc --noEmit
npm run lint            # oxlint
npm run format          # prettier
cargo test   --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## Privacy

Stackroost does not phone home, does not track you, and requires no external account.

- **No telemetry or tracking:** No analytics, no crash reporting, no tracking beacons.
- **Local-first data:** Settings, journals, and cache data are stored locally in your standard macOS Application Support folder.
- **Controlled network access:** The app has no external API backend. Network access is strictly limited to:
  1. Homebrew downloading packages or formula metadata when you request an install or upgrade.
  2. Remote Linux servers that **you explicitly add**, connecting via `/usr/bin/ssh` with your local keys. Non-interactive background health checks use OpenSSH `BatchMode` and never prompt for passwords.

## License

[MIT](LICENSE). Use it, change it, ship it. Just keep the copyright notice.
