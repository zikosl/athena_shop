use postgres::{Client, Row};
use tauri::State;

use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::models::{
    VaultDashboard, VaultDebt, VaultDebtInput, VaultDebtPayment, VaultDebtPaymentInput,
    VaultMovement, VaultMovementInput,
};

#[tauri::command]
pub fn get_vault_dashboard(db: State<Database>) -> AppResult<VaultDashboard> {
    db.with_client(|client| {
        let cash_in_total: f64 = client
            .query_one(
                "SELECT COALESCE(SUM(amount), 0) FROM vault_movements WHERE movement_type = 'in'",
                &[],
            )?
            .get(0);
        let cash_out_total: f64 = client
            .query_one(
                "SELECT COALESCE(SUM(amount), 0) FROM vault_movements WHERE movement_type = 'out'",
                &[],
            )?
            .get(0);
        let manual_receivable: f64 = client
            .query_one(
                "SELECT COALESCE(SUM(GREATEST(d.principal_amount - COALESCE(p.paid_amount, 0), 0)), 0)
                 FROM vault_debts d
                 LEFT JOIN (
                   SELECT debt_id, SUM(amount) AS paid_amount FROM vault_debt_payments GROUP BY debt_id
                 ) p ON p.debt_id = d.id
                 WHERE d.debt_type = 'receivable'",
                &[],
            )?
            .get(0);
        let manual_payable: f64 = client
            .query_one(
                "SELECT COALESCE(SUM(GREATEST(d.principal_amount - COALESCE(p.paid_amount, 0), 0)), 0)
                 FROM vault_debts d
                 LEFT JOIN (
                   SELECT debt_id, SUM(amount) AS paid_amount FROM vault_debt_payments GROUP BY debt_id
                 ) p ON p.debt_id = d.id
                 WHERE d.debt_type = 'payable'",
                &[],
            )?
            .get(0);
        let sales_credit_remaining: f64 = client
            .query_one(
                "SELECT COALESCE(SUM(remaining_amount), 0)
                 FROM sales WHERE sale_type = 'credit' AND credit_status <> 'paid'",
                &[],
            )?
            .get(0);
        let supplier_remaining: f64 = client
            .query_one(
                "SELECT COALESCE(SUM(remaining_amount), 0) FROM purchase_orders",
                &[],
            )?
            .get(0);
        let active_debts_count: i64 = client
            .query_one(
                "SELECT COUNT(*)
                 FROM vault_debts d
                 LEFT JOIN (
                   SELECT debt_id, SUM(amount) AS paid_amount FROM vault_debt_payments GROUP BY debt_id
                 ) p ON p.debt_id = d.id
                 WHERE GREATEST(d.principal_amount - COALESCE(p.paid_amount, 0), 0) > 0",
                &[],
            )?
            .get(0);
        let overdue_debts_count: i64 = client
            .query_one(
                "SELECT COUNT(*)
                 FROM vault_debts d
                 LEFT JOIN (
                   SELECT debt_id, SUM(amount) AS paid_amount FROM vault_debt_payments GROUP BY debt_id
                 ) p ON p.debt_id = d.id
                 WHERE d.due_date <> ''
                   AND d.due_date < CURRENT_DATE::text
                   AND GREATEST(d.principal_amount - COALESCE(p.paid_amount, 0), 0) > 0",
                &[],
            )?
            .get(0);
        let recent_movements = list_vault_movements_inner(client)?
            .into_iter()
            .take(8)
            .collect::<Vec<_>>();
        let debts = list_vault_debts_inner(client)?
            .into_iter()
            .filter(|debt| debt.status != "paid")
            .collect::<Vec<_>>();
        let total_receivable = manual_receivable + sales_credit_remaining;
        let total_payable = manual_payable + supplier_remaining;
        let cash_balance = cash_in_total - cash_out_total;

        Ok(VaultDashboard {
            cash_balance,
            cash_in_total,
            cash_out_total,
            manual_receivable,
            manual_payable,
            sales_credit_remaining,
            supplier_remaining,
            total_receivable,
            total_payable,
            net_position: cash_balance + total_receivable - total_payable,
            active_debts_count,
            overdue_debts_count,
            recent_movements,
            debts,
        })
    })
}

#[tauri::command]
pub fn list_vault_movements(db: State<Database>) -> AppResult<Vec<VaultMovement>> {
    db.with_client(list_vault_movements_inner)
}

