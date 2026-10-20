use crate::error::AppResult;
use crate::services::ai::{self, ExplainResponse, OllamaStatus};

#[tauri::command]
pub async fn ai_check_ollama() -> AppResult<OllamaStatus> {
    ai::check_ollama_status()
}

#[tauri::command]
pub async fn ai_explain(
    prompt: String,
    context: Option<String>,
    model: Option<String>,
) -> AppResult<ExplainResponse> {
    ai::explain_with_ai(&prompt, context.as_deref(), model.as_deref())
}
