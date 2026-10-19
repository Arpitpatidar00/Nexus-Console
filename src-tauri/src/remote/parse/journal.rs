// `oom` and `errors` sections (systemd journal).

const MAX_ERROR_LINES: usize = 50;

/// Kernel OOM kills in the last 24h, or `None` when the journal wasn't readable.
pub fn parse_oom(body: Option<&str>) -> Option<u32> {
    body?.trim().parse().ok()
}

pub fn parse_errors(body: Option<&str>) -> Vec<String> {
    let lines: Vec<String> = body
        .unwrap_or("")
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && *l != "-- No entries --")
        .map(String::from)
        .collect();
    let skip = lines.len().saturating_sub(MAX_ERROR_LINES);
    lines.into_iter().skip(skip).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oom_and_errors() {
        assert_eq!(parse_oom(Some("3\n")), Some(3));
        assert_eq!(parse_oom(Some("")), None);
        assert_eq!(parse_oom(None), None);
        assert!(parse_errors(Some("-- No entries --")).is_empty());
        let many: String = (0..60).map(|i| format!("line {i}\n")).collect();
        let e = parse_errors(Some(&many));
        assert_eq!(e.len(), 50);
        assert_eq!(e[0], "line 10");
    }
}
