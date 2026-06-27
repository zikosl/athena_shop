import { invoke } from "@tauri-apps/api/core";
import {
  AppSettings,
  BarcodePrintInput,
  CashShift,
  CheckoutInput,
  CloseShiftInput,
  CreditAccount,
  CreditPaymentInput,
  DashboardStats,
  Expense,
  ExpenseInput,
  Flacon,
  FlaconInput,
  Perfume,
  PerfumeInput,
  PerfumePurchase,
  PerfumePurchaseInput,
  PostgresConfig,
  ProfileInput,
  Product,
  ProductFilters,
  ProductInput,
  PurchaseOrder,
  PurchaseOrderInput,
  Supplier,
  SupplierInput,
  SupplierPayment,
  SupplierPaymentInput,
  StockMovement,
  StockMovementInput,
  OpenShiftInput,
  ReportData,
  ReportFilter,
  Sale,
  SaleReturnInput,
  SaleUpdateInput,
  UserSession
} from "./types";
import { dateInputValue, todayInputValue } from "./format";

const isTauri = "__TAURI_INTERNALS__" in window;
const demoDbKey = "opensoft-demo-db";
const legacyDemoDbKeys = ["athena-shop-demo-db", "denzel-pos-demo-db"] as const;

function defaultSettings(): AppSettings {
  return {
    allow_negative_stock: true,
    cash_register_auto_close_time: "23:59",
    max_discount_amount: 200,
    invoice_printer: "",
    barcode_printer: "",
    receipt_title: "OpenSoft",
    receipt_subtitle: "حلول إدارة الأعمال من OpenZey",
    show_invoice_logo: true,
    ticket_width_chars: 32,
    barcode_label_width_mm: 40,
    barcode_label_height_mm: 20,
    barcode_darkness: 5,
    barcode_speed: "slow",
    theme_primary_color: "#2563eb",
    ui_font_scale: "normal",
    ui_zoom: 100,
    ui_density: "comfortable",
    pos_layout: "auto",
    pos_cart_width: 320
  };
}

type Db = {
  products: Product[];
  expenses: Expense[];
  sales: Sale[];
  creditPayments: CreditAccount["payments"];
  flacons: Flacon[];
  perfumes: Perfume[];
  perfumePurchases: PerfumePurchase[];
  shifts: CashShift[];
  stockMovements: StockMovement[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  supplierPayments: SupplierPayment[];
  settings: AppSettings;
};

const seed: Db = {
  products: [
    sampleProduct(1, "قميص رجالي كلاسيكي", "AS100001", "أقمصة", "M", "أبيض", 18, 4, 1800, 3450),
    sampleProduct(2, "قميص فاخر", "AS100002", "أقمصة", "L", "أخضر", 7, 3, 2600, 5200),
    sampleProduct(3, "عطر مسك", "AS100003", "عطور", "12ml", "أبيض", 24, 5, 1400, 2900),
    sampleProduct(4, "قارورة عطر", "AS100004", "إكسسوارات", "30ml", "شفاف", 3, 4, 900, 1850)
  ],
  expenses: [],
  sales: [],
  creditPayments: [],
  flacons: [
    { id: 1, name: "6ml", flacon_type: "x1", volume_ml: 6, sale_price: 500, active: true, created_at: new Date().toISOString() },
    { id: 2, name: "12ml", flacon_type: "x1", volume_ml: 12, sale_price: 900, active: true, created_at: new Date().toISOString() },
    { id: 3, name: "30ml", flacon_type: "x1", volume_ml: 30, sale_price: 1800, active: true, created_at: new Date().toISOString() }
  ],
  perfumes: [],
  perfumePurchases: [],
  shifts: [],
  stockMovements: [],
  suppliers: [],
  purchaseOrders: [],
  supplierPayments: [],
  settings: defaultSettings()
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
    image_data: "",
    created_at: now,
    updated_at: now
  };
}

function readDb(): Db {
  const legacyRaw = legacyDemoDbKeys.map((key) => localStorage.getItem(key)).find(Boolean);
  const raw = localStorage.getItem(demoDbKey) ?? legacyRaw;
  if (!raw) {
    localStorage.setItem(demoDbKey, JSON.stringify(seed));
    return structuredClone(seed);
  }
  if (!localStorage.getItem(demoDbKey)) localStorage.setItem(demoDbKey, raw);
  const parsed = JSON.parse(raw) as Partial<Db>;
  return {
    products: (parsed.products ?? seed.products).map(normalizeProduct),
    expenses: parsed.expenses ?? [],
    sales: (parsed.sales ?? []).map(normalizeSale),
    creditPayments: parsed.creditPayments ?? [],
    flacons: (parsed.flacons ?? seed.flacons).map(normalizeFlacon),
    perfumes: parsed.perfumes ?? [],
    perfumePurchases: parsed.perfumePurchases ?? [],
    shifts: parsed.shifts ?? [],
    stockMovements: parsed.stockMovements ?? [],
    suppliers: parsed.suppliers ?? [],
    purchaseOrders: parsed.purchaseOrders ?? [],
    supplierPayments: parsed.supplierPayments ?? [],
    settings: {
      allow_negative_stock: parsed.settings?.allow_negative_stock ?? true,
      cash_register_auto_close_time: parsed.settings?.cash_register_auto_close_time ?? "23:59",
      max_discount_amount: parsed.settings?.max_discount_amount ?? 200,
      invoice_printer: parsed.settings?.invoice_printer ?? "",
      barcode_printer: parsed.settings?.barcode_printer ?? "",
      receipt_title: parsed.settings?.receipt_title ?? "OpenSoft",
      receipt_subtitle: parsed.settings?.receipt_subtitle ?? "حلول إدارة الأعمال من OpenZey",
      show_invoice_logo: parsed.settings?.show_invoice_logo ?? true,
      ticket_width_chars: Math.min(48, Math.max(24, Number(parsed.settings?.ticket_width_chars ?? 32))),
      barcode_label_width_mm: Math.min(100, Math.max(20, Number(parsed.settings?.barcode_label_width_mm ?? 40))),
      barcode_label_height_mm: Math.min(80, Math.max(10, Number(parsed.settings?.barcode_label_height_mm ?? 20))),
      barcode_darkness: Math.min(5, Math.max(1, Number(parsed.settings?.barcode_darkness ?? 5))),
      barcode_speed: ["slow", "normal", "fast"].includes(parsed.settings?.barcode_speed ?? "")
        ? (parsed.settings?.barcode_speed as AppSettings["barcode_speed"])
        : "slow",
      theme_primary_color: /^#[0-9a-f]{6}$/i.test(parsed.settings?.theme_primary_color ?? "")
        ? parsed.settings!.theme_primary_color
        : "#2563eb",
      ui_font_scale: parsed.settings?.ui_font_scale ?? "normal",
      ui_zoom: Math.min(125, Math.max(80, Number(parsed.settings?.ui_zoom ?? 100))),
      ui_density: parsed.settings?.ui_density ?? "comfortable",
      pos_layout: parsed.settings?.pos_layout ?? "auto",
      pos_cart_width: parsed.settings?.pos_cart_width ?? 320
    }
  };
}

function normalizeProduct(product: Product): Product {
  return {
    ...product,
    image_data: product.image_data ?? ""
  };
}

function normalizeFlacon(flacon: Flacon): Flacon {
  return {
    ...flacon,
    flacon_type: flacon.flacon_type ?? "x1",
    sale_price: flacon.sale_price ?? 0
  };
}

