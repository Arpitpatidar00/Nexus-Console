// `ports` section: `ss -H -tlnp`. Process names need root to see other users'
// sockets, so `process` is often `None`; that's expected, not an error.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Port {
    pub proto: String,
    pub local: String,
    pub port: u16,
    pub process: Option<String>,
}

pub fn parse_ports(body: Option<&str>) -> Vec<Port> {
    let mut out: Vec<Port> = Vec::new();
    for l in body.unwrap_or("").lines() {
        let cols: Vec<&str> = l.split_whitespace().collect();
        // State Recv-Q Send-Q Local Peer [Process]
        let Some(local) = cols.get(3) else { continue };
        let Some((addr, port)) = local.rsplit_once(':') else {
            continue;
        };
        let Ok(port) = port.parse::<u16>() else {
            continue;
        };
        let process = l
            .split_once("((\"")
            .and_then(|(_, rest)| rest.split_once('"'))
            .map(|(name, _)| name.to_string());
        let p = Port {
            proto: "tcp".into(),
            local: addr.to_string(),
            port,
            process,
        };
        if !out.iter().any(|o| o.local == p.local && o.port == p.port) {
            out.push(p);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn addresses_and_processes() {
        let p = parse_ports(Some(
            "LISTEN 0 4096 127.0.0.53%lo:53 0.0.0.0:* users:((\"systemd-resolve\",pid=1,fd=13))\n\
             LISTEN 0 511 [::]:80 [::]:*\n\
             LISTEN 0 511 [::]:80 [::]:*\n\
             nonsense\n",
        ));
        assert_eq!(p.len(), 2);
        assert_eq!(p[0].local, "127.0.0.53%lo");
        assert_eq!(p[0].port, 53);
        assert_eq!(p[0].process.as_deref(), Some("systemd-resolve"));
        assert_eq!(p[1].local, "[::]");
        assert_eq!(p[1].process, None);
    }
}
