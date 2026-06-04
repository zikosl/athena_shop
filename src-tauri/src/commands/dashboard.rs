use tauri::State;

use crate::db::Database;
use crate::error::AppResult;
use crate::models::DashboardStats;

#[tauri::command]
pub fn get_dashboard(db: State<Database>) -> AppResult<DashboardStats> {
    db.with_client(|client| {
        let row = client.query_one(
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
             WHERE s.created_at::date = CURRENT_DATE",
            &[],
        )?;
        let sales_today: f64 = row.get(0);
        let sales_count_today: i64 = row.get(1);
        let sale_profit_today: f64 = row.get(2);

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
             WHERE cp.paid_at::date = CURRENT_DATE",
            &[],
        )?;
        let credit_payments_today: f64 = row.get(0);
        let credit_payment_profit_today: f64 = row.get(1);

        let expenses_today: f64 = client
            .query_one(
                "SELECT COALESCE(SUM(amount), 0)::float8
                 FROM expenses WHERE expense_date = CURRENT_DATE",
                &[],
            )?
            .get(0);

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

        let cash_in_today = sales_today + credit_payments_today;

        Ok(DashboardStats {
            sales_today: cash_in_today,
            sales_count_today,
            revenue_today: cash_in_today,
            expenses_today,
            profit_today: sale_profit_today + credit_payment_profit_today - expenses_today,
            low_stock_count,
            open_credit_count,
            credit_remaining_total,
            credit_payments_today,
        })
    })
}
