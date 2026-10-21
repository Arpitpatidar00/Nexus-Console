# Phase 9: Mac Health — Specification

> **Phase:** P9  
> **Target Branch:** `feat/mac-clean`  
> **Status:** Complete

---

## 1. Overview & Goals

Phase 9 expands Mac Clean and Doctor into deep Mac hardware, storage hygiene, and energy efficiency:

1. **Ghost Leftovers (Mac Clean, Report-First):**
   - Discovers orphaned app remnants (`~/Library/Caches`, `Preferences`, `Saved Application State`, `HTTPStorages`) whose bundle IDs no longer exist in `/Applications`, `~/Applications`, `/System/Applications`, or Homebrew Casks.
   - Identifies dead `LaunchAgents` in `~/Library/LaunchAgents` whose target executable no longer exists.
   - Preserves strict safety: never touches `Containers` or `Group Containers`, and reports `Application Support` as "Possible" (reveal only).
   - Deletion moves to Trash with `launchctl bootout`/`unload` for dead LaunchAgents. Displays authentic file modified dates.

2. **Energy Tab (Mac Clean):**
   - High-precision per-process energy accounting using macOS `proc_pid_rusage` (idle wakeups, interrupt wakeups, user/system CPU time, disk writes).
   - Classifies processes by category: App, Homebrew Service, Project / Dev Watcher, System.
   - Detects battery vs AC power state and offers opt-in unplugged suggestion to pause CPU-waking watchers without fake battery estimates.

3. **Battery Health & Thermal Throttling (Doctor):**
   - Reads authentic battery metrics (`ioreg AppleSmartBattery` / `system_profiler SPPowerDataType`): cycle count, max capacity %, and condition.
   - Monitors thermal throttling via `pmset -g therm` (CPU Speed Limit) and highlights top CPU consumers when throttling is active.

4. **Weekly Storage Trends (Mac Clean):**
   - Journals rolling daily storage metrics (free disk, category breakdowns, swap) in `maclean-history.json` (90-day retention).
   - Computes week-over-week deltas and flags the top growing storage categories.

5. **Duplicate File Finder (Mac Clean, Report-First):**
   - Scans user-chosen folders (`Downloads`, `Desktop`, `Documents`) for files ≥ 1 MB.
   - 2-tier detection: fast file size grouping -> partial 64 KB BLAKE3 hash -> full BLAKE3 hash.
   - Safe interactive review: user explicitly marks copies for deletion to Trash; never auto-deletes originals.

---

## 2. IPC Commands

- `maclean_ghost_scan`: Scan for high-confidence and possible uninstalled app leftovers.
- `maclean_ghost_clean(ids)`: Safely move selected ghost leftovers to Trash (and unload dead agents).
- `maclean_energy_sample`: Sample per-process wakeups, CPU time, disk writes, and power source.
- `maclean_pause_service(service_name)`: Pause/stop a CPU-waking service while unplugged.
- `maclean_trends`: Return historical daily trends, weekly delta, and top storage growers.
- `maclean_duplicates_scan(dirs)`: Scan specified directories for duplicate files ≥ 1 MB using BLAKE3.
- `maclean_duplicates_delete(paths)`: Move chosen duplicate file copies to Trash.
