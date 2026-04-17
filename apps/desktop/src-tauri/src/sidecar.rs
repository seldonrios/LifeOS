use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::{json, Value};

const SIDECAR_TIMEOUT_MS: u64 = 30_000;
const ALLOWED_SIDECAR_COMMANDS: &[&str] = &[
    "graph_summary",
    "goal_list",
    "goal_run",
    "capture_create",
    "inbox_list",
    "task_create",
    "reminder_schedule",
    "plan_from_capture",
    "note_create",
    "inbox_defer",
    "inbox_delete",
    "task_list",
    "task_complete",
    "review_daily",
    "review_close_day",
    "review_move_open",
    "review_archive",
    "plan_block",
    "plan_alternatives",
    "plan_split",
    "modules_list",
    "module_enable",
    "module_disable",
    "marketplace_list",
    "settings_read",
    "settings_write",
    "settings_models",
    "trust_status",
];

fn sidecar_error(code: &str, detail: impl AsRef<str>) -> String {
    format!("{code}: {}", detail.as_ref())
}

fn truncate_for_error(value: &str, max: usize) -> String {
    if value.len() <= max {
        return value.to_string();
    }
    let mut truncated = value[..max].to_string();
    truncated.push_str("...");
    truncated
}

fn resolve_sidecar_program() -> (String, Vec<String>) {
    if let Ok(explicit) = std::env::var("LIFEOS_SIDECAR_BIN") {
        let allow_override = std::env::var("LIFEOS_ALLOW_SIDECAR_OVERRIDE")
            .map(|value| value.trim().eq_ignore_ascii_case("true"))
            .unwrap_or(false);

        if cfg!(debug_assertions) || allow_override {
            return (explicit, Vec::new());
        }
    }

    if cfg!(debug_assertions) {
        let script = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../sidecar/dist/index.js")
            .to_string_lossy()
            .into_owned();
        return ("node".to_string(), vec![script]);
    }

    let bundled_binary_name = if cfg!(target_os = "windows") {
        "lifeos-sidecar.exe"
    } else {
        "lifeos-sidecar"
    };

    let target_suffix = option_env!("TARGET").map(|target| {
        if cfg!(target_os = "windows") {
            format!("lifeos-sidecar-{target}.exe")
        } else {
            format!("lifeos-sidecar-{target}")
        }
    });

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            let mut search_dirs: Vec<PathBuf> = vec![parent.to_path_buf()];

            if cfg!(target_os = "macos") {
                if let Some(contents) = parent.parent() {
                    search_dirs.push(contents.join("Resources"));
                }
            }

            for dir in search_dirs {
                let default_candidate = dir.join(bundled_binary_name);
                if default_candidate.exists() {
                    return (default_candidate.to_string_lossy().into_owned(), Vec::new());
                }

                if let Some(suffixed_name) = &target_suffix {
                    let suffixed_candidate = dir.join(suffixed_name);
                    if suffixed_candidate.exists() {
                        return (suffixed_candidate.to_string_lossy().into_owned(), Vec::new());
                    }
                }

                let binaries_default_candidate = dir.join("binaries").join(bundled_binary_name);
                if binaries_default_candidate.exists() {
                    return (
                        binaries_default_candidate.to_string_lossy().into_owned(),
                        Vec::new(),
                    );
                }

                if let Some(suffixed_name) = &target_suffix {
                    let binaries_suffixed_candidate = dir.join("binaries").join(suffixed_name);
                    if binaries_suffixed_candidate.exists() {
                        return (
                            binaries_suffixed_candidate.to_string_lossy().into_owned(),
                            Vec::new(),
                        );
                    }
                }
            }
        }
    }

    (bundled_binary_name.to_string(), Vec::new())
}

