use serde_json::json;

fn marketplace_list_payload(certified_only: Option<bool>) -> serde_json::Value {
    json!({
        "certifiedOnly": certified_only.unwrap_or(false),
    })
}

#[tauri::command]
pub async fn marketplace_list(certified_only: Option<bool>) -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("marketplace_list", marketplace_list_payload(certified_only))
}

#[cfg(test)]
mod tests {
    use super::marketplace_list_payload;

    #[test]
    fn marketplace_payload_defaults_to_false_when_missing_flag() {
        let payload = marketplace_list_payload(None);
        assert_eq!(payload["certifiedOnly"], false);
    }

    #[test]
    fn marketplace_payload_respects_explicit_flag() {
        let payload = marketplace_list_payload(Some(true));
        assert_eq!(payload["certifiedOnly"], true);
    }
}
