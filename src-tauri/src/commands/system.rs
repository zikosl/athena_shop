use std::fs;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use tauri::{AppHandle, State};

use crate::db::{Database, PostgresConfig};
use crate::error::{AppError, AppResult};
use crate::models::{AppSettings, BarcodePrintInput};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(target_os = "windows")]
fn hide_console(command: &mut Command) -> &mut Command {
    command.creation_flags(CREATE_NO_WINDOW)
}

#[cfg(not(target_os = "windows"))]
fn hide_console(command: &mut Command) -> &mut Command {
    command
}

fn write_utf8_bom(path: &std::path::Path, content: &str) -> AppResult<()> {
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(content.as_bytes());
    fs::write(path, bytes)?;
    Ok(())
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
        let receipt_title = client
            .query_opt(
                "SELECT value FROM app_meta WHERE key = 'receipt_title'",
                &[],
            )?
            .map(|row| row.get::<_, String>(0))
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "Payla Outfit".into());
        let receipt_subtitle = client
            .query_opt(
                "SELECT value FROM app_meta WHERE key = 'receipt_subtitle'",
                &[],
            )?
            .map(|row| row.get::<_, String>(0))
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "Fashion Boutique".into());
        let show_invoice_logo = client
            .query_opt(
                "SELECT value FROM app_meta WHERE key = 'show_invoice_logo'",
                &[],
            )?
            .map(|row| row.get::<_, String>(0))
            .map(|value| value == "true")
            .unwrap_or(true);
        let ticket_width_chars = client
            .query_opt(
                "SELECT value FROM app_meta WHERE key = 'ticket_width_chars'",
                &[],
            )?
            .and_then(|row| row.get::<_, String>(0).parse::<i64>().ok())
            .unwrap_or(32)
            .clamp(24, 48);
        let barcode_label_width_mm = client
            .query_opt(
                "SELECT value FROM app_meta WHERE key = 'barcode_label_width_mm'",
                &[],
            )?
            .and_then(|row| row.get::<_, String>(0).parse::<i64>().ok())
            .unwrap_or(40)
            .clamp(20, 100);
        let barcode_label_height_mm = client
            .query_opt(
                "SELECT value FROM app_meta WHERE key = 'barcode_label_height_mm'",
                &[],
            )?
            .and_then(|row| row.get::<_, String>(0).parse::<i64>().ok())
            .unwrap_or(20)
            .clamp(10, 80);
        let barcode_darkness = client
            .query_opt(
                "SELECT value FROM app_meta WHERE key = 'barcode_darkness'",
                &[],
            )?
            .and_then(|row| row.get::<_, String>(0).parse::<i64>().ok())
            .unwrap_or(5)
            .clamp(1, 5);
        let barcode_speed = client
            .query_opt(
                "SELECT value FROM app_meta WHERE key = 'barcode_speed'",
                &[],
            )?
            .map(|row| row.get::<_, String>(0))
            .filter(|value| matches!(value.as_str(), "slow" | "normal" | "fast"))
            .unwrap_or_else(|| "slow".into());
        let ui_font_scale = client
            .query_opt(
                "SELECT value FROM app_meta WHERE key = 'ui_font_scale'",
                &[],
            )?
            .map(|row| row.get::<_, String>(0))
            .filter(|value| matches!(value.as_str(), "small" | "normal" | "large"))
            .unwrap_or_else(|| "normal".into());
        let ui_zoom = client
            .query_opt("SELECT value FROM app_meta WHERE key = 'ui_zoom'", &[])?
            .and_then(|row| row.get::<_, String>(0).parse::<i64>().ok())
            .unwrap_or(100)
            .clamp(80, 125);
        let ui_density = client
            .query_opt("SELECT value FROM app_meta WHERE key = 'ui_density'", &[])?
            .map(|row| row.get::<_, String>(0))
            .filter(|value| matches!(value.as_str(), "compact" | "comfortable" | "spacious"))
            .unwrap_or_else(|| "comfortable".into());
        let pos_layout = client
            .query_opt("SELECT value FROM app_meta WHERE key = 'pos_layout'", &[])?
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
            receipt_title,
            receipt_subtitle,
            show_invoice_logo,
            ticket_width_chars,
            barcode_label_width_mm,
            barcode_label_height_mm,
            barcode_darkness,
            barcode_speed,
            ui_font_scale,
            ui_zoom,
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
    let ui_zoom = input.ui_zoom.clamp(80, 125);
    let ticket_width_chars = input.ticket_width_chars.clamp(24, 48);
    let barcode_label_width_mm = input.barcode_label_width_mm.clamp(20, 100);
    let barcode_label_height_mm = input.barcode_label_height_mm.clamp(10, 80);
    let barcode_darkness = input.barcode_darkness.clamp(1, 5);
    if !matches!(input.barcode_speed.as_str(), "slow" | "normal" | "fast") {
        return Err(AppError::Message("Vitesse code-barres invalide".into()));
    }
    if !matches!(
        input.ui_density.as_str(),
        "compact" | "comfortable" | "spacious"
    ) {
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
             VALUES ('receipt_title', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&input.receipt_title.trim()],
        )?;
        client.execute(
            "INSERT INTO app_meta (key, value)
             VALUES ('receipt_subtitle', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&input.receipt_subtitle.trim()],
        )?;
        let show_invoice_logo = if input.show_invoice_logo {
            "true"
        } else {
            "false"
        };
        client.execute(
            "INSERT INTO app_meta (key, value)
             VALUES ('show_invoice_logo', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&show_invoice_logo],
        )?;
        let ticket_width_chars_value = ticket_width_chars.to_string();
        client.execute(
            "INSERT INTO app_meta (key, value)
             VALUES ('ticket_width_chars', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&ticket_width_chars_value],
        )?;
        let barcode_label_width_value = barcode_label_width_mm.to_string();
        client.execute(
            "INSERT INTO app_meta (key, value)
             VALUES ('barcode_label_width_mm', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&barcode_label_width_value],
        )?;
        let barcode_label_height_value = barcode_label_height_mm.to_string();
        client.execute(
            "INSERT INTO app_meta (key, value)
             VALUES ('barcode_label_height_mm', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&barcode_label_height_value],
        )?;
        let barcode_darkness_value = barcode_darkness.to_string();
        client.execute(
            "INSERT INTO app_meta (key, value)
             VALUES ('barcode_darkness', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&barcode_darkness_value],
        )?;
        client.execute(
            "INSERT INTO app_meta (key, value)
             VALUES ('barcode_speed', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&input.barcode_speed.as_str()],
        )?;
        client.execute(
            "INSERT INTO app_meta (key, value)
             VALUES ('ui_font_scale', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&input.ui_font_scale.as_str()],
        )?;
        let ui_zoom_value = ui_zoom.to_string();
        client.execute(
            "INSERT INTO app_meta (key, value)
             VALUES ('ui_zoom', $1)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            &[&ui_zoom_value],
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
            ui_zoom,
            ticket_width_chars,
            barcode_label_width_mm,
            barcode_label_height_mm,
            barcode_darkness,
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
                "-Sta",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                r#"
                Add-Type -AssemblyName System.Drawing
                [System.Drawing.Printing.PrinterSettings]::InstalledPrinters |
                  ForEach-Object { $_ }
                "#,
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
pub fn print_receipt_text(
    db: State<Database>,
    content: String,
    qr_data_url: String,
) -> AppResult<()> {
    if content.trim().is_empty() {
        return Err(AppError::Message("Ticket vide".into()));
    }
    let settings = get_app_settings(db)?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::Message(error.to_string()))?
        .as_millis();
    let path = std::env::temp_dir().join(format!("payla-outfit-ticket-{timestamp}.txt"));
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(content.as_bytes());
    fs::write(&path, bytes)?;

    if let Err(error) = print_file(
        &path,
        settings.invoice_printer.as_str(),
        qr_data_url.as_str(),
        settings.ticket_width_chars,
    ) {
        let _ = fs::remove_file(&path);
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
pub fn print_barcode_labels(db: State<Database>, input: BarcodePrintInput) -> AppResult<()> {
    if input.barcode.trim().is_empty() {
        return Err(AppError::Message("Code-barres vide".into()));
    }
    let count = input.count.clamp(1, 200);
    let barcode = sanitize_code128(&input.barcode);
    if barcode.is_empty() {
        return Err(AppError::Message(
            "Le code-barres doit contenir au moins un caractere ASCII lisible".into(),
        ));
    }
    let settings = get_app_settings(db)?;
    ensure_printer_available(settings.barcode_printer.as_str())?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::Message(error.to_string()))?
        .as_millis();
    let script_path = std::env::temp_dir().join(format!("payla-outfit-barcode-{timestamp}.ps1"));
    write_utf8_bom(&script_path, barcode_print_script())?;

    let output = hide_console(&mut Command::new("powershell.exe"))
        .args(["-NoProfile", "-Sta", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&script_path)
        .arg(settings.barcode_printer.as_str())
        .arg(input.product_name)
        .arg(barcode)
        .arg(format!("{:.2}", input.price))
        .arg(count.to_string())
        .arg(settings.barcode_label_width_mm.to_string())
        .arg(settings.barcode_label_height_mm.to_string())
        .arg(settings.barcode_darkness.to_string())
        .arg(settings.barcode_speed.as_str())
        .output()?;
    let _ = fs::remove_file(&script_path);
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(AppError::Message(if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "Impossible d'imprimer les etiquettes code-barres".into()
        }))
    }
}

