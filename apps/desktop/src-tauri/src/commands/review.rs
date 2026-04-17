use serde_json::json;

fn review_daily_payload() -> serde_json::Value {
    json!({
        "period": "daily",
    })
}

fn review_close_day_payload(tomorrow_note: Option<String>) -> serde_json::Value {
    match tomorrow_note {
        Some(note) => json!({ "tomorrowNote": note }),
        None => json!({}),
    }
}

fn review_move_open_payload() -> serde_json::Value {
    json!({})
}

fn review_archive_payload() -> serde_json::Value {
    json!({})
}

fn plan_block_payload(plan_id: String, reason: Option<String>) -> serde_json::Value {
    match reason {
        Some(value) => json!({ "planId": plan_id, "reason": value }),
        None => json!({ "planId": plan_id }),
    }
}

fn plan_alternatives_payload(plan_id: String) -> serde_json::Value {
    json!({ "planId": plan_id })
}

fn plan_split_payload(plan_id: String) -> serde_json::Value {
    json!({ "planId": plan_id })
}

#[tauri::command]
pub async fn review_daily() -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("review_daily", review_daily_payload())
}

#[tauri::command]
pub async fn review_close_day(tomorrow_note: Option<String>) -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("review_close_day", review_close_day_payload(tomorrow_note))
}

#[tauri::command]
pub async fn review_move_open() -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("review_move_open", review_move_open_payload())
}

#[tauri::command]
pub async fn review_archive() -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("review_archive", review_archive_payload())
}

#[tauri::command]
pub async fn plan_block(plan_id: String, reason: Option<String>) -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("plan_block", plan_block_payload(plan_id, reason))
}

#[tauri::command]
pub async fn plan_alternatives(plan_id: String) -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("plan_alternatives", plan_alternatives_payload(plan_id))
}

#[tauri::command]
pub async fn plan_split(plan_id: String) -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("plan_split", plan_split_payload(plan_id))
}

#[cfg(test)]
mod tests {
    use super::{
        plan_alternatives_payload, plan_block_payload, plan_split_payload, review_archive_payload,
        review_close_day_payload, review_daily_payload, review_move_open_payload,
    };

    #[test]
    fn review_daily_payload_has_correct_period() {
        let payload = review_daily_payload();
        assert_eq!(payload["period"], "daily");
    }

    #[test]
    fn review_close_day_payload_includes_note_when_provided() {
        let payload = review_close_day_payload(Some("Prep tomorrow priorities".to_string()));
        assert_eq!(payload["tomorrowNote"], "Prep tomorrow priorities");
    }

    #[test]
    fn review_close_day_payload_is_empty_without_note() {
        let payload = review_close_day_payload(None);
        assert!(payload.as_object().is_some());
        assert_eq!(payload.as_object().map(|value| value.len()), Some(0));
    }

    #[test]
    fn review_move_open_payload_is_empty_object() {
        let payload = review_move_open_payload();
        assert!(payload.as_object().is_some());
        assert_eq!(payload.as_object().map(|value| value.len()), Some(0));
    }

    #[test]
    fn review_archive_payload_is_empty_object() {
        let payload = review_archive_payload();
        assert!(payload.as_object().is_some());
        assert_eq!(payload.as_object().map(|value| value.len()), Some(0));
    }

    #[test]
    fn plan_block_payload_includes_required_fields() {
        let payload = plan_block_payload("plan-1".to_string(), Some("Waiting on vendor".to_string()));
        assert_eq!(payload["planId"], "plan-1");
        assert_eq!(payload["reason"], "Waiting on vendor");
    }

    #[test]
    fn plan_block_payload_omits_reason_when_not_provided() {
        let payload = plan_block_payload("plan-2".to_string(), None);
        assert_eq!(payload["planId"], "plan-2");
        assert!(payload.get("reason").is_none());
    }

    #[test]
    fn plan_alternatives_payload_includes_plan_id() {
        let payload = plan_alternatives_payload("plan-3".to_string());
        assert_eq!(payload["planId"], "plan-3");
    }

    #[test]
    fn plan_split_payload_includes_plan_id() {
        let payload = plan_split_payload("plan-4".to_string());
        assert_eq!(payload["planId"], "plan-4");
    }
}
