// MongoDB: there is no declared schema, so fields are inferred from a random
// sample — each path's types and how often it's present (what Compass shows).
// Parameters reach the script as one EJSON string literal, never as code.

use super::{
    cli_output, read_opts, BrowsePage, BrowseRequest, DbSchema, Endpoint, FilterOp, COUNT_CAP,
};
use crate::core::exec;
use crate::error::{AppError, AppResult};
use serde_json::{json, Map, Value};

const SAMPLE: u32 = 200;

const SCHEMA_JS: &str = r#"
const P = EJSON.parse(__PARAMS__);
function kindOf(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return 'array';
  if (v instanceof Date) return 'date';
  if (typeof v === 'object' && v._bsontype) {
    const b = String(v._bsontype);
    return b.toLowerCase() === 'objectid' ? 'objectId' : b.charAt(0).toLowerCase() + b.slice(1);
  }
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'double';
  return typeof v;
}
function walk(doc, prefix, fields, depth) {
  for (const [k, v] of Object.entries(doc)) {
    const path = prefix ? prefix + '.' + k : k;
    const t = kindOf(v);
    let f = fields.get(path);
    if (!f) { f = { count: 0, types: {} }; fields.set(path, f); }
    f.count++;
    f.types[t] = (f.types[t] || 0) + 1;
    if (t === 'object' && depth < 3) walk(v, path, fields, depth + 1);
  }
}
const out = { engine: 'mongodb', database: db.getName(), serverVersion: null, sizeBytes: null,
  schemas: [db.getName()], tables: [], relations: [] };
try { out.serverVersion = db.version(); } catch (e) {}
try { const s = db.runCommand({ dbStats: 1 }); out.sizeBytes = (s.storageSize || 0) + (s.indexSize || 0); } catch (e) {}
for (const info of db.getCollectionInfos()) {
  if (info.name.startsWith('system.')) continue;
  const c = db.getCollection(info.name);
  const t = { schema: db.getName(), name: info.name, kind: info.type === 'view' ? 'view' : 'collection',
    rowEstimate: null, sizeBytes: null, comment: null, columns: [], indexes: [] };
  try { t.rowEstimate = c.estimatedDocumentCount(); } catch (e) {}
  try { const s = db.runCommand({ collStats: info.name }); t.sizeBytes = (s.storageSize || 0) + (s.totalIndexSize || 0); } catch (e) {}
  try {
    t.indexes = c.getIndexes().map((i) => {
      const kinds = Object.values(i.key).filter((v) => typeof v === 'string');
      return { name: i.name, columns: Object.keys(i.key), unique: !!i.unique || i.name === '_id_',
        primary: i.name === '_id_', method: kinds.length ? kinds[0] : 'btree', definition: JSON.stringify(i.key) };
    });
  } catch (e) {}
  const fields = new Map();
  let n = 0;
  try { c.aggregate([{ $sample: { size: P.sample } }]).forEach((d) => { n++; walk(d, '', fields, 0); }); } catch (e) {}
  t.columns = [...fields.entries()].map(([name, f]) => {
    const types = Object.entries(f.types).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    return { name, dataType: types.filter((x) => x !== 'null').join(' | ') || 'null',
      nullable: f.count < n || types.includes('null'), default: null,
      isPrimary: name === '_id', isUnique: name === '_id', comment: null, presence: n ? f.count / n : null };
  });
  out.tables.push(t);
}
print(JSON.stringify(out));
"#;

const BROWSE_JS: &str = r#"
const P = EJSON.parse(__PARAMS__);
const c = db.getCollection(P.collection);
const rows = c.find(P.filter).sort(P.sort).skip(P.skip).limit(P.limit).toArray();
let total = null;
try { total = c.countDocuments(P.filter, { limit: P.countCap, maxTimeMS: 5000 }); } catch (e) {}
print(EJSON.stringify({ rows: rows, total: total }, { relaxed: true }));
"#;

/// The script with its parameters as one JS string literal (serde's JSON
/// string escaping is valid JavaScript), parsed by EJSON on the other side.
fn with_params(script: &str, params: &Value) -> String {
    let literal = serde_json::to_string(&params.to_string()).unwrap_or_else(|_| "\"{}\"".into());
    script.replace("__PARAMS__", &literal)
}

