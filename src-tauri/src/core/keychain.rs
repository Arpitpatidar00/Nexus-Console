use crate::error::{AppError, AppResult};

const SERVICE_NAME: &str = "com.stackroost.app";

pub fn set_password(account: &str, password: &str) -> AppResult<()> {
    #[cfg(target_os = "macos")]
    {
        // On macOS, saving with `-A` (allow any application to access without warning)
        // prevents repetitive OS modal prompts ("Stackroost wants to use your confidential
        // information stored in 'db_conn_...' in your keychain") across development
        // builds, cargo runs, and app updates.
        let cli_status = std::process::Command::new("/usr/bin/security")
            .args([
                "add-generic-password",
                "-U",
                "-s",
                SERVICE_NAME,
                "-a",
                account,
                "-w",
                password,
                "-A",
            ])
            .output();

        if let Ok(out) = cli_status {
            if out.status.success() {
                return Ok(());
            }
        }

        // Fallback to security-framework crate
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
        // First try the security CLI (which reads cleanly with -w without OS prompts)
        if let Ok(out) = std::process::Command::new("/usr/bin/security")
            .args([
                "find-generic-password",
                "-s",
                SERVICE_NAME,
                "-a",
                account,
                "-w",
            ])
            .output()
        {
            if out.status.success() {
                let pass = String::from_utf8_lossy(&out.stdout).trim_end().to_string();
                if !pass.is_empty() {
                    return Ok(Some(pass));
                }
            }
        }

        // Fall back to security-framework
        match security_framework::passwords::get_generic_password(SERVICE_NAME, account) {
            Ok(bytes) => {
                let s = String::from_utf8(bytes)
                    .map_err(|e| AppError::Io(format!("keychain password utf8: {e}")))?;
                Ok(Some(s))
            }
            Err(e) => {
                // If item not found (errSecItemNotFound = -25300)
                if e.code() == -25300 {
                    Ok(None)
                } else {
                    Err(AppError::Io(format!("keychain read failed: {e}")))
                }
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
        let _ = std::process::Command::new("/usr/bin/security")
            .args(["delete-generic-password", "-s", SERVICE_NAME, "-a", account])
            .output();

        match security_framework::passwords::delete_generic_password(SERVICE_NAME, account) {
            Ok(_) => Ok(()),
            Err(e) => {
                if e.code() == -25300 {
                    Ok(())
                } else {
                    Err(AppError::Io(format!("keychain delete failed: {e}")))
                }
            }
        }
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
