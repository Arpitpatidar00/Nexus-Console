use crate::core::consent::{self, ConsentRecord, DataSource};
use crate::core::error::{AppError, AppResult};
use crate::core::mutation::{mutation_unattended, BlastRadius, MutationSpec};
use crate::services::remote::RemoteState;
use tauri::{AppHandle, Manager};

/// Servers owns SSH-config consent (revoking it must also close connections),
/// so its record is the truth for `ssh_config`; the unified store mirrors it.
fn ssh_granted(app: &AppHandle) -> Option<(bool, Option<u64>)> {
    let state = app.try_state::<RemoteState>()?;
    let s = state.read().ok()?;
    Some((s.consent.granted, s.consent.granted_at_epoch))
}

#[tauri::command]
pub async fn consent_get_all(app: AppHandle) -> AppResult<Vec<ConsentRecord>> {
    super::blocking(move || {
        let mut all = consent::get_all_consents();
        if let Some((granted, at)) = ssh_granted(&app) {
            for r in all
                .iter_mut()
                .filter(|r| r.source == DataSource::SshConfig.as_str())
            {
                r.granted = granted;
                r.granted_at_epoch = at;
            }
        }
        Ok(all)
    })
    .await
}

#[tauri::command]
pub async fn consent_set(
    app: AppHandle,
    source: String,
    granted: bool,
) -> AppResult<ConsentRecord> {
    let ds = DataSource::parse(&source).ok_or_else(|| {
        AppError::InvalidName(format!("Unknown data source '{source}' for consent"))
    })?;

    let spec = MutationSpec::new(
        "Update Privacy Consent",
        format!(
            "{} access to {}",
            if granted { "Grant" } else { "Revoke" },
            ds.display_name()
        ),
        "consent_set",
    )
    .blast_radius(BlastRadius::LocalIsolated);
    let _guard = mutation_unattended(spec);

    if ds == DataSource::SshConfig {
        super::remote::remote_set_consent(app, granted).await?;
    } else {
        super::blocking(move || consent::set_consent(ds, granted)).await?;
    }
    super::blocking(move || {
        consent::get_all_consents()
            .into_iter()
            .find(|r| r.source == ds.as_str())
            .ok_or_else(|| AppError::Io(format!("consent record for {source} missing")))
    })
    .await
}

#[tauri::command]
pub async fn consent_revoke_all(app: AppHandle) -> AppResult<()> {
    let spec = MutationSpec::new(
        "Revoke All Privacy Consents",
        "Revoke access to all external system data sources",
        "consent_revoke_all",
    )
    .blast_radius(BlastRadius::LocalIsolated);
    let _guard = mutation_unattended(spec);

    super::remote::remote_set_consent(app, false).await?;
    super::blocking(consent::revoke_all).await
}

#[tauri::command]
pub async fn net_get_declared_destinations() -> AppResult<Vec<crate::core::net::NetDestination>> {
    super::blocking(move || Ok(crate::core::net::declared_destinations())).await
}
