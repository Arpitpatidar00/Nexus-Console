// One connection to one broker: TCP (optionally TLS), length-prefixed frames,
// ApiVersions negotiation and SASL. Every read and write is bounded by a
// deadline — a broker that stops answering fails the call, never hangs it.

use super::scram::Scram;
use super::{kafka_error, Security};
use crate::error::{AppError, AppResult};
use bytes::{Buf, Bytes, BytesMut};
use kafka_protocol::messages::{
    ApiKey, ApiVersionsRequest, RequestHeader, ResponseHeader, SaslAuthenticateRequest,
    SaslHandshakeRequest,
};
use kafka_protocol::protocol::{
    encode_request_header_into_buffer, Decodable, HeaderVersion, Request, StrBytes,
};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::timeout;
use tokio_rustls::rustls;

pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(6);
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
/// No legitimate response we ask for comes close; a bigger length prefix is
/// a non-Kafka port (HTTP, TLS alert) or a corrupt stream.
const MAX_FRAME: usize = 64 * 1024 * 1024;
const CLIENT_ID: &str = "stackroost";

trait Io: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> Io for T {}

/// Credentials and transport for every broker of one cluster.
#[derive(Clone)]
pub struct ConnSpec {
    pub security: Security,
    pub mechanism: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub ca_cert_path: Option<String>,
}

pub struct Conn {
    io: Box<dyn Io>,
    correlation: i32,
    /// api key → highest version both sides speak.
    versions: HashMap<i16, (i16, i16)>,
    pub address: String,
    pub features: Vec<(String, i16)>,
}

fn tls_config(ca_cert_path: Option<&str>) -> AppResult<Arc<rustls::ClientConfig>> {
    use rustls::pki_types::{pem::PemObject, CertificateDer};
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let extra: Vec<CertificateDer<'static>> = match ca_cert_path {
        Some(path) => {
            let certs = CertificateDer::pem_file_iter(path)
                .map_err(|e| AppError::Io(format!("can't read CA certificate {path}: {e}")))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| AppError::Parse(format!("CA certificate {path}: {e}")))?;
            if certs.is_empty() {
                return Err(AppError::Parse(format!(
                    "no PEM certificate found in {path}"
                )));
            }
            certs
        }
        None => Vec::new(),
    };
    let verifier = if extra.is_empty() {
        rustls_platform_verifier::Verifier::new(provider.clone())
    } else {
        rustls_platform_verifier::Verifier::new_with_extra_roots(extra, provider.clone())
    }
    .map_err(|e| AppError::Io(format!("TLS setup: {e}")))?;
    let config = rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|e| AppError::Io(format!("TLS setup: {e}")))?
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(verifier))
        .with_no_client_auth();
    Ok(Arc::new(config))
}

fn api_name(key: i16) -> String {
    ApiKey::try_from(key)
        .map(|k| format!("{k:?}"))
        .unwrap_or_else(|_| format!("#{key}"))
}

fn io_err(address: &str, e: std::io::Error) -> AppError {
    use std::io::ErrorKind::*;
    match e.kind() {
        ConnectionRefused => AppError::Io(format!(
            "{address} refused the connection — is Kafka running and listening there?"
        )),
        UnexpectedEof | ConnectionReset | BrokenPipe => AppError::Io(format!(
            "{address} closed the connection — check the security protocol (TLS vs plaintext) and SASL settings"
        )),
        InvalidData => AppError::Io(format!("{address}: TLS handshake failed: {e}")),
        _ => AppError::Io(format!("{address}: {e}")),
    }
}

