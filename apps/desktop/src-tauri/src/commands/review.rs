use serde_json::json;

fn review_daily_payload() -> serde_json::Value {
    json!({
        "period": "daily",
    })
}

#[tauri::command]
pub async fn review_daily() -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("review_daily", review_daily_payload())
}

#[cfg(test)]
mod tests {
    use super::review_daily_payload;

    #[test]
    fn review_daily_payload_has_correct_period() {
        let payload = review_daily_payload();
        assert_eq!(payload["period"], "daily");
    }
}
