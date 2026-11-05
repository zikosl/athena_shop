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
                    purchase_price, sale_price, image_data, created_at::text, updated_at::text, custom_type, custom_config
             FROM products
             WHERE (name ILIKE $1 OR barcode ILIKE $1 OR category ILIKE $1 OR size ILIKE $1 OR color ILIKE $1)
               AND ($2 = '' OR category = $2)
               AND (
                 $3 = 'all'
                 OR ($3 = 'available' AND (custom_type = 'printing' OR quantity > low_stock_threshold))
                 OR ($3 = 'low' AND custom_type = 'standard' AND quantity > 0 AND quantity <= low_stock_threshold)
                 OR ($3 = 'out' AND custom_type <> 'printing' AND quantity <= 0)
               )
             ORDER BY updated_at DESC, id DESC",
            &[&pattern, &category, &stock],
        )?;

        Ok(rows.iter().map(product_from_row).collect())
    })
}

#[tauri::command]
pub fn list_categories(db: State<Database>) -> AppResult<Vec<String>> {
    db.with_client(|client| {
        let rows = client.query(
            "SELECT name FROM product_categories
             UNION SELECT DISTINCT btrim(category) FROM products WHERE btrim(category) <> ''
             ORDER BY name",
            &[],
        )?;
        Ok(rows.iter().map(|row| row.get(0)).collect())
    })
}

#[tauri::command]
pub fn save_category(
    db: State<Database>,
    name: String,
    old_name: Option<String>,
) -> AppResult<String> {
    let name = name.trim().to_string();
    let old_name = old_name.map(|value| value.trim().to_string());
    if name.is_empty() || name.chars().count() > 60 {
        return Err(AppError::Message(
            "اسم الصنف مطلوب (60 حرفًا كحد أقصى)".into(),
        ));
    }
    db.with_client(|client| {
        let mut tx = client.transaction()?;
        let exists: bool = tx
            .query_one(
                "SELECT EXISTS(SELECT 1 FROM product_categories WHERE name = $1)",
                &[&name],
            )?
            .get(0);
        if exists && old_name.as_deref() != Some(name.as_str()) {
            return Err(AppError::Message("هذا الصنف موجود مسبقًا".into()));
        }
        if let Some(old_name) = old_name.filter(|old| old != &name) {
            tx.execute(
                "INSERT INTO product_categories (name) VALUES ($1) ON CONFLICT DO NOTHING",
                &[&name],
            )?;
            tx.execute(
                "UPDATE products SET category = $1, updated_at = NOW() WHERE category = $2",
                &[&name, &old_name],
            )?;
            tx.execute(
                "DELETE FROM product_categories WHERE name = $1",
                &[&old_name],
            )?;
        } else {
            tx.execute(
                "INSERT INTO product_categories (name) VALUES ($1) ON CONFLICT DO NOTHING",
                &[&name],
            )?;
        }
        tx.commit()?;
        Ok(name)
    })
}

#[tauri::command]
pub fn delete_category(db: State<Database>, name: String) -> AppResult<()> {
    let name = name.trim().to_string();
    db.with_client(|client| {
        let used: bool = client
            .query_one(
                "SELECT EXISTS(SELECT 1 FROM products WHERE category = $1)",
                &[&name],
            )?
            .get(0);
        if used {
            return Err(AppError::Message(
                "لا يمكن حذف صنف مرتبط بمنتجات؛ غيّر أصناف المنتجات أولًا".into(),
            ));
        }
        client.execute("DELETE FROM product_categories WHERE name = $1", &[&name])?;
        Ok(())
    })
}

