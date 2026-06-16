use chrono::NaiveDate;
use postgres::Row;
use tauri::State;

use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::models::{Expense, ExpenseInput};

#[tauri::command]
pub fn list_expenses(db: State<Database>) -> AppResult<Vec<Expense>> {
    db.with_client(|client| {
        let rows = client.query(
            "SELECT id, label, category, amount, note, expense_date::text, created_at::text
             FROM expenses ORDER BY expense_date DESC, id DESC",
            &[],
        )?;
        Ok(rows.iter().map(expense_from_row).collect())
    })
}

#[tauri::command]
pub fn save_expense(db: State<Database>, input: ExpenseInput) -> AppResult<Expense> {
    if input.label.trim().is_empty() || input.amount <= 0.0 {
        return Err(AppError::Message(
            "Libelle et montant valides obligatoires".into(),
        ));
    }
    if input.expense_date.trim().is_empty() {
        return Err(AppError::Message("Date obligatoire".into()));
    }

    let label = input.label.trim().to_string();
    let category = if input.category.trim().is_empty() {
        "Boutique".to_string()
    } else {
        input.category.trim().to_string()
    };
    let note = input.note.trim().to_string();
    let expense_date = NaiveDate::parse_from_str(input.expense_date.trim(), "%Y-%m-%d")
        .map_err(|_| AppError::Message("Date invalide".into()))?;

    db.with_client(|client| {
        let shift_id = super::shifts::optional_open_shift_id(client)?;
        let id: i64 = if let Some(id) = input.id {
            client.execute(
                "UPDATE expenses SET label = $1, category = $2, amount = $3, note = $4, expense_date = $5
                 WHERE id = $6",
                &[
                    &label,
                    &category,
                    &input.amount,
                    &note,
                    &expense_date,
                    &id,
                ],
            )?;
            id
        } else {
            client
                .query_one(
                    "INSERT INTO expenses (shift_id, label, category, amount, note, expense_date)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     RETURNING id",
                    &[
                        &shift_id,
                        &label,
                        &category,
                        &input.amount,
                        &note,
                        &expense_date,
                    ],
                )?
                .get(0)
        };
        get_expense(client, id)
    })
}

#[tauri::command]
pub fn delete_expense(db: State<Database>, id: i64) -> AppResult<()> {
    db.with_client(|client| {
        client.execute("DELETE FROM expenses WHERE id = $1", &[&id])?;
        Ok(())
    })
}

fn get_expense(client: &mut postgres::Client, id: i64) -> AppResult<Expense> {
    let row = client.query_one(
        "SELECT id, label, category, amount, note, expense_date::text, created_at::text
         FROM expenses WHERE id = $1",
        &[&id],
    )?;
    Ok(expense_from_row(&row))
}

fn expense_from_row(row: &Row) -> Expense {
    Expense {
        id: row.get(0),
        label: row.get(1),
        category: row.get(2),
        amount: row.get(3),
        note: row.get(4),
        expense_date: row.get(5),
        created_at: row.get(6),
    }
}