function normalizeSale(sale: Sale): Sale {
  return {
    ...sale,
    payment_method: "نقدا",
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
  localStorage.setItem(demoDbKey, JSON.stringify(db));
}

function makeEmptyDb(): Db {
  return {
    products: [],
    expenses: [],
    sales: [],
    creditPayments: [],
    flacons: [],
    perfumes: [],
    perfumePurchases: [],
    shifts: [],
    stockMovements: [],
    suppliers: [],
    purchaseOrders: [],
    supplierPayments: [],
    settings: defaultSettings()
  };
}

function makeDummyDb(): Db {
  const today = new Date();
  const date = (daysAgo: number) => {
    const next = new Date(today);
    next.setDate(today.getDate() - daysAgo);
    return next.toISOString();
  };
  const products = [
    sampleProduct(1, "بيجامة ساتان سوداء", "AS-DEMO-001", "Products", "M", "أسود", 18, 4, 1800, 3400),
    sampleProduct(2, "طقم قطن كريمي", "AS-DEMO-002", "Products", "L", "كريمي", 22, 5, 1400, 2800),
    sampleProduct(3, "فستان منزلي مزهر", "AS-DEMO-003", "Products", "M", "وردي", 8, 3, 2100, 4300),
    sampleProduct(4, "نعال ناعمة", "AS-DEMO-004", "إكسسوارات", "38", "بيج", 5, 4, 700, 1600),
    sampleProduct(5, "كيس هدية", "AS-DEMO-005", "إكسسوارات", "عادي", "ذهبي", 35, 8, 120, 350),
    sampleProduct(6, "كيمونو فاخر", "AS-DEMO-006", "Products", "XL", "زيتوني", 3, 4, 3200, 6500),
    sampleProduct(7, "مسك أبيض 12مل", "AS-DEMO-007", "Perfumerie", "12ml", "أبيض", 16, 5, 650, 1500),
    sampleProduct(8, "عطر عود 30مل", "AS-DEMO-008", "Perfumerie", "30ml", "عنبر", 9, 3, 1900, 4200)
  ];
  const sales: Sale[] = [
    demoSale(1, "AS-DEMO-0001", date(6), "cash", 6200, 0, 6200, 3200, 6200, 0, "", "", "paid", [
      demoItem(1, "بيجامة ساتان سوداء", "AS-DEMO-001", 1, 3400),
      demoItem(2, "طقم قطن كريمي", "AS-DEMO-002", 1, 2800)
    ]),
    demoSale(2, "AS-DEMO-0002", date(4), "credit", 8600, 200, 8400, 4200, 6000, 2400, "Samira", "0555000001", "partial", [
      demoItem(3, "فستان منزلي مزهر", "AS-DEMO-003", 2, 4300)
    ]),
    demoSale(3, "AS-DEMO-0003", date(1), "cash", 6150, 0, 6150, 2780, 6150, 0, "", "", "paid", [
      demoItem(7, "مسك أبيض 12مل", "AS-DEMO-007", 3, 1500),
      demoItem(4, "نعال ناعمة", "AS-DEMO-004", 1, 1600),
      demoItem(5, "كيس هدية", "AS-DEMO-005", 1, 50)
    ]),
    demoSale(4, "AS-DEMO-0004", date(0), "credit", 10800, 0, 10800, 5200, 4000, 6800, "Nadia", "0555000002", "partial", [
      demoItem(6, "كيمونو فاخر", "AS-DEMO-006", 1, 6500),
      demoItem(8, "عطر عود 30مل", "AS-DEMO-008", 1, 4200),
      demoItem(5, "كيس هدية", "AS-DEMO-005", 1, 100)
    ]),
    demoSale(5, "AS-DEMO-0005", date(0), "cash", 3150, 0, 3150, 1730, 3150, 0, "", "", "paid", [
      demoItem(2, "طقم قطن كريمي", "AS-DEMO-002", 1, 2800),
      demoItem(5, "كيس هدية", "AS-DEMO-005", 1, 350)
    ])
  ];
  return {
    products,
    expenses: [
      { id: 1, label: "كراء المحل", category: "ثابت", amount: 18000, note: "بيانات تجريبية", expense_date: date(2).slice(0, 10), created_at: date(2) },
      { id: 2, label: "إعلانات إنستغرام", category: "تسويق", amount: 4200, note: "حملة تجريبية", expense_date: date(1).slice(0, 10), created_at: date(1) },
      { id: 3, label: "أكياس وتغليف", category: "لوازم", amount: 2300, note: "مخزون التغليف", expense_date: date(0).slice(0, 10), created_at: date(0) },
      { id: 4, label: "توصيل المورد", category: "نقل", amount: 3100, note: "استلام البضاعة", expense_date: date(12).slice(0, 10), created_at: date(12) },
      { id: 5, label: "تنظيف المحل", category: "خدمة", amount: 1200, note: "صيانة", expense_date: date(20).slice(0, 10), created_at: date(20) }
    ],
    sales,
    creditPayments: [
      { id: 1, sale_id: 2, amount: 3000, note: "دفعة تجريبية", cashier: "المدير", paid_at: date(2) }
    ],
    flacons: seed.flacons,
    perfumes: [],
    perfumePurchases: [],
    shifts: [],
    stockMovements: [],
    suppliers: [],
    purchaseOrders: [],
    supplierPayments: [],
    settings: defaultSettings()
  };
}

function demoItem(productId: number, productName: string, barcode: string, quantity: number, unitPrice: number) {
  return {
    product_id: productId,
    product_name: productName,
    barcode,
    quantity,
    unit_price: unitPrice,
    line_total: unitPrice * quantity
  };
}

function demoSale(
  id: number,
  receiptNo: string,
  createdAt: string,
  saleType: "cash" | "credit",
  subtotal: number,
  discount: number,
  total: number,
  profit: number,
  paidAmount: number,
  remainingAmount: number,
  customerName: string,
  customerPhone: string,
  creditStatus: "open" | "partial" | "paid",
  items: Sale["items"]
): Sale {
  return {
    id,
    receipt_no: receiptNo,
    subtotal,
    discount,
    total,
    profit,
    payment_method: "نقدا",
    sale_type: saleType,
    customer_name: customerName,
    customer_phone: customerPhone,
    paid_amount: paidAmount,
    remaining_amount: remainingAmount,
    due_date: "",
    credit_note: "بيانات تجريبية",
    credit_status: creditStatus,
    cashier: "المدير",
    created_at: createdAt,
    items
  };
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
        display_name: "المدير",
        role: "Super Admin"
      } as T;
    }
    throw new Error("Identifiants invalides");
  }

  if (command === "update_profile") {
    const input = args?.input as ProfileInput;
    if (!input.username.trim() || !input.display_name.trim()) {
      throw new Error("Utilisateur et nom affiché obligatoires");
    }
    return {
      id: input.id,
      username: input.username.trim(),
      display_name: input.display_name.trim(),
      role: "Super Admin"
    } as T;
  }

  if (command === "save_database") {
    writeDb(db);
    return undefined as T;
  }

  if (command === "get_app_settings") {
    return db.settings as T;
  }

  if (command === "save_app_settings") {
    const input = args?.input as AppSettings;
    db.settings = {
      allow_negative_stock: Boolean(input.allow_negative_stock),
      cash_register_auto_close_time: input.cash_register_auto_close_time || "23:59",
      max_discount_amount: Math.max(0, Number(input.max_discount_amount || 0)),
      invoice_printer: input.invoice_printer ?? "",
      barcode_printer: input.barcode_printer ?? "",
      receipt_title: input.receipt_title?.trim() || "OpenSoft",
      receipt_subtitle: input.receipt_subtitle?.trim() || "حلول إدارة الأعمال من OpenZey",
      show_invoice_logo: input.show_invoice_logo ?? true,
      ticket_width_chars: Math.min(48, Math.max(24, Number(input.ticket_width_chars || 32))),
      barcode_label_width_mm: Math.min(100, Math.max(20, Number(input.barcode_label_width_mm || 40))),
      barcode_label_height_mm: Math.min(80, Math.max(10, Number(input.barcode_label_height_mm || 20))),
      barcode_darkness: Math.min(5, Math.max(1, Number(input.barcode_darkness || 5))),
      barcode_speed: ["slow", "normal", "fast"].includes(input.barcode_speed) ? input.barcode_speed : "slow",
      theme_primary_color: /^#[0-9a-f]{6}$/i.test(input.theme_primary_color) ? input.theme_primary_color : "#2563eb",
      ui_font_scale: input.ui_font_scale ?? "normal",
      ui_zoom: Math.min(125, Math.max(80, Number(input.ui_zoom || 100))),
      ui_density: input.ui_density ?? "comfortable",
      pos_layout: input.pos_layout ?? "auto",
      pos_cart_width: Math.min(420, Math.max(280, Number(input.pos_cart_width || 320)))
    };
    writeDb(db);
    return db.settings as T;
  }

  if (command === "list_printers") {
    return ["Imprimante ticket POS", "Imprimante codes-barres"] as T;
  }

  if (command === "list_flacons") return db.flacons as T;

  if (command === "save_flacon") {
    const input = args?.input as FlaconInput;
    const flacon = {
      id: input.id ?? Date.now(),
      name: input.name,
      flacon_type: input.flacon_type ?? "x1",
      volume_ml: input.volume_ml,
      sale_price: input.sale_price,
      active: input.active,
      created_at: new Date().toISOString()
    };
    db.flacons = input.id ? db.flacons.map((item) => item.id === input.id ? flacon : item) : [...db.flacons, flacon];
    db.perfumes = db.perfumes.map((perfume) => ({
      ...perfume,
      prices: [
        ...perfume.prices.filter((price) => price.flacon_id !== flacon.id),
        {
          flacon_id: flacon.id,
          flacon_name: `${flacon.name} ${flacon.flacon_type}`,
          volume_ml: flacon.volume_ml,
          sale_price: flacon.sale_price
        }
      ].sort((a, b) => a.volume_ml - b.volume_ml || a.flacon_name.localeCompare(b.flacon_name))
    }));
    writeDb(db);
    return flacon as T;
  }

  if (command === "list_perfumes") {
    return db.perfumes.map((perfume) => ({
      ...perfume,
      prices: db.flacons
        .filter((flacon) => flacon.active)
        .map((flacon) => {
          const saved = perfume.prices.find((price) => price.flacon_id === flacon.id);
          return {
            flacon_id: flacon.id,
            flacon_name: `${flacon.name} ${flacon.flacon_type}`,
            volume_ml: flacon.volume_ml,
            sale_price: saved?.sale_price || flacon.sale_price
          };
        })
    })) as T;
  }

  if (command === "save_perfume") {
    const input = args?.input as PerfumeInput;
    const existing = input.id ? db.perfumes.find((item) => item.id === input.id) : undefined;
    const totalVolume = (existing?.total_volume_ml ?? 0) + input.added_volume_ml;
    const remainingVolume = (existing?.remaining_volume_ml ?? 0) + input.added_volume_ml;
    const purchaseTotal = (existing?.total_purchase_price ?? 0) + input.total_purchase_price;
    const perfume: Perfume = {
      id: input.id ?? Date.now(),
      name: input.name,
      family: input.family,
      total_volume_ml: totalVolume,
      remaining_volume_ml: remainingVolume,
      total_purchase_price: purchaseTotal,
      cost_per_ml: totalVolume > 0 ? purchaseTotal / totalVolume : 0,
      low_stock_ml: input.low_stock_ml,
      created_at: existing?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      prices: db.flacons.filter((flacon) => flacon.active).map((flacon) => {
        const price = input.prices.find((item) => item.flacon_id === flacon.id);
        return {
          flacon_id: flacon.id,
          flacon_name: `${flacon.name} ${flacon.flacon_type}`,
          volume_ml: flacon.volume_ml,
          sale_price: price?.sale_price ?? flacon.sale_price
        };
      })
    };
    db.perfumes = existing ? db.perfumes.map((item) => item.id === perfume.id ? perfume : item) : [perfume, ...db.perfumes];
    writeDb(db);
    return perfume as T;
  }

  if (command === "list_perfume_purchases") {
    return db.perfumePurchases.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id) as T;
  }

  if (command === "save_perfume_purchase") {
    const input = args?.input as PerfumePurchaseInput;
    const perfume = input.perfume_id ? db.perfumes.find((item) => item.id === input.perfume_id) : undefined;
    if (perfume && input.volume_ml > 0) {
      perfume.total_volume_ml += input.volume_ml;
      perfume.remaining_volume_ml += input.volume_ml;
      perfume.total_purchase_price += input.amount;
      perfume.cost_per_ml = perfume.total_volume_ml > 0 ? perfume.total_purchase_price / perfume.total_volume_ml : 0;
      perfume.updated_at = new Date().toISOString();
    }
    const purchase: PerfumePurchase = {
      id: Date.now(),
      perfume_id: input.perfume_id,
      perfume_name: perfume?.name ?? "",
      title: input.title,
      amount: input.amount,
      volume_ml: input.volume_ml,
      note: input.note,
      created_at: new Date().toISOString()
    };
    db.perfumePurchases.unshift(purchase);
    writeDb(db);
    return purchase as T;
  }

  if (command === "reset_with_dummy_data") {
    writeDb(makeDummyDb());
    return undefined as T;
  }

  if (command === "empty_database") {
    writeDb(makeEmptyDb());
    return undefined as T;
  }

  if (command === "print_receipt_text") {
    console.info(args?.content);
    return undefined as T;
  }

  if (command === "print_barcode_labels") {
    console.info("print_barcode_labels", args?.input);
    return undefined as T;
  }

  if (command === "open_cash_drawer") {
    console.info("open_cash_drawer");
    return undefined as T;
  }

  if (command === "current_shift") {
    closeDueDemoShift(db);
    writeDb(db);
    return (activeDemoShift(db) ?? null) as T;
  }

  if (command === "open_shift") {
    closeDueDemoShift(db);
    if (activeDemoShift(db)) throw new Error("Une caisse est deja ouverte");
    const input = args?.input as OpenShiftInput;
    const now = new Date();
    const [hours, minutes] = (db.settings.cash_register_auto_close_time || "23:59").split(":").map(Number);
    const autoClose = new Date(now);
    autoClose.setHours(hours || 0, minutes || 0, 0, 0);
    if (autoClose <= now) autoClose.setDate(autoClose.getDate() + 1);
    const shift = buildDemoShift(db, {
      id: Date.now(),
      opened_at: now.toISOString(),
      closed_at: "",
      auto_close_at: autoClose.toISOString(),
      opening_amount: input.opening_amount,
      closing_amount: 0,
      expected_amount: input.opening_amount,
      cash_sales: 0,
      credit_payments: 0,
      expenses: 0,
      supplier_payments: 0,
      status: "open",
      cashier: input.cashier
    });
    db.shifts.unshift(shift);
    writeDb(db);
    return shift as T;
  }

  if (command === "close_shift") {
    const input = args?.input as CloseShiftInput;
    const shift = db.shifts.find((item) => item.id === input.id);
    if (!shift) throw new Error("الصندوق غير موجود");
    Object.assign(shift, buildDemoShift(db, shift), {
      status: "closed",
      closed_at: new Date().toISOString(),
      closing_amount: buildDemoShift(db, shift).expected_amount
    });
    writeDb(db);
    return shift as T;
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
    if (input.quantity < 0 && !db.settings.allow_negative_stock) throw new Error("المخزون السالب غير مفعل في الإعدادات");
    const currentProduct = input.id ? db.products.find((product) => product.id === input.id) : undefined;
    if (!isDemoEan8(input.barcode) && currentProduct?.barcode !== input.barcode) {
      throw new Error("الباركود يجب أن يكون EAN-8 صالحا من 8 أرقام");
    }
    if (db.products.some((product) => product.id !== input.id && product.barcode === input.barcode)) {
      throw new Error("هذا الباركود مستخدم من قبل");
    }
    if (input.id) {
      const existing = currentProduct;
      db.products = db.products.map((product) =>
        product.id === input.id ? { ...product, ...input, updated_at: now } as Product : product
      );
      if (existing && existing.quantity !== input.quantity) {
        db.stockMovements.unshift(makeDemoStockMovement(
          { ...existing, ...input, updated_at: now } as Product,
          "adjustment",
          input.quantity - existing.quantity,
          existing.quantity,
          input.quantity,
          input.purchase_price,
          "تعديل مباشر من بطاقة المنتج"
        ));
      }
      writeDb(db);
      return db.products.find((product) => product.id === input.id) as T;
    }
    const product = { ...input, id: Date.now(), created_at: now, updated_at: now } as Product;
    db.products.unshift(product);
    if (product.quantity > 0) {
      db.stockMovements.unshift(makeDemoStockMovement(product, "initial", product.quantity, 0, product.quantity, product.purchase_price, "مخزون أولي"));
    }
    writeDb(db);
    return product as T;
  }

  if (command === "adjust_product_stock") {
    const input = args?.input as StockMovementInput;
    const product = db.products.find((item) => item.id === input.product_id);
    if (!product) throw new Error("المنتج غير موجود");
    if (input.quantity <= 0) throw new Error("الكمية يجب أن تكون أكبر من صفر");
    const before = product.quantity;
    const delta = input.movement_type === "entry" ? input.quantity : -input.quantity;
    const after = before + delta;
    if (after < 0 && !db.settings.allow_negative_stock) throw new Error("لا يمكن إخراج كمية أكبر من المخزون الحالي");
    if (input.movement_type === "entry" && input.purchase_price > 0) {
      const oldValue = product.purchase_price * Math.max(0, before);
      const addedValue = input.purchase_price * input.quantity;
      product.purchase_price = after > 0 ? (oldValue + addedValue) / after : input.purchase_price;
    }
    product.quantity = after;
    product.updated_at = new Date().toISOString();
    db.stockMovements.unshift(makeDemoStockMovement(
      product,
      input.movement_type,
      delta,
      before,
      after,
      input.purchase_price > 0 ? input.purchase_price : product.purchase_price,
      input.note
    ));
    writeDb(db);
    return product as T;
  }

  if (command === "list_stock_movements") {
    const productId = args?.product_id as number;
    return db.stockMovements
      .filter((movement) => movement.product_id === productId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
      .slice(0, 80) as T;
  }

  if (command === "list_suppliers") {
    return db.suppliers.map((supplier) => withSupplierTotals(db, supplier)) as T;
  }

  if (command === "save_supplier") {
    const input = args?.input as SupplierInput;
    if (!input.name.trim()) throw new Error("اسم المورد إجباري");
    const existing = input.id ? db.suppliers.find((supplier) => supplier.id === input.id) : undefined;
    const supplier: Supplier = {
      id: existing?.id ?? Date.now(),
      name: input.name.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      note: input.note.trim(),
      active: input.active,
      total_purchases: 0,
      total_paid: 0,
      remaining_amount: 0,
      last_purchase_at: "",
      created_at: existing?.created_at ?? new Date().toISOString()
    };
    db.suppliers = existing
      ? db.suppliers.map((item) => item.id === supplier.id ? supplier : item)
      : [supplier, ...db.suppliers];
    writeDb(db);
    return withSupplierTotals(db, supplier) as T;
  }

  if (command === "disable_supplier") {
    const id = args?.id as number;
    db.suppliers = db.suppliers.map((supplier) => supplier.id === id ? { ...supplier, active: false } : supplier);
    writeDb(db);
    return withSupplierTotals(db, db.suppliers.find((supplier) => supplier.id === id)!) as T;
  }

  if (command === "list_purchase_orders") {
    return db.purchaseOrders
      .map((order) => withPurchaseRelations(db, order))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id) as T;
  }

  if (command === "get_purchase_order") {
    const id = args?.id as number;
    const order = db.purchaseOrders.find((item) => item.id === id);
    if (!order) throw new Error("قسيمة شراء غير موجود");
    return withPurchaseRelations(db, order) as T;
  }

  if (command === "save_purchase_order_draft") {
    const input = args?.input as PurchaseOrderInput;
    const supplier = db.suppliers.find((item) => item.id === input.supplier_id && item.active);
    if (!supplier) throw new Error("اختر موردا نشطا");
    if (!input.items.length) throw new Error("أضف منتجا واحدا على الأقل");
    const items = input.items.map((line, index) => {
      const product = db.products.find((item) => item.id === line.product_id);
      if (!product) throw new Error("المنتج غير موجود");
      if (line.quantity <= 0 || line.unit_purchase_price < 0) throw new Error("تحقق من الكمية وسعر الشراء");
      return {
        id: Date.now() + index,
        product_id: product.id,
        product_name: product.name,
        barcode: product.barcode,
        quantity: line.quantity,
        unit_purchase_price: line.unit_purchase_price,
        line_total: line.quantity * line.unit_purchase_price
      };
    });
    const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);
    const existing = input.id ? db.purchaseOrders.find((item) => item.id === input.id) : undefined;
    if (existing && existing.status !== "draft") throw new Error("لا يمكن تعديل قسيمة شراء مؤكد");
    const order: PurchaseOrder = {
      id: existing?.id ?? Date.now(),
      bon_no: existing?.bon_no ?? `BA-${String(db.purchaseOrders.length + 1).padStart(6, "0")}`,
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      subtotal,
      paid_amount: 0,
      remaining_amount: subtotal,
      status: "draft",
      note: input.note.trim(),
      cashier: input.cashier.trim(),
      created_at: existing?.created_at ?? new Date().toISOString(),
      confirmed_at: "",
      items,
      payments: []
    };
    db.purchaseOrders = existing
      ? db.purchaseOrders.map((item) => item.id === order.id ? order : item)
      : [order, ...db.purchaseOrders];
    writeDb(db);
    return withPurchaseRelations(db, order) as T;
  }

  if (command === "confirm_purchase_order") {
    const id = args?.id as number;
    const paidAmount = Math.max(0, Number(args?.paidAmount ?? args?.paid_amount ?? 0));
    const cashier = String(args?.cashier ?? "");
    const order = db.purchaseOrders.find((item) => item.id === id);
    if (!order) throw new Error("قسيمة الشراء غير موجودة");
    if (order.status !== "draft") throw new Error("تم تأكيد هذه القسيمة من قبل");
    if (paidAmount > order.subtotal) throw new Error("المبلغ المدفوع أكبر من مجموع القسيمة");
    if (paidAmount > 0 && !activeDemoShift(db)) throw new Error("افتح الصندوق قبل المتابعة");
    for (const item of order.items) applyDemoPurchaseStock(db, order.id, item);
    const payment = paidAmount > 0 ? makeDemoSupplierPayment(db, order, paidAmount, "دفعة عند تأكيد القسيمة", cashier) : undefined;
    if (payment) db.supplierPayments.unshift(payment);
    order.paid_amount = paidAmount;
    order.remaining_amount = Math.max(0, order.subtotal - paidAmount);
    order.status = order.remaining_amount <= 0 ? "paid" : "confirmed";
    order.cashier = cashier;
    order.confirmed_at = new Date().toISOString();
    writeDb(db);
    return withPurchaseRelations(db, order) as T;
  }

  if (command === "add_supplier_payment") {
    const input = args?.input as SupplierPaymentInput;
    const order = db.purchaseOrders.find((item) => item.id === input.purchase_order_id);
    if (!order) throw new Error("قسيمة الشراء غير موجودة");
    if (order.status === "draft") throw new Error("أكد القسيمة قبل إضافة دفعة");
    if (input.amount <= 0 || input.amount > order.remaining_amount) throw new Error("مبلغ الدفعة غير صالح");
    if (!activeDemoShift(db)) throw new Error("افتح الصندوق قبل المتابعة");
    const payment = makeDemoSupplierPayment(db, order, input.amount, input.note, input.cashier);
    db.supplierPayments.unshift(payment);
    order.paid_amount += input.amount;
    order.remaining_amount = Math.max(0, order.remaining_amount - input.amount);
    order.status = order.remaining_amount <= 0 ? "paid" : "confirmed";
    writeDb(db);
    return withPurchaseRelations(db, order) as T;
  }

  if (command === "list_supplier_payments") {
    return db.supplierPayments.sort((a, b) => b.paid_at.localeCompare(a.paid_at) || b.id - a.id) as T;
  }

  if (command === "delete_product") {
    db.products = db.products.filter((product) => product.id !== args?.id);
    writeDb(db);
    return undefined as T;
  }

  if (command === "save_expense") {
    const input = args?.input as ExpenseInput;
    const shift = activeDemoShift(db);
    const expense = {
      ...input,
      shift_id: shift?.id,
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
    const selectedDate = input.sale_date && /^\d{4}-\d{2}-\d{2}$/.test(input.sale_date)
      ? input.sale_date
      : todayInputValue();
    if (selectedDate > todayInputValue()) throw new Error("لا يمكن إنشاء فاتورة بتاريخ مستقبلي");
    const shift = input.sale_type === "delivery"
      ? undefined
      : selectedDate === todayInputValue()
        ? activeDemoShift(db)
        : [...db.shifts]
            .filter((item) => item.opened_at.slice(0, 10) === selectedDate)
            .sort((a, b) => b.opened_at.localeCompare(a.opened_at))[0];
    if (input.sale_type !== "delivery" && selectedDate === todayInputValue() && !shift) {
      throw new Error("افتح الصندوق قبل المتابعة");
    }
    const createdAt = `${selectedDate}T${new Date().toTimeString().slice(0, 8)}`;
    let grossProfit = 0;
    const items = input.items.map((item) => {
      const product = db.products.find((candidate) => candidate.id === item.product_id);
      if (!product) throw new Error("المنتج غير موجود");
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error("الكمية غير صالحة");
      if (product.quantity < item.quantity && !db.settings.allow_negative_stock) throw new Error(`المخزون غير كاف للمنتج ${product.name}`);
      const unitPrice = Number.isFinite(item.unit_price) ? Math.max(0, item.unit_price) : product.sale_price;
      product.quantity -= item.quantity;
      grossProfit += (unitPrice - product.purchase_price) * item.quantity;
      return {
        product_id: product.id,
        product_name: product.name,
        barcode: product.barcode,
        quantity: item.quantity,
        unit_price: unitPrice,
        line_total: unitPrice * item.quantity
      };
    });
    const perfumeItems = (input.perfume_items ?? []).map((item) => {
      const perfume = db.perfumes.find((candidate) => candidate.id === item.perfume_id);
      if (!perfume) throw new Error("العطر غير موجود");
      const price = perfume.prices.find((candidate) => candidate.flacon_id === item.flacon_id);
      if (!price) throw new Error("القارورة غير موجودة");
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error("الكمية غير صالحة");
      const needed = price.volume_ml * item.quantity;
      if (perfume.remaining_volume_ml < needed) throw new Error(`المخزون غير كاف للعطر ${perfume.name}`);
      perfume.remaining_volume_ml -= needed;
      grossProfit += (price.sale_price - perfume.cost_per_ml * price.volume_ml) * item.quantity;
      return {
        product_id: -perfume.id,
        product_name: `${perfume.name} - ${price.flacon_name}`,
        barcode: `PF-${perfume.id}-${price.flacon_id}`,
        quantity: item.quantity,
        unit_price: price.sale_price,
        line_total: price.sale_price * item.quantity
      };
    });
    const subtotal = [...items, ...perfumeItems].reduce((sum, item) => sum + item.line_total, 0);
    if (!Number.isFinite(input.discount) || input.discount < 0) throw new Error("التخفيض غير صالح");
    if (input.discount > db.settings.max_discount_amount) throw new Error(`أقصى تخفيض هو ${db.settings.max_discount_amount}`);
    const total = Math.max(0, subtotal - input.discount);
    if (input.sale_type === "delivery" && !input.customer_name.trim()) throw new Error("اسم الزبون إجباري");
    if (input.sale_type === "credit" && !input.customer_name.trim()) throw new Error("اسم الزبون إجباري للبيع بالدين");
    if (!Number.isFinite(input.paid_amount) || input.paid_amount < 0 || input.paid_amount > total) throw new Error("المبلغ المدفوع غير صالح");
    const paid = input.sale_type === "cash" ? total : input.sale_type === "delivery" ? 0 : input.paid_amount;
    const remaining = Math.max(0, total - paid);
    const sale: Sale = {
      id: Date.now(),
      shift_id: input.sale_type === "delivery" ? undefined : shift?.id,
      receipt_no: `AS-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`,
      subtotal,
      discount: input.discount,
      total,
      profit: grossProfit - input.discount,
      payment_method: "نقدا",
      sale_type: input.sale_type,
      customer_name: input.customer_name,
      customer_phone: input.customer_phone,
      paid_amount: paid,
      remaining_amount: remaining,
      due_date: input.due_date,
      credit_note: input.credit_note,
      credit_status: input.sale_type === "delivery" ? "delivery_pending" : remaining <= 0 ? "paid" : paid > 0 ? "partial" : "open",
      cashier: input.cashier,
      created_at: createdAt,
      items: [...items, ...perfumeItems]
    };
    db.sales.unshift(sale);
    writeDb(db);
    return sale as T;
  }

  if (command === "list_sales") return db.sales as T;

  if (command === "get_sale") {
    const sale = db.sales.find((item) => item.id === args?.id);
    if (!sale) throw new Error("الفاتورة غير موجودة");
    return sale as T;
  }

  if (command === "regenerate_all_barcodes") {
    [...db.products]
      .sort((a, b) => a.id - b.id)
      .forEach((product, index) => {
        product.barcode = demoEan8(index + 1);
        product.updated_at = new Date().toISOString();
      });
    writeDb(db);
    return db.products as T;
  }

  if (command === "list_delivery_sales") {
    return db.sales.filter((sale) => sale.sale_type === "delivery") as T;
  }

  if (command === "collect_delivery") {
    const id = args?.id as number;
    const shift = activeDemoShift(db);
    if (!shift) throw new Error("افتح الصندوق قبل المتابعة");
    const sale = db.sales.find((item) => item.id === id && item.sale_type === "delivery");
    if (!sale) throw new Error("طلب التوصيل غير موجود");
    if (sale.credit_status !== "delivery_pending") throw new Error("تمت معالجة طلب التوصيل من قبل");
    sale.shift_id = shift.id;
    sale.paid_amount = sale.total;
    sale.remaining_amount = 0;
    sale.credit_status = "delivery_paid";
    sale.collected_at = new Date().toISOString();
    writeDb(db);
    return sale as T;
  }

  if (command === "return_delivery") {
    const id = args?.id as number;
    const sale = db.sales.find((item) => item.id === id && item.sale_type === "delivery");
    if (!sale) throw new Error("طلب التوصيل غير موجود");
    if (sale.credit_status !== "delivery_pending") throw new Error("تمت معالجة طلب التوصيل من قبل");
    for (const item of sale.items) {
      const product = db.products.find((product) => product.id === item.product_id);
      if (product) product.quantity += item.quantity;
    }
    sale.paid_amount = 0;
    sale.remaining_amount = 0;
    sale.credit_status = "delivery_returned";
    writeDb(db);
    return sale as T;
  }

  if (command === "update_sale") {
    const input = args?.input as SaleUpdateInput;
    const sale = replaceDemoSaleItems(db, input.sale_id, input.items);
    writeDb(db);
    return sale as T;
  }

  if (command === "return_sale_item") {
    const input = args?.input as SaleReturnInput;
    const sale = db.sales.find((item) => item.id === input.sale_id);
    if (!sale) throw new Error("الفاتورة غير موجودة");
    const updatedItems = sale.items.map((item) => ({
      product_id: item.product_id,
      quantity: item.product_id === input.product_id ? item.quantity - input.quantity : item.quantity,
      unit_price: item.unit_price
    })).filter((item) => item.product_id > 0 && item.quantity > 0);
    if (!sale.items.some((item) => item.product_id === input.product_id)) throw new Error("المنتج غير موجود في الفاتورة");
    if (!updatedItems.length) throw new Error("للإرجاع الكامل احذف الفاتورة");
    const updatedSale = replaceDemoSaleItems(db, input.sale_id, updatedItems);
    writeDb(db);
    return updatedSale as T;
  }

  if (command === "delete_sale") {
    const id = args?.id as number;
    const sale = db.sales.find((item) => item.id === id);
    if (!sale) throw new Error("الفاتورة غير موجودة");
    for (const item of sale.items) {
      const product = db.products.find((product) => product.id === item.product_id);
      if (product) product.quantity += item.quantity;
    }
    db.sales = db.sales.filter((item) => item.id !== id);
    db.creditPayments = db.creditPayments.filter((payment) => payment.sale_id !== id);
    writeDb(db);
    return undefined as T;
  }

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
    const shift = activeDemoShift(db);
    if (!shift) throw new Error("افتح الصندوق قبل المتابعة");
    const sale = db.sales.find((item) => item.id === input.sale_id);
    if (!sale) throw new Error("الدين غير موجود");
    if (input.amount <= 0) throw new Error("مبلغ الدفعة غير صالح");
    if (input.amount > sale.remaining_amount) throw new Error("الدفعة أكبر من المبلغ المتبقي");
    sale.paid_amount += input.amount;
    sale.remaining_amount = Math.max(0, sale.remaining_amount - input.amount);
    sale.credit_status = sale.remaining_amount <= 0 ? "paid" : "partial";
    db.creditPayments.unshift({
      id: Date.now(),
      shift_id: shift.id,
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
    const yesterday = inputFromDate(new Date(Date.now() - 86_400_000));
    const todayStats = demoDashboardDay(db, today);
    const yesterdayStats = demoDashboardDay(db, yesterday);
    return {
      sales_today: todayStats.revenue,
      sales_count_today: todayStats.salesCount,
      revenue_today: todayStats.revenue,
      expenses_today: todayStats.expenses,
      profit_today: todayStats.profit,
      sales_yesterday: yesterdayStats.revenue,
      sales_count_yesterday: yesterdayStats.salesCount,
      revenue_yesterday: yesterdayStats.revenue,
      expenses_yesterday: yesterdayStats.expenses,
      profit_yesterday: yesterdayStats.profit,
      low_stock_count: db.products.filter((product) => product.quantity <= product.low_stock_threshold).length,
      open_credit_count: db.sales.filter((sale) => sale.sale_type === "credit" && sale.remaining_amount > 0).length,
      credit_remaining_total: db.sales.reduce((sum, sale) => sum + (sale.remaining_amount ?? 0), 0),
      credit_payments_today: todayStats.creditPayments,
      credit_payments_yesterday: yesterdayStats.creditPayments,
      delivery_pending_count: db.sales.filter((sale) => sale.sale_type === "delivery" && sale.credit_status === "delivery_pending").length,
      delivery_pending_total: db.sales
        .filter((sale) => sale.sale_type === "delivery" && sale.credit_status === "delivery_pending")
        .reduce((sum, sale) => sum + sale.total, 0),
      delivery_collected_today: todayStats.deliveryCollected
    } as T;
  }

  if (command === "get_report") {
    const input = args?.input as ReportFilter;
    return buildDemoReport(db, input) as T;
  }

  throw new Error(`Commande non disponible: ${command}`);
}

function withSupplierTotals(db: Db, supplier: Supplier): Supplier {
  const orders = db.purchaseOrders.filter((order) => order.supplier_id === supplier.id && order.status !== "draft");
  return {
    ...supplier,
    total_purchases: orders.reduce((sum, order) => sum + order.subtotal, 0),
    total_paid: orders.reduce((sum, order) => sum + order.paid_amount, 0),
    remaining_amount: orders.reduce((sum, order) => sum + order.remaining_amount, 0),
    last_purchase_at: lastString(orders.map((order) => order.confirmed_at).filter(Boolean).sort())
  };
}

function lastString(values: string[]) {
  return values.length ? values[values.length - 1] : "";
}

function withPurchaseRelations(db: Db, order: PurchaseOrder): PurchaseOrder {
  const supplier = db.suppliers.find((item) => item.id === order.supplier_id);
  return {
    ...order,
    supplier_name: supplier?.name ?? order.supplier_name,
    payments: db.supplierPayments
      .filter((payment) => payment.purchase_order_id === order.id)
      .sort((a, b) => b.paid_at.localeCompare(a.paid_at) || b.id - a.id)
  };
}

function applyDemoPurchaseStock(db: Db, orderId: number, item: PurchaseOrder["items"][number]) {
  const product = db.products.find((line) => line.id === item.product_id);
  if (!product) throw new Error("المنتج المرتبط بقسيمة الشراء غير موجود");
  const before = product.quantity;
  const after = before + item.quantity;
  const oldValue = product.purchase_price * Math.max(0, before);
  const addedValue = item.unit_purchase_price * item.quantity;
  product.purchase_price = after > 0 ? (oldValue + addedValue) / after : item.unit_purchase_price;
  product.quantity = after;
  product.updated_at = new Date().toISOString();
  db.stockMovements.unshift(makeDemoStockMovement(
    product,
    "entry",
    item.quantity,
    before,
    after,
    item.unit_purchase_price,
    `قسيمة شراء ${orderId}`
  ));
}

function makeDemoSupplierPayment(db: Db, order: PurchaseOrder, amount: number, note: string, cashier: string): SupplierPayment {
  const shift = activeDemoShift(db);
  if (!shift) throw new Error("افتح الصندوق قبل المتابعة");
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    supplier_id: order.supplier_id,
    supplier_name: order.supplier_name,
    purchase_order_id: order.id,
    bon_no: order.bon_no,
    shift_id: shift.id,
    amount,
    note,
    cashier,
    paid_at: new Date().toISOString()
  };
}

