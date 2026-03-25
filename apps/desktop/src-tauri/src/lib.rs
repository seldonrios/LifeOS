mod commands;
mod sidecar;

use commands::goal::{goal_run, task_complete, task_list};
use commands::graph::graph_summary;
use commands::marketplace::marketplace_list;
use commands::modules::{module_disable, module_enable, modules_list};
use commands::settings::{settings_models, settings_read, settings_write};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            graph_summary,
            goal_run,
            task_list,
            task_complete,
            modules_list,
            module_enable,
            module_disable,
            marketplace_list,
            settings_read,
            settings_write,
            settings_models,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
