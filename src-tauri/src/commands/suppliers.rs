use postgres::{Client, Row};
use tauri::State;

use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::models::{
    PurchaseOrder, PurchaseOrderInput, PurchaseOrderItem, PurchaseOrderItemInput, Supplier,
    SupplierInput, SupplierPayment, SupplierPaymentInput,
};

use super::shifts::require_open_shift;

#[tauri::command]
pub fn list_suppliers(db: State<Database>) -> AppResult<Vec<Supplier>> {
    db.with_client(|client| {
        let rows = client.query(
            "SELECT s.id, s.name, s.phone, s.address, s.note, s.active,
                    COALESCE(SUM(CASE WHEN po.status <> 'draft' THEN po.subtotal ELSE 0 END), 0)::float8 AS total_purchases,
                    COALESCE(SUM(CASE WHEN po.status <> 'draft' THEN po.paid_amount ELSE 0 END), 0)::float8 AS total_paid,
                    COALESCE(SUM(CASE WHEN po.status <> 'draft' THEN po.remaining_amount ELSE 0 END), 0)::float8 AS remaining_amount,
                    COALESCE(MAX(CASE WHEN po.status <> 'draft' THEN po.confirmed_at::text ELSE NULL END), '') AS last_purchase_at,
                    s.created_at::text
             FROM suppliers s
             LEFT JOIN purchase_orders po ON po.supplier_id = s.id
             GROUP BY s.id
             ORDER BY s.active DESC, remaining_amount DESC, s.name",
            &[],
        )?;
        Ok(rows.iter().map(supplier_from_row).collect())
    })
}

#[tauri::command]
pub fn save_supplier(db: State<Database>, input: SupplierInput) -> AppResult<Supplier> {
    if input.name.trim().is_empty() {
        return Err(AppError::Message("اسم المورد إجباري".into()));
    }
    db.with_client(|client| {
        let id = if let Some(id) = input.id {
            client.execute(
                "UPDATE suppliers
                 SET name = $1, phone = $2, address = $3, note = $4, active = $5
                 WHERE id = $6",
                &[
                    &input.name.trim(),
                    &input.phone.trim(),
                    &input.address.trim(),
                    &input.note.trim(),
                    &input.active,
                    &id,
                ],
            )?;
            id
        } else {
            client
                .query_one(
                    "INSERT INTO suppliers (name, phone, address, note, active)
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING id",
                    &[
                        &input.name.trim(),
                        &input.phone.trim(),
                        &input.address.trim(),
                        &input.note.trim(),
                        &input.active,
                    ],
                )?
                .get(0)
        };
        get_supplier(client, id)
    })
}

#[tauri::command]
pub fn disable_supplier(db: State<Database>, id: i64) -> AppResult<Supplier> {
    db.with_client(|client| {
        client.execute("UPDATE suppliers SET active = FALSE WHERE id = $1", &[&id])?;
        get_supplier(client, id)
    })
}

#[tauri::command]
pub fn list_purchase_orders(db: State<Database>) -> AppResult<Vec<PurchaseOrder>> {
    db.with_client(|client| {
        let rows = client.query(
            "SELECT po.id FROM purchase_orders po ORDER BY po.created_at DESC, po.id DESC LIMIT 120",
            &[],
        )?;
        rows.iter()
            .map(|row| get_purchase_order_for_client(client, row.get(0)))
            .collect()
    })
}

#[tauri::command]
pub fn get_purchase_order(db: State<Database>, id: i64) -> AppResult<PurchaseOrder> {
    db.with_client(|client| get_purchase_order_for_client(client, id))
}

