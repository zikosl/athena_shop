export type Language = "fr" | "ar";
export type ViewKey = "dashboard" | "stock" | "pos" | "revenue" | "expenses" | "credits" | "settings";

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
}

export interface CheckoutInput {
  items: Array<{ product_id: number; quantity: number }>;
  discount: number;
  sale_type: "cash" | "credit";
  paid_amount: number;
  customer_name: string;
  customer_phone: string;
  due_date: string;
  credit_note: string;
  cashier: string;
}

export interface SaleItemUpdateInput {
  product_id: number;
  quantity: number;
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