impl Conn {
    /// Dial, wrap in TLS if asked, learn the broker's API versions, then log in.
    pub async fn open(host: &str, port: u16, spec: &ConnSpec) -> AppResult<Conn> {
        let address = format!("{host}:{port}");
        let tcp = timeout(CONNECT_TIMEOUT, TcpStream::connect((host, port)))
            .await
            .map_err(|_| {
                AppError::Io(format!(
                    "{address} didn't accept a connection within {}s",
                    CONNECT_TIMEOUT.as_secs()
                ))
            })?
            .map_err(|e| io_err(&address, e))?;
        let _ = tcp.set_nodelay(true);

        let io: Box<dyn Io> = if spec.security.tls() {
            let config = tls_config(spec.ca_cert_path.as_deref())?;
            let name = rustls::pki_types::ServerName::try_from(host.to_string())
                .map_err(|e| AppError::InvalidName(format!("TLS server name {host}: {e}")))?;
            let tls = timeout(
                CONNECT_TIMEOUT,
                tokio_rustls::TlsConnector::from(config).connect(name, tcp),
            )
            .await
            .map_err(|_| AppError::Io(format!("{address}: TLS handshake timed out")))?
            .map_err(|e| io_err(&address, e))?;
            Box::new(tls)
        } else {
            Box::new(tcp)
        };

        let mut conn = Conn {
            io,
            correlation: 0,
            versions: HashMap::new(),
            address,
            features: Vec::new(),
        };
        conn.negotiate().await?;
        if spec.security.sasl() {
            conn.authenticate(spec).await?;
        }
        Ok(conn)
    }

    async fn negotiate(&mut self) -> AppResult<()> {
        let mut req = ApiVersionsRequest::default();
        req.client_software_name = StrBytes::from_static_str(CLIENT_ID);
        req.client_software_version = StrBytes::from_static_str(env!("CARGO_PKG_VERSION"));
        // v3 first; a broker older than 2.4 answers UNSUPPORTED_VERSION (35)
        // in the v0 layout and lists what it does speak, so retry at v0.
        // Its v0 body may not even parse as v3, so a parse error retries too.
        let res = match self.send_at(req.clone(), 3).await {
            Ok(r) if r.error_code == 35 => self.send_at(req, 0).await?,
            Err(AppError::Parse(_)) => self.send_at(req, 0).await?,
            other => other?,
        };
        if res.error_code != 0 {
            return Err(kafka_error(res.error_code, "ApiVersions"));
        }
        for k in &res.api_keys {
            self.versions
                .insert(k.api_key, (k.min_version, k.max_version));
        }
        self.features = res
            .finalized_features
            .iter()
            .map(|f| (f.name.as_str().to_string(), f.max_version_level))
            .collect();
        Ok(())
    }

    /// The version to send `R` at: the highest both we (within `min..=max`,
    /// the layouts this client was written against) and the broker speak.
    pub fn version<R: Request>(&self, min: i16, max: i16) -> AppResult<i16> {
        let ours = R::VERSIONS;
        let (bmin, bmax) = self.versions.get(&R::KEY).copied().ok_or_else(|| {
            AppError::Forbidden(format!(
                "{} doesn't support the {} API",
                self.address,
                api_name(R::KEY)
            ))
        })?;
        let hi = bmax.min(ours.max).min(max);
        let lo = bmin.max(ours.min).max(min);
        if hi < lo {
            return Err(AppError::Forbidden(format!(
                "{} speaks {} v{bmin}–v{bmax}, which this client doesn't support",
                self.address,
                api_name(R::KEY)
            )));
        }
        Ok(hi)
    }

    pub fn supports<R: Request>(&self) -> bool {
        self.versions.contains_key(&R::KEY)
    }

    /// Send at the negotiated version (within `min..=max`).
    pub async fn send<R: Request>(&mut self, req: R, min: i16, max: i16) -> AppResult<R::Response> {
        let v = self.version::<R>(min, max)?;
        self.send_at(req, v).await
    }

