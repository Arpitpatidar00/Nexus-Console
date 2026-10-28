// Against a real broker. Ignored by default. The assertions expect a
// single-node apache/kafka (4.x) with listeners PLAINTEXT on 9092, SASL_PLAINTEXT
// on 9094 (PLAIN alice/alice-secret, SCRAM-SHA-256/512 bob/bob-secret) and a
// PLAINTEXT 9095 that advertises `unreachable.invalid:9095`, seeded with:
//   orders (3 partitions): 300 keyed JSON messages with headers trace,source;
//     every 50th has note "hello world"
//   codecs: 40 messages each in zstd, lz4, snappy, gzip
//   events: plain lines plus a transactional perf-test run (commit markers)
//   compacted (cleanup.policy=compact): a few keys and one tombstone
//   empty-topic (4 partitions)
//   groups: billing (Empty, lagging on orders); live-reader (one running
//     console consumer on orders, client.id=stackroost-test-client)
// Then: cargo test --test kafka_live -- --ignored --nocapture

use stackroost_lib::services::kafka::client::Session;
use stackroost_lib::services::kafka::conn::ConnSpec;
use stackroost_lib::services::kafka::explorer::{self, ConsumeRequest, StartAt};
use stackroost_lib::services::kafka::store::parse_bootstrap;
use stackroost_lib::services::kafka::Security;

fn plain() -> ConnSpec {
    ConnSpec {
        security: Security::Plaintext,
        mechanism: String::new(),
        username: None,
        password: None,
        ca_cert_path: None,
    }
}

fn sasl(mechanism: &str, user: &str, pass: &str) -> ConnSpec {
    ConnSpec {
        security: Security::SaslPlaintext,
        mechanism: mechanism.into(),
        username: Some(user.into()),
        password: Some(pass.into()),
        ca_cert_path: None,
    }
}

async fn session(spec: ConnSpec, seeds: &str) -> Session {
    Session::connect(spec, &parse_bootstrap(seeds).unwrap())
        .await
        .expect("connect")
}

fn consume(topic: &str, start: StartAt, limit: u32) -> ConsumeRequest {
    ConsumeRequest {
        topic: topic.into(),
        partitions: None,
        start,
        limit,
        search: None,
    }
}

#[tokio::test]
#[ignore]
async fn overview_topics_and_configs() {
    let mut s = session(plain(), "localhost:9092").await;
    let o = explorer::overview(&mut s).await.unwrap();
    println!("overview: {o:#?}");
    assert_eq!(o.brokers.len(), 1);
    assert!(o.cluster_id.is_some());
    assert!(o.features.iter().any(|f| f.name == "metadata.version"));
    assert!(o.brokers[0].size_bytes.unwrap() > 0);

    let mut s = session(plain(), "localhost:9092").await;
    let t = explorer::topics(&mut s).await.unwrap();
    let orders = t.topics.iter().find(|t| t.name == "orders").unwrap();
    assert_eq!(orders.partitions, 3);
    assert_eq!(orders.messages, Some(300));
    assert!(orders.size_bytes.unwrap() > 0);
    assert!(t
        .topics
        .iter()
        .any(|t| t.name == "__consumer_offsets" && t.internal));
    assert_eq!(
        t.topics
            .iter()
            .find(|t| t.name == "empty-topic")
            .unwrap()
            .messages,
        Some(0)
    );

    let mut s = session(plain(), "localhost:9092").await;
    let d = explorer::topic_detail(&mut s, "compacted").await.unwrap();
    let policy = d
        .configs
        .iter()
        .find(|c| c.name == "cleanup.policy")
        .unwrap();
    assert_eq!(policy.value.as_deref(), Some("compact"));
    assert!(!policy.is_default);
    assert_eq!(policy.source, "topic");
    assert!(d.topic_id.is_some());

    let mut s = session(plain(), "localhost:9092").await;
    let missing = explorer::topic_detail(&mut s, "no-such-topic").await;
    println!("missing topic: {missing:?}");
    assert!(missing.is_err());

    let mut s = session(plain(), "localhost:9092").await;
    let b = explorer::broker_configs(&mut s, 1).await.unwrap();
    assert!(b.iter().any(|c| c.name == "log.retention.hours"));
}

