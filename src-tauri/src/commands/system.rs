use std::fs;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use tauri::{AppHandle, State};

use crate::db::{Database, PostgresConfig};
use crate::error::{AppError, AppResult};
use crate::models::AppSettings;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(target_os = "windows")]
fn hide_console(command: &mut Command) -> &mut Command {
    command.creation_flags(CREATE_NO_WINDOW)
}

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

#[tauri::command]
pub fn get_app_settings(db: State<Database>) -> AppResult<AppSettings> {
    db.with_client(|client| {
        let allow_negative_stock = client
            .query_opt(
                "SELECT value FROM app_meta WHERE key = 'allow_negative_stock'",
                &[],
            )?
            .map(|row| row.get::<_, String>(0) != "false")
            .unwrap_or(true);
        let cash_register_auto_close_time = client
            .query_opt(
                "SELECT value FROM app_meta WHERE key = 'cash_register_auto_close_time'",
                &[],
            )?
            .map(|row| row.get::<_, String>(0))
            .unwrap_or_else(|| "23:59".into());
        let max_discount_amount = client
            .query_opt(
                "SELECT value FROM app_meta WHERE key = 'max_discount_amount'",
                &[],
            )?
            .and_then(|row| row.get::<_, String>(0).parse::<f64>().ok())
            .unwrap_or(200.0)
            .max(0.0);
        let invoice_printer = client
            .query_opt(
                "SELECT value FROM app_meta WHERE key = 'invoice_printer'",
                &[],
            )?
            .map(|row| row.get::<_, String>(0))
            .unwrap_or_default();
        let barcode_printer = client
            .query_opt(
                "SELECT value FROM app_meta WHERE key = 'barcode_printer'",
                &[],
            )?
            .map(|row| row.get::<_, String>(0))
            .unwrap_or_default();
        let ui_font_scale = client
            .query_opt(
                "SELECT value FROM app_meta WHERE key = 'ui_font_scale'",
                &[],
            )?
            .map(|row| row.get::<_, String>(0))
            .filter(|value| matches!(value.as_str(), "small" | "normal" | "large"))
            .unwrap_or_else(|| "normal".into());
        let ui_density = client
            .query_opt(
                "SELECT value FROM app_meta WHERE key = 'ui_density'",
                &[],
            )?
            .map(|row| row.get::<_, String>(0))
            .filter(|value| matches!(value.as_str(), "compact" | "comfortable" | "spacious"))
            .unwrap_or_else(|| "comfortable".into());
        let pos_layout = client
            .query_opt(
                "SELECT value FROM app_meta WHERE key = 'pos_layout'",
                &[],
            )?
            .map(|row| row.get::<_, String>(0))
            .filter(|value| matches!(value.as_str(), "auto" | "side" | "bottom"))
            .unwrap_or_else(|| "auto".into());
        let pos_cart_width = client
            .query_opt(
                "SELECT value FROM app_meta WHERE key = 'pos_cart_width'",
                &[],
            )?
            .and_then(|row| row.get::<_, String>(0).parse::<i64>().ok())
            .unwrap_or(320)
            .clamp(280, 420);
        Ok(AppSettings {
            allow_negative_stock,
            cash_register_auto_close_time,
            max_discount_amount,
            invoice_printer,
            barcode_printer,
            ui_font_scale,
            ui_density,
            pos_layout,
            pos_cart_width,
        })
    })
}

