// Memory & swap (docs/maclean/PLAN.md §4): Activity Monitor's composition from
// `vm_stat`, kernel pressure, swap, whether the Mac is swapping *now*, and the
// apps holding the most memory. Read-only, and cheap enough to poll every few
// seconds (a handful of sysctls, one vm_stat, one ps).

use serde::Serialize;
use std::collections::HashMap;
use std::process::Command;
use std::sync::Mutex;
use std::time::Instant;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct VmStat {
    pub page_size: u64,
    pub anonymous: u64,
    pub purgeable: u64,
    pub wired: u64,
    pub compressor: u64,
    pub file_backed: u64,
    pub swapins: u64,
    pub swapouts: u64,
}

/// `vm_stat`: "(page size of 16384 bytes)" then `Name:   1234.` lines (pages).
pub fn parse_vm_stat(out: &str) -> Option<VmStat> {
    let page_size = out
        .lines()
        .next()?
        .split("page size of ")
        .nth(1)?
        .split_whitespace()
        .next()?
        .parse()
        .ok()?;
    let mut map: HashMap<&str, u64> = HashMap::new();
    for l in out.lines().skip(1) {
        if let Some((k, v)) = l.split_once(':') {
            if let Ok(n) = v.trim().trim_end_matches('.').parse::<u64>() {
                map.insert(k.trim().trim_matches('"'), n);
            }
        }
    }
    let g = |k: &str| map.get(k).copied().unwrap_or(0);
    Some(VmStat {
        page_size,
        anonymous: g("Anonymous pages"),
        purgeable: g("Pages purgeable"),
        wired: g("Pages wired down"),
        compressor: g("Pages occupied by compressor"),
        file_backed: g("File-backed pages"),
        swapins: g("Swapins"),
        swapouts: g("Swapouts"),
    })
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Composition {
    pub total_bytes: u64,
    /// App memory: anonymous (process) pages that can't simply be dropped.
    pub app_bytes: u64,
    pub wired_bytes: u64,
    pub compressed_bytes: u64,
    /// Cached files: file-backed + purgeable, given back the moment apps need it.
    pub cached_bytes: u64,
    pub free_bytes: u64,
    /// Activity Monitor's "Memory Used" = app + wired + compressed.
    pub used_bytes: u64,
}

pub fn composition(v: &VmStat, total: u64) -> Composition {
    let p = v.page_size;
    let app = v.anonymous.saturating_sub(v.purgeable) * p;
    let wired = v.wired * p;
    let compressed = v.compressor * p;
    let cached = (v.file_backed + v.purgeable) * p;
    let used = app + wired + compressed;
    Composition {
        total_bytes: total,
        app_bytes: app,
        wired_bytes: wired,
        compressed_bytes: compressed,
        cached_bytes: cached,
        free_bytes: total.saturating_sub(used + cached),
        used_bytes: used,
    }
}

/// `vm.swapusage`: "total = 5120.00M  used = 3705.88M  free = 1414.12M  (encrypted)".
pub fn parse_swapusage(out: &str) -> Option<(u64, u64)> {
    let field = |name: &str| -> Option<u64> {
        let v = out
            .split(&format!("{name} = "))
            .nth(1)?
            .split_whitespace()
            .next()?;
        let (num, unit) = v.split_at(v.len().checked_sub(1)?);
        let mult: f64 = match unit {
            "K" => 1024.0,
            "M" => 1024.0 * 1024.0,
            "G" => 1024.0 * 1024.0 * 1024.0,
            _ => return None,
        };
        Some((num.parse::<f64>().ok()? * mult) as u64)
    };
    Some((field("total")?, field("used")?))
}

/// `kern.boottime`: "{ sec = 1792175205, usec = 677612 } Fri Oct 16 …".
pub fn parse_boottime(out: &str) -> Option<u64> {
    out.split("sec = ")
        .nth(1)?
        .split(',')
        .next()?
        .trim()
        .parse()
        .ok()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppMemory {
    pub name: String,
    pub processes: u32,
    /// Resident memory summed over the app's processes. Shared pages count
    /// once per process, so this overstates a little; it ranks apps honestly.
    pub bytes: u64,
}

/// The app a process belongs to: the OUTERMOST `.app` in its path, so every
/// Chrome / Electron helper rolls up into its parent app.
pub fn app_name(comm: &str) -> String {
    if let Some(i) = comm
        .find(".app/")
        .or_else(|| comm.ends_with(".app").then(|| comm.len() - 4))
    {
        let before = &comm[..i];
        return before.rsplit('/').next().unwrap_or(before).to_string();
    }
    comm.rsplit('/').next().unwrap_or(comm).to_string()
}

/// `ps -axo pid=,rss=,comm=` (RSS in KB) grouped by app, biggest first.
pub fn top_apps(ps: &str, n: usize) -> Vec<AppMemory> {
    let mut by: HashMap<String, (u32, u64)> = HashMap::new();
    for l in ps.lines() {
        let mut it = l.split_whitespace();
        let (Some(_pid), Some(rss)) = (it.next(), it.next()) else {
            continue;
        };
        let Ok(kb) = rss.parse::<u64>() else { continue };
        let comm = it.collect::<Vec<_>>().join(" ");
        if comm.is_empty() {
            continue;
        }
        let e = by.entry(app_name(&comm)).or_default();
        e.0 += 1;
        e.1 += kb * 1024;
    }
    let mut v: Vec<AppMemory> = by
        .into_iter()
        .map(|(name, (processes, bytes))| AppMemory {
            name,
            processes,
            bytes,
        })
        .collect();
    v.sort_by_key(|a| std::cmp::Reverse(a.bytes));
    v.truncate(n);
    v
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Pressure {
    Normal,
    Warning,
    Critical,
    Unknown,
}

pub fn pressure(level: Option<u32>) -> Pressure {
    match level {
        Some(1) => Pressure::Normal,
        Some(2) => Pressure::Warning,
        Some(4) => Pressure::Critical,
        _ => Pressure::Unknown,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryReport {
    pub sampled_at_ms: u64,
    pub composition: Composition,
    pub pressure: Pressure,
    pub swap_total_bytes: u64,
    pub swap_used_bytes: u64,
    /// Bytes written to swap per second since the previous sample: > 0 means
    /// the Mac is swapping right now (slow). `None` on the first sample.
    pub swapout_bytes_per_sec: Option<f64>,
    pub uptime_secs: u64,
    /// Swap > 2 GB and up more than a week: a restart would genuinely help.
    pub restart_suggested: bool,
    pub top_apps: Vec<AppMemory>,
}

/// The previous sample, for the swap-out rate.
#[derive(Default)]
pub struct Sampler(Mutex<Option<(Instant, u64)>>);

impl Sampler {
    pub fn rate(&self, swapouts: u64) -> Option<f64> {
        let mut g = self.0.lock().ok()?;
        let now = Instant::now();
        let prev = g.replace((now, swapouts));
        let (t, before) = prev?;
        let secs = now.duration_since(t).as_secs_f64();
        (secs >= 0.5).then(|| swapouts.saturating_sub(before) as f64 / secs)
    }
}

fn sysctl(name: &str) -> Option<String> {
    let o = Command::new("/usr/sbin/sysctl")
        .args(["-n", name])
        .output()
        .ok()?;
    o.status
        .success()
        .then(|| String::from_utf8_lossy(&o.stdout).trim().to_string())
}

pub fn sample(sampler: &Sampler, now_epoch: u64) -> Option<MemoryReport> {
    let vm = Command::new("/usr/bin/vm_stat").output().ok()?;
    let vm = parse_vm_stat(&String::from_utf8_lossy(&vm.stdout))?;
    let total: u64 = sysctl("hw.memsize")?.parse().ok()?;
    let (swap_total, swap_used) = sysctl("vm.swapusage")
        .and_then(|s| parse_swapusage(&s))
        .unwrap_or((0, 0));
    let uptime = sysctl("kern.boottime")
        .and_then(|s| parse_boottime(&s))
        .map_or(0, |b| now_epoch.saturating_sub(b));
    let ps = Command::new("/bin/ps")
        .args(["-axo", "pid=,rss=,comm="])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default();
    Some(MemoryReport {
        sampled_at_ms: now_epoch * 1000,
        composition: composition(&vm, total),
        pressure: pressure(
            sysctl("kern.memorystatus_vm_pressure_level").and_then(|s| s.parse().ok()),
        ),
        swap_total_bytes: swap_total,
        swap_used_bytes: swap_used,
        swapout_bytes_per_sec: sampler
            .rate(vm.swapouts)
            .map(|pages| pages * vm.page_size as f64),
        uptime_secs: uptime,
        restart_suggested: swap_used > 2 * 1024 * 1024 * 1024 && uptime > 7 * 86_400,
        top_apps: top_apps(&ps, 10),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> String {
        std::fs::read_to_string(format!(
            "{}/../fixtures/maclean/{name}",
            env!("CARGO_MANIFEST_DIR")
        ))
        .unwrap()
    }

    #[test]
    fn vm_stat_and_composition_add_up() {
        let v = parse_vm_stat(&fixture("vm_stat.txt")).unwrap();
        assert_eq!(v.page_size, 16_384);
        assert_eq!(v.anonymous, 142_719);
        assert_eq!(v.compressor, 150_687);
        assert_eq!(v.swapouts, 30_023_389);
        let total: u64 = fixture("sysctl-memsize.txt").trim().parse().unwrap();
        let c = composition(&v, total);
        assert_eq!(c.app_bytes, 142_719 * 16_384);
        assert_eq!(
            c.used_bytes,
            c.app_bytes + c.wired_bytes + c.compressed_bytes
        );
        assert_eq!(c.used_bytes + c.cached_bytes + c.free_bytes, total);
        assert!(parse_vm_stat("garbage").is_none());
    }

    #[test]
    fn swap_boot_and_pressure() {
        let (t, u) = parse_swapusage(&fixture("sysctl-swapusage.txt")).unwrap();
        assert_eq!(t, 5120 * 1024 * 1024);
        assert_eq!(u, (3705.88 * 1024.0 * 1024.0) as u64);
        assert_eq!(
            parse_swapusage("total = 0.00M  used = 0.00M  free = 0.00M"),
            Some((0, 0))
        );
        assert_eq!(
            parse_boottime(&fixture("sysctl-boottime.txt")),
            Some(1_792_175_205)
        );
        assert_eq!(
            pressure(fixture("sysctl-pressure.txt").trim().parse().ok()),
            Pressure::Warning
        );
        assert_eq!(pressure(Some(1)), Pressure::Normal);
        assert_eq!(pressure(Some(4)), Pressure::Critical);
        assert_eq!(pressure(None), Pressure::Unknown);
    }

    #[test]
    fn helpers_roll_up_into_their_app() {
        assert_eq!(
            app_name("/Applications/Antigravity IDE.app/Contents/Frameworks/Antigravity IDE Helper (Renderer).app/Contents/MacOS/Antigravity IDE Helper (Renderer)"),
            "Antigravity IDE"
        );
        assert_eq!(
            app_name("/System/Library/CoreServices/Finder.app/Contents/MacOS/Finder"),
            "Finder"
        );
        assert_eq!(app_name("/usr/libexec/logd"), "logd");
        assert_eq!(app_name("node"), "node");
        let top = top_apps(&fixture("ps-rss.txt"), 10);
        assert_eq!(top.len(), 10);
        assert!(top.windows(2).all(|w| w[0].bytes >= w[1].bytes));
        assert!(top.iter().any(|a| a.processes > 1), "helpers grouped");
        assert!(
            !top.iter().any(|a| a.name.contains("Helper")),
            "no helper leaks out as its own app"
        );
    }

    #[test]
    fn swapout_rate_needs_two_samples() {
        let s = Sampler::default();
        assert_eq!(s.rate(100), None);
        *s.0.lock().unwrap() = Some((Instant::now() - std::time::Duration::from_secs(2), 100));
        let r = s.rate(300).unwrap();
        assert!((r - 100.0).abs() < 5.0, "{r}");
    }

    /// Wire format for the frontend's zod test (`maclean.schema.test.ts`).
    /// Regenerate with `UPDATE_GOLDEN=1 cargo test maclean_memory_golden`.
    #[test]
    fn maclean_memory_golden_json() {
        let v = parse_vm_stat(&fixture("vm_stat.txt")).unwrap();
        let total: u64 = fixture("sysctl-memsize.txt").trim().parse().unwrap();
        let (st, su) = parse_swapusage(&fixture("sysctl-swapusage.txt")).unwrap();
        let r = MemoryReport {
            sampled_at_ms: 1_792_435_438_000,
            composition: composition(&v, total),
            pressure: Pressure::Warning,
            swap_total_bytes: st,
            swap_used_bytes: su,
            swapout_bytes_per_sec: Some(204_800.0),
            uptime_secs: 260_233,
            restart_suggested: false,
            top_apps: top_apps(&fixture("ps-rss.txt"), 3),
        };
        let json = serde_json::to_string_pretty(&r).unwrap() + "\n";
        let path = format!(
            "{}/../fixtures/maclean/memory.json",
            env!("CARGO_MANIFEST_DIR")
        );
        if std::env::var_os("UPDATE_GOLDEN").is_some() {
            std::fs::write(&path, &json).unwrap();
        }
        assert_eq!(
            json,
            std::fs::read_to_string(&path).unwrap_or_default(),
            "rerun with UPDATE_GOLDEN=1"
        );
    }

    // Live sample of this Mac. Ignored in CI.
    #[test]
    #[ignore]
    fn real_memory_sample() {
        let s = Sampler::default();
        let r = sample(&s, crate::doctor::claude::now_epoch()).unwrap();
        std::thread::sleep(std::time::Duration::from_secs(1));
        let r2 = sample(&s, crate::doctor::claude::now_epoch()).unwrap();
        let gb = |b: u64| b as f64 / 1073741824.0;
        let c = r.composition;
        println!(
            "used {:.2} (app {:.2} wired {:.2} compressed {:.2}) cached {:.2} free {:.2} of {:.0} GB · {:?} · swap {:.2}/{:.2} GB · swapout B/s {:?} · up {} h",
            gb(c.used_bytes), gb(c.app_bytes), gb(c.wired_bytes), gb(c.compressed_bytes), gb(c.cached_bytes),
            gb(c.free_bytes), gb(c.total_bytes), r.pressure, gb(r.swap_used_bytes), gb(r.swap_total_bytes),
            r2.swapout_bytes_per_sec, r.uptime_secs / 3600
        );
        for a in &r.top_apps {
            println!(
                "  {:<40} {:>3} procs {:>6.2} GB",
                a.name,
                a.processes,
                gb(a.bytes)
            );
        }
    }
}
