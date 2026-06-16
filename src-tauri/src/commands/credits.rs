use postgres::{Client, Row};
use tauri::State;

use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::models::{CreditAccount, CreditPayment, CreditPaymentInput, Sale};

#[tauri::command]
pub fn list_credits(db: State<Database>) -> AppResult<Vec<CreditAccount>> {
    db.with_client(|client| {
        let rows = client.query(
            "SELECT id, receipt_no, subtotal, discount, total, profit, payment_method,
                    sale_type, customer_name, customer_phone, paid_amount, remaining_amount,
                    due_date, credit_note, credit_status, cashier, created_at::text
             FROM sales
             WHERE sale_type = 'credit'
             ORDER BY remaining_amount DESC, id DESC",
            &[],
        )?;

        let mut accounts = Vec::new();
        for row in rows {
            let mut sale = super::sales::sale_from_row(&row);
            sale.items = super::sales::list_sale_items(client, sale.id)?;
            let payments = list_payments(client, sale.id)?;
            accounts.push(CreditAccount { sale, payments });
        }
        Ok(accounts)
    })
}

#[tauri::command]
pub fn add_credit_payment(
    db: State<Database>,
    input: CreditPaymentInput,
) -> AppResult<CreditAccount> {
    if input.amount <= 0.0 {
        return Err(AppError::Message("Montant de versement invalide".into()));
    }

    db.with_client(|client| {
        let shift_id = super::shifts::require_open_shift(client)?;
        let mut tx = client.transaction()?;
        let remaining: f64 = tx
            .query_one(
                "SELECT remaining_amount FROM sales WHERE id = $1 AND sale_type = 'credit'",
                &[&input.sale_id],
            )?
            .get(0);

        if remaining <= 0.0 {
            return Err(AppError::Message("Credit deja solde".into()));
        }
        if input.amount > remaining {
            return Err(AppError::Message(
                "Le versement depasse le reste a payer".into(),
            ));
        }

        tx.execute(
            "INSERT INTO credit_payments (shift_id, sale_id, amount, note, cashier)
             VALUES ($1, $2, $3, $4, $5)",
            &[
                &shift_id,
                &input.sale_id,
                &input.amount,
                &input.note.trim(),
                &input.cashier.trim(),
            ],
        )?;

        let new_remaining = (remaining - input.amount).max(0.0);
        let status = if new_remaining <= 0.0 {
            "paid"
        } else {
            "partial"
        };
        tx.execute(
            "UPDATE sales
             SET paid_amount = paid_amount + $1,
                 remaining_amount = $2,
                 credit_status = $3
             WHERE id = $4",
            &[&input.amount, &new_remaining, &status, &input.sale_id],
        )?;
        tx.commit()?;
        load_credit_account(client, input.sale_id)
    })
}

fn load_credit_account(client: &mut Client, sale_id: i64) -> AppResult<CreditAccount> {
    let row = client.query_one(
        "SELECT id, receipt_no, subtotal, discount, total, profit, payment_method,
                sale_type, customer_name, customer_phone, paid_amount, remaining_amount,
                due_date, credit_note, credit_status, cashier, created_at::text
         FROM sales WHERE id = $1",
        &[&sale_id],
    )?;
    let mut sale: Sale = super::sales::sale_from_row(&row);
    sale.items = super::sales::list_sale_items(client, sale.id)?;
    Ok(CreditAccount {
        payments: list_payments(client, sale.id)?,
        sale,
    })
}

fn list_payments(client: &mut Client, sale_id: i64) -> AppResult<Vec<CreditPayment>> {
    let rows = client.query(
        "SELECT id, sale_id, amount, note, paid_at::text, cashier
         FROM credit_payments WHERE sale_id = $1 ORDER BY id DESC",
        &[&sale_id],
    )?;
    Ok(rows.iter().map(payment_from_row).collect())
}

fn payment_from_row(row: &Row) -> CreditPayment {
    CreditPayment {
        id: row.get(0),
        sale_id: row.get(1),
        amount: row.get(2),
        note: row.get(3),
        paid_at: row.get(4),
        cashier: row.get(5),
    }
}
