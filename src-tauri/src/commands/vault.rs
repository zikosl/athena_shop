use chrono::Local;
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
        let movements = list_movements(client, Some(8))?;
        let debts = list_debts_with_payments(client)?;
        let balance_row = client.query_one(
            "SELECT
               COALESCE(SUM(CASE WHEN movement_type = 'in' THEN amount ELSE 0 END), 0)::float8,
               COALESCE(SUM(CASE WHEN movement_type = 'out' THEN amount ELSE 0 END), 0)::float8
             FROM vault_movements",
            &[],
        )?;
        let cash_in_total: f64 = balance_row.get(0);
        let cash_out_total: f64 = balance_row.get(1);
        let manual_receivable: f64 = debts
            .iter()
            .filter(|debt| debt.debt_type == "receivable")
            .map(|debt| debt.remaining_amount)
            .sum();
        let manual_payable: f64 = debts
            .iter()
            .filter(|debt| debt.debt_type == "payable")
            .map(|debt| debt.remaining_amount)
            .sum();
        let sales_credit_remaining: f64 = client
            .query_one(
                "SELECT COALESCE(SUM(remaining_amount), 0)::float8
                 FROM sales WHERE sale_type = 'credit' AND remaining_amount > 0",
                &[],
            )?
            .get(0);
        let supplier_remaining: f64 = client
            .query_one(
                "SELECT COALESCE(SUM(remaining_amount), 0)::float8
                 FROM purchase_orders WHERE status <> 'draft' AND remaining_amount > 0",
                &[],
            )?
            .get(0);
        let today = Local::now().date_naive().to_string();
        let active_debts_count = debts.iter().filter(|debt| debt.remaining_amount > 0.0).count() as i64;
        let overdue_debts_count = debts
            .iter()
            .filter(|debt| {
                debt.remaining_amount > 0.0
                    && !debt.due_date.trim().is_empty()
                    && debt.due_date < today
            })
            .count() as i64;
        let total_receivable = manual_receivable + sales_credit_remaining;
        let total_payable = manual_payable + supplier_remaining;

        Ok(VaultDashboard {
            cash_balance: cash_in_total - cash_out_total,
            cash_in_total,
            cash_out_total,
            manual_receivable,
            manual_payable,
            sales_credit_remaining,
            supplier_remaining,
            total_receivable,
            total_payable,
            net_position: cash_in_total - cash_out_total + total_receivable - total_payable,
            active_debts_count,
            overdue_debts_count,
            recent_movements: movements,
            debts,
        })
    })
}

#[tauri::command]
pub fn list_vault_movements(db: State<Database>) -> AppResult<Vec<VaultMovement>> {
    db.with_client(|client| list_movements(client, None))
}

