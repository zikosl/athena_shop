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
            commands::auth::update_profile,
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
            commands::products::adjust_product_stock,
            commands::products::list_stock_movements,
            commands::products::delete_product,
            commands::reports::get_report,
            commands::sales::checkout,
            commands::sales::collect_delivery,
            commands::sales::list_delivery_sales,
            commands::sales::list_sales,
            commands::sales::return_delivery,
            commands::sales::update_sale,
            commands::sales::return_sale_item,
            commands::sales::delete_sale,
            commands::shifts::current_shift,
            commands::shifts::open_shift,
            commands::shifts::close_shift,
            commands::suppliers::add_supplier_payment,
            commands::suppliers::confirm_purchase_order,
            commands::suppliers::disable_supplier,
            commands::suppliers::get_purchase_order,
            commands::suppliers::list_purchase_orders,
            commands::suppliers::list_supplier_payments,
            commands::suppliers::list_suppliers,
            commands::suppliers::save_purchase_order_draft,
            commands::suppliers::save_supplier,
            commands::system::configure_database,
            commands::system::get_app_settings,
            commands::system::is_database_configured,
            commands::system::empty_database,
            commands::system::list_printers,
            commands::system::open_cash_drawer,
            commands::system::open_external_url,
            commands::system::print_receipt_text,
            commands::system::reset_with_dummy_data,
            commands::system::save_app_settings,
            commands::system::save_database,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Yassine POS");
}