function buildDemoReport(db: Db, input: ReportFilter): ReportData {
  const from = input.from_date || todayInputValue();
  const to = input.to_date || from;
  const buckets = makeDateBuckets(input.period, from, to).map(({ label, start, end }) => {
    const sales = db.sales.filter((sale) =>
      between(saleAccountingDate(sale), start, end)
      && (sale.sale_type !== "delivery" || sale.credit_status === "delivery_paid")
    );
    const expenses = db.expenses.filter((expense) => between(expense.expense_date, start, end));
    const supplierPayments = db.supplierPayments.filter((payment) => between(payment.paid_at.slice(0, 10), start, end));
    const payments = db.creditPayments.filter((payment) => between(payment.paid_at.slice(0, 10), start, end));
    const paymentsBySale = db.creditPayments.reduce<Record<number, number>>((totals, payment) => {
      totals[payment.sale_id] = (totals[payment.sale_id] ?? 0) + payment.amount;
      return totals;
    }, {});
    const saleEntry = sales.reduce((sum, sale) => {
      if (sale.sale_type === "cash" || sale.sale_type === "delivery") return sum + sale.total;
      return sum + Math.max(0, sale.paid_amount - (paymentsBySale[sale.id] ?? 0));
    }, 0);
    const selling = sales.reduce((sum, sale) => sum + sale.total, 0);
    const buying = sales.reduce((sum, sale) => sum + Math.max(0, sale.total - sale.profit), 0);
    const bookedProfit = sales.reduce((sum, sale) => sum + sale.profit, 0);
    const saleProfit = sales.reduce((sum, sale) => {
      const collected = sale.sale_type === "cash" || sale.sale_type === "delivery"
        ? sale.total
        : Math.max(0, sale.paid_amount - (paymentsBySale[sale.id] ?? 0));
      return sum + realizedProfit(sale, collected);
    }, 0);
    const creditEntry = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const creditProfit = payments.reduce((sum, payment) => {
      const sale = db.sales.find((item) => item.id === payment.sale_id);
      return sale ? sum + realizedProfit(sale, payment.amount) : sum;
    }, 0);
    const sortie = expenses.reduce((sum, expense) => sum + expense.amount, 0)
      + supplierPayments.reduce((sum, payment) => sum + payment.amount, 0);
    return {
      label,
      start_date: start,
      end_date: end,
      entry: saleEntry + creditEntry,
      sortie,
      profit: saleProfit + creditProfit - sortie,
      buying,
      selling,
      gain: bookedProfit - sortie,
      sales_count: sales.length
    };
  });
  const filteredSales = db.sales.filter((sale) =>
    between(saleAccountingDate(sale), from, to)
    && (sale.sale_type !== "delivery" || sale.credit_status === "delivery_paid")
  );
  const grossSales = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
  const summary = {
    entry: buckets.reduce((sum, bucket) => sum + bucket.entry, 0),
    sortie: buckets.reduce((sum, bucket) => sum + bucket.sortie, 0),
    profit: buckets.reduce((sum, bucket) => sum + bucket.profit, 0),
    buying_total: buckets.reduce((sum, bucket) => sum + bucket.buying, 0),
    selling_total: buckets.reduce((sum, bucket) => sum + bucket.selling, 0),
    gain_total: buckets.reduce((sum, bucket) => sum + bucket.gain, 0),
    sales_count: buckets.reduce((sum, bucket) => sum + bucket.sales_count, 0),
    average_ticket: filteredSales.length ? grossSales / filteredSales.length : 0,
    credit_collected: db.creditPayments
      .filter((payment) => between(payment.paid_at.slice(0, 10), from, to))
      .reduce((sum, payment) => sum + payment.amount, 0),
    credit_remaining: db.sales.reduce((sum, sale) => sum + sale.remaining_amount, 0),
    delivery_pending_total: db.sales
      .filter((sale) => sale.sale_type === "delivery" && sale.credit_status === "delivery_pending")
      .reduce((sum, sale) => sum + sale.total, 0),
    delivery_pending_count: db.sales.filter((sale) => sale.sale_type === "delivery" && sale.credit_status === "delivery_pending").length,
    delivery_collected: filteredSales
      .filter((sale) => sale.sale_type === "delivery" && sale.credit_status === "delivery_paid")
      .reduce((sum, sale) => sum + sale.total, 0),
    supplier_purchases: db.purchaseOrders
      .filter((order) => order.status !== "draft" && between((order.confirmed_at || order.created_at).slice(0, 10), from, to))
      .reduce((sum, order) => sum + order.subtotal, 0),
    supplier_payments: db.supplierPayments
      .filter((payment) => between(payment.paid_at.slice(0, 10), from, to))
      .reduce((sum, payment) => sum + payment.amount, 0),
    supplier_remaining: db.purchaseOrders
      .filter((order) => order.status !== "draft")
      .reduce((sum, order) => sum + order.remaining_amount, 0),
    stock_purchase_value: db.products.reduce((sum, product) => sum + product.purchase_price * product.quantity, 0),
    stock_sale_value: db.products.reduce((sum, product) => sum + product.sale_price * product.quantity, 0)
  };
  const productTotals = new Map<string, { name: string; quantity: number; total: number }>();
  filteredSales.flatMap((sale) => sale.items).forEach((item) => {
    const current = productTotals.get(item.product_name) ?? { name: item.product_name, quantity: 0, total: 0 };
    current.quantity += item.quantity;
    current.total += item.line_total;
    productTotals.set(item.product_name, current);
  });
  return {
    period: input.period,
    from_date: from,
    to_date: to,
    summary,
    buckets,
    top_products: Array.from(productTotals.values()).sort((a, b) => b.total - a.total).slice(0, 5),
    advice: buildDemoAdvice(summary)
  };
}

