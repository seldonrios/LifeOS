use serde_json::json;

fn graph_summary_payload() -> serde_json::Value {
    json!({})
}

#[tauri::command]
pub async fn graph_summary() -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("graph_summary", graph_summary_payload())
}

#[cfg(test)]
mod tests {
    use super::graph_summary_payload;

    #[test]
    fn graph_summary_payload_is_empty_object() {
        let payload = graph_summary_payload();
        assert!(payload.as_object().is_some());
        assert_eq!(payload.as_object().map(|value| value.len()), Some(0));
    }
}