#[tauri::command]
pub fn save_app_settings(db: State<Database>, input: AppSettings) -> AppResult<AppSettings> {
    if chrono::NaiveTime::parse_from_str(input.cash_register_auto_close_time.trim(), "%H:%M")
        .is_err()
    {
        return Err(AppError::Message("Heure fermeture invalide".into()));
    }
    if input.max_discount_amount < 0.0 {
        return Err(AppError::Message("Remise maximale invalide".into()));
    }
    if !matches!(input.ui_font_scale.as_str(), "small" | "normal" | "large") {
        return Err(AppError::Message("Taille de police invalide".into()));
    }
    if !matches!(input.ui_density.as_str(), "compact" | "comfortable" | "spacious") {
        return Err(AppError::Message("Densite interface invalide".into()));
    }
    if !matches!(input.pos_layout.as_str(), "auto" | "side" | "bottom") {
        return Err(AppError::Message("Disposition POS invalide".into()));
    }
    let pos_cart_width = input.pos_cart_width.clamp(280, 420);
    db.with_client(|client| {
        let value = if input.allow_negative_stock {
            "true"
        } else {
            "false"
        };
        client.execute(
            "INSERT INTO app_meta (key, value)
             VALUES ('allow_negative_stock', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&value],
        )?;
        client.execute(
            "INSERT INTO app_meta (key, value)
             VALUES ('cash_register_auto_close_time', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&input.cash_register_auto_close_time.trim()],
        )?;
        let max_discount_amount = input.max_discount_amount.to_string();
        client.execute(
            "INSERT INTO app_meta (key, value)
             VALUES ('max_discount_amount', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&max_discount_amount],
        )?;
        client.execute(
            "INSERT INTO app_meta (key, value)
             VALUES ('invoice_printer', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&input.invoice_printer.trim()],
        )?;
        client.execute(
            "INSERT INTO app_meta (key, value)
             VALUES ('barcode_printer', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&input.barcode_printer.trim()],
        )?;
        client.execute(
            "INSERT INTO app_meta (key, value)
             VALUES ('ui_font_scale', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&input.ui_font_scale.as_str()],
        )?;
        client.execute(
            "INSERT INTO app_meta (key, value)
             VALUES ('ui_density', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&input.ui_density.as_str()],
        )?;
        client.execute(
            "INSERT INTO app_meta (key, value)
             VALUES ('pos_layout', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&input.pos_layout.as_str()],
        )?;
        let pos_cart_width_value = pos_cart_width.to_string();
        client.execute(
            "INSERT INTO app_meta (key, value)
             VALUES ('pos_cart_width', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&pos_cart_width_value],
        )?;
        Ok(AppSettings {
            pos_cart_width,
            ..input
        })
    })
}

#[tauri::command]
pub fn list_printers() -> AppResult<Vec<String>> {
    let output = if cfg!(target_os = "windows") {
        let mut command = Command::new("powershell.exe");
        hide_console(&mut command)
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -ExpandProperty Name",
            ])
            .output()
    } else {
        Command::new("lpstat").arg("-a").output()
    };

    let Ok(output) = output else {
        return Ok(Vec::new());
    };
    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| {
            if cfg!(target_os = "windows") {
                line.to_string()
            } else {
                line.split_whitespace().next().unwrap_or(line).to_string()
            }
        })
        .collect())
}