#[tokio::test]
#[ignore]
async fn reads_messages_every_way() {
    // Newest first across 3 partitions.
    let mut s = session(plain(), "localhost:9092").await;
    let r = explorer::consume(&mut s, &consume("orders", StartAt::Latest, 50))
        .await
        .unwrap();
    assert_eq!(r.messages.len(), 50);
    assert!(r.partial.is_none());
    assert!(r
        .messages
        .windows(2)
        .all(|w| w[0].timestamp >= w[1].timestamp));
    let m = &r.messages[0];
    assert_eq!(m.headers.len(), 2);
    assert_eq!(m.headers[0].key, "trace");
    assert_eq!(
        m.value.as_ref().unwrap().format,
        stackroost_lib::services::kafka::payload::PayloadFormat::Json
    );

    // Oldest first, one partition, from an offset.
    let mut s = session(plain(), "localhost:9092").await;
    let r = explorer::consume(
        &mut s,
        &ConsumeRequest {
            partitions: Some(vec![1]),
            ..consume("orders", StartAt::Offset { offset: 10 }, 5)
        },
    )
    .await
    .unwrap();
    assert_eq!(
        r.messages.iter().map(|m| m.offset).collect::<Vec<_>>(),
        vec![10, 11, 12, 13, 14]
    );
    assert!(r.messages.iter().all(|m| m.partition == 1));

    // Search: 6 of 300 notes say "hello world".
    let mut s = session(plain(), "localhost:9092").await;
    let r = explorer::consume(
        &mut s,
        &ConsumeRequest {
            search: Some("HELLO WORLD".into()),
            ..consume("orders", StartAt::Earliest, 100)
        },
    )
    .await
    .unwrap();
    assert_eq!(r.messages.len(), 6, "{r:#?}");
    let mut s = session(plain(), "localhost:9092").await;
    let r = explorer::consume(
        &mut s,
        &ConsumeRequest {
            search: Some("hello world".into()),
            ..consume("orders", StartAt::Latest, 3)
        },
    )
    .await
    .unwrap();
    assert_eq!(r.messages.len(), 3);
    // Newest three of the six: ids 250, 200, 150.
    let ids: Vec<i64> = r
        .messages
        .iter()
        .map(|m| {
            serde_json::from_str::<serde_json::Value>(&m.value.as_ref().unwrap().text).unwrap()
                ["id"]
                .as_i64()
                .unwrap()
        })
        .collect();
    assert_eq!(ids, vec![250, 200, 150], "{ids:?}");

    // Every codec decodes.
    let mut s = session(plain(), "localhost:9092").await;
    let r = explorer::consume(&mut s, &consume("codecs", StartAt::Earliest, 500))
        .await
        .unwrap();
    // Everything up to the end decodes (codecs holds only whole 40-message runs).
    assert_eq!(
        r.messages.len() as i64,
        r.partitions[0].high.unwrap(),
        "{:?}",
        r.warnings
    );
    assert_eq!(r.messages.len() % 160, 0);
    assert!(r.warnings.is_empty(), "{:?}", r.warnings);

    // Transactional writes: commit markers are offsets, not messages.
    let mut s = session(plain(), "localhost:9092").await;
    let r = explorer::consume(&mut s, &consume("events", StartAt::Earliest, 500))
        .await
        .unwrap();
    println!(
        "events: {} messages, ranges {:?}",
        r.messages.len(),
        r.partitions
    );
    assert!(r.messages.len() < r.partitions[0].high.unwrap() as usize);
    assert_eq!(r.partitions[0].reached, r.partitions[0].high);
    // Newest N still means N when markers sit among the last N offsets.
    let mut s = session(plain(), "localhost:9092").await;
    let r = explorer::consume(&mut s, &consume("events", StartAt::Latest, 20))
        .await
        .unwrap();
    assert_eq!(r.messages.len(), 20);
    assert!(r.messages.windows(2).all(|w| w[0].offset > w[1].offset));
    assert_eq!(r.partitions[0].reached, r.partitions[0].high);

    // Tombstones come back with no value.
    let mut s = session(plain(), "localhost:9092").await;
    let r = explorer::consume(&mut s, &consume("compacted", StartAt::Earliest, 50))
        .await
        .unwrap();
    assert!(r.messages.iter().any(|m| m.value.is_none()));

    // Time: the future has nothing; the epoch has everything.
    let mut s = session(plain(), "localhost:9092").await;
    let r = explorer::consume(
        &mut s,
        &consume(
            "orders",
            StartAt::Timestamp {
                timestamp: 4_000_000_000_000,
            },
            10,
        ),
    )
    .await
    .unwrap();
    assert!(r.messages.is_empty());
    let mut s = session(plain(), "localhost:9092").await;
    let r = explorer::consume(
        &mut s,
        &consume("orders", StartAt::Timestamp { timestamp: 0 }, 10),
    )
    .await
    .unwrap();
    assert_eq!(r.messages.len(), 10);

    // Empty topic and bad partition.
    let mut s = session(plain(), "localhost:9092").await;
    let r = explorer::consume(&mut s, &consume("empty-topic", StartAt::Latest, 10))
        .await
        .unwrap();
    assert!(r.messages.is_empty());
    assert_eq!(r.partitions.len(), 4);
    let mut s = session(plain(), "localhost:9092").await;
    let bad = explorer::consume(
        &mut s,
        &ConsumeRequest {
            partitions: Some(vec![9]),
            ..consume("orders", StartAt::Latest, 10)
        },
    )
    .await;
    assert!(bad.is_err());
}

