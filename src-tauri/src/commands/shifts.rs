use chrono::{Local, NaiveTime};
use postgres::{Client, Row};
use tauri::State;

use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::models::{CashShift, CloseShiftInput, OpenShiftInput};

#[tauri::command]
pub fn current_shift(db: State<Database>) -> AppResult<Option<CashShift>> {
    db.with_client(|client| {
        auto_close_due_shift(client)?;
        current_shift_for_client(client)
    })
}

#[tauri::command]
pub fn open_shift(db: State<Database>, input: OpenShiftInput) -> AppResult<CashShift> {
    if input.opening_amount < 0.0 {
        return Err(AppError::Message("Montant d'ouverture invalide".into()));
    }
    if input.cashier.trim().is_empty() {
        return Err(AppError::Message("Caissier obligatoire".into()));
    }
    let close_time = NaiveTime::parse_from_str(input.auto_close_time.trim(), "%H:%M")
        .map_err(|_| AppError::Message("Heure fermeture invalide".into()))?;

    db.with_client(|client| {
        auto_close_due_shift(client)?;
        if current_shift_for_client(client)?.is_some() {
            return Err(AppError::Message("Une caisse est deja ouverte".into()));
        }

        let now = Local::now();
        let today_close = now.date_naive().and_time(close_time);
        let close_at = if today_close <= now.naive_local() {
            today_close + chrono::Duration::days(1)
        } else {
            today_close
        };
        let row = client.query_one(
            "INSERT INTO cash_shifts (opening_amount, auto_close_at, cashier)
             VALUES ($1, $2, $3)
             RETURNING id",
            &[&input.opening_amount, &close_at, &input.cashier.trim()],
        )?;
        get_shift(client, row.get(0))
    })
}

#[tauri::command]
pub fn close_shift(db: State<Database>, input: CloseShiftInput) -> AppResult<CashShift> {
    if input.closing_amount < 0.0 {
        return Err(AppError::Message("Montant fermeture invalide".into()));
    }
    db.with_client(|client| {
        client.execute(
            "UPDATE cash_shifts
             SET status = 'closed', closed_at = COALESCE(closed_at, NOW()), closing_amount = $1
             WHERE id = $2 AND status = 'open'",
            &[&input.closing_amount, &input.id],
        )?;
        get_shift(client, input.id)
    })
}

pub fn require_open_shift(client: &mut Client) -> AppResult<i64> {
    auto_close_due_shift(client)?;
    current_shift_for_client(client)?
        .map(|shift| shift.id)
        .ok_or_else(|| AppError::Message("Ouvrez la caisse avant de continuer".into()))
}

pub fn optional_open_shift_id(client: &mut Client) -> AppResult<Option<i64>> {
    auto_close_due_shift(client)?;
    Ok(current_shift_for_client(client)?.map(|shift| shift.id))
}

pub fn auto_close_due_shift(client: &mut Client) -> AppResult<()> {
    let rows = client.query(
        "SELECT id FROM cash_shifts WHERE status = 'open' AND auto_close_at <= NOW()",
        &[],
    )?;
    for row in rows {
        let id: i64 = row.get(0);
        let expected = get_shift(client, id)?.expected_amount;
        client.execute(
            "UPDATE cash_shifts
             SET status = 'closed', closed_at = auto_close_at, closing_amount = $1
             WHERE id = $2 AND status = 'open'",
            &[&expected, &id],
        )?;
    }
    Ok(())
}

fn current_shift_for_client(client: &mut Client) -> AppResult<Option<CashShift>> {
    let row = client.query_opt(
        "SELECT id FROM cash_shifts WHERE status = 'open' ORDER BY id DESC LIMIT 1",
        &[],
    )?;
    match row {
        Some(row) => Ok(Some(get_shift(client, row.get(0))?)),
        None => Ok(None),
    }
}

fn get_shift(client: &mut Client, id: i64) -> AppResult<CashShift> {
    let row = client.query_one(
        "WITH sale_payment_totals AS (
           SELECT sale_id, COALESCE(SUM(amount), 0)::float8 AS amount
           FROM credit_payments GROUP BY sale_id
         ),
         sales_totals AS (
           SELECT shift_id,
                  COALESCE(SUM(CASE WHEN sale_type = 'cash' THEN total ELSE GREATEST(paid_amount - COALESCE(spt.amount, 0), 0) END), 0)::float8 AS amount
           FROM sales s
           LEFT JOIN sale_payment_totals spt ON spt.sale_id = s.id
           GROUP BY shift_id
         ),
         payment_totals AS (
           SELECT shift_id, COALESCE(SUM(amount), 0)::float8 AS amount FROM credit_payments GROUP BY shift_id
         ),
         expense_totals AS (
           SELECT shift_id, COALESCE(SUM(amount), 0)::float8 AS amount FROM expenses GROUP BY shift_id
         )
         SELECT cs.id, cs.opened_at::text, COALESCE(cs.closed_at::text, ''), cs.auto_close_at::text,
                cs.opening_amount, cs.closing_amount,
                cs.opening_amount + COALESCE(st.amount, 0) + COALESCE(pt.amount, 0) - COALESCE(et.amount, 0),
                COALESCE(st.amount, 0), COALESCE(pt.amount, 0), COALESCE(et.amount, 0),
                cs.status, cs.cashier
         FROM cash_shifts cs
         LEFT JOIN sales_totals st ON st.shift_id = cs.id
         LEFT JOIN payment_totals pt ON pt.shift_id = cs.id
         LEFT JOIN expense_totals et ON et.shift_id = cs.id
         WHERE cs.id = $1",
        &[&id],
    )?;
    Ok(shift_from_row(&row))
}

fn shift_from_row(row: &Row) -> CashShift {
    CashShift {
        id: row.get(0),
        opened_at: row.get(1),
        closed_at: row.get(2),
        auto_close_at: row.get(3),
        opening_amount: row.get(4),
        closing_amount: row.get(5),
        expected_amount: row.get(6),
        cash_sales: row.get(7),
        credit_payments: row.get(8),
        expenses: row.get(9),
        status: row.get(10),
        cashier: row.get(11),
    }
}
