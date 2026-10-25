// MySQL / MariaDB: information_schema read as one JSON object per line (a
// comment with a newline can't break the parse), and rows built with
// JSON_OBJECT. Filter values arrive as hex literals, so no value is ever SQL.

use super::{
    cli_output, like_escape, read_opts, BrowsePage, BrowseRequest, ColumnInfo, DbSchema, Endpoint,
    FilterOp, IndexInfo, Relation, TableInfo, COUNT_CAP,
};
use crate::core::exec;
use crate::error::{AppError, AppResult};
use serde_json::Value;
use std::collections::BTreeMap;

const INIT: &str =
    "--init-command=SET SESSION TRANSACTION READ ONLY; SET SESSION max_execution_time=15000;";

const SCHEMA_SQL: &str = r#"
SELECT JSON_OBJECT('k','meta','database',DATABASE(),'serverVersion',VERSION(),
  'sizeBytes',(SELECT SUM(DATA_LENGTH + INDEX_LENGTH) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()));
SELECT JSON_OBJECT('k','table','name',TABLE_NAME,'kind',IF(TABLE_TYPE = 'VIEW','view','table'),
  'rowEstimate',TABLE_ROWS,'sizeBytes',DATA_LENGTH + INDEX_LENGTH,'comment',NULLIF(TABLE_COMMENT,''))
  FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME;
SELECT JSON_OBJECT('k','column','table',TABLE_NAME,'name',COLUMN_NAME,'dataType',COLUMN_TYPE,
  'nullable',IS_NULLABLE = 'YES','default',COLUMN_DEFAULT,'isPrimary',COLUMN_KEY = 'PRI',
  'isUnique',COLUMN_KEY = 'UNI','comment',NULLIF(COLUMN_COMMENT,''))
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION;
SELECT JSON_OBJECT('k','index','table',TABLE_NAME,'name',INDEX_NAME,'column',COLUMN_NAME,
  'unique',NON_UNIQUE = 0,'method',INDEX_TYPE)
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;
SELECT JSON_OBJECT('k','fk','name',k.CONSTRAINT_NAME,'table',k.TABLE_NAME,'column',k.COLUMN_NAME,
  'toSchema',k.REFERENCED_TABLE_SCHEMA,'toTable',k.REFERENCED_TABLE_NAME,'toColumn',k.REFERENCED_COLUMN_NAME,
  'onDelete',LOWER(r.DELETE_RULE),'onUpdate',LOWER(r.UPDATE_RULE))
  FROM information_schema.KEY_COLUMN_USAGE k
  JOIN information_schema.REFERENTIAL_CONSTRAINTS r
    ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME
  WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL
  ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION;
"#;

fn mysql(ep: &Endpoint, script: String) -> AppResult<exec::ExecOutput> {
    let port = ep.port.to_string();
    let user = ep.user.as_deref().unwrap_or("root");
    let mut argv: Vec<&str> = vec![
        "-h",
        &ep.host,
        "-P",
        &port,
        "-u",
        user,
        "--batch",
        "--raw",
        "--skip-column-names",
        "--default-character-set=utf8mb4",
        "--connect-timeout=10",
        INIT,
    ];
    if let Some(db) = ep.database.as_deref() {
        argv.extend(["-D", db]);
    }
    let mut opts = read_opts(30).with_stdin(script.into_bytes());
    if let Some(p) = &ep.password {
        opts = opts.with_env("MYSQL_PWD", p.as_str());
    }
    cli_output("mysql", exec::run("mysql", &argv, opts))
}

pub fn ping(ep: &Endpoint) -> AppResult<()> {
    mysql(ep, "SELECT 1;".to_string()).map(|_| ())
}

pub fn schema(ep: &Endpoint) -> AppResult<DbSchema> {
    if ep.database.is_none() {
        return Err(AppError::InvalidName(
            "Set a database on this MySQL connection to explore it.".into(),
        ));
    }
    let out = mysql(ep, SCHEMA_SQL.to_string())?;
    parse_schema(&out.stdout_str)
}

/// MySQL's JSON has 0/1 for comparisons; accept both.
fn boolish(v: &Value) -> bool {
    v.as_bool().unwrap_or_else(|| v.as_i64() == Some(1))
}

