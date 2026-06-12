use chrono::Local;
use postgres::{Client, Row};
use tauri::State;

use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::models::{CheckoutInput, Sale, SaleItem, SaleReturnInput, SaleUpdateInput};

#[derive(Debug)]
struct ProductForSale {
    id: i64,
    name: String,
    barcode: String,
    quantity: i64,
    purchase_price: f64,
    sale_price: f64,
}

#[derive(Debug)]
struct PerfumeForSale {
    id: i64,
    name: String,
    remaining_volume_ml: f64,
    cost_per_ml: f64,
    flacon_id: i64,
    flacon_name: String,
    volume_ml: f64,
    sale_price: f64,
}

#[derive(Debug, Clone)]
struct StoredSaleItem {
    product_id: i64,
    product_name: String,
    barcode: String,
    quantity: i64,
    unit_price: f64,
    purchase_price: f64,
}

#[derive(Debug)]
struct SaleTotals {
    subtotal: f64,
    discount: f64,
    total: f64,
    profit: f64,
    paid_amount: f64,
    remaining_amount: f64,
    credit_status: String,
}

#[tauri::command]
pub fn checkout(db: State<Database>, input: CheckoutInput) -> AppResult<Sale> {
    if input.items.is_empty() && input.perfume_items.is_empty() {
        return Err(AppError::Message("Le panier est vide".into()));
    }
    if input.discount < 0.0 {
        return Err(AppError::Message("Remise invalide".into()));
    }
    if input.discount > 200.0 {
        return Err(AppError::Message("La remise maximale est 200".into()));
    }
    if input.paid_amount < 0.0 {
        return Err(AppError::Message("Montant paye invalide".into()));
    }

    db.with_client(|client| {
        let shift_id = super::shifts::require_open_shift(client)?;
        let mut tx = client.transaction()?;
        let receipt_no = format!("AS-{}", Local::now().format("%Y%m%d-%H%M%S"));
        let mut subtotal = 0.0;
        let mut gross_profit = 0.0;
        let mut sale_lines = Vec::new();
        let mut perfume_lines = Vec::new();

        for item in &input.items {
            if item.quantity <= 0 {
                return Err(AppError::Message("Quantite invalide".into()));
            }

            let product = get_product_for_sale(&mut tx, item.product_id)?
                .ok_or_else(|| AppError::Message("Produit introuvable".into()))?;

            if product.quantity < item.quantity {
                return Err(AppError::Message(format!(
                    "Stock insuffisant pour {}",
                    product.name
                )));
            }

            let line_total = product.sale_price * item.quantity as f64;
            subtotal += line_total;
            gross_profit += (product.sale_price - product.purchase_price) * item.quantity as f64;

            tx.execute(
                "UPDATE products SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2",
                &[&item.quantity, &product.id],
            )?;

            sale_lines.push((product, item.quantity, line_total));
        }

        for item in &input.perfume_items {
            if item.quantity <= 0 {
                return Err(AppError::Message("Quantite invalide".into()));
            }
            let perfume = get_perfume_for_sale(&mut tx, item.perfume_id, item.flacon_id)?
                .ok_or_else(|| AppError::Message("Parfum ou flacon introuvable".into()))?;
            let needed_ml = perfume.volume_ml * item.quantity as f64;
            if perfume.remaining_volume_ml + f64::EPSILON < needed_ml {
                return Err(AppError::Message(format!(
                    "Stock insuffisant pour {} {}",
                    perfume.name, perfume.flacon_name
                )));
            }
            let line_total = perfume.sale_price * item.quantity as f64;
            subtotal += line_total;
            gross_profit += (perfume.sale_price - perfume.cost_per_ml * perfume.volume_ml) * item.quantity as f64;
            tx.execute(
                "UPDATE perfumes SET remaining_volume_ml = remaining_volume_ml - $1, updated_at = NOW() WHERE id = $2",
                &[&needed_ml, &perfume.id],
            )?;
            perfume_lines.push((perfume, item.quantity, line_total));
        }

        let total = (subtotal - input.discount).max(0.0);
        let profit = (gross_profit - input.discount).max(0.0);
        let sale_type = if input.sale_type.trim() == "credit" { "credit" } else { "cash" };
        if sale_type == "credit" && input.customer_name.trim().is_empty() {
            return Err(AppError::Message("Nom client obligatoire pour un credit".into()));
        }
        if input.paid_amount > total {
            return Err(AppError::Message("Le montant paye depasse le total".into()));
        }
        let paid_amount = if sale_type == "cash" { total } else { input.paid_amount };
        let remaining_amount = (total - paid_amount).max(0.0);
        let credit_status = if remaining_amount <= 0.0 {
            "paid"
        } else if paid_amount > 0.0 {
            "partial"
        } else {
            "open"
        };

        let sale_id: i64 = tx
            .query_one(
                "INSERT INTO sales
                 (shift_id, receipt_no, subtotal, discount, total, profit, payment_method, sale_type,
                  customer_name, customer_phone, paid_amount, remaining_amount, due_date,
                  credit_note, credit_status, cashier)
                 VALUES ($1, $2, $3, $4, $5, $6, 'Especes', $7, $8, $9, $10, $11, $12, $13, $14, $15)
                 RETURNING id",
                &[
                    &shift_id,
                    &receipt_no,
                    &subtotal,
                    &input.discount,
                    &total,
                    &profit,
                    &sale_type,
                    &input.customer_name.trim(),
                    &input.customer_phone.trim(),
                    &paid_amount,
                    &remaining_amount,
                    &input.due_date.trim(),
                    &input.credit_note.trim(),
                    &credit_status,
                    &input.cashier.trim(),
                ],
            )?
            .get(0);

        let mut response_items = Vec::new();
        for (product, quantity, line_total) in sale_lines {
            tx.execute(
                "INSERT INTO sale_items
                 (sale_id, product_id, product_name, barcode, quantity, unit_price, purchase_price, line_total)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                &[
                    &sale_id,
                    &product.id,
                    &product.name,
                    &product.barcode,
                    &quantity,
                    &product.sale_price,
                    &product.purchase_price,
                    &line_total,
                ],
            )?;
            response_items.push(SaleItem {
                product_id: product.id,
                product_name: product.name,
                barcode: product.barcode,
                quantity,
                unit_price: product.sale_price,
                line_total,
            });
        }
        for (perfume, quantity, line_total) in perfume_lines {
            tx.execute(
                "INSERT INTO perfume_sale_items
                 (sale_id, perfume_id, flacon_id, perfume_name, flacon_name, volume_ml, quantity, unit_price, cost_per_ml, line_total)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
                &[
                    &sale_id,
                    &perfume.id,
                    &perfume.flacon_id,
                    &perfume.name,
                    &perfume.flacon_name,
                    &perfume.volume_ml,
                    &quantity,
                    &perfume.sale_price,
                    &perfume.cost_per_ml,
                    &line_total,
                ],
            )?;
            response_items.push(SaleItem {
                product_id: -perfume.id,
                product_name: format!("{} - {}", perfume.name, perfume.flacon_name),
                barcode: format!("PF-{}-{}", perfume.id, perfume.flacon_id),
                quantity,
                unit_price: perfume.sale_price,
                line_total,
            });
        }

        tx.commit()?;

        Ok(Sale {
            id: sale_id,
            receipt_no,
            subtotal,
            discount: input.discount,
            total,
            profit,
            payment_method: "Especes".into(),
            sale_type: sale_type.into(),
            customer_name: input.customer_name,
            customer_phone: input.customer_phone,
            paid_amount,
            remaining_amount,
            due_date: input.due_date,
            credit_note: input.credit_note,
            credit_status: credit_status.into(),
            cashier: input.cashier,
            created_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            items: response_items,
        })
    })
}