#[tauri::command]
pub fn save_purchase_order_draft(
    db: State<Database>,
    input: PurchaseOrderInput,
) -> AppResult<PurchaseOrder> {
    db.with_client(|client| {
        validate_purchase_input(client, &input)?;
        let subtotal = purchase_subtotal(&input.items);
        let id = if let Some(id) = input.id {
            let status: String = client
                .query_one("SELECT status FROM purchase_orders WHERE id = $1", &[&id])?
                .get(0);
            if status != "draft" {
                return Err(AppError::Message(
                    "لا يمكن تعديل قسيمة شراء مؤكد".into(),
                ));
            }
            client.execute(
                "UPDATE purchase_orders
                 SET supplier_id = $1, subtotal = $2, paid_amount = 0, remaining_amount = $2,
                     note = $3, cashier = $4
                 WHERE id = $5",
                &[
                    &input.supplier_id,
                    &subtotal,
                    &input.note.trim(),
                    &input.cashier.trim(),
                    &id,
                ],
            )?;
            client.execute(
                "DELETE FROM purchase_order_items WHERE purchase_order_id = $1",
                &[&id],
            )?;
            id
        } else {
            let bon_no = next_bon_no(client)?;
            client
                .query_one(
                    "INSERT INTO purchase_orders
                     (bon_no, supplier_id, subtotal, paid_amount, remaining_amount, status, note, cashier)
                     VALUES ($1, $2, $3, 0, $3, 'draft', $4, $5)
                     RETURNING id",
                    &[
                        &bon_no,
                        &input.supplier_id,
                        &subtotal,
                        &input.note.trim(),
                        &input.cashier.trim(),
                    ],
                )?
                .get(0)
        };
        insert_purchase_items(client, id, &input.items)?;
        get_purchase_order_for_client(client, id)
    })
}

#[tauri::command]
pub fn confirm_purchase_order(
    db: State<Database>,
    id: i64,
    paid_amount: f64,
    cashier: String,
) -> AppResult<PurchaseOrder> {
    if paid_amount < 0.0 {
        return Err(AppError::Message("مبلغ الدفع غير صالح".into()));
    }
    if cashier.trim().is_empty() {
        return Err(AppError::Message("اسم المستخدم إجباري".into()));
    }
    db.with_client(|client| {
        let status: String = client
            .query_one("SELECT status FROM purchase_orders WHERE id = $1", &[&id])?
            .get(0);
        if status != "draft" {
            return Err(AppError::Message("تم تأكيد هذا البون من قبل".into()));
        }
        let order = get_purchase_order_for_client(client, id)?;
        if order.items.is_empty() {
            return Err(AppError::Message("أضف منتجات قبل تأكيد البون".into()));
        }
        if paid_amount > order.subtotal {
            return Err(AppError::Message("مبلغ الدفع أكبر من قيمة البون".into()));
        }

        for item in &order.items {
            apply_purchase_stock(client, id, item)?;
        }

        let remaining = (order.subtotal - paid_amount).max(0.0);
        let status = if remaining <= 0.0 {
            "paid"
        } else {
            "confirmed"
        };
        client.execute(
            "UPDATE purchase_orders
             SET paid_amount = $1, remaining_amount = $2, status = $3,
                 cashier = $4, confirmed_at = NOW()
             WHERE id = $5",
            &[&paid_amount, &remaining, &status, &cashier.trim(), &id],
        )?;
        if paid_amount > 0.0 {
            insert_supplier_payment(client, id, paid_amount, "دفعة عند تأكيد البون", &cashier)?;
        }
        get_purchase_order_for_client(client, id)
    })
}

#[tauri::command]
pub fn add_supplier_payment(
    db: State<Database>,
    input: SupplierPaymentInput,
) -> AppResult<PurchaseOrder> {
    if input.amount <= 0.0 {
        return Err(AppError::Message(
            "مبلغ الدفع يجب أن يكون أكبر من صفر".into(),
        ));
    }
    if input.cashier.trim().is_empty() {
        return Err(AppError::Message("اسم المستخدم إجباري".into()));
    }
    db.with_client(|client| {
        let order = get_purchase_order_for_client(client, input.purchase_order_id)?;
        if order.status == "draft" {
            return Err(AppError::Message("أكد البون قبل إضافة دفعة".into()));
        }
        if input.amount > order.remaining_amount {
            return Err(AppError::Message(
                "مبلغ الدفع أكبر من المبلغ المتبقي".into(),
            ));
        }
        insert_supplier_payment(
            client,
            input.purchase_order_id,
            input.amount,
            input.note.trim(),
            input.cashier.trim(),
        )?;
        let paid = order.paid_amount + input.amount;
        let remaining = (order.remaining_amount - input.amount).max(0.0);
        let status = if remaining <= 0.0 {
            "paid"
        } else {
            "confirmed"
        };
        client.execute(
            "UPDATE purchase_orders
             SET paid_amount = $1, remaining_amount = $2, status = $3
             WHERE id = $4",
            &[&paid, &remaining, &status, &input.purchase_order_id],
        )?;
        get_purchase_order_for_client(client, input.purchase_order_id)
    })
}

