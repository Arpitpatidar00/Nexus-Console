// Redis has keys, not tables: keys are grouped by prefix (`session:*` is one
// "table"), and one read-only Lua script per call scans and returns JSON
// through cjson. Patterns and paging travel as ARGV, never as script text.

use super::{
    cli_output, read_opts, BrowsePage, BrowseRequest, ColumnInfo, DbSchema, Endpoint, TableInfo,
};
use crate::core::exec;
use crate::error::{AppError, AppResult};
use serde_json::Value;

/// Keys looked at per call: enough to map a dev database, bounded for a big one.
const MAX_SCAN: u32 = 20_000;
pub const NO_PREFIX: &str = "(no prefix)";

const SCHEMA_LUA: &str = r#"
local max = tonumber(ARGV[1])
local cursor, seen, groups = '0', 0, {}
repeat
  local r = redis.call('SCAN', cursor, 'COUNT', 1000)
  cursor = r[1]
  for _, k in ipairs(r[2]) do
    seen = seen + 1
    local p = string.match(k, '^([^:]+):') or ARGV[2]
    local g = groups[p]
    if not g then g = { count = 0, types = {} }; groups[p] = g end
    g.count = g.count + 1
    local t = redis.call('TYPE', k)['ok']
    g.types[t] = (g.types[t] or 0) + 1
  end
until cursor == '0' or seen >= max
return cjson.encode({ groups = groups, complete = cursor == '0', dbsize = redis.call('DBSIZE') })
"#;

const BROWSE_LUA: &str = r#"
local pattern, noprefix = ARGV[1], ARGV[2] == '1'
local offset, limit, max = tonumber(ARGV[3]), tonumber(ARGV[4]), tonumber(ARGV[5])
local cursor, matched, scanned, rows = '0', 0, 0, {}
repeat
  local r = redis.call('SCAN', cursor, 'MATCH', pattern, 'COUNT', 1000)
  cursor = r[1]
  for _, k in ipairs(r[2]) do
    scanned = scanned + 1
    if not noprefix or not string.find(k, ':', 1, true) then
      matched = matched + 1
      if matched > offset and #rows < limit then
        local t = redis.call('TYPE', k)['ok']
        local v
        if t == 'string' then v = redis.call('GETRANGE', k, 0, 4095)
        elseif t == 'hash' then
          local h = redis.call('HSCAN', k, 0, 'COUNT', 100)[2]
          v = {}
          for i = 1, #h, 2 do v[h[i]] = h[i + 1] end
        elseif t == 'list' then v = redis.call('LRANGE', k, 0, 99)
        elseif t == 'set' then v = redis.call('SSCAN', k, 0, 'COUNT', 100)[2]
        elseif t == 'zset' then
          local z = redis.call('ZRANGE', k, 0, 99, 'WITHSCORES')
          v = {}
          for i = 1, #z, 2 do table.insert(v, { member = z[i], score = tonumber(z[i + 1]) }) end
        else v = '(' .. t .. ')' end
        table.insert(rows, { key = k, type = t, ttl = redis.call('TTL', k), value = v })
      end
    end
  end
until cursor == '0' or scanned >= max
return cjson.encode({ rows = rows, total = matched, complete = cursor == '0' })
"#;

fn eval(ep: &Endpoint, script: &str, args: &[String]) -> AppResult<exec::ExecOutput> {
    let port = ep.port.to_string();
    let mut argv: Vec<&str> = vec!["-h", &ep.host, "-p", &port, "--no-auth-warning", "--raw"];
    if let Some(n) = ep.database.as_deref().filter(|d| d.parse::<u32>().is_ok()) {
        argv.extend(["-n", n]);
    }
    if let Some(u) = ep
        .user
        .as_deref()
        .filter(|u| !u.is_empty() && *u != "default")
    {
        argv.extend(["--user", u]);
    }
    argv.extend(["EVAL", script, "0"]);
    argv.extend(args.iter().map(String::as_str));
    let mut opts = read_opts(30);
    // REDISCLI_AUTH, not `-a`: argv is visible to every local `ps`.
    if let Some(p) = &ep.password {
        opts = opts.with_env("REDISCLI_AUTH", p.as_str());
    }
    let out = cli_output("redis-cli", exec::run("redis-cli", &argv, opts))?;
    // redis-cli exits 0 on server errors and prints them instead.
    if out.stdout_str.trim_start().starts_with("ERR") || out.stdout_str.contains("(error)") {
        return Err(AppError::Shell(format!("redis: {}", out.stdout_str.trim())));
    }
    Ok(out)
}

pub fn schema(ep: &Endpoint) -> AppResult<DbSchema> {
    let out = eval(ep, SCHEMA_LUA, &[MAX_SCAN.to_string(), NO_PREFIX.into()])?;
    parse_schema(&out.stdout_str, ep.database.as_deref().unwrap_or("0"))
}

