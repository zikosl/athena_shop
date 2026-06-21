use chrono::{Datelike, Duration, NaiveDate};
use postgres::Client;
use tauri::State;

use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::models::{ReportBucket, ReportData, ReportFilter, ReportSummary, ReportTopItem};

#[tauri::command]
pub fn get_report(db: State<Database>, input: ReportFilter) -> AppResult<ReportData> {
    let period = normalize_period(&input.period);
    let from_date = parse_date(&input.from_date)?;
    let to_date = parse_date(&input.to_date)?;
    if from_date > to_date {
        return Err(AppError::Message(
            "La date debut doit etre avant la date fin".into(),
        ));
    }

    db.with_client(|client| {
        let mut summary = ReportSummary::default();
        let mut buckets = Vec::new();

        for (start, end) in bucket_ranges(&period, from_date, to_date) {
            let bucket = bucket_totals(client, start, end)?;
            summary.entry += bucket.entry;
            summary.sortie += bucket.sortie;
            summary.profit += bucket.profit;
            summary.buying_total += bucket.buying;
            summary.selling_total += bucket.selling;
            summary.gain_total += bucket.gain;
            summary.sales_count += bucket.sales_count;
            buckets.push(ReportBucket {
                label: bucket_label(&period, start, end),
                start_date: start.to_string(),
                end_date: end.to_string(),
                entry: bucket.entry,
                sortie: bucket.sortie,
                profit: bucket.profit,
                buying: bucket.buying,
                selling: bucket.selling,
                gain: bucket.gain,
                sales_count: bucket.sales_count,
            });
        }

        let gross_sales: f64 = client
            .query_one(
                "SELECT COALESCE(SUM(total), 0)::float8
                 FROM sales WHERE created_at::date BETWEEN $1 AND $2",
                &[&from_date, &to_date],
            )?
            .get(0);
        summary.average_ticket = if summary.sales_count > 0 {
            gross_sales / summary.sales_count as f64
        } else {
            0.0
        };

        summary.credit_collected = client
            .query_one(
                "SELECT COALESCE(SUM(amount), 0)::float8
                 FROM credit_payments WHERE paid_at::date BETWEEN $1 AND $2",
                &[&from_date, &to_date],
            )?
            .get(0);
        summary.credit_remaining = client
            .query_one(
                "SELECT COALESCE(SUM(remaining_amount), 0)::float8
                 FROM sales WHERE sale_type = 'credit' AND remaining_amount > 0",
                &[],
            )?
            .get(0);
        let row = client.query_one(
            "SELECT COUNT(*)::bigint, COALESCE(SUM(total), 0)::float8
             FROM sales WHERE sale_type = 'delivery' AND credit_status = 'delivery_pending'",
            &[],
        )?;
        summary.delivery_pending_count = row.get(0);
        summary.delivery_pending_total = row.get(1);
        summary.delivery_collected = client
            .query_one(
                "SELECT COALESCE(SUM(total), 0)::float8
                 FROM sales
                 WHERE sale_type = 'delivery'
                   AND credit_status = 'delivery_paid'
                   AND created_at::date BETWEEN $1 AND $2",
                &[&from_date, &to_date],
            )?
            .get(0);
        summary.supplier_purchases = client
            .query_one(
                "SELECT COALESCE(SUM(subtotal), 0)::float8
                 FROM purchase_orders
                 WHERE status <> 'draft' AND confirmed_at::date BETWEEN $1 AND $2",
                &[&from_date, &to_date],
            )?
            .get(0);
        summary.supplier_payments = client
            .query_one(
                "SELECT COALESCE(SUM(amount), 0)::float8
                 FROM supplier_payments WHERE paid_at::date BETWEEN $1 AND $2",
                &[&from_date, &to_date],
            )?
            .get(0);
        summary.supplier_remaining = client
            .query_one(
                "SELECT COALESCE(SUM(remaining_amount), 0)::float8
                 FROM purchase_orders WHERE status <> 'draft' AND remaining_amount > 0",
                &[],
            )?
            .get(0);
        let row = client.query_one(
            "SELECT
               COALESCE(SUM(purchase_price * quantity), 0)::float8,
               COALESCE(SUM(sale_price * quantity), 0)::float8
             FROM products",
            &[],
        )?;
        summary.stock_purchase_value = row.get(0);
        summary.stock_sale_value = row.get(1);

        let top_products = top_products(client, from_date, to_date)?;
        let advice = build_advice(&summary);

        Ok(ReportData {
            period,
            from_date: from_date.to_string(),
            to_date: to_date.to_string(),
            summary,
            buckets,
            top_products,
            advice,
        })
    })
}