#[tauri::command]
pub fn list_sales(db: State<Database>) -> AppResult<Vec<Sale>> {
    db.with_client(|client| {
        let rows = client.query(
            "SELECT id, receipt_no, subtotal, discount, total, profit, payment_method,
                    sale_type, customer_name, customer_phone, paid_amount, remaining_amount,
                    due_date, credit_note, credit_status, cashier, created_at::text
             FROM sales ORDER BY id DESC LIMIT 100",
            &[],
        )?;

        let mut with_items = Vec::new();
        for row in rows {
            let mut sale = sale_from_row(&row);
            sale.items = list_sale_items(client, sale.id)?;
            with_items.push(sale);
        }
        Ok(with_items)
    })
}

#[tauri::command]
pub fn update_sale(db: State<Database>, input: SaleUpdateInput) -> AppResult<Sale> {
    db.with_client(|client| {
        let mut tx = client.transaction()?;
        replace_sale_items(&mut tx, input.sale_id, input.items)?;
        tx.commit()?;
        load_sale(client, input.sale_id)
    })
}

#[tauri::command]
pub fn return_sale_item(db: State<Database>, input: SaleReturnInput) -> AppResult<Sale> {
    if input.quantity <= 0 {
        return Err(AppError::Message("Quantite de retour invalide".into()));
    }

    db.with_client(|client| {
        let mut tx = client.transaction()?;
        let current_items = stored_sale_items(&mut tx, input.sale_id)?;
        let mut found = false;
        let mut updated_items = Vec::new();

        for item in current_items {
            let quantity = if item.product_id == input.product_id {
                found = true;
                if input.quantity > item.quantity {
                    return Err(AppError::Message("Retour superieur a la quantite vendue".into()));
                }
                item.quantity - input.quantity
            } else {
                item.quantity
            };
            if quantity > 0 {
                updated_items.push(crate::models::SaleItemUpdateInput {
                    product_id: item.product_id,
                    quantity,
                });
            }
        }

        if !found {
            return Err(AppError::Message("Article introuvable dans le bon".into()));
        }
        if updated_items.is_empty() {
            return Err(AppError::Message(
                "Retour total: utilisez supprimer le bon".into(),
            ));
        }

        replace_sale_items(&mut tx, input.sale_id, updated_items)?;
        tx.commit()?;
        load_sale(client, input.sale_id)
    })
}