fn key_columns() -> Vec<ColumnInfo> {
    ["key", "type", "ttl", "value"]
        .iter()
        .map(|n| ColumnInfo {
            name: (*n).into(),
            data_type: match *n {
                "ttl" => "seconds (-1 = never expires)".into(),
                "value" => "first 100 items / 4 KB".into(),
                _ => "string".into(),
            },
            nullable: false,
            default: None,
            is_primary: *n == "key",
            is_unique: *n == "key",
            comment: None,
            presence: None,
        })
        .collect()
}

pub fn parse_schema(stdout: &str, db: &str) -> AppResult<DbSchema> {
    let v: Value = serde_json::from_str(stdout.trim())
        .map_err(|e| AppError::Parse(format!("unexpected redis output: {e}")))?;
    let space = format!("db{db}");
    let mut tables: Vec<TableInfo> = v
        .get("groups")
        .and_then(Value::as_object)
        .map(|g| {
            g.iter()
                .map(|(prefix, info)| {
                    let mut types: Vec<(String, i64)> = info
                        .get("types")
                        .and_then(Value::as_object)
                        .map(|t| {
                            t.iter()
                                .map(|(k, n)| (k.clone(), n.as_i64().unwrap_or(0)))
                                .collect()
                        })
                        .unwrap_or_default();
                    types.sort_by_key(|t| std::cmp::Reverse(t.1));
                    TableInfo {
                        schema: space.clone(),
                        name: prefix.clone(),
                        kind: "keyspace".into(),
                        row_estimate: info.get("count").and_then(Value::as_i64),
                        size_bytes: None,
                        comment: Some(
                            types
                                .iter()
                                .map(|(t, n)| format!("{n} {t}"))
                                .collect::<Vec<_>>()
                                .join(", "),
                        ),
                        columns: key_columns(),
                        indexes: vec![],
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    tables.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(DbSchema {
        engine: "redis".into(),
        database: space.clone(),
        server_version: None,
        size_bytes: None,
        schemas: vec![space],
        tables,
        relations: vec![],
    })
}

/// SCAN MATCH patterns are globs: a literal prefix must not glob.
fn glob_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if matches!(c, '*' | '?' | '[' | ']' | '\\') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// ARGV for the browse script: pattern, no-prefix flag, offset, limit, scan cap.
pub fn browse_args(req: &BrowseRequest) -> Vec<String> {
    let search = req
        .search
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| format!("*{}*", glob_escape(s)))
        .unwrap_or_else(|| "*".into());
    let (pattern, noprefix) = if req.table == NO_PREFIX {
        (search, "1")
    } else {
        (format!("{}:{search}", glob_escape(&req.table)), "0")
    };
    vec![
        pattern,
        noprefix.into(),
        req.offset.to_string(),
        req.limit.to_string(),
        MAX_SCAN.to_string(),
    ]
}

pub fn browse(ep: &Endpoint, req: &BrowseRequest) -> AppResult<BrowsePage> {
    let out = eval(ep, BROWSE_LUA, &browse_args(req))?;
    parse_browse(&out.stdout_str)
}

pub fn parse_browse(stdout: &str) -> AppResult<BrowsePage> {
    let v: Value = serde_json::from_str(stdout.trim())
        .map_err(|e| AppError::Parse(format!("unexpected redis output: {e}")))?;
    // cjson writes an empty Lua table as `{}`.
    let rows = v
        .get("rows")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let complete = v.get("complete").and_then(Value::as_bool).unwrap_or(false);
    Ok(BrowsePage {
        rows,
        total: v.get("total").and_then(Value::as_u64),
        total_capped: !complete,
        duration_ms: 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(table: &str, search: Option<&str>) -> BrowseRequest {
        BrowseRequest {
            schema: "db0".into(),
            table: table.into(),
            columns: vec![],
            filters: vec![],
            search: search.map(str::to_string),
            sort: None,
            limit: 25,
            offset: 50,
        }
    }

    #[test]
    fn prefixes_are_literal_globs() {
        assert_eq!(browse_args(&req("session", None))[..2], ["session:*", "0"]);
        assert_eq!(browse_args(&req("a*b", Some("x?")))[0], "a\\*b:*x\\?*");
        assert_eq!(
            browse_args(&req(NO_PREFIX, Some("cfg")))[..2],
            ["*cfg*", "1"]
        );
        assert_eq!(browse_args(&req("s", None))[2..4], ["50", "25"]);
    }

    #[test]
    fn groups_keys_by_prefix() {
        let s = parse_schema(
            r#"{"groups":{"session":{"count":120,"types":{"hash":118,"string":2}},"(no prefix)":{"count":1,"types":{"string":1}}},"complete":true,"dbsize":121}"#,
            "0",
        )
        .unwrap();
        assert_eq!(s.database, "db0");
        assert_eq!(s.tables[0].name, "(no prefix)");
        let session = &s.tables[1];
        assert_eq!(session.row_estimate, Some(120));
        assert_eq!(session.comment.as_deref(), Some("118 hash, 2 string"));
        assert_eq!(session.columns[0].name, "key");
    }

    #[test]
    fn empty_rows_from_cjson_are_an_empty_page() {
        let p = parse_browse(r#"{"rows":{},"total":0,"complete":true}"#).unwrap();
        assert!(p.rows.is_empty());
        assert!(!p.total_capped);
    }
}
