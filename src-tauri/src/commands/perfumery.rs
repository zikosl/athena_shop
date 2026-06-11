use postgres::Row;
use tauri::State;

use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::models::{Flacon, FlaconInput, Perfume, PerfumeInput, PerfumePrice};

#[tauri::command]
pub fn list_flacons(db: State<Database>) -> AppResult<Vec<Flacon>> {
    db.with_client(|client| {
        let rows = client.query(
            "SELECT id, name, volume_ml, active, created_at::text FROM flacons ORDER BY volume_ml, id",
            &[],
        )?;
        Ok(rows.iter().map(flacon_from_row).collect())
    })
}

#[tauri::command]
pub fn save_flacon(db: State<Database>, input: FlaconInput) -> AppResult<Flacon> {
    if input.name.trim().is_empty() || input.volume_ml <= 0.0 {
        return Err(AppError::Message("Nom et volume du flacon obligatoires".into()));
    }
    db.with_client(|client| {
        let id: i64 = if let Some(id) = input.id {
            client.execute(
                "UPDATE flacons SET name = $1, volume_ml = $2, active = $3 WHERE id = $4",
                &[&input.name.trim(), &input.volume_ml, &input.active, &id],
            )?;
            id
        } else {
            client
                .query_one(
                    "INSERT INTO flacons (name, volume_ml, active) VALUES ($1, $2, $3) RETURNING id",
                    &[&input.name.trim(), &input.volume_ml, &input.active],
                )?
                .get(0)
        };
        let row = client.query_one(
            "SELECT id, name, volume_ml, active, created_at::text FROM flacons WHERE id = $1",
            &[&id],
        )?;
        Ok(flacon_from_row(&row))
    })
}

#[tauri::command]
pub fn list_perfumes(db: State<Database>) -> AppResult<Vec<Perfume>> {
    db.with_client(|client| {
        let rows = client.query(
            "SELECT id, name, family, total_volume_ml, remaining_volume_ml, total_purchase_price,
                    cost_per_ml, low_stock_ml, created_at::text, updated_at::text
             FROM perfumes ORDER BY updated_at DESC, id DESC",
            &[],
        )?;
        let mut perfumes = Vec::new();
        for row in rows {
            let mut perfume = perfume_from_row(&row);
            perfume.prices = list_prices(client, perfume.id)?;
            perfumes.push(perfume);
        }
        Ok(perfumes)
    })
}

#[tauri::command]
pub fn save_perfume(db: State<Database>, input: PerfumeInput) -> AppResult<Perfume> {
    if input.name.trim().is_empty() {
        return Err(AppError::Message("Nom du parfum obligatoire".into()));
    }
    if input.added_volume_ml < 0.0 || input.total_purchase_price < 0.0 || input.low_stock_ml < 0.0 {
        return Err(AppError::Message("Volumes et prix doivent etre positifs".into()));
    }

    db.with_client(|client| {
        let mut tx = client.transaction()?;
        let id: i64 = if let Some(id) = input.id {
            let row = tx.query_one(
                "SELECT total_volume_ml, remaining_volume_ml, total_purchase_price FROM perfumes WHERE id = $1",
                &[&id],
            )?;
            let total_volume: f64 = row.get(0);
            let remaining_volume: f64 = row.get(1);
            let purchase_total: f64 = row.get(2);
            let next_total_volume = total_volume + input.added_volume_ml;
            let next_remaining = remaining_volume + input.added_volume_ml;
            let next_purchase = purchase_total + input.total_purchase_price;
            let cost_per_ml = if next_total_volume > 0.0 { next_purchase / next_total_volume } else { 0.0 };
            tx.execute(
                "UPDATE perfumes
                 SET name = $1, family = $2, total_volume_ml = $3, remaining_volume_ml = $4,
                     total_purchase_price = $5, cost_per_ml = $6, low_stock_ml = $7, updated_at = NOW()
                 WHERE id = $8",
                &[
                    &input.name.trim(),
                    &input.family.trim(),
                    &next_total_volume,
                    &next_remaining,
                    &next_purchase,
                    &cost_per_ml,
                    &input.low_stock_ml,
                    &id,
                ],
            )?;
            id
        } else {
            if input.added_volume_ml <= 0.0 {
                return Err(AppError::Message("Volume initial obligatoire".into()));
            }
            let cost_per_ml = if input.added_volume_ml > 0.0 {
                input.total_purchase_price / input.added_volume_ml
            } else {
                0.0
            };
            tx.query_one(
                "INSERT INTO perfumes
                 (name, family, total_volume_ml, remaining_volume_ml, total_purchase_price, cost_per_ml, low_stock_ml)
                 VALUES ($1, $2, $3, $3, $4, $5, $6) RETURNING id",
                &[
                    &input.name.trim(),
                    &input.family.trim(),
                    &input.added_volume_ml,
                    &input.total_purchase_price,
                    &cost_per_ml,
                    &input.low_stock_ml,
                ],
            )?
            .get(0)
        };

        for price in input.prices {
            if price.sale_price < 0.0 {
                return Err(AppError::Message("Prix de vente invalide".into()));
            }
            tx.execute(
                "INSERT INTO perfume_prices (perfume_id, flacon_id, sale_price)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (perfume_id, flacon_id) DO UPDATE SET sale_price = EXCLUDED.sale_price",
                &[&id, &price.flacon_id, &price.sale_price],
            )?;
        }
        tx.commit()?;

        let row = client.query_one(
            "SELECT id, name, family, total_volume_ml, remaining_volume_ml, total_purchase_price,
                    cost_per_ml, low_stock_ml, created_at::text, updated_at::text
             FROM perfumes WHERE id = $1",
            &[&id],
        )?;
        let mut perfume = perfume_from_row(&row);
        perfume.prices = list_prices(client, id)?;
        Ok(perfume)
    })
}

fn list_prices(client: &mut postgres::Client, perfume_id: i64) -> AppResult<Vec<PerfumePrice>> {
    let rows = client.query(
        "SELECT pp.flacon_id, f.name, f.volume_ml, pp.sale_price
         FROM perfume_prices pp
         JOIN flacons f ON f.id = pp.flacon_id
         WHERE pp.perfume_id = $1
         ORDER BY f.volume_ml, f.id",
        &[&perfume_id],
    )?;
    Ok(rows.iter().map(price_from_row).collect())
}

fn flacon_from_row(row: &Row) -> Flacon {
    Flacon {
        id: row.get(0),
        name: row.get(1),
        volume_ml: row.get(2),
        active: row.get(3),
        created_at: row.get(4),
    }
}

fn perfume_from_row(row: &Row) -> Perfume {
    Perfume {
        id: row.get(0),
        name: row.get(1),
        family: row.get(2),
        total_volume_ml: row.get(3),
        remaining_volume_ml: row.get(4),
        total_purchase_price: row.get(5),
        cost_per_ml: row.get(6),
        low_stock_ml: row.get(7),
        created_at: row.get(8),
        updated_at: row.get(9),
        prices: Vec::new(),
    }
}

fn price_from_row(row: &Row) -> PerfumePrice {
    PerfumePrice {
        flacon_id: row.get(0),
        flacon_name: row.get(1),
        volume_ml: row.get(2),
        sale_price: row.get(3),
    }
}
