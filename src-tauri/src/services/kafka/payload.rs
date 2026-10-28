// Turning raw record bytes into something a person can read, and splitting a
// Fetch response's record bytes into whole batches.

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use bytes::Bytes;
use serde::{Deserialize, Serialize};

/// Bigger values are cut for display; `size` still reports the real length.
pub const MAX_PAYLOAD_TEXT: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PayloadFormat {
    Json,
    Text,
    Binary,
    /// Confluent wire format: magic 0x00 + 4-byte schema id + body.
    SchemaRegistry,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Payload {
    pub format: PayloadFormat,
    /// UTF-8 text, or base64 when `base64` is set (binary bodies).
    pub text: String,
    pub base64: bool,
    pub size: usize,
    pub truncated: bool,
    pub schema_id: Option<u32>,
}

fn looks_like_json(s: &str) -> bool {
    let t = s.trim_start();
    (t.starts_with('{') || t.starts_with('['))
        && serde_json::from_str::<serde_json::Value>(s).is_ok()
}

/// Mostly-printable UTF-8 counts as text; control bytes other than
/// whitespace mean a binary encoding that happens to be valid UTF-8.
fn printable(s: &str) -> bool {
    !s.chars()
        .any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t'))
}

fn cut(bytes: &[u8]) -> (&[u8], bool) {
    if bytes.len() > MAX_PAYLOAD_TEXT {
        (&bytes[..MAX_PAYLOAD_TEXT], true)
    } else {
        (bytes, false)
    }
}

fn body(bytes: &[u8], size: usize, schema_id: Option<u32>) -> Payload {
    let format_if_text = |text: &str| {
        if schema_id.is_some() {
            PayloadFormat::SchemaRegistry
        } else if looks_like_json(text) {
            PayloadFormat::Json
        } else {
            PayloadFormat::Text
        }
    };
    if let Ok(text) = std::str::from_utf8(bytes) {
        if printable(text) {
            let (shown, truncated) = cut(bytes);
            // Cutting may split a multi-byte char; lossy keeps it valid.
            return Payload {
                format: format_if_text(text),
                text: String::from_utf8_lossy(shown).into_owned(),
                base64: false,
                size,
                truncated,
                schema_id,
            };
        }
    }
    let (shown, truncated) = cut(bytes);
    Payload {
        format: if schema_id.is_some() {
            PayloadFormat::SchemaRegistry
        } else {
            PayloadFormat::Binary
        },
        text: B64.encode(shown),
        base64: true,
        size,
        truncated,
        schema_id,
    }
}

pub fn decode(bytes: &[u8]) -> Payload {
    if bytes.len() > 5 && bytes[0] == 0 {
        let id = u32::from_be_bytes([bytes[1], bytes[2], bytes[3], bytes[4]]);
        // Schema ids are small positive numbers; a big one is just binary
        // that starts with a zero byte.
        if id > 0 && id < 1_000_000_000 {
            return body(&bytes[5..], bytes.len(), Some(id));
        }
    }
    body(bytes, bytes.len(), None)
}

/// Lowercased text for a search to look through (binary is matched lossily).
pub fn searchable(bytes: &[u8]) -> String {
    String::from_utf8_lossy(&bytes[..bytes.len().min(MAX_PAYLOAD_TEXT)]).to_lowercase()
}

/// What a v2 record batch header says, read without decoding the records.
#[derive(Debug, Clone, PartialEq)]
pub struct BatchHeader {
    pub base_offset: i64,
    pub last_offset: i64,
    pub magic: i8,
    pub transactional: bool,
    pub control: bool,
    pub producer_id: i64,
}

/// Whole batches from a Fetch response. A broker may cut the last batch
/// short at the size limit; that tail is dropped and fetched again next time.
pub fn split_batches(records: &Bytes) -> Vec<(BatchHeader, Bytes)> {
    let mut out = Vec::new();
    let mut pos = 0usize;
    while records.len() - pos >= 12 {
        let at = |o: usize, n: usize| &records[pos + o..pos + o + n];
        let base_offset = i64::from_be_bytes(at(0, 8).try_into().unwrap());
        let length = i32::from_be_bytes(at(8, 4).try_into().unwrap());
        if length < 0 {
            break;
        }
        let total = 12 + length as usize;
        if records.len() - pos < total {
            break;
        }
        let magic = if total > 16 { at(16, 1)[0] as i8 } else { -1 };
        let header = if magic == 2 && total >= 61 {
            let attributes = i16::from_be_bytes(at(21, 2).try_into().unwrap());
            let last_delta = i32::from_be_bytes(at(23, 4).try_into().unwrap());
            BatchHeader {
                base_offset,
                last_offset: base_offset + last_delta as i64,
                magic,
                transactional: attributes & 0x10 != 0,
                control: attributes & 0x20 != 0,
                producer_id: i64::from_be_bytes(at(43, 8).try_into().unwrap()),
            }
        } else {
            // v0/v1 message sets: one wrapper per offset as far as we care.
            BatchHeader {
                base_offset,
                last_offset: base_offset,
                magic,
                transactional: false,
                control: false,
                producer_id: -1,
            }
        };
        out.push((header, records.slice(pos..pos + total)));
        pos += total;
    }
    out
}

/// A control record's key: version i16, type i16 (0 = abort, 1 = commit).
pub fn is_abort_marker(key: Option<&Bytes>) -> bool {
    key.is_some_and(|k| k.len() >= 4 && i16::from_be_bytes([k[2], k[3]]) == 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use kafka_protocol::records::{
        Compression, Record, RecordBatchEncoder, RecordEncodeOptions, TimestampType,
    };

    #[test]
    fn classifies_payloads() {
        assert_eq!(decode(br#"{"a":1}"#).format, PayloadFormat::Json);
        assert_eq!(decode(b"hello world").format, PayloadFormat::Text);
        assert_eq!(decode(b"{not json").format, PayloadFormat::Text);
        let bin = decode(&[0xff, 0x00, 0x13, 0x37]);
        assert_eq!(bin.format, PayloadFormat::Binary);
        assert!(bin.base64);
        assert_eq!(bin.text, "/wATNw==");
        // Valid UTF-8 but full of control bytes is binary.
        assert_eq!(decode(&[1, 2, 3, 4]).format, PayloadFormat::Binary);
    }

    #[test]
    fn detects_schema_registry_framing() {
        let mut avro = vec![0u8, 0, 0, 0, 42];
        avro.extend_from_slice(&[0x02, 0x06, 0xff]);
        let p = decode(&avro);
        assert_eq!(p.format, PayloadFormat::SchemaRegistry);
        assert_eq!(p.schema_id, Some(42));
        assert!(p.base64);
        assert_eq!(p.size, 8);

        let mut json = vec![0u8, 0, 0, 0, 7];
        json.extend_from_slice(br#"{"x":true}"#);
        let p = decode(&json);
        assert_eq!(p.schema_id, Some(7));
        assert_eq!(p.text, r#"{"x":true}"#);
    }

    #[test]
    fn truncates_huge_values() {
        let big = vec![b'a'; MAX_PAYLOAD_TEXT + 10];
        let p = decode(&big);
        assert!(p.truncated);
        assert_eq!(p.text.len(), MAX_PAYLOAD_TEXT);
        assert_eq!(p.size, MAX_PAYLOAD_TEXT + 10);
    }

    fn batch(base: i64, n: i64, compression: Compression) -> bytes::BytesMut {
        let records: Vec<Record> = (0..n)
            .map(|i| Record {
                transactional: false,
                control: false,
                delete_horizon: false,
                partition_leader_epoch: 0,
                producer_id: -1,
                producer_epoch: -1,
                timestamp_type: TimestampType::Creation,
                offset: base + i,
                sequence: -1,
                timestamp: 1_700_000_000_000 + i,
                key: Some(Bytes::from(format!("k{i}"))),
                value: Some(Bytes::from(format!("{{\"n\":{i}}}"))),
                headers: Default::default(),
            })
            .collect();
        let mut buf = bytes::BytesMut::new();
        RecordBatchEncoder::encode(
            &mut buf,
            &records,
            &RecordEncodeOptions {
                version: 2,
                compression,
            },
        )
        .unwrap();
        buf
    }

    #[test]
    fn splits_batches_and_drops_a_truncated_tail() {
        let mut all = batch(0, 3, Compression::None);
        all.extend_from_slice(&batch(3, 2, Compression::Gzip));
        let full = all.clone().freeze();
        let got = split_batches(&full);
        // Every whole batch decodes, compressed or not, and together they
        // cover offsets 0..5 with headers that agree with their records.
        let mut offsets = Vec::new();
        for (h, b) in &got {
            let mut b = b.clone();
            let set = kafka_protocol::records::RecordBatchDecoder::decode(&mut b).unwrap();
            assert_eq!(set.records.first().unwrap().offset, h.base_offset);
            assert_eq!(set.records.last().unwrap().offset, h.last_offset);
            offsets.extend(set.records.iter().map(|r| r.offset));
        }
        assert_eq!(offsets, vec![0, 1, 2, 3, 4]);
        // The broker cut the last batch short: it's dropped, the rest kept.
        let cut = full.slice(0..full.len() - 5);
        assert_eq!(split_batches(&cut).len(), got.len() - 1);
        assert!(split_batches(&Bytes::new()).is_empty());
    }

    #[test]
    fn reads_control_markers() {
        assert!(is_abort_marker(Some(&Bytes::from_static(&[0, 0, 0, 0]))));
        assert!(!is_abort_marker(Some(&Bytes::from_static(&[0, 0, 0, 1]))));
        assert!(!is_abort_marker(None));
    }
}
