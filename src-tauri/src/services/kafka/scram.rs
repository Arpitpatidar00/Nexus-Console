// SASL/SCRAM-SHA-256 and -512 (RFC 5802 / 7677), client side, no channel
// binding — what Kafka speaks. HMAC and PBKDF2 come from ring.

use crate::error::{AppError, AppResult};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use ring::{digest, hmac, pbkdf2};
use std::num::NonZeroU32;

/// Iteration counts above this are a hostile server burning our CPU.
const MAX_ITERATIONS: u32 = 1_000_000;

pub struct Scram {
    sha512: bool,
    password: String,
    client_nonce: String,
    client_first_bare: String,
    server_signature: Option<Vec<u8>>,
}

/// `=` and `,` are the only characters SCRAM escapes in a username.
fn saslname(user: &str) -> String {
    user.replace('=', "=3D").replace(',', "=2C")
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn nonce() -> String {
    let mut buf = [0u8; 24];
    ring::rand::SecureRandom::fill(&ring::rand::SystemRandom::new(), &mut buf)
        .expect("system random");
    B64.encode(buf)
}

impl Scram {
    pub fn new(mechanism: &str, user: &str, password: &str) -> AppResult<Scram> {
        Self::with_nonce(mechanism, user, password, nonce())
    }

    fn with_nonce(mechanism: &str, user: &str, password: &str, nonce: String) -> AppResult<Scram> {
        let sha512 = match mechanism {
            "SCRAM-SHA-256" => false,
            "SCRAM-SHA-512" => true,
            other => {
                return Err(AppError::InvalidName(format!(
                    "not a SCRAM mechanism: {other}"
                )))
            }
        };
        Ok(Scram {
            sha512,
            password: password.to_string(),
            client_first_bare: format!("n={},r={nonce}", saslname(user)),
            client_nonce: nonce,
            server_signature: None,
        })
    }

    pub fn client_first(&self) -> Vec<u8> {
        format!("n,,{}", self.client_first_bare).into_bytes()
    }

    fn hmac(&self, key: &[u8], data: &[u8]) -> Vec<u8> {
        let alg = if self.sha512 {
            hmac::HMAC_SHA512
        } else {
            hmac::HMAC_SHA256
        };
        hmac::sign(&hmac::Key::new(alg, key), data)
            .as_ref()
            .to_vec()
    }

    pub fn client_final(&mut self, server_first: &[u8]) -> AppResult<Vec<u8>> {
        let server_first = std::str::from_utf8(server_first)
            .map_err(|_| AppError::Forbidden("SCRAM: server-first isn't UTF-8".into()))?;
        let (mut nonce, mut salt, mut iterations) = (None, None, None);
        for part in server_first.split(',') {
            if let Some(v) = part.strip_prefix("r=") {
                nonce = Some(v);
            } else if let Some(v) = part.strip_prefix("s=") {
                salt = Some(v);
            } else if let Some(v) = part.strip_prefix("i=") {
                iterations = v.parse::<u32>().ok();
            } else if let Some(v) = part.strip_prefix("e=") {
                return Err(AppError::Forbidden(format!(
                    "Kafka rejected the login: {v}"
                )));
            }
        }
        let bad = || AppError::Forbidden("SCRAM: malformed server-first message".into());
        let nonce = nonce.ok_or_else(bad)?;
        let salt = B64.decode(salt.ok_or_else(bad)?).map_err(|_| bad())?;
        let iterations = iterations.ok_or_else(bad)?;
        if !nonce.starts_with(&self.client_nonce) || nonce.len() == self.client_nonce.len() {
            return Err(AppError::Forbidden(
                "SCRAM: server nonce doesn't extend ours".into(),
            ));
        }
        if iterations == 0 || iterations > MAX_ITERATIONS {
            return Err(AppError::Forbidden(format!(
                "SCRAM: refusing {iterations} iterations"
            )));
        }

        let (alg, len) = if self.sha512 {
            (pbkdf2::PBKDF2_HMAC_SHA512, 64)
        } else {
            (pbkdf2::PBKDF2_HMAC_SHA256, 32)
        };
        let mut salted = vec![0u8; len];
        pbkdf2::derive(
            alg,
            NonZeroU32::new(iterations).expect("checked above"),
            &salt,
            self.password.as_bytes(),
            &mut salted,
        );
        let client_key = self.hmac(&salted, b"Client Key");
        let stored_key = digest::digest(
            if self.sha512 {
                &digest::SHA512
            } else {
                &digest::SHA256
            },
            &client_key,
        );
        let without_proof = format!("c=biws,r={nonce}");
        let auth_message = format!("{},{server_first},{without_proof}", self.client_first_bare);
        let signature = self.hmac(stored_key.as_ref(), auth_message.as_bytes());
        let proof: Vec<u8> = client_key
            .iter()
            .zip(signature.iter())
            .map(|(a, b)| a ^ b)
            .collect();
        let server_key = self.hmac(&salted, b"Server Key");
        self.server_signature = Some(self.hmac(&server_key, auth_message.as_bytes()));
        // Only kept for the proof; drop it as soon as it's spent.
        self.password.clear();
        Ok(format!("{without_proof},p={}", B64.encode(proof)).into_bytes())
    }

    /// The server proves it knew the password too — otherwise anyone in the
    /// middle could accept any login.
    pub fn verify_server_final(&self, server_final: &[u8]) -> AppResult<()> {
        let text = String::from_utf8_lossy(server_final);
        if let Some(e) = text.strip_prefix("e=") {
            return Err(AppError::Forbidden(format!(
                "Kafka rejected the login: {e}"
            )));
        }
        let got = text
            .strip_prefix("v=")
            .and_then(|v| B64.decode(v.trim()).ok())
            .ok_or_else(|| AppError::Forbidden("SCRAM: malformed server-final message".into()))?;
        match &self.server_signature {
            Some(expected) if constant_time_eq(expected, &got) => Ok(()),
            _ => Err(AppError::Forbidden(
                "SCRAM: the server's signature doesn't match — not the broker you expect?".into(),
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// RFC 7677 §3 test vector (user "user", password "pencil").
    #[test]
    fn rfc7677_sha256_vector() {
        let mut s = Scram::with_nonce(
            "SCRAM-SHA-256",
            "user",
            "pencil",
            "rOprNGfwEbeRWgbNEkqO".into(),
        )
        .unwrap();
        assert_eq!(s.client_first(), b"n,,n=user,r=rOprNGfwEbeRWgbNEkqO");
        let server_first =
            b"r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096";
        let final_msg = s.client_final(server_first).unwrap();
        assert_eq!(
            String::from_utf8(final_msg).unwrap(),
            "c=biws,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,p=dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ="
        );
        s.verify_server_final(b"v=6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=")
            .unwrap();
        assert!(s.verify_server_final(b"v=AAAA").is_err());
    }

    #[test]
    fn rejects_hostile_server_first() {
        let mut s = Scram::with_nonce("SCRAM-SHA-512", "u", "p", "abc".into()).unwrap();
        // Nonce not extending ours.
        assert!(s.client_final(b"r=xyz123,s=AAAA,i=4096").is_err());
        // Absurd iteration count.
        assert!(s.client_final(b"r=abc123,s=AAAA,i=99999999").is_err());
        // Server error.
        assert!(s.client_final(b"e=unknown-user").is_err());
    }

    #[test]
    fn escapes_username() {
        assert_eq!(saslname("a=b,c"), "a=3Db=2Cc");
    }
}
