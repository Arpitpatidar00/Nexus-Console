// Kafka explorer commands. Saving a cluster only touches local files; every
// call to a cluster is a read (Metadata, ListOffsets, Fetch, Describe*) —
// nothing here produces, commits offsets, or changes a topic.

use crate::core::mutation::{mutation, mutation_unattended, BlastRadius, MutationSpec};
use crate::error::{AppError, AppResult};
use crate::services::kafka::client::Session;
use crate::services::kafka::conn::ConnSpec;
use crate::services::kafka::explorer::{
    self, ClusterOverview, ConfigEntry, ConsumeRequest, ConsumeResult, GroupDetail, GroupList,
    KafkaTestResult, TopicDetail, TopicList,
};
use crate::services::kafka::store::{format_seed, new_cluster_id, parse_bootstrap, KafkaCluster};
use crate::services::kafka::{KafkaState, Security, SASL_MECHANISMS};
use std::future::Future;
use std::path::Path;
use tauri::{AppHandle, Manager};
use tokio::sync::OwnedSemaphorePermit;

const ENVS: &[&str] = &["local", "dev", "test", "staging", "prod"];
const MAX_CA_BYTES: u64 = 1024 * 1024;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClusterInput {
    /// Set when editing (or testing an edit): the saved password is reused
    /// unless a new one is given.
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    pub bootstrap: String,
    pub security: Security,
    #[serde(default)]
    pub sasl_mechanism: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    /// `None` keeps the saved one; `Some("")` clears it.
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub ca_cert_path: Option<String>,
    pub env: String,
}

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn has_control(s: &str) -> bool {
    s.chars().any(char::is_control)
}

/// Check everything and return the cluster as it would be saved.
fn validate(input: &ClusterInput) -> AppResult<KafkaCluster> {
    let name = input.name.trim();
    if name.is_empty() || name.len() > 100 || has_control(name) {
        return Err(AppError::InvalidName(
            "name must be 1–100 characters".into(),
        ));
    }
    let seeds = parse_bootstrap(&input.bootstrap)?;
    let env = input.env.trim().to_ascii_lowercase();
    if !ENVS.contains(&env.as_str()) {
        return Err(AppError::InvalidName(format!("unknown environment: {env}")));
    }

    let (sasl_mechanism, username) = if input.security.sasl() {
        let mechanism = input
            .sasl_mechanism
            .as_deref()
            .map(|m| m.trim().to_ascii_uppercase())
            .unwrap_or_default();
        if !SASL_MECHANISMS.contains(&mechanism.as_str()) {
            return Err(AppError::InvalidName(format!(
                "SASL mechanism must be one of {}",
                SASL_MECHANISMS.join(", ")
            )));
        }
        let user = input.username.as_deref().unwrap_or("").trim().to_string();
        if user.is_empty() || user.len() > 256 || has_control(&user) {
            return Err(AppError::InvalidName(
                "SASL needs a username (up to 256 characters)".into(),
            ));
        }
        (Some(mechanism), Some(user))
    } else {
        (None, None)
    };
    if input
        .password
        .as_deref()
        .is_some_and(|p| p.len() > 4096 || p.contains('\0'))
    {
        return Err(AppError::InvalidName("password is too long".into()));
    }

    let ca_cert_path = match input.ca_cert_path.as_deref().map(str::trim) {
        Some(p) if !p.is_empty() && input.security.tls() => {
            let path = Path::new(p);
            if !path.is_absolute() || has_control(p) {
                return Err(AppError::InvalidName(
                    "CA certificate path must be absolute".into(),
                ));
            }
            let meta = std::fs::metadata(path)
                .map_err(|e| AppError::NotFound(format!("CA certificate {p}: {e}")))?;
            if !meta.is_file() || meta.len() > MAX_CA_BYTES {
                return Err(AppError::InvalidName(format!(
                    "{p} isn't a PEM certificate file"
                )));
            }
            Some(p.to_string())
        }
        _ => None,
    };

    let ts = now();
    Ok(KafkaCluster {
        id: input.id.clone().unwrap_or_default(),
        name: name.to_string(),
        bootstrap: seeds.iter().map(format_seed).collect(),
        security: input.security,
        sasl_mechanism,
        username,
        ca_cert_path,
        env,
        created_at: ts,
        updated_at: ts,
        has_password: false,
    })
}

