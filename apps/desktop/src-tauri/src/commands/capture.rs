use serde_json::json;

fn capture_create_payload(text: String) -> serde_json::Value {
    json!({
        "text": text,
    })
}

#[tauri::command]
pub async fn capture_create(text: String) -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("capture_create", capture_create_payload(text))
}

#[cfg(test)]
mod tests {
    use super::capture_create_payload;

    #[test]
    fn capture_create_payload_uses_text_contract() {
        let payload = capture_create_payload("Remember to review notes".to_string());
        assert_eq!(payload["text"], "Remember to review notes");
    }
}