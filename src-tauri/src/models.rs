use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct UserSession {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct ProfileInput {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct Product {
    pub id: i64,
    pub name: String,
    pub barcode: String,
    pub category: String,
    pub size: String,
    pub color: String,
    pub quantity: i64,
    pub low_stock_threshold: i64,
    pub purchase_price: f64,
    pub sale_price: f64,
    pub image_data: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct ProductInput {
    pub id: Option<i64>,
    pub name: String,
    pub barcode: String,
    pub category: String,
    pub size: String,
    pub color: String,
    pub quantity: i64,
    pub low_stock_threshold: i64,
    pub purchase_price: f64,
    pub sale_price: f64,
    pub image_data: String,
}

#[derive(Debug, Serialize)]
pub struct Expense {
    pub id: i64,
    pub label: String,
    pub category: String,
    pub amount: f64,
    pub note: String,
    pub expense_date: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct ExpenseInput {
    pub id: Option<i64>,
    pub label: String,
    pub category: String,
    pub amount: f64,
    pub note: String,
    pub expense_date: String,
}

#[derive(Debug, Deserialize)]
pub struct CheckoutItemInput {
    pub product_id: i64,
    pub quantity: i64,
}

#[derive(Debug, Deserialize)]
pub struct CheckoutInput {
    pub items: Vec<CheckoutItemInput>,
    pub discount: f64,
    pub sale_type: String,
    pub paid_amount: f64,
    pub customer_name: String,
    pub customer_phone: String,
    pub due_date: String,
    pub credit_note: String,
    pub cashier: String,
}

#[derive(Debug, Deserialize)]
pub struct SaleItemUpdateInput {
    pub product_id: i64,
    pub quantity: i64,
}

#[derive(Debug, Deserialize)]
pub struct SaleUpdateInput {
    pub sale_id: i64,
    pub items: Vec<SaleItemUpdateInput>,
}

#[derive(Debug, Deserialize)]
pub struct SaleReturnInput {
    pub sale_id: i64,
    pub product_id: i64,
    pub quantity: i64,
}

#[derive(Debug, Serialize)]
pub struct SaleItem {
    pub product_id: i64,
    pub product_name: String,
    pub barcode: String,
    pub quantity: i64,
    pub unit_price: f64,
    pub line_total: f64,
}

#[derive(Debug, Serialize)]
pub struct Sale {
    pub id: i64,
    pub receipt_no: String,
    pub subtotal: f64,
    pub discount: f64,
    pub total: f64,
    pub profit: f64,
    pub payment_method: String,
    pub sale_type: String,
    pub customer_name: String,
    pub customer_phone: String,
    pub paid_amount: f64,
    pub collected_amount: f64,
    pub remaining_amount: f64,
    pub due_date: String,
    pub credit_note: String,
    pub credit_status: String,
    pub cashier: String,
    pub created_at: String,
    pub items: Vec<SaleItem>,
}

#[derive(Debug, Serialize)]
pub struct CreditPayment {
    pub id: i64,
    pub sale_id: i64,
    pub amount: f64,
    pub note: String,
    pub paid_at: String,
    pub cashier: String,
}

#[derive(Debug, Deserialize)]
pub struct CreditPaymentInput {
    pub sale_id: i64,
    pub amount: f64,
    pub note: String,
    pub cashier: String,
}

#[derive(Debug, Serialize)]
pub struct CreditAccount {
    pub sale: Sale,
    pub payments: Vec<CreditPayment>,
}

#[derive(Debug, Deserialize)]
pub struct RevenueFilter {
    pub query: String,
    pub sale_type: String,
    pub from_date: String,
    pub to_date: String,
    pub page: i64,
    pub page_size: i64,
}

#[derive(Debug, Serialize)]
pub struct RevenueTotals {
    pub revenue: f64,
    pub remaining: f64,
    pub payments: f64,
    pub expenses: f64,
    pub profit: f64,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct RevenuePageData {
    pub sales: Vec<Sale>,
    pub totals: RevenueTotals,
    pub total_rows: i64,
    pub page: i64,
    pub page_size: i64,
    pub total_pages: i64,
}

#[derive(Debug, Serialize)]
pub struct DashboardStats {
    pub sales_today: f64,
    pub sales_count_today: i64,
    pub revenue_today: f64,
    pub expenses_today: f64,
    pub profit_today: f64,
    pub low_stock_count: i64,
    pub open_credit_count: i64,
    pub credit_remaining_total: f64,
    pub credit_payments_today: f64,
}
