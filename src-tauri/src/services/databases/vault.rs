use crate::core::error::AppResult;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbVaultStore {
    pub entries: HashMap<String, String>,
}

/// Derive or load a persistent 32-byte secret key bound to the local user's data directory.
fn get_vault_key(parent_dir: &Path) -> [u8; 32] {
    let key_file = parent_dir.join("local-db-vault.key");
    if let Ok(bytes) = fs::read(&key_file) {
        if bytes.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&bytes);
            return key;
        }
    }

    // Generate fresh key
    let mut key = [0u8; 32];
    if let Ok(mut f) = fs::File::open("/dev/urandom") {
        use std::io::Read;
        let _ = f.read_exact(&mut key);
    } else {
        // Fallback deterministic derivation if /dev/urandom fails
        let fallback = format!(
            "{}:{}:stackroost-vault-seed",
            std::env::var("USER").unwrap_or_default(),
            parent_dir.display()
        );
        key = *blake3::hash(fallback.as_bytes()).as_bytes();
    }

    // Write key with 0600 permissions
    let _ = fs::write(&key_file, key);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&key_file, fs::Permissions::from_mode(0o600));
    }

    key
}

fn encrypt_secret(key: &[u8; 32], id: &str, plaintext: &str) -> String {
    let mut hasher = blake3::Hasher::new_keyed(key);
    hasher.update(id.as_bytes());
    hasher.update(b":stackroost_db_conn_secret:");
    let mut xof = hasher.finalize_xof();
    let plain_bytes = plaintext.as_bytes();
    let mut stream = vec![0u8; plain_bytes.len()];
    xof.fill(&mut stream);
    let mut cipher = vec![0u8; plain_bytes.len()];
    for i in 0..plain_bytes.len() {
        cipher[i] = plain_bytes[i] ^ stream[i];
    }

    let mut hex = String::with_capacity(cipher.len() * 2);
    for b in cipher {
        use std::fmt::Write;
        let _ = write!(hex, "{b:02x}");
    }
    hex
}

fn decrypt_secret(key: &[u8; 32], id: &str, hex_cipher: &str) -> Option<String> {
    if !hex_cipher.len().is_multiple_of(2) {
        return None;
    }
    let mut cipher = Vec::with_capacity(hex_cipher.len() / 2);
    for chunk in hex_cipher.as_bytes().chunks(2) {
        let hi = (chunk[0] as char).to_digit(16)? as u8;
        let lo = (chunk[1] as char).to_digit(16)? as u8;
        cipher.push((hi << 4) | lo);
    }

    let mut hasher = blake3::Hasher::new_keyed(key);
    hasher.update(id.as_bytes());
    hasher.update(b":stackroost_db_conn_secret:");
    let mut xof = hasher.finalize_xof();
    let mut stream = vec![0u8; cipher.len()];
    xof.fill(&mut stream);
    let mut plain = vec![0u8; cipher.len()];
    for i in 0..cipher.len() {
        plain[i] = cipher[i] ^ stream[i];
    }
    String::from_utf8(plain).ok()
}

/// Load decrypted passwords from the local vault file into a HashMap.
pub fn load_passwords(vault_path: &Path) -> HashMap<String, String> {
    let parent = vault_path.parent().unwrap_or(vault_path);
    let key = get_vault_key(parent);
    let store: DbVaultStore = crate::core::store::load_store(vault_path);
    let mut decrypted = HashMap::new();

    for (id, enc) in store.entries {
        if let Some(pass) = decrypt_secret(&key, &id, &enc) {
            decrypted.insert(id, pass);
        }
    }
    decrypted
}

/// Save passwords encrypted into the local vault file with 0600 permissions.
pub fn save_passwords(vault_path: &Path, passwords: &HashMap<String, String>) -> AppResult<()> {
    let parent = vault_path.parent().unwrap_or(vault_path);
    let key = get_vault_key(parent);
    let mut store = DbVaultStore::default();

    for (id, pass) in passwords {
        let enc = encrypt_secret(&key, id, pass);
        store.entries.insert(id.clone(), enc);
    }

    crate::core::store::save_store(vault_path, &store, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmp_vault_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sr_vault_{name}_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_vault_encrypt_decrypt_roundtrip() {
        let dir = tmp_vault_dir("roundtrip");
        let vault_file = dir.join("local-db-vault.json");

        let mut sample = HashMap::new();
        sample.insert("db_1".to_string(), "postgres_secret_123".to_string());
        sample.insert("db_2".to_string(), "redis_auth!@#$".to_string());

        save_passwords(&vault_file, &sample).unwrap();
        assert!(vault_file.exists());

        let loaded = load_passwords(&vault_file);
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded.get("db_1").unwrap(), "postgres_secret_123");
        assert_eq!(loaded.get("db_2").unwrap(), "redis_auth!@#$");

        let _ = fs::remove_dir_all(&dir);
    }
}