#[tauri::command]
pub fn save_product(db: State<Database>, input: ProductInput) -> AppResult<Product> {
    db.with_client(|client| {
        validate_product(client, &input)?;
        if !input.category.trim().is_empty() {
            client.execute(
                "INSERT INTO product_categories (name) VALUES ($1) ON CONFLICT DO NOTHING",
                &[&input.category.trim()],
            )?;
        }
        let id: i64 = if let Some(id) = input.id {
            let old_quantity: i64 = client
                .query_one("SELECT quantity FROM products WHERE id = $1", &[&id])?
                .get(0);
            client.execute(
                "UPDATE products
                 SET name = $1, barcode = $2, category = $3, size = $4, color = $5,
                     quantity = $6, low_stock_threshold = $7, purchase_price = $8,
                     sale_price = $9, image_data = $10, custom_type = $11, custom_config = $12, updated_at = NOW()
                 WHERE id = $13",
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
                    &input.custom_type,
                    &input.custom_config,
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
                     (name, barcode, category, size, color, quantity, low_stock_threshold, purchase_price, sale_price, image_data, custom_type, custom_config)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
                        &input.custom_type,
                        &input.custom_config,
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
    if !input.purchase_price.is_finite() || input.purchase_price < 0.0 {
        return Err(AppError::Message("سعر الشراء يجب أن يكون موجبا".into()));
    }

    db.with_client(|client| {
        let product = get_product(client, input.product_id)?;
        if product.custom_type == "printing" {
            return Err(AppError::Message(
                "خدمات الطباعة لا تملك مخزونا قابلا للتعديل".into(),
            ));
        }
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
            "SELECT product_id FROM sale_items WHERE product_id = $1
             UNION ALL
             SELECT product_id FROM purchase_order_items WHERE product_id = $1
             LIMIT 1",
            &[&id],
        )?;
        if used.is_some() {
            return Err(AppError::Message(
                "Produit deja vendu: suppression impossible".into(),
            ));
        }
        client.execute("DELETE FROM stock_movements WHERE product_id = $1", &[&id])?;
        let deleted = client.execute("DELETE FROM products WHERE id = $1", &[&id])?;
        if deleted == 0 {
            return Err(AppError::Message("Produit introuvable".into()));
        }
        Ok(())
    })
}

#[tauri::command]
pub fn regenerate_all_barcodes(db: State<Database>) -> AppResult<Vec<Product>> {
    db.with_client(|client| {
        let mut tx = client.transaction()?;
        let rows = tx.query("SELECT id FROM products ORDER BY id", &[])?;
        if rows.iter().any(|row| row.get::<_, i64>(0) > 999_999) {
            return Err(AppError::Message(
                "Nombre de produits trop eleve pour les codes a 8 chiffres".into(),
            ));
        }

        for row in &rows {
            let id: i64 = row.get(0);
            tx.execute(
                "UPDATE products SET barcode = $1 WHERE id = $2",
                &[&format!("TMP-{id}"), &id],
            )?;
        }

        for row in &rows {
            let id: i64 = row.get(0);
            let barcode = ean8_from_sequence(id as usize);
            tx.execute(
                "UPDATE products SET barcode = $1, updated_at = NOW() WHERE id = $2",
                &[&barcode, &id],
            )?;
        }
        tx.commit()?;

        let rows = client.query(
            "SELECT id, name, barcode, category, size, color, quantity, low_stock_threshold,
                    purchase_price, sale_price, image_data, created_at::text, updated_at::text, custom_type, custom_config
             FROM products ORDER BY updated_at DESC, id DESC",
            &[],
        )?;
        Ok(rows.iter().map(product_from_row).collect())
    })
}

fn ean8_from_sequence(sequence: usize) -> String {
    let body = format!("2{:06}", sequence % 1_000_000);
    ean8_from_body(&body)
}

#[allow(clippy::too_many_arguments)]
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
    if !is_valid_ean8(input.barcode.trim()) {
        let unchanged_legacy_barcode = if let Some(id) = input.id {
            client
                .query_opt("SELECT barcode FROM products WHERE id = $1", &[&id])?
                .map(|row| row.get::<_, String>(0) == input.barcode.trim())
                .unwrap_or(false)
        } else {
            false
        };
        if !unchanged_legacy_barcode {
            return Err(AppError::Message(
                "Le code-barres doit etre un EAN-8 valide compose de 8 chiffres".into(),
            ));
        }
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
    if !input.purchase_price.is_finite()
        || !input.sale_price.is_finite()
        || input.purchase_price < 0.0
        || input.sale_price < 0.0
    {
        return Err(AppError::Message("Les prix doivent etre positifs".into()));
    }
    if !["standard", "flexy", "tobacco", "printing"].contains(&input.custom_type.as_str()) {
        return Err(AppError::Message(
            "Type de produit personnalisé invalide".into(),
        ));
    }
    if input.custom_type == "tobacco"
        && input
            .custom_config
            .get("pieces_per_box")
            .and_then(serde_json::Value::as_i64)
            .unwrap_or(0)
            <= 0
    {
        return Err(AppError::Message(
            "Le nombre de pièces par boîte doit être supérieur à zéro".into(),
        ));
    }
    if input.custom_type == "flexy" {
        let tiers = input
            .custom_config
            .get("surcharge_tiers")
            .and_then(serde_json::Value::as_array);
        if tiers.map(|tiers| tiers.is_empty()).unwrap_or(true) {
            return Err(AppError::Message(
                "Configurez au moins un palier de frais Flexy".into(),
            ));
        }
        let tiers = tiers.unwrap();
        let mut upper_bounds = Vec::new();
        for tier in tiers {
            let surcharge = tier
                .get("surcharge")
                .and_then(serde_json::Value::as_f64)
                .unwrap_or(-1.0);
            if !surcharge.is_finite() || surcharge < 0.0 {
                return Err(AppError::Message(
                    "Les frais Flexy doivent être positifs".into(),
                ));
            }
            if let Some(limit) = tier.get("up_to").and_then(serde_json::Value::as_f64) {
                if !limit.is_finite() || limit <= 0.0 {
                    return Err(AppError::Message(
                        "Les limites des paliers doivent être positives".into(),
                    ));
                }
                upper_bounds.push(limit);
            }
        }
        upper_bounds.sort_by(f64::total_cmp);
        if upper_bounds.windows(2).any(|pair| pair[0] == pair[1])
            || upper_bounds.len() != tiers.len().saturating_sub(1)
        {
            return Err(AppError::Message("Les paliers Flexy doivent avoir des limites uniques et un dernier palier sans limite".into()));
        }
    }
    if input.custom_type == "tobacco"
        && ["piece_sale_price", "box_sale_price"].iter().any(|key| {
            input
                .custom_config
                .get(*key)
                .and_then(serde_json::Value::as_f64)
                .map(|value| !value.is_finite() || value < 0.0)
                .unwrap_or(true)
        })
    {
        return Err(AppError::Message(
            "Configurez les prix pièce et boîte du tabac".into(),
        ));
    }
    if input.custom_type == "printing"
        && ["recto_price", "recto_verso_price"].iter().any(|key| {
            input
                .custom_config
                .get(*key)
                .and_then(serde_json::Value::as_f64)
                .map(|value| !value.is_finite() || value < 0.0)
                .unwrap_or(true)
        })
    {
        return Err(AppError::Message(
            "Configurez les deux prix d'impression".into(),
        ));
    }
    Ok(())
}

fn is_valid_ean8(value: &str) -> bool {
    if value.len() != 8 || !value.bytes().all(|digit| digit.is_ascii_digit()) {
        return false;
    }
    let expected = ean8_from_body(&value[..7]);
    expected == value
}

fn ean8_from_body(body: &str) -> String {
    let sum: u32 = body
        .bytes()
        .enumerate()
        .map(|(index, digit)| {
            let value = u32::from(digit - b'0');
            if index % 2 == 0 {
                value * 3
            } else {
                value
            }
        })
        .sum();
    let check = (10 - (sum % 10)) % 10;
    format!("{body}{check}")
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
                purchase_price, sale_price, image_data, created_at::text, updated_at::text, custom_type, custom_config
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
        custom_type: row.get(13),
        custom_config: row.get(14),
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

#[cfg(test)]
mod tests {
    use super::{ean8_from_sequence, is_valid_ean8};

    #[test]
    fn generates_short_numeric_ean8_barcodes() {
        let barcode = ean8_from_sequence(1);
        assert_eq!(barcode, "20000011");
        assert_eq!(barcode.len(), 8);
        assert!(barcode.bytes().all(|digit| digit.is_ascii_digit()));
        assert!(is_valid_ean8(&barcode));
    }

    #[test]
    fn rejects_invalid_ean8_checksum() {
        assert!(!is_valid_ean8("20000012"));
        assert!(!is_valid_ean8("AS100001"));
    }
}
