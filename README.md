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
- **Native Rust core.** Every mutation is governed by an in-process native confirmation gate and journaled.
- **Zero raw shell execution.** All child processes use strict argv execution with timeouts.
- **Truthful metrics only.** No simulated or placeholder data; features either read real system state or are omitted.
- **Pick what you need.** Turn modules on or off in Settings. The app hides what you don't use.

## Module Privacy & Scope Matrix

Every module in Stackroost strictly declares what it reads, what it changes, and what network endpoints it sends data to:

| Module               | Reads                                                                                           | Changes                                                                                              | Sends                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Homebrew**         | `brew list`, `brew services list`, formula versions in Cellar                                   | Starts/stops services, installs/uninstalls formulae (mutation gated)                                 | None (brew CLI manages mirror connections)                               |
| **Ports**            | `lsof -iTCP -sTCP:LISTEN`, process metadata via `ps`, 127.0.0.1 HEAD probe                      | Terminate process (SIGTERM/SIGKILL) with native confirm                                              | None (loopback probe on 127.0.0.1 only)                                  |
| **Projects**         | Git status of your project folders, saved workspaces                                            | `git fetch`, deleting merged branches, starting workspace services                                   | GitHub via your `gh` CLI (PR status)                                     |
| **Docker**           | Local containers and compose stacks                                                             | Start / stop / restart / remove containers you pick                                                  | None (local Docker socket)                                               |
| **Databases**        | Connections you add (passwords in Keychain)                                                     | Read-only queries; snapshots you confirm                                                             | Database hosts you add (direct or SSH tunnel)                            |
| **Servers**          | `~/.ssh/config`, Linux server state over OpenSSH (`/proc`, `docker`, `systemctl`)               | Remote container restart/deploy/rollback (mutation gated, journaled)                                 | OpenSSH connections to user-configured servers only                      |
| **Doctor**           | Read-only machine inspection (disk, VSCode `state.vscdb`, browser caches)                       | User-confirmed maintenance (e.g. SQLite VACUUM, cache clearance)                                     | None                                                                     |
| **Mac Clean**        | Directory sizes, `vm_stat`, `sysctl vm.swapusage`, `pmset`, `ioreg`                             | Clears selected developer caches (npm, pnpm, Xcode) with mutation gate                               | None                                                                     |
| **Claude Chats**     | `~/.claude/projects/` chat session files                                                        | Archive, restore, or delete local chat logs (mutation gated)                                         | None                                                                     |
| **Cloud AWS**        | `~/.aws/config`, `~/.aws/credentials`, EC2 instance state, Cost Explorer (on-demand click only) | EC2 instance start/stop/reboot (mutation gate + typed confirm for prod)                              | AWS API via official `aws` CLI                                           |
| **Backups**          | Database schemas and tables via local/remote client; project `.env` files                       | Creates 0600 backup archives in app data directory                                                   | None (or over user SSH connection)                                       |
| **Network & Chaos**  | `nettop` per-process bandwidth, `/etc/hosts`                                                    | Flush DNS (`dscacheutil`), edit managed `/etc/hosts` block (atomic temp file), Tokio TCP chaos proxy | None (chaos proxy binds to 127.0.0.1 only)                               |
| **Domains & Uptime** | `dig` DNS records, `openssl s_client` SSL certs, RDAP registry                                  | Saves monitor configs; background pings                                                              | Outbound DNS, public RDAP, HTTP HEAD to user-monitored URLs              |
| **Mobile Devices**   | `xcrun simctl list -j`, `emulator -list-avds`                                                   | Boots, shuts down, or launches local simulators and emulators                                        | None                                                                     |
| **Release Config**   | `pubspec.yaml`, `package.json`, `fastlane/Fastfile`                                             | None (read-only configuration scanner)                                                               | None                                                                     |
| **AI Explain**       | User-entered prompt and logs with secret pattern masking (AWS, Stripe, PATs, tokens)            | None                                                                                                 | HTTP strictly to local Ollama on `127.0.0.1:11434` (never external)      |
| **Dev Toolbox**      | User input in client UI                                                                         | None (in-memory converters, regex tester, hash generator)                                            | None                                                                     |
| **Secrets Scanner**  | Project `.env` files and shell history (each only after you allow it)                           | None (read-only credential pattern scanner)                                                          | None                                                                     |
| **App Updater**      | Compares `CARGO_PKG_VERSION` against GitHub Releases API (opt-in check)                         | None (opens browser to release download page)                                                        | `https://api.github.com/repos/Arpitpatidar00/Stackroost/releases/latest` |

### Consent and network allow-list

Five local sources are read only after you allow them, and the check runs in Rust before every read:
`~/.ssh/config` (Servers), `~/.aws` (Cloud), shell history and project `.env` files (Secrets), and
`~/Library` (Mac Clean). **Settings → Privacy** lists each one with an on/off switch and a "Revoke all".

The same screen lists every network destination the app can reach (`src-tauri/src/core/net.rs`), and
outbound calls outside that list are refused:

| Destination                           | Module            | Why                                        |
| ------------------------------------- | ----------------- | ------------------------------------------ |
| `api.github.com`, `github.com`        | Updater, Projects | Release check; PR status via your `gh` CLI |
| `rdap.org`                            | Domains           | Registration / expiry lookup               |
| `1.1.1.1`, `8.8.8.8`, `9.9.9.9`       | Domains           | DNS propagation check                      |
| `*.amazonaws.com`                     | Cloud             | EC2, S3, Cost Explorer via your `aws` CLI  |
| `127.0.0.1:11434`                     | AI                | Local Ollama (never leaves this Mac)       |
| Servers, URLs and domains **you** add | Servers, Domains  | SSH, uptime checks, TLS / DNS lookups      |

## Getting Started

### Prerequisites

- macOS 11 (Big Sur) or newer
- Node.js ≥ 22.12 and npm
- Rust toolchain (stable)
- Xcode Command Line Tools (`xcode-select --install`)

### Running locally

```bash
# Setup verification
npm run setup:check

# Run dev mode (frontend + native Tauri app)
npm start

# Run test suites
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

## Security & Architecture Principles

- **No Shell Interpolation (`core::exec`):** All commands run strictly as program + argv slice. Raw shell invocation (`sh -c`, `bash -c`) is forbidden and enforced by architecture guard tests (`guard_no_shell_commands`).
- **Mutation Gate (`core::mutation`):** Every operation that writes, modifies, or deletes system resources acquires an RAII `MutationGuard`. Destructive operations prompt with a native macOS `NSAlert` modal. All mutations are journaled.
- **Strict Validations (`core::validate`):** Hostnames, domain names, database names, AWS profiles/regions, remote paths, and identifiers use validated newtypes that reject command injection payloads, control characters, and path traversal sequences.
- **Guarded Architecture:** Automated architecture tests (`src-tauri/tests/guards.rs`) fail CI if un-gated mutations, ignored command outputs, raw shell strings, or unhandled browser alerts enter the codebase.

## License

MIT License. Copyright (c) 2026 Arpit.
