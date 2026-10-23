# Database fixtures

Real explorer output, read by the parser tests in
`src-tauri/src/services/databases/explorer/`:

- `pg-schema.json`: the catalog query in `explorer/postgres.rs` run on a
  PostgreSQL 16 scratch database (two schemas, a view, a self-reference, a
  composite foreign key, an expression index).
- `mysql-schema.jsonl`: the `JSON_OBJECT` lines `explorer/mysql.rs` reads, in
  MySQL 8's shape (0/1 booleans, one line per index column).
