use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSettings {
    pub model: String,
    pub ollama_host: String,
    pub nats_url: String,
    pub voice_enabled: bool,
    pub local_only_mode: bool,
    pub cloud_assist_enabled: bool,
    pub trust_audit_enabled: bool,
    pub transparency_tips_enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsUpdate {
    pub model: Option<String>,
    pub ollama_host: Option<String>,
    pub nats_url: Option<String>,
    pub voice_enabled: Option<bool>,
    pub local_only_mode: Option<bool>,
    pub cloud_assist_enabled: Option<bool>,
    pub trust_audit_enabled: Option<bool>,
    pub transparency_tips_enabled: Option<bool>,
}

fn default_settings() -> DesktopSettings {
    DesktopSettings {
        model: "llama3.1:8b".to_string(),
        ollama_host: "http://127.0.0.1:11434".to_string(),
        nats_url: "nats://127.0.0.1:4222".to_string(),
        voice_enabled: true,
        local_only_mode: true,
        cloud_assist_enabled: false,
        trust_audit_enabled: true,
        transparency_tips_enabled: true,
    }
}

fn merge_settings(current: DesktopSettings, update: SettingsUpdate) -> DesktopSettings {
    let mut merged = DesktopSettings {
        model: sanitize_model(update.model.unwrap_or(current.model).as_str()),
        ollama_host: sanitize_http_url(
            update.ollama_host.unwrap_or(current.ollama_host).as_str(),
            "http://127.0.0.1:11434",
        ),
        nats_url: sanitize_nats_url(
            update.nats_url.unwrap_or(current.nats_url).as_str(),
            "nats://127.0.0.1:4222",
        ),
        voice_enabled: update.voice_enabled.unwrap_or(current.voice_enabled),
        local_only_mode: update.local_only_mode.unwrap_or(current.local_only_mode),
        cloud_assist_enabled: update
            .cloud_assist_enabled
            .unwrap_or(current.cloud_assist_enabled),
        trust_audit_enabled: update
            .trust_audit_enabled
            .unwrap_or(current.trust_audit_enabled),
        transparency_tips_enabled: update
            .transparency_tips_enabled
            .unwrap_or(current.transparency_tips_enabled),
    };

    if merged.local_only_mode {
        merged.cloud_assist_enabled = false;
    }

    merged
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSettingsPartial {
    model: Option<String>,
    ollama_host: Option<String>,
    nats_url: Option<String>,
    voice_enabled: Option<bool>,
    local_only_mode: Option<bool>,
    cloud_assist_enabled: Option<bool>,
    trust_audit_enabled: Option<bool>,
    transparency_tips_enabled: Option<bool>,
}

fn normalize_settings_partial(partial: DesktopSettingsPartial) -> DesktopSettings {
    let defaults = default_settings();
    let mut normalized = DesktopSettings {
        model: sanitize_model(partial.model.unwrap_or(defaults.model).as_str()),
        ollama_host: sanitize_http_url(
            partial.ollama_host.unwrap_or(defaults.ollama_host).as_str(),
            "http://127.0.0.1:11434",
        ),
        nats_url: sanitize_nats_url(
            partial.nats_url.unwrap_or(defaults.nats_url).as_str(),
            "nats://127.0.0.1:4222",
        ),
        voice_enabled: partial.voice_enabled.unwrap_or(defaults.voice_enabled),
        local_only_mode: partial.local_only_mode.unwrap_or(defaults.local_only_mode),
        cloud_assist_enabled: partial
            .cloud_assist_enabled
            .unwrap_or(defaults.cloud_assist_enabled),
        trust_audit_enabled: partial
            .trust_audit_enabled
            .unwrap_or(defaults.trust_audit_enabled),
        transparency_tips_enabled: partial
            .transparency_tips_enabled
            .unwrap_or(defaults.transparency_tips_enabled),
    };

    if normalized.local_only_mode {
        normalized.cloud_assist_enabled = false;
    }

    normalized
}

fn sanitize_model(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 256 {
        return "llama3.1:8b".to_string();
    }

    if trimmed.starts_with('/') || trimmed.ends_with('/') || trimmed.contains("//") {
        return "llama3.1:8b".to_string();
    }

    if trimmed
        .chars()
        .all(|char| char.is_ascii_alphanumeric() || "._-:/".contains(char))
        && trimmed
            .split('/')
            .all(|segment| !segment.is_empty() && segment != "." && segment != "..")
    {
        return trimmed.to_string();
    }

    "llama3.1:8b".to_string()
}

fn sanitize_http_url(value: &str, fallback: &str) -> String {
    let candidate = value.trim();
    if candidate.is_empty() || candidate.len() > 256 {
        return fallback.to_string();
    }

    if (candidate.starts_with("http://") || candidate.starts_with("https://"))
        && !candidate.chars().any(|char| char.is_control())
    {
        return candidate.trim_end_matches('/').to_string();
    }

    fallback.to_string()
}

fn sanitize_nats_url(value: &str, fallback: &str) -> String {
    let candidate = value.trim();
    if candidate.is_empty() || candidate.len() > 256 {
        return fallback.to_string();
    }

    if (candidate.starts_with("nats://") || candidate.starts_with("tls://"))
        && !candidate.chars().any(|char| char.is_control())
    {
        return candidate.trim_end_matches('/').to_string();
    }

    fallback.to_string()
}

fn settings_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Unable to resolve home directory".to_string())?;
    Ok(home.join(".lifeos").join("init.json"))
}

fn load_settings() -> Result<DesktopSettings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(default_settings());
    }

    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read settings file {}: {error}", path.display()))?;

    let parsed = serde_json::from_str::<DesktopSettingsPartial>(&raw)
        .map_err(|error| format!("Failed to parse settings file {}: {error}", path.display()))?;

    Ok(normalize_settings_partial(parsed))
}