function demoDashboardDay(db: Db, day: string) {
  const sales = db.sales.filter((sale) =>
    saleAccountingDate(sale) === day
    && (sale.sale_type !== "delivery" || sale.credit_status === "delivery_paid")
  );
  const expenses = db.expenses.filter((expense) => expense.expense_date === day);
  const payments = db.creditPayments.filter((payment) => payment.paid_at.slice(0, 10) === day);
  const paymentsBySale = db.creditPayments.reduce<Record<number, number>>((totals, payment) => {
    totals[payment.sale_id] = (totals[payment.sale_id] ?? 0) + payment.amount;
    return totals;
  }, {});
  const saleEntry = sales.reduce((sum, sale) => {
    if (sale.sale_type === "cash" || sale.sale_type === "delivery") return sum + sale.total;
    return sum + Math.max(0, sale.paid_amount - (paymentsBySale[sale.id] ?? 0));
  }, 0);
  const saleProfit = sales.reduce((sum, sale) => {
    const collected = sale.sale_type === "cash" || sale.sale_type === "delivery"
      ? sale.total
      : Math.max(0, sale.paid_amount - (paymentsBySale[sale.id] ?? 0));
    return sum + realizedProfit(sale, collected);
  }, 0);
  const creditPayments = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const creditProfit = payments.reduce((sum, payment) => {
    const sale = db.sales.find((item) => item.id === payment.sale_id);
    return sale ? sum + realizedProfit(sale, payment.amount) : sum;
  }, 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  return {
    revenue: saleEntry + creditPayments,
    salesCount: sales.length,
    expenses: expenseTotal,
    profit: saleProfit + creditProfit - expenseTotal,
    creditPayments,
    deliveryCollected: sales
      .filter((sale) => sale.sale_type === "delivery" && sale.credit_status === "delivery_paid")
      .reduce((sum, sale) => sum + sale.total, 0)
  };
}

function saleAccountingDate(sale: Sale) {
  if (sale.sale_type === "delivery" && sale.credit_status === "delivery_paid") {
    return (sale.collected_at || sale.created_at).slice(0, 10);
  }
  return sale.created_at.slice(0, 10);
}

function activeDemoShift(db: Db) {
  const shift = db.shifts.find((item) => item.status === "open");
  return shift ? buildDemoShift(db, shift) : undefined;
}

function closeDueDemoShift(db: Db) {
  const now = new Date();
  for (const shift of db.shifts.filter((item) => item.status === "open" && new Date(item.auto_close_at) <= now)) {
    Object.assign(shift, buildDemoShift(db, shift), {
      status: "closed",
      closed_at: shift.auto_close_at,
      closing_amount: buildDemoShift(db, shift).expected_amount
    });
  }
}

function buildDemoShift(db: Db, shift: CashShift): CashShift {
  const paymentsBySale = db.creditPayments.reduce<Record<number, number>>((totals, payment) => {
    totals[payment.sale_id] = (totals[payment.sale_id] ?? 0) + payment.amount;
    return totals;
  }, {});
  const cashSales = db.sales
    .filter((sale) => sale.shift_id === shift.id && (sale.sale_type !== "delivery" || sale.credit_status === "delivery_paid"))
    .reduce((sum, sale) => {
      if (sale.sale_type === "cash" || sale.sale_type === "delivery") return sum + sale.total;
      return sum + Math.max(0, sale.paid_amount - (paymentsBySale[sale.id] ?? 0));
    }, 0);
  const creditPayments = db.creditPayments
    .filter((payment) => payment.shift_id === shift.id)
    .reduce((sum, payment) => sum + payment.amount, 0);
  const expenses = db.expenses
    .filter((expense) => expense.shift_id === shift.id)
    .reduce((sum, expense) => sum + expense.amount, 0);
  const supplierPayments = db.supplierPayments
    .filter((payment) => payment.shift_id === shift.id)
    .reduce((sum, payment) => sum + payment.amount, 0);
  return {
    ...shift,
    cash_sales: cashSales,
    credit_payments: creditPayments,
    expenses,
    supplier_payments: supplierPayments,
    expected_amount: shift.opening_amount + cashSales + creditPayments - expenses - supplierPayments
  };
}

function makeDateBuckets(period: ReportFilter["period"], from: string, to: string) {
  const buckets: Array<{ label: string; start: string; end: string }> = [];
  let cursor = dateFromInput(from);
  const last = dateFromInput(to);
  while (cursor <= last) {
    const start = inputFromDate(cursor);
    const next = new Date(cursor);
    if (period === "weekly") next.setDate(next.getDate() + 7);
    else if (period === "monthly") next.setMonth(next.getMonth() + 1, 1);
    else next.setDate(next.getDate() + 1);
    const endDate = new Date(Math.min(next.getTime() - 86_400_000, last.getTime()));
    const end = inputFromDate(endDate);
    buckets.push({
      label: period === "monthly"
        ? `${String(cursor.getMonth() + 1).padStart(2, "0")}/${cursor.getFullYear()}`
        : period === "weekly"
          ? `${start.slice(5)} -> ${end.slice(5)}`
          : start.slice(5),
      start,
      end
    });
    cursor = next;
  }
  return buckets;
}

function dateFromInput(value: string) {
  return new Date(`${value}T00:00:00`);
}

function inputFromDate(value: Date) {
  return dateInputValue(value);
}

function demoEan8(sequence: number) {
  const body = `2${Math.max(0, sequence % 1_000_000).toString().padStart(6, "0")}`;
  const sum = body.split("").reduce((total, digit, index) => (
    total + Number(digit) * (index % 2 === 0 ? 3 : 1)
  ), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

function isDemoEan8(value: string) {
  if (!/^\d{8}$/.test(value)) return false;
  const body = value.slice(0, 7);
  const sum = body.split("").reduce((total, digit, index) => (
    total + Number(digit) * (index % 2 === 0 ? 3 : 1)
  ), 0);
  return Number(value[7]) === (10 - (sum % 10)) % 10;
}

function between(value: string, from: string, to: string) {
  return value >= from && value <= to;
}

function buildDemoAdvice(summary: ReportData["summary"]) {
  const advice: string[] = [];
  if (summary.selling_total <= 0) advice.push("لا توجد مبيعات في هذه الفترة. تحقق من التذاكر أو اختر تاريخا آخر.");
  if (summary.gain_total < 0) advice.push("تنبيه: الفائدة سالبة. راجع المصاريف وأسعار الشراء وأسعار البيع.");
  else if (summary.gain_total > 0) advice.push("الفترة إيجابية: المبيعات تغطي الشراء والمصاريف.");
  if (summary.credit_remaining > 0) advice.push("يوجد دين متبق يجب تحصيله. دفعات الزبائن تحسن الصندوق.");
  if (summary.sales_count === 0) advice.push("لم يتم العثور على مبيعات في هذا الفلتر.");
  return advice;
}

function realizedProfit(sale: Sale, collected: number) {
  if (sale.total <= 0 || collected <= 0) return 0;
  return sale.profit * Math.min(collected / sale.total, 1);
}

function replaceDemoSaleItems(db: Db, saleId: number, items: SaleUpdateInput["items"]) {
  const sale = db.sales.find((item) => item.id === saleId);
  if (!sale) throw new Error("الفاتورة غير موجودة");
  if (!items.length || items.every((item) => item.quantity <= 0)) throw new Error("يجب أن تحتوي الفاتورة على منتج واحد على الأقل");

  for (const item of sale.items) {
    const product = db.products.find((product) => product.id === item.product_id);
    if (product) product.quantity += item.quantity;
  }

  const nextItems = items.filter((item) => item.quantity > 0).map((input) => {
    const oldItem = sale.items.find((item) => item.product_id === input.product_id);
    if (!oldItem) throw new Error("التعديل محدود بمنتجات الفاتورة");
    const product = db.products.find((product) => product.id === input.product_id);
    if (!product) throw new Error("المنتج غير موجود");
    if (product.quantity < input.quantity && !db.settings.allow_negative_stock) throw new Error(`المخزون غير كاف للمنتج ${oldItem.product_name}`);
    product.quantity -= input.quantity;
    const unitPrice = Math.max(0, input.unit_price ?? oldItem.unit_price);
    return {
      ...oldItem,
      quantity: input.quantity,
      unit_price: unitPrice,
      line_total: unitPrice * input.quantity
    };
  });

  const preservedPerfumeItems = sale.items.filter((item) => item.product_id < 0);
  const combinedItems = [...nextItems, ...preservedPerfumeItems];
  const subtotal = combinedItems.reduce((sum, item) => sum + item.line_total, 0);
  const discount = Math.min(Math.max(sale.discount, 0), subtotal);
  const total = Math.max(0, subtotal - discount);
  const grossProfit = combinedItems.reduce((sum, item) => {
    if (item.product_id > 0) {
      const product = db.products.find((candidate) => candidate.id === item.product_id);
      return sum + (item.unit_price - (product?.purchase_price ?? 0)) * item.quantity;
    }
    const perfume = db.perfumes.find((candidate) => candidate.id === Math.abs(item.product_id));
    const barcodeParts = item.barcode.split("-");
    const flaconId = Number(barcodeParts[barcodeParts.length - 1]);
    const price = perfume?.prices.find((candidate) => candidate.flacon_id === flaconId);
    const cost = (perfume?.cost_per_ml ?? 0) * (price?.volume_ml ?? 0);
    return sum + (item.unit_price - cost) * item.quantity;
  }, 0);
  const profit = grossProfit - discount;
  const paid = sale.sale_type === "cash" || (sale.sale_type === "delivery" && sale.credit_status === "delivery_paid")
    ? total
    : sale.sale_type === "delivery"
      ? 0
      : Math.min(sale.paid_amount, total);
  sale.items = combinedItems;
  sale.subtotal = subtotal;
  sale.discount = discount;
  sale.total = total;
  sale.profit = profit;
  sale.paid_amount = paid;
  sale.remaining_amount = Math.max(0, total - paid);
  sale.credit_status = sale.sale_type === "delivery"
    ? sale.credit_status === "delivery_paid" ? "delivery_paid" : "delivery_pending"
    : sale.remaining_amount <= 0 ? "paid" : paid > 0 ? "partial" : "open";
  return sale;
}

function makeDemoStockMovement(
  product: Product,
  movementType: StockMovement["movement_type"],
  quantity: number,
  beforeQuantity: number,
  afterQuantity: number,
  unitPurchasePrice: number,
  note: string
): StockMovement {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    product_id: product.id,
    product_name: product.name,
    barcode: product.barcode,
    movement_type: movementType,
    quantity,
    before_quantity: beforeQuantity,
    after_quantity: afterQuantity,
    unit_purchase_price: unitPurchasePrice,
    note,
    created_at: new Date().toISOString()
  };
}

export const api = {
  isDatabaseConfigured: () => isTauri ? call<boolean>("is_database_configured") : Promise.resolve(true),
  configureDatabase: (input: PostgresConfig) => call<void>("configure_database", { input }),
  login: (username: string, password: string) => call<UserSession>("login", { input: { username, password } }),
  updateProfile: (input: ProfileInput) => call<UserSession>("update_profile", { input }),
  appSettings: () => call<AppSettings>("get_app_settings"),
  saveAppSettings: (input: AppSettings) => call<AppSettings>("save_app_settings", { input }),
  printers: () => call<string[]>("list_printers"),
  saveNow: () => call<void>("save_database"),
  resetWithDummyData: () => call<void>("reset_with_dummy_data"),
  emptyDatabase: () => call<void>("empty_database"),
  openCashDrawer: () => call<void>("open_cash_drawer"),
  openExternalUrl: (url: string) => call<void>("open_external_url", { url }),
  printReceiptText: (content: string, qrDataUrl = "") => call<void>("print_receipt_text", { content, qr_data_url: qrDataUrl }),
  printBarcodeLabels: (input: BarcodePrintInput) => call<void>("print_barcode_labels", { input }),
  currentShift: () => call<CashShift | null>("current_shift"),
  openShift: (input: OpenShiftInput) => call<CashShift>("open_shift", { input }),
  closeShift: (input: CloseShiftInput) => call<CashShift>("close_shift", { input }),
  dashboard: () => call<DashboardStats>("get_dashboard"),
  report: (input: ReportFilter) => call<ReportData>("get_report", { input }),
  products: (filters: string | ProductFilters = "") => {
    const normalized = typeof filters === "string" ? { query: filters } : filters;
    return call<Product[]>("list_products", {
      query: normalized.query ?? "",
      category: normalized.category ?? "",
      stock: normalized.stock ?? "all"
    });
  },
  saveProduct: (input: ProductInput) => call<Product>("save_product", { input }),
  regenerateAllBarcodes: () => call<Product[]>("regenerate_all_barcodes"),
  adjustProductStock: (input: StockMovementInput) => call<Product>("adjust_product_stock", { input }),
  stockMovements: (productId: number) => call<StockMovement[]>("list_stock_movements", { product_id: productId }),
  deleteProduct: (id: number) => call<void>("delete_product", { id }),
  suppliers: () => call<Supplier[]>("list_suppliers"),
  saveSupplier: (input: SupplierInput) => call<Supplier>("save_supplier", { input }),
  disableSupplier: (id: number) => call<Supplier>("disable_supplier", { id }),
  purchaseOrders: () => call<PurchaseOrder[]>("list_purchase_orders"),
  purchaseOrder: (id: number) => call<PurchaseOrder>("get_purchase_order", { id }),
  savePurchaseOrderDraft: (input: PurchaseOrderInput) => call<PurchaseOrder>("save_purchase_order_draft", { input }),
  confirmPurchaseOrder: (id: number, paidAmount: number, cashier: string) => call<PurchaseOrder>("confirm_purchase_order", { id, paidAmount, cashier }),
  addSupplierPayment: (input: SupplierPaymentInput) => call<PurchaseOrder>("add_supplier_payment", { input }),
  supplierPayments: () => call<SupplierPayment[]>("list_supplier_payments"),
  expenses: () => call<Expense[]>("list_expenses"),
  saveExpense: (input: ExpenseInput) => call<Expense>("save_expense", { input }),
  deleteExpense: (id: number) => call<void>("delete_expense", { id }),
  checkout: (input: CheckoutInput) => call<Sale>("checkout", { input }),
  flacons: () => call<Flacon[]>("list_flacons"),
  saveFlacon: (input: FlaconInput) => call<Flacon>("save_flacon", { input }),
  perfumes: () => call<Perfume[]>("list_perfumes"),
  savePerfume: (input: PerfumeInput) => call<Perfume>("save_perfume", { input }),
  perfumePurchases: () => call<PerfumePurchase[]>("list_perfume_purchases"),
  savePerfumePurchase: (input: PerfumePurchaseInput) => call<PerfumePurchase>("save_perfume_purchase", { input }),
  sales: () => call<Sale[]>("list_sales"),
  sale: (id: number) => call<Sale>("get_sale", { id }),
  deliveries: () => call<Sale[]>("list_delivery_sales"),
  collectDelivery: (id: number) => call<Sale>("collect_delivery", { id }),
  returnDelivery: (id: number) => call<Sale>("return_delivery", { id }),
  updateSale: (input: SaleUpdateInput) => call<Sale>("update_sale", { input }),
  returnSaleItem: (input: SaleReturnInput) => call<Sale>("return_sale_item", { input }),
  deleteSale: (id: number) => call<void>("delete_sale", { id }),
  credits: () => call<CreditAccount[]>("list_credits"),
  addCreditPayment: (input: CreditPaymentInput) => call<CreditAccount>("add_credit_payment", { input })
};
