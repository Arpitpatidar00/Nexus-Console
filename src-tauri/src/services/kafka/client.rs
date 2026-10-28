// One explorer call's view of a cluster: a bootstrap connection, the
// metadata it returned, and lazily opened connections to the brokers that
// lead the partitions (or coordinate the groups) we ask about. Dropped at the
// end of the call — nothing stays connected in the background.

use super::conn::{Conn, ConnSpec};
use super::kafka_error;
use super::store::format_seed;
use crate::error::{AppError, AppResult};
use kafka_protocol::messages::list_offsets_request::{ListOffsetsPartition, ListOffsetsTopic};
use kafka_protocol::messages::metadata_request::MetadataRequestTopic;
use kafka_protocol::messages::{
    BrokerId, FindCoordinatorRequest, GroupId, ListOffsetsRequest, MetadataRequest,
    MetadataResponse, TopicName,
};
use kafka_protocol::protocol::StrBytes;
use std::collections::{BTreeMap, HashMap};

pub const EARLIEST: i64 = -2;
pub const LATEST: i64 = -1;

pub type Tp = (String, i32);

pub struct Session {
    spec: ConnSpec,
    /// Address → open connection. The bootstrap connection is one of them.
    conns: HashMap<String, Conn>,
    boot: String,
    /// Broker id → advertised `host:port`.
    pub brokers: BTreeMap<i32, (String, u16)>,
    pub leaders: HashMap<Tp, i32>,
    /// Problems worth showing that didn't fail the call.
    pub warnings: Vec<String>,
}

pub fn topic(name: &str) -> TopicName {
    TopicName(StrBytes::from_string(name.to_string()))
}

impl Session {
    /// Try each seed in order; the first that answers (and logs us in) wins.
    pub async fn connect(spec: ConnSpec, seeds: &[(String, u16)]) -> AppResult<Session> {
        let mut errors = Vec::new();
        for (host, port) in seeds {
            match Conn::open(host, *port, &spec).await {
                Ok(conn) => {
                    let boot = conn.address.clone();
                    let mut conns = HashMap::new();
                    conns.insert(boot.clone(), conn);
                    return Ok(Session {
                        spec,
                        conns,
                        boot,
                        brokers: BTreeMap::new(),
                        leaders: HashMap::new(),
                        warnings: Vec::new(),
                    });
                }
                // A bad password is the same on every seed; stop there.
                Err(e @ AppError::Forbidden(_)) => return Err(e),
                Err(e) => errors.push(e.to_string()),
            }
        }
        Err(AppError::Io(if errors.len() == 1 {
            errors.remove(0)
        } else {
            format!(
                "none of the {} bootstrap servers answered: {}",
                seeds.len(),
                errors.join("; ")
            )
        }))
    }

    pub fn boot(&mut self) -> &mut Conn {
        self.conns
            .get_mut(&self.boot)
            .expect("bootstrap connection")
    }

    pub fn features(&self) -> Vec<(String, i16)> {
        self.conns
            .get(&self.boot)
            .map(|c| c.features.clone())
            .unwrap_or_default()
    }

    /// Metadata for some topics (`None` = all). Never auto-creates a topic.
    pub async fn metadata(&mut self, topics: Option<&[String]>) -> AppResult<MetadataResponse> {
        let mut req = MetadataRequest::default();
        req.allow_auto_topic_creation = false;
        req.topics = topics.map(|ts| {
            ts.iter()
                .map(|t| {
                    let mut mt = MetadataRequestTopic::default();
                    mt.name = Some(topic(t));
                    mt
                })
                .collect()
        });
        let res = self.boot().send(req, 1, 12).await?;
        if res.error_code != 0 {
            return Err(kafka_error(res.error_code, "metadata"));
        }
        self.brokers = res
            .brokers
            .iter()
            .map(|b| (b.node_id.0, (b.host.as_str().to_string(), b.port as u16)))
            .collect();
        for t in &res.topics {
            let Some(name) = &t.name else { continue };
            for p in &t.partitions {
                self.leaders.insert(
                    (name.0.as_str().to_string(), p.partition_index),
                    p.leader_id.0,
                );
            }
        }
        Ok(res)
    }