fn spec_of(cluster: &KafkaCluster, password: Option<String>) -> ConnSpec {
    ConnSpec {
        security: cluster.security,
        mechanism: cluster.sasl_mechanism.clone().unwrap_or_default(),
        username: cluster.username.clone(),
        password,
        ca_cert_path: cluster.ca_cert_path.clone(),
    }
}

async fn open(spec: ConnSpec, cluster: &KafkaCluster) -> AppResult<Session> {
    let seeds = parse_bootstrap(&cluster.bootstrap.join(","))?;
    Session::connect(spec, &seeds).await
}

fn saved(app: &AppHandle, id: &str) -> AppResult<(KafkaCluster, Option<String>)> {
    let state = app.state::<KafkaState>();
    let cluster = state
        .store
        .lock()
        .map_err(|_| AppError::Io("kafka store poisoned".into()))?
        .get(id)
        .cloned()
        .ok_or_else(|| AppError::NotFound(format!("Kafka cluster {id}")))?;
    let password = state.password(id);
    Ok((cluster, password))
}

async fn permit(app: &AppHandle) -> AppResult<OwnedSemaphorePermit> {
    app.state::<KafkaState>()
        .permits
        .clone()
        .acquire_owned()
        .await
        .map_err(|e| AppError::Io(format!("kafka permits closed: {e}")))
}

/// Run one read against a saved cluster with a fresh session.
async fn with_session<T, F, Fut>(app: &AppHandle, id: &str, f: F) -> AppResult<T>
where
    F: FnOnce(Session) -> Fut,
    Fut: Future<Output = AppResult<T>>,
{
    let _permit = permit(app).await?;
    let (cluster, password) = saved(app, id)?;
    let session = open(spec_of(&cluster, password), &cluster).await?;
    f(session).await
}

#[tauri::command]
pub async fn kafka_list_clusters(app: AppHandle) -> AppResult<Vec<KafkaCluster>> {
    let state = app.state::<KafkaState>();
    let store = state
        .store
        .lock()
        .map_err(|_| AppError::Io("kafka store poisoned".into()))?;
    Ok(store
        .clusters
        .iter()
        .cloned()
        .map(|mut c| {
            c.has_password = state.has_password(&c.id);
            c
        })
        .collect())
}

#[tauri::command]
pub async fn kafka_add_cluster(app: AppHandle, input: ClusterInput) -> AppResult<KafkaCluster> {
    let mut cluster = validate(&input)?;
    let guard = mutation_unattended(
        MutationSpec::new(
            "Add Kafka Cluster",
            format!(
                "Add Kafka cluster {} ({})",
                cluster.name,
                cluster.bootstrap.join(",")
            ),
            "add_cluster",
        )
        .blast_radius(BlastRadius::LocalIsolated)
        .target(&cluster.name),
    );
    let state = app.state::<KafkaState>();
    cluster.id = new_cluster_id();
    if cluster.security.sasl() {
        state.set_password(&cluster.id, input.password.as_deref())?;
    }
    let mut store = state
        .store
        .lock()
        .map_err(|_| AppError::Io("kafka store poisoned".into()))?;
    if store
        .clusters
        .iter()
        .any(|c| c.name.eq_ignore_ascii_case(&cluster.name))
    {
        drop(store);
        state.forget_password(&cluster.id)?;
        return Err(AppError::Conflict(format!(
            "a cluster named “{}” already exists",
            cluster.name
        )));
    }
    store.clusters.push(cluster.clone());
    store.save(state.dir())?;
    cluster.has_password = state.has_password(&cluster.id);
    guard.success("added");
    Ok(cluster)
}