fn persist_settings(settings: &DesktopSettings) -> Result<(), String> {
    let path = settings_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to prepare settings directory {}: {error}", parent.display()))?;
    }

    let payload = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("Failed to serialize settings payload: {error}"))?;

    fs::write(&path, format!("{payload}\n"))
        .map_err(|error| format!("Failed to write settings file {}: {error}", path.display()))
}

#[tauri::command]
pub async fn settings_read() -> Result<DesktopSettings, String> {
    load_settings()
}

#[tauri::command]
pub async fn settings_write(update: SettingsUpdate) -> Result<DesktopSettings, String> {
    let current = load_settings().unwrap_or_else(|_| default_settings());
    let merged = merge_settings(current, update);

    persist_settings(&merged)?;
    Ok(merged)
}

#[tauri::command]
pub async fn settings_models() -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("settings_models", json!({}))
}

#[cfg(test)]
mod tests {
    use super::{
        default_settings, merge_settings, sanitize_http_url, sanitize_model, sanitize_nats_url,
        DesktopSettings, SettingsUpdate,
    };

    #[test]
    fn default_settings_serialize_with_camel_case_fields() {
        let encoded = serde_json::to_value(default_settings()).expect("default settings should serialize");
        assert_eq!(encoded["model"], "llama3.1:8b");
        assert_eq!(encoded["ollamaHost"], "http://127.0.0.1:11434");
        assert_eq!(encoded["natsUrl"], "nats://127.0.0.1:4222");
        assert_eq!(encoded["voiceEnabled"], true);
        assert_eq!(encoded["localOnlyMode"], true);
        assert_eq!(encoded["cloudAssistEnabled"], false);
        assert_eq!(encoded["trustAuditEnabled"], true);
        assert_eq!(encoded["transparencyTipsEnabled"], true);
    }

    #[test]
    fn sanitize_model_allows_supported_characters() {
        let value = sanitize_model("mistral:7b-instruct");
        assert_eq!(value, "mistral:7b-instruct");

        let namespaced = sanitize_model("registry/library/gemma3:12b");
        assert_eq!(namespaced, "registry/library/gemma3:12b");
    }

    #[test]
    fn sanitize_model_rejects_invalid_characters() {
        let value = sanitize_model("../../etc/passwd");
        assert_eq!(value, "llama3.1:8b");
    }

    #[test]
    fn sanitize_http_url_trims_trailing_slash() {
        let value = sanitize_http_url("https://localhost:11434/", "http://127.0.0.1:11434");
        assert_eq!(value, "https://localhost:11434");
    }

    #[test]
    fn sanitize_nats_url_uses_fallback_for_invalid_protocol() {
        let value = sanitize_nats_url("http://127.0.0.1:4222", "nats://127.0.0.1:4222");
        assert_eq!(value, "nats://127.0.0.1:4222");
    }

    #[test]
    fn merge_settings_applies_partial_update_and_sanitization() {
        let current = DesktopSettings {
            model: "llama3.1:8b".to_string(),
            ollama_host: "http://127.0.0.1:11434".to_string(),
            nats_url: "nats://127.0.0.1:4222".to_string(),
            voice_enabled: true,
            local_only_mode: true,
            cloud_assist_enabled: false,
            trust_audit_enabled: true,
            transparency_tips_enabled: true,
        };
        let update = SettingsUpdate {
            model: Some("mistral:7b".to_string()),
            ollama_host: Some("https://localhost:11434/".to_string()),
            nats_url: Some("invalid-url".to_string()),
            voice_enabled: Some(false),
            local_only_mode: Some(false),
            cloud_assist_enabled: Some(true),
            trust_audit_enabled: Some(false),
            transparency_tips_enabled: Some(false),
        };

        let merged = merge_settings(current, update);
        assert_eq!(merged.model, "mistral:7b");
        assert_eq!(merged.ollama_host, "https://localhost:11434");
        assert_eq!(merged.nats_url, "nats://127.0.0.1:4222");
        assert!(!merged.voice_enabled);
        assert!(!merged.local_only_mode);
        assert!(merged.cloud_assist_enabled);
        assert!(!merged.trust_audit_enabled);
        assert!(!merged.transparency_tips_enabled);
    }

    #[test]
    fn local_only_mode_disables_cloud_assist() {
        let current = default_settings();
        let update = SettingsUpdate {
            model: None,
            ollama_host: None,
            nats_url: None,
            voice_enabled: None,
            local_only_mode: Some(true),
            cloud_assist_enabled: Some(true),
            trust_audit_enabled: None,
            transparency_tips_enabled: None,
        };

        let merged = merge_settings(current, update);
        assert!(merged.local_only_mode);
        assert!(!merged.cloud_assist_enabled);
    }
}
