// Postgres: the whole schema in one catalog query (works on any PG 11+,
// managed ones included), and rows via psql variables so filter values are
// quoted by psql as literals, never spliced into SQL.

use super::{
    cli_output, first_error, like_escape, read_opts, tidy, BrowsePage, BrowseRequest, DbSchema,
    Endpoint, FilterOp, COUNT_CAP,
};
use crate::core::exec;
use crate::error::{AppError, AppResult};

/// Read-only by construction: the session refuses writes whatever the SQL says.
const READ_ONLY: &str = "-c default_transaction_read_only=on -c statement_timeout=15000";

const SCHEMA_SQL: &str = r#"
WITH rels AS (
  SELECT c.oid, n.nspname AS schema, c.relname AS name,
    CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materializedView' WHEN 'f' THEN 'foreignTable' ELSE 'table' END AS kind,
    CASE WHEN c.relkind IN ('r','p','m') AND c.reltuples >= 0 THEN c.reltuples::bigint END AS row_estimate,
    CASE WHEN c.relkind IN ('r','p','m') THEN pg_total_relation_size(c.oid) END AS size_bytes,
    obj_description(c.oid, 'pg_class') AS comment
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r','p','v','m','f') AND NOT c.relispartition
    AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp)'
)
SELECT json_build_object(
  'database', current_database(),
  'serverVersion', current_setting('server_version'),
  'sizeBytes', pg_database_size(current_database()),
  'schemas', (SELECT coalesce(json_agg(DISTINCT r.schema), '[]') FROM rels r),
  'tables', (SELECT coalesce(json_agg(json_build_object(
    'schema', r.schema, 'name', r.name, 'kind', r.kind,
    'rowEstimate', r.row_estimate, 'sizeBytes', r.size_bytes, 'comment', r.comment,
    'columns', (SELECT coalesce(json_agg(json_build_object(
        'name', a.attname,
        'dataType', format_type(a.atttypid, a.atttypmod),
        'nullable', NOT a.attnotnull,
        'default', pg_get_expr(d.adbin, d.adrelid),
        'isPrimary', EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = r.oid AND i.indisprimary AND a.attnum = ANY (i.indkey)),
        'isUnique', EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = r.oid AND i.indisunique AND i.indnkeyatts = 1 AND i.indkey[0] = a.attnum),
        'comment', col_description(r.oid, a.attnum)
      ) ORDER BY a.attnum), '[]')
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped),
    'indexes', (SELECT coalesce(json_agg(json_build_object(
        'name', ic.relname,
        'columns', (SELECT json_agg(pg_get_indexdef(i.indexrelid, k, true) ORDER BY k) FROM generate_series(1, i.indnkeyatts) k),
        'unique', i.indisunique, 'primary', i.indisprimary, 'method', am.amname,
        'definition', pg_get_indexdef(i.indexrelid)
      ) ORDER BY i.indisprimary DESC, ic.relname), '[]')
      FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_am am ON am.oid = ic.relam
      WHERE i.indrelid = r.oid)
  ) ORDER BY r.schema, r.name), '[]') FROM rels r),
  'relations', (SELECT coalesce(json_agg(json_build_object(
    'name', con.conname,
    'fromSchema', fn.nspname, 'fromTable', fc.relname,
    'fromColumns', (SELECT json_agg(a.attname ORDER BY k.ord) FROM unnest(con.conkey) WITH ORDINALITY k(num, ord) JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.num),
    'toSchema', tn.nspname, 'toTable', tc.relname,
    'toColumns', (SELECT json_agg(a.attname ORDER BY k.ord) FROM unnest(con.confkey) WITH ORDINALITY k(num, ord) JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.num),
    'onDelete', CASE con.confdeltype WHEN 'c' THEN 'cascade' WHEN 'n' THEN 'set null' WHEN 'd' THEN 'set default' WHEN 'r' THEN 'restrict' ELSE 'no action' END,
    'onUpdate', CASE con.confupdtype WHEN 'c' THEN 'cascade' WHEN 'n' THEN 'set null' WHEN 'd' THEN 'set default' WHEN 'r' THEN 'restrict' ELSE 'no action' END,
    'inferred', false
  ) ORDER BY fn.nspname, fc.relname, con.conname), '[]')
  FROM pg_constraint con
  JOIN pg_class fc ON fc.oid = con.conrelid JOIN pg_namespace fn ON fn.oid = fc.relnamespace
  JOIN pg_class tc ON tc.oid = con.confrelid JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE con.contype = 'f' AND fn.nspname NOT IN ('pg_catalog','information_schema'))
);
"#;

