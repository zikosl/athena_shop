use tauri::State;

use crate::db::Database;
use crate::error::AppResult;
use crate::models::DashboardStats;

#[derive(Default)]
struct DayStats {
    cash_in: f64,
    sales_count: i64,
    sale_profit: f64,
    credit_payments: f64,
    credit_payment_profit: f64,
    expenses: f64,
}

#[tauri::command]
pub fn get_dashboard(db: State<Database>) -> AppResult<DashboardStats> {
    db.with_client(|client| {
        let today = day_stats(client, "CURRENT_DATE")?;
        let yesterday = day_stats(client, "CURRENT_DATE - INTERVAL '1 day'")?;

        let low_stock_count: i64 = client
            .query_one(
                "SELECT COUNT(*)::bigint FROM products WHERE quantity <= low_stock_threshold",
                &[],
            )?
            .get(0);

        let row = client.query_one(
            "SELECT COUNT(*)::bigint, COALESCE(SUM(remaining_amount), 0)::float8
             FROM sales WHERE sale_type = 'credit' AND remaining_amount > 0",
            &[],
        )?;
        let open_credit_count: i64 = row.get(0);
        let credit_remaining_total: f64 = row.get(1);

        Ok(DashboardStats {
            sales_today: today.cash_in,
            sales_count_today: today.sales_count,
            revenue_today: today.cash_in,
            expenses_today: today.expenses,
            profit_today: today.sale_profit + today.credit_payment_profit - today.expenses,
            sales_yesterday: yesterday.cash_in,
            sales_count_yesterday: yesterday.sales_count,
            revenue_yesterday: yesterday.cash_in,
            expenses_yesterday: yesterday.expenses,
            profit_yesterday: yesterday.sale_profit + yesterday.credit_payment_profit - yesterday.expenses,
            low_stock_count,
            open_credit_count,
            credit_remaining_total,
            credit_payments_today: today.credit_payments,
            credit_payments_yesterday: yesterday.credit_payments,
        })
    })
}

fn day_stats(client: &mut postgres::Client, day_sql: &str) -> AppResult<DayStats> {
    let sales_query = format!(
        "WITH payment_totals AS (
           SELECT sale_id, COALESCE(SUM(amount), 0)::float8 AS amount
           FROM credit_payments
           GROUP BY sale_id
         )
         SELECT
           COALESCE(SUM(
             CASE
               WHEN s.sale_type = 'cash' THEN s.total
               ELSE GREATEST(s.paid_amount - COALESCE(p.amount, 0), 0)
             END
           ), 0)::float8,
           COUNT(*)::bigint,
           COALESCE(SUM(
             CASE
               WHEN s.total <= 0 THEN 0
               WHEN s.sale_type = 'cash' THEN s.profit
               ELSE s.profit * GREATEST(s.paid_amount - COALESCE(p.amount, 0), 0) / s.total
             END
           ), 0)::float8
         FROM sales s
         LEFT JOIN payment_totals p ON p.sale_id = s.id
         WHERE s.created_at::date = {day_sql}"
    );
    let row = client.query_one(&sales_query, &[])?;
    let cash_in: f64 = row.get(0);
    let sales_count: i64 = row.get(1);
    let sale_profit: f64 = row.get(2);

    let payments_query = format!(
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
         WHERE cp.paid_at::date = {day_sql}"
    );
    let row = client.query_one(&payments_query, &[])?;
    let credit_payments: f64 = row.get(0);
    let credit_payment_profit: f64 = row.get(1);

    let expenses_query = format!(
        "SELECT COALESCE(SUM(amount), 0)::float8
         FROM expenses WHERE expense_date = {day_sql}"
    );
    let expenses: f64 = client.query_one(&expenses_query, &[])?.get(0);

    Ok(DayStats {
        cash_in: cash_in + credit_payments,
        sales_count,
        sale_profit,
        credit_payments,
        credit_payment_profit,
        expenses,
    })
}