#[tauri::command]
pub fn delete_sale(db: State<Database>, id: i64) -> AppResult<()> {
    db.with_client(|client| {
        let mut tx = client.transaction()?;
        let items = stored_sale_items(&mut tx, id)?;
        if items.is_empty() {
            return Err(AppError::Message("Bon introuvable".into()));
        }
        for item in items {
            tx.execute(
                "UPDATE products SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2",
                &[&item.quantity, &item.product_id],
            )?;
        }
        tx.execute("DELETE FROM sales WHERE id = $1", &[&id])?;
        tx.commit()?;
        Ok(())
    })
}

fn get_product_for_sale(
    client: &mut postgres::Transaction<'_>,
    id: i64,
) -> AppResult<Option<ProductForSale>> {
    let row = client.query_opt(
        "SELECT id, name, barcode, quantity, purchase_price, sale_price
         FROM products WHERE id = $1",
        &[&id],
    )?;
    Ok(row.map(|row| ProductForSale {
        id: row.get(0),
        name: row.get(1),
        barcode: row.get(2),
        quantity: row.get(3),
        purchase_price: row.get(4),
        sale_price: row.get(5),
    }))
}

fn get_perfume_for_sale(
    client: &mut postgres::Transaction<'_>,
    perfume_id: i64,
    flacon_id: i64,
) -> AppResult<Option<PerfumeForSale>> {
    let row = client.query_opt(
        "SELECT p.id, p.name, p.remaining_volume_ml, p.cost_per_ml,
                f.id, f.name, f.volume_ml, pp.sale_price
         FROM perfumes p
         JOIN perfume_prices pp ON pp.perfume_id = p.id
         JOIN flacons f ON f.id = pp.flacon_id
         WHERE p.id = $1 AND f.id = $2 AND f.active = TRUE",
        &[&perfume_id, &flacon_id],
    )?;
    Ok(row.map(|row| PerfumeForSale {
        id: row.get(0),
        name: row.get(1),
        remaining_volume_ml: row.get(2),
        cost_per_ml: row.get(3),
        flacon_id: row.get(4),
        flacon_name: row.get(5),
        volume_ml: row.get(6),
        sale_price: row.get(7),
    }))
}