fn psql(ep: &Endpoint, vars: &[(String, String)], script: String) -> AppResult<exec::ExecOutput> {
    let port = ep.port.to_string();
    let db = ep.database.as_deref().unwrap_or("postgres");
    let mut argv: Vec<String> = [
        "-X", "-A", "-t", "-q", "-h", &ep.host, "-p", &port, "-d", db,
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    // No user: psql's default (the macOS user) — what Homebrew's Postgres has.
    if let Some(u) = ep.user.as_deref().filter(|u| !u.is_empty()) {
        argv.extend(["-U".into(), u.to_string()]);
    }
    for (k, v) in vars {
        argv.push("-v".into());
        argv.push(format!("{k}={v}"));
    }
    argv.extend(["-f".into(), "-".into()]);
    let mut opts = read_opts(30)
        .with_stdin(script.into_bytes())
        .with_env("PGOPTIONS", READ_ONLY)
        .with_env("PGCONNECT_TIMEOUT", "10")
        .with_env("PGAPPNAME", "Stackroost");
    if let Some(p) = &ep.password {
        opts = opts.with_env("PGPASSWORD", p.as_str());
    }
    cli_output("psql", exec::run("psql", &argv, opts))
}

pub fn ping(ep: &Endpoint) -> AppResult<()> {
    let vars = [("ON_ERROR_STOP".to_string(), "1".to_string())];
    psql(ep, &vars, "SELECT 1;".to_string()).map(|_| ())
}

pub fn schema(ep: &Endpoint) -> AppResult<DbSchema> {
    let vars = [("ON_ERROR_STOP".to_string(), "1".to_string())];
    let out = psql(ep, &vars, SCHEMA_SQL.to_string())?;
    parse_schema(&out.stdout_str)
}

pub fn parse_schema(stdout: &str) -> AppResult<DbSchema> {
    let mut v: serde_json::Value = serde_json::from_str(stdout.trim())
        .map_err(|e| AppError::Parse(format!("unexpected schema output from psql: {e}")))?;
    if let Some(o) = v.as_object_mut() {
        o.insert("engine".into(), "postgres".into());
    }
    serde_json::from_value(v).map_err(|e| AppError::Parse(format!("schema shape: {e}")))
}

pub fn quote_ident(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}

/// The browse script and the psql variables it reads. Two statements: the
/// page (one jsonb line, so newlines in values stay escaped), then a capped
/// count under a shorter timeout — a slow count must not cost the rows.
pub fn browse_script(req: &BrowseRequest) -> (String, Vec<(String, String)>) {
    let mut vars: Vec<(String, String)> = Vec::new();
    let mut var = |value: String| {
        let name = format!("v{}", vars.len());
        vars.push((name.clone(), value));
        format!(":'{name}'")
    };
    let mut conds: Vec<String> = Vec::new();
    for f in &req.filters {
        let col = quote_ident(&f.column);
        let value = f.value.clone().unwrap_or_default();
        conds.push(match f.op {
            FilterOp::Eq => format!("{col} = {}", var(value)),
            FilterOp::Neq => format!("{col} IS DISTINCT FROM {}", var(value)),
            FilterOp::Gt => format!("{col} > {}", var(value)),
            FilterOp::Gte => format!("{col} >= {}", var(value)),
            FilterOp::Lt => format!("{col} < {}", var(value)),
            FilterOp::Lte => format!("{col} <= {}", var(value)),
            FilterOp::Contains => format!(
                "{col}::text ILIKE '%' || {} || '%' ESCAPE '\\'",
                var(like_escape(&value))
            ),
            FilterOp::StartsWith => format!(
                "{col}::text ILIKE {} || '%' ESCAPE '\\'",
                var(like_escape(&value))
            ),
            FilterOp::IsNull => format!("{col} IS NULL"),
            FilterOp::NotNull => format!("{col} IS NOT NULL"),
        });
    }
    if let Some(q) = req
        .search
        .as_deref()
        .map(str::trim)
        .filter(|q| !q.is_empty())
    {
        if !req.columns.is_empty() {
            let v = var(like_escape(q));
            let any = req
                .columns
                .iter()
                .map(|c| {
                    format!(
                        "{}::text ILIKE '%' || {v} || '%' ESCAPE '\\'",
                        quote_ident(c)
                    )
                })
                .collect::<Vec<_>>()
                .join(" OR ");
            conds.push(format!("({any})"));
        }
    }
    let from = format!("{}.{}", quote_ident(&req.schema), quote_ident(&req.table));
    let filter = if conds.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conds.join(" AND "))
    };
    let order = req
        .sort
        .as_ref()
        .map(|s| {
            format!(
                " ORDER BY {} {} NULLS LAST",
                quote_ident(&s.column),
                if s.desc { "DESC" } else { "ASC" }
            )
        })
        .unwrap_or_default();
    let script = format!(
        "SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (SELECT * FROM {from}{filter}{order} LIMIT {} OFFSET {}) t;\n\
         SET statement_timeout = 5000;\n\
         SELECT count(*) FROM (SELECT 1 FROM {from}{filter} LIMIT {}) c;\n",
        req.limit,
        req.offset,
        COUNT_CAP + 1
    );
    (script, vars)
}

