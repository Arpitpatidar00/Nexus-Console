use crate::error::AppResult;
use crate::services::remote::ssh::{self, SshTarget};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// One `location` in a server block and where it sends traffic.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NginxRoute {
    pub path: String,
    /// `proxy_pass` target, `return …`, `root …`, or empty when the block only
    /// includes snippets.
    pub target: String,
    /// The trailing `# comment` on the line that set the target: configs often
    /// name the app there ("# fameo-backend").
    pub note: Option<String>,
}

/// One `server { … }` block: a site is a block, not a file — one file
/// routinely holds dev, staging, web and api together.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NginxSite {
    pub file: String,
    pub server_names: Vec<String>,
    pub listen_ports: Vec<u16>,
    pub ssl: bool,
    /// Every location answers with a redirect (the usual http → https block).
    pub redirect_only: bool,
    pub routes: Vec<NginxRoute>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NginxUpstream {
    pub name: String,
    pub servers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CronJob {
    pub source: String,
    /// The user column of /etc/cron.d entries; `None` for the ssh user's own crontab.
    pub user: Option<String>,
    pub schedule: String,
    pub command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InspectionData {
    pub nginx_installed: bool,
    pub nginx_active: bool,
    pub nginx_sites: Vec<NginxSite>,
    pub upstreams: Vec<NginxUpstream>,
    pub cron_jobs: Vec<CronJob>,
    pub reload_guidance: String,
}

// Debian keeps sites in sites-enabled/, RHEL and Amazon Linux in conf.d/.
// Read-only; files are capped so a huge generated config can't flood the pipe.
const INSPECT_SCRIPT: &str = r#"
echo "===NGINX_STATUS==="
if command -v nginx >/dev/null 2>&1 || [ -d /etc/nginx ]; then echo installed; fi
systemctl is-active nginx 2>/dev/null || echo "inactive"
echo "===NGINX_SITES==="
for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
  [ -f "$f" ] || continue
  echo "@@FILE:$f"
  head -c 200000 "$f" 2>/dev/null || true
  echo
done
echo "===CRON_USER==="
crontab -l 2>/dev/null || true
echo "===CRON_SYSTEM==="
for f in /etc/cron.d/*; do
  [ -f "$f" ] || continue
  echo "CROND:$(basename "$f")"
  cat "$f" 2>/dev/null || true
done
"#;

pub fn inspect_host(target: &SshTarget) -> AppResult<InspectionData> {
    let out = ssh::exec(
        target,
        &["sh", "-s"],
        Some(INSPECT_SCRIPT.as_bytes()),
        Duration::from_secs(15),
    )?;
    let text = String::from_utf8_lossy(&out.stdout);
    Ok(parse_inspection(&text))
}

pub fn parse_inspection(output: &str) -> InspectionData {
    let mut nginx_installed = false;
    let mut nginx_active = false;
    let mut nginx_sites = Vec::new();
    let mut upstreams = Vec::new();
    let mut cron_jobs = Vec::new();

    let mut section = "";
    let mut file: Option<(String, String)> = None;
    let mut current_crond = "";

    let flush = |file: &mut Option<(String, String)>,
                 sites: &mut Vec<NginxSite>,
                 ups: &mut Vec<NginxUpstream>| {
        if let Some((name, body)) = file.take() {
            let (s, u) = parse_nginx_file(&name, &body);
            sites.extend(s);
            ups.extend(u);
        }
    };

    for raw in output.lines() {
        let line = raw.trim();
        match line {
            "===NGINX_STATUS===" => {
                section = "status";
                continue;
            }
            "===NGINX_SITES===" => {
                section = "sites";
                continue;
            }
            "===CRON_USER===" => {
                flush(&mut file, &mut nginx_sites, &mut upstreams);
                section = "cron_user";
                continue;
            }
            "===CRON_SYSTEM===" => {
                section = "cron_system";
                continue;
            }
            _ => {}
        }

        match section {
            "status" => match line {
                "installed" => nginx_installed = true,
                "active" => {
                    nginx_installed = true;
                    nginx_active = true;
                }
                _ => {}
            },
            "sites" => {
                if let Some(path) = line.strip_prefix("@@FILE:") {
                    flush(&mut file, &mut nginx_sites, &mut upstreams);
                    file = Some((path.to_string(), String::new()));
                } else if let Some((_, body)) = file.as_mut() {
                    body.push_str(raw);
                    body.push('\n');
                }
            }
            "cron_user" => {
                if !line.is_empty() && !line.starts_with('#') {
                    if let Some((schedule, rest)) = split_schedule(line) {
                        cron_jobs.push(CronJob {
                            source: "crontab".to_string(),
                            user: None,
                            schedule,
                            command: rest.join(" "),
                        });
                    }
                }
            }
            "cron_system" => {
                if let Some(rest) = line.strip_prefix("CROND:") {
                    current_crond = rest;
                } else if !line.is_empty() && !line.starts_with('#') {
                    if let Some((schedule, rest)) = split_schedule(line) {
                        if let [user, cmd @ ..] = rest.as_slice() {
                            if !cmd.is_empty() {
                                cron_jobs.push(CronJob {
                                    source: format!("/etc/cron.d/{current_crond}"),
                                    user: Some(user.to_string()),
                                    schedule,
                                    command: cmd.join(" "),
                                });
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }
    flush(&mut file, &mut nginx_sites, &mut upstreams);

    InspectionData {
        nginx_installed,
        nginx_active,
        nginx_sites,
        upstreams,
        cron_jobs,
        reload_guidance: "sudo nginx -t && sudo systemctl reload nginx".to_string(),
    }
}

/// `m h dom mon dow rest…`, or `@reboot rest…`. Env lines (`PATH=…`) aren't jobs.
fn split_schedule(line: &str) -> Option<(String, Vec<&str>)> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.first()?.starts_with('@') {
        return (parts.len() >= 2).then(|| (parts[0].to_string(), parts[1..].to_vec()));
    }
    if parts.len() < 6 || parts[0].contains('=') {
        return None;
    }
    Some((parts[0..5].join(" "), parts[5..].to_vec()))
}

/// A directive or block from an nginx config, with the (0-based) line it ended on.
#[derive(Debug)]
struct Node {
    args: Vec<String>,
    line: usize,
    children: Option<Vec<Node>>,
}

/// Parsed blocks plus each line's trailing comment, for `Node::line` lookups.
struct Tree {
    nodes: Vec<Node>,
    comments: Vec<Option<String>>,
}

impl Tree {
    fn note(&self, n: &Node) -> Option<String> {
        self.comments.get(n.line).cloned().flatten()
    }
}

/// Enough of nginx's grammar for server/location/upstream: words, quotes,
/// `;`, `{`, `}` and `#` comments. Unbalanced braces just end the file.
fn parse_tree(body: &str) -> Tree {
    let mut stack: Vec<(Vec<String>, Vec<Node>)> = vec![(vec![], vec![])];
    let mut words: Vec<String> = Vec::new();
    let mut comments = Vec::new();
    let mut lineno = 0;
    for (i, line) in body.lines().enumerate() {
        lineno = i;
        let (code, comment) = split_comment(line);
        comments.push(comment);
        let mut word = String::new();
        let mut quote: Option<char> = None;
        let push_word = |w: &mut String, words: &mut Vec<String>| {
            if !w.is_empty() {
                words.push(std::mem::take(w));
            }
        };
        for c in code.chars() {
            if let Some(q) = quote {
                if c == q {
                    quote = None;
                } else {
                    word.push(c);
                }
                continue;
            }
            match c {
                '"' | '\'' => quote = Some(c),
                ';' => {
                    push_word(&mut word, &mut words);
                    if !words.is_empty() {
                        let level = &mut stack.last_mut().expect("root").1;
                        level.push(Node {
                            args: std::mem::take(&mut words),
                            line: i,
                            children: None,
                        });
                    }
                }
                '{' => {
                    push_word(&mut word, &mut words);
                    stack.push((std::mem::take(&mut words), vec![]));
                }
                '}' => {
                    push_word(&mut word, &mut words);
                    words.clear();
                    if stack.len() > 1 {
                        let (args, children) = stack.pop().expect("len > 1");
                        stack.last_mut().expect("root").1.push(Node {
                            args,
                            line: i,
                            children: Some(children),
                        });
                    }
                }
                c if c.is_whitespace() => push_word(&mut word, &mut words),
                c => word.push(c),
            }
        }
        push_word(&mut word, &mut words);
    }
    while stack.len() > 1 {
        let (args, children) = stack.pop().expect("len > 1");
        stack.last_mut().expect("root").1.push(Node {
            args,
            line: lineno,
            children: Some(children),
        });
    }
    Tree {
        nodes: stack.pop().map(|(_, n)| n).unwrap_or_default(),
        comments,
    }
}

/// Code and the comment after an unquoted `#`, trimmed.
fn split_comment(line: &str) -> (&str, Option<String>) {
    let mut quote: Option<char> = None;
    for (i, c) in line.char_indices() {
        match (quote, c) {
            (Some(q), c) if c == q => quote = None,
            (Some(_), _) => {}
            (None, '"' | '\'') => quote = Some(c),
            (None, '#') => {
                let note = line[i + 1..].trim();
                return (&line[..i], (!note.is_empty()).then(|| note.to_string()));
            }
            _ => {}
        }
    }
    (line, None)
}

fn parse_nginx_file(path: &str, body: &str) -> (Vec<NginxSite>, Vec<NginxUpstream>) {
    let tree = parse_tree(body);
    let mut sites = Vec::new();
    let mut ups = Vec::new();
    let mut visit = |nodes: &[Node]| {
        for n in nodes {
            match (n.args.first().map(String::as_str), &n.children) {
                (Some("server"), Some(kids)) => sites.push(site_of(&tree, path, kids)),
                (Some("upstream"), Some(kids)) => ups.push(NginxUpstream {
                    name: n.args.get(1).cloned().unwrap_or_default(),
                    servers: kids
                        .iter()
                        .filter(|k| k.args.first().is_some_and(|a| a == "server"))
                        .filter_map(|k| k.args.get(1).cloned())
                        .collect(),
                }),
                _ => {}
            }
        }
    };
    // A sites file is a bare list of blocks; nginx.conf-style files wrap them in http {}.
    visit(&tree.nodes);
    for n in &tree.nodes {
        if n.args.first().is_some_and(|a| a == "http") {
            if let Some(kids) = &n.children {
                visit(kids);
            }
        }
    }
    (sites, ups)
}

fn site_of(tree: &Tree, path: &str, kids: &[Node]) -> NginxSite {
    let mut site = NginxSite {
        file: path.to_string(),
        server_names: vec![],
        listen_ports: vec![],
        ssl: false,
        redirect_only: false,
        routes: vec![],
    };
    let mut server_return: Option<&Node> = None;
    // Certbot's http blocks redirect from `if ($host = …) { return 301 …; }`
    // and end in `return 404`.
    let mut if_redirect = false;
    for k in kids {
        match (k.args.first().map(String::as_str), &k.children) {
            (Some("server_name"), None) => site
                .server_names
                .extend(k.args[1..].iter().filter(|n| *n != "_").cloned()),
            (Some("listen"), None) => {
                if k.args.iter().any(|a| a == "ssl") {
                    site.ssl = true;
                }
                if let Some(port) = k.args.get(1).and_then(|a| listen_port(a)) {
                    if !site.listen_ports.contains(&port) {
                        site.listen_ports.push(port);
                    }
                }
            }
            (Some("ssl_certificate"), None) => site.ssl = true,
            (Some("return"), None) => server_return = Some(k),
            (Some("if"), Some(body)) => {
                if_redirect |= body.iter().any(|n| {
                    n.args.first().is_some_and(|a| a == "return")
                        && n.args.get(1).is_some_and(|c| c.starts_with("30"))
                })
            }
            (Some("location"), Some(body)) => site.routes.push(route_of(tree, &k.args[1..], body)),
            _ => {}
        }
    }
    if site.routes.is_empty() {
        if let Some(r) = server_return {
            site.routes.push(NginxRoute {
                path: "/".into(),
                target: r.args.join(" "),
                note: tree.note(r),
            });
        }
    }
    site.redirect_only = (if_redirect && site.routes.len() <= 1)
        || (!site.routes.is_empty()
            && site
                .routes
                .iter()
                .filter(|r| !r.path.contains("acme-challenge"))
                .all(|r| r.target.starts_with("return 30")));
    site
}

/// `80`, `443`, `[::]:443`, `127.0.0.1:8080` → the port.
fn listen_port(arg: &str) -> Option<u16> {
    arg.rsplit(':').next()?.parse().ok()
}

fn route_of(tree: &Tree, matcher: &[String], body: &[Node]) -> NginxRoute {
    // `location ^~ /api/` → `/api/`; `location = /x` → `= /x` keeps exact matches visible.
    let path = match matcher {
        [m, p] if m == "^~" => p.clone(),
        other => other.join(" "),
    };
    let pick = [
        "proxy_pass",
        "return",
        "root",
        "alias",
        "fastcgi_pass",
        "grpc_pass",
    ]
    .iter()
    .find_map(|d| body.iter().find(|n| n.args.first().is_some_and(|a| a == d)));
    match pick {
        Some(n) => NginxRoute {
            path,
            target: if n.args[0] == "proxy_pass" {
                n.args.get(1).cloned().unwrap_or_default()
            } else {
                n.args.join(" ")
            },
            note: tree.note(n),
        },
        None => NginxRoute {
            path,
            target: String::new(),
            note: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Shapes from real hosts (2026-10-23): Ubuntu with conf.d + ^~ locations and
    // trailing comments, Amazon Linux with upstream names, and a Debian
    // sites-enabled file.
    const FIXTURE: &str = r#"
===NGINX_STATUS===
installed
active
===NGINX_SITES===
@@FILE:/etc/nginx/conf.d/fameo-dev.conf
server {
    listen 80;
    listen [::]:80;
    server_name dev-api.example.info;
    location ^~ /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name dev-api.example.info;
    ssl_certificate     /etc/letsencrypt/live/dev-api/fullchain.pem;
    location ^~ /api/   { proxy_pass http://127.0.0.1:4101/; include /etc/nginx/snippets/proxy.conf; }   # backend, /api stripped
    location /          { proxy_pass http://127.0.0.1:4101;  include /etc/nginx/snippets/proxy.conf; }   # backend (incl. /socket.io)
}
@@FILE:/etc/nginx/conf.d/vip.conf
upstream vip_web_staging {
    server 127.0.0.1:3101;
    keepalive 16;
}
server {
    server_name staging.example.vip;
    location / {
        proxy_pass http://vip_web_staging;
        proxy_set_header Host $host; # "quoted # not a comment"
    }
    listen 443 ssl; # managed by Certbot
}
server {
    if ($host = staging.example.vip) {
        return 301 https://$host$request_uri;
    }
    listen 80;
    server_name staging.example.vip;
    return 404; # managed by Certbot
}
@@FILE:/etc/nginx/sites-enabled/default
server {
    listen 80 default_server;
    server_name _;
    root /var/www/html;
}
===CRON_USER===
PATH=/usr/bin:/bin
0 * * * * /usr/bin/python3 /app/cleanup.py
@reboot /home/ubuntu/start.sh
===CRON_SYSTEM===
CROND:certbot
SHELL=/bin/sh
0 12 * * * root certbot renew -q
"#;

    #[test]
    fn parses_server_blocks_routes_and_upstreams() {
        let d = parse_inspection(FIXTURE);
        assert!(d.nginx_installed && d.nginx_active);
        assert_eq!(d.nginx_sites.len(), 5);

        let http = &d.nginx_sites[0];
        assert_eq!(http.server_names, ["dev-api.example.info"]);
        assert_eq!(http.listen_ports, [80]);
        assert!(!http.ssl && http.redirect_only);

        let api = &d.nginx_sites[1];
        assert_eq!(api.listen_ports, [443]);
        assert!(api.ssl && !api.redirect_only);
        assert_eq!(api.routes[0].path, "/api/");
        assert_eq!(api.routes[0].target, "http://127.0.0.1:4101/");
        assert_eq!(
            api.routes[0].note.as_deref(),
            Some("backend, /api stripped")
        );
        assert_eq!(api.routes[1].path, "/");

        let vip = &d.nginx_sites[2];
        assert_eq!(vip.file, "/etc/nginx/conf.d/vip.conf");
        assert!(vip.ssl);
        assert_eq!(vip.routes[0].target, "http://vip_web_staging");
        assert_eq!(vip.routes[0].note, None);
        assert_eq!(
            d.upstreams,
            [NginxUpstream {
                name: "vip_web_staging".into(),
                servers: vec!["127.0.0.1:3101".into()],
            }]
        );

        let redirect = &d.nginx_sites[3];
        assert_eq!(redirect.routes[0].target, "return 404");
        assert!(redirect.redirect_only);

        let default = &d.nginx_sites[4];
        assert!(default.server_names.is_empty());
        assert!(default.routes.is_empty());
    }

    #[test]
    fn parses_cron_with_users_and_specials() {
        let d = parse_inspection(FIXTURE);
        assert_eq!(d.cron_jobs.len(), 3);
        assert_eq!(d.cron_jobs[0].schedule, "0 * * * *");
        assert_eq!(d.cron_jobs[0].user, None);
        assert_eq!(d.cron_jobs[1].schedule, "@reboot");
        assert_eq!(d.cron_jobs[2].source, "/etc/cron.d/certbot");
        assert_eq!(d.cron_jobs[2].user.as_deref(), Some("root"));
        assert_eq!(d.cron_jobs[2].command, "certbot renew -q");
    }

    #[test]
    fn no_nginx_is_empty_not_an_error() {
        let d =
            parse_inspection("===NGINX_STATUS===\ninactive\n===NGINX_SITES===\n===CRON_USER===\n");
        assert!(!d.nginx_installed && !d.nginx_active);
        assert!(d.nginx_sites.is_empty());
    }
}