fn load_sale(client: &mut Client, sale_id: i64) -> AppResult<Sale> {
    let row = client.query_one(
        "SELECT id, receipt_no, subtotal, discount, total, profit, payment_method,
                sale_type, customer_name, customer_phone, paid_amount, remaining_amount,
                due_date, credit_note, credit_status, cashier, created_at::text
         FROM sales WHERE id = $1",
        &[&sale_id],
    )?;
    let mut sale = sale_from_row(&row);
    sale.items = list_sale_items(client, sale.id)?;
    Ok(sale)
}

fn replace_sale_items(
    tx: &mut postgres::Transaction<'_>,
    sale_id: i64,
    input_items: Vec<crate::models::SaleItemUpdateInput>,
) -> AppResult<()> {
    if input_items.is_empty() || input_items.iter().all(|item| item.quantity <= 0) {
        return Err(AppError::Message("Le bon doit garder au moins un article".into()));
    }

    let sale_row = tx.query_one(
        "SELECT sale_type, discount, paid_amount FROM sales WHERE id = $1",
        &[&sale_id],
    )?;
    let sale_type: String = sale_row.get(0);
    let old_discount: f64 = sale_row.get(1);
    let old_paid_amount: f64 = sale_row.get(2);
    if sale_type == "credit" {
        let payment_count: i64 = tx
            .query_one(
                "SELECT COUNT(*)::bigint FROM credit_payments WHERE sale_id = $1",
                &[&sale_id],
            )?
            .get(0);
        if payment_count > 0 {
            return Err(AppError::Message(
                "Bon credit avec versements: supprimez le bon complet ou reglez les versements avant modification"
                    .into(),
            ));
        }
    }
    let old_items = stored_sale_items(tx, sale_id)?;

    if old_items.is_empty() {
        return Err(AppError::Message("Bon introuvable".into()));
    }

    for item in &old_items {
        tx.execute(
            "UPDATE products SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2",
            &[&item.quantity, &item.product_id],
        )?;
    }

    tx.execute("DELETE FROM sale_items WHERE sale_id = $1", &[&sale_id])?;

    let mut subtotal = 0.0;
    let mut gross_profit = 0.0;

    for input in input_items.into_iter().filter(|item| item.quantity > 0) {
        let old_item = old_items
            .iter()
            .find(|item| item.product_id == input.product_id)
            .ok_or_else(|| AppError::Message("Modification limitee aux articles du bon".into()))?;
        let available: i64 = tx
            .query_one(
                "SELECT quantity FROM products WHERE id = $1",
                &[&input.product_id],
            )?
            .get(0);
        if available < input.quantity {
            return Err(AppError::Message(format!(
                "Stock insuffisant pour {}",
                old_item.product_name
            )));
        }

        let line_total = old_item.unit_price * input.quantity as f64;
        subtotal += line_total;
        gross_profit += (old_item.unit_price - old_item.purchase_price) * input.quantity as f64;

        tx.execute(
            "UPDATE products SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2",
            &[&input.quantity, &input.product_id],
        )?;
        tx.execute(
            "INSERT INTO sale_items
             (sale_id, product_id, product_name, barcode, quantity, unit_price, purchase_price, line_total)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            &[
                &sale_id,
                &old_item.product_id,
                &old_item.product_name,
                &old_item.barcode,
                &input.quantity,
                &old_item.unit_price,
                &old_item.purchase_price,
                &line_total,
            ],
        )?;
    }

    let totals = calculate_sale_totals(subtotal, gross_profit, old_discount, &sale_type, old_paid_amount);
    tx.execute(
        "UPDATE sales
         SET subtotal = $1, discount = $2, total = $3, profit = $4,
             paid_amount = $5, remaining_amount = $6, credit_status = $7
         WHERE id = $8",
        &[
            &totals.subtotal,
            &totals.discount,
            &totals.total,
            &totals.profit,
            &totals.paid_amount,
            &totals.remaining_amount,
            &totals.credit_status,
            &sale_id,
        ],
    )?;
    Ok(())
}

