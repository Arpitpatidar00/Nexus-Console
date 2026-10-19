// `mem` section: /proc/meminfo (values in kB).

use serde::Serialize;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInfo {
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub swap_total_bytes: u64,
    pub swap_free_bytes: u64,
}

pub fn parse_mem(body: Option<&str>) -> MemoryInfo {
    let get = |key: &str| -> Option<u64> {
        body?.lines().find_map(|l| {
            let (k, v) = l.split_once(':')?;
            (k.trim() == key)
                .then(|| v.split_whitespace().next()?.parse::<u64>().ok())
                .flatten()
                .map(|kb| kb * 1024)
        })
    };
    // MemAvailable is missing on pre-3.14 kernels; approximate it the old way.
    let available = get("MemAvailable").unwrap_or_else(|| {
        get("MemFree").unwrap_or(0) + get("Buffers").unwrap_or(0) + get("Cached").unwrap_or(0)
    });
    MemoryInfo {
        total_bytes: get("MemTotal").unwrap_or(0),
        available_bytes: available,
        swap_total_bytes: get("SwapTotal").unwrap_or(0),
        swap_free_bytes: get("SwapFree").unwrap_or(0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_kernels_without_mem_available() {
        let m = parse_mem(Some(
            "MemTotal: 1000 kB\nMemFree: 100 kB\nBuffers: 50 kB\nCached: 250 kB",
        ));
        assert_eq!(m.total_bytes, 1000 * 1024);
        assert_eq!(m.available_bytes, 400 * 1024);
        assert_eq!(m.swap_total_bytes, 0);
    }

    #[test]
    fn junk_is_zeroes() {
        assert_eq!(parse_mem(Some("MemTotal: lots")), MemoryInfo::default());
        assert_eq!(parse_mem(None), MemoryInfo::default());
    }
}