    /// The connection to broker `id`, opened on first use.
    ///
    /// Brokers hand out the address they *advertise*, which in a container
    /// is often a name only the container network knows (`kafka:9092`). For a
    /// single-broker cluster the bootstrap connection is that broker, so use
    /// it; for more, say what went wrong in terms the user can fix.
    pub async fn broker(&mut self, id: i32) -> AppResult<&mut Conn> {
        let (host, port) = self.brokers.get(&id).cloned().ok_or_else(|| {
            AppError::NotFound(format!("broker {id} isn't in the cluster metadata"))
        })?;
        let addr = format_seed(&(host.clone(), port));
        if !self.conns.contains_key(&addr) {
            match Conn::open(&host, port, &self.spec).await {
                Ok(conn) => {
                    self.conns.insert(addr.clone(), conn);
                }
                Err(e) if self.brokers.len() == 1 => {
                    let note = format!(
                        "Broker {id} advertises {addr}, which isn't reachable from this Mac ({e}); \
                         using the bootstrap address instead. Set advertised.listeners to an address this Mac can reach."
                    );
                    if !self.warnings.contains(&note) {
                        self.warnings.push(note);
                    }
                    return Ok(self.boot());
                }
                Err(e) => {
                    return Err(AppError::Io(format!(
                        "broker {id} advertises {addr}, which isn't reachable from this Mac: {e}. \
                         Check the brokers' advertised.listeners."
                    )))
                }
            }
        }
        Ok(self.conns.get_mut(&addr).expect("just inserted"))
    }

    /// Offsets for many partitions at once, one request per leader.
    /// `ts` is EARLIEST, LATEST or a timestamp in ms; isolation 1 makes
    /// LATEST the last stable offset (transactions committed).
    pub async fn list_offsets(
        &mut self,
        parts: &[Tp],
        ts: i64,
        isolation: i8,
    ) -> HashMap<Tp, Result<i64, String>> {
        let mut out = HashMap::new();
        let mut by_leader: BTreeMap<i32, Vec<&Tp>> = BTreeMap::new();
        for tp in parts {
            match self.leaders.get(tp) {
                Some(&l) if l >= 0 => by_leader.entry(l).or_default().push(tp),
                _ => {
                    out.insert(
                        tp.clone(),
                        Err("the partition has no leader right now".into()),
                    );
                }
            }
        }
        for (leader, tps) in by_leader {
            let mut topics: BTreeMap<&str, Vec<i32>> = BTreeMap::new();
            for (t, p) in &tps {
                topics.entry(t.as_str()).or_default().push(*p);
            }
            let mut req = ListOffsetsRequest::default();
            req.replica_id = BrokerId(-1);
            req.isolation_level = isolation;
            req.topics = topics
                .iter()
                .map(|(t, ps)| {
                    let mut lt = ListOffsetsTopic::default();
                    lt.name = topic(t);
                    lt.partitions = ps
                        .iter()
                        .map(|p| {
                            let mut lp = ListOffsetsPartition::default();
                            lp.partition_index = *p;
                            lp.current_leader_epoch = -1;
                            lp.timestamp = ts;
                            lp
                        })
                        .collect();
                    lt
                })
                .collect();
            let res = match self.broker(leader).await {
                Ok(conn) => conn.send(req, 1, 7).await,
                Err(e) => Err(e),
            };
            match res {
                Ok(res) => {
                    for t in res.topics {
                        for p in t.partitions {
                            let tp = (t.name.0.as_str().to_string(), p.partition_index);
                            out.insert(
                                tp,
                                if p.error_code == 0 {
                                    Ok(p.offset)
                                } else {
                                    Err(super::error_text(p.error_code))
                                },
                            );
                        }
                    }
                }
                Err(e) => {
                    for tp in tps {
                        out.insert(tp.clone(), Err(e.to_string()));
                    }
                }
            }
        }
        out
    }

    /// The broker coordinating `group`.
    pub async fn coordinator(&mut self, group: &str) -> AppResult<i32> {
        let conn = self.boot();
        let v = conn.version::<FindCoordinatorRequest>(0, 4)?;
        let mut req = FindCoordinatorRequest::default();
        req.key_type = 0;
        if v >= 4 {
            req.coordinator_keys = vec![StrBytes::from_string(group.to_string())];
        } else {
            req.key = StrBytes::from_string(group.to_string());
        }
        let res = conn.send_at(req, v).await?;
        let (code, node, host, port) = if v >= 4 {
            let c = res
                .coordinators
                .first()
                .ok_or_else(|| AppError::Parse("empty FindCoordinator response".into()))?;
            (c.error_code, c.node_id.0, c.host.to_string(), c.port)
        } else {
            (
                res.error_code,
                res.node_id.0,
                res.host.to_string(),
                res.port,
            )
        };
        if code != 0 {
            return Err(kafka_error(code, &format!("coordinator for {group}")));
        }
        // A coordinator missing from metadata (rare, mid-rebalance) is still dialable.
        self.brokers.entry(node).or_insert((host, port as u16));
        Ok(node)
    }
}

pub fn group(id: &str) -> GroupId {
    GroupId(StrBytes::from_string(id.to_string()))
}
