use tauri::{AppHandle, State};

use crate::db::{Database, PostgresConfig};
use crate::error::AppResult;

#[tauri::command]
pub fn save_database(db: State<Database>) -> AppResult<()> {
    db.save_now()
}

#[tauri::command]
pub fn is_database_configured(db: State<Database>) -> AppResult<bool> {
    db.is_configured()
}

#[tauri::command]
pub fn configure_database(
    app: AppHandle,
    db: State<Database>,
    input: PostgresConfig,
) -> AppResult<()> {
    db.configure(&app, input)
}