pub fn invoke_sidecar(command: &str, args: Value) -> Result<Value, String> {
    if !ALLOWED_SIDECAR_COMMANDS.contains(&command) {
        return Err(sidecar_error(
            "SIDECAR_UNSUPPORTED_COMMAND",
            format!("Command \"{command}\" is not allowed"),
        ));
    }

    let (program, base_args) = resolve_sidecar_program();

    let mut child = Command::new(program)
        .args(base_args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| sidecar_error("SIDECAR_LAUNCH_FAILED", error.to_string()))?;

    let request = json!({
        "id": "tauri-request",
        "command": command,
        "args": args,
    });

    let input = child
        .stdin
        .as_mut()
        .ok_or_else(|| sidecar_error("SIDECAR_STDIN_UNAVAILABLE", "Sidecar stdin unavailable"))?;
    writeln!(input, "{request}")
        .map_err(|error| sidecar_error("SIDECAR_REQUEST_WRITE_FAILED", error.to_string()))?;

    let deadline = Instant::now() + Duration::from_millis(SIDECAR_TIMEOUT_MS);
    let output = loop {
        match child.try_wait() {
            Ok(Some(_status)) => {
                break child
                    .wait_with_output()
                    .map_err(|error| format!("Sidecar execution failed: {error}"))?;
            }
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(sidecar_error(
                        "SIDECAR_TIMEOUT",
                        format!("Sidecar request timed out after {}ms", SIDECAR_TIMEOUT_MS),
                    ));
                }
                thread::sleep(Duration::from_millis(10));
            }
            Err(error) => {
                return Err(sidecar_error(
                    "SIDECAR_STATUS_FAILED",
                    format!("Sidecar process status failed: {error}"),
                ))
            }
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if stdout.trim().is_empty() {
        let detail = if stderr.trim().is_empty() {
            "Sidecar returned no output".to_string()
        } else {
            truncate_for_error(&stderr, 500)
        };
        return Err(sidecar_error("SIDECAR_EMPTY_RESPONSE", detail));
    }

    let line = stdout
        .lines()
        .last()
        .ok_or_else(|| "Sidecar produced unreadable output".to_string())?;
    let parsed: Value = serde_json::from_str(line).map_err(|error| {
        sidecar_error(
            "SIDECAR_INVALID_JSON",
            format!(
            "Invalid sidecar JSON response: {error}. payload={}",
            truncate_for_error(line, 300)
            ),
        )
    })?;

    if let Some(error) = parsed.get("error").and_then(Value::as_str) {
        return Err(sidecar_error("SIDECAR_COMMAND_ERROR", error));
    }

    parsed
        .get("result")
        .cloned()
        .ok_or_else(|| sidecar_error("SIDECAR_MISSING_RESULT", "Missing sidecar result payload"))
}

#[cfg(test)]
mod tests {
    use super::{invoke_sidecar, ALLOWED_SIDECAR_COMMANDS};
    use serde_json::json;

    #[test]
    fn allowlist_includes_capture_create() {
        assert!(ALLOWED_SIDECAR_COMMANDS.contains(&"capture_create"));
    }

    #[test]
    fn allowlist_includes_goal_list() {
        assert!(ALLOWED_SIDECAR_COMMANDS.contains(&"goal_list"));
    }

    #[test]
    fn allowlist_includes_new_ux_e2_commands() {
        let expected = [
            "plan_from_capture",
            "note_create",
            "inbox_defer",
            "inbox_delete",
            "review_close_day",
            "review_move_open",
            "review_archive",
            "plan_block",
            "plan_alternatives",
            "plan_split",
        ];

        for command in expected {
            assert!(ALLOWED_SIDECAR_COMMANDS.contains(&command));
        }
    }

    #[test]
    fn invoke_sidecar_rejects_unsupported_commands_before_spawn() {
        let result = invoke_sidecar("not_allowed", json!({}));
        assert!(result.is_err());
        let message = result.err().unwrap_or_default();
        assert!(message.contains("SIDECAR_UNSUPPORTED_COMMAND"));
    }
}
