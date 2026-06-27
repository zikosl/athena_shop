export type Language = "fr" | "ar";
export type ViewKey = "apps" | "dashboard" | "stock" | "perfumery" | "pos" | "delivery" | "revenue" | "reports" | "expenses" | "credits" | "zakat" | "settings";

export interface UserSession {
  id: number;
  username: string;
  display_name: string;
  role: string;
}

export interface ProfileInput {
  id: number;
  username: string;
  display_name: string;
  password: string;
}

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface AppSettings {
  allow_negative_stock: boolean;
  cash_register_auto_close_time: string;
  max_discount_amount: number;
  invoice_printer: string;
  barcode_printer: string;
  receipt_title: string;
  receipt_subtitle: string;
  show_invoice_logo: boolean;
  ticket_width_chars: number;
  barcode_label_width_mm: number;
  barcode_label_height_mm: number;
  barcode_darkness: number;
  barcode_speed: "slow" | "normal" | "fast";
  theme_primary_color: string;
  ui_font_scale: "small" | "normal" | "large";
  ui_zoom: number;
  ui_density: "compact" | "comfortable" | "spacious";
  pos_layout: "auto" | "side" | "bottom";
  pos_cart_width: number;
}

export interface Product {
  id: number;
  name: string;
  barcode: string;
  category: string;
  size: string;
  color: string;
  quantity: number;
  low_stock_threshold: number;
  purchase_price: number;
  sale_price: number;
  image_data: string;
  created_at: string;
  updated_at: string;
}

export interface ProductInput {
  id?: number;
  name: string;
  barcode: string;
  category: string;
  size: string;
  color: string;
  quantity: number;
  low_stock_threshold: number;
  purchase_price: number;
  sale_price: number;
  image_data: string;
}

export type StockMovementType = "entry" | "destock" | "adjustment" | "initial";

export interface StockMovementInput {
  product_id: number;
  movement_type: "entry" | "destock";
  quantity: number;
  purchase_price: number;
  note: string;
}

export interface StockMovement {
  id: number;
  product_id: number;
  product_name: string;
  barcode: string;
  movement_type: StockMovementType;
  quantity: number;
  before_quantity: number;
  after_quantity: number;
  unit_purchase_price: number;
  note: string;
  created_at: string;
}

export interface Supplier {
  id: number;
  name: string;
  phone: string;
  address: string;
  note: string;
  active: boolean;
  total_purchases: number;
  total_paid: number;
  remaining_amount: number;
  last_purchase_at: string;
  created_at: string;
}

export interface SupplierInput {
  id?: number;
  name: string;
  phone: string;
  address: string;
  note: string;
  active: boolean;
}

export interface PurchaseOrderItem {
  id: number;
  product_id: number;
  product_name: string;
  barcode: string;
  quantity: number;
  unit_purchase_price: number;
  line_total: number;
}

export interface PurchaseOrderItemInput {
  product_id: number;
  quantity: number;
  unit_purchase_price: number;
}

export interface SupplierPayment {
  id: number;
  supplier_id: number;
  supplier_name: string;
  purchase_order_id: number;
  bon_no: string;
  shift_id?: number;
  amount: number;
  note: string;
  cashier: string;
  paid_at: string;
}

export interface SupplierPaymentInput {
  purchase_order_id: number;
  amount: number;
  note: string;
  cashier: string;
}

export interface PurchaseOrder {
  id: number;
  bon_no: string;
  supplier_id: number;
  supplier_name: string;
  subtotal: number;
  paid_amount: number;
  remaining_amount: number;
  status: "draft" | "confirmed" | "paid";
  note: string;
  cashier: string;
  created_at: string;
  confirmed_at: string;
  items: PurchaseOrderItem[];
  payments: SupplierPayment[];
}

export interface PurchaseOrderInput {
  id?: number;
  supplier_id: number;
  note: string;
  cashier: string;
  items: PurchaseOrderItemInput[];
}

export type ProductStockFilter = "all" | "available" | "low" | "out";

export interface ProductFilters {
  query?: string;
  category?: string;
  stock?: ProductStockFilter;
}

export interface Expense {
  id: number;
  shift_id?: number;
  label: string;
  category: string;
  amount: number;
  note: string;
  expense_date: string;
  created_at: string;
}

export interface ExpenseInput {
  id?: number;
  label: string;
  category: string;
  amount: number;
  note: string;
  expense_date: string;
}

export interface DashboardStats {
  sales_today: number;
  sales_count_today: number;
  revenue_today: number;
  expenses_today: number;
  profit_today: number;
  sales_yesterday: number;
  sales_count_yesterday: number;
  revenue_yesterday: number;
  expenses_yesterday: number;
  profit_yesterday: number;
  low_stock_count: number;
  open_credit_count: number;
  credit_remaining_total: number;
  credit_payments_today: number;
  credit_payments_yesterday: number;
  delivery_pending_count: number;
  delivery_pending_total: number;
  delivery_collected_today: number;
}

export type ReportPeriod = "daily" | "weekly" | "monthly";

