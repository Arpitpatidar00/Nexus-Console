/// One row in the tray's Active Services section. `running` drives the checkmark.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct TrayService {
    pub name: String,
    pub running: bool,
}