#[tauri::command]
pub fn save_vault_movement(
    db: State<Database>,
    input: VaultMovementInput,
) -> AppResult<VaultMovement> {
    validate_movement(&input)?;
    let movement_type = input.movement_type.trim().to_string();
    let label = input.label.trim().to_string();
    let note = input.note.trim().to_string();
    let cashier = input.cashier.trim().to_string();

    db.with_client(|client| {
        let id: i64 = if let Some(id) = input.id {
            client.execute(
                "UPDATE vault_movements
                 SET movement_type = $1, label = $2, amount = $3, note = $4, cashier = $5
                 WHERE id = $6",
                &[&movement_type, &label, &input.amount, &note, &cashier, &id],
            )?;
            id
        } else {
            client
                .query_one(
                    "INSERT INTO vault_movements (movement_type, label, amount, note, cashier)
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING id",
                    &[&movement_type, &label, &input.amount, &note, &cashier],
                )?
                .get(0)
        };
        get_movement(client, id)
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
    db.with_client(list_debts_with_payments)
}

#[tauri::command]
pub fn save_vault_debt(db: State<Database>, input: VaultDebtInput) -> AppResult<VaultDebt> {
    validate_debt(&input)?;
    let party_name = input.party_name.trim().to_string();
    let phone = input.phone.trim().to_string();
    let debt_type = input.debt_type.trim().to_string();
    let due_date = input.due_date.trim().to_string();
    let note = input.note.trim().to_string();

    db.with_client(|client| {
        let id: i64 = if let Some(id) = input.id {
            let paid_amount: f64 = client
                .query_one(
                    "SELECT COALESCE(SUM(amount), 0)::float8 FROM vault_debt_payments WHERE debt_id = $1",
                    &[&id],
                )?
                .get(0);
            if input.principal_amount < paid_amount {
                return Err(AppError::Message(
                    "Le montant initial ne peut pas etre inferieur aux versements".into(),
                ));
            }
            client.execute(
                "UPDATE vault_debts
                 SET party_name = $1, phone = $2, debt_type = $3, principal_amount = $4,
                     paid_amount = $5, due_date = $6, note = $7, updated_at = NOW()
                 WHERE id = $8",
                &[
                    &party_name,
                    &phone,
                    &debt_type,
                    &input.principal_amount,
                    &paid_amount,
                    &due_date,
                    &note,
                    &id,
                ],
            )?;
            id
        } else {
            client
                .query_one(
                    "INSERT INTO vault_debts
                       (party_name, phone, debt_type, principal_amount, due_date, note)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     RETURNING id",
                    &[
                        &party_name,
                        &phone,
                        &debt_type,
                        &input.principal_amount,
                        &due_date,
                        &note,
                    ],
                )?
                .get(0)
        };
        get_debt(client, id)
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
        let remaining: f64 = client
            .query_one(
                "SELECT principal_amount - paid_amount FROM vault_debts WHERE id = $1",
                &[&input.debt_id],
            )?
            .get(0);
        if remaining <= 0.0 {
            return Err(AppError::Message("Dette deja soldee".into()));
        }
        if input.amount > remaining {
            return Err(AppError::Message(
                "Le versement depasse le reste a payer".into(),
            ));
        }

        let mut tx = client.transaction()?;
        tx.execute(
            "INSERT INTO vault_debt_payments (debt_id, amount, note, cashier)
             VALUES ($1, $2, $3, $4)",
            &[
                &input.debt_id,
                &input.amount,
                &input.note.trim(),
                &input.cashier.trim(),
            ],
        )?;
        tx.execute(
            "UPDATE vault_debts
             SET paid_amount = paid_amount + $1, updated_at = NOW()
             WHERE id = $2",
            &[&input.amount, &input.debt_id],
        )?;
        tx.commit()?;
        get_debt(client, input.debt_id)
    })
}

#[tauri::command]
pub fn delete_vault_debt_payment(db: State<Database>, id: i64) -> AppResult<VaultDebt> {
    db.with_client(|client| {
        let row = client.query_one(
            "SELECT debt_id, amount FROM vault_debt_payments WHERE id = $1",
            &[&id],
        )?;
        let debt_id: i64 = row.get(0);
        let amount: f64 = row.get(1);
        let mut tx = client.transaction()?;
        tx.execute("DELETE FROM vault_debt_payments WHERE id = $1", &[&id])?;
        tx.execute(
            "UPDATE vault_debts
             SET paid_amount = GREATEST(paid_amount - $1, 0), updated_at = NOW()
             WHERE id = $2",
            &[&amount, &debt_id],
        )?;
        tx.commit()?;
        get_debt(client, debt_id)
    })
}

fn validate_movement(input: &VaultMovementInput) -> AppResult<()> {
    if input.movement_type != "in" && input.movement_type != "out" {
        return Err(AppError::Message("Type de mouvement invalide".into()));
    }
    if input.label.trim().is_empty() {
        return Err(AppError::Message("Libelle obligatoire".into()));
    }
    if !input.amount.is_finite() || input.amount <= 0.0 {
        return Err(AppError::Message("Montant invalide".into()));
    }
    if input.cashier.trim().is_empty() {
        return Err(AppError::Message("Caissier obligatoire".into()));
    }
    Ok(())
}

fn validate_debt(input: &VaultDebtInput) -> AppResult<()> {
    if input.debt_type != "receivable" && input.debt_type != "payable" {
        return Err(AppError::Message("Type de dette invalide".into()));
    }
    if input.party_name.trim().is_empty() {
        return Err(AppError::Message("Nom obligatoire".into()));
    }
    if !input.principal_amount.is_finite() || input.principal_amount <= 0.0 {
        return Err(AppError::Message("Montant invalide".into()));
    }
    Ok(())
}

fn list_movements(client: &mut Client, limit: Option<i64>) -> AppResult<Vec<VaultMovement>> {
    let query = if limit.is_some() {
        "SELECT id, movement_type, label, amount, note, cashier, created_at::text
         FROM vault_movements ORDER BY created_at DESC, id DESC LIMIT $1"
    } else {
        "SELECT id, movement_type, label, amount, note, cashier, created_at::text
         FROM vault_movements ORDER BY created_at DESC, id DESC"
    };
    let rows = if let Some(limit) = limit {
        client.query(query, &[&limit])?
    } else {
        client.query(query, &[])?
    };
    Ok(rows.iter().map(movement_from_row).collect())
}

fn get_movement(client: &mut Client, id: i64) -> AppResult<VaultMovement> {
    let row = client.query_one(
        "SELECT id, movement_type, label, amount, note, cashier, created_at::text
         FROM vault_movements WHERE id = $1",
        &[&id],
    )?;
    Ok(movement_from_row(&row))
}

fn movement_from_row(row: &Row) -> VaultMovement {
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

fn list_debts_with_payments(client: &mut Client) -> AppResult<Vec<VaultDebt>> {
    let rows = client.query(
        "SELECT id, party_name, phone, debt_type, principal_amount, paid_amount,
                due_date, note, created_at::text, updated_at::text
         FROM vault_debts
         ORDER BY (principal_amount - paid_amount) DESC, updated_at DESC, id DESC",
        &[],
    )?;
    let mut debts = Vec::new();
    for row in rows {
        let mut debt = debt_from_row(&row);
        debt.payments = list_payments(client, debt.id)?;
        debts.push(debt);
    }
    Ok(debts)
}

fn get_debt(client: &mut Client, id: i64) -> AppResult<VaultDebt> {
    let row = client.query_one(
        "SELECT id, party_name, phone, debt_type, principal_amount, paid_amount,
                due_date, note, created_at::text, updated_at::text
         FROM vault_debts WHERE id = $1",
        &[&id],
    )?;
    let mut debt = debt_from_row(&row);
    debt.payments = list_payments(client, debt.id)?;
    Ok(debt)
}

fn debt_from_row(row: &Row) -> VaultDebt {
    let principal_amount: f64 = row.get(4);
    let paid_amount: f64 = row.get(5);
    let remaining_amount = (principal_amount - paid_amount).max(0.0);
    VaultDebt {
        id: row.get(0),
        party_name: row.get(1),
        phone: row.get(2),
        debt_type: row.get(3),
        principal_amount,
        paid_amount,
        remaining_amount,
        status: if remaining_amount <= 0.0 {
            "paid".into()
        } else if paid_amount > 0.0 {
            "partial".into()
        } else {
            "open".into()
        },
        due_date: row.get(6),
        note: row.get(7),
        created_at: row.get(8),
        updated_at: row.get(9),
        payments: Vec::new(),
    }
}

fn list_payments(client: &mut Client, debt_id: i64) -> AppResult<Vec<VaultDebtPayment>> {
    let rows = client.query(
        "SELECT id, debt_id, amount, note, cashier, paid_at::text
         FROM vault_debt_payments WHERE debt_id = $1 ORDER BY paid_at DESC, id DESC",
        &[&debt_id],
    )?;
    Ok(rows.iter().map(payment_from_row).collect())
}

fn payment_from_row(row: &Row) -> VaultDebtPayment {
    VaultDebtPayment {
        id: row.get(0),
        debt_id: row.get(1),
        amount: row.get(2),
        note: row.get(3),
        cashier: row.get(4),
        paid_at: row.get(5),
    }
}
