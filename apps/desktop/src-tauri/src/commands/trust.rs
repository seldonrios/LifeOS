use serde_json::json;

#[tauri::command]
pub async fn trust_status() -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("trust_status", json!({}))
}
