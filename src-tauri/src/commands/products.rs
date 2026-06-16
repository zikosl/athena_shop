use postgres::Row;
use tauri::State;

use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::models::{Product, ProductInput, StockMovement, StockMovementInput};

#[tauri::command]
pub fn list_products(
    db: State<Database>,
    query: Option<String>,
    category: Option<String>,
    stock: Option<String>,
) -> AppResult<Vec<Product>> {
    db.with_client(|client| {
        let pattern = format!("%{}%", query.unwrap_or_default().trim());
        let category = category.unwrap_or_default();
        let category = category.trim().to_string();
        let stock = stock.unwrap_or_else(|| "all".into());
        let rows = client.query(
            "SELECT id, name, barcode, category, size, color, quantity, low_stock_threshold,
                    purchase_price, sale_price, image_data, created_at::text, updated_at::text
             FROM products
             WHERE (name ILIKE $1 OR barcode ILIKE $1 OR category ILIKE $1 OR size ILIKE $1 OR color ILIKE $1)
               AND ($2 = '' OR category = $2)
               AND (
                 $3 = 'all'
                 OR ($3 = 'available' AND quantity > low_stock_threshold)
                 OR ($3 = 'low' AND quantity > 0 AND quantity <= low_stock_threshold)
                 OR ($3 = 'out' AND quantity <= 0)
               )
             ORDER BY updated_at DESC, id DESC",
            &[&pattern, &category, &stock],
        )?;

        Ok(rows.iter().map(product_from_row).collect())
    })
}

#[tauri::command]
pub fn save_product(db: State<Database>, input: ProductInput) -> AppResult<Product> {
    db.with_client(|client| {
        validate_product(client, &input)?;
        let id: i64 = if let Some(id) = input.id {
            let old_quantity: i64 = client
                .query_one("SELECT quantity FROM products WHERE id = $1", &[&id])?
                .get(0);
            client.execute(
                "UPDATE products
                 SET name = $1, barcode = $2, category = $3, size = $4, color = $5,
                     quantity = $6, low_stock_threshold = $7, purchase_price = $8,
                     sale_price = $9, image_data = $10, updated_at = NOW()
                 WHERE id = $11",
                &[
                    &input.name.trim(),
                    &input.barcode.trim(),
                    &input.category.trim(),
                    &input.size.trim(),
                    &input.color.trim(),
                    &input.quantity,
                    &input.low_stock_threshold,
                    &input.purchase_price,
                    &input.sale_price,
                    &input.image_data,
                    &id,
                ],
            )?;
            if input.quantity != old_quantity {
                insert_stock_movement(
                    client,
                    id,
                    "adjustment",
                    input.quantity - old_quantity,
                    old_quantity,
                    input.quantity,
                    input.purchase_price,
                    "تعديل مباشر من بطاقة المنتج",
                )?;
            }
            id
        } else {
            let id = client
                .query_one(
                    "INSERT INTO products
                     (name, barcode, category, size, color, quantity, low_stock_threshold, purchase_price, sale_price, image_data)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                     RETURNING id",
                    &[
                        &input.name.trim(),
                        &input.barcode.trim(),
                        &input.category.trim(),
                        &input.size.trim(),
                        &input.color.trim(),
                        &input.quantity,
                        &input.low_stock_threshold,
                        &input.purchase_price,
                        &input.sale_price,
                        &input.image_data,
                    ],
                )?
                .get(0);
            if input.quantity > 0 {
                insert_stock_movement(
                    client,
                    id,
                    "initial",
                    input.quantity,
                    0,
                    input.quantity,
                    input.purchase_price,
                    "مخزون أولي",
                )?;
            }
            id
        };
        get_product(client, id)
    })
}

#[tauri::command]
pub fn adjust_product_stock(db: State<Database>, input: StockMovementInput) -> AppResult<Product> {
    if input.quantity <= 0 {
        return Err(AppError::Message("الكمية يجب أن تكون أكبر من صفر".into()));
    }
    if input.purchase_price < 0.0 {
        return Err(AppError::Message("سعر الشراء يجب أن يكون موجبا".into()));
    }

    db.with_client(|client| {
        let product = get_product(client, input.product_id)?;
        let movement_type = input.movement_type.trim();
        let delta = match movement_type {
            "entry" => input.quantity,
            "destock" => -input.quantity,
            _ => return Err(AppError::Message("نوع حركة المخزون غير صالح".into())),
        };
        let next_quantity = product.quantity + delta;
        if next_quantity < 0 && !allow_negative_stock(client)? {
            return Err(AppError::Message(
                "لا يمكن إخراج كمية أكبر من المخزون الحالي".into(),
            ));
        }

        let next_purchase_price = if movement_type == "entry" && input.purchase_price > 0.0 {
            let old_value = product.purchase_price * product.quantity.max(0) as f64;
            let added_value = input.purchase_price * input.quantity as f64;
            if next_quantity > 0 {
                (old_value + added_value) / next_quantity as f64
            } else {
                input.purchase_price
            }
        } else {
            product.purchase_price
        };

        client.execute(
            "UPDATE products
             SET quantity = $1, purchase_price = $2, updated_at = NOW()
             WHERE id = $3",
            &[&next_quantity, &next_purchase_price, &input.product_id],
        )?;
        insert_stock_movement(
            client,
            input.product_id,
            movement_type,
            delta,
            product.quantity,
            next_quantity,
            if input.purchase_price > 0.0 {
                input.purchase_price
            } else {
                product.purchase_price
            },
            input.note.trim(),
        )?;
        get_product(client, input.product_id)
    })
}