    pub async fn send_at<R: Request>(&mut self, req: R, version: i16) -> AppResult<R::Response> {
        self.correlation = self.correlation.wrapping_add(1);
        let correlation = self.correlation;
        let mut header = RequestHeader::default();
        header.request_api_key = R::KEY;
        header.request_api_version = version;
        header.correlation_id = correlation;
        header.client_id = Some(StrBytes::from_static_str(CLIENT_ID));

        let mut body = BytesMut::new();
        encode_request_header_into_buffer(&mut body, &header)
            .map_err(|e| AppError::Parse(format!("encode header: {e}")))?;
        req.encode(&mut body, version)
            .map_err(|e| AppError::Parse(format!("encode request: {e}")))?;

        let address = self.address.clone();
        let mut frame = (body.len() as u32).to_be_bytes().to_vec();
        frame.extend_from_slice(&body);
        let mut buf = timeout(REQUEST_TIMEOUT, async {
            self.io.write_all(&frame).await?;
            self.io.flush().await?;
            let len = self.io.read_u32().await? as usize;
            if len > MAX_FRAME {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("response of {len} bytes — is this a Kafka port?"),
                ));
            }
            let mut buf = vec![0u8; len];
            self.io.read_exact(&mut buf).await?;
            Ok(Bytes::from(buf))
        })
        .await
        .map_err(|_| {
            AppError::Io(format!(
                "{address} didn't answer within {}s",
                REQUEST_TIMEOUT.as_secs()
            ))
        })?
        .map_err(|e| io_err(&address, e))?;

        let header = ResponseHeader::decode(&mut buf, R::Response::header_version(version))
            .map_err(|e| AppError::Parse(format!("{address}: bad response header: {e}")))?;
        if header.correlation_id != correlation {
            return Err(AppError::Parse(format!(
                "{address}: response out of order ({} ≠ {correlation})",
                header.correlation_id
            )));
        }
        let res = R::Response::decode(&mut buf, version)
            .map_err(|e| AppError::Parse(format!("{address}: bad response: {e}")))?;
        let _ = buf.remaining();
        Ok(res)
    }

    async fn authenticate(&mut self, spec: &ConnSpec) -> AppResult<()> {
        let mechanism = spec.mechanism.to_ascii_uppercase();
        let user = spec.username.clone().unwrap_or_default();
        let pass = spec.password.clone().unwrap_or_default();
        if user.is_empty() {
            return Err(AppError::Forbidden("SASL needs a username".into()));
        }

        let mut hs = SaslHandshakeRequest::default();
        hs.mechanism = StrBytes::from_string(mechanism.clone());
        let res = self.send(hs, 1, 1).await?;
        if res.error_code != 0 {
            let offered: Vec<&str> = res.mechanisms.iter().map(|m| m.as_str()).collect();
            if offered.is_empty() {
                return Err(AppError::Forbidden(format!(
                    "{} doesn't use SASL — set Authentication to None, or use the cluster's SASL port",
                    self.address
                )));
            }
            return Err(AppError::Forbidden(format!(
                "the broker doesn't accept {mechanism} (it offers: {})",
                offered.join(", ")
            )));
        }

        match mechanism.as_str() {
            "PLAIN" => {
                let mut token = Vec::with_capacity(user.len() + pass.len() + 2);
                token.push(0);
                token.extend_from_slice(user.as_bytes());
                token.push(0);
                token.extend_from_slice(pass.as_bytes());
                self.sasl_step(token).await?;
            }
            "SCRAM-SHA-256" | "SCRAM-SHA-512" => {
                let mut scram = Scram::new(&mechanism, &user, &pass)?;
                let server_first = self.sasl_step(scram.client_first()).await?;
                let client_final = scram.client_final(&server_first)?;
                let server_final = self.sasl_step(client_final).await?;
                scram.verify_server_final(&server_final)?;
            }
            other => {
                return Err(AppError::InvalidName(format!(
                    "unsupported SASL mechanism: {other}"
                )))
            }
        }
        Ok(())
    }

    async fn sasl_step(&mut self, token: Vec<u8>) -> AppResult<Vec<u8>> {
        let mut req = SaslAuthenticateRequest::default();
        req.auth_bytes = Bytes::from(token);
        let res = self.send(req, 0, 2).await?;
        if res.error_code != 0 {
            let msg = res
                .error_message
                .map(|m| m.as_str().to_string())
                .unwrap_or_else(|| "authentication failed".into());
            return Err(AppError::Forbidden(format!(
                "Kafka rejected the login: {msg}"
            )));
        }
        Ok(res.auth_bytes.to_vec())
    }
}