#[tauri::command]
pub async fn kafka_update_cluster(app: AppHandle, input: ClusterInput) -> AppResult<KafkaCluster> {
    let id = input
        .id
        .clone()
        .ok_or_else(|| AppError::InvalidName("missing cluster id".into()))?;
    let mut cluster = validate(&input)?;
    let guard = mutation_unattended(
        MutationSpec::new(
            "Update Kafka Cluster",
            format!("Update Kafka cluster {}", cluster.name),
            "update_cluster",
        )
        .blast_radius(BlastRadius::LocalIsolated)
        .target(&cluster.name),
    );
    let state = app.state::<KafkaState>();
    let mut store = state
        .store
        .lock()
        .map_err(|_| AppError::Io("kafka store poisoned".into()))?;
    if store
        .clusters
        .iter()
        .any(|c| c.id != id && c.name.eq_ignore_ascii_case(&cluster.name))
    {
        return Err(AppError::Conflict(format!(
            "a cluster named “{}” already exists",
            cluster.name
        )));
    }
    let existing = store
        .clusters
        .iter_mut()
        .find(|c| c.id == id)
        .ok_or_else(|| AppError::NotFound(format!("Kafka cluster {id}")))?;
    cluster.created_at = existing.created_at;
    *existing = cluster.clone();
    store.save(state.dir())?;
    drop(store);
    if cluster.security.sasl() {
        state.set_password(&id, input.password.as_deref())?;
    } else {
        // No SASL, no reason to keep a password around.
        state.forget_password(&id)?;
    }
    cluster.has_password = state.has_password(&id);
    guard.success("updated");
    Ok(cluster)
}

#[tauri::command]
pub async fn kafka_remove_cluster(app: AppHandle, id: String) -> AppResult<()> {
    let state = app.state::<KafkaState>();
    let name = state
        .store
        .lock()
        .map_err(|_| AppError::Io("kafka store poisoned".into()))?
        .get(&id)
        .map(|c| c.name.clone())
        .ok_or_else(|| AppError::NotFound(format!("Kafka cluster {id}")))?;
    let guard = mutation(
        &app,
        MutationSpec::new(
            format!("Remove “{name}”?"),
            "Stackroost forgets this cluster and its saved password. The cluster itself is not touched.",
            "Remove",
        )
        .blast_radius(BlastRadius::LocalIsolated)
        .target(&name)
        .destructive(true),
    )?;
    let mut store = state
        .store
        .lock()
        .map_err(|_| AppError::Io("kafka store poisoned".into()))?;
    store.clusters.retain(|c| c.id != id);
    store.save(state.dir())?;
    drop(store);
    state.forget_password(&id)?;
    guard.success("removed");
    Ok(())
}

async fn run_test(spec: ConnSpec, cluster: &KafkaCluster) -> KafkaTestResult {
    let started = std::time::Instant::now();
    let result = async {
        let mut s = open(spec, cluster).await?;
        let found = explorer::test(&mut s).await?;
        Ok::<_, AppError>((found, std::mem::take(&mut s.warnings)))
    }
    .await;
    let latency_ms = started.elapsed().as_millis() as u64;
    match result {
        Ok(((cluster_id, broker_count, topic_count), warnings)) => KafkaTestResult {
            ok: true,
            latency_ms,
            cluster_id,
            broker_count,
            topic_count,
            error: None,
            warnings,
        },
        Err(e) => KafkaTestResult {
            ok: false,
            latency_ms,
            cluster_id: None,
            broker_count: 0,
            topic_count: 0,
            error: Some(e.to_string()),
            warnings: Vec::new(),
        },
    }
}

/// Try the form's settings before saving them. Editing without retyping the
/// password tests with the saved one.
#[tauri::command]
pub async fn kafka_test_connection(
    app: AppHandle,
    input: ClusterInput,
) -> AppResult<KafkaTestResult> {
    let cluster = validate(&input)?;
    let password = match (&input.password, &input.id) {
        (Some(p), _) => Some(p.clone()),
        (None, Some(id)) => app.state::<KafkaState>().password(id),
        (None, None) => None,
    };
    let _permit = permit(&app).await?;
    Ok(run_test(spec_of(&cluster, password), &cluster).await)
}

#[tauri::command]
pub async fn kafka_ping(app: AppHandle, id: String) -> AppResult<KafkaTestResult> {
    let (cluster, password) = saved(&app, &id)?;
    let _permit = permit(&app).await?;
    Ok(run_test(spec_of(&cluster, password), &cluster).await)
}

#[tauri::command]
pub async fn kafka_overview(app: AppHandle, id: String) -> AppResult<ClusterOverview> {
    with_session(&app, &id, |mut s| async move {
        explorer::overview(&mut s).await
    })
    .await
}