#[cfg(target_os = "windows")]
fn print_file(
    path: &std::path::Path,
    printer_name: &str,
    qr_data_url: &str,
    ticket_width_chars: i64,
) -> AppResult<()> {
    ensure_printer_available(printer_name)?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::Message(error.to_string()))?
        .as_millis();

    let script_path = std::env::temp_dir().join(format!("payla-outfit-receipt-{timestamp}.ps1"));

    write_utf8_bom(&script_path, receipt_print_script())?;

    let output = hide_console(&mut Command::new("powershell.exe"))
        .args(["-NoProfile", "-Sta", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&script_path)
        .arg(path)
        .arg(printer_name.trim())
        .arg(qr_data_url.trim())
        .arg(ticket_width_chars.clamp(24, 48).to_string())
        .output();

    let _ = fs::remove_file(&script_path);
    let _ = fs::remove_file(path);

    let output = output?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

        Err(AppError::Message(if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "Impossible d'imprimer le ticket avec l'imprimante selectionnee".into()
        }))
    }
}

#[cfg(target_os = "windows")]
fn receipt_print_script() -> &'static str {
    r#"
param(
  [string]$Path,
  [string]$PrinterName,
  [string]$QrDataUrl,
  [int]$TicketWidthChars
)

$ErrorActionPreference = 'Stop'

