use crate::core::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModelPricing {
    pub model_id: String,
    pub display_name: String,
    pub input_per_million: f64,
    pub output_per_million: f64,
    pub cache_read_per_million: f64,
}

pub fn default_pricing() -> Vec<ModelPricing> {
    vec![
        ModelPricing {
            model_id: "claude-3-5-sonnet".into(),
            display_name: "Claude 3.5 Sonnet".into(),
            input_per_million: 3.0,
            output_per_million: 15.0,
            cache_read_per_million: 0.30,
        },
        ModelPricing {
            model_id: "claude-3-7-sonnet".into(),
            display_name: "Claude 3.7 Sonnet".into(),
            input_per_million: 3.0,
            output_per_million: 15.0,
            cache_read_per_million: 0.30,
        },
        ModelPricing {
            model_id: "claude-3-5-haiku".into(),
            display_name: "Claude 3.5 Haiku".into(),
            input_per_million: 0.80,
            output_per_million: 4.0,
            cache_read_per_million: 0.08,
        },
        ModelPricing {
            model_id: "claude-3-opus".into(),
            display_name: "Claude 3 Opus".into(),
            input_per_million: 15.0,
            output_per_million: 75.0,
            cache_read_per_million: 1.50,
        },
    ]
}

static PRICING_CACHE: Mutex<Option<Vec<ModelPricing>>> = Mutex::new(None);

fn pricing_file_path() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(|h| {
        PathBuf::from(h)
            .join(".stackroost")
            .join("model_pricing.json")
    })
}

pub fn get_pricing() -> Vec<ModelPricing> {
    let mut cache = PRICING_CACHE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(list) = &*cache {
        return list.clone();
    }

    if let Some(path) = pricing_file_path() {
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(parsed) = serde_json::from_str::<Vec<ModelPricing>>(&content) {
                    *cache = Some(parsed.clone());
                    return parsed;
                }
            }
        }
    }

    let defaults = default_pricing();
    *cache = Some(defaults.clone());
    defaults
}

pub fn save_pricing(list: Vec<ModelPricing>) -> AppResult<()> {
    if let Some(path) = pricing_file_path() {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let json = serde_json::to_string_pretty(&list)
            .map_err(|e| AppError::Parse(format!("serialize pricing: {e}")))?;
        fs::write(&path, json).map_err(|e| AppError::Io(format!("save pricing: {e}")))?;
    }

    let mut cache = PRICING_CACHE.lock().unwrap_or_else(|e| e.into_inner());
    *cache = Some(list);
    Ok(())
}

pub fn calculate_cost(
    model_id: &str,
    input_tokens: u64,
    output_tokens: u64,
    cache_read_tokens: u64,
) -> f64 {
    let table = get_pricing();
    let model = table
        .iter()
        .find(|m| m.model_id == model_id)
        .or_else(|| table.first());

    if let Some(m) = model {
        (input_tokens as f64 * m.input_per_million / 1_000_000.0)
            + (output_tokens as f64 * m.output_per_million / 1_000_000.0)
            + (cache_read_tokens as f64 * m.cache_read_per_million / 1_000_000.0)
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_pricing_table() {
        let list = default_pricing();
        assert!(list.iter().any(|m| m.model_id == "claude-3-5-sonnet"));
        assert!(list.iter().any(|m| m.model_id == "claude-3-5-haiku"));
    }

    #[test]
    fn test_calculate_cost() {
        let cost = calculate_cost("claude-3-5-sonnet", 1_000_000, 1_000_000, 1_000_000);
        // 3.0 + 15.0 + 0.30 = 18.30
        assert!((cost - 18.30).abs() < 0.001);
    }
}