pub fn browse(ep: &Endpoint, req: &BrowseRequest) -> AppResult<BrowsePage> {
    let (script, vars) = browse_script(req);
    let out = psql(ep, &vars, script)?;
    parse_browse(&out.stdout_str)
        .ok_or_else(|| AppError::Shell(format!("psql: {}", tidy("psql", &first_error(&out)))))
}

/// Line 1: the rows. Line 2, if the count finished in time: how many match.
pub fn parse_browse(stdout: &str) -> Option<BrowsePage> {
    let mut lines = stdout.lines().map(str::trim).filter(|l| !l.is_empty());
    let rows: Vec<serde_json::Value> = serde_json::from_str(lines.next()?).ok()?;
    let count = lines.next().and_then(|l| l.parse::<u64>().ok());
    Some(BrowsePage {
        rows,
        total: count.map(|n| n.min(COUNT_CAP)),
        total_capped: count.is_some_and(|n| n > COUNT_CAP),
        duration_ms: 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::databases::explorer::{Filter, SortSpec};

    fn req() -> BrowseRequest {
        BrowseRequest {
            schema: "public".into(),
            table: "posts".into(),
            columns: vec!["id".into(), "title".into()],
            filters: vec![],
            search: None,
            sort: None,
            limit: 50,
            offset: 100,
        }
    }

    #[test]
    fn identifiers_are_quoted() {
        assert_eq!(quote_ident("users"), "\"users\"");
        assert_eq!(quote_ident("we\"ird; --"), "\"we\"\"ird; --\"");
    }

    #[test]
    fn values_go_through_psql_variables_only() {
        let evil = "x'; DROP TABLE posts; --";
        let r = BrowseRequest {
            filters: vec![
                Filter {
                    column: "title".into(),
                    op: FilterOp::Contains,
                    value: Some(evil.into()),
                },
                Filter {
                    column: "id".into(),
                    op: FilterOp::Gte,
                    value: Some("5".into()),
                },
                Filter {
                    column: "body".into(),
                    op: FilterOp::IsNull,
                    value: None,
                },
            ],
            search: Some("50%".into()),
            sort: Some(SortSpec {
                column: "id".into(),
                desc: true,
            }),
            ..req()
        };
        let (sql, vars) = browse_script(&r);
        assert!(!sql.contains("DROP"), "{sql}");
        assert!(!sql.contains("50%") && !sql.contains("50\\\\%"), "{sql}");
        assert_eq!(vars[0], ("v0".into(), evil.into()));
        assert_eq!(vars[1], ("v1".into(), "5".into()));
        assert_eq!(vars[2], ("v2".into(), "50\\%".into()));
        assert!(sql.contains("\"title\"::text ILIKE '%' || :'v0' || '%'"));
        assert!(sql.contains("\"id\" >= :'v1'"));
        assert!(sql.contains("\"body\" IS NULL"));
        assert!(
            sql.contains("(\"id\"::text ILIKE '%' || :'v2' || '%' ESCAPE '\\' OR \"title\"::text")
        );
        assert!(sql.contains("ORDER BY \"id\" DESC NULLS LAST LIMIT 50 OFFSET 100"));
        assert!(sql.contains("FROM \"public\".\"posts\" WHERE"));
        assert!(sql.contains("LIMIT 100001"));
    }

    #[test]
    fn parses_rows_and_capped_counts() {
        let p = parse_browse("[{\"id\": 1, \"body\": \"a\\nb\"}]\n100001\n").unwrap();
        assert_eq!(p.rows.len(), 1);
        assert_eq!(p.rows[0]["body"], "a\nb");
        assert_eq!(p.total, Some(COUNT_CAP));
        assert!(p.total_capped);
        let p = parse_browse("[]\n").unwrap();
        assert_eq!(p.total, None);
        assert!(parse_browse("ERROR: permission denied").is_none());
    }

    #[test]
    fn parses_the_catalog_document() {
        let s = parse_schema(include_str!(
            "../../../../../fixtures/databases/pg-schema.json"
        ))
        .unwrap();
        assert_eq!(s.engine, "postgres");
        assert_eq!(s.schemas, ["billing", "public"]);
        let users = s.tables.iter().find(|t| t.name == "users").unwrap();
        assert!(users.columns.iter().any(|c| c.name == "id" && c.is_primary));
        assert!(users
            .columns
            .iter()
            .any(|c| c.name == "email" && c.is_unique));
        let composite = s
            .relations
            .iter()
            .find(|r| r.from_table == "invoices")
            .unwrap();
        assert_eq!(composite.from_columns, ["user_id", "plan_code"]);
        assert_eq!(composite.on_update.as_deref(), Some("cascade"));
        assert!(s.relations.iter().all(|r| !r.inferred));
    }
}