#[tauri::command]
pub fn list_supplier_payments(db: State<Database>) -> AppResult<Vec<SupplierPayment>> {
    db.with_client(|client| {
        let rows = client.query(
            "SELECT sp.id, sp.supplier_id, s.name, sp.purchase_order_id, po.bon_no, sp.shift_id,
                    sp.amount, sp.note, sp.cashier, sp.paid_at::text
             FROM supplier_payments sp
             JOIN suppliers s ON s.id = sp.supplier_id
             JOIN purchase_orders po ON po.id = sp.purchase_order_id
             ORDER BY sp.paid_at DESC, sp.id DESC
             LIMIT 200",
            &[],
        )?;
        Ok(rows.iter().map(payment_from_row).collect())
    })
}

fn validate_purchase_input(client: &mut Client, input: &PurchaseOrderInput) -> AppResult<()> {
    let supplier_exists = client
        .query_opt(
            "SELECT id FROM suppliers WHERE id = $1 AND active = TRUE",
            &[&input.supplier_id],
        )?
        .is_some();
    if !supplier_exists {
        return Err(AppError::Message("اختر موردا نشطا".into()));
    }
    if input.items.is_empty() {
        return Err(AppError::Message("أضف منتجا واحدا على الأقل".into()));
    }
    for item in &input.items {
        if item.quantity <= 0 || item.unit_purchase_price < 0.0 {
            return Err(AppError::Message("تحقق من الكمية وسعر الشراء".into()));
        }
        client.query_one("SELECT id FROM products WHERE id = $1", &[&item.product_id])?;
    }
    Ok(())
}

fn purchase_subtotal(items: &[PurchaseOrderItemInput]) -> f64 {
    items
        .iter()
        .map(|item| item.quantity as f64 * item.unit_purchase_price)
        .sum()
}

fn insert_purchase_items(
    client: &mut Client,
    order_id: i64,
    items: &[PurchaseOrderItemInput],
) -> AppResult<()> {
    for item in items {
        let row = client.query_one(
            "SELECT name, barcode FROM products WHERE id = $1",
            &[&item.product_id],
        )?;
        let name: String = row.get(0);
        let barcode: String = row.get(1);
        let line_total = item.quantity as f64 * item.unit_purchase_price;
        client.execute(
            "INSERT INTO purchase_order_items
             (purchase_order_id, product_id, product_name, barcode, quantity, unit_purchase_price, line_total)
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
            &[
                &order_id,
                &item.product_id,
                &name,
                &barcode,
                &item.quantity,
                &item.unit_purchase_price,
                &line_total,
            ],
        )?;
    }
    Ok(())
}

fn apply_purchase_stock(
    client: &mut Client,
    order_id: i64,
    item: &PurchaseOrderItem,
) -> AppResult<()> {
    let row = client.query_one(
        "SELECT quantity, purchase_price FROM products WHERE id = $1",
        &[&item.product_id],
    )?;
    let before_quantity: i64 = row.get(0);
    let old_purchase_price: f64 = row.get(1);
    let after_quantity = before_quantity + item.quantity;
    let old_value = old_purchase_price * before_quantity.max(0) as f64;
    let added_value = item.unit_purchase_price * item.quantity as f64;
    let next_purchase_price = if after_quantity > 0 {
        (old_value + added_value) / after_quantity as f64
    } else {
        item.unit_purchase_price
    };
    client.execute(
        "UPDATE products SET quantity = $1, purchase_price = $2, updated_at = NOW() WHERE id = $3",
        &[&after_quantity, &next_purchase_price, &item.product_id],
    )?;
    client.execute(
        "INSERT INTO stock_movements
         (product_id, movement_type, quantity, before_quantity, after_quantity, unit_purchase_price, note, reference_type, reference_id)
         VALUES ($1, 'entry', $2, $3, $4, $5, $6, 'purchase_order', $7)",
        &[
            &item.product_id,
            &item.quantity,
            &before_quantity,
            &after_quantity,
            &item.unit_purchase_price,
            &format!("قسيمة شراء {}", order_id),
            &order_id,
        ],
    )?;
    Ok(())
}

fn insert_supplier_payment(
    client: &mut Client,
    purchase_order_id: i64,
    amount: f64,
    note: &str,
    cashier: &str,
) -> AppResult<()> {
    let shift_id = require_open_shift(client)?;
    let supplier_id: i64 = client
        .query_one(
            "SELECT supplier_id FROM purchase_orders WHERE id = $1",
            &[&purchase_order_id],
        )?
        .get(0);
    client.execute(
        "INSERT INTO supplier_payments
         (supplier_id, purchase_order_id, shift_id, amount, note, cashier)
         VALUES ($1, $2, $3, $4, $5, $6)",
        &[
            &supplier_id,
            &purchase_order_id,
            &shift_id,
            &amount,
            &note,
            &cashier.trim(),
        ],
    )?;
    Ok(())
}