fn calculate_sale_totals(
    subtotal: f64,
    gross_profit: f64,
    old_discount: f64,
    sale_type: &str,
    old_paid_amount: f64,
) -> SaleTotals {
    let discount = old_discount.min(subtotal).max(0.0);
    let total = (subtotal - discount).max(0.0);
    let profit = (gross_profit - discount).max(0.0);
    let paid_amount = if sale_type == "cash" {
        total
    } else {
        old_paid_amount.min(total)
    };
    let remaining_amount = (total - paid_amount).max(0.0);
    let credit_status = if remaining_amount <= 0.0 {
        "paid"
    } else if paid_amount > 0.0 {
        "partial"
    } else {
        "open"
    }
    .to_string();

    SaleTotals {
        subtotal,
        discount,
        total,
        profit,
        paid_amount,
        remaining_amount,
        credit_status,
    }
}

fn stored_sale_items(
    client: &mut postgres::Transaction<'_>,
    sale_id: i64,
) -> AppResult<Vec<StoredSaleItem>> {
    let rows = client.query(
        "SELECT product_id, product_name, barcode, quantity, unit_price, purchase_price
         FROM sale_items WHERE sale_id = $1 ORDER BY id",
        &[&sale_id],
    )?;
    Ok(rows
        .iter()
        .map(|row| StoredSaleItem {
            product_id: row.get(0),
            product_name: row.get(1),
            barcode: row.get(2),
            quantity: row.get(3),
            unit_price: row.get(4),
            purchase_price: row.get(5),
        })
        .collect())
}

pub fn list_sale_items(client: &mut Client, sale_id: i64) -> AppResult<Vec<SaleItem>> {
    let rows = client.query(
        "SELECT product_id, product_name, barcode, quantity, unit_price, line_total
         FROM sale_items WHERE sale_id = $1 ORDER BY id",
        &[&sale_id],
    )?;
    let mut items: Vec<SaleItem> = rows.iter().map(sale_item_from_row).collect();
    let perfume_rows = client.query(
        "SELECT perfume_id, perfume_name, flacon_id, flacon_name, quantity, unit_price, line_total
         FROM perfume_sale_items WHERE sale_id = $1 ORDER BY id",
        &[&sale_id],
    )?;
    items.extend(perfume_rows.iter().map(perfume_sale_item_from_row));
    Ok(items)
}

pub fn sale_from_row(row: &Row) -> Sale {
    Sale {
        id: row.get(0),
        receipt_no: row.get(1),
        subtotal: row.get(2),
        discount: row.get(3),
        total: row.get(4),
        profit: row.get(5),
        payment_method: row.get(6),
        sale_type: row.get(7),
        customer_name: row.get(8),
        customer_phone: row.get(9),
        paid_amount: row.get(10),
        remaining_amount: row.get(11),
        due_date: row.get(12),
        credit_note: row.get(13),
        credit_status: row.get(14),
        cashier: row.get(15),
        created_at: row.get(16),
        items: Vec::new(),
    }
}

fn sale_item_from_row(row: &Row) -> SaleItem {
    SaleItem {
        product_id: row.get(0),
        product_name: row.get(1),
        barcode: row.get(2),
        quantity: row.get(3),
        unit_price: row.get(4),
        line_total: row.get(5),
    }
}

fn perfume_sale_item_from_row(row: &Row) -> SaleItem {
    let perfume_id: i64 = row.get(0);
    let perfume_name: String = row.get(1);
    let flacon_id: i64 = row.get(2);
    let flacon_name: String = row.get(3);
    SaleItem {
        product_id: -perfume_id,
        product_name: format!("{} - {}", perfume_name, flacon_name),
        barcode: format!("PF-{}-{}", perfume_id, flacon_id),
        quantity: row.get(4),
        unit_price: row.get(5),
        line_total: row.get(6),
    }
}
