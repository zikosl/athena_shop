use tauri::State;

use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::models::{ClientInput, ClientRecord};

#[tauri::command]
pub fn list_clients(db: State<Database>) -> AppResult<Vec<ClientRecord>> {
    db.with_client(|client| {
        let rows = client.query(
            "SELECT id, name, phone, created_at::text FROM clients ORDER BY name, id",
            &[],
        )?;
        Ok(rows
            .iter()
            .map(|row| ClientRecord {
                id: row.get(0),
                name: row.get(1),
                phone: row.get(2),
                created_at: row.get(3),
            })
            .collect())
    })
}

#[tauri::command]
pub fn save_client(db: State<Database>, input: ClientInput) -> AppResult<ClientRecord> {
    let name = input.name.trim().to_string();
    let phone = normalize_phone(&input.phone);
    if name.is_empty() || name.chars().count() > 100 {
        return Err(AppError::Message(
            "اسم العميل مطلوب (100 حرف كحد أقصى)".into(),
        ));
    }
    if !(9..=12).contains(&phone.len()) {
        return Err(AppError::Message("أدخل رقم هاتف صحيحًا".into()));
    }
    db.with_client(|client| {
        let row = client.query_one(
            "INSERT INTO clients (name, phone) VALUES ($1, $2)
             ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
             RETURNING id, name, phone, created_at::text",
            &[&name, &phone],
        )?;
        Ok(ClientRecord {
            id: row.get(0),
            name: row.get(1),
            phone: row.get(2),
            created_at: row.get(3),
        })
    })
}

fn normalize_phone(value: &str) -> String {
    let mut digits: String = value.chars().filter(char::is_ascii_digit).collect();
    if let Some(local) = digits.strip_prefix("00213") {
        digits = format!("0{local}");
    } else if digits.starts_with("213") && digits.len() == 12 {
        digits = format!("0{}", &digits[3..]);
    }
    digits
}
