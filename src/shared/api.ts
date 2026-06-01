import { invoke } from "@tauri-apps/api/core";
import {
  CheckoutInput,
  CreditAccount,
  CreditPaymentInput,
  DashboardStats,
  Expense,
  ExpenseInput,
  PostgresConfig,
  Product,
  ProductFilters,
  ProductInput,
  Sale,
  UserSession
} from "./types";
import { todayInputValue } from "./format";

const isTauri = "__TAURI_INTERNALS__" in window;

type Db = {
  products: Product[];
  expenses: Expense[];
  sales: Sale[];
  creditPayments: CreditAccount["payments"];
};

const seed: Db = {
  products: [
    sampleProduct(1, "Pyjama satin noir", "AS100001", "Home Wear", "M", "Noir", 18, 4, 1800, 3450),
    sampleProduct(2, "Robe de chambre dorée", "AS100002", "Loungewear", "L", "Gold", 7, 3, 2600, 5200),
    sampleProduct(3, "Ensemble coton doux", "AS100003", "Home Wear", "S", "Ivoire", 24, 5, 1400, 2900),
    sampleProduct(4, "Pantoufles premium", "AS100004", "Accessoires", "38", "Beige", 3, 4, 900, 1850)
  ],
  expenses: [],
  sales: [],
  creditPayments: []
};

function sampleProduct(
  id: number,
  name: string,
  barcode: string,
  category: string,
  size: string,
  color: string,
  quantity: number,
  low: number,
  purchase: number,
  sale: number
): Product {
  const now = new Date().toISOString();
  return {
    id,
    name,
    barcode,
    category,
    size,
    color,
    quantity,
    low_stock_threshold: low,
    purchase_price: purchase,
    sale_price: sale,
    created_at: now,
    updated_at: now
  };
}

function readDb(): Db {
  const raw = localStorage.getItem("anna-store-demo-db");
  if (!raw) {
    localStorage.setItem("anna-store-demo-db", JSON.stringify(seed));
    return structuredClone(seed);
  }
  const parsed = JSON.parse(raw) as Partial<Db>;
  return {
    products: parsed.products ?? seed.products,
    expenses: parsed.expenses ?? [],
    sales: (parsed.sales ?? []).map(normalizeSale),
    creditPayments: parsed.creditPayments ?? []
  };
}

function normalizeSale(sale: Sale): Sale {
  return {
    ...sale,
    payment_method: "Espèces",
    sale_type: sale.sale_type ?? "cash",
    customer_name: sale.customer_name ?? "",
    customer_phone: sale.customer_phone ?? "",
    paid_amount: sale.paid_amount ?? sale.total,
    remaining_amount: sale.remaining_amount ?? 0,
    due_date: sale.due_date ?? "",
    credit_note: sale.credit_note ?? "",
    credit_status: sale.credit_status ?? "paid"
  };
}

function writeDb(db: Db) {
  localStorage.setItem("anna-store-demo-db", JSON.stringify(db));
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) return invoke<T>(command, args);
  return mockCall<T>(command, args);
}

