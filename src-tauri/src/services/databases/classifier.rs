use crate::error::{AppError, AppResult};

pub fn sanitize_and_classify_query(raw_query: &str, allow_writes: bool) -> AppResult<String> {
    let mut cleaned = String::new();
    // Strip comments
    for line in raw_query.lines() {
        let t = line.trim();
        if t.starts_with("--") || t.starts_with('#') {
            continue;
        }
        cleaned.push_str(line);
        cleaned.push(' ');
    }

    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidName("Query cannot be empty".into()));
    }

    if trimmed.starts_with("db.") {
        if !allow_writes {
            let lower = trimmed.to_lowercase();
            let forbidden = [
                "insert",
                "update",
                "delete",
                "remove",
                "drop",
                "create",
                "bulkwrite",
                "$out",
                "$merge",
                "eval",
                "runcommand",
            ];
            for f in &forbidden {
                if lower.contains(f) {
                    return Err(AppError::InvalidName(format!(
                        "Mutating MongoDB operation containing '{f}' is forbidden in read-only sessions."
                    )));
                }
            }
        }
        return Ok(trimmed.to_string());
    }

    // Check for multi-statements (disallowed for safety)
    let statements: Vec<&str> = trimmed
        .split(';')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();

    if statements.len() > 1 {
        return Err(AppError::InvalidName(
            "Multiple statements in a single query are forbidden for security".into(),
        ));
    }

    let query = statements[0];
    // Extract uppercase alphanumeric words/tokens
    let tokens: Vec<String> = query
        .split(|c: char| !c.is_alphanumeric() && c != '_')
        .filter(|s| !s.is_empty())
        .map(|s| s.to_uppercase())
        .collect();

    let first = tokens.first().map(|s| s.as_str()).unwrap_or("");

    // If writes are forbidden, strictly enforce read-only
    if !allow_writes {
        let read_verbs = ["SELECT", "EXPLAIN", "SHOW", "DESCRIBE", "DESC", "WITH"];
        if !read_verbs.contains(&first) {
            return Err(AppError::InvalidName(format!(
                "Operation '{first}' is blocked in read-only mode. Only SELECT / EXPLAIN queries are permitted."
            )));
        }

        let dangerous_keywords = [
            "DELETE",
            "UPDATE",
            "INSERT",
            "DROP",
            "ALTER",
            "TRUNCATE",
            "CREATE",
            "GRANT",
            "REVOKE",
            "COPY",
            "EXEC",
            "EXECUTE",
            "PG_SLEEP",
            "BENCHMARK",
        ];

        for tok in &tokens {
            if dangerous_keywords.contains(&tok.as_str()) {
                // If it is inside a WITH clause or subquery, check if it is mutating
                return Err(AppError::InvalidName(format!(
                    "Mutating keyword '{tok}' is forbidden in read-only sessions."
                )));
            }
        }
    }

    // Auto-append LIMIT 500 to SELECT queries if not specified
    let mut final_query = query.to_string();
    if (first == "SELECT" || first == "WITH") && !tokens.iter().any(|t| t == "LIMIT") {
        final_query.push_str(" LIMIT 500");
    }

    Ok(final_query)
}

/// Redis commands a read-only session may run.
const REDIS_READ: &[&str] = &[
    "GET",
    "MGET",
    "STRLEN",
    "GETRANGE",
    "EXISTS",
    "TYPE",
    "TTL",
    "PTTL",
    "SCAN",
    "KEYS",
    "RANDOMKEY",
    "DBSIZE",
    "INFO",
    "PING",
    "TIME",
    "ECHO",
    "MEMORY",
    "OBJECT",
    "HGET",
    "HMGET",
    "HGETALL",
    "HKEYS",
    "HVALS",
    "HLEN",
    "HEXISTS",
    "HSCAN",
    "LRANGE",
    "LLEN",
    "LINDEX",
    "LPOS",
    "SMEMBERS",
    "SCARD",
    "SISMEMBER",
    "SMISMEMBER",
    "SSCAN",
    "SRANDMEMBER",
    "ZRANGE",
    "ZRANGEBYSCORE",
    "ZREVRANGE",
    "ZCARD",
    "ZSCORE",
    "ZRANK",
    "ZCOUNT",
    "ZSCAN",
    "XRANGE",
    "XREVRANGE",
    "XLEN",
    "XINFO",
    "PFCOUNT",
    "GETBIT",
    "BITCOUNT",
    "GEOPOS",
    "GEODIST",
    "GEOSEARCH",
    "JSON.GET",
    "COMMAND",
];

