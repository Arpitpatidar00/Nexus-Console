use serde::ser::SerializeStruct;

/// One error type across every command. Serializes to `{ kind, message, detail }`
/// so the JS bridge (ipc-error.ts) can normalize it uniformly.
// ponytail: seeded in P1, consumed by the first shelling command in P2.
#[allow(dead_code)]
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Shell(String),
    #[error("{0}")]
    Parse(String),
    #[error("{0}")]
    InvalidName(String),
    #[error("{0}")]
    Forbidden(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Io(String),
    /// User dismissed a native confirm — never an actual failure; the
    /// frontend suppresses its toast for this kind.
    #[error("{0}")]
    Cancelled(String),
    /// A formula/cask lives in a third-party tap Homebrew hasn't been told to
    /// trust, so it refuses to load it (Homebrew 6+). The tap name rides in
    /// `detail` so the UI can offer a one-click `brew trust`.
    #[error("Homebrew won't load anything from the untrusted tap “{0}”.")]
    UntrustedTap(String),
    /// Homebrew is mid-operation (our own mutation, or brew upgrading its
    /// bundled Ruby) and can't answer right now. Transient and self-clearing —
    /// the frontend renders it as a calm "working…" state, never a red error.
    #[error("{0}")]
    Busy(String),
    /// SSH refused our key (or it needs a passphrase the agent doesn't hold).
    /// Every remote variant carries the raw ssh stderr line, sent as `detail`.
    #[error("SSH key not accepted, or it needs a passphrase. Add it to your agent (ssh-add --apple-use-keychain) or open a terminal.")]
    Auth(String),
    /// Unknown or changed host key. Never auto-accepted: the user verifies the
    /// fingerprint themselves in an interactive terminal.
    #[error("This server's host key isn't trusted yet (or changed). Verify it in a terminal.")]
    HostKey(String),
    #[error("Can't reach the server.")]
    Unreachable(String),
    /// Our own exec deadline fired, not ssh's ConnectTimeout (that one is
    /// `Unreachable`).
    #[error("The server didn't answer in time.")]
    Timeout(String),
    #[error("{0}")]
    Conflict(String),
}

impl AppError {
    fn kind(&self) -> &'static str {
        match self {
            AppError::Shell(_) => "shell",
            AppError::Parse(_) => "parse",
            AppError::InvalidName(_) => "invalidName",
            AppError::Forbidden(_) => "forbidden",
            AppError::NotFound(_) => "notFound",
            AppError::Io(_) => "io",
            AppError::Cancelled(_) => "cancelled",
            AppError::Busy(_) => "busy",
            AppError::UntrustedTap(_) => "untrustedTap",
            AppError::Auth(_) => "auth",
            AppError::HostKey(_) => "hostKey",
            AppError::Unreachable(_) => "unreachable",
            AppError::Timeout(_) => "timeout",
            AppError::Conflict(_) => "conflict",
        }
    }
}

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let mut st = s.serialize_struct("AppError", 3)?;
        st.serialize_field("kind", self.kind())?;
        st.serialize_field("message", &self.to_string())?;
        // `detail` normally repeats the message; for an untrusted tap it carries
        // the bare tap name, which the UI needs to offer "Trust <tap>"; for the
        // ssh kinds it carries ssh's own stderr line under the friendly copy.
        match self {
            AppError::UntrustedTap(tap) => st.serialize_field("detail", tap)?,
            AppError::Auth(raw)
            | AppError::HostKey(raw)
            | AppError::Unreachable(raw)
            | AppError::Timeout(raw) => st.serialize_field("detail", raw)?,
            _ => st.serialize_field("detail", &self.to_string())?,
        }
        st.end()
    }
}

#[allow(dead_code)]
pub type AppResult<T> = Result<T, AppError>;