#[tauri::command]
pub fn save_vault_movement(
    db: State<Database>,
    input: VaultMovementInput,
) -> AppResult<VaultMovement> {
    if input.movement_type != "in" && input.movement_type != "out" {
        return Err(AppError::Message("Type de mouvement invalide".into()));
    }
    if input.label.trim().is_empty() || !input.amount.is_finite() || input.amount <= 0.0 {
        return Err(AppError::Message("Libelle et montant valides obligatoires".into()));
    }
    if input.cashier.trim().is_empty() {
        return Err(AppError::Message("Caissier obligatoire".into()));
    }

    db.with_client(|client| {
        let id: i64 = if let Some(id) = input.id {
            client.execute(
                "UPDATE vault_movements
                 SET movement_type = $1, label = $2, amount = $3, note = $4, cashier = $5
                 WHERE id = $6",
                &[
                    &input.movement_type,
                    &input.label.trim(),
                    &input.amount,
                    &input.note.trim(),
                    &input.cashier.trim(),
                    &id,
                ],
            )?;
            id
        } else {
            client
                .query_one(
                    "INSERT INTO vault_movements (movement_type, label, amount, note, cashier)
                     VALUES ($1, $2, $3, $4, $5) RETURNING id",
                    &[
                        &input.movement_type,
                        &input.label.trim(),
                        &input.amount,
                        &input.note.trim(),
                        &input.cashier.trim(),
                    ],
                )?
                .get(0)
        };
        get_vault_movement(client, id)
    })
}

#[tauri::command]
pub fn delete_vault_movement(db: State<Database>, id: i64) -> AppResult<()> {
    db.with_client(|client| {
        client.execute("DELETE FROM vault_movements WHERE id = $1", &[&id])?;
        Ok(())
    })
}

#[tauri::command]
pub fn list_vault_debts(db: State<Database>) -> AppResult<Vec<VaultDebt>> {
    db.with_client(list_vault_debts_inner)
}

#[tauri::command]
pub fn save_vault_debt(db: State<Database>, input: VaultDebtInput) -> AppResult<VaultDebt> {
    if input.debt_type != "receivable" && input.debt_type != "payable" {
        return Err(AppError::Message("Type de dette invalide".into()));
    }
    if input.party_name.trim().is_empty()
        || !input.principal_amount.is_finite()
        || input.principal_amount <= 0.0
    {
        return Err(AppError::Message("Nom et montant valides obligatoires".into()));
    }

    db.with_client(|client| {
        let paid_amount = if let Some(id) = input.id {
            paid_amount_for_debt(client, id)?
        } else {
            0.0
        };
        if input.principal_amount < paid_amount {
            return Err(AppError::Message(
                "Le montant ne peut pas etre inferieur aux versements".into(),
            ));
        }

        let id: i64 = if let Some(id) = input.id {
            client.execute(
                "UPDATE vault_debts
                 SET party_name = $1, phone = $2, debt_type = $3, principal_amount = $4,
                     due_date = $5, note = $6, updated_at = NOW()
                 WHERE id = $7",
                &[
                    &input.party_name.trim(),
                    &input.phone.trim(),
                    &input.debt_type,
                    &input.principal_amount,
                    &input.due_date.trim(),
                    &input.note.trim(),
                    &id,
                ],
            )?;
            id
        } else {
            client
                .query_one(
                    "INSERT INTO vault_debts (party_name, phone, debt_type, principal_amount, due_date, note)
                     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
                    &[
                        &input.party_name.trim(),
                        &input.phone.trim(),
                        &input.debt_type,
                        &input.principal_amount,
                        &input.due_date.trim(),
                        &input.note.trim(),
                    ],
                )?
                .get(0)
        };
        get_vault_debt(client, id)
    })
}

#[tauri::command]
pub fn delete_vault_debt(db: State<Database>, id: i64) -> AppResult<()> {
    db.with_client(|client| {
        client.execute("DELETE FROM vault_debts WHERE id = $1", &[&id])?;
        Ok(())
    })
}

#[tauri::command]
pub fn add_vault_debt_payment(
    db: State<Database>,
    input: VaultDebtPaymentInput,
) -> AppResult<VaultDebt> {
    if !input.amount.is_finite() || input.amount <= 0.0 {
        return Err(AppError::Message("Montant de versement invalide".into()));
    }
    if input.cashier.trim().is_empty() {
        return Err(AppError::Message("Caissier obligatoire".into()));
    }

    db.with_client(|client| {
        let debt = get_vault_debt(client, input.debt_id)?;
        if debt.remaining_amount <= 0.0 {
            return Err(AppError::Message("Dette deja soldee".into()));
        }
        if input.amount > debt.remaining_amount {
            return Err(AppError::Message(
                "Le versement depasse le reste a payer".into(),
            ));
        }
        client.execute(
            "INSERT INTO vault_debt_payments (debt_id, amount, note, cashier)
             VALUES ($1, $2, $3, $4)",
            &[
                &input.debt_id,
                &input.amount,
                &input.note.trim(),
                &input.cashier.trim(),
            ],
        )?;
        client.execute(
            "UPDATE vault_debts SET updated_at = NOW() WHERE id = $1",
            &[&input.debt_id],
        )?;
        get_vault_debt(client, input.debt_id)
    })
}

