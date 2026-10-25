# Phased AI Agent Prompts: Fixing "Inside the Data Volume" Categorization, UI & Space Management

Use these sequential prompts with your AI coding agent (Cursor, Windsurf, Claude Code, etc.). Run one phase at a time, review the agent's findings or changes, and verify before moving to the next phase.

---

## Why the 50.2 GB "Snapshots & Purgeable" Issue Happens

In macOS storage scanners, a mysterious **50+ GB "Snapshots & purgeable"** bucket usually stems from one (or both) of two architectural bugs:

1. **The "Residual Math" Trap (Unaccounted Files Disguised as Snapshots)**
   - Many disk utilities calculate `Snapshots & Purgeable = Total Data Volume Used - Sum(Scanned Categories)`.
   - If the scanner skips paths like `/opt/homebrew`, `/usr/local`, `/Applications`, `/private/var/folders`, Docker/OrbStack containers, or directories blocked by missing **Full Disk Access (FDA)**, all of that missing gigabyte total gets dumped into "Snapshots & purgeable."
2. **Opaque APFS Snapshot & Purgeable Aggregation**
   - Even when genuine APFS local snapshots (`com.apple.TimeMachine.*`, update snapshots) or macOS purgeable caches (`CacheDelete` / iCloud local evictable files) exist, lumping them into a single static row gives you no visibility into _which_ snapshot or cache owns the space—and no way to reclaim it.

---

## Phase 1: Codebase Audit & Root-Cause Diagnosis (Read-Only)

Copy and paste this prompt first so the AI agent maps your current implementation before touching any code:

```markdown
### Prompt — Phase 1: Audit Data Volume Scanner & Categorization Logic

Do NOT modify any code yet. First, inspect the codebase and locate the implementation for the "Inside the Data volume" feature (UI component, backend/scanner service, shell commands, and native macOS APIs).

Analyze and provide a concise diagnostic report covering:

1. **How "Snapshots & purgeable" is currently calculated**:
   - Is it queried directly via macOS APIs (`URLResourceKey.volumeAvailableCapacityForImportantUsageKey`, `diskutil apfs listSnapshots`, `tmutil listlocalsnapshots /`), or is it calculated as a residual difference (`Total Used - Sum of Known Categories`)?
2. **Unscanned or Permission-Blocked Paths**:
   - Which top-level directories on `/System/Volumes/Data` (or `/`) are currently scanned?
   - Which directories are missing from the categorization map (e.g., current user profile vs. other users, `/Applications`, `/opt`, `/usr/local`, `/private/var/folders`, `/private/var/vm`, hidden `.Spotlight-V100` / `.fseventsd`, Docker/VM raw disks)?
   - How does the scanner handle `EPERM` / `EACCES` errors when Full Disk Access or root privilege (represented by the key icon on "Run again") is not granted?
3. **Duplication & Hardlinks/Clones**:
   - Does the scanner use physical allocated blocks (`st_blocks * 512`) or logical file size (`st_size`)? (Using logical size inflates sparse files like Docker `Docker.raw` or sleep images).
4. **Proposed Fix Plan**:
   - List the exact files and functions that need to be updated in Phase 2 (Categorization Engine), Phase 3 (UI Representation), and Phase 4 (Space Management Actions).
```

---

## Phase 2: Fix Data Categorization & Resolve the 50 GB Mystery

Once the agent confirms how the scanner works, run this prompt to fix the backend categorization and eliminate false residual reporting:

```markdown
### Prompt — Phase 2: Overhaul Storage Categorization & Snapshot Detection

Update the storage scanning and categorization engine for the "Inside the Data volume" feature so that every gigabyte is accurately attributed and nothing is falsely hidden inside "Snapshots & purgeable":

1. **Separate Real Snapshots, Purgeable Space, and Unaccounted/Protected Data**:
   - **APFS Snapshots**: Enumerate actual APFS snapshots using `diskutil apfs listSnapshots /System/Volumes/Data` (or `tmutil listlocalsnapshots /`). Parse snapshot names, creation dates, and—where available—private/exclusive size or delta estimates. Distinguish Time Machine snapshots (`com.apple.TimeMachine.*`) from macOS update/third-party snapshots (`com.apple.os.update-*`, Carbon Copy Cloner, etc.).
   - **macOS Purgeable Space**: Query native volume capacity keys (`volumeAvailableCapacityForImportantUsageKey` minus `volumeAvailableCapacityKey`) so purgeable space is reported distinctly from APFS snapshots.
   - **Unindexed / Permission-Restricted Data**: Never dump residual unmeasured space into "Snapshots & purgeable." If `Total Volume Used - (Measured Files + Real Purgeable)` leaves a gap, report it explicitly as **"Unindexed or Permission-Restricted"** and list which directories returned `EPERM`/`EACCES` so the user knows why.

2. **Expand & Granularize Data Volume Categories**:
   Ensure the scanner covers all major footprints on `/System/Volumes/Data` using physical allocated disk blocks (`blocks * 512`, not logical sparse file size) and returns sub-items (top 5–10 child directories/files per category):
   - **APFS Snapshots & Purgeable** (broken into: _Local Time Machine Snapshots_, _System Update Snapshots_, and _macOS Evictable/Purgeable Cache_)
   - **Current User & Other Users** (`/Users/<username>` broken down into `Library/Caches`, `Library/Application Support`, `Library/Developer` [Xcode DerivedData/Simulators], `Library/Containers` [Docker/Apps], and standard folders; plus other accounts like `User: arpitpatidar`)
   - **Developer & Package Managers** (`/opt/homebrew`, `/usr/local`, `/Library/Developer`, Docker/OrbStack/VM data)
   - **System Data & Databases** (`/private/var/folders`, `/private/var/db`, `/private/var/log`, `/System/Volumes/Data/.Spotlight-V100`, diagnostics)
   - **Shared `/Library` & `/Applications`** (system-wide app support, caches, audio/video plugins)
   - **macOS Installer & Update Leftovers** (`/Library/Updates`, `/macOS Install Data`, incomplete `.pkg`/`.dmg` installers)
   - **VM Swap & Sleep Image** (`/private/var/vm/swapfile*`, `sleepimage`)

3. **Data Model Update**:
   - Update the category data structure to include: `id`, `title`, `subtitle`, `totalBytes`, `percentageOfVolume`, `severity` (`normal`, `warning`, `actionable`), `permissionBlockedCount`, `subItems` (array of `{ name, path, bytes, isDeletable, kind }`), and `availableActions`.
```