#[derive(Default)]
struct BucketTotals {
    entry: f64,
    sortie: f64,
    profit: f64,
    buying: f64,
    selling: f64,
    gain: f64,
    sales_count: i64,
}

fn bucket_totals(client: &mut Client, start: NaiveDate, end: NaiveDate) -> AppResult<BucketTotals> {
    let row = client.query_one(
        "WITH payment_totals AS (
           SELECT sale_id, COALESCE(SUM(amount), 0)::float8 AS amount
           FROM credit_payments
           GROUP BY sale_id
         )
         SELECT
           COALESCE(SUM(
             CASE
               WHEN s.sale_type IN ('cash', 'delivery') THEN s.total
               ELSE GREATEST(s.paid_amount - COALESCE(p.amount, 0), 0)
             END
           ), 0)::float8,
           COUNT(*)::bigint,
           COALESCE(SUM(
             CASE
               WHEN s.total <= 0 THEN 0
               WHEN s.sale_type IN ('cash', 'delivery') THEN s.profit
               ELSE s.profit * GREATEST(s.paid_amount - COALESCE(p.amount, 0), 0) / s.total
             END
           ), 0)::float8,
           COALESCE(SUM(s.total), 0)::float8,
           COALESCE(SUM(GREATEST(s.total - s.profit, 0)), 0)::float8,
           COALESCE(SUM(s.profit), 0)::float8
         FROM sales s
         LEFT JOIN payment_totals p ON p.sale_id = s.id
         WHERE s.created_at::date BETWEEN $1 AND $2
           AND (s.sale_type <> 'delivery' OR s.credit_status = 'delivery_paid')",
        &[&start, &end],
    )?;
    let sale_entry: f64 = row.get(0);
    let sales_count: i64 = row.get(1);
    let sale_profit: f64 = row.get(2);
    let selling: f64 = row.get(3);
    let buying: f64 = row.get(4);
    let booked_profit: f64 = row.get(5);

    let row = client.query_one(
        "SELECT
           COALESCE(SUM(cp.amount), 0)::float8,
           COALESCE(SUM(
             CASE
               WHEN s.total <= 0 THEN 0
               ELSE s.profit * cp.amount / s.total
             END
           ), 0)::float8
         FROM credit_payments cp
         JOIN sales s ON s.id = cp.sale_id
         WHERE cp.paid_at::date BETWEEN $1 AND $2",
        &[&start, &end],
    )?;
    let credit_entry: f64 = row.get(0);
    let credit_profit: f64 = row.get(1);

    let expenses: f64 = client
        .query_one(
            "SELECT COALESCE(SUM(amount), 0)::float8
             FROM expenses WHERE expense_date BETWEEN $1 AND $2",
            &[&start, &end],
        )?
        .get(0);
    let supplier_payments: f64 = client
        .query_one(
            "SELECT COALESCE(SUM(amount), 0)::float8
             FROM supplier_payments WHERE paid_at::date BETWEEN $1 AND $2",
            &[&start, &end],
        )?
        .get(0);
    let sortie = expenses + supplier_payments;

    Ok(BucketTotals {
        entry: sale_entry + credit_entry,
        sortie,
        profit: sale_profit + credit_profit - sortie,
        buying,
        selling,
        gain: booked_profit - sortie,
        sales_count,
    })
}

