use std::fs;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::db::{Database, PostgresConfig};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct PrinterSettings {
    pub invoice_printer: String,
    pub barcode_printer: String,
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
pub fn list_printers() -> AppResult<Vec<String>> {
    let output = if cfg!(target_os = "windows") {
        Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "Get-CimInstance Win32_Printer | Sort-Object Name | Select-Object -ExpandProperty Name",
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
pub fn get_printer_settings(db: State<Database>) -> AppResult<PrinterSettings> {
    db.with_client(|client| {
        let mut settings = PrinterSettings::default();
        for row in client.query(
            "SELECT key, value FROM app_meta WHERE key IN ('invoice_printer', 'barcode_printer')",
            &[],
        )? {
            let key: String = row.get(0);
            let value: String = row.get(1);
            match key.as_str() {
                "invoice_printer" => settings.invoice_printer = value,
                "barcode_printer" => settings.barcode_printer = value,
                _ => {}
            }
        }
        Ok(settings)
    })
}

#[tauri::command]
pub fn save_printer_settings(
    db: State<Database>,
    input: PrinterSettings,
) -> AppResult<PrinterSettings> {
    db.with_client(|client| {
        client.execute(
            "INSERT INTO app_meta (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&"invoice_printer", &input.invoice_printer],
        )?;
        client.execute(
            "INSERT INTO app_meta (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&"barcode_printer", &input.barcode_printer],
        )?;
        Ok(input)
    })
}

#[tauri::command]
pub fn print_receipt_text(db: State<Database>, content: String) -> AppResult<()> {
    let settings = get_printer_settings(db)?;
    print_text(content, settings.invoice_printer)
}

fn print_text(content: String, printer_name: String) -> AppResult<()> {
    if content.trim().is_empty() {
        return Err(AppError::Message("Aucun contenu a imprimer".into()));
    }

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::Message(error.to_string()))?
        .as_millis();
    let path = std::env::temp_dir().join(format!("athena-receipt-{stamp}.txt"));
    fs::write(&path, content)?;

    if cfg!(target_os = "windows") {
        Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "param($Path,$Printer) try { if ([string]::IsNullOrWhiteSpace($Printer)) { Get-Content -LiteralPath $Path | Out-Printer } else { Get-Content -LiteralPath $Path | Out-Printer -Name $Printer } } finally { Start-Sleep -Seconds 2; Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue }",
            ])
            .arg(path.as_os_str())
            .arg(printer_name)
            .spawn()?;
        return Ok(());
    }

    let mut command = Command::new("lp");
    if !printer_name.trim().is_empty() {
        command.arg("-d").arg(printer_name.trim());
    }
    command.arg(path.as_os_str()).spawn()?;
    Ok(())
}