#[tauri::command]
pub fn print_receipt_text(db: State<Database>, content: String) -> AppResult<()> {
    if content.trim().is_empty() {
        return Err(AppError::Message("Ticket vide".into()));
    }
    let settings = get_app_settings(db)?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::Message(error.to_string()))?
        .as_millis();
    let path = std::env::temp_dir().join(format!("athena-shop-ticket-{timestamp}.txt"));
    fs::write(&path, content)?;

    if let Err(error) = print_file(&path, settings.invoice_printer.as_str()) {
        let _ = fs::remove_file(&path);
        return Err(error);
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn print_file(path: &std::path::Path, printer_name: &str) -> AppResult<()> {
    ensure_printer_available(printer_name)?;
    let mut command = Command::new("powershell.exe");
    hide_console(&mut command)
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "try { if ([string]::IsNullOrWhiteSpace($args[1])) { Get-Content -LiteralPath $args[0] | Out-Printer } else { Get-Content -LiteralPath $args[0] | Out-Printer -Name $args[1] } } finally { Remove-Item -LiteralPath $args[0] -ErrorAction SilentlyContinue }",
        ])
        .arg(path)
        .arg(printer_name)
        .spawn()?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn print_file(path: &std::path::Path, printer_name: &str) -> AppResult<()> {
    let mut command = Command::new("lp");
    if !printer_name.trim().is_empty() {
        command.arg("-d").arg(printer_name.trim());
    }
    command.arg(path).spawn()?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn ensure_printer_available(printer_name: &str) -> AppResult<()> {
    let script = if printer_name.trim().is_empty() {
        "if ((Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Select-Object -First 1) -ne $null) { exit 0 } else { exit 1 }"
    } else {
        "if ((Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $args[0] } | Select-Object -First 1) -ne $null) { exit 0 } else { exit 1 }"
    };
    let mut command = Command::new("powershell.exe");
    let status = hide_console(&mut command)
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .arg(printer_name)
        .status()?;
    if status.success() {
        Ok(())
    } else if printer_name.trim().is_empty() {
        Err(AppError::Message("Aucune imprimante disponible".into()))
    } else {
        Err(AppError::Message(format!(
            "Imprimante introuvable: {}",
            printer_name
        )))
    }
}

#[tauri::command]
pub fn reset_with_dummy_data(db: State<Database>) -> AppResult<()> {
    db.with_client(|client| {
        client.batch_execute(
            "
            TRUNCATE TABLE supplier_payments, purchase_order_items, purchase_orders, suppliers,
              stock_movements, credit_payments, sale_items, sales, expenses, products, cash_shifts
              RESTART IDENTITY CASCADE;

            INSERT INTO products
              (id, name, barcode, category, size, color, quantity, low_stock_threshold, purchase_price, sale_price, image_data)
            VALUES
              (1, 'Pyjama satin noir', 'AS-DEMO-001', 'Products', 'M', 'Noir', 18, 4, 1800, 3400, ''),
              (2, 'Ensemble coton creme', 'AS-DEMO-002', 'Products', 'L', 'Creme', 22, 5, 1400, 2800, ''),
              (3, 'Robe maison fleurie', 'AS-DEMO-003', 'Products', 'M', 'Rose', 8, 3, 2100, 4300, ''),
              (4, 'Pantoufles soft', 'AS-DEMO-004', 'Accessoires', '38', 'Beige', 5, 4, 700, 1600, ''),
              (5, 'Sac cadeau boutique', 'AS-DEMO-005', 'Accessoires', 'Standard', 'Or', 35, 8, 120, 350, ''),
              (6, 'Kimono premium', 'AS-DEMO-006', 'Products', 'XL', 'Olive', 3, 4, 3200, 6500, ''),
              (7, 'Musc blanc 12ml', 'AS-DEMO-007', 'Perfumerie', '12ml', 'Blanc', 16, 5, 650, 1500, ''),
              (8, 'Parfum oud 30ml', 'AS-DEMO-008', 'Perfumerie', '30ml', 'Ambre', 9, 3, 1900, 4200, '');

            INSERT INTO expenses (id, label, category, amount, note, expense_date, created_at)
            VALUES
              (1, 'Loyer boutique', 'Fixe', 18000, 'Dummy data', CURRENT_DATE - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
              (2, 'Publicite Instagram', 'Marketing', 4200, 'Campagne test', CURRENT_DATE - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
              (3, 'Sachets et emballage', 'Fournitures', 2300, 'Stock emballage', CURRENT_DATE, NOW()),
              (4, 'Livraison fournisseur', 'Transport', 3100, 'Reception marchandise', CURRENT_DATE - INTERVAL '12 days', NOW() - INTERVAL '12 days'),
              (5, 'Nettoyage boutique', 'Service', 1200, 'Entretien', CURRENT_DATE - INTERVAL '20 days', NOW() - INTERVAL '20 days');

            INSERT INTO sales
              (id, receipt_no, subtotal, discount, total, profit, payment_method, sale_type, customer_name, customer_phone,
               paid_amount, remaining_amount, due_date, credit_note, credit_status, cashier, created_at)
            VALUES
              (1, 'AS-DEMO-0001', 6200, 0, 6200, 3200, 'Especes', 'cash', '', '', 6200, 0, '', '', 'paid', 'Administrateur', NOW() - INTERVAL '6 days'),
              (2, 'AS-DEMO-0002', 8600, 200, 8400, 4200, 'Especes', 'credit', 'Samira', '0555000001', 6000, 2400, '', 'Client fidele', 'partial', 'Administrateur', NOW() - INTERVAL '4 days'),
              (3, 'AS-DEMO-0003', 6150, 0, 6150, 2780, 'Especes', 'cash', '', '', 6150, 0, '', '', 'paid', 'Administrateur', NOW() - INTERVAL '1 day'),
              (4, 'AS-DEMO-0004', 10800, 0, 10800, 5200, 'Especes', 'credit', 'Nadia', '0555000002', 4000, 6800, '', 'A payer fin semaine', 'partial', 'Administrateur', NOW()),
              (5, 'AS-DEMO-0005', 3150, 0, 3150, 1730, 'Especes', 'cash', '', '', 3150, 0, '', '', 'paid', 'Administrateur', NOW());

            INSERT INTO sale_items
              (sale_id, product_id, product_name, barcode, quantity, unit_price, purchase_price, line_total)
            VALUES
              (1, 1, 'Pyjama satin noir', 'AS-DEMO-001', 1, 3400, 1800, 3400),
              (1, 2, 'Ensemble coton creme', 'AS-DEMO-002', 1, 2800, 1400, 2800),
              (2, 3, 'Robe maison fleurie', 'AS-DEMO-003', 2, 4300, 2100, 8600),
              (3, 7, 'Musc blanc 12ml', 'AS-DEMO-007', 3, 1500, 650, 4500),
              (3, 4, 'Pantoufles soft', 'AS-DEMO-004', 1, 1600, 700, 1600),
              (3, 5, 'Sac cadeau boutique', 'AS-DEMO-005', 1, 50, 20, 50),
              (4, 6, 'Kimono premium', 'AS-DEMO-006', 1, 6500, 3200, 6500),
              (4, 8, 'Parfum oud 30ml', 'AS-DEMO-008', 1, 4200, 1900, 4200),
              (4, 5, 'Sac cadeau boutique', 'AS-DEMO-005', 1, 100, 20, 100),
              (5, 2, 'Ensemble coton creme', 'AS-DEMO-002', 1, 2800, 1400, 2800),
              (5, 5, 'Sac cadeau boutique', 'AS-DEMO-005', 1, 350, 120, 350);

            INSERT INTO credit_payments (id, sale_id, amount, note, cashier, paid_at)
            VALUES
              (1, 2, 3000, 'Versement dummy', 'Administrateur', NOW() - INTERVAL '2 days'),
              (2, 4, 0, 'Initial dummy ignored in reports', 'Administrateur', NOW());

            DELETE FROM credit_payments WHERE amount <= 0;

            SELECT setval('products_id_seq', (SELECT MAX(id) FROM products));
            SELECT setval('expenses_id_seq', (SELECT MAX(id) FROM expenses));
            SELECT setval('sales_id_seq', (SELECT MAX(id) FROM sales));
            SELECT setval('sale_items_id_seq', (SELECT MAX(id) FROM sale_items));
            SELECT setval('credit_payments_id_seq', (SELECT MAX(id) FROM credit_payments));
            ",
        )?;
        Ok(())
    })
}

#[tauri::command]
pub fn open_cash_drawer(db: State<Database>) -> AppResult<()> {
    // ESC/POS cash drawer pulse: ESC p m t1 t2.
    let settings = get_app_settings(db)?;
    let pulse = [0x1B_u8, 0x70, 0x00, 0x19, 0xFA];
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::Message(error.to_string()))?
        .as_millis();
    let path = std::env::temp_dir().join(format!("athena-shop-drawer-{timestamp}.bin"));
    fs::write(&path, pulse)?;

    if let Err(error) = print_file(&path, settings.invoice_printer.as_str()) {
        let _ = fs::remove_file(&path);
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
pub fn open_external_url(url: String) -> AppResult<()> {
    let allowed = ["https://openzey.com", "https://www.openzey.com"];
    if !allowed.contains(&url.as_str()) {
        return Err(AppError::Message("Lien externe non autorise".into()));
    }
    open_url(&url)
}

#[cfg(target_os = "windows")]
fn open_url(url: &str) -> AppResult<()> {
    let mut command = Command::new("cmd.exe");
    hide_console(&mut command)
        .args(["/C", "start", "", url])
        .spawn()?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn open_url(url: &str) -> AppResult<()> {
    Command::new("open").arg(url).spawn()?;
    Ok(())
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn open_url(url: &str) -> AppResult<()> {
    Command::new("xdg-open").arg(url).spawn()?;
    Ok(())
}

#[tauri::command]
pub fn empty_database(db: State<Database>) -> AppResult<()> {
    db.with_client(|client| {
        client.batch_execute(
            "
            TRUNCATE TABLE
              perfume_sale_items,
              perfume_prices,
              perfumes,
              flacons,
              credit_payments,
              sale_items,
              sales,
              expenses,
              supplier_payments,
              purchase_order_items,
              purchase_orders,
              suppliers,
              products,
              cash_shifts,
              stock_movements
            RESTART IDENTITY CASCADE;
            ",
        )?;
        Ok(())
    })
}