---

## Phase 3: Upgrade UI Data Representation & Drill-Down Visibility

After the backend returns accurate, hierarchical data, run this prompt to upgrade the UI from flat static progress bars to an interactive breakdown:

```markdown
### Prompt — Phase 3: Redesign "Inside the Data Volume" UI for Deep Visibility

Improve the "Inside the Data volume" UI component to give clear visual hierarchy and interactive drill-down into every category (especially the 50 GB "Snapshots & purgeable" and user/system categories):

1. **Top Summary & Segmented Volume Bar**:
   - Add a header summary bar showing **Total Data Volume Used** vs. **Reclaimable / Purgeable Space** vs. **Free Space**, with a multi-segment color-coded bar at the top so the user immediately sees proportional usage across all categories.
   - Standardize individual row progress bars so their fill width is proportional to the Data volume total (with a subtle secondary indicator showing the share of reclaimable space).

2. **Expandable Accordion Rows (Sub-Category Drill-Down)**:
   - Make every category row clickable/expandable with a smooth chevron toggle.
   - When **"Snapshots & purgeable"** is expanded, display:
     - A clear split between **APFS Local Snapshots** (listing each snapshot ID/timestamp, e.g., `com.apple.TimeMachine.2026-10-24-220511.local`) and **macOS Purgeable Cache**.
     - An explanation badge if space is held by active Time Machine local backups or iCloud Drive local cache.
   - When any **File/Folder Category** (e.g., _User: arpitpatidar_, _System databases_, _Shared /Library_, _macOS installer files_) is expanded, display the top contributing subdirectories/files with their exact path, file/folder icon, and size in GB/MB.

3. **Permission & Elevated Scan Status Banner**:
   - If any directories were skipped due to missing Full Disk Access or root permissions (indicated by the key icon on "Run again"), display a clear inline status pill on affected rows (e.g., `"Partial scan — grant Full Disk Access or click 'Run again' with admin privileges"`) instead of silently skewing the numbers.
```

---

## Phase 4: Add Interactive Data & Snapshot Management Actions

Finally, run this prompt to let users act directly on the space hogs from inside the UI:

```markdown
### Prompt — Phase 4: Implement Safe Data Management & Space Reclaim Actions

Add interactive management controls inside each expanded category row in "Inside the Data volume" so the user can inspect and reclaim disk space safely:

1. **Snapshot & Purgeable Management Actions**:
   - **Delete Individual / All Local Snapshots**: Add a `"Delete Snapshot"` action next to listed Time Machine local snapshots (`tmutil deletelocalsnapshots <date>`) and a `"Thin Local Snapshots"` button (`tmutil thinlocalsnapshots / <bytes> 4`) to force macOS to release up to the 50+ GB of snapshot space.
   - **Trigger Purgeable Space Cleanup**: Provide an action that invokes safe macOS cache/snapshot reclamation and refreshes the volume metrics immediately after completion.

2. **File & Directory Management Actions**:
   - **Reveal in Finder**: Add a quick action icon (`Reveal in Finder` / `open -R <path>`) on every sub-item row so the user can inspect the exact folder on disk.
   - **Safe Clean / Move to Trash**: For safe-to-remove items (_macOS installer files_, _System logs/diagnostics_, _Unused caches_), add a `"Clean…"` or `"Move to Trash"` button with a confirmation modal showing the exact paths and total GB to be freed.
   - **Cross-Account Guidance (`User: <name>`)**: For other user accounts (like `User: arpitpatidar`), show whether the folder is locked by permissions, allow inspecting its top folders when run with admin privileges (via the `"Run again"` key action), and provide a shortcut to open **System Settings > Users & Groups** if the account is no longer needed.

3. **Live Post-Action Refresh & Feedback**:
   - Show a loading state during cleanup/snapshot deletion, display a toast with the exact amount of space reclaimed (e.g., `"Reclaimed 42.8 GB from APFS snapshots"`), and automatically re-compute the category bars without requiring a full manual rescan.
```
