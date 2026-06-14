export type Language = "fr" | "ar";
export type ViewKey = "dashboard" | "stock" | "perfumery" | "pos" | "revenue" | "expenses" | "credits" | "settings";

export interface UserSession {
  id: number;
  username: string;
  display_name: string;
  role: string;
}

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface PrinterSettings {
  invoice_printer: string;
  barcode_printer: string;
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
}

export type ProductStockFilter = "all" | "available" | "low" | "out";

export interface ProductFilters {
  query?: string;
  category?: string;
  stock?: ProductStockFilter;
}

export interface Expense {
  id: number;
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
  low_stock_count: number;
  open_credit_count: number;
  credit_remaining_total: number;
  credit_payments_today: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
}

export interface Flacon {
  id: number;
  name: string;
  volume_ml: number;
  active: boolean;
  created_at: string;
}

export interface FlaconInput {
  id?: number;
  name: string;
  volume_ml: number;
  active: boolean;
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
  unit_price: number;
}

export interface CheckoutInput {
  items: Array<{ product_id: number; quantity: number; unit_price: number }>;
  perfume_items: Array<{ perfume_id: number; flacon_id: number; quantity: number; unit_price: number }>;
  discount: number;
  sale_type: "cash" | "credit";
  paid_amount: number;
  customer_name: string;
  customer_phone: string;
  due_date: string;
  credit_note: string;
  cashier: string;
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
  receipt_no: string;
  subtotal: number;
  discount: number;
  total: number;
  profit: number;
  payment_method: string;
  sale_type: "cash" | "credit";
  customer_name: string;
  customer_phone: string;
  paid_amount: number;
  remaining_amount: number;
  due_date: string;
  credit_note: string;
  credit_status: "open" | "partial" | "paid";
  cashier: string;
  created_at: string;
  items: SaleItem[];
}

export interface CreditPayment {
  id: number;
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