export interface ReportFilter {
  period: ReportPeriod;
  from_date: string;
  to_date: string;
}

export interface ReportSummary {
  entry: number;
  sortie: number;
  profit: number;
  buying_total: number;
  selling_total: number;
  gain_total: number;
  sales_count: number;
  average_ticket: number;
  credit_collected: number;
  credit_remaining: number;
  delivery_pending_total: number;
  delivery_pending_count: number;
  delivery_collected: number;
  supplier_purchases: number;
  supplier_payments: number;
  supplier_remaining: number;
  stock_purchase_value: number;
  stock_sale_value: number;
}

export interface ReportBucket {
  label: string;
  start_date: string;
  end_date: string;
  entry: number;
  sortie: number;
  profit: number;
  buying: number;
  selling: number;
  gain: number;
  sales_count: number;
}

export interface ReportTopItem {
  name: string;
  quantity: number;
  total: number;
}

export interface ReportData {
  period: ReportPeriod;
  from_date: string;
  to_date: string;
  summary: ReportSummary;
  buckets: ReportBucket[];
  top_products: ReportTopItem[];
  advice: string[];
}

export interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
}

export interface Flacon {
  id: number;
  name: string;
  flacon_type: "x1" | "x2" | "x3";
  volume_ml: number;
  sale_price: number;
  active: boolean;
  created_at: string;
}

export interface FlaconInput {
  id?: number;
  name: string;
  flacon_type: "x1" | "x2" | "x3";
  volume_ml: number;
  sale_price: number;
  active: boolean;
}

export interface PerfumePurchase {
  id: number;
  perfume_id?: number;
  perfume_name: string;
  title: string;
  amount: number;
  volume_ml: number;
  note: string;
  created_at: string;
}

export interface PerfumePurchaseInput {
  perfume_id?: number;
  title: string;
  amount: number;
  volume_ml: number;
  note: string;
}

export interface PerfumePrice {
  flacon_id: number;
  flacon_name: string;
  volume_ml: number;
  sale_price: number;
}

export interface Perfume {
  id: number;
  name: string;
  family: string;
  total_volume_ml: number;
  remaining_volume_ml: number;
  total_purchase_price: number;
  cost_per_ml: number;
  low_stock_ml: number;
  created_at: string;
  updated_at: string;
  prices: PerfumePrice[];
}

export interface PerfumePriceInput {
  flacon_id: number;
  sale_price: number;
}

export interface PerfumeInput {
  id?: number;
  name: string;
  family: string;
  added_volume_ml: number;
  total_purchase_price: number;
  low_stock_ml: number;
  prices: PerfumePriceInput[];
}

export interface PerfumeCartItem {
  perfume: Perfume;
  price: PerfumePrice;
  quantity: number;
}

export interface CheckoutInput {
  items: Array<{ product_id: number; quantity: number; unit_price: number }>;
  perfume_items: Array<{ perfume_id: number; flacon_id: number; quantity: number }>;
  discount: number;
  sale_type: "cash" | "credit" | "delivery";
  paid_amount: number;
  sale_date: string;
  customer_name: string;
  customer_phone: string;
  due_date: string;
  credit_note: string;
  cashier: string;
}

export interface SaleItemUpdateInput {
  product_id: number;
  quantity: number;
  unit_price: number;
}

export interface SaleUpdateInput {
  sale_id: number;
  items: SaleItemUpdateInput[];
}

export interface SaleReturnInput {
  sale_id: number;
  product_id: number;
  quantity: number;
}

export interface SaleItem {
  product_id: number;
  product_name: string;
  barcode: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface Sale {
  id: number;
  shift_id?: number;
  receipt_no: string;
  subtotal: number;
  discount: number;
  total: number;
  profit: number;
  payment_method: string;
  sale_type: "cash" | "credit" | "delivery";
  customer_name: string;
  customer_phone: string;
  paid_amount: number;
  remaining_amount: number;
  due_date: string;
  credit_note: string;
  credit_status: "open" | "partial" | "paid" | "delivery_pending" | "delivery_paid" | "delivery_returned";
  cashier: string;
  created_at: string;
  collected_at?: string;
  items: SaleItem[];
}

export interface CreditPayment {
  id: number;
  shift_id?: number;
  sale_id: number;
  amount: number;
  note: string;
  paid_at: string;
  cashier: string;
}

export interface CreditPaymentInput {
  sale_id: number;
  amount: number;
  note: string;
  cashier: string;
}

export interface CreditAccount {
  sale: Sale;
  payments: CreditPayment[];
}

export interface CashShift {
  id: number;
  opened_at: string;
  closed_at: string;
  auto_close_at: string;
  opening_amount: number;
  closing_amount: number;
  expected_amount: number;
  cash_sales: number;
  credit_payments: number;
  expenses: number;
  supplier_payments: number;
  status: "open" | "closed";
  cashier: string;
}

export interface OpenShiftInput {
  opening_amount: number;
  cashier: string;
}

export interface CloseShiftInput {
  id: number;
}

export interface BarcodePrintInput {
  product_name: string;
  barcode: string;
  price: number;
  count: number;
}
