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

#[cfg(test)]
mod tests {
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
