// Files the app hands the user land in ~/Downloads under a name Rust picks —
// never a path the webview names (that would be a write-anywhere primitive).

use crate::error::{AppError, AppResult};
use std::path::PathBuf;

/// `~/Downloads/<name>`, suffixed ` (2)`, ` (3)`… instead of overwriting.
/// `name` must already be a bare file name.
pub fn destination(name: &str) -> AppResult<PathBuf> {
    if name.is_empty() || name == "." || name == ".." || name.contains('/') {
        return Err(AppError::InvalidName(format!("not a file name: {name}")));
    }
    let dir = crate::doctor::paths::home()
        .ok_or_else(|| AppError::NotFound("HOME not set".into()))?
        .join("Downloads");
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{e}")),
        _ => (name.to_string(), String::new()),
    };
    let mut candidate = dir.join(name);
    let mut n = 2;
    while candidate.exists() {
        candidate = dir.join(format!("{stem} ({n}){ext}"));
        n += 1;
    }
    Ok(candidate)
}

/// Standard base64 (padding optional, whitespace ignored) → bytes. Enough for
/// a canvas `toDataURL` payload; not worth a dependency.
pub fn decode_base64(s: &str) -> AppResult<Vec<u8>> {
    fn val(c: u8) -> Option<u32> {
        match c {
            b'A'..=b'Z' => Some((c - b'A') as u32),
            b'a'..=b'z' => Some((c - b'a') as u32 + 26),
            b'0'..=b'9' => Some((c - b'0') as u32 + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let bad = || AppError::Parse("invalid base64".into());
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let (mut acc, mut bits) = (0u32, 0u32);
    for &c in s.as_bytes() {
        if c.is_ascii_whitespace() {
            continue;
        }
        if c == b'=' {
            break;
        }
        acc = (acc << 6) | val(c).ok_or_else(bad)?;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_padded_and_unpadded_base64() {
        assert_eq!(decode_base64("aGVsbG8=").unwrap(), b"hello");
        assert_eq!(decode_base64("aGVsbG8").unwrap(), b"hello");
        assert_eq!(decode_base64("aGVs\nbG8h").unwrap(), b"hello!");
        assert_eq!(decode_base64("").unwrap(), b"");
        // PNG signature, as a canvas encodes it.
        assert_eq!(
            decode_base64("iVBORw0KGgo=").unwrap(),
            [0x89, b'P', b'N', b'G', 13, 10, 26, 10]
        );
        assert!(decode_base64("ab$c").is_err());
    }

    #[test]
    fn destinations_are_bare_names_in_downloads() {
        assert!(destination("../etc/passwd").is_err());
        assert!(destination("a/b.png").is_err());
        assert!(destination("..").is_err());
        let p = destination("stackroost-test-export-unlikely-name.svg").unwrap();
        assert!(p
            .to_string_lossy()
            .ends_with("Downloads/stackroost-test-export-unlikely-name.svg"));
    }
}