fn top_products(
    client: &mut Client,
    from_date: NaiveDate,
    to_date: NaiveDate,
) -> AppResult<Vec<ReportTopItem>> {
    let rows = client.query(
        "SELECT si.product_name, SUM(si.quantity)::bigint, COALESCE(SUM(si.line_total), 0)::float8
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE s.created_at::date BETWEEN $1 AND $2
           AND (s.sale_type <> 'delivery' OR s.credit_status = 'delivery_paid')
         GROUP BY si.product_name
         ORDER BY COALESCE(SUM(si.line_total), 0) DESC, SUM(si.quantity) DESC
         LIMIT 5",
        &[&from_date, &to_date],
    )?;
    Ok(rows
        .iter()
        .map(|row| ReportTopItem {
            name: row.get(0),
            quantity: row.get(1),
            total: row.get(2),
        })
        .collect())
}

fn build_advice(summary: &ReportSummary) -> Vec<String> {
    let mut advice = Vec::new();
    if summary.entry <= 0.0 {
        advice.push("لا توجد مبيعات في هذه الفترة. تحقق من التذاكر أو اختر تاريخا آخر.".into());
    }
    if summary.profit < 0.0 {
        advice.push("تنبيه: الفائدة سالبة. راجع المصاريف وأسعار الشراء وأسعار البيع.".into());
    } else if summary.profit > 0.0 {
        advice.push("الفترة إيجابية: المبيعات تغطي الشراء والمصاريف.".into());
    }
    if summary.selling_total > 0.0 && summary.buying_total / summary.selling_total > 0.75 {
        advice.push("تكلفة الشراء مرتفعة مقارنة بالمبيعات. راجع أسعار الشراء والهامش.".into());
    }
    if summary.sortie > 0.0 && summary.entry > 0.0 && summary.sortie / summary.entry > 0.6 {
        advice.push("المصاريف مرتفعة مقارنة بالمداخيل. راجع تفاصيل المصاريف.".into());
    }
    if summary.credit_remaining > 0.0 {
        advice.push("يوجد دين متبق يجب تحصيله. دفعات الزبائن تحسن الصندوق.".into());
    }
    if summary.sales_count == 0 {
        advice.push("لم يتم العثور على مبيعات في هذا الفلتر.".into());
    }
    advice
}

fn bucket_ranges(
    period: &str,
    from_date: NaiveDate,
    to_date: NaiveDate,
) -> Vec<(NaiveDate, NaiveDate)> {
    let mut ranges = Vec::new();
    let mut cursor = from_date;
    while cursor <= to_date {
        let next_start = match period {
            "weekly" => cursor + Duration::days(7),
            "monthly" => add_month(cursor),
            _ => cursor + Duration::days(1),
        };
        let end = (next_start - Duration::days(1)).min(to_date);
        ranges.push((cursor, end));
        cursor = next_start;
    }
    ranges
}

fn bucket_label(period: &str, start: NaiveDate, end: NaiveDate) -> String {
    match period {
        "weekly" => format!("{} -> {}", start.format("%d/%m"), end.format("%d/%m")),
        "monthly" => format!("{:02}/{}", start.month(), start.year()),
        _ => start.format("%d/%m").to_string(),
    }
}

fn add_month(date: NaiveDate) -> NaiveDate {
    let (year, month) = if date.month() == 12 {
        (date.year() + 1, 1)
    } else {
        (date.year(), date.month() + 1)
    };
    NaiveDate::from_ymd_opt(year, month, 1).unwrap_or(date + Duration::days(31))
}

fn normalize_period(period: &str) -> String {
    match period {
        "weekly" => "weekly".into(),
        "monthly" => "monthly".into(),
        _ => "daily".into(),
    }
}

fn parse_date(value: &str) -> AppResult<NaiveDate> {
    NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
        .map_err(|_| AppError::Message("Date de rapport invalide".into()))
}