fn next_bon_no(client: &mut Client) -> AppResult<String> {
    let next: i64 = client
        .query_one("SELECT nextval('purchase_orders_id_seq')", &[])?
        .get(0);
    Ok(format!("BA-{:06}", next))
}

fn get_supplier(client: &mut Client, id: i64) -> AppResult<Supplier> {
    let row = client.query_one(
        "SELECT s.id, s.name, s.phone, s.address, s.note, s.active,
                COALESCE(SUM(CASE WHEN po.status <> 'draft' THEN po.subtotal ELSE 0 END), 0)::float8,
                COALESCE(SUM(CASE WHEN po.status <> 'draft' THEN po.paid_amount ELSE 0 END), 0)::float8,
                COALESCE(SUM(CASE WHEN po.status <> 'draft' THEN po.remaining_amount ELSE 0 END), 0)::float8,
                COALESCE(MAX(CASE WHEN po.status <> 'draft' THEN po.confirmed_at::text ELSE NULL END), ''),
                s.created_at::text
         FROM suppliers s
         LEFT JOIN purchase_orders po ON po.supplier_id = s.id
         WHERE s.id = $1
         GROUP BY s.id",
        &[&id],
    )?;
    Ok(supplier_from_row(&row))
}

fn get_purchase_order_for_client(client: &mut Client, id: i64) -> AppResult<PurchaseOrder> {
    let row = client.query_one(
        "SELECT po.id, po.bon_no, po.supplier_id, s.name, po.subtotal, po.paid_amount,
                po.remaining_amount, po.status, po.note, po.cashier, po.created_at::text,
                COALESCE(po.confirmed_at::text, '')
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
         WHERE po.id = $1",
        &[&id],
    )?;
    let item_rows = client.query(
        "SELECT id, product_id, product_name, barcode, quantity, unit_purchase_price, line_total
         FROM purchase_order_items WHERE purchase_order_id = $1 ORDER BY id",
        &[&id],
    )?;
    let payment_rows = client.query(
        "SELECT sp.id, sp.supplier_id, s.name, sp.purchase_order_id, po.bon_no, sp.shift_id,
                sp.amount, sp.note, sp.cashier, sp.paid_at::text
         FROM supplier_payments sp
         JOIN suppliers s ON s.id = sp.supplier_id
         JOIN purchase_orders po ON po.id = sp.purchase_order_id
         WHERE sp.purchase_order_id = $1
         ORDER BY sp.paid_at DESC, sp.id DESC",
        &[&id],
    )?;
    Ok(PurchaseOrder {
        id: row.get(0),
        bon_no: row.get(1),
        supplier_id: row.get(2),
        supplier_name: row.get(3),
        subtotal: row.get(4),
        paid_amount: row.get(5),
        remaining_amount: row.get(6),
        status: row.get(7),
        note: row.get(8),
        cashier: row.get(9),
        created_at: row.get(10),
        confirmed_at: row.get(11),
        items: item_rows.iter().map(purchase_item_from_row).collect(),
        payments: payment_rows.iter().map(payment_from_row).collect(),
    })
}

fn supplier_from_row(row: &Row) -> Supplier {
    Supplier {
        id: row.get(0),
        name: row.get(1),
        phone: row.get(2),
        address: row.get(3),
        note: row.get(4),
        active: row.get(5),
        total_purchases: row.get(6),
        total_paid: row.get(7),
        remaining_amount: row.get(8),
        last_purchase_at: row.get(9),
        created_at: row.get(10),
    }
}

fn purchase_item_from_row(row: &Row) -> PurchaseOrderItem {
    PurchaseOrderItem {
        id: row.get(0),
        product_id: row.get(1),
        product_name: row.get(2),
        barcode: row.get(3),
        quantity: row.get(4),
        unit_purchase_price: row.get(5),
        line_total: row.get(6),
    }
}

fn payment_from_row(row: &Row) -> SupplierPayment {
    SupplierPayment {
        id: row.get(0),
        supplier_id: row.get(1),
        supplier_name: row.get(2),
        purchase_order_id: row.get(3),
        bon_no: row.get(4),
        shift_id: row.get(5),
        amount: row.get(6),
        note: row.get(7),
        cashier: row.get(8),
        paid_at: row.get(9),
    }
}
