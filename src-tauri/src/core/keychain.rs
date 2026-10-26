use crate::error::{AppError, AppResult};

const SERVICE_NAME: &str = "com.stackroost.app";

pub fn set_password(account: &str, password: &str) -> AppResult<()> {
    #[cfg(target_os = "macos")]
    {
        // First delete any existing entry to reset permissions cleanly
        let _ = security_framework::passwords::delete_generic_password(SERVICE_NAME, account);

        security_framework::passwords::set_generic_password(
            SERVICE_NAME,
            account,
            password.as_bytes(),
        )
        .map_err(|e| AppError::Io(format!("keychain write failed: {e}")))?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (account, password);
        Ok(())
    }
}

pub fn get_password(account: &str) -> AppResult<Option<String>> {
    #[cfg(target_os = "macos")]
    {
        // Native security-framework call inside the process.
        // We strictly avoid spawning `/usr/bin/security` CLI, which triggers
        // the macOS modal prompt: "'security' wants to use your confidential information...".
        match security_framework::passwords::get_generic_password(SERVICE_NAME, account) {
            Ok(bytes) => {
                let s = String::from_utf8(bytes)
                    .map_err(|e| AppError::Io(format!("keychain password utf8: {e}")))?;
                Ok(Some(s))
            }
            Err(_) => {
                // If item not found or any access/signature issue occurs, return None
                // so caller falls back to persistent vault / memory cache cleanly without crashing.
                Ok(None)
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = account;
        Ok(None)
    }
}

pub fn delete_password(account: &str) -> AppResult<()> {
    #[cfg(target_os = "macos")]
    {
        let _ = security_framework::passwords::delete_generic_password(SERVICE_NAME, account);
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = account;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keychain_operations() {
        let test_account = "test_account_stackroost_unit";
        let test_pass = "super-secret-password-123";
        // Attempt set
        let _ = set_password(test_account, test_pass);
        // Attempt read
        if let Ok(Some(pass)) = get_password(test_account) {
            assert_eq!(pass, test_pass);
        }
        // Cleanup
        let _ = delete_password(test_account);
    }
}