[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$installedPrinters = @(
  [System.Drawing.Printing.PrinterSettings]::InstalledPrinters |
  ForEach-Object { $_ }
)

if ($installedPrinters.Count -eq 0) {
  throw "Aucune imprimante disponible"
}

if (-not [string]::IsNullOrWhiteSpace($PrinterName)) {
  $foundPrinter = $false

  foreach ($printer in $installedPrinters) {
    if ($printer -eq $PrinterName) {
      $foundPrinter = $true
      break
    }
  }

  if (-not $foundPrinter) {
    throw ("Imprimante introuvable: '" + $PrinterName + "'. Imprimantes disponibles: " + ($installedPrinters -join ", "))
  }
}

if (-not [System.IO.File]::Exists($Path)) {
  throw ("Fichier ticket introuvable: " + $Path)
}

$content = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
$lines = @($content -split "`r?`n")
$qrImage = $null
$qrStream = $null

if (-not [string]::IsNullOrWhiteSpace($QrDataUrl)) {
  $qrBase64 = $QrDataUrl
  if ($QrDataUrl -match '^data:image/[^;]+;base64,(.+)$') {
    $qrBase64 = $Matches[1]
  }
  $qrBytes = [Convert]::FromBase64String($qrBase64)
  $qrStream = New-Object System.IO.MemoryStream(,$qrBytes)
  $qrImage = [System.Drawing.Image]::FromStream($qrStream)
}

$doc = New-Object System.Drawing.Printing.PrintDocument

if (-not [string]::IsNullOrWhiteSpace($PrinterName)) {
  $doc.PrinterSettings.PrinterName = $PrinterName
}

if (-not $doc.PrinterSettings.IsValid) {
  throw ("Imprimante invalide ou indisponible: '" + $PrinterName + "'. Imprimantes disponibles: " + ($installedPrinters -join ", "))
}

$doc.DocumentName = "POS receipt"
$doc.OriginAtMargins = $false

# Match the configured character width to common thermal paper sizes.
[float]$receiptWidthMm = if ($TicketWidthChars -le 24) { 40.0 } elseif ($TicketWidthChars -le 32) { 58.0 } else { 80.0 }

# Layout.
[float]$leftMarginMm = 3.0
[float]$rightMarginMm = 3.0
[float]$topMarginMm = 3.0
[float]$bottomMarginMm = 5.0
[float]$lineHeightMm = 4.0

[int]$lineCount = [Math]::Max(1, $lines.Count)

[float]$receiptHeightMm = $topMarginMm + $bottomMarginMm + ($lineHeightMm * $lineCount)

if ($null -ne $qrImage) {
  $receiptHeightMm = $receiptHeightMm + 32.0
}

# Add small feed at bottom.
$receiptHeightMm = $receiptHeightMm + 8.0

# PaperSize uses hundredths of an inch.
[int]$paperWidth = [Math]::Round(($receiptWidthMm / 25.4) * 100)
[int]$paperHeight = [Math]::Round(($receiptHeightMm / 25.4) * 100)

if ($paperHeight -lt 100) {
  $paperHeight = 100
}

$paper = New-Object System.Drawing.Printing.PaperSize("POS Receipt", $paperWidth, $paperHeight)
$doc.DefaultPageSettings.PaperSize = $paper
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)

