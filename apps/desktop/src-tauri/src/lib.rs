mod commands;
mod sidecar;

use commands::capture::capture_create;
use commands::goal::{goal_list, goal_run, task_complete, task_list};
use commands::graph::graph_summary;
use commands::inbox::{
    inbox_defer, inbox_delete, inbox_list, note_create, plan_from_capture, reminder_schedule,
    task_create,
};
use commands::marketplace::marketplace_list;
use commands::modules::{module_disable, module_enable, modules_list};
use commands::review::{
    plan_alternatives, plan_block, plan_split, review_archive, review_close_day, review_daily,
    review_move_open,
};
use commands::settings::{settings_models, settings_read, settings_write};
use commands::trust::trust_status;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            graph_summary,
            goal_list,
            goal_run,
            capture_create,
            inbox_list,
            task_create,
            reminder_schedule,
            plan_from_capture,
            note_create,
            inbox_defer,
            inbox_delete,
            task_list,
            task_complete,
            review_daily,
            review_close_day,
            review_move_open,
            review_archive,
            plan_block,
            plan_alternatives,
            plan_split,
            modules_list,
            module_enable,
            module_disable,
            marketplace_list,
            settings_read,
            settings_write,
            settings_models,
            trust_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
