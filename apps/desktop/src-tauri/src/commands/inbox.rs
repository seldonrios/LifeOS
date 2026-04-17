use serde_json::json;

fn inbox_list_payload() -> serde_json::Value {
    json!({})
}

fn memory_list_payload(limit: Option<u32>) -> serde_json::Value {
    json!({
        "limit": limit.unwrap_or(50),
    })
}

fn integrations_status_payload() -> serde_json::Value {
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

fn plan_from_capture_payload(capture_id: String, title: String) -> serde_json::Value {
    json!({
        "captureId": capture_id,
        "title": title,
    })
}

fn note_create_payload(capture_id: String, title: String) -> serde_json::Value {
    json!({
        "captureId": capture_id,
        "title": title,
    })
}

fn inbox_defer_payload(capture_id: String) -> serde_json::Value {
    json!({
        "captureId": capture_id,
    })
}

fn inbox_delete_payload(capture_id: String) -> serde_json::Value {
    json!({
        "captureId": capture_id,
    })
}

#[tauri::command]
pub async fn inbox_list() -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("inbox_list", inbox_list_payload())
}

#[tauri::command]
pub async fn memory_list(limit: Option<u32>) -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("memory_list", memory_list_payload(limit))
}

#[tauri::command]
pub async fn integrations_status() -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("integrations_status", integrations_status_payload())
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

#[tauri::command]
pub async fn plan_from_capture(
    capture_id: String,
    title: String,
) -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar(
        "plan_from_capture",
        plan_from_capture_payload(capture_id, title),
    )
}

#[tauri::command]
pub async fn note_create(capture_id: String, title: String) -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("note_create", note_create_payload(capture_id, title))
}

#[tauri::command]
pub async fn inbox_defer(capture_id: String) -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("inbox_defer", inbox_defer_payload(capture_id))
}

#[tauri::command]
pub async fn inbox_delete(capture_id: String) -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("inbox_delete", inbox_delete_payload(capture_id))
}

#[cfg(test)]
mod tests {
    use super::{
        inbox_defer_payload, inbox_delete_payload, inbox_list_payload, integrations_status_payload,
        memory_list_payload, note_create_payload, plan_from_capture_payload,
        reminder_schedule_payload, task_create_payload,
    };

    #[test]
    fn inbox_list_payload_is_empty_object() {
        let payload = inbox_list_payload();
        assert!(payload.as_object().is_some());
        assert_eq!(payload.as_object().map(|value| value.len()), Some(0));
    }

    #[test]
    fn memory_list_payload_defaults_limit_to_fifty() {
        let payload = memory_list_payload(None);
        assert_eq!(payload["limit"], 50);
    }

    #[test]
    fn memory_list_payload_uses_provided_limit() {
        let payload = memory_list_payload(Some(120));
        assert_eq!(payload["limit"], 120);
    }

    #[test]
    fn integrations_status_payload_is_empty_object() {
        let payload = integrations_status_payload();
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

    #[test]
    fn plan_from_capture_payload_uses_capture_and_title() {
        let payload = plan_from_capture_payload(
            "capture-1".to_string(),
            "Weekend garage cleanup".to_string(),
        );
        assert_eq!(payload["captureId"], "capture-1");
        assert_eq!(payload["title"], "Weekend garage cleanup");
    }

    #[test]
    fn note_create_payload_uses_capture_and_title() {
        let payload = note_create_payload("capture-2".to_string(), "Project notes".to_string());
        assert_eq!(payload["captureId"], "capture-2");
        assert_eq!(payload["title"], "Project notes");
    }

    #[test]
    fn inbox_defer_payload_uses_capture_id() {
        let payload = inbox_defer_payload("capture-3".to_string());
        assert_eq!(payload["captureId"], "capture-3");
    }

    #[test]
    fn inbox_delete_payload_uses_capture_id() {
        let payload = inbox_delete_payload("capture-4".to_string());
        assert_eq!(payload["captureId"], "capture-4");
    }
}