#[tokio::test]
#[ignore]
async fn consumer_groups_and_lag() {
    let mut s = session(plain(), "localhost:9092").await;
    let g = explorer::groups(&mut s).await.unwrap();
    println!("groups: {g:#?}");
    let billing = g.groups.iter().find(|g| g.group_id == "billing").unwrap();
    assert_eq!(billing.state, "Empty");
    assert!(billing.total_lag.unwrap() > 0);
    let live = g
        .groups
        .iter()
        .find(|g| g.group_id == "live-reader")
        .unwrap();
    assert_eq!(live.state, "Stable");
    assert_eq!(live.members, Some(1));

    let mut s = session(plain(), "localhost:9092").await;
    let d = explorer::group_detail(&mut s, "live-reader").await.unwrap();
    println!("live-reader: {d:#?}");
    assert_eq!(d.members.len(), 1);
    assert_eq!(d.members[0].client_id, "stackroost-test-client");
    assert_eq!(d.members[0].assignment[0].partitions.len(), 3);
    assert_eq!(d.total_lag, Some(0));

    let mut s = session(plain(), "localhost:9092").await;
    let missing = explorer::group_detail(&mut s, "no-such-group").await;
    println!("missing group: {missing:?}");
    assert!(missing.is_err());
}

#[tokio::test]
#[ignore]
async fn sasl_logins() {
    for mech in ["SCRAM-SHA-256", "SCRAM-SHA-512"] {
        let mut s = session(sasl(mech, "bob", "bob-secret"), "localhost:9094").await;
        let (id, brokers, _) = explorer::test(&mut s).await.unwrap();
        assert!(id.is_some() && brokers == 1, "{mech}");
    }
    let mut s = session(sasl("PLAIN", "alice", "alice-secret"), "localhost:9094").await;
    explorer::test(&mut s).await.unwrap();

    let bad = Session::connect(
        sasl("SCRAM-SHA-512", "bob", "wrong"),
        &parse_bootstrap("localhost:9094").unwrap(),
    )
    .await;
    println!("bad password: {:?}", bad.as_ref().err());
    assert!(matches!(bad, Err(stackroost_lib::AppError::Forbidden(_))));
    // SASL against a plaintext listener, and plaintext against a SASL one.
    let wrong = Session::connect(
        sasl("PLAIN", "alice", "alice-secret"),
        &parse_bootstrap("localhost:9092").unwrap(),
    )
    .await;
    println!("sasl→plaintext: {:?}", wrong.as_ref().err());
    assert!(wrong.is_err());
    // ApiVersions is allowed before login, so this connects — then fails.
    let mut s = session(plain(), "localhost:9094").await;
    let meta = s.metadata(None).await;
    println!("plaintext→sasl: {:?}", meta.as_ref().err());
    assert!(meta.is_err());
}

#[tokio::test]
#[ignore]
async fn unreachable_advertised_listener_and_dead_seeds() {
    // The BAD listener advertises unreachable.invalid; single broker → fall back.
    let mut s = session(plain(), "localhost:9095").await;
    let r = explorer::consume(&mut s, &consume("orders", StartAt::Latest, 5))
        .await
        .unwrap();
    println!("fallback warnings: {:?}", r.warnings);
    assert_eq!(r.messages.len(), 5);
    assert!(r.warnings.iter().any(|w| w.contains("advertises")));

    // A dead seed before a live one still connects.
    let mut s = session(plain(), "localhost:1, localhost:9092").await;
    explorer::test(&mut s).await.unwrap();

    // Nothing listening at all.
    let dead = Session::connect(plain(), &parse_bootstrap("localhost:1").unwrap()).await;
    println!("dead: {:?}", dead.as_ref().err());
    assert!(dead.is_err());

    // Something that isn't Kafka (an HTTP-ish port that never answers the frame) times out
    // or fails cleanly rather than hanging: covered by the request deadline.
}

/// Every explorer read against any cluster:
///   KAFKA_SMOKE_BOOTSTRAP=host:9092 cargo test --test kafka_live smoke -- --ignored --nocapture
#[tokio::test]
#[ignore]
async fn smoke_any_cluster() {
    let Ok(seeds) = std::env::var("KAFKA_SMOKE_BOOTSTRAP") else {
        return;
    };
    let mut s = session(plain(), &seeds).await;
    let o = explorer::overview(&mut s).await.unwrap();
    println!(
        "brokers {} topics {} features {:?}",
        o.brokers.len(),
        o.topic_count,
        o.features
    );
    let mut s = session(plain(), &seeds).await;
    let t = explorer::topics(&mut s).await.unwrap();
    for topic in t.topics.iter().filter(|t| !t.internal) {
        let mut s = session(plain(), &seeds).await;
        explorer::topic_detail(&mut s, &topic.name).await.unwrap();
        let mut s = session(plain(), &seeds).await;
        let r = explorer::consume(&mut s, &consume(&topic.name, StartAt::Latest, 20))
            .await
            .unwrap();
        println!(
            "{}: {} messages, {:?}",
            topic.name,
            r.messages.len(),
            r.warnings
        );
        assert!(r.warnings.is_empty());
    }
    let mut s = session(plain(), &seeds).await;
    let g = explorer::groups(&mut s).await.unwrap();
    for group in &g.groups {
        let mut s = session(plain(), &seeds).await;
        let d = explorer::group_detail(&mut s, &group.group_id)
            .await
            .unwrap();
        println!("{}: {} lag {:?}", d.group_id, d.state, d.total_lag);
    }
}