/// Never from this UI, even with writes allowed: they wipe, reconfigure,
/// stop or script the server.
const REDIS_BLOCKED: &[&str] = &[
    "FLUSHALL",
    "FLUSHDB",
    "CONFIG",
    "SHUTDOWN",
    "DEBUG",
    "MODULE",
    "SCRIPT",
    "EVAL",
    "EVALSHA",
    "FCALL",
    "FUNCTION",
    "MIGRATE",
    "REPLICAOF",
    "SLAVEOF",
    "ACL",
    "CLUSTER",
    "FAILOVER",
    "SAVE",
    "BGSAVE",
    "BGREWRITEAOF",
    "MONITOR",
    "SUBSCRIBE",
    "PSUBSCRIBE",
    "SYNC",
    "PSYNC",
    "CLIENT",
    "SWAPDB",
    "MOVE",
    "RESTORE",
    "BLPOP",
    "BRPOP",
    "BLMOVE",
    "BZPOPMIN",
    "BZPOPMAX",
    "XREAD",
    "XREADGROUP",
    "WAIT",
];

/// Pure: one Redis command line → argv for `redis-cli`. Quotes group words
/// (`SET greeting "hello world"`); one command per run.
pub fn classify_redis(raw: &str, allow_writes: bool) -> AppResult<Vec<String>> {
    let line = raw
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#') && !l.starts_with("--"))
        .collect::<Vec<_>>();
    if line.len() > 1 {
        return Err(AppError::InvalidName(
            "Run one Redis command at a time.".into(),
        ));
    }
    let argv = split_quoted(line.first().copied().unwrap_or(""))?;
    let cmd = argv
        .first()
        .map(|c| c.to_uppercase())
        .ok_or_else(|| AppError::InvalidName("Query cannot be empty".into()))?;
    if REDIS_BLOCKED.contains(&cmd.as_str()) {
        return Err(AppError::InvalidName(format!(
            "{cmd} is blocked here — it can wipe, reconfigure or stop the server."
        )));
    }
    if !allow_writes && !REDIS_READ.contains(&cmd.as_str()) {
        return Err(AppError::InvalidName(format!(
            "{cmd} is blocked in read-only mode. Allowed: GET, SCAN, KEYS, HGETALL, LRANGE, INFO, …"
        )));
    }
    Ok(argv)
}

fn split_quoted(line: &str) -> AppResult<Vec<String>> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    let mut in_word = false;
    let mut chars = line.chars();
    while let Some(c) = chars.next() {
        match (quote, c) {
            (Some(q), c) if c == q => quote = None,
            (Some(_), '\\') => {
                if let Some(n) = chars.next() {
                    cur.push(n);
                }
            }
            (Some(_), c) => cur.push(c),
            (None, '"' | '\'') => {
                quote = Some(c);
                in_word = true;
            }
            (None, c) if c.is_whitespace() => {
                if in_word {
                    out.push(std::mem::take(&mut cur));
                    in_word = false;
                }
            }
            (None, c) => {
                cur.push(c);
                in_word = true;
            }
        }
    }
    if quote.is_some() {
        return Err(AppError::InvalidName(
            "Unclosed quote in Redis command.".into(),
        ));
    }
    if in_word {
        out.push(cur);
    }
    if out.iter().any(|a| a.chars().any(|c| c.is_control())) {
        return Err(AppError::InvalidName(
            "Control characters aren't allowed.".into(),
        ));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    #[test]
    fn redis_reads_pass_writes_need_permission_admin_never() {
        assert_eq!(
            classify_redis("GET user:1", false).unwrap(),
            vec!["GET", "user:1"]
        );
        assert_eq!(
            classify_redis(r#"set greeting "hello world""#, true).unwrap(),
            vec!["set", "greeting", "hello world"]
        );
        assert!(classify_redis("SET a 1", false).is_err());
        assert!(classify_redis("FLUSHALL", true).is_err());
        assert!(classify_redis("config set dir /tmp", true).is_err());
        assert!(classify_redis("GET a\nDEL a", true).is_err());
        assert!(classify_redis(r#"GET "unclosed"#, false).is_err());
        assert!(classify_redis("   ", false).is_err());
    }

    use super::*;

    #[test]
    fn test_allows_simple_select_and_appends_limit() {
        let q = "SELECT id, name FROM users";
        let res = sanitize_and_classify_query(q, false).unwrap();
        assert_eq!(res, "SELECT id, name FROM users LIMIT 500");
    }

    #[test]
    fn test_preserves_existing_limit() {
        let q = "SELECT * FROM orders LIMIT 20";
        let res = sanitize_and_classify_query(q, false).unwrap();
        assert_eq!(res, "SELECT * FROM orders LIMIT 20");
    }

    #[test]
    fn test_rejects_delete_in_readonly() {
        let q = "DELETE FROM users WHERE id = 1";
        assert!(sanitize_and_classify_query(q, false).is_err());
    }

    #[test]
    fn test_rejects_with_delete_trick() {
        let q = "WITH deleted AS (DELETE FROM users RETURNING *) SELECT * FROM deleted";
        assert!(sanitize_and_classify_query(q, false).is_err());
    }

    #[test]
    fn test_rejects_multiple_statements() {
        let q = "SELECT 1; DROP TABLE users;";
        assert!(sanitize_and_classify_query(q, false).is_err());
    }
}
