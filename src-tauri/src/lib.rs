mod commands;
mod db;
mod error;
mod models;

use db::Database;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Database::new())
        .setup(|app| {
            let db = app.state::<Database>();
            db.init_if_configured(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::login,
            commands::credits::list_credits,
            commands::credits::add_credit_payment,
            commands::dashboard::get_dashboard,
            commands::expenses::list_expenses,
            commands::expenses::save_expense,
            commands::expenses::delete_expense,
            commands::perfumery::list_flacons,
            commands::perfumery::save_flacon,
            commands::perfumery::list_perfumes,
            commands::perfumery::save_perfume,
            commands::products::list_products,
            commands::products::save_product,
            commands::products::delete_product,
            commands::sales::checkout,
            commands::sales::list_sales,
            commands::system::configure_database,
            commands::system::is_database_configured,
            commands::system::save_database,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Athena Shop POS");
}