$font = New-Object System.Drawing.Font("Consolas", 8, [System.Drawing.FontStyle]::Regular)
$brush = [System.Drawing.Brushes]::Black

$stringFormat = New-Object System.Drawing.StringFormat
$stringFormat.Alignment = [System.Drawing.StringAlignment]::Near
$stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Near
$stringFormat.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap

$doc.add_PrintPage({
  param($sender, $event)

  $g = $event.Graphics
  $g.PageUnit = [System.Drawing.GraphicsUnit]::Pixel
  $g.Clear([System.Drawing.Color]::White)

  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit

  [float]$pxPerMmX = $g.DpiX / 25.4
  [float]$pxPerMmY = $g.DpiY / 25.4

  [float]$x = $leftMarginMm * $pxPerMmX
  [float]$y = $topMarginMm * $pxPerMmY
  [float]$contentW = ($receiptWidthMm - $leftMarginMm - $rightMarginMm) * $pxPerMmX
  [float]$lineH = $lineHeightMm * $pxPerMmY

  foreach ($line in $lines) {
    $rect = New-Object System.Drawing.RectangleF(
      $x,
      $y,
      $contentW,
      $lineH
    )

    $g.DrawString(
      [string]$line,
      $font,
      $brush,
      $rect,
      $stringFormat
    )

    $y = $y + $lineH
  }

  if ($null -ne $qrImage) {
    # The QR source is generated at exactly 6 pixels per module. Scale every
    # module to an integer number of printer pixels to keep edges uniform.
    [int]$moduleCount = [Math]::Max(1, [Math]::Round($qrImage.Width / 6.0))
    [int]$maxQrPixels = [Math]::Floor([Math]::Min(28.0 * $pxPerMmX, $contentW))
    [int]$pixelsPerModule = [Math]::Max(3, [Math]::Floor($maxQrPixels / $moduleCount))
    [int]$qrSize = $moduleCount * $pixelsPerModule
    [int]$qrX = [Math]::Round($x + (($contentW - $qrSize) / 2.0))
    [int]$qrY = [Math]::Round($y + (2.0 * $pxPerMmY))
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $destination = New-Object System.Drawing.Rectangle($qrX, $qrY, $qrSize, $qrSize)
    $g.DrawImage(
      $qrImage,
      $destination,
      0,
      0,
      $qrImage.Width,
      $qrImage.Height,
      [System.Drawing.GraphicsUnit]::Pixel
    )
  }

  $event.HasMorePages = $false
})

$doc.Print()

if ($null -ne $qrImage) { $qrImage.Dispose() }
if ($null -ne $qrStream) { $qrStream.Dispose() }

Remove-Item -LiteralPath $Path -ErrorAction SilentlyContinue
"#
}

fn sanitize_code128(value: &str) -> String {
    value
        .chars()
        .filter(|ch| {
            let code = *ch as u32;
            (32..=126).contains(&code)
        })
        .collect::<String>()
        .trim()
        .to_string()
}

fn barcode_print_script() -> &'static str {
    r#"
param(
  [string]$PrinterName,
  [string]$ProductName,
  [string]$Barcode,
  [string]$Price,
  [int]$Count,
  [int]$LabelWidthMm,
  [int]$LabelHeightMm,
  [int]$Darkness,
  [string]$Speed
)

$ErrorActionPreference = 'Stop'