#[tauri::command]
pub async fn kafka_topics(app: AppHandle, id: String) -> AppResult<TopicList> {
    with_session(
        &app,
        &id,
        |mut s| async move { explorer::topics(&mut s).await },
    )
    .await
}

#[tauri::command]
pub async fn kafka_topic_detail(
    app: AppHandle,
    id: String,
    topic: String,
) -> AppResult<TopicDetail> {
    with_session(&app, &id, |mut s| async move {
        explorer::topic_detail(&mut s, &topic).await
    })
    .await
}

#[tauri::command]
pub async fn kafka_groups(app: AppHandle, id: String) -> AppResult<GroupList> {
    with_session(
        &app,
        &id,
        |mut s| async move { explorer::groups(&mut s).await },
    )
    .await
}

#[tauri::command]
pub async fn kafka_group_detail(
    app: AppHandle,
    id: String,
    group: String,
) -> AppResult<GroupDetail> {
    if group.is_empty() || group.len() > 1024 {
        return Err(AppError::InvalidName("bad group id".into()));
    }
    with_session(&app, &id, |mut s| async move {
        explorer::group_detail(&mut s, &group).await
    })
    .await
}

#[tauri::command]
pub async fn kafka_consume(
    app: AppHandle,
    id: String,
    request: ConsumeRequest,
) -> AppResult<ConsumeResult> {
    explorer::validate_consume(&request)?;
    with_session(&app, &id, |mut s| async move {
        explorer::consume(&mut s, &request).await
    })
    .await
}

#[tauri::command]
pub async fn kafka_broker_configs(
    app: AppHandle,
    id: String,
    broker: i32,
) -> AppResult<Vec<ConfigEntry>> {
    with_session(&app, &id, |mut s| async move {
        explorer::broker_configs(&mut s, broker).await
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input() -> ClusterInput {
        ClusterInput {
            id: None,
            name: "Local".into(),
            bootstrap: "localhost:9092".into(),
            security: Security::Plaintext,
            sasl_mechanism: None,
            username: None,
            password: None,
            ca_cert_path: None,
            env: "local".into(),
        }
    }

    #[test]
    fn validates_cluster_input() {
        let c = validate(&input()).unwrap();
        assert_eq!(c.bootstrap, vec!["localhost:9092"]);
        assert_eq!(c.sasl_mechanism, None);

        assert!(validate(&ClusterInput {
            name: " ".into(),
            ..input()
        })
        .is_err());
        assert!(validate(&ClusterInput {
            env: "moon".into(),
            ..input()
        })
        .is_err());
        assert!(validate(&ClusterInput {
            bootstrap: "".into(),
            ..input()
        })
        .is_err());

        // SASL needs a known mechanism and a username.
        let sasl = ClusterInput {
            security: Security::SaslSsl,
            sasl_mechanism: Some("scram-sha-512".into()),
            username: Some("svc".into()),
            ..input()
        };
        let c = validate(&sasl).unwrap();
        assert_eq!(c.sasl_mechanism.as_deref(), Some("SCRAM-SHA-512"));
        assert!(validate(&ClusterInput {
            username: None,
            ..sasl
        })
        .is_err());
        assert!(validate(&ClusterInput {
            security: Security::SaslPlaintext,
            sasl_mechanism: Some("GSSAPI".into()),
            username: Some("svc".into()),
            ..input()
        })
        .is_err());
    }

    #[test]
    fn ca_path_is_checked_only_with_tls() {
        // Ignored without TLS.
        let c = validate(&ClusterInput {
            ca_cert_path: Some("relative.pem".into()),
            ..input()
        })
        .unwrap();
        assert_eq!(c.ca_cert_path, None);
        // Must be absolute and exist with TLS.
        assert!(validate(&ClusterInput {
            security: Security::Ssl,
            ca_cert_path: Some("relative.pem".into()),
            ..input()
        })
        .is_err());
        assert!(validate(&ClusterInput {
            security: Security::Ssl,
            ca_cert_path: Some("/nonexistent/ca.pem".into()),
            ..input()
        })
        .is_err());
    }
}
