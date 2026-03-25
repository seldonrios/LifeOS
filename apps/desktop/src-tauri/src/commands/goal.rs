use serde_json::json;

fn goal_run_payload(goal: String, model: Option<String>) -> serde_json::Value {
    json!({
        "goal": goal,
        "model": model.unwrap_or_else(|| "llama3.1:8b".to_string()),
    })
}

fn task_complete_payload(task_id: String) -> serde_json::Value {
    json!({
        "taskId": task_id,
    })
}

#[tauri::command]
pub async fn goal_run(goal: String, model: Option<String>) -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("goal_run", goal_run_payload(goal, model))
}

#[tauri::command]
pub async fn task_list() -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("task_list", json!({}))
}

#[tauri::command]
pub async fn task_complete(task_id: String) -> Result<serde_json::Value, String> {
    crate::sidecar::invoke_sidecar("task_complete", task_complete_payload(task_id))
}

#[cfg(test)]
mod tests {
    use super::{goal_run_payload, task_complete_payload};

    #[test]
    fn goal_payload_uses_default_model_when_missing() {
        let payload = goal_run_payload("Plan Q2 rollout".to_string(), None);
        assert_eq!(payload["goal"], "Plan Q2 rollout");
        assert_eq!(payload["model"], "llama3.1:8b");
    }

    #[test]
    fn goal_payload_preserves_explicit_model() {
        let payload = goal_run_payload("Plan Q2 rollout".to_string(), Some("mistral:7b".to_string()));
        assert_eq!(payload["model"], "mistral:7b");
    }

    #[test]
    fn task_complete_payload_uses_task_id_contract() {
        let payload = task_complete_payload("task-123".to_string());
        assert_eq!(payload["taskId"], "task-123");
    }
}
