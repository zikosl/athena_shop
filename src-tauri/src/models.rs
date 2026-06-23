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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub allow_negative_stock: bool,
    pub cash_register_auto_close_time: String,
    pub max_discount_amount: f64,
    pub invoice_printer: String,
    pub barcode_printer: String,
    pub receipt_title: String,
    pub receipt_subtitle: String,
    pub show_invoice_logo: bool,
    pub ticket_width_chars: i64,
    pub barcode_label_width_mm: i64,
    pub barcode_label_height_mm: i64,
    pub barcode_darkness: i64,
    pub barcode_speed: String,
    pub ui_font_scale: String,
    pub ui_zoom: i64,
    pub ui_density: String,
    pub pos_layout: String,
    pub pos_cart_width: i64,
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

#[derive(Debug, Deserialize)]
pub struct StockMovementInput {
    pub product_id: i64,
    pub movement_type: String,
    pub quantity: i64,
    pub purchase_price: f64,
    pub note: String,
}

#[derive(Debug, Serialize)]
pub struct StockMovement {
    pub id: i64,
    pub product_id: i64,
    pub product_name: String,
    pub barcode: String,
    pub movement_type: String,
    pub quantity: i64,
    pub before_quantity: i64,
    pub after_quantity: i64,
    pub unit_purchase_price: f64,
    pub note: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct Supplier {
    pub id: i64,
    pub name: String,
    pub phone: String,
    pub address: String,
    pub note: String,
    pub active: bool,
    pub total_purchases: f64,
    pub total_paid: f64,
    pub remaining_amount: f64,
    pub last_purchase_at: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct SupplierInput {
    pub id: Option<i64>,
    pub name: String,
    pub phone: String,
    pub address: String,
    pub note: String,
    pub active: bool,
}

#[derive(Debug, Serialize)]
pub struct PurchaseOrderItem {
    pub id: i64,
    pub product_id: i64,
    pub product_name: String,
    pub barcode: String,
    pub quantity: i64,
    pub unit_purchase_price: f64,
    pub line_total: f64,
}

#[derive(Debug, Deserialize)]
pub struct PurchaseOrderItemInput {
    pub product_id: i64,
    pub quantity: i64,
    pub unit_purchase_price: f64,
}

#[derive(Debug, Serialize)]
pub struct SupplierPayment {
    pub id: i64,
    pub supplier_id: i64,
    pub supplier_name: String,
    pub purchase_order_id: i64,
    pub bon_no: String,
    pub shift_id: Option<i64>,
    pub amount: f64,
    pub note: String,
    pub cashier: String,
    pub paid_at: String,
}

#[derive(Debug, Deserialize)]
pub struct SupplierPaymentInput {
    pub purchase_order_id: i64,
    pub amount: f64,
    pub note: String,
    pub cashier: String,
}

#[derive(Debug, Serialize)]
pub struct PurchaseOrder {
    pub id: i64,
    pub bon_no: String,
    pub supplier_id: i64,
    pub supplier_name: String,
    pub subtotal: f64,
    pub paid_amount: f64,
    pub remaining_amount: f64,
    pub status: String,
    pub note: String,
    pub cashier: String,
    pub created_at: String,
    pub confirmed_at: String,
    pub items: Vec<PurchaseOrderItem>,
    pub payments: Vec<SupplierPayment>,
}

#[derive(Debug, Deserialize)]
pub struct PurchaseOrderInput {
    pub id: Option<i64>,
    pub supplier_id: i64,
    pub note: String,
    pub cashier: String,
    pub items: Vec<PurchaseOrderItemInput>,
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
    #[serde(default)]
    pub unit_price: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct PerfumeCheckoutItemInput {
    pub perfume_id: i64,
    pub flacon_id: i64,
    pub quantity: i64,
}

#[derive(Debug, Deserialize)]
pub struct CheckoutInput {
    pub items: Vec<CheckoutItemInput>,
    #[serde(default)]
    pub perfume_items: Vec<PerfumeCheckoutItemInput>,
    pub discount: f64,
    pub sale_type: String,
    pub paid_amount: f64,
    #[serde(default)]
    pub sale_date: String,
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
    #[serde(default)]
    pub unit_price: Option<f64>,
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
pub struct Flacon {
    pub id: i64,
    pub name: String,
    pub flacon_type: String,
    pub volume_ml: f64,
    pub sale_price: f64,
    pub active: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct FlaconInput {
    pub id: Option<i64>,
    pub name: String,
    pub flacon_type: String,
    pub volume_ml: f64,
    pub sale_price: f64,
    pub active: bool,
}

#[derive(Debug, Serialize)]
pub struct PerfumePurchase {
    pub id: i64,
    pub perfume_id: Option<i64>,
    pub perfume_name: String,
    pub title: String,
    pub amount: f64,
    pub volume_ml: f64,
    pub note: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct PerfumePurchaseInput {
    pub perfume_id: Option<i64>,
    pub title: String,
    pub amount: f64,
    pub volume_ml: f64,
    pub note: String,
}

#[derive(Debug, Serialize)]
pub struct PerfumePrice {
    pub flacon_id: i64,
    pub flacon_name: String,
    pub volume_ml: f64,
    pub sale_price: f64,
}

#[derive(Debug, Serialize)]
pub struct Perfume {
    pub id: i64,
    pub name: String,
    pub family: String,
    pub total_volume_ml: f64,
    pub remaining_volume_ml: f64,
    pub total_purchase_price: f64,
    pub cost_per_ml: f64,
    pub low_stock_ml: f64,
    pub created_at: String,
    pub updated_at: String,
    pub prices: Vec<PerfumePrice>,
}

#[derive(Debug, Deserialize)]
pub struct PerfumePriceInput {
    pub flacon_id: i64,
    pub sale_price: f64,
}

#[derive(Debug, Deserialize)]
pub struct PerfumeInput {
    pub id: Option<i64>,
    pub name: String,
    pub family: String,
    pub added_volume_ml: f64,
    pub total_purchase_price: f64,
    pub low_stock_ml: f64,
    pub prices: Vec<PerfumePriceInput>,
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

#[derive(Debug, Serialize)]
pub struct DashboardStats {
    pub sales_today: f64,
    pub sales_count_today: i64,
    pub revenue_today: f64,
    pub expenses_today: f64,
    pub profit_today: f64,
    pub sales_yesterday: f64,
    pub sales_count_yesterday: i64,
    pub revenue_yesterday: f64,
    pub expenses_yesterday: f64,
    pub profit_yesterday: f64,
    pub low_stock_count: i64,
    pub open_credit_count: i64,
    pub credit_remaining_total: f64,
    pub credit_payments_today: f64,
    pub credit_payments_yesterday: f64,
    pub delivery_pending_count: i64,
    pub delivery_pending_total: f64,
    pub delivery_collected_today: f64,
}

#[derive(Debug, Deserialize)]
pub struct ReportFilter {
    pub period: String,
    pub from_date: String,
    pub to_date: String,
}

#[derive(Debug, Serialize, Default, Clone)]
pub struct ReportSummary {
    pub entry: f64,
    pub sortie: f64,
    pub profit: f64,
    pub buying_total: f64,
    pub selling_total: f64,
    pub gain_total: f64,
    pub sales_count: i64,
    pub average_ticket: f64,
    pub credit_collected: f64,
    pub credit_remaining: f64,
    pub delivery_pending_total: f64,
    pub delivery_pending_count: i64,
    pub delivery_collected: f64,
    pub supplier_purchases: f64,
    pub supplier_payments: f64,
    pub supplier_remaining: f64,
    pub stock_purchase_value: f64,
    pub stock_sale_value: f64,
}

#[derive(Debug, Serialize)]
pub struct ReportBucket {
    pub label: String,
    pub start_date: String,
    pub end_date: String,
    pub entry: f64,
    pub sortie: f64,
    pub profit: f64,
    pub buying: f64,
    pub selling: f64,
    pub gain: f64,
    pub sales_count: i64,
}

#[derive(Debug, Serialize)]
pub struct ReportTopItem {
    pub name: String,
    pub quantity: i64,
    pub total: f64,
}

#[derive(Debug, Serialize)]
pub struct ReportData {
    pub period: String,
    pub from_date: String,
    pub to_date: String,
    pub summary: ReportSummary,
    pub buckets: Vec<ReportBucket>,
    pub top_products: Vec<ReportTopItem>,
    pub advice: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct CashShift {
    pub id: i64,
    pub opened_at: String,
    pub closed_at: String,
    pub auto_close_at: String,
    pub opening_amount: f64,
    pub closing_amount: f64,
    pub expected_amount: f64,
    pub cash_sales: f64,
    pub credit_payments: f64,
    pub expenses: f64,
    pub supplier_payments: f64,
    pub status: String,
    pub cashier: String,
}

#[derive(Debug, Deserialize)]
pub struct OpenShiftInput {
    pub opening_amount: f64,
    pub cashier: String,
}

#[derive(Debug, Deserialize)]
pub struct CloseShiftInput {
    pub id: i64,
}

#[derive(Debug, Deserialize)]
pub struct BarcodePrintInput {
    pub product_name: String,
    pub barcode: String,
    pub price: f64,
    pub count: i64,
}