#[tauri::command]
pub fn list_stock_movements(db: State<Database>, product_id: i64) -> AppResult<Vec<StockMovement>> {
    db.with_client(|client| {
        let rows = client.query(
            "SELECT sm.id, sm.product_id, p.name, p.barcode, sm.movement_type, sm.quantity,
                    sm.before_quantity, sm.after_quantity, sm.unit_purchase_price, sm.note, sm.created_at::text
             FROM stock_movements sm
             JOIN products p ON p.id = sm.product_id
             WHERE sm.product_id = $1
             ORDER BY sm.created_at DESC, sm.id DESC
             LIMIT 80",
            &[&product_id],
        )?;
        Ok(rows.iter().map(stock_movement_from_row).collect())
    })
}

#[tauri::command]
pub fn delete_product(db: State<Database>, id: i64) -> AppResult<()> {
    db.with_client(|client| {
        let used = client.query_opt(
            "SELECT id FROM sale_items WHERE product_id = $1 LIMIT 1",
            &[&id],
        )?;
        if used.is_some() {
            return Err(AppError::Message(
                "Produit deja vendu: suppression impossible".into(),
            ));
        }
        client.execute("DELETE FROM products WHERE id = $1", &[&id])?;
        Ok(())
    })
}

fn insert_stock_movement(
    client: &mut postgres::Client,
    product_id: i64,
    movement_type: &str,
    quantity: i64,
    before_quantity: i64,
    after_quantity: i64,
    unit_purchase_price: f64,
    note: &str,
) -> AppResult<()> {
    client.execute(
        "INSERT INTO stock_movements
         (product_id, movement_type, quantity, before_quantity, after_quantity, unit_purchase_price, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
        &[
            &product_id,
            &movement_type,
            &quantity,
            &before_quantity,
            &after_quantity,
            &unit_purchase_price,
            &note,
        ],
    )?;
    Ok(())
}

fn validate_product(client: &mut postgres::Client, input: &ProductInput) -> AppResult<()> {
    if input.name.trim().is_empty() || input.barcode.trim().is_empty() {
        return Err(AppError::Message("Nom et code-barres obligatoires".into()));
    }
    if input.quantity < 0 && !allow_negative_stock(client)? {
        return Err(AppError::Message(
            "المخزون السالب غير مفعل في الإعدادات".into(),
        ));
    }
    if input.low_stock_threshold < 0 {
        return Err(AppError::Message(
            "Les quantites doivent etre positives".into(),
        ));
    }
    if input.purchase_price < 0.0 || input.sale_price < 0.0 {
        return Err(AppError::Message("Les prix doivent etre positifs".into()));
    }
    Ok(())
}

fn allow_negative_stock(client: &mut postgres::Client) -> AppResult<bool> {
    Ok(client
        .query_opt(
            "SELECT value FROM app_meta WHERE key = 'allow_negative_stock'",
            &[],
        )?
        .map(|row| row.get::<_, String>(0) != "false")
        .unwrap_or(true))
}

fn get_product(client: &mut postgres::Client, id: i64) -> AppResult<Product> {
    let row = client.query_one(
        "SELECT id, name, barcode, category, size, color, quantity, low_stock_threshold,
                purchase_price, sale_price, image_data, created_at::text, updated_at::text
         FROM products WHERE id = $1",
        &[&id],
    )?;
    Ok(product_from_row(&row))
}

pub fn product_from_row(row: &Row) -> Product {
    Product {
        id: row.get(0),
        name: row.get(1),
        barcode: row.get(2),
        category: row.get(3),
        size: row.get(4),
        color: row.get(5),
        quantity: row.get(6),
        low_stock_threshold: row.get(7),
        purchase_price: row.get(8),
        sale_price: row.get(9),
        image_data: row.get(10),
        created_at: row.get(11),
        updated_at: row.get(12),
    }
}

fn stock_movement_from_row(row: &Row) -> StockMovement {
    StockMovement {
        id: row.get(0),
        product_id: row.get(1),
        product_name: row.get(2),
        barcode: row.get(3),
        movement_type: row.get(4),
        quantity: row.get(5),
        before_quantity: row.get(6),
        after_quantity: row.get(7),
        unit_purchase_price: row.get(8),
        note: row.get(9),
        created_at: row.get(10),
    }
}