#[tauri::command]
pub fn delete_vault_debt_payment(
    db: State<Database>,
    debt_id: i64,
    payment_id: i64,
) -> AppResult<VaultDebt> {
    db.with_client(|client| {
        client.execute(
            "DELETE FROM vault_debt_payments WHERE id = $1 AND debt_id = $2",
            &[&payment_id, &debt_id],
        )?;
        client.execute(
            "UPDATE vault_debts SET updated_at = NOW() WHERE id = $1",
            &[&debt_id],
        )?;
        get_vault_debt(client, debt_id)
    })
}

fn list_vault_movements_inner(client: &mut Client) -> AppResult<Vec<VaultMovement>> {
    let rows = client.query(
        "SELECT id, movement_type, label, amount, note, cashier, created_at::text
         FROM vault_movements ORDER BY created_at DESC, id DESC",
        &[],
    )?;
    Ok(rows.iter().map(vault_movement_from_row).collect())
}

fn get_vault_movement(client: &mut Client, id: i64) -> AppResult<VaultMovement> {
    let row = client.query_one(
        "SELECT id, movement_type, label, amount, note, cashier, created_at::text
         FROM vault_movements WHERE id = $1",
        &[&id],
    )?;
    Ok(vault_movement_from_row(&row))
}

fn list_vault_debts_inner(client: &mut Client) -> AppResult<Vec<VaultDebt>> {
    let rows = client.query(
        "SELECT d.id, d.party_name, d.phone, d.debt_type, d.principal_amount,
                COALESCE(SUM(p.amount), 0) AS paid_amount,
                GREATEST(d.principal_amount - COALESCE(SUM(p.amount), 0), 0) AS remaining_amount,
                d.due_date, d.note, d.created_at::text, d.updated_at::text
         FROM vault_debts d
         LEFT JOIN vault_debt_payments p ON p.debt_id = d.id
         GROUP BY d.id
         ORDER BY d.updated_at DESC, d.id DESC",
        &[],
    )?;
    let mut debts = Vec::new();
    for row in rows {
        debts.push(vault_debt_from_row(client, &row)?);
    }
    Ok(debts)
}

fn get_vault_debt(client: &mut Client, id: i64) -> AppResult<VaultDebt> {
    let row = client.query_one(
        "SELECT d.id, d.party_name, d.phone, d.debt_type, d.principal_amount,
                COALESCE(SUM(p.amount), 0) AS paid_amount,
                GREATEST(d.principal_amount - COALESCE(SUM(p.amount), 0), 0) AS remaining_amount,
                d.due_date, d.note, d.created_at::text, d.updated_at::text
         FROM vault_debts d
         LEFT JOIN vault_debt_payments p ON p.debt_id = d.id
         WHERE d.id = $1
         GROUP BY d.id",
        &[&id],
    )?;
    vault_debt_from_row(client, &row)
}

fn paid_amount_for_debt(client: &mut Client, id: i64) -> AppResult<f64> {
    Ok(client
        .query_one(
            "SELECT COALESCE(SUM(amount), 0) FROM vault_debt_payments WHERE debt_id = $1",
            &[&id],
        )?
        .get(0))
}

fn vault_movement_from_row(row: &Row) -> VaultMovement {
    VaultMovement {
        id: row.get(0),
        movement_type: row.get(1),
        label: row.get(2),
        amount: row.get(3),
        note: row.get(4),
        cashier: row.get(5),
        created_at: row.get(6),
    }
}

fn vault_debt_from_row(client: &mut Client, row: &Row) -> AppResult<VaultDebt> {
    let id: i64 = row.get(0);
    let paid_amount: f64 = row.get(5);
    let remaining_amount: f64 = row.get(6);
    let status = if remaining_amount <= 0.0 {
        "paid"
    } else if paid_amount > 0.0 {
        "partial"
    } else {
        "open"
    }
    .to_string();

    Ok(VaultDebt {
        id,
        party_name: row.get(1),
        phone: row.get(2),
        debt_type: row.get(3),
        principal_amount: row.get(4),
        paid_amount,
        remaining_amount,
        status,
        due_date: row.get(7),
        note: row.get(8),
        created_at: row.get(9),
        updated_at: row.get(10),
        payments: list_vault_debt_payments(client, id)?,
    })
}

fn list_vault_debt_payments(client: &mut Client, debt_id: i64) -> AppResult<Vec<VaultDebtPayment>> {
    let rows = client.query(
        "SELECT id, debt_id, amount, note, cashier, paid_at::text
         FROM vault_debt_payments WHERE debt_id = $1 ORDER BY paid_at DESC, id DESC",
        &[&debt_id],
    )?;
    Ok(rows.iter().map(|row| VaultDebtPayment {
        id: row.get(0),
        debt_id: row.get(1),
        amount: row.get(2),
        note: row.get(3),
        cashier: row.get(4),
        paid_at: row.get(5),
    }).collect())
}