[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$installedPrinters = @(
  [System.Drawing.Printing.PrinterSettings]::InstalledPrinters |
  ForEach-Object { $_ }
)

if ($installedPrinters.Count -eq 0) {
  throw "Aucune imprimante disponible"
}

if (-not [string]::IsNullOrWhiteSpace($PrinterName)) {
  $foundPrinter = $false

  foreach ($printer in $installedPrinters) {
    if ($printer -eq $PrinterName) {
      $foundPrinter = $true
      break
    }
  }

  if (-not $foundPrinter) {
    throw ("Imprimante introuvable: '" + $PrinterName + "'. Imprimantes disponibles: " + ($installedPrinters -join ", "))
  }
}

$patterns = @(
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112"
)

function Get-Code128Patterns([string]$value) {
  $codes = New-Object System.Collections.Generic.List[int]

  # Code 128 auto mode:
  # - Start in Set B for mixed text.
  # - Switch to Set C for long numeric chunks so small 40x20mm labels remain scannable.
  $codes.Add(104)
  $set = "B"
  $i = 0

  while ($i -lt $value.Length) {
    $remaining = $value.Substring($i)

    if ($remaining -match '^\d{4,}') {
      $digitRun = [regex]::Match($remaining, '^\d+').Value
      if (($digitRun.Length % 2) -eq 1) {
        $digitRun = $digitRun.Substring(0, $digitRun.Length - 1)
      }

      if ($digitRun.Length -ge 4) {
        if ($set -ne "C") {
          $codes.Add(99)
          $set = "C"
        }

        for ($pairIndex = 0; $pairIndex -lt $digitRun.Length; $pairIndex += 2) {
          $codes.Add([int]$digitRun.Substring($pairIndex, 2))
        }

        $i += $digitRun.Length
        continue
      }
    }

    if ($set -ne "B") {
      $codes.Add(100)
      $set = "B"
    }

    $code = [int][char]$value[$i]
    if ($code -lt 32 -or $code -gt 126) {
      $i += 1
      continue
    }

    $codes.Add($code - 32)
    $i += 1
  }

  $checksum = 104

  for ($i = 1; $i -lt $codes.Count; $i++) {
    $checksum += $codes[$i] * $i
  }

  $codes.Add($checksum % 103)

  # Stop code
  $codes.Add(106)

  return $codes | ForEach-Object { $patterns[$_] }
}

function Get-Ean8Bits([string]$value) {
  $left = @(
    "0001101","0011001","0010011","0111101","0100011",
    "0110001","0101111","0111011","0110111","0001011"
  )
  $right = @(
    "1110010","1100110","1101100","1000010","1011100",
    "1001110","1010000","1000100","1001000","1110100"
  )

  $bits = "101"
  for ($i = 0; $i -lt 4; $i++) {
    $bits += $left[[int]::Parse([string]$value[$i])]
  }
  $bits += "01010"
  for ($i = 4; $i -lt 8; $i++) {
    $bits += $right[[int]::Parse([string]$value[$i])]
  }
  return $bits + "101"
}

$doc = New-Object System.Drawing.Printing.PrintDocument

if (-not [string]::IsNullOrWhiteSpace($PrinterName)) {
  $doc.PrinterSettings.PrinterName = $PrinterName
}

if (-not $doc.PrinterSettings.IsValid) {
  throw ("Imprimante invalide ou indisponible: '" + $PrinterName + "'. Imprimantes disponibles: " + ($installedPrinters -join ", "))
}

$doc.DocumentName = "POS barcode labels"
$doc.OriginAtMargins = $false
$doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController

# Prefer the highest real resolution exposed by the selected thermal printer.
$availableResolutions = @($doc.PrinterSettings.PrinterResolutions |
  Where-Object { $_.X -gt 0 -and $_.Y -gt 0 } |
  Sort-Object { $_.X * $_.Y } -Descending)
$bestResolution = $null
if ($availableResolutions.Count -gt 0) {
  if ($Speed -eq "fast") {
    $bestResolution = $availableResolutions[-1]
  } elseif ($Speed -eq "normal") {
    $bestResolution = $availableResolutions |
      Sort-Object { [Math]::Abs($_.X - 203) + [Math]::Abs($_.Y - 203) } |
      Select-Object -First 1
  } else {
    $bestResolution = $availableResolutions[0]
  }
}
if ($null -ne $bestResolution) {
  $doc.DefaultPageSettings.PrinterResolution = $bestResolution
}

# Label size comes from app settings.
[float]$labelWidthMm = [Math]::Max(20, $LabelWidthMm)
[float]$labelHeightMm = [Math]::Max(10, $LabelHeightMm)
[float]$gapMm = 2.0

[int]$safeCount = [Math]::Max(1, [int]$Count)

# PaperSize uses hundredths of an inch.
[int]$paperWidth = [Math]::Round(($labelWidthMm / 25.4) * 100)
[int]$singleLabelHeight = [Math]::Round(($labelHeightMm / 25.4) * 100)
[int]$gapHeight = [Math]::Round(($gapMm / 25.4) * 100)

# Continuous page height = labels + physical gaps
[int]$paperHeight = ($singleLabelHeight * $safeCount) + ($gapHeight * ($safeCount - 1))

$paper = New-Object System.Drawing.Printing.PaperSize("40x20mm Barcode Continuous", $paperWidth, $paperHeight)
$doc.DefaultPageSettings.PaperSize = $paper
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)

