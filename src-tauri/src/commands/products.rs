use postgres::Row;
use tauri::State;

use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::models::{Product, ProductInput};

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
    validate_product(&input)?;

    db.with_client(|client| {
        let id: i64 = if let Some(id) = input.id {
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
            id
        } else {
            client
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
                .get(0)
        };
        get_product(client, id)
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

fn validate_product(input: &ProductInput) -> AppResult<()> {
    if input.name.trim().is_empty() || input.barcode.trim().is_empty() {
        return Err(AppError::Message("Nom et code-barres obligatoires".into()));
    }
    if input.quantity < 0 || input.low_stock_threshold < 0 {
        return Err(AppError::Message(
            "Les quantites doivent etre positives".into(),
        ));
    }
    if input.purchase_price < 0.0 || input.sale_price < 0.0 {
        return Err(AppError::Message("Les prix doivent etre positifs".into()));
    }
    Ok(())
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