fn text(v: &Value, k: &str) -> String {
    v.get(k)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn opt_text(v: &Value, k: &str) -> Option<String> {
    v.get(k).and_then(Value::as_str).map(str::to_string)
}

pub fn parse_schema(stdout: &str) -> AppResult<DbSchema> {
    let mut database = String::new();
    let mut version = None;
    let mut size = None;
    let mut tables: Vec<TableInfo> = Vec::new();
    let mut fks: BTreeMap<(String, String), Relation> = BTreeMap::new();
    let mut idx: BTreeMap<(String, String), IndexInfo> = BTreeMap::new();

    for line in stdout.lines().map(str::trim).filter(|l| l.starts_with('{')) {
        let v: Value = serde_json::from_str(line)
            .map_err(|e| AppError::Parse(format!("unexpected mysql output: {e}")))?;
        match v.get("k").and_then(Value::as_str) {
            Some("meta") => {
                database = text(&v, "database");
                version = opt_text(&v, "serverVersion");
                size = v
                    .get("sizeBytes")
                    .and_then(|s| s.as_i64().or_else(|| s.as_str()?.parse().ok()));
            }
            Some("table") => tables.push(TableInfo {
                schema: database.clone(),
                name: text(&v, "name"),
                kind: text(&v, "kind"),
                row_estimate: v.get("rowEstimate").and_then(Value::as_i64),
                size_bytes: v.get("sizeBytes").and_then(Value::as_i64),
                comment: opt_text(&v, "comment"),
                columns: vec![],
                indexes: vec![],
            }),
            Some("column") => {
                let table = text(&v, "table");
                if let Some(t) = tables.iter_mut().find(|t| t.name == table) {
                    t.columns.push(ColumnInfo {
                        name: text(&v, "name"),
                        data_type: text(&v, "dataType"),
                        nullable: v.get("nullable").is_some_and(boolish),
                        default: opt_text(&v, "default"),
                        is_primary: v.get("isPrimary").is_some_and(boolish),
                        is_unique: v.get("isUnique").is_some_and(boolish),
                        comment: opt_text(&v, "comment"),
                        presence: None,
                    });
                }
            }
            Some("index") => {
                let key = (text(&v, "table"), text(&v, "name"));
                let e = idx.entry(key.clone()).or_insert_with(|| IndexInfo {
                    primary: key.1 == "PRIMARY",
                    name: key.1.clone(),
                    columns: vec![],
                    unique: v.get("unique").is_some_and(boolish),
                    method: opt_text(&v, "method").map(|m| m.to_lowercase()),
                    definition: None,
                });
                // Functional index parts have no column name.
                e.columns
                    .push(opt_text(&v, "column").unwrap_or_else(|| "(expression)".into()));
            }
            Some("fk") => {
                let key = (text(&v, "table"), text(&v, "name"));
                let e = fks.entry(key.clone()).or_insert_with(|| Relation {
                    name: key.1.clone(),
                    from_schema: database.clone(),
                    from_table: key.0.clone(),
                    from_columns: vec![],
                    to_schema: text(&v, "toSchema"),
                    to_table: text(&v, "toTable"),
                    to_columns: vec![],
                    on_delete: opt_text(&v, "onDelete"),
                    on_update: opt_text(&v, "onUpdate"),
                    inferred: false,
                });
                e.from_columns.push(text(&v, "column"));
                e.to_columns.push(text(&v, "toColumn"));
            }
            _ => {}
        }
    }
    for ((table, _), i) in idx {
        if let Some(t) = tables.iter_mut().find(|t| t.name == table) {
            t.indexes.push(i);
        }
    }
    for t in &mut tables {
        t.indexes
            .sort_by(|a, b| b.primary.cmp(&a.primary).then(a.name.cmp(&b.name)));
    }
    Ok(DbSchema {
        engine: "mysql".into(),
        schemas: vec![database.clone()],
        database,
        server_version: version,
        size_bytes: size,
        tables,
        relations: fks.into_values().collect(),
    })
}

pub fn quote_ident(s: &str) -> String {
    format!("`{}`", s.replace('`', "``"))
}

/// A value as a utf8mb4 string literal that is only hex digits.
fn hex_literal(v: &str) -> String {
    if v.is_empty() {
        return "''".into();
    }
    let hex: String = v.bytes().map(|b| format!("{b:02X}")).collect();
    format!("CONVERT(X'{hex}' USING utf8mb4)")
}

/// Count first (one number line), then one JSON row per line.
pub fn browse_script(req: &BrowseRequest) -> String {
    let mut conds: Vec<String> = Vec::new();
    for f in &req.filters {
        let col = quote_ident(&f.column);
        let v = f.value.as_deref().unwrap_or_default();
        conds.push(match f.op {
            FilterOp::Eq => format!("{col} = {}", hex_literal(v)),
            FilterOp::Neq => format!("NOT ({col} <=> {})", hex_literal(v)),
            FilterOp::Gt => format!("{col} > {}", hex_literal(v)),
            FilterOp::Gte => format!("{col} >= {}", hex_literal(v)),
            FilterOp::Lt => format!("{col} < {}", hex_literal(v)),
            FilterOp::Lte => format!("{col} <= {}", hex_literal(v)),
            FilterOp::Contains => format!(
                "CAST({col} AS CHAR) LIKE CONCAT('%', {}, '%')",
                hex_literal(&like_escape(v))
            ),
            FilterOp::StartsWith => format!(
                "CAST({col} AS CHAR) LIKE CONCAT({}, '%')",
                hex_literal(&like_escape(v))
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
            let pat = hex_literal(&like_escape(q));
            let any = req
                .columns
                .iter()
                .map(|c| {
                    format!(
                        "CAST({} AS CHAR) LIKE CONCAT('%', {pat}, '%')",
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
                " ORDER BY {} {}",
                quote_ident(&s.column),
                if s.desc { "DESC" } else { "ASC" }
            )
        })
        .unwrap_or_default();
    let object = req
        .columns
        .iter()
        .map(|c| format!("{}, {}", hex_literal(c), quote_ident(c)))
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        "SELECT COUNT(*) FROM (SELECT 1 FROM {from}{filter} LIMIT {}) c;\n\
         SELECT JSON_OBJECT({object}) FROM {from}{filter}{order} LIMIT {} OFFSET {};\n",
        COUNT_CAP + 1,
        req.limit,
        req.offset
    )
}

pub fn browse(ep: &Endpoint, req: &BrowseRequest) -> AppResult<BrowsePage> {
    if req.columns.is_empty() {
        return Err(AppError::InvalidName("no columns to read".into()));
    }
    let out = mysql(ep, browse_script(req))?;
    parse_browse(&out.stdout_str)
}

pub fn parse_browse(stdout: &str) -> AppResult<BrowsePage> {
    let mut lines = stdout.lines().map(str::trim).filter(|l| !l.is_empty());
    let count = lines.next().and_then(|l| l.parse::<u64>().ok());
    let rows = lines
        .map(serde_json::from_str)
        .collect::<Result<Vec<Value>, _>>()
        .map_err(|e| AppError::Parse(format!("unexpected mysql row: {e}")))?;
    Ok(BrowsePage {
        rows,
        total: count.map(|n| n.min(COUNT_CAP)),
        total_capped: count.is_some_and(|n| n > COUNT_CAP),
        duration_ms: 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::databases::explorer::Filter;

    #[test]
    fn assembles_the_schema_from_json_lines() {
        let s = parse_schema(include_str!(
            "../../../../../fixtures/databases/mysql-schema.jsonl"
        ))
        .unwrap();
        assert_eq!(s.engine, "mysql");
        assert_eq!(s.database, "shop");
        assert_eq!(s.size_bytes, Some(81920));
        let orders = s.tables.iter().find(|t| t.name == "orders").unwrap();
        assert_eq!(orders.columns.len(), 3);
        assert!(orders.columns[0].is_primary && !orders.columns[0].nullable);
        assert_eq!(orders.indexes[0].name, "PRIMARY");
        assert!(orders.indexes[0].primary);
        let compound = orders
            .indexes
            .iter()
            .find(|i| i.name == "idx_customer_created")
            .unwrap();
        assert_eq!(compound.columns, ["customer_id", "created_at"]);
        assert!(!compound.unique);
        let fk = &s.relations[0];
        assert_eq!(
            (fk.from_table.as_str(), fk.to_table.as_str()),
            ("orders", "customers")
        );
        assert_eq!(fk.from_columns, ["customer_id"]);
        assert_eq!(fk.on_delete.as_deref(), Some("cascade"));
        let view = s.tables.iter().find(|t| t.name == "recent_orders").unwrap();
        assert_eq!(view.kind, "view");
    }

    #[test]
    fn values_are_hex_never_sql() {
        let r = BrowseRequest {
            schema: "shop".into(),
            table: "orders".into(),
            columns: vec!["id".into(), "note".into()],
            filters: vec![Filter {
                column: "note".into(),
                op: FilterOp::Eq,
                value: Some("'; DROP TABLE orders; --".into()),
            }],
            search: None,
            sort: None,
            limit: 20,
            offset: 0,
        };
        let sql = browse_script(&r);
        assert!(!sql.contains("DROP"), "{sql}");
        assert!(sql.contains("`note` = CONVERT(X'273B2044524F50"));
        assert!(sql.contains("JSON_OBJECT(CONVERT(X'6964' USING utf8mb4), `id`"));
        assert_eq!(quote_ident("a`b"), "`a``b`");
    }

    #[test]
    fn parses_count_then_rows() {
        let p = parse_browse("2\n{\"id\": 1, \"note\": \"a\\nb\"}\n{\"id\": 2, \"note\": null}\n")
            .unwrap();
        assert_eq!(p.total, Some(2));
        assert_eq!(p.rows[0]["note"], "a\nb");
        assert!(p.rows[1]["note"].is_null());
    }
}