async function mockCall<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const db = readDb();

  if (command === "login") {
    const input = args?.input as { username: string; password: string };
    if (input.username === "admin" && input.password === "admin123") {
      return {
        id: 1,
        username: "admin",
        display_name: "Administrateur",
        role: "Super Admin"
      } as T;
    }
    throw new Error("Identifiants invalides");
  }

  if (command === "save_database") {
    writeDb(db);
    return undefined as T;
  }

  if (command === "list_products") {
    const query = String(args?.query ?? "").trim().toLowerCase();
    const category = String(args?.category ?? "").trim().toLowerCase();
    const stock = String(args?.stock ?? "all");
    return db.products.filter((product) => {
      const matchesQuery = !query || [product.name, product.barcode, product.category, product.size, product.color]
        .some((value) => value.toLowerCase().includes(query));
      const matchesCategory = !category || product.category.toLowerCase() === category;
      const matchesStock =
        stock === "available" ? product.quantity > product.low_stock_threshold :
        stock === "low" ? product.quantity > 0 && product.quantity <= product.low_stock_threshold :
        stock === "out" ? product.quantity <= 0 :
        true;
      return matchesQuery && matchesCategory && matchesStock;
    }) as T;
  }

  if (command === "save_product") {
    const input = args?.input as ProductInput;
    const now = new Date().toISOString();
    if (input.id) {
      db.products = db.products.map((product) =>
        product.id === input.id ? { ...product, ...input, updated_at: now } as Product : product
      );
      writeDb(db);
      return db.products.find((product) => product.id === input.id) as T;
    }
    const product = { ...input, id: Date.now(), created_at: now, updated_at: now } as Product;
    db.products.unshift(product);
    writeDb(db);
    return product as T;
  }

  if (command === "delete_product") {
    db.products = db.products.filter((product) => product.id !== args?.id);
    writeDb(db);
    return undefined as T;
  }

  if (command === "save_expense") {
    const input = args?.input as ExpenseInput;
    const expense = {
      ...input,
      id: input.id ?? Date.now(),
      created_at: new Date().toISOString()
    } as Expense;
    db.expenses = input.id
      ? db.expenses.map((item) => item.id === input.id ? expense : item)
      : [expense, ...db.expenses];
    writeDb(db);
    return expense as T;
  }

  if (command === "list_expenses") return db.expenses as T;

  if (command === "delete_expense") {
    db.expenses = db.expenses.filter((expense) => expense.id !== args?.id);
    writeDb(db);
    return undefined as T;
  }

  if (command === "checkout") {
    const input = args?.input as CheckoutInput;
    const items = input.items.map((item) => {
      const product = db.products.find((candidate) => candidate.id === item.product_id);
      if (!product) throw new Error("Produit introuvable");
      if (product.quantity < item.quantity) throw new Error(`Stock insuffisant pour ${product.name}`);
      product.quantity -= item.quantity;
      return {
        product_id: product.id,
        product_name: product.name,
        barcode: product.barcode,
        quantity: item.quantity,
        unit_price: product.sale_price,
        line_total: product.sale_price * item.quantity
      };
    });
    const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);
    const total = Math.max(0, subtotal - input.discount);
    if (input.sale_type === "credit" && !input.customer_name.trim()) throw new Error("Nom client obligatoire pour un crédit");
    if (input.paid_amount > total) throw new Error("Le montant payé dépasse le total");
    const paid = input.sale_type === "cash" ? total : input.paid_amount;
    const remaining = Math.max(0, total - paid);
    const sale: Sale = {
      id: Date.now(),
      receipt_no: `AS-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`,
      subtotal,
      discount: input.discount,
      total,
      profit: total,
      payment_method: "Espèces",
      sale_type: input.sale_type,
      customer_name: input.customer_name,
      customer_phone: input.customer_phone,
      paid_amount: paid,
      remaining_amount: remaining,
      due_date: input.due_date,
      credit_note: input.credit_note,
      credit_status: remaining <= 0 ? "paid" : paid > 0 ? "partial" : "open",
      cashier: input.cashier,
      created_at: new Date().toISOString(),
      items
    };
    db.sales.unshift(sale);
    writeDb(db);
    return sale as T;
  }

  if (command === "list_sales") return db.sales as T;

  if (command === "list_credits") {
    return db.sales
      .filter((sale) => sale.sale_type === "credit")
      .map((sale) => ({
        sale,
        payments: db.creditPayments.filter((payment) => payment.sale_id === sale.id)
      })) as T;
  }

  if (command === "add_credit_payment") {
    const input = args?.input as CreditPaymentInput;
    const sale = db.sales.find((item) => item.id === input.sale_id);
    if (!sale) throw new Error("Crédit introuvable");
    if (input.amount <= 0) throw new Error("Montant de versement invalide");
    if (input.amount > sale.remaining_amount) throw new Error("Le versement dépasse le reste à payer");
    sale.paid_amount += input.amount;
    sale.remaining_amount = Math.max(0, sale.remaining_amount - input.amount);
    sale.credit_status = sale.remaining_amount <= 0 ? "paid" : "partial";
    db.creditPayments.unshift({
      id: Date.now(),
      sale_id: sale.id,
      amount: input.amount,
      note: input.note,
      cashier: input.cashier,
      paid_at: new Date().toISOString()
    });
    writeDb(db);
    return {
      sale,
      payments: db.creditPayments.filter((payment) => payment.sale_id === sale.id)
    } as T;
  }

  if (command === "get_dashboard") {
    const today = todayInputValue();
    const sales = db.sales.filter((sale) => sale.created_at.slice(0, 10) === today);
    const expenses = db.expenses.filter((expense) => expense.expense_date === today);
    const paymentsToday = db.creditPayments
      .filter((payment) => payment.paid_at.slice(0, 10) === today)
      .reduce((sum, payment) => sum + payment.amount, 0);
    const revenue = sales.reduce((sum, sale) => sum + (sale.paid_amount ?? sale.total), 0) + paymentsToday;
    const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    return {
      sales_today: revenue,
      sales_count_today: sales.length,
      revenue_today: revenue,
      expenses_today: expenseTotal,
      profit_today: revenue - expenseTotal,
      low_stock_count: db.products.filter((product) => product.quantity <= product.low_stock_threshold).length,
      open_credit_count: db.sales.filter((sale) => sale.sale_type === "credit" && sale.remaining_amount > 0).length,
      credit_remaining_total: db.sales.reduce((sum, sale) => sum + (sale.remaining_amount ?? 0), 0),
      credit_payments_today: paymentsToday
    } as T;
  }

  throw new Error(`Commande non disponible: ${command}`);
}

export const api = {
  isDatabaseConfigured: () => isTauri ? call<boolean>("is_database_configured") : Promise.resolve(true),
  configureDatabase: (input: PostgresConfig) => call<void>("configure_database", { input }),
  login: (username: string, password: string) => call<UserSession>("login", { input: { username, password } }),
  saveNow: () => call<void>("save_database"),
  dashboard: () => call<DashboardStats>("get_dashboard"),
  products: (filters: string | ProductFilters = "") => {
    const normalized = typeof filters === "string" ? { query: filters } : filters;
    return call<Product[]>("list_products", {
      query: normalized.query ?? "",
      category: normalized.category ?? "",
      stock: normalized.stock ?? "all"
    });
  },
  saveProduct: (input: ProductInput) => call<Product>("save_product", { input }),
  deleteProduct: (id: number) => call<void>("delete_product", { id }),
  expenses: () => call<Expense[]>("list_expenses"),
  saveExpense: (input: ExpenseInput) => call<Expense>("save_expense", { input }),
  deleteExpense: (id: number) => call<void>("delete_expense", { id }),
  checkout: (input: CheckoutInput) => call<Sale>("checkout", { input }),
  sales: () => call<Sale[]>("list_sales"),
  credits: () => call<CreditAccount[]>("list_credits"),
  addCreditPayment: (input: CreditPaymentInput) => call<CreditAccount>("add_credit_payment", { input })
};
