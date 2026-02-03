#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use pgshift_lib::commands;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::test_connection,
            commands::introspect,
            commands::diff,
            commands::render_migration,
            commands::apply_migration,
            commands::get_migrations_dir,
            // Database browser commands
            commands::get_database_info,
            commands::get_table_data,
            commands::execute_query,
            // Migration export
            commands::export_migration,
            commands::list_migrations,
            // Schema versioning
            commands::save_schema_version,
            commands::list_schema_versions,
            commands::get_schema_version,
            commands::delete_schema_version,
            commands::compare_schema_versions,
            commands::compare_version_with_live,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
