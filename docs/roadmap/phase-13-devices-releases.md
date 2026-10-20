# Phase 13 Spec — Mobile Devices, App Releases, and Local AI Explain

## Scope

1. **13.1 Mobile Devices (iOS Simulators & Android Emulators):**
   - iOS Simulators via `xcrun simctl list devices --json`:
     - Discovers installed iOS, watchOS, tvOS runtimes and simulator devices.
     - Device metadata: name, UDID, state (`Booted`, `Shutdown`), runtime version.
     - Controls: Boot simulator (`xcrun simctl boot`), Shutdown simulator (`xcrun simctl shutdown`), Open Simulator app, Erase simulator.
   - Android Emulators via `emulator -list-avds` & `adb devices`:
     - Discovers defined AVDs and active ADB emulator instances.
     - Controls: Launch AVD (`emulator -avd <name>`), cold boot, wipe data.
   - Cache maintenance: 1-click Xcode DerivedData & Android Gradle cache cleanup.

2. **13.2 App Releases & Build Inspector:**
   - Detects mobile & cross-platform project configurations (React Native, Flutter, iOS Xcode, Android Gradle).
   - Fastlane integration (`Fastfile`, `Appfile`, `Matchfile` parsing).
   - Release tracks summary: Version, Build number, distribution targets (TestFlight, Google Play Internal/Beta/Production).
   - Fastlane lane execution / command generation.

3. **13.3 Local AI Assistant ("Explain" with Ollama):**
   - 100% offline local LLM assistant powered by Ollama on `http://127.0.0.1:11434`.
   - Discovers installed models via `/api/tags` (e.g. `llama3.2`, `qwen2.5-coder`, `deepseek-coder`).
   - "Explain with AI" for shell errors, server logs, regex patterns, cron syntax, and Docker configurations.
   - Guarded privacy: automatic regex secret masking before sending prompts, zero telemetry, local loopback only.

## Architecture

- **Backend Services (`src-tauri/src/services/`):**
  - `devices/mod.rs`: `list_ios_simulators`, `boot_ios_simulator`, `shutdown_ios_simulator`, `list_android_avds`, `launch_android_avd`.
  - `releases/mod.rs`: `detect_release_configs`, `list_fastlane_lanes`.
  - `ai/mod.rs`: `check_ollama_status`, `list_ollama_models`, `generate_explanation` with secret masking.
- **Tauri Commands (`src-tauri/src/commands/`):**
  - `commands::devices`: `devices_list_ios`, `devices_control_ios`, `devices_list_android`, `devices_launch_android`.
  - `commands::releases`: `releases_detect_config`, `releases_list_lanes`.
  - `commands::ai`: `ai_check_ollama`, `ai_explain`.
- **Frontend Modules (`src/features/`):**
  - `src/features/devices/`: iOS Simulators and Android AVDs manager.
  - `src/features/releases/`: Mobile & App Releases build inspector.
  - `src/features/ai/`: Ollama Local Assistant with prompt explain modal and model selector.
