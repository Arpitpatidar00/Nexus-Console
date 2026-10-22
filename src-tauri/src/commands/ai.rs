use crate::error::AppResult;
use crate::services::ai::{self, ExplainResponse, OllamaStatus, PreparedPrompt};
use tauri::AppHandle;

#[tauri::command]
pub async fn ai_check_ollama() -> AppResult<OllamaStatus> {
    ai::check_ollama_status().await
}

#[tauri::command]
pub fn ai_prepare_prompt(prompt: String, context: Option<String>) -> PreparedPrompt {
    ai::prepare_prompt(&prompt, context.as_deref())
}

#[tauri::command]
pub async fn ai_explain(
    app: AppHandle,
    prompt: String,
    context: Option<String>,
    model: Option<String>,
) -> AppResult<ExplainResponse> {
    ai::explain_with_ai(Some(&app), &prompt, context.as_deref(), model.as_deref()).await
}

#[tauri::command]
pub async fn ai_get_model_pricing() -> AppResult<Vec<ai::pricing::ModelPricing>> {
    Ok(ai::pricing::get_pricing())
}

#[tauri::command]
pub async fn ai_save_model_pricing(
    app: AppHandle,
    pricing: Vec<ai::pricing::ModelPricing>,
) -> AppResult<()> {
    let _guard = crate::core::mutation::mutation(
        &app,
        crate::core::mutation::MutationSpec::new(
            "Update AI Model Pricing",
            "Update token estimation price table in settings",
            "Save prices",
        )
        .blast_radius(crate::core::mutation::BlastRadius::LocalIsolated),
    )?;
    ai::pricing::save_pricing(pricing)
}
