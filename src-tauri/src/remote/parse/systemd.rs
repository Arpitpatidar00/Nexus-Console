// `units` / `failed` sections: `systemctl … --no-legend --plain`.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Unit {
    pub unit: String,
    pub description: String,
}

/// `UNIT LOAD ACTIVE SUB DESCRIPTION…`. A leading `●` (older systemd ignores
/// `--plain` for failed units) is skipped.
pub fn parse_units(body: Option<&str>) -> Vec<Unit> {
    body.unwrap_or("")
        .lines()
        .filter_map(|l| {
            let mut cols = l.split_whitespace().skip_while(|c| *c == "●" || *c == "*");
            let unit = cols.next()?;
            if !unit.contains('.') {
                return None;
            }
            let description = cols.skip(3).collect::<Vec<_>>().join(" ");
            Some(Unit {
                unit: unit.to_string(),
                description,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bullets_and_junk() {
        let u = parse_units(Some(
            "● nginx.service loaded failed failed A high performance web server\n\
             0 loaded units listed.\n\n",
        ));
        assert_eq!(
            u,
            [Unit {
                unit: "nginx.service".into(),
                description: "A high performance web server".into()
            }]
        );
    }
}
