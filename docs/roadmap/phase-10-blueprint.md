# Phase 10: Blueprint & Maintenance — Specification

> **Phase:** P10  
> **Target Branch:** `feat/mac-clean`  
> **Status:** Implementing

---

## 1. Overview & Goals

Phase 10 equips Stackroost with reproducible environment management, granular Homebrew version pinning, and safe application updates:

1. **Mac Blueprint Export & Import:**
   - **Export:** Serializes machine configuration into `nexus-blueprint.json`:
     - Embedded Brewfile (`brew bundle dump --file=-` for taps, formulae, casks).
     - Remote server host configurations (label, alias, hostname, port, env — **strictly stripped of secrets/private keys**).
     - SSH tunnel configurations.
     - Projects & workspace definitions.
     - Saved terminal Drawer commands.
     - Mac Clean preservation rules.
     - VS Code extensions (`code --list-extensions`).
     - App settings.
   - **Import:** Computes an actionable visual diff comparing the imported blueprint to the active machine state. Applies changes step-by-step with explicit confirmation.

2. **Homebrew Version Pinning & Safe Rollback:**
   - Pin / unpin packages via `brew pin` and `brew unpin`.
   - Outdated and upgrade actions automatically respect pinned packages.
   - Inspection of installed kegs in Cellar (`$(brew --cellar)/<name>`) for rollback candidates.
   - Honest error handling when older versions are not available in Cellar.

3. **Auto-Updater & CI Release Pipeline:**
   - Auto-resolved ASK gate: Configures `tauri-plugin-updater` with GitHub Releases manifest (`https://github.com/Arpitpatidar00/Chat-App-System/releases/latest/download/latest.json`).
   - Daily background check without automatic updates; updates require explicit user click.
   - CI release workflow generates release bundles and updater signatures.

---

## 2. IPC Commands

- `blueprint_export`: Export current machine configuration to `nexus-blueprint.json`.
- `blueprint_analyze_import(blueprint_json)`: Parse and diff an imported blueprint against local state.
- `blueprint_apply_homebrew(brewfile)`: Run `brew bundle install` step.
- `blueprint_apply_hosts(hosts)`: Safely import remote hosts without overwriting existing entries.
- `blueprint_apply_workspaces(workspaces)`: Import saved workspaces and commands.
- `blueprint_apply_extensions(extensions)`: Install missing VS Code extensions.
- `package_pin(name)`: Run `brew pin <name>`.
- `package_unpin(name)`: Run `brew unpin <name>`.
- `package_cellar_versions(name)`: Return all historical keg versions present in Cellar.
- `package_rollback(name, version)`: Switch to a chosen historical keg version.
- `app_check_update`: Check GitHub Releases for newer version tags and release notes.