# Compact fonts for 40x20mm
$fontTitle = New-Object System.Drawing.Font("Arial", 4, [System.Drawing.FontStyle]::Bold)
$fontSmall = New-Object System.Drawing.Font("Consolas", 4, [System.Drawing.FontStyle]::Regular)
$fontPrice = New-Object System.Drawing.Font("Arial", 5, [System.Drawing.FontStyle]::Bold)

$safeDarkness = [Math]::Max(1, [Math]::Min(5, $Darkness))
$inkValue = switch ($safeDarkness) {
  1 { 112 }
  2 { 72 }
  3 { 40 }
  4 { 16 }
  default { 0 }
}
$inkColor = [System.Drawing.Color]::FromArgb($inkValue, $inkValue, $inkValue)
$brush = New-Object System.Drawing.SolidBrush($inkColor)

$titleFormat = New-Object System.Drawing.StringFormat
$titleFormat.Alignment = [System.Drawing.StringAlignment]::Center
$titleFormat.LineAlignment = [System.Drawing.StringAlignment]::Near
$titleFormat.Trimming = [System.Drawing.StringTrimming]::EllipsisCharacter
$titleFormat.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap

$centerFormat = New-Object System.Drawing.StringFormat
$centerFormat.Alignment = [System.Drawing.StringAlignment]::Center
$centerFormat.LineAlignment = [System.Drawing.StringAlignment]::Near

$isEan8 = $Barcode -match '^\d{8}$'
$ean8Bits = if ($isEan8) { Get-Ean8Bits $Barcode } else { "" }
$patternsForCode = if ($isEan8) { @() } else { @(Get-Code128Patterns $Barcode) }

[int]$totalUnits = if ($isEan8) { $ean8Bits.Length } else { 0 }

if (-not $isEan8) {
  foreach ($pattern in $patternsForCode) {
    foreach ($digit in $pattern.ToCharArray()) {
      $totalUnits = $totalUnits + [int]::Parse([string]$digit)
    }
  }
}

$doc.add_PrintPage({
  param($sender, $event)

  $g = $event.Graphics
  $g.PageUnit = [System.Drawing.GraphicsUnit]::Pixel
  $g.Clear([System.Drawing.Color]::White)

  # Sharp barcode rendering
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::None
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit

  # Convert mm to printer pixels
  [float]$pxPerMmX = $g.DpiX / 25.4
  [float]$pxPerMmY = $g.DpiY / 25.4

  [float]$labelW = $labelWidthMm * $pxPerMmX
  [float]$labelH = $labelHeightMm * $pxPerMmY
  [float]$gapH = $gapMm * $pxPerMmY

  # Safe horizontal margins
  [float]$leftMarginMm = 0.5
  [float]$rightMarginMm = 0.5

  [float]$contentX = $leftMarginMm * $pxPerMmX
  [float]$contentW = $labelW - (($leftMarginMm + $rightMarginMm) * $pxPerMmX)

  # Fine horizontal correction.
  # Positive = move right, negative = move left.
  [float]$xCorrectionMm = 0.0
  $contentX = $contentX + ($xCorrectionMm * $pxPerMmX)

  # Vertical positions inside 20mm label.
  # Keep the barcode tall and simple; tiny decorations make scanners struggle.
  [float]$titleYmm = 0.3
  [float]$titleHmm = 1.7

  [float]$barYmm = 2.2
  [float]$barHmm = 8.0

  [float]$barcodeTextYmm = 10.6
  [float]$barcodeTextHmm = 1.8

  [float]$priceYmm = 13.0
  [float]$priceHmm = 2.0

  # Fine vertical correction inside each label.
  # Positive = move content down, negative = move up.
  [float]$yCorrectionMm = 0.0

  # Barcode width
  # Use almost the full 40mm label while preserving 2.5mm quiet zones.
  # Integer printer pixels keep every module exactly the same width.
  [float]$quietZonesW = 5.0 * $pxPerMmX
  [int]$unit = [Math]::Floor((($contentW - $quietZonesW) / $totalUnits) + 0.01)

  if ($unit -lt 1) {
    $unit = 1
  }

  [float]$actualBarcodeW = $totalUnits * $unit

  for ([int]$labelIndex = 0; $labelIndex -lt $safeCount; $labelIndex++) {
    # IMPORTANT:
    # Each next label starts after label height + physical gap.
    [float]$baseY = $labelIndex * ($labelH + $gapH)

    # Product name
    $titleRect = New-Object System.Drawing.RectangleF(
      $contentX,
      ($baseY + (($titleYmm + $yCorrectionMm) * $pxPerMmY)),
      $contentW,
      ($titleHmm * $pxPerMmY)
    )

    $g.DrawString(
      [string]$ProductName,
      $fontTitle,
      $brush,
      $titleRect,
      $titleFormat
    )

    # Barcode
    [int]$x = [Math]::Round($contentX + (($contentW - $actualBarcodeW) / 2))
    [int]$barY = [Math]::Round($baseY + (($barYmm + $yCorrectionMm) * $pxPerMmY))
    [int]$barH = [Math]::Max(1, [Math]::Floor($barHmm * $pxPerMmY))

    if ($isEan8) {
      foreach ($bit in $ean8Bits.ToCharArray()) {
        if ($bit -eq '1') {
          $g.FillRectangle($brush, $x, $barY, $unit, $barH)
        }
        $x = $x + $unit
      }
    } else {
      foreach ($pattern in $patternsForCode) {
        for ([int]$i = 0; $i -lt $pattern.Length; $i++) {
          [int]$w = [int]::Parse([string]$pattern[$i]) * $unit

          if (($i % 2) -eq 0) {
            $g.FillRectangle($brush, $x, $barY, $w, $barH)
          }

          $x = $x + $w
        }
      }
    }

    # Barcode number
    $barcodeTextRect = New-Object System.Drawing.RectangleF(
      $contentX,
      ($baseY + (($barcodeTextYmm + $yCorrectionMm) * $pxPerMmY)),
      $contentW,
      ($barcodeTextHmm * $pxPerMmY)
    )

    $g.DrawString(
      [string]$Barcode,
      $fontSmall,
      $brush,
      $barcodeTextRect,
      $centerFormat
    )

    # Price
    $priceRect = New-Object System.Drawing.RectangleF(
      $contentX,
      ($baseY + (($priceYmm + $yCorrectionMm) * $pxPerMmY)),
      $contentW,
      ($priceHmm * $pxPerMmY)
    )

    $g.DrawString(
      ("DA " + [string]$Price),
      $fontPrice,
      $brush,
      $priceRect,
      $centerFormat
    )
  }

  # Print all labels on one continuous page.
  # This avoids page-by-page feed/skip.
  $event.HasMorePages = $false
})

