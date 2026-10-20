/// One row in the tray's Active Services section. `running` drives the checkmark.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct TrayService {
    pub name: String,
    pub running: bool,
}

/// One connected server in the tray menu.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayServer {
    pub id: String,
    pub label: String,
    pub env: String,
    pub connected: bool,
    pub status: String,
}
