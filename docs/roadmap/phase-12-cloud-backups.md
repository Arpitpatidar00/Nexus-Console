# Phase 12: Cloud (AWS), Backups, Network & Chaos Proxy — Specification

> **Phase:** P12  
> **Target Branch:** `feat/mac-clean`  
> **Status:** Implementing

---

## 1. Overview & Goals

Phase 12 delivers infrastructure control, disaster recovery, diagnostic networking, and resiliency testing:

1. **Cloud (AWS) (`cloud`, Group: Remote, Opt-In):**
   - **CLI & Profile Discovery:** Uses `aws configure list-profiles` and parses profile sections from `~/.aws/config`. Strictly never reads `~/.aws/credentials` directly.
   - **EC2 Instance Explorer:**
     - Lists instances per region (Instance ID, Name, State, Type, Public/Private IP, Tags).
     - Lifecycle actions: Start, Stop, Reboot with native confirmation dialogs.
     - `env=prod` tagged instances automatically enforce `ProdConfirmDialog`.
     - "Add to Servers" button pre-populates remote SSH host connection with instance IP/DNS.
   - **Cost Explorer:**
     - Queries `aws ce get-cost-and-usage` for month-to-date and past 3 months.
     - Daily disk cache (`aws-cost-cache.json`) to prevent unnecessary API fees ($0.01 per request).
   - **S3 Bucket Inspector:**
     - Lists bucket names, regions, and creation dates via `aws s3api list-buckets`. Never lists objects in v1 for speed and low cost.

2. **Backups Engine (`backups`, Group: Remote, Opt-In):**
   - **Database Dumps:**
     - Local database backup (Postgres, MySQL, Mongo).
     - Remote database backup streamed securely over SSH pipe directly into local storage (`0600` permissions), never persisting an unencrypted intermediate dump on the remote server.
     - Storage location defaults to `~/.stackroost/backups`.
     - Automatic retention pruning: keeps last N backups (default 5).
     - **Strict Rust Barrier:** Restore is strictly permitted only to local databases or containers; restoring to remote hosts is blocked in Rust.
   - **Project `.env` Backups:**
     - Timestamped snapshot of `.env*` files for tracked projects with `0600` permissions.

3. **Network Diagnostics & Hosts Editor (`network`, Group: This Mac, Opt-In):**
   - **Per-App Live Bandwidth:** Real-time throughput using macOS `nettop -P -L 1 -J bytes_in,bytes_out`.
   - **Interfaces & DNS:** Inspects active network interfaces and DNS resolvers via `scutil --dns` and `scutil --nwi`.
   - **DNS Flush:** Native one-click DNS flush (`dscacheutil -flushcache; killall -HUP mDNSResponder`).
   - **Structured `/etc/hosts` Editor:**
     - Parses hosts file entries into structured rows.
     - Automatic backup created before every edit.
     - One-click rollback to previous `/etc/hosts` backup.

4. **Chaos TCP Proxy (`src-tauri/src/services/chaos/`):**
   - User-space TCP proxy binding to `127.0.0.1:<chaos_port>` forwarding to `127.0.0.1:<target_port>`.
   - Injection profiles:
     - Latency injection (+80ms, +300ms, +1000ms).
     - Packet drop simulation (10%, 25%, 50%).
     - Connection rejection / reset.
   - All proxies automatically closed on application shutdown.

---

## 2. IPC Commands

- `aws_list_profiles`: Returns available AWS CLI profiles.
- `aws_list_ec2_instances(profile, region)`: Lists EC2 instances.
- `aws_instance_action(profile, region, instance_id, action)`: Starts, stops, or reboots an EC2 instance.
- `aws_get_costs(profile)`: Returns cached or freshly queried AWS cost explorer summary.
- `aws_list_s3_buckets(profile)`: Lists S3 buckets.
- `backup_create_db(config)`: Executes local or SSH-streamed database backup.
- `backup_list_history`: Enumerates existing backup archives and metadata.
- `backup_delete(id)`: Removes a backup archive.
- `backup_env_files(project_path)`: Backs up `.env*` files for a project.
- `network_get_interfaces`: Retrieves network interfaces and DNS servers.
- `network_get_bandwidth`: Retrieves per-process network traffic from `nettop`.
- `network_flush_dns`: Flushes macOS DNS cache.
- `network_get_hosts`: Reads `/etc/hosts` entries and backup list.
- `network_save_hosts(entries)`: Backs up and writes `/etc/hosts`.
- `network_restore_hosts(backup_id)`: Restores `/etc/hosts` from a backup.
- `chaos_start_proxy(target_port, chaos_port, profile)`: Spawns a chaos TCP proxy.
- `chaos_stop_proxy(proxy_id)`: Stops an active chaos TCP proxy.
- `chaos_list_proxies`: Returns list of currently active chaos proxies.
