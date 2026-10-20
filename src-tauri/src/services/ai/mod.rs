use crate::error::{AppError, AppResult};
use crate::services::secrets::mask_secret;
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaStatus {
    pub online: bool,
    pub models: Vec<String>,
    pub endpoint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExplainResponse {
    pub explanation: String,
    pub model: String,
}

pub fn check_ollama_status() -> AppResult<OllamaStatus> {
    let out = Command::new("/usr/bin/curl")
        .args([
            "-s",
            "--connect-timeout",
            "2",
            "http://127.0.0.1:11434/api/tags",
        ])
        .output();

    let output = match out {
        Ok(o) if o.status.success() => o,
        _ => {
            return Ok(OllamaStatus {
                online: false,
                models: vec![],
                endpoint: "http://127.0.0.1:11434".into(),
            })
        }
    };

    let text = String::from_utf8_lossy(&output.stdout);
    let val: serde_json::Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(_) => {
            return Ok(OllamaStatus {
                online: false,
                models: vec![],
                endpoint: "http://127.0.0.1:11434".into(),
            })
        }
    };

    let mut models = Vec::new();
    if let Some(arr) = val.get("models").and_then(|m| m.as_array()) {
        for m in arr {
            if let Some(name) = m.get("name").and_then(|n| n.as_str()) {
                models.push(name.to_string());
            }
        }
    }

    Ok(OllamaStatus {
        online: true,
        models,
        endpoint: "http://127.0.0.1:11434".into(),
    })
}

pub fn explain_with_ai(
    prompt: &str,
    context: Option<&str>,
    model: Option<&str>,
) -> AppResult<ExplainResponse> {
    let status = check_ollama_status()?;
    if !status.online || status.models.is_empty() {
        return Err(AppError::Io(
            "Ollama is not running locally on 127.0.0.1:11434 or has no models installed. Run `ollama run llama3.2` to start.".into(),
        ));
    }

    let selected_model = model.unwrap_or_else(|| &status.models[0]);

    let clean_prompt = mask_secret(prompt);
    let full_prompt = match context {
        Some(ctx) => {
            let clean_ctx = mask_secret(ctx);
            format!("Context:\n{clean_ctx}\n\nTask: Explain or diagnose this:\n{clean_prompt}")
        }
        None => clean_prompt,
    };

    let body = serde_json::json!({
        "model": selected_model,
        "prompt": full_prompt,
        "stream": false
    });

    let body_str = serde_json::to_string(&body).map_err(|e| AppError::Io(e.to_string()))?;

    let out = Command::new("/usr/bin/curl")
        .args([
            "-s",
            "--connect-timeout",
            "5",
            "-m",
            "60",
            "-X",
            "POST",
            "-H",
            "Content-Type: application/json",
            "-d",
            &body_str,
            "http://127.0.0.1:11434/api/generate",
        ])
        .output()
        .map_err(|e| AppError::Io(format!("Ollama generate call failed: {e}")))?;

    if !out.status.success() {
        return Err(AppError::Io(
            String::from_utf8_lossy(&out.stderr).to_string(),
        ));
    }

    let text = String::from_utf8_lossy(&out.stdout);
    let val: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| AppError::Io(format!("Invalid Ollama JSON: {e}")))?;

    let explanation = val
        .get("response")
        .and_then(|r| r.as_str())
        .unwrap_or("No explanation received.")
        .to_string();

    Ok(ExplainResponse {
        explanation,
        model: selected_model.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_ollama_status_offline_graceful() {
        let status = check_ollama_status().unwrap();
        assert_eq!(status.endpoint, "http://127.0.0.1:11434");
    }
}
