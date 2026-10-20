# Phase 11: Dev Toolbox, Domains & Uptime, Secrets Scanner — Specification

> **Phase:** P11  
> **Target Branch:** `feat/mac-clean`  
> **Status:** Implementing

---

## 1. Overview & Goals

Phase 11 introduces three powerful modules to enhance developer workflow efficiency, external asset visibility, and repo security:

1. **Dev Toolbox (`toolbox`, Group: Tools, Enabled by Default):**
   - 100% offline client-side developer utility suite.
   - Zero telemetry, zero cloud calls, zero persistence unless deliberately copied.
   - Utilities:
     - **JSON:** Pretty-print (2 spaces), minify, syntax error locator with line/column indicator.
     - **JWT:** Decoder for header, payload claims, signature split, human-readable expiration countdown.
     - **Base64 & URL:** Bidirectional encoder/decoder with UTF-8 support.
     - **Timestamp:** Epoch seconds/milliseconds ↔ ISO 8601 / RFC 2822 / local time with timezone selector.
     - **UUID:** v4 & v7 generator, syntax parser and timestamp extractor.
     - **Regex:** Interactive regex tester with live match highlight, capture groups table, and flag toggles.
     - **Cron:** Expression parser & plain-English explainer with next 5 run calculations.
     - **Hashes:** MD5, SHA-1, SHA-256 via Web Crypto API with hex string generation.
     - **Color:** HEX ↔ RGB ↔ HSL converter with live visual preview chip.

2. **Domains & Uptime (`domains`, Group: Remote, Opt-In):**
   - **Domains Inspector:**
     - Registration expiry via RDAP (HTTPS query to `rdap.org`).
     - DNS records (A, AAAA, CNAME, MX, TXT, NS) via system resolver / `dig`.
     - SSL certificate check (expiration, days remaining, issuer, SANs) via TLS handshake to port 443.
     - Multi-resolver propagation comparison across Cloudflare (1.1.1.1), Google (8.8.8.8), and Quad9 (9.9.9.9).
   - **Uptime Monitoring:**
     - User adds HTTP/HTTPS URLs with configurable check intervals (1 to 15 min).
     - Persisted in local JSON: `uptime-monitors.json`.
     - Rolling 50-check ping history recording status code and latency (ms).
     - State transitions (UP ↔ DOWN) and expiring SSL certificates (< 14 days) generate notifications.

3. **Secrets Scanner (`secrets`, Group: Tools, Opt-In):**
   - Scans projects registered in Stackroost:
     - Plaintext secrets tracked by Git (`git ls-files` against AWS, Stripe, GitHub PATs, private keys, slack tokens, Google API keys).
     - `.env` files that are present but not gitignored.
     - High-risk patterns in shell history (`~/.zsh_history`) with explicit user consent toggle.
   - **Privacy & Security Contract:**
     - Only **masked** previews (`AKIA****************`) are returned over IPC or rendered in UI.
     - Values are never persisted to disk or sent across any network.
     - Clear remediation guides (`git rm --cached`, `.gitignore` additions, key rotation).

---

## 2. IPC Commands

- `domains_lookup_dns(domain)`: Resolves DNS records for a domain.
- `domains_check_ssl(domain, port)`: Inspects TLS certificate chain and expiry on target host:port.
- `domains_check_rdap(domain)`: Fetches domain registration and expiry via RDAP.
- `domains_check_propagation(domain, record_type)`: Compares answers across 1.1.1.1, 8.8.8.8, 9.9.9.9.
- `uptime_list_monitors`: Loads configured monitors and their recent ping histories.
- `uptime_save_monitor(monitor)`: Adds or updates a monitor configuration.
- `uptime_delete_monitor(id)`: Removes a monitor and its history.
- `uptime_ping_now(url)`: Immediately tests target URL and returns latency, status, and SSL info.
- `secrets_scan_projects(paths)`: Scans Git repositories for tracked secrets and unignored `.env` files.
- `secrets_scan_history`: Scans shell history for exposed secrets (requires consent).
