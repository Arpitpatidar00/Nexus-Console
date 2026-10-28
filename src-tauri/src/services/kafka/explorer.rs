// The read-only operations the Kafka page offers. Each one opens a session,
// asks only what it needs, and degrades instead of failing when a part of
// the cluster refuses (ACLs, an unreachable broker): the answer carries
// per-item errors and `warnings` rather than an all-or-nothing error.

use super::client::{group, topic, Session, Tp, EARLIEST, LATEST};
use super::payload::{self, Payload};
use super::{error_text, kafka_error};
use crate::error::{AppError, AppResult};
use bytes::Bytes;
use kafka_protocol::messages::consumer_protocol_assignment::ConsumerProtocolAssignment;
use kafka_protocol::messages::describe_configs_request::DescribeConfigsResource;
use kafka_protocol::messages::describe_log_dirs_request::DescribableLogDirTopic;
use kafka_protocol::messages::fetch_request::{FetchPartition, FetchTopic};
use kafka_protocol::messages::offset_fetch_request::OffsetFetchRequestGroup;
use kafka_protocol::messages::{
    BrokerId, DescribeConfigsRequest, DescribeGroupsRequest, DescribeLogDirsRequest, FetchRequest,
    ListGroupsRequest, MetadataResponse, OffsetFetchRequest,
};
use kafka_protocol::protocol::{Decodable, StrBytes};
use kafka_protocol::records::{RecordBatchDecoder, TimestampType};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::time::{Duration, Instant};

/// Messages one browse may return.
pub const MAX_LIMIT: u32 = 500;
/// Records one browse may look at before it stops and says so.
const MAX_SCAN: u64 = 50_000;
/// With a search and "newest first", look back this far across the topic.
const SEARCH_WINDOW: i64 = 20_000;
/// Payload bytes one browse may hold in memory before it stops.
const MAX_KEPT_BYTES: usize = 48 * 1024 * 1024;
/// Newest-first passes, each stepping back over twice as many offsets.
const MAX_PASSES: u32 = 5;
const CONSUME_BUDGET: Duration = Duration::from_secs(20);
const FETCH_MAX_BYTES: i32 = 8 * 1024 * 1024;
const PARTITION_MAX_BYTES: i32 = 1024 * 1024;
/// Groups whose lag one list computes; more are listed without it.
const MAX_GROUPS_WITH_LAG: usize = 1_000;

// ---------------------------------------------------------------------------
// Connection test & overview
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KafkaTestResult {
    pub ok: bool,
    pub latency_ms: u64,
    pub cluster_id: Option<String>,
    pub broker_count: usize,
    pub topic_count: usize,
    pub error: Option<String>,
    pub warnings: Vec<String>,
}

