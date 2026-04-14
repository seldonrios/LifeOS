use serde_json::json;

fn inbox_list_payload() -> serde_json::Value {
    json!({})
}

fn task_create_payload(capture_id: String, title: String) -> serde_json::Value {
    json!({
        "captureId": capture_id,
        "title": title,
    })
}

fn reminder_schedule_payload(capture_id: String, title: String) -> serde_json::Value {
    json!({
        "captureId": capture_id,
        "title": title,
    })
}

#[tauri::command]
pub async fn inbox_list() -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("inbox_list", inbox_list_payload())
}

#[tauri::command]
pub async fn task_create(capture_id: String, title: String) -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("task_create", task_create_payload(capture_id, title))
}

#[tauri::command]
pub async fn reminder_schedule(capture_id: String, title: String) -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar(
        "reminder_schedule",
        reminder_schedule_payload(capture_id, title),
    )
}

#[cfg(test)]
mod tests {
    use super::{inbox_list_payload, reminder_schedule_payload, task_create_payload};

    #[test]
    fn inbox_list_payload_is_empty_object() {
        let payload = inbox_list_payload();
        assert!(payload.as_object().is_some());
        assert_eq!(payload.as_object().map(|value| value.len()), Some(0));
    }

    #[test]
    fn task_create_payload_uses_capture_and_title() {
        let payload = task_create_payload("capture-1".to_string(), "Pay electric bill".to_string());
        assert_eq!(payload["captureId"], "capture-1");
        assert_eq!(payload["title"], "Pay electric bill");
    }

    #[test]
    fn reminder_schedule_payload_uses_capture_and_title() {
        let payload = reminder_schedule_payload("capture-1".to_string(), "Call dentist".to_string());
        assert_eq!(payload["captureId"], "capture-1");
        assert_eq!(payload["title"], "Call dentist");
    }
}