fn mongosh(ep: &Endpoint, script: String) -> AppResult<exec::ExecOutput> {
    let port = ep.port.to_string();
    let db = ep.database.as_deref().unwrap_or("test");
    let mut argv: Vec<&str> = vec!["--norc", "--quiet", "--host", &ep.host, "--port", &port];
    if let Some(u) = ep.user.as_deref() {
        argv.extend(["--username", u, "--authenticationDatabase", "admin"]);
        if let Some(p) = ep.password.as_deref() {
            argv.extend(["--password", p]);
        }
    }
    argv.extend([db, "--eval", &script]);
    cli_output("mongosh", exec::run("mongosh", &argv, read_opts(45)))
}

/// mongosh can print warnings before the result; the result is the last JSON line.
fn last_json_line(stdout: &str) -> Option<&str> {
    stdout
        .lines()
        .rev()
        .map(str::trim)
        .find(|l| l.starts_with('{'))
}

pub fn schema(ep: &Endpoint) -> AppResult<DbSchema> {
    let out = mongosh(ep, with_params(SCHEMA_JS, &json!({ "sample": SAMPLE })))?;
    parse_schema(&out.stdout_str)
}

pub fn parse_schema(stdout: &str) -> AppResult<DbSchema> {
    let line = last_json_line(stdout)
        .ok_or_else(|| AppError::Parse("mongosh printed no schema".into()))?;
    serde_json::from_str(line)
        .map_err(|e| AppError::Parse(format!("unexpected mongosh output: {e}")))
}

fn regex_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if "\\^$.|?*+()[]{}/".contains(c) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// A typed-in value as every BSON value it could mean: Compass makes people
/// write ObjectId('…'); here `65f…` (24 hex) matches the ObjectId or the
/// string, `42` the number or the string, `true` the boolean or the string.
fn candidates(v: &str) -> Vec<Value> {
    let mut out = vec![Value::String(v.to_string())];
    if v.len() == 24 && v.bytes().all(|b| b.is_ascii_hexdigit()) {
        out.push(json!({ "$oid": v.to_lowercase() }));
    }
    if let Ok(n) = v.parse::<i64>() {
        out.push(json!(n));
    } else if let Ok(f) = v.parse::<f64>() {
        if f.is_finite() {
            out.push(json!(f));
        }
    }
    match v {
        "true" => out.push(json!(true)),
        "false" => out.push(json!(false)),
        _ => {}
    }
    out
}

/// For ranges a value is one thing: a number, an ISO date, else a string.
fn ordered(v: &str) -> Value {
    if let Ok(n) = v.parse::<f64>() {
        if n.is_finite() {
            return json!(n);
        }
    }
    let b = v.as_bytes();
    if b.len() >= 10 && b[4] == b'-' && b[7] == b'-' && b[..4].iter().all(u8::is_ascii_digit) {
        return json!({ "$date": v });
    }
    json!(v)
}

pub fn browse_params(req: &BrowseRequest) -> Value {
    let mut and: Vec<Value> = Vec::new();
    for f in &req.filters {
        let v = f.value.as_deref().unwrap_or_default();
        let cond = match f.op {
            FilterOp::Eq => json!({ "$in": candidates(v) }),
            FilterOp::Neq => json!({ "$nin": candidates(v) }),
            FilterOp::Gt => json!({ "$gt": ordered(v) }),
            FilterOp::Gte => json!({ "$gte": ordered(v) }),
            FilterOp::Lt => json!({ "$lt": ordered(v) }),
            FilterOp::Lte => json!({ "$lte": ordered(v) }),
            FilterOp::Contains => json!({ "$regex": regex_escape(v), "$options": "i" }),
            FilterOp::StartsWith => {
                json!({ "$regex": format!("^{}", regex_escape(v)), "$options": "i" })
            }
            FilterOp::IsNull => Value::Null,
            FilterOp::NotNull => json!({ "$ne": null }),
        };
        let mut m = Map::new();
        m.insert(f.column.clone(), cond);
        and.push(Value::Object(m));
    }
    if let Some(q) = req
        .search
        .as_deref()
        .map(str::trim)
        .filter(|q| !q.is_empty())
    {
        let any: Vec<Value> = req
            .columns
            .iter()
            .filter(|c| !c.contains('.'))
            .map(|c| {
                let mut m = Map::new();
                m.insert(
                    c.clone(),
                    json!({ "$regex": regex_escape(q), "$options": "i" }),
                );
                Value::Object(m)
            })
            .collect();
        if !any.is_empty() {
            and.push(json!({ "$or": any }));
        }
    }
    let filter = if and.is_empty() {
        json!({})
    } else {
        json!({ "$and": and })
    };
    let mut sort = Map::new();
    match &req.sort {
        Some(s) => {
            sort.insert(s.column.clone(), json!(if s.desc { -1 } else { 1 }));
        }
        None => {
            sort.insert("_id".into(), json!(1));
        }
    }
    json!({
        "collection": req.table,
        "filter": filter,
        "sort": sort,
        "skip": req.offset,
        "limit": req.limit,
        "countCap": COUNT_CAP + 1,
    })
}

