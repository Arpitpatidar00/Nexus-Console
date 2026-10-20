// Deep-scan progress messages, keyed by probe id (unknown ids fall back to a
// generic line, so a new probe never breaks the loader).
export const PROBE_LABELS: Record<string, string> = {
  low_power_mode: 'Checking Low Power Mode…',
  memory_truth: 'Checking memory pressure…',
  backup_risk: 'Checking Time Machine…',
  startup_items: 'Checking startup items…',
  disk_free: 'Checking free disk space…',
  load_vs_cores: 'Checking CPU load…',
  ollama_models: 'Scanning ollama models…',
  vscode_orphans: 'Scanning VSCode workspace caches…',
  state_db_bloat: 'Checking VSCode databases…',
  extension_audit: 'Scanning VSCode extensions…',
  browser_processes: 'Scanning browsers…',
  browser_audio: 'Checking browser audio & background settings…',
  browser_storage: 'Measuring browser caches…',
  browser_extensions: 'Scanning browser extensions…',
  node_modules_sweep: 'Sweeping node_modules folders…',
  dev_caches: 'Measuring dev caches…',
};