pub async fn test(s: &mut Session) -> AppResult<(Option<String>, usize, usize)> {
    let meta = s.metadata(None).await?;
    // Reaching every broker, not just the seed, is what the explorer needs.
    let ids: Vec<i32> = s.brokers.keys().copied().collect();
    for id in ids {
        if let Err(e) = s.broker(id).await {
            s.warnings.push(e.to_string());
        }
    }
    Ok((
        meta.cluster_id.map(|c| c.to_string()),
        meta.brokers.len(),
        meta.topics.iter().filter(|t| !t.is_internal).count(),
    ))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BrokerInfo {
    pub id: i32,
    pub host: String,
    pub port: u16,
    pub rack: Option<String>,
    pub is_controller: bool,
    pub leader_count: usize,
    pub replica_count: usize,
    /// Bytes of partition data in this broker's log dirs.
    pub size_bytes: Option<i64>,
    pub disk_total_bytes: Option<i64>,
    pub disk_usable_bytes: Option<i64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Feature {
    pub name: String,
    pub level: i16,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClusterOverview {
    pub cluster_id: Option<String>,
    pub controller_id: Option<i32>,
    pub brokers: Vec<BrokerInfo>,
    pub topic_count: usize,
    pub internal_topic_count: usize,
    pub partition_count: usize,
    pub under_replicated_partitions: usize,
    pub offline_partitions: usize,
    /// Partitions whose leader isn't their preferred (first) replica.
    pub non_preferred_leaders: usize,
    pub features: Vec<Feature>,
    pub warnings: Vec<String>,
}

struct LogDirUsage {
    /// (topic, partition) → bytes, on this broker.
    sizes: HashMap<Tp, i64>,
    total: Option<i64>,
    usable: Option<i64>,
}

async fn log_dirs(s: &mut Session, broker: i32, topics: Option<&[Tp]>) -> AppResult<LogDirUsage> {
    let mut req = DescribeLogDirsRequest::default();
    req.topics = topics.map(|tps| {
        let mut by_topic: BTreeMap<&str, Vec<i32>> = BTreeMap::new();
        for (t, p) in tps {
            by_topic.entry(t.as_str()).or_default().push(*p);
        }
        by_topic
            .into_iter()
            .map(|(t, ps)| {
                let mut d = DescribableLogDirTopic::default();
                d.topic = topic(t);
                d.partitions = ps;
                d
            })
            .collect()
    });
    let conn = s.broker(broker).await?;
    let v = conn.version::<DescribeLogDirsRequest>(1, 4)?;
    let res = conn.send_at(req, v).await?;
    if res.error_code != 0 {
        return Err(kafka_error(res.error_code, "log dirs"));
    }
    let mut usage = LogDirUsage {
        sizes: HashMap::new(),
        total: None,
        usable: None,
    };
    for dir in res.results {
        if dir.error_code != 0 {
            continue;
        }
        if v >= 4 && dir.total_bytes >= 0 {
            *usage.total.get_or_insert(0) += dir.total_bytes;
            *usage.usable.get_or_insert(0) += dir.usable_bytes.max(0);
        }
        for t in dir.topics {
            for p in t.partitions {
                // A "future" replica is a copy mid-move between dirs.
                if !p.is_future_key {
                    *usage
                        .sizes
                        .entry((t.name.0.to_string(), p.partition_index))
                        .or_insert(0) += p.partition_size;
                }
            }
        }
    }
    Ok(usage)
}

pub async fn overview(s: &mut Session) -> AppResult<ClusterOverview> {
    let meta = s.metadata(None).await?;
    let controller = (meta.controller_id.0 >= 0).then_some(meta.controller_id.0);
    let mut leaders: HashMap<i32, usize> = HashMap::new();
    let mut replicas: HashMap<i32, usize> = HashMap::new();
    let (mut parts, mut urp, mut offline, mut skewed) = (0, 0, 0, 0);
    for t in &meta.topics {
        for p in &t.partitions {
            parts += 1;
            if p.leader_id.0 < 0 {
                offline += 1;
            } else {
                *leaders.entry(p.leader_id.0).or_default() += 1;
                if p.replica_nodes
                    .first()
                    .is_some_and(|r| r.0 != p.leader_id.0)
                {
                    skewed += 1;
                }
            }
            if p.isr_nodes.len() < p.replica_nodes.len() {
                urp += 1;
            }
            for r in &p.replica_nodes {
                *replicas.entry(r.0).or_default() += 1;
            }
        }
    }

    let mut brokers = Vec::new();
    for b in &meta.brokers {
        let id = b.node_id.0;
        let (size, total, usable, error) = match log_dirs(s, id, None).await {
            Ok(u) => (Some(u.sizes.values().sum()), u.total, u.usable, None),
            Err(e) => (None, None, None, Some(e.to_string())),
        };
        brokers.push(BrokerInfo {
            id,
            host: b.host.to_string(),
            port: b.port as u16,
            rack: b.rack.as_ref().map(|r| r.to_string()),
            is_controller: controller == Some(id),
            leader_count: leaders.get(&id).copied().unwrap_or(0),
            replica_count: replicas.get(&id).copied().unwrap_or(0),
            size_bytes: size,
            disk_total_bytes: total,
            disk_usable_bytes: usable,
            error,
        });
    }
    brokers.sort_by_key(|b| b.id);

    Ok(ClusterOverview {
        cluster_id: meta.cluster_id.map(|c| c.to_string()),
        controller_id: controller,
        brokers,
        topic_count: meta.topics.iter().filter(|t| !t.is_internal).count(),
        internal_topic_count: meta.topics.iter().filter(|t| t.is_internal).count(),
        partition_count: parts,
        under_replicated_partitions: urp,
        offline_partitions: offline,
        non_preferred_leaders: skewed,
        features: s
            .features()
            .into_iter()
            .map(|(name, level)| Feature { name, level })
            .collect(),
        warnings: std::mem::take(&mut s.warnings),
    })
}

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TopicSummary {
    pub name: String,
    pub internal: bool,
    pub partitions: usize,
    pub replication_factor: usize,
    pub under_replicated: usize,
    pub offline: usize,
    /// Sum of (end − start) over partitions: exact for plain topics, an upper
    /// bound for compacted ones.
    pub messages: Option<i64>,
    pub size_bytes: Option<i64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TopicList {
    pub topics: Vec<TopicSummary>,
    pub warnings: Vec<String>,
}

fn all_partitions(meta: &MetadataResponse) -> Vec<Tp> {
    meta.topics
        .iter()
        .filter(|t| t.error_code == 0)
        .filter_map(|t| t.name.as_ref().map(|n| (n.0.to_string(), t)))
        .flat_map(|(n, t)| {
            t.partitions
                .iter()
                .map(move |p| (n.clone(), p.partition_index))
        })
        .collect()
}

/// Leader-replica sizes from every broker's log dirs. `None` if no broker
/// would tell (DescribeLogDirs needs cluster DESCRIBE).
async fn leader_sizes(s: &mut Session, only: Option<&[Tp]>) -> Option<HashMap<Tp, i64>> {
    let mut sizes = HashMap::new();
    let mut any = false;
    let brokers: Vec<i32> = s.brokers.keys().copied().collect();
    for b in brokers {
        let mine: Vec<Tp> = match only {
            Some(tps) => tps
                .iter()
                .filter(|tp| s.leaders.get(*tp) == Some(&b))
                .cloned()
                .collect(),
            None => Vec::new(),
        };
        if only.is_some() && mine.is_empty() {
            continue;
        }
        match log_dirs(s, b, only.map(|_| mine.as_slice())).await {
            Ok(u) => {
                any = true;
                for (tp, size) in u.sizes {
                    if s.leaders.get(&tp) == Some(&b) {
                        sizes.insert(tp, size);
                    }
                }
            }
            Err(e) => {
                let note = format!("Sizes unavailable from broker {b}: {e}");
                if !s.warnings.contains(&note) {
                    s.warnings.push(note);
                }
            }
        }
    }
    any.then_some(sizes)
}

pub async fn topics(s: &mut Session) -> AppResult<TopicList> {
    let meta = s.metadata(None).await?;
    let tps = all_partitions(&meta);
    let low = s.list_offsets(&tps, EARLIEST, 0).await;
    let high = s.list_offsets(&tps, LATEST, 0).await;
    let sizes = leader_sizes(s, None).await;

    let mut topics = Vec::new();
    for t in &meta.topics {
        let Some(name) = t.name.as_ref().map(|n| n.0.to_string()) else {
            continue;
        };
        if t.error_code != 0 {
            topics.push(TopicSummary {
                name,
                internal: t.is_internal,
                partitions: 0,
                replication_factor: 0,
                under_replicated: 0,
                offline: 0,
                messages: None,
                size_bytes: None,
                error: Some(error_text(t.error_code)),
            });
            continue;
        }
        let mut messages = Some(0i64);
        let mut size = sizes.as_ref().map(|_| 0i64);
        for p in &t.partitions {
            let tp = (name.clone(), p.partition_index);
            match (low.get(&tp), high.get(&tp)) {
                (Some(Ok(l)), Some(Ok(h))) => {
                    if let Some(m) = messages.as_mut() {
                        *m += (h - l).max(0);
                    }
                }
                _ => messages = None,
            }
            if let (Some(total), Some(sz)) = (size.as_mut(), sizes.as_ref()) {
                *total += sz.get(&tp).copied().unwrap_or(0);
            }
        }
        topics.push(TopicSummary {
            name,
            internal: t.is_internal,
            partitions: t.partitions.len(),
            replication_factor: t
                .partitions
                .iter()
                .map(|p| p.replica_nodes.len())
                .max()
                .unwrap_or(0),
            under_replicated: t
                .partitions
                .iter()
                .filter(|p| p.isr_nodes.len() < p.replica_nodes.len())
                .count(),
            offline: t.partitions.iter().filter(|p| p.leader_id.0 < 0).count(),
            messages,
            size_bytes: size,
            error: None,
        });
    }
    topics.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(TopicList {
        topics,
        warnings: std::mem::take(&mut s.warnings),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PartitionInfo {
    pub partition: i32,
    pub leader: Option<i32>,
    pub replicas: Vec<i32>,
    pub isr: Vec<i32>,
    pub offline_replicas: Vec<i32>,
    pub low: Option<i64>,
    pub high: Option<i64>,
    pub messages: Option<i64>,
    pub size_bytes: Option<i64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConfigEntry {
    pub name: String,
    pub value: Option<String>,
    /// topic | dynamicBroker | dynamicDefaultBroker | staticBroker | default | other
    pub source: String,
    pub is_default: bool,
    pub read_only: bool,
    pub sensitive: bool,
    pub documentation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TopicDetail {
    pub name: String,
    pub internal: bool,
    pub topic_id: Option<String>,
    pub partitions: Vec<PartitionInfo>,
    pub configs: Vec<ConfigEntry>,
    pub configs_error: Option<String>,
    pub warnings: Vec<String>,
}

fn config_source(code: i8) -> &'static str {
    match code {
        1 => "topic",
        2 => "dynamicBroker",
        3 => "dynamicDefaultBroker",
        4 => "staticBroker",
        5 => "default",
        _ => "other",
    }
}

/// resource_type 2 = topic, 4 = broker. Broker configs are asked of that broker.
async fn describe_configs(
    s: &mut Session,
    resource_type: i8,
    name: &str,
    broker: Option<i32>,
) -> AppResult<Vec<ConfigEntry>> {
    let mut res_req = DescribeConfigsResource::default();
    res_req.resource_type = resource_type;
    res_req.resource_name = StrBytes::from_string(name.to_string());
    res_req.configuration_keys = None;
    let mut req = DescribeConfigsRequest::default();
    req.resources = vec![res_req];
    req.include_synonyms = false;
    req.include_documentation = true;
    let conn = match broker {
        Some(b) => s.broker(b).await?,
        None => s.boot(),
    };
    let res = conn.send(req, 1, 4).await?;
    let result = res
        .results
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Parse("empty DescribeConfigs response".into()))?;
    if result.error_code != 0 {
        let base = kafka_error(result.error_code, "configs");
        return Err(match result.error_message {
            Some(m) if !m.is_empty() => AppError::Io(format!("{base} — {m}")),
            _ => base,
        });
    }
    let mut out: Vec<ConfigEntry> = result
        .configs
        .into_iter()
        .map(|c| {
            let source = config_source(c.config_source);
            ConfigEntry {
                name: c.name.to_string(),
                // Brokers already null sensitive values; never show one anyway.
                value: if c.is_sensitive {
                    None
                } else {
                    c.value.map(|v| v.to_string())
                },
                source: source.to_string(),
                is_default: source == "default",
                read_only: c.read_only,
                sensitive: c.is_sensitive,
                documentation: c
                    .documentation
                    .map(|d| d.to_string())
                    .filter(|d| !d.is_empty()),
            }
        })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

fn find_topic<'a>(
    meta: &'a MetadataResponse,
    name: &str,
) -> AppResult<&'a kafka_protocol::messages::metadata_response::MetadataResponseTopic> {
    let t = meta
        .topics
        .iter()
        .find(|t| t.name.as_ref().is_some_and(|n| n.0.as_str() == name))
        .ok_or_else(|| AppError::NotFound(format!("topic {name} doesn't exist")))?;
    // LEADER_NOT_AVAILABLE right after creation still lists partitions.
    if t.error_code != 0 && t.error_code != 5 {
        return Err(kafka_error(t.error_code, &format!("topic {name}")));
    }
    Ok(t)
}

pub async fn topic_detail(s: &mut Session, name: &str) -> AppResult<TopicDetail> {
    let meta = s.metadata(Some(&[name.to_string()])).await?;
    let t = find_topic(&meta, name)?;
    let tps: Vec<Tp> = t
        .partitions
        .iter()
        .map(|p| (name.to_string(), p.partition_index))
        .collect();
    let low = s.list_offsets(&tps, EARLIEST, 0).await;
    let high = s.list_offsets(&tps, LATEST, 0).await;
    let sizes = leader_sizes(s, Some(&tps)).await;
    let (configs, configs_error) = match describe_configs(s, 2, name, None).await {
        Ok(c) => (c, None),
        Err(e) => (Vec::new(), Some(e.to_string())),
    };

    let mut partitions: Vec<PartitionInfo> = t
        .partitions
        .iter()
        .map(|p| {
            let tp = (name.to_string(), p.partition_index);
            let l = low.get(&tp).and_then(|r| r.as_ref().ok()).copied();
            let h = high.get(&tp).and_then(|r| r.as_ref().ok()).copied();
            let error = if p.error_code != 0 {
                Some(error_text(p.error_code))
            } else {
                low.get(&tp)
                    .and_then(|r| r.as_ref().err())
                    .or_else(|| high.get(&tp).and_then(|r| r.as_ref().err()))
                    .cloned()
            };
            PartitionInfo {
                partition: p.partition_index,
                leader: (p.leader_id.0 >= 0).then_some(p.leader_id.0),
                replicas: p.replica_nodes.iter().map(|b| b.0).collect(),
                isr: p.isr_nodes.iter().map(|b| b.0).collect(),
                offline_replicas: p.offline_replicas.iter().map(|b| b.0).collect(),
                low: l,
                high: h,
                messages: l.zip(h).map(|(l, h)| (h - l).max(0)),
                size_bytes: sizes.as_ref().and_then(|s| s.get(&tp).copied()),
                error,
            }
        })
        .collect();
    partitions.sort_by_key(|p| p.partition);

    let topic_id = (!t.topic_id.is_nil()).then(|| t.topic_id.to_string());
    Ok(TopicDetail {
        name: name.to_string(),
        internal: t.is_internal,
        topic_id,
        partitions,
        configs,
        configs_error,
        warnings: std::mem::take(&mut s.warnings),
    })
}

pub async fn broker_configs(s: &mut Session, broker: i32) -> AppResult<Vec<ConfigEntry>> {
    s.metadata(Some(&[])).await?;
    describe_configs(s, 4, &broker.to_string(), Some(broker)).await
}

// ---------------------------------------------------------------------------
// Consumer groups
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GroupTopicLag {
    pub topic: String,
    pub partitions: usize,
    pub lag: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GroupSummary {
    pub group_id: String,
    pub state: String,
    pub protocol_type: String,
    /// classic | consumer | share | streams — empty on brokers before 3.8.
    pub group_type: String,
    pub assignor: Option<String>,
    pub members: Option<usize>,
    pub coordinator: i32,
    pub topics: Vec<GroupTopicLag>,
    pub total_lag: Option<i64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GroupList {
    pub groups: Vec<GroupSummary>,
    pub warnings: Vec<String>,
}

/// group → committed offsets, or why they couldn't be read.
type Committed = HashMap<String, Result<Vec<(Tp, i64)>, String>>;

async fn offset_fetch(s: &mut Session, coordinator: i32, groups: &[String]) -> Committed {
    let mut out = HashMap::new();
    let conn = match s.broker(coordinator).await {
        Ok(c) => c,
        Err(e) => {
            for g in groups {
                out.insert(g.clone(), Err(e.to_string()));
            }
            return out;
        }
    };
    // v2+ reads every topic when none are named; v8+ takes many groups at once.
    let v = match conn.version::<OffsetFetchRequest>(2, 9) {
        Ok(v) => v,
        Err(e) => {
            for g in groups {
                out.insert(g.clone(), Err(e.to_string()));
            }
            return out;
        }
    };
    if v >= 8 {
        for chunk in groups.chunks(100) {
            let mut req = OffsetFetchRequest::default();
            req.groups = chunk
                .iter()
                .map(|g| {
                    let mut rg = OffsetFetchRequestGroup::default();
                    rg.group_id = group(g);
                    rg.member_id = None;
                    rg.member_epoch = -1;
                    rg.topics = None;
                    rg
                })
                .collect();
            match conn.send_at(req, v).await {
                Ok(res) => {
                    for rg in res.groups {
                        let id = rg.group_id.0.to_string();
                        if rg.error_code != 0 {
                            out.insert(id, Err(error_text(rg.error_code)));
                            continue;
                        }
                        let offsets = rg
                            .topics
                            .into_iter()
                            .flat_map(|t| {
                                let name = t.name.0.to_string();
                                t.partitions.into_iter().filter(|p| p.error_code == 0).map(
                                    move |p| {
                                        ((name.clone(), p.partition_index), p.committed_offset)
                                    },
                                )
                            })
                            .collect();
                        out.insert(id, Ok(offsets));
                    }
                }
                Err(e) => {
                    for g in chunk {
                        out.insert(g.clone(), Err(e.to_string()));
                    }
                }
            }
        }
    } else {
        for g in groups {
            let mut req = OffsetFetchRequest::default();
            req.group_id = group(g);
            req.topics = None;
            let r = match conn.send_at(req, v).await {
                Ok(res) if res.error_code != 0 => Err(error_text(res.error_code)),
                Ok(res) => Ok(res
                    .topics
                    .into_iter()
                    .flat_map(|t| {
                        let name = t.name.0.to_string();
                        t.partitions
                            .into_iter()
                            .filter(|p| p.error_code == 0)
                            .map(move |p| ((name.clone(), p.partition_index), p.committed_offset))
                    })
                    .collect()),
                Err(e) => Err(e.to_string()),
            };
            out.insert(g.clone(), r);
        }
    }
    out
}

struct Described {
    state: String,
    protocol_type: String,
    assignor: String,
    members: Vec<kafka_protocol::messages::describe_groups_response::DescribedGroupMember>,
    error: Option<String>,
}

async fn describe_groups(
    s: &mut Session,
    coordinator: i32,
    groups: &[String],
) -> HashMap<String, Result<Described, String>> {
    let mut out = HashMap::new();
    for chunk in groups.chunks(100) {
        let mut req = DescribeGroupsRequest::default();
        req.groups = chunk.iter().map(|g| group(g)).collect();
        let res = match s.broker(coordinator).await {
            Ok(conn) => conn.send(req, 0, 5).await,
            Err(e) => Err(e),
        };
        match res {
            Ok(res) => {
                for g in res.groups {
                    let id = g.group_id.0.to_string();
                    out.insert(
                        id,
                        Ok(Described {
                            state: g.group_state.to_string(),
                            protocol_type: g.protocol_type.to_string(),
                            assignor: g.protocol_data.to_string(),
                            members: g.members,
                            error: (g.error_code != 0).then(|| {
                                let base = error_text(g.error_code);
                                match g.error_message {
                                    Some(m) if !m.is_empty() => format!("{base} — {m}"),
                                    _ => base,
                                }
                            }),
                        }),
                    );
                }
            }
            Err(e) => {
                for g in chunk {
                    out.insert(g.clone(), Err(e.to_string()));
                }
            }
        }
    }
    out
}

/// Lag per partition against the high watermark — what
/// `kafka-consumer-groups --describe` shows as LOG-END-OFFSET − CURRENT-OFFSET.
fn lag(committed: i64, end: Option<i64>) -> Option<i64> {
    match end {
        Some(end) if committed >= 0 => Some((end - committed).max(0)),
        _ => None,
    }
}

pub async fn groups(s: &mut Session) -> AppResult<GroupList> {
    s.metadata(None).await?;
    // Every broker answers only for the groups it coordinates.
    let brokers: Vec<i32> = s.brokers.keys().copied().collect();
    let mut listed: BTreeMap<String, (i32, String, String, String)> = BTreeMap::new();
    let mut reached = 0;
    for b in brokers {
        let res = match s.broker(b).await {
            Ok(conn) => conn.send(ListGroupsRequest::default(), 0, 5).await,
            Err(e) => Err(e),
        };
        match res {
            Ok(res) if res.error_code != 0 => s
                .warnings
                .push(format!("Broker {b}: {}", error_text(res.error_code))),
            Ok(res) => {
                reached += 1;
                for g in res.groups {
                    listed.insert(
                        g.group_id.0.to_string(),
                        (
                            b,
                            g.protocol_type.to_string(),
                            g.group_state.to_string(),
                            g.group_type.to_string(),
                        ),
                    );
                }
            }
            Err(e) => s.warnings.push(format!("Broker {b}: {e}")),
        }
    }
    if reached == 0 && !s.brokers.is_empty() {
        return Err(AppError::Io(format!(
            "no broker would list consumer groups: {}",
            s.warnings.join("; ")
        )));
    }

    let mut by_coord: BTreeMap<i32, Vec<String>> = BTreeMap::new();
    for (id, (coord, ..)) in &listed {
        by_coord.entry(*coord).or_default().push(id.clone());
    }
    let mut described = HashMap::new();
    let mut committed: Committed = HashMap::new();
    let mut budget = MAX_GROUPS_WITH_LAG;
    for (coord, ids) in &by_coord {
        described.extend(describe_groups(s, *coord, ids).await);
        let take = ids.len().min(budget);
        budget -= take;
        if take > 0 {
            committed.extend(offset_fetch(s, *coord, &ids[..take]).await);
        }
    }
    if listed.len() > MAX_GROUPS_WITH_LAG {
        s.warnings.push(format!(
            "Lag computed for the first {MAX_GROUPS_WITH_LAG} of {} groups.",
            listed.len()
        ));
    }

    let tps: Vec<Tp> = committed
        .values()
        .filter_map(|r| r.as_ref().ok())
        .flatten()
        .map(|(tp, _)| tp.clone())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let ends = s.list_offsets(&tps, LATEST, 0).await;

    let mut groups = Vec::new();
    for (id, (coord, protocol_type, state, group_type)) in listed {
        let desc = described.remove(&id);
        let (state, protocol_type, assignor, members, mut error) = match desc {
            Some(Ok(d)) => (
                if d.state.is_empty() { state } else { d.state },
                if d.protocol_type.is_empty() {
                    protocol_type
                } else {
                    d.protocol_type
                },
                (!d.assignor.is_empty()).then_some(d.assignor),
                d.error.is_none().then_some(d.members.len()),
                d.error,
            ),
            Some(Err(e)) => (state, protocol_type, None, None, Some(e)),
            None => (state, protocol_type, None, None, None),
        };
        let mut topics: BTreeMap<String, (usize, Option<i64>)> = BTreeMap::new();
        let mut total = None;
        match committed.get(&id) {
            Some(Ok(offsets)) => {
                for (tp, off) in offsets {
                    let end = ends.get(tp).and_then(|r| r.as_ref().ok()).copied();
                    let entry = topics.entry(tp.0.clone()).or_insert((0, Some(0)));
                    entry.0 += 1;
                    match lag(*off, end) {
                        Some(l) => {
                            entry.1 = entry.1.map(|x| x + l);
                            total = Some(total.unwrap_or(0) + l);
                        }
                        None => entry.1 = None,
                    }
                }
            }
            Some(Err(e)) if error.is_none() => error = Some(e.clone()),
            _ => {}
        }
        groups.push(GroupSummary {
            group_id: id,
            state: if state.is_empty() {
                "Unknown".into()
            } else {
                state
            },
            protocol_type,
            group_type,
            assignor,
            members,
            coordinator: coord,
            topics: topics
                .into_iter()
                .map(|(topic, (partitions, lag))| GroupTopicLag {
                    topic,
                    partitions,
                    lag,
                })
                .collect(),
            total_lag: total,
            error,
        });
    }
    Ok(GroupList {
        groups,
        warnings: std::mem::take(&mut s.warnings),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TopicPartitions {
    pub topic: String,
    pub partitions: Vec<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GroupMember {
    pub member_id: String,
    pub group_instance_id: Option<String>,
    pub client_id: String,
    pub host: String,
    pub assignment: Vec<TopicPartitions>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GroupOffset {
    pub topic: String,
    pub partition: i32,
    /// `None`: assigned but nothing committed yet.
    pub committed: Option<i64>,
    pub log_start: Option<i64>,
    pub log_end: Option<i64>,
    pub lag: Option<i64>,
    pub member_id: Option<String>,
    pub client_id: Option<String>,
    pub host: Option<String>,
    /// The committed offset was already deleted by retention: a restart would
    /// fall back to `auto.offset.reset`.
    pub behind_log_start: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GroupDetail {
    pub group_id: String,
    pub state: String,
    pub protocol_type: String,
    pub assignor: Option<String>,
    pub coordinator: i32,
    pub members: Vec<GroupMember>,
    pub offsets: Vec<GroupOffset>,
    pub total_lag: Option<i64>,
    pub error: Option<String>,
    pub warnings: Vec<String>,
}

/// A consumer-protocol member assignment: i16 version, then the body.
fn parse_assignment(bytes: &Bytes) -> Option<Vec<TopicPartitions>> {
    if bytes.len() < 2 {
        return None;
    }
    let mut buf = bytes.clone();
    let version = i16::from_be_bytes([buf[0], buf[1]]);
    let _ = bytes::Buf::get_i16(&mut buf);
    let a = ConsumerProtocolAssignment::decode(&mut buf, version.clamp(0, 3)).ok()?;
    Some(
        a.assigned_partitions
            .into_iter()
            .map(|tp| TopicPartitions {
                topic: tp.topic.0.to_string(),
                partitions: tp.partitions,
            })
            .collect(),
    )
}

pub async fn group_detail(s: &mut Session, id: &str) -> AppResult<GroupDetail> {
    s.metadata(Some(&[])).await?;
    let coord = s.coordinator(id).await?;
    let desc = describe_groups(s, coord, &[id.to_string()])
        .await
        .remove(id)
        .unwrap_or_else(|| Err("the coordinator didn't describe this group".into()));
    let committed = offset_fetch(s, coord, &[id.to_string()])
        .await
        .remove(id)
        .unwrap_or(Ok(Vec::new()));

    let (state, protocol_type, assignor, raw_members, mut error) = match desc {
        Ok(d) => (
            d.state,
            d.protocol_type,
            (!d.assignor.is_empty()).then_some(d.assignor),
            d.members,
            d.error,
        ),
        Err(e) => (String::new(), String::new(), None, Vec::new(), Some(e)),
    };
    if state == "Dead" && raw_members.is_empty() && committed.as_ref().is_ok_and(|c| c.is_empty()) {
        return Err(AppError::NotFound(format!(
            "consumer group {id} doesn't exist"
        )));
    }

    let mut members = Vec::new();
    let mut owner: HashMap<Tp, usize> = HashMap::new();
    for m in raw_members {
        let assignment = if protocol_type == "consumer" {
            parse_assignment(&m.member_assignment).unwrap_or_default()
        } else {
            Vec::new()
        };
        for tp in &assignment {
            for p in &tp.partitions {
                owner.insert((tp.topic.clone(), *p), members.len());
            }
        }
        members.push(GroupMember {
            member_id: m.member_id.to_string(),
            group_instance_id: m.group_instance_id.map(|g| g.to_string()),
            client_id: m.client_id.to_string(),
            host: m.client_host.to_string(),
            assignment,
        });
    }

    let committed: HashMap<Tp, i64> = match committed {
        Ok(c) => c.into_iter().collect(),
        Err(e) => {
            error.get_or_insert(e);
            HashMap::new()
        }
    };
    let tps: Vec<Tp> = committed
        .keys()
        .chain(owner.keys())
        .cloned()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let topics: Vec<String> = tps
        .iter()
        .map(|(t, _)| t.clone())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    if !topics.is_empty() {
        s.metadata(Some(&topics)).await?;
    }
    let ends = s.list_offsets(&tps, LATEST, 0).await;
    let starts = s.list_offsets(&tps, EARLIEST, 0).await;

    let mut total = None;
    let offsets: Vec<GroupOffset> = tps
        .into_iter()
        .map(|tp| {
            let c = committed.get(&tp).copied().filter(|o| *o >= 0);
            let end = ends.get(&tp).and_then(|r| r.as_ref().ok()).copied();
            let start = starts.get(&tp).and_then(|r| r.as_ref().ok()).copied();
            let l = c.and_then(|c| lag(c, end));
            if let Some(l) = l {
                total = Some(total.unwrap_or(0) + l);
            }
            let m = owner.get(&tp).map(|i| &members[*i]);
            GroupOffset {
                behind_log_start: matches!((c, start), (Some(c), Some(s)) if c < s),
                topic: tp.0,
                partition: tp.1,
                committed: c,
                log_start: start,
                log_end: end,
                lag: l,
                member_id: m.map(|m| m.member_id.clone()),
                client_id: m.map(|m| m.client_id.clone()),
                host: m.map(|m| m.host.clone()),
            }
        })
        .collect();

    Ok(GroupDetail {
        group_id: id.to_string(),
        state: if state.is_empty() {
            "Unknown".into()
        } else {
            state
        },
        protocol_type,
        assignor,
        coordinator: coord,
        members,
        offsets,
        total_lag: total,
        error,
        warnings: std::mem::take(&mut s.warnings),
    })
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StartAt {
    Latest,
    Earliest,
    Offset { offset: i64 },
    Timestamp { timestamp: i64 },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConsumeRequest {
    pub topic: String,
    /// `None` = every partition.
    #[serde(default)]
    pub partitions: Option<Vec<i32>>,
    pub start: StartAt,
    pub limit: u32,
    /// Case-insensitive text looked for in key, value and headers.
    #[serde(default)]
    pub search: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MessageHeader {
    pub key: String,
    pub value: Option<Payload>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KafkaMessage {
    pub partition: i32,
    pub offset: i64,
    pub timestamp: i64,
    /// create | logAppend
    pub timestamp_type: String,
    pub key: Option<Payload>,
    /// `None` is a tombstone (a delete marker on a compacted topic).
    pub value: Option<Payload>,
    pub headers: Vec<MessageHeader>,
    pub size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PartitionRange {
    pub partition: i32,
    pub low: Option<i64>,
    pub high: Option<i64>,
    /// Where reading began and the offset it reached.
    pub start: Option<i64>,
    pub reached: Option<i64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConsumeResult {
    pub messages: Vec<KafkaMessage>,
    pub partitions: Vec<PartitionRange>,
    pub scanned: u64,
    pub duration_ms: u64,
    /// Why reading stopped before it was done, if it did.
    pub partial: Option<String>,
    pub warnings: Vec<String>,
}

struct Cursor {
    pos: i64,
    end: i64,
    start: i64,
    low: i64,
    high: Option<i64>,
    found: Vec<KafkaMessage>,
    /// Newest first: messages from passes over newer offsets, kept while an
    /// older window is read.
    later: Vec<KafkaMessage>,
    /// Where the first pass ended — what "reached" reports.
    top: i64,
    error: Option<String>,
    /// Producers with an open aborted transaction (read_committed).
    aborted_open: HashSet<i64>,
    stalls: u8,
}

impl Cursor {
    fn done(&self, limit: usize) -> bool {
        self.error.is_some()
            || self.pos >= self.end
            || self.found.len() >= limit
            || self.stalls >= 3
    }
}

fn to_message(partition: i32, r: kafka_protocol::records::Record) -> KafkaMessage {
    let size = r.key.as_ref().map_or(0, |k| k.len())
        + r.value.as_ref().map_or(0, |v| v.len())
        + r.headers
            .iter()
            .map(|(k, v)| k.len() + v.as_ref().map_or(0, |v| v.len()))
            .sum::<usize>();
    KafkaMessage {
        partition,
        offset: r.offset,
        timestamp: r.timestamp,
        timestamp_type: match r.timestamp_type {
            TimestampType::Creation => "create",
            TimestampType::LogAppend => "logAppend",
        }
        .into(),
        key: r.key.as_deref().map(payload::decode),
        value: r.value.as_deref().map(payload::decode),
        headers: r
            .headers
            .into_iter()
            .map(|(k, v)| MessageHeader {
                key: k.to_string(),
                value: v.as_deref().map(payload::decode),
            })
            .collect(),
        size,
    }
}

fn matches(r: &kafka_protocol::records::Record, needle: &str) -> bool {
    r.key
        .as_deref()
        .is_some_and(|k| payload::searchable(k).contains(needle))
        || r.value
            .as_deref()
            .is_some_and(|v| payload::searchable(v).contains(needle))
        || r.headers.iter().any(|(k, v)| {
            k.to_lowercase().contains(needle)
                || v.as_deref()
                    .is_some_and(|v| payload::searchable(v).contains(needle))
        })
}

pub fn validate_consume(req: &ConsumeRequest) -> AppResult<()> {
    if req.topic.is_empty() || req.topic.len() > 249 {
        return Err(AppError::InvalidName(
            "topic name must be 1–249 characters".into(),
        ));
    }
    if req.limit == 0 || req.limit > MAX_LIMIT {
        return Err(AppError::InvalidName(format!(
            "limit must be between 1 and {MAX_LIMIT}"
        )));
    }
    match req.start {
        StartAt::Offset { offset } if offset < 0 => {
            Err(AppError::InvalidName("offset can't be negative".into()))
        }
        StartAt::Timestamp { timestamp } if timestamp < 0 => Err(AppError::InvalidName(
            "timestamp can't be before 1970".into(),
        )),
        _ => Ok(()),
    }?;
    if req.search.as_ref().is_some_and(|s| s.len() > 1024) {
        return Err(AppError::InvalidName("search text is too long".into()));
    }
    Ok(())
}

/// Read up to `limit` messages: newest first (`latest`), or from a starting
/// point forward. Bounded by a record count and a time budget; reports how
/// far it got in each partition so "nothing found" is never ambiguous.
pub async fn consume(s: &mut Session, req: &ConsumeRequest) -> AppResult<ConsumeResult> {
    validate_consume(req)?;
    let started = Instant::now();
    let limit = req.limit as usize;
    let needle = req
        .search
        .as_ref()
        .map(|n| n.trim().to_lowercase())
        .filter(|n| !n.is_empty());

    let meta = s.metadata(Some(std::slice::from_ref(&req.topic))).await?;
    let t = find_topic(&meta, &req.topic)?;
    let all: Vec<i32> = t.partitions.iter().map(|p| p.partition_index).collect();
    let chosen: Vec<i32> = match &req.partitions {
        Some(ps) if !ps.is_empty() => {
            for p in ps {
                if !all.contains(p) {
                    return Err(AppError::NotFound(format!(
                        "{} has no partition {p} (it has {})",
                        req.topic,
                        all.len()
                    )));
                }
            }
            ps.clone()
        }
        _ => all,
    };
    let tps: Vec<Tp> = chosen.iter().map(|p| (req.topic.clone(), *p)).collect();
    let low = s.list_offsets(&tps, EARLIEST, 0).await;
    let high = s.list_offsets(&tps, LATEST, 0).await;
    // The last stable offset: messages past it may still be rolled back.
    let stable = s.list_offsets(&tps, LATEST, 1).await;
    let at_ts = match req.start {
        StartAt::Timestamp { timestamp } => Some(s.list_offsets(&tps, timestamp, 1).await),
        _ => None,
    };

    let mut cursors: BTreeMap<i32, Cursor> = BTreeMap::new();
    let mut ranges_err: Vec<PartitionRange> = Vec::new();
    for tp in &tps {
        let ok = |m: &HashMap<Tp, Result<i64, String>>| {
            m.get(tp).cloned().unwrap_or(Err("no answer".into()))
        };
        let (l, h, end) = match (ok(&low), ok(&high), ok(&stable)) {
            (Ok(l), Ok(h), Ok(e)) => (l, h, e.min(h)),
            (l, h, e) => {
                ranges_err.push(PartitionRange {
                    partition: tp.1,
                    low: l.as_ref().ok().copied(),
                    high: h.as_ref().ok().copied(),
                    start: None,
                    reached: None,
                    error: [l.err(), h.err(), e.err()].into_iter().flatten().next(),
                });
                continue;
            }
        };
        let start = match &req.start {
            StartAt::Earliest => l,
            StartAt::Latest if needle.is_some() => {
                (end - (SEARCH_WINDOW / tps.len().max(1) as i64).max(limit as i64)).max(l)
            }
            StartAt::Latest => (end - limit as i64).max(l),
            StartAt::Offset { offset } => (*offset).clamp(l, end),
            StartAt::Timestamp { .. } => match at_ts.as_ref().map(ok) {
                // -1: no message at or after that time.
                Some(Ok(o)) if o >= 0 => o.clamp(l, end),
                _ => end,
            },
        };
        cursors.insert(
            tp.1,
            Cursor {
                pos: start,
                end,
                start,
                low: l,
                high: Some(h),
                found: Vec::new(),
                later: Vec::new(),
                top: end,
                error: None,
                aborted_open: HashSet::new(),
                stalls: 0,
            },
        );
    }

    let newest_first = matches!(req.start, StartAt::Latest);
    // Newest first reads each partition to its end, keeping a sliding window
    // of the last `limit` matches; forward reads stop at `limit` matches.
    let keep = if newest_first { usize::MAX } else { limit };
    let mut kept_bytes: usize = 0;
    let mut scanned: u64 = 0;
    let mut partial = None;
    let mut warnings: Vec<String> = Vec::new();
    let mut refreshed = false;

    for pass in 0..MAX_PASSES {
        loop {
            let pending: Vec<i32> = cursors
                .iter()
                .filter(|(_, c)| !c.done(keep))
                .map(|(p, _)| *p)
                .collect();
            if pending.is_empty() {
                break;
            }
            if started.elapsed() > CONSUME_BUDGET {
                partial = Some(format!(
                    "Stopped after {}s — narrow it with a partition, offset or time.",
                    CONSUME_BUDGET.as_secs()
                ));
                break;
            }
            if kept_bytes >= MAX_KEPT_BYTES {
                partial = Some(
                    "Stopped: these messages are large — ask for fewer, or pick one partition."
                        .into(),
                );
                break;
            }
            if scanned >= MAX_SCAN {
                partial = Some(format!(
                "Stopped after looking at {MAX_SCAN} messages — narrow it with a partition, offset or time."
            ));
                break;
            }

            let mut by_leader: BTreeMap<i32, Vec<i32>> = BTreeMap::new();
            for p in &pending {
                match s.leaders.get(&(req.topic.clone(), *p)) {
                    Some(&l) if l >= 0 => by_leader.entry(l).or_default().push(*p),
                    _ => {
                        if let Some(c) = cursors.get_mut(p) {
                            c.error = Some("the partition has no leader right now".into());
                        }
                    }
                }
            }
            let mut need_refresh = false;

            for (leader, parts) in by_leader {
                let mut ft = FetchTopic::default();
                ft.topic = topic(&req.topic);
                ft.partitions = parts
                    .iter()
                    .map(|p| {
                        let mut fp = FetchPartition::default();
                        fp.partition = *p;
                        fp.current_leader_epoch = -1;
                        fp.fetch_offset = cursors[p].pos;
                        fp.last_fetched_epoch = -1;
                        fp.log_start_offset = -1;
                        fp.partition_max_bytes = PARTITION_MAX_BYTES;
                        fp
                    })
                    .collect();
                let mut fetch = FetchRequest::default();
                fetch.replica_id = BrokerId(-1);
                fetch.max_wait_ms = 250;
                fetch.min_bytes = 1;
                fetch.max_bytes = FETCH_MAX_BYTES;
                fetch.isolation_level = 1;
                fetch.session_id = 0;
                fetch.session_epoch = -1;
                fetch.topics = vec![ft];

                let res = match s.broker(leader).await {
                    Ok(conn) => conn.send(fetch, 4, 12).await,
                    Err(e) => Err(e),
                };
                let res = match res {
                    Ok(r) => r,
                    Err(e) => {
                        for p in &parts {
                            if let Some(c) = cursors.get_mut(p) {
                                c.error = Some(e.to_string());
                            }
                        }
                        continue;
                    }
                };
                if res.error_code != 0 {
                    for p in &parts {
                        if let Some(c) = cursors.get_mut(p) {
                            c.error = Some(error_text(res.error_code));
                        }
                    }
                    continue;
                }

                for topic_res in res.responses {
                    for pd in topic_res.partitions {
                        let Some(c) = cursors.get_mut(&pd.partition_index) else {
                            continue;
                        };
                        match pd.error_code {
                            0 => {}
                            1 => {
                                // Retention deleted what we were about to read: jump forward.
                                let fresh = s
                                    .list_offsets(
                                        &[(req.topic.clone(), pd.partition_index)],
                                        EARLIEST,
                                        0,
                                    )
                                    .await;
                                let c = cursors.get_mut(&pd.partition_index).expect("cursor");
                                match fresh.into_values().next() {
                                    Some(Ok(l)) if l > c.pos => {
                                        c.low = l;
                                        c.pos = l;
                                    }
                                    _ => c.error = Some(error_text(1)),
                                }
                                continue;
                            }
                            5 | 6 | 74 | 75 if !refreshed => {
                                need_refresh = true;
                                continue;
                            }
                            code => {
                                c.error = Some(error_text(code));
                                continue;
                            }
                        }

                        let mut aborted: Vec<(i64, i64)> = pd
                            .aborted_transactions
                            .unwrap_or_default()
                            .into_iter()
                            .map(|a| (a.first_offset, a.producer_id.0))
                            .collect();
                        aborted.sort_unstable();
                        let mut aborted = aborted.into_iter().peekable();

                        let records = pd.records.unwrap_or_default();
                        let batches = payload::split_batches(&records);
                        if batches.is_empty() {
                            c.stalls += 1;
                            continue;
                        }
                        let before = c.pos;
                        for (header, mut raw) in batches {
                            if header.last_offset < c.pos {
                                continue;
                            }
                            while let Some(&(first, pid)) = aborted.peek() {
                                if first > header.last_offset {
                                    break;
                                }
                                c.aborted_open.insert(pid);
                                aborted.next();
                            }
                            let next = header.last_offset + 1;
                            if header.magic != 2 {
                                let note = "This topic holds pre-0.11 (v0/v1) messages, which aren't supported; they were skipped.".to_string();
                                if !warnings.contains(&note) {
                                    warnings.push(note);
                                }
                                c.pos = c.pos.max(next);
                                continue;
                            }
                            let set = match RecordBatchDecoder::decode(&mut raw) {
                                Ok(set) => set,
                                Err(e) => {
                                    warnings.push(format!(
                                    "Partition {}: skipped offsets {}–{} that couldn't be decoded ({e}).",
                                    pd.partition_index, header.base_offset, header.last_offset
                                ));
                                    c.pos = c.pos.max(next);
                                    continue;
                                }
                            };
                            if header.control {
                                if set
                                    .records
                                    .first()
                                    .is_some_and(|r| payload::is_abort_marker(r.key.as_ref()))
                                {
                                    c.aborted_open.remove(&header.producer_id);
                                }
                                c.pos = c.pos.max(next);
                                continue;
                            }
                            let skip_batch = header.transactional
                                && c.aborted_open.contains(&header.producer_id);
                            for r in set.records {
                                if r.offset < c.pos || r.offset >= c.end {
                                    continue;
                                }
                                if skip_batch {
                                    continue;
                                }
                                scanned += 1;
                                if needle.as_deref().is_some_and(|n| !matches(&r, n)) {
                                    continue;
                                }
                                if c.found.len() < keep {
                                    let m = to_message(pd.partition_index, r);
                                    kept_bytes += m.size.min(2 * payload::MAX_PAYLOAD_TEXT);
                                    c.found.push(m);
                                    if newest_first && c.found.len() > limit {
                                        let gone = c.found.remove(0);
                                        kept_bytes -= gone.size.min(2 * payload::MAX_PAYLOAD_TEXT);
                                    }
                                }
                            }
                            c.pos = c.pos.max(next);
                        }
                        if c.pos == before {
                            c.stalls += 1;
                        } else {
                            c.stalls = 0;
                        }
                    }
                }
            }

            if need_refresh {
                refreshed = true;
                s.metadata(Some(std::slice::from_ref(&req.topic))).await?;
            }
        }

        // "Newest N" first reads the last N offsets, but transaction markers,
        // aborted writes and compaction leave gaps: a partition that came up
        // short steps back over twice as many older offsets and reads again.
        if !newest_first || needle.is_some() || partial.is_some() {
            break;
        }
        let mut stepped = false;
        for c in cursors.values_mut() {
            if c.error.is_some() || c.found.len() + c.later.len() >= limit || c.start <= c.low {
                continue;
            }
            let back = (limit as i64) << (pass + 1);
            let older = c.found.drain(..).chain(c.later.drain(..)).collect();
            c.later = older;
            c.end = c.start;
            c.start = (c.start - back).max(c.low);
            c.pos = c.start;
            c.stalls = 0;
            c.aborted_open.clear();
            stepped = true;
        }
        if !stepped {
            break;
        }
    }

    let mut partitions: Vec<PartitionRange> = cursors
        .iter()
        .map(|(p, c)| PartitionRange {
            partition: *p,
            low: Some(c.low),
            high: c.high,
            start: Some(c.start),
            reached: Some(if newest_first {
                c.top
            } else {
                c.pos.min(c.end)
            }),
            error: c.error.clone().or_else(|| {
                (c.stalls >= 3).then(|| "the broker stopped returning data before the end".into())
            }),
        })
        .chain(ranges_err)
        .collect();
    partitions.sort_by_key(|p| p.partition);

    let mut messages: Vec<KafkaMessage> = cursors
        .into_values()
        .flat_map(|mut c| {
            c.found.append(&mut c.later);
            let extra = c.found.len().saturating_sub(limit);
            c.found.drain(..if newest_first { extra } else { 0 });
            c.found
        })
        .collect();
    if newest_first {
        messages.sort_by(|a, b| {
            b.timestamp
                .cmp(&a.timestamp)
                .then(b.offset.cmp(&a.offset))
                .then(a.partition.cmp(&b.partition))
        });
    } else {
        messages.sort_by(|a, b| {
            a.timestamp
                .cmp(&b.timestamp)
                .then(a.partition.cmp(&b.partition))
                .then(a.offset.cmp(&b.offset))
        });
    }
    messages.truncate(limit);
    warnings.extend(std::mem::take(&mut s.warnings));

    Ok(ConsumeResult {
        messages,
        partitions,
        scanned,
        duration_ms: started.elapsed().as_millis() as u64,
        partial,
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every DTO the page reads, with optional fields both set and unset.
    /// The zod schemas parse this file and must give back exactly the same.
    #[test]
    fn kafka_contracts_golden() {
        use crate::services::kafka::store::KafkaCluster;
        use crate::services::kafka::Security;
        let cluster = KafkaCluster {
            id: "kafka_1_ab".into(),
            name: "Local".into(),
            bootstrap: vec!["localhost:9092".into(), "[::1]:9093".into()],
            security: Security::SaslSsl,
            sasl_mechanism: Some("SCRAM-SHA-512".into()),
            username: Some("svc".into()),
            ca_cert_path: None,
            env: "local".into(),
            created_at: 1,
            updated_at: 2,
            has_password: true,
        };
        let test = KafkaTestResult {
            ok: false,
            latency_ms: 12,
            cluster_id: None,
            broker_count: 0,
            topic_count: 0,
            error: Some("refused".into()),
            warnings: vec!["w".into()],
        };
        let overview = ClusterOverview {
            cluster_id: Some("abc".into()),
            controller_id: Some(1),
            brokers: vec![BrokerInfo {
                id: 1,
                host: "localhost".into(),
                port: 9092,
                rack: None,
                is_controller: true,
                leader_count: 3,
                replica_count: 3,
                size_bytes: Some(1024),
                disk_total_bytes: None,
                disk_usable_bytes: Some(10),
                error: None,
            }],
            topic_count: 2,
            internal_topic_count: 1,
            partition_count: 53,
            under_replicated_partitions: 0,
            offline_partitions: 0,
            non_preferred_leaders: 1,
            features: vec![Feature {
                name: "metadata.version".into(),
                level: 21,
            }],
            warnings: vec![],
        };
        let topics = TopicList {
            topics: vec![TopicSummary {
                name: "orders".into(),
                internal: false,
                partitions: 3,
                replication_factor: 1,
                under_replicated: 0,
                offline: 0,
                messages: Some(42),
                size_bytes: None,
                error: None,
            }],
            warnings: vec!["Sizes unavailable".into()],
        };
        let detail = TopicDetail {
            name: "orders".into(),
            internal: false,
            topic_id: Some("uuid".into()),
            partitions: vec![PartitionInfo {
                partition: 0,
                leader: Some(1),
                replicas: vec![1],
                isr: vec![1],
                offline_replicas: vec![],
                low: Some(0),
                high: Some(42),
                messages: Some(42),
                size_bytes: None,
                error: None,
            }],
            configs: vec![ConfigEntry {
                name: "cleanup.policy".into(),
                value: Some("delete".into()),
                source: "default".into(),
                is_default: true,
                read_only: false,
                sensitive: false,
                documentation: None,
            }],
            configs_error: None,
            warnings: vec![],
        };
        let groups = GroupList {
            groups: vec![GroupSummary {
                group_id: "billing".into(),
                state: "Stable".into(),
                protocol_type: "consumer".into(),
                group_type: "classic".into(),
                assignor: Some("range".into()),
                members: Some(2),
                coordinator: 1,
                topics: vec![GroupTopicLag {
                    topic: "orders".into(),
                    partitions: 3,
                    lag: Some(5),
                }],
                total_lag: Some(5),
                error: None,
            }],
            warnings: vec![],
        };
        let group = GroupDetail {
            group_id: "billing".into(),
            state: "Empty".into(),
            protocol_type: "consumer".into(),
            assignor: None,
            coordinator: 1,
            members: vec![GroupMember {
                member_id: "m-1".into(),
                group_instance_id: None,
                client_id: "app".into(),
                host: "/127.0.0.1".into(),
                assignment: vec![TopicPartitions {
                    topic: "orders".into(),
                    partitions: vec![0, 1],
                }],
            }],
            offsets: vec![GroupOffset {
                topic: "orders".into(),
                partition: 0,
                committed: Some(10),
                log_start: Some(0),
                log_end: Some(15),
                lag: Some(5),
                member_id: Some("m-1".into()),
                client_id: None,
                host: None,
                behind_log_start: false,
            }],
            total_lag: Some(5),
            error: None,
            warnings: vec![],
        };
        let consumed = ConsumeResult {
            messages: vec![KafkaMessage {
                partition: 0,
                offset: 41,
                timestamp: 1_700_000_000_000,
                timestamp_type: "create".into(),
                key: Some(payload::decode(b"order-1")),
                value: None,
                headers: vec![MessageHeader {
                    key: "trace".into(),
                    value: Some(payload::decode(&[0, 0, 0, 0, 9, 0xff])),
                }],
                size: 13,
            }],
            partitions: vec![PartitionRange {
                partition: 0,
                low: Some(0),
                high: Some(42),
                start: Some(41),
                reached: Some(42),
                error: None,
            }],
            scanned: 1,
            duration_ms: 3,
            partial: None,
            warnings: vec![],
        };
        let json = serde_json::to_string_pretty(&serde_json::json!({
            "cluster": cluster,
            "test": test,
            "overview": overview,
            "topics": topics,
            "topicDetail": detail,
            "groups": groups,
            "groupDetail": group,
            "consume": consumed,
            "jsonPayload": payload::decode(br#"{"a":1}"#),
        }))
        .unwrap()
            + "\n";
        let path = format!(
            "{}/../fixtures/kafka/contracts.json",
            env!("CARGO_MANIFEST_DIR")
        );
        if std::env::var_os("UPDATE_GOLDEN").is_some() {
            std::fs::create_dir_all(std::path::Path::new(&path).parent().unwrap()).unwrap();
            std::fs::write(&path, &json).unwrap();
        }
        let golden = std::fs::read_to_string(&path).unwrap_or_default();
        assert_eq!(
            json, golden,
            "Kafka JSON changed; rerun with UPDATE_GOLDEN=1"
        );
    }

    #[test]
    fn lag_ignores_missing_commits_and_clamps() {
        assert_eq!(lag(10, Some(15)), Some(5));
        assert_eq!(lag(20, Some(15)), Some(0));
        assert_eq!(lag(-1, Some(15)), None);
        assert_eq!(lag(10, None), None);
    }

    #[test]
    fn validates_consume_requests() {
        let base = ConsumeRequest {
            topic: "orders".into(),
            partitions: None,
            start: StartAt::Latest,
            limit: 50,
            search: None,
        };
        assert!(validate_consume(&base).is_ok());
        assert!(validate_consume(&ConsumeRequest {
            limit: 0,
            ..base.clone()
        })
        .is_err());
        assert!(validate_consume(&ConsumeRequest {
            limit: 501,
            ..base.clone()
        })
        .is_err());
        assert!(validate_consume(&ConsumeRequest {
            topic: String::new(),
            ..base.clone()
        })
        .is_err());
        assert!(validate_consume(&ConsumeRequest {
            start: StartAt::Offset { offset: -3 },
            ..base.clone()
        })
        .is_err());
        assert!(validate_consume(&ConsumeRequest {
            search: Some("x".repeat(2000)),
            ..base
        })
        .is_err());
    }

    #[test]
    fn start_at_wire_shape() {
        let s: StartAt = serde_json::from_str(r#"{"kind":"offset","offset":42}"#).unwrap();
        assert_eq!(s, StartAt::Offset { offset: 42 });
        let s: StartAt = serde_json::from_str(r#"{"kind":"latest"}"#).unwrap();
        assert_eq!(s, StartAt::Latest);
    }

    #[test]
    fn decodes_member_assignment() {
        use kafka_protocol::messages::consumer_protocol_assignment::TopicPartition;
        use kafka_protocol::protocol::Encodable;
        let mut a = ConsumerProtocolAssignment::default();
        let mut tp = TopicPartition::default();
        tp.topic = topic("orders");
        tp.partitions = vec![0, 2];
        a.assigned_partitions = vec![tp];
        let mut buf = bytes::BytesMut::new();
        bytes::BufMut::put_i16(&mut buf, 1);
        a.encode(&mut buf, 1).unwrap();
        let got = parse_assignment(&buf.freeze()).unwrap();
        assert_eq!(
            got,
            vec![TopicPartitions {
                topic: "orders".into(),
                partitions: vec![0, 2]
            }]
        );
        assert!(parse_assignment(&Bytes::new()).is_none());
    }
}