$doc.Print()

$brush.Dispose()

Remove-Item -LiteralPath $PSCommandPath -ErrorAction SilentlyContinue
"#
}

#[cfg(not(target_os = "windows"))]
fn print_file(
    path: &std::path::Path,
    printer_name: &str,
    _qr_data_url: &str,
    _ticket_width_chars: i64,
) -> AppResult<()> {
    let mut command = Command::new("lp");
    if !printer_name.trim().is_empty() {
        command.arg("-d").arg(printer_name.trim());
    }
    command.arg(path).spawn()?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn ensure_printer_available(printer_name: &str) -> AppResult<()> {
    let printer_name = printer_name.trim();

    let script = r#"
Add-Type -AssemblyName System.Drawing

$printerName = $args[0]

$printers = @(
  [System.Drawing.Printing.PrinterSettings]::InstalledPrinters |
  ForEach-Object { $_ }
)

if ([string]::IsNullOrWhiteSpace($printerName)) {
  if ($printers.Count -gt 0) {
    exit 0
  } else {
    Write-Error "Aucune imprimante disponible"
    exit 1
  }
}

$found = $false
foreach ($p in $printers) {
  if ($p -eq $printerName) {
    $found = $true
    break
  }
}

if ($found) {
  exit 0
} else {
  Write-Error ("Imprimante introuvable: '" + $printerName + "'. Disponibles: " + ($printers -join ", "))
  exit 1
}
"#;

    let output = hide_console(&mut Command::new("powershell.exe"))
        .args([
            "-NoProfile",
            "-Sta",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .arg(printer_name)
        .output()?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

        Err(AppError::Message(if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else if printer_name.is_empty() {
            "Aucune imprimante disponible".into()
        } else {
            format!("Imprimante introuvable: {}", printer_name)
        }))
    }
}

#[cfg(not(target_os = "windows"))]
fn ensure_printer_available(printer_name: &str) -> AppResult<()> {
    let printer_name = printer_name.trim();
    if printer_name.is_empty() {
        return Ok(());
    }

    let output = Command::new("lpstat").arg("-a").output()?;
    if !output.status.success() {
        return Err(AppError::Message("Aucune imprimante disponible".into()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout
        .lines()
        .filter_map(|line| line.split_whitespace().next())
        .any(|name| name == printer_name)
    {
        Ok(())
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
            TRUNCATE TABLE vault_debt_payments, vault_debts, vault_movements,
              supplier_payments, purchase_order_items, purchase_orders, suppliers,
              stock_movements, credit_payments, sale_items, sales, expenses, products, cash_shifts
              RESTART IDENTITY CASCADE;

            INSERT INTO products
              (id, name, barcode, category, size, color, quantity, low_stock_threshold, purchase_price, sale_price, image_data)
            VALUES
              (1, 'Robe satin noire', 'PO-DEMO-001', 'Robes', 'M', 'Noir', 18, 4, 1800, 3400, ''),
              (2, 'Ensemble coton creme', 'PO-DEMO-002', 'Ensembles', 'L', 'Creme', 22, 5, 1400, 2800, ''),
              (3, 'Robe maison fleurie', 'PO-DEMO-003', 'Robes', 'M', 'Rose', 8, 3, 2100, 4300, ''),
              (4, 'Escarpins soft', 'PO-DEMO-004', 'Chaussures', '38', 'Beige', 5, 4, 700, 1600, ''),
              (5, 'Sac cadeau boutique', 'PO-DEMO-005', 'Accessoires', 'Standard', 'Or', 35, 8, 120, 350, ''),
              (6, 'Kimono premium', 'PO-DEMO-006', 'Kimonos', 'XL', 'Olive', 3, 4, 3200, 6500, ''),
              (7, 'Foulard satin', 'PO-DEMO-007', 'Accessoires', 'Standard', 'Blanc', 16, 5, 650, 1500, ''),
              (8, 'Pochette elegante', 'PO-DEMO-008', 'Sacs', 'Petit', 'Ambre', 9, 3, 1900, 4200, '');

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
              (1, 'PO-DEMO-0001', 6200, 0, 6200, 3200, 'Especes', 'cash', '', '', 6200, 0, '', '', 'paid', 'Administrateur', NOW() - INTERVAL '6 days'),
              (2, 'PO-DEMO-0002', 8600, 200, 8400, 4200, 'Especes', 'credit', 'Samira', '0555000001', 6000, 2400, '', 'Client fidele', 'partial', 'Administrateur', NOW() - INTERVAL '4 days'),
              (3, 'PO-DEMO-0003', 6150, 0, 6150, 2780, 'Especes', 'cash', '', '', 6150, 0, '', '', 'paid', 'Administrateur', NOW() - INTERVAL '1 day'),
              (4, 'PO-DEMO-0004', 10800, 0, 10800, 5200, 'Especes', 'credit', 'Nadia', '0555000002', 4000, 6800, '', 'A payer fin semaine', 'partial', 'Administrateur', NOW()),
              (5, 'PO-DEMO-0005', 3150, 0, 3150, 1730, 'Especes', 'cash', '', '', 3150, 0, '', '', 'paid', 'Administrateur', NOW());

            INSERT INTO sale_items
              (sale_id, product_id, product_name, barcode, quantity, unit_price, purchase_price, line_total)
            VALUES
              (1, 1, 'Robe satin noire', 'PO-DEMO-001', 1, 3400, 1800, 3400),
              (1, 2, 'Ensemble coton creme', 'PO-DEMO-002', 1, 2800, 1400, 2800),
              (2, 3, 'Robe maison fleurie', 'PO-DEMO-003', 2, 4300, 2100, 8600),
              (3, 7, 'Foulard satin', 'PO-DEMO-007', 3, 1500, 650, 4500),
              (3, 4, 'Escarpins soft', 'PO-DEMO-004', 1, 1600, 700, 1600),
              (3, 5, 'Sac cadeau boutique', 'PO-DEMO-005', 1, 50, 20, 50),
              (4, 6, 'Kimono premium', 'PO-DEMO-006', 1, 6500, 3200, 6500),
              (4, 8, 'Pochette elegante', 'PO-DEMO-008', 1, 4200, 1900, 4200),
              (4, 5, 'Sac cadeau boutique', 'PO-DEMO-005', 1, 100, 20, 100),
              (5, 2, 'Ensemble coton creme', 'PO-DEMO-002', 1, 2800, 1400, 2800),
              (5, 5, 'Sac cadeau boutique', 'PO-DEMO-005', 1, 350, 120, 350);

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
    let path = std::env::temp_dir().join(format!("payla-outfit-drawer-{timestamp}.bin"));
    fs::write(&path, pulse)?;

    if let Err(error) = print_file(
        &path,
        settings.invoice_printer.as_str(),
        "",
        settings.ticket_width_chars,
    ) {
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
              vault_debt_payments,
              vault_debts,
              vault_movements,
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
