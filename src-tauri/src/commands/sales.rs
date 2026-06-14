use chrono::Local;
use postgres::{Client, Row};
use tauri::State;

use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::models::{CheckoutInput, Sale, SaleItem};

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

            let unit_price = normalize_unit_price(item.unit_price, product.sale_price)?;
            let line_total = unit_price * item.quantity as f64;
            subtotal += line_total;
            gross_profit += (unit_price - product.purchase_price) * item.quantity as f64;

            tx.execute(
                "UPDATE products SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2",
                &[&item.quantity, &product.id],
            )?;

            sale_lines.push((product, item.quantity, unit_price, line_total));
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
            let unit_price = normalize_unit_price(item.unit_price, perfume.sale_price)?;
            let line_total = unit_price * item.quantity as f64;
            subtotal += line_total;
            gross_profit += (unit_price - perfume.cost_per_ml * perfume.volume_ml) * item.quantity as f64;
            tx.execute(
                "UPDATE perfumes SET remaining_volume_ml = remaining_volume_ml - $1, updated_at = NOW() WHERE id = $2",
                &[&needed_ml, &perfume.id],
            )?;
            perfume_lines.push((perfume, item.quantity, unit_price, line_total));
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
                 (receipt_no, subtotal, discount, total, profit, payment_method, sale_type,
                  customer_name, customer_phone, paid_amount, remaining_amount, due_date,
                  credit_note, credit_status, cashier)
                 VALUES ($1, $2, $3, $4, $5, 'Especes', $6, $7, $8, $9, $10, $11, $12, $13, $14)
                 RETURNING id",
                &[
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
        for (product, quantity, unit_price, line_total) in sale_lines {
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
                    &unit_price,
                    &product.purchase_price,
                    &line_total,
                ],
            )?;
            response_items.push(SaleItem {
                product_id: product.id,
                product_name: product.name,
                barcode: product.barcode,
                quantity,
                unit_price,
                line_total,
            });
        }
        for (perfume, quantity, unit_price, line_total) in perfume_lines {
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
                    &unit_price,
                    &perfume.cost_per_ml,
                    &line_total,
                ],
            )?;
            response_items.push(SaleItem {
                product_id: -perfume.id,
                product_name: format!("{} - {}", perfume.name, perfume.flacon_name),
                barcode: format!("PF-{}-{}", perfume.id, perfume.flacon_id),
                quantity,
                unit_price,
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

fn normalize_unit_price(requested_price: f64, default_price: f64) -> AppResult<f64> {
    if requested_price < 0.0 {
        return Err(AppError::Message("Prix de vente invalide".into()));
    }
    if requested_price > 0.0 {
        Ok(requested_price)
    } else {
        Ok(default_price)
    }
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
