use serde_json::json;

fn module_id_payload(id: String) -> serde_json::Value {
    json!({
        "id": id,
    })
}

#[tauri::command]
pub async fn modules_list() -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("modules_list", json!({}))
}

#[tauri::command]
pub async fn module_enable(id: String) -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("module_enable", module_id_payload(id))
}

#[tauri::command]
pub async fn module_disable(id: String) -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("module_disable", module_id_payload(id))
}

#[cfg(test)]
mod tests {
    use super::module_id_payload;

    #[test]
    fn module_id_payload_serializes_expected_field() {
        let payload = module_id_payload("calendar".to_string());
        assert_eq!(payload["id"], "calendar");
    }

    #[test]
    fn module_id_payload_preserves_exact_identifier() {
        let payload = module_id_payload("module.with-dash_123".to_string());
        assert_eq!(payload["id"], "module.with-dash_123");
    }
}
