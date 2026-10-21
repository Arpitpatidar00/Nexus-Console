use crate::error::{AppError, AppResult};
use crate::services::secrets::redact_secrets_in_text;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::time::timeout;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaStatus {
    pub online: bool,
    pub models: Vec<String>,
    pub endpoint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedPrompt {
    pub prompt: String,
    pub notice: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplainResponse {
    pub explanation: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamChunkPayload {
    pub chunk: String,
    pub done: bool,
}

pub const OLLAMA_ADDR: &str = "127.0.0.1:11434";
pub const OLLAMA_NOTICE: &str = "This exact text will be sent to Ollama on this Mac";

pub fn prepare_prompt(prompt: &str, context: Option<&str>) -> PreparedPrompt {
    let clean_prompt = redact_secrets_in_text(prompt);
    let full_prompt = match context {
        Some(ctx) if !ctx.trim().is_empty() => {
            let clean_ctx = redact_secrets_in_text(ctx);
            format!("Context:\n{clean_ctx}\n\nTask: Explain or diagnose this:\n{clean_prompt}")
        }
        _ => clean_prompt,
    };

    PreparedPrompt {
        prompt: full_prompt,
        notice: OLLAMA_NOTICE.to_string(),
    }
}

pub async fn check_ollama_status() -> AppResult<OllamaStatus> {
    let connect_future = TcpStream::connect(OLLAMA_ADDR);
    let mut stream = match timeout(Duration::from_millis(1500), connect_future).await {
        Ok(Ok(s)) => s,
        _ => {
            return Ok(OllamaStatus {
                online: false,
                models: vec![],
                endpoint: format!("http://{OLLAMA_ADDR}"),
            });
        }
    };

    let req = format!(
        "GET /api/tags HTTP/1.1\r\nHost: {OLLAMA_ADDR}\r\nUser-Agent: Stackroost\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(req.as_bytes()).await.is_err() {
        return Ok(OllamaStatus {
            online: false,
            models: vec![],
            endpoint: format!("http://{OLLAMA_ADDR}"),
        });
    }

    let mut response_bytes = Vec::new();
    let read_result = timeout(
        Duration::from_secs(3),
        stream.read_to_end(&mut response_bytes),
    )
    .await;
    if read_result.is_err() || response_bytes.is_empty() {
        return Ok(OllamaStatus {
            online: false,
            models: vec![],
            endpoint: format!("http://{OLLAMA_ADDR}"),
        });
    }

    let response_str = String::from_utf8_lossy(&response_bytes);
    let body = match response_str.split_once("\r\n\r\n") {
        Some((headers, b)) => {
            if !headers.starts_with("HTTP/1.1 200") && !headers.starts_with("HTTP/1.0 200") {
                return Ok(OllamaStatus {
                    online: false,
                    models: vec![],
                    endpoint: format!("http://{OLLAMA_ADDR}"),
                });
            }
            b
        }
        None => {
            return Ok(OllamaStatus {
                online: false,
                models: vec![],
                endpoint: format!("http://{OLLAMA_ADDR}"),
            })
        }
    };

    let val: serde_json::Value = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(_) => {
            return Ok(OllamaStatus {
                online: true,
                models: vec![],
                endpoint: format!("http://{OLLAMA_ADDR}"),
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
        endpoint: format!("http://{OLLAMA_ADDR}"),
    })
}

pub async fn explain_with_ai(
    app: Option<&tauri::AppHandle>,
    prompt: &str,
    context: Option<&str>,
    model: Option<&str>,
) -> AppResult<ExplainResponse> {
    let status = check_ollama_status().await?;
    if !status.online || status.models.is_empty() {
        return Err(AppError::Io(
            "Ollama is not running locally on 127.0.0.1:11434 or has no models installed. Run `ollama run llama3.2` to start.".into(),
        ));
    }

    let selected_model = model.unwrap_or_else(|| &status.models[0]);
    let prepared = prepare_prompt(prompt, context);

    let connect_future = TcpStream::connect(OLLAMA_ADDR);
    let mut stream = timeout(Duration::from_secs(5), connect_future)
        .await
        .map_err(|_| AppError::Io("Timeout connecting to Ollama on 127.0.0.1:11434".into()))?
        .map_err(|e| AppError::Io(format!("Failed to connect to Ollama: {e}")))?;

    let body = serde_json::json!({
        "model": selected_model,
        "prompt": prepared.prompt,
        "stream": true
    });
    let body_str = serde_json::to_string(&body).map_err(|e| AppError::Io(e.to_string()))?;

    let req = format!(
        "POST /api/generate HTTP/1.1\r\nHost: {OLLAMA_ADDR}\r\nUser-Agent: Stackroost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body_str.len(),
        body_str
    );

    stream
        .write_all(req.as_bytes())
        .await
        .map_err(|e| AppError::Io(format!("Failed to send request to Ollama: {e}")))?;

    let mut reader = BufReader::new(stream);

    // Read HTTP response headers until empty line
    let mut header_line = String::new();
    let mut is_chunked = false;
    let mut is_first_line = true;
    loop {
        header_line.clear();
        let bytes_read = reader
            .read_line(&mut header_line)
            .await
            .map_err(|e| AppError::Io(e.to_string()))?;
        if bytes_read == 0 || header_line == "\r\n" || header_line == "\n" {
            break;
        }
        if is_first_line {
            if !header_line.starts_with("HTTP/1.1 200") && !header_line.starts_with("HTTP/1.0 200")
            {
                return Err(AppError::Io(format!(
                    "Ollama returned non-200 status: {}",
                    header_line.trim()
                )));
            }
            is_first_line = false;
        }
        if header_line
            .to_lowercase()
            .contains("transfer-encoding: chunked")
        {
            is_chunked = true;
        }
    }

    // Now read JSON lines from Ollama
    let mut accumulated = String::new();
    let mut line = String::new();

    loop {
        line.clear();
        let bytes_read = reader
            .read_line(&mut line)
            .await
            .map_err(|e| AppError::Io(e.to_string()))?;
        if bytes_read == 0 {
            break;
        }

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // If chunked transfer encoding, chunk hex length lines may appear (e.g. "a5\r\n")
        if is_chunked && usize::from_str_radix(trimmed, 16).is_ok() && !trimmed.starts_with('{') {
            continue;
        }

        if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
            let chunk = val.get("response").and_then(|r| r.as_str()).unwrap_or("");
            let done = val.get("done").and_then(|d| d.as_bool()).unwrap_or(false);

            accumulated.push_str(chunk);

            if let Some(handle) = app {
                let _ = handle.emit(
                    "ai:stream-chunk",
                    StreamChunkPayload {
                        chunk: chunk.to_string(),
                        done,
                    },
                );
            }

            if done {
                break;
            }
        }
    }

    if let Some(handle) = app {
        let _ = handle.emit(
            "ai:stream-chunk",
            StreamChunkPayload {
                chunk: String::new(),
                done: true,
            },
        );
    }

    Ok(ExplainResponse {
        explanation: accumulated,
        model: selected_model.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_check_ollama_status_offline_graceful() {
        let status = check_ollama_status().await.unwrap();
        assert_eq!(status.endpoint, "http://127.0.0.1:11434");
    }

    #[test]
    fn test_prepare_prompt_preserves_text_and_redacts_patterns() {
        let prompt = "Explain error: database connect failed with key AKIA1234567890ABCDEF";
        let context = Some("Docker container logs: status 500");
        let prep = prepare_prompt(prompt, context);
        assert_eq!(
            prep.notice,
            "This exact text will be sent to Ollama on this Mac"
        );
        assert!(!prep.prompt.contains("AKIA1234567890ABCDEF"));
        assert!(prep.prompt.contains("AKIA****CDEF"));
        assert!(prep
            .prompt
            .contains("Explain error: database connect failed with key"));
        assert!(prep.prompt.contains("Docker container logs: status 500"));
    }
}