pub fn browse(ep: &Endpoint, req: &BrowseRequest) -> AppResult<BrowsePage> {
    let out = mongosh(ep, with_params(BROWSE_JS, &browse_params(req)))?;
    parse_browse(&out.stdout_str)
}

pub fn parse_browse(stdout: &str) -> AppResult<BrowsePage> {
    let line =
        last_json_line(stdout).ok_or_else(|| AppError::Parse("mongosh printed no rows".into()))?;
    let v: Value = serde_json::from_str(line)
        .map_err(|e| AppError::Parse(format!("unexpected mongosh output: {e}")))?;
    let count = v.get("total").and_then(Value::as_u64);
    Ok(BrowsePage {
        rows: v
            .get("rows")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
        total: count.map(|n| n.min(COUNT_CAP)),
        total_capped: count.is_some_and(|n| n > COUNT_CAP),
        duration_ms: 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::databases::explorer::{Filter, SortSpec};

    #[test]
    fn parameters_are_a_string_literal_not_code() {
        let p = json!({ "collection": "x\"); db.dropDatabase(); (\"" });
        let s = with_params("const P = EJSON.parse(__PARAMS__);", &p);
        // The whole payload sits inside one JS string: the quotes are escaped.
        assert!(s.starts_with("const P = EJSON.parse(\"{"));
        assert!(s.contains("\\\\\\\")"), "{s}");
        assert!(!s.contains("__PARAMS__"));
    }

    #[test]
    fn filters_become_typed_mongo_queries() {
        let req = BrowseRequest {
            schema: "app".into(),
            table: "orders".into(),
            columns: vec!["_id".into(), "status".into(), "meta.source".into()],
            filters: vec![
                Filter {
                    column: "userId".into(),
                    op: FilterOp::Eq,
                    value: Some("65F0A1B2C3D4E5F601234567".into()),
                },
                Filter {
                    column: "total".into(),
                    op: FilterOp::Gte,
                    value: Some("10.5".into()),
                },
                Filter {
                    column: "createdAt".into(),
                    op: FilterOp::Lt,
                    value: Some("2026-10-01".into()),
                },
                Filter {
                    column: "note".into(),
                    op: FilterOp::Contains,
                    value: Some("a.b(".into()),
                },
                Filter {
                    column: "deletedAt".into(),
                    op: FilterOp::IsNull,
                    value: None,
                },
            ],
            search: Some("paid".into()),
            sort: Some(SortSpec {
                column: "createdAt".into(),
                desc: true,
            }),
            limit: 20,
            offset: 40,
        };
        let p = browse_params(&req);
        let and = p["filter"]["$and"].as_array().unwrap();
        assert_eq!(
            and[0]["userId"]["$in"][1],
            json!({ "$oid": "65f0a1b2c3d4e5f601234567" })
        );
        assert_eq!(and[1]["total"]["$gte"], json!(10.5));
        assert_eq!(and[2]["createdAt"]["$lt"], json!({ "$date": "2026-10-01" }));
        assert_eq!(and[3]["note"]["$regex"], "a\\.b\\(");
        assert!(and[4]["deletedAt"].is_null());
        // Search looks at top-level fields only.
        assert_eq!(and[5]["$or"].as_array().unwrap().len(), 2);
        assert_eq!(p["sort"], json!({ "createdAt": -1 }));
        assert_eq!(
            (p["skip"].as_u64(), p["limit"].as_u64()),
            (Some(40), Some(20))
        );
    }

    #[test]
    fn number_and_bool_candidates() {
        assert_eq!(candidates("42"), vec![json!("42"), json!(42)]);
        assert_eq!(candidates("true"), vec![json!("true"), json!(true)]);
        assert_eq!(candidates("hello"), vec![json!("hello")]);
    }

    #[test]
    fn parses_mongosh_output_after_warnings() {
        let out = "Warning: something deprecated\n{\"rows\":[{\"_id\":{\"$oid\":\"65f0a1b2c3d4e5f601234567\"},\"n\":1}],\"total\":1}\n";
        let p = parse_browse(out).unwrap();
        assert_eq!(p.rows[0]["_id"]["$oid"], "65f0a1b2c3d4e5f601234567");
        assert_eq!(p.total, Some(1));
    }
}
