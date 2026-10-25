// The database explorer: one engine-neutral picture of a database (tables,
// columns, keys, indexes, foreign keys) and a paged, filtered, read-only row
// browser. Every engine is driven through its own CLI with fixed argv; user
// values never become SQL text (psql variables, MySQL hex literals, Mongo
// EJSON documents, Redis ARGV).

mod mongo;
mod mysql;
mod postgres;
mod redis;

use crate::core::exec::{self, ExecOutput};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

/// Rows a browse page may hold, and how far a count goes before it says "N+".
pub const MAX_PAGE: u32 = 500;
pub const COUNT_CAP: u64 = 100_000;

/// Where and as whom to connect. Built by the command from the saved
/// connection, its tunnel and its Keychain password.
pub struct Endpoint {
    pub driver: String,
    pub host: String,
    pub port: u16,
    pub user: Option<String>,
    pub database: Option<String>,
    pub password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DbSchema {
    pub engine: String,
    pub database: String,
    pub server_version: Option<String>,
    pub size_bytes: Option<i64>,
    /// Namespaces: Postgres schemas, the MySQL/Mongo database, Redis key prefixes' db.
    pub schemas: Vec<String>,
    pub tables: Vec<TableInfo>,
    /// Declared foreign keys only. Name-based guesses are made in the UI and
    /// always labelled as guesses.
    pub relations: Vec<Relation>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TableInfo {
    pub schema: String,
    pub name: String,
    /// table | view | materializedView | foreignTable | collection | keyspace
    pub kind: String,
    pub row_estimate: Option<i64>,
    pub size_bytes: Option<i64>,
    pub comment: Option<String>,
    pub columns: Vec<ColumnInfo>,
    pub indexes: Vec<IndexInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub default: Option<String>,
    pub is_primary: bool,
    pub is_unique: bool,
    pub comment: Option<String>,
    /// Share of sampled documents that have this field (MongoDB); `None` for
    /// engines with a declared schema.
    #[serde(default)]
    pub presence: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IndexInfo {
    pub name: String,
    pub columns: Vec<String>,
    pub unique: bool,
    pub primary: bool,
    pub method: Option<String>,
    pub definition: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Relation {
    pub name: String,
    pub from_schema: String,
    pub from_table: String,
    pub from_columns: Vec<String>,
    pub to_schema: String,
    pub to_table: String,
    pub to_columns: Vec<String>,
    pub on_delete: Option<String>,
    pub on_update: Option<String>,
    pub inferred: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FilterOp {
    Eq,
    Neq,
    Gt,
    Gte,
    Lt,
    Lte,
    Contains,
    StartsWith,
    IsNull,
    NotNull,
}

impl FilterOp {
    pub fn needs_value(self) -> bool {
        !matches!(self, FilterOp::IsNull | FilterOp::NotNull)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Filter {
    pub column: String,
    pub op: FilterOp,
    #[serde(default)]
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SortSpec {
    pub column: String,
    pub desc: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BrowseRequest {
    pub schema: String,
    pub table: String,
    /// The table's columns, in order: MySQL needs them to build each row, and
    /// a quick search looks through all of them.
    #[serde(default)]
    pub columns: Vec<String>,
    #[serde(default)]
    pub filters: Vec<Filter>,
    /// Free text matched against every column.
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub sort: Option<SortSpec>,
    pub limit: u32,
    pub offset: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BrowsePage {
    /// One JSON object per row, keyed by column. Order columns from the schema.
    pub rows: Vec<serde_json::Value>,
    /// Matching rows, counted up to `COUNT_CAP`; `None` if counting failed or timed out.
    pub total: Option<u64>,
    /// `total` hit the cap: there are at least this many.
    pub total_capped: bool,
    pub duration_ms: u64,
}

pub fn schema(ep: &Endpoint) -> AppResult<DbSchema> {
    match ep.driver.as_str() {
        "postgres" => postgres::schema(ep),
        "mysql" => mysql::schema(ep),
        "mongo" | "mongodb" => mongo::schema(ep),
        "redis" => redis::schema(ep),
        other => Err(AppError::InvalidName(format!(
            "unsupported database: {other}"
        ))),
    }
}

pub fn browse(ep: &Endpoint, req: &BrowseRequest) -> AppResult<BrowsePage> {
    check_request(req)?;
    let start = std::time::Instant::now();
    let mut page = match ep.driver.as_str() {
        "postgres" => postgres::browse(ep, req),
        "mysql" => mysql::browse(ep, req),
        "mongo" | "mongodb" => mongo::browse(ep, req),
        "redis" => redis::browse(ep, req),
        other => Err(AppError::InvalidName(format!(
            "unsupported database: {other}"
        ))),
    }?;
    page.duration_ms = start.elapsed().as_millis() as u64;
    Ok(page)
}

/// Names are quoted by each engine, never trusted: this only rejects what no
/// quoting makes sane (empty, control characters, absurd length).
pub fn check_ident(what: &str, s: &str) -> AppResult<()> {
    let ok = !s.is_empty() && s.chars().count() <= 128 && !s.chars().any(char::is_control);
    ok.then_some(())
        .ok_or_else(|| AppError::InvalidName(format!("invalid {what}: {s:?}")))
}

fn check_request(req: &BrowseRequest) -> AppResult<()> {
    check_ident("schema", &req.schema)?;
    check_ident("table", &req.table)?;
    for c in &req.columns {
        check_ident("column", c)?;
    }
    for f in &req.filters {
        check_ident("column", &f.column)?;
        if f.op.needs_value() && f.value.is_none() {
            return Err(AppError::InvalidName(format!(
                "filter on {} needs a value",
                f.column
            )));
        }
    }
    if let Some(s) = &req.sort {
        check_ident("column", &s.column)?;
    }
    if req.limit == 0 || req.limit > MAX_PAGE {
        return Err(AppError::InvalidName(format!(
            "page size must be 1–{MAX_PAGE}"
        )));
    }
    Ok(())
}

/// `%`, `_` and `\` matched literally inside a LIKE pattern (backslash escape).
pub fn like_escape(v: &str) -> String {
    let mut out = String::with_capacity(v.len());
    for c in v.chars() {
        if matches!(c, '%' | '_' | '\\') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// A client CLI's output, or why it failed — a missing binary, a refused
/// password and an empty database must never look alike.
pub fn cli_output(tool: &str, out: AppResult<ExecOutput>) -> AppResult<ExecOutput> {
    let o = out.map_err(|e| {
        let install = match tool {
            "psql" => "brew install libpq",
            "mysql" => "brew install mysql-client",
            "redis-cli" => "brew install redis",
            _ => "brew install mongosh",
        };
        AppError::Shell(format!(
            "Couldn't run {tool} ({e}). Install it with `{install}`."
        ))
    })?;
    if !o.status.success() {
        return Err(AppError::Shell(format!(
            "{tool}: {}",
            tidy(tool, &first_error(&o))
        )));
    }
    if o.stdout_truncated {
        return Err(AppError::Shell(format!(
            "{tool} returned more data than Stackroost reads at once. Use a smaller page size."
        )));
    }
    Ok(o)
}

/// The first meaningful stderr line (stdout for tools that print errors there).
pub fn first_error(o: &ExecOutput) -> String {
    o.stderr_str
        .lines()
        .chain(o.stdout_str.lines())
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("exited with an error")
        .to_string()
}

/// `psql:<stdin>:1: ERROR:  relation "x" does not exist` → `relation "x" does not exist`.
pub fn tidy(tool: &str, line: &str) -> String {
    let mut s = line.trim();
    if let Some(r) = s.strip_prefix(tool).and_then(|r| r.strip_prefix(':')) {
        s = r.trim_start();
    }
    if s.starts_with("<stdin>:") {
        s = s.splitn(3, ':').nth(2).unwrap_or(s).trim_start();
    }
    for p in [tool, "ERROR:", "FATAL:", "error:"] {
        if let Some(r) = s.strip_prefix(p) {
            s = r.trim_start_matches(':').trim_start();
        }
    }
    s.to_string()
}

/// Explorer reads: a whole schema or a page of wide rows can pass exec's 1 MB
/// default, and `cli_output` reads the exit status itself so a failed query
/// isn't reported as a missing tool.
pub fn read_opts(timeout_secs: u64) -> exec::ExecOpts {
    exec::ExecOpts::default()
        .with_timeout(std::time::Duration::from_secs(timeout_secs))
        .with_max_out(32 * 1024 * 1024)
        .no_check_exit()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req() -> BrowseRequest {
        BrowseRequest {
            schema: "public".into(),
            table: "posts".into(),
            columns: vec![],
            filters: vec![],
            search: None,
            sort: None,
            limit: 50,
            offset: 0,
        }
    }

    #[test]
    fn requests_are_bounded_and_named() {
        assert!(check_request(&req()).is_ok());
        assert!(check_request(&BrowseRequest { limit: 0, ..req() }).is_err());
        assert!(check_request(&BrowseRequest {
            limit: MAX_PAGE + 1,
            ..req()
        })
        .is_err());
        assert!(check_request(&BrowseRequest {
            table: "".into(),
            ..req()
        })
        .is_err());
        assert!(check_request(&BrowseRequest {
            table: "a\nb".into(),
            ..req()
        })
        .is_err());
        // Odd but quotable names are fine: quoting handles them.
        assert!(check_request(&BrowseRequest {
            table: "my \"table\"; --".into(),
            ..req()
        })
        .is_ok());
        let f = Filter {
            column: "title".into(),
            op: FilterOp::Eq,
            value: None,
        };
        assert!(check_request(&BrowseRequest {
            filters: vec![f],
            ..req()
        })
        .is_err());
        let f = Filter {
            column: "title".into(),
            op: FilterOp::IsNull,
            value: None,
        };
        assert!(check_request(&BrowseRequest {
            filters: vec![f],
            ..req()
        })
        .is_ok());
    }

    #[test]
    fn errors_lose_the_cli_noise() {
        assert_eq!(
            tidy(
                "psql",
                "psql:<stdin>:1: ERROR:  relation \"public.nope\" does not exist"
            ),
            "relation \"public.nope\" does not exist"
        );
        assert_eq!(
            tidy("psql", "psql: error: connection to server at \"h\" failed: FATAL:  password authentication failed"),
            "connection to server at \"h\" failed: FATAL:  password authentication failed"
        );
        assert_eq!(
            tidy("mongosh", "MongoServerError: Authentication failed."),
            "MongoServerError: Authentication failed."
        );
    }

    /// The wire format `src/features/databases/api/contracts.test.ts` parses
    /// with the zod schemas. Regenerate with `UPDATE_GOLDEN=1 cargo test golden`.
    #[test]
    fn explorer_contracts_golden() {
        let pg = postgres::parse_schema(include_str!(
            "../../../../../fixtures/databases/pg-schema.json"
        ))
        .unwrap();
        let my = mysql::parse_schema(include_str!(
            "../../../../../fixtures/databases/mysql-schema.jsonl"
        ))
        .unwrap();
        let mg = mongo::parse_schema(include_str!(
            "../../../../../fixtures/databases/mongo-schema.json"
        ))
        .unwrap();
        let rd = redis::parse_schema(
            r#"{"groups":{"session":{"count":120,"types":{"hash":118,"string":2}},"(no prefix)":{"count":1,"types":{"string":1}}},"complete":true,"dbsize":121}"#,
            "0",
        )
        .unwrap();
        let page = postgres::parse_browse("[{\"id\": 1, \"tags\": [\"a\"], \"profile\": {\"theme\": \"dark\"}, \"body\": null}]\n1\n").unwrap();
        let json = serde_json::to_string_pretty(&serde_json::json!({
            "postgres": pg,
            "mysql": my,
            "mongo": mg,
            "redis": rd,
            "browsePage": page,
        }))
        .unwrap()
            + "\n";
        let path = format!(
            "{}/../fixtures/databases/explorer-contracts.json",
            env!("CARGO_MANIFEST_DIR")
        );
        if std::env::var_os("UPDATE_GOLDEN").is_some() {
            std::fs::write(&path, &json).unwrap();
        }
        let golden = std::fs::read_to_string(&path).unwrap_or_default();
        assert_eq!(
            json, golden,
            "explorer JSON changed; rerun with UPDATE_GOLDEN=1"
        );
    }

    #[test]
    fn like_patterns_escape_wildcards() {
        assert_eq!(like_escape("50%_off\\x"), "50\\%\\_off\\\\x");
        assert_eq!(like_escape("plain"), "plain");
    }
}
