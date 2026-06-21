import { useEffect, useMemo, useState } from "react";
import * as QRCode from "qrcode";
import {
  Barcode,
  MagnifyingGlass as Search,
  Minus,
  Plus,
  Printer,
  Tote as ShoppingBag,
  Trash as Trash2
} from "@phosphor-icons/react";
import { api } from "../../shared/api";
import { money, todayInputValue } from "../../shared/format";
import { useText } from "../../shared/i18n";
import { showToast } from "../../shared/toast";
import { AppSettings, CartItem, Language, Product, Sale, UserSession } from "../../shared/types";
import denzelLogo from "../../assets/denzel-logo.png";

const orderQrPrefix = "DENZEL_ORDER:";

function orderQrPayload(sale: Sale) {
  return `${orderQrPrefix}${sale.id}:${sale.receipt_no}`;
}

function parseOrderQr(value: string) {
  const text = value.trim();
  if (!text.startsWith(orderQrPrefix)) return null;
  const [idPart, receiptNo] = text.slice(orderQrPrefix.length).split(":");
  const id = Number(idPart);
  return Number.isFinite(id) && id > 0 ? { id, receiptNo } : null;
}

function formatSaleDate(value: string, language: Language, includeTime = true) {
  const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(language === "ar" ? "ar-DZ-u-nu-arab" : "fr-DZ", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {})
  }).format(parsed);
}

function displayCategory(category: string) {
  if (category === "Products") return "المنتجات";
  return category;
}

export function PosPage({ language, user, onSale }: { language: Language; user: UserSession; onSale: () => void }) {
  const t = useText(language);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [productCatalog, setProductCatalog] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [saleDate, setSaleDate] = useState(todayInputValue);
  const [saleType, setSaleType] = useState<"cash" | "credit" | "delivery">("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paidAmount, setPaidAmount] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [, setError] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [allowNegativeStock, setAllowNegativeStock] = useState(true);
  const [maxDiscount, setMaxDiscount] = useState(200);

  useEffect(() => {
    api.products({ query, category, stock: "all" })
      .then((items) => setProducts(items.filter((product) => allowNegativeStock || product.quantity > 0)))
      .catch((err) => showToast(err instanceof Error ? err.message : String(err), "error"));
  }, [query, category, allowNegativeStock]);

  useEffect(() => {
    api.appSettings()
      .then((settings) => {
        setAllowNegativeStock(settings.allow_negative_stock);
        setMaxDiscount(settings.max_discount_amount);
      })
      .catch(() => {
        setAllowNegativeStock(true);
        setMaxDiscount(200);
      });
  }, []);

  useEffect(() => {
    api.products()
      .then((items) => {
        setProductCatalog(items);
        setCategories(Array.from(new Set(items.map((product) => product.category))).sort());
      })
      .catch((err) => showToast(err instanceof Error ? err.message : String(err), "error"));
  }, []);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0),
    [cart]
  );
  const total = Math.max(0, subtotal - discount);
  const normalizedPaid = Math.max(0, Math.min(paidAmount, total));
  const creditRemaining = saleType === "credit" ? Math.max(0, total - normalizedPaid) : 0;
  const checkoutBlocked =
    !cart.length ||
    cart.some((item) => !Number.isFinite(item.unit_price) || item.unit_price < 0) ||
    discount < 0 ||
    discount > maxDiscount ||
    discount > subtotal ||
    ((saleType === "credit" || saleType === "delivery") && (!customerName.trim() || paidAmount < 0 || paidAmount > total));

  function addProduct(product: Product) {
    if (!allowNegativeStock && product.quantity <= 0) return;
    setCart((items) => {
      const existing = items.find((item) => item.product.id === product.id);
      if (existing) {
        return items.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: allowNegativeStock ? item.quantity + 1 : Math.min(item.quantity + 1, product.quantity) }
            : item
        );
      }
      return [...items, { product, quantity: 1, unit_price: product.sale_price }];
    });
  }

  async function addScannedBarcode(value: string) {
    const barcode = value.trim();
    if (!barcode) return;
    try {
      const orderRef = parseOrderQr(barcode);
      if (orderRef) {
        const sales = await api.sales();
        const matchedSale = sales.find((sale) => sale.id === orderRef.id || sale.receipt_no === orderRef.receiptNo);
        if (!matchedSale) {
          showToast("لم يتم العثور على الفاتورة", "error");
          return;
        }
        setReceipt(matchedSale);
        setQuery("");
        showToast("تم فتح الفاتورة", "success");
        return;
      }

      let product = productCatalog.find((item) => item.barcode.trim().toLowerCase() === barcode.toLowerCase());
      if (!product) {
        const matches = await api.products({ query: barcode, stock: "all" });
        product = matches.find((item) => item.barcode.trim().toLowerCase() === barcode.toLowerCase());
        if (product) {
          setProductCatalog((items) => items.some((item) => item.id === product?.id) ? items : [...items, product as Product]);
        }
      }
      if (!product) {
        const message = "لم يتم العثور على منتج بهذا الباركود";
        setError(message);
        showToast(message, "error");
        return;
      }
      if (!allowNegativeStock && product.quantity <= 0) {
        const message = "هذا المنتج غير متوفر في المخزون";
        setError(message);
        showToast(message, "error");
        setQuery("");
        return;
      }
      addProduct(product);
      setQuery("");
      setError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر قراءة الباركود";
      setError(message);
      showToast(message, "error");
    }
  }

  function setQty(productId: number, quantity: number) {
    setCart((items) => items
      .map((item) => item.product.id === productId
        ? { ...item, quantity: allowNegativeStock ? Math.max(1, quantity) : Math.max(1, Math.min(quantity, item.product.quantity)) }
        : item)
      .filter((item) => item.quantity > 0));
  }

  function setItemPrice(productId: number, unitPrice: number) {
    const safePrice = Number.isFinite(unitPrice) ? Math.max(0, unitPrice) : 0;
    setCart((items) => items.map((item) => item.product.id === productId
      ? { ...item, unit_price: safePrice }
      : item));
  }

  async function checkout() {
    if (checkingOut) return;
    setError("");
    setCheckingOut(true);
    try {
      const sale = await api.checkout({
        items: cart.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.unit_price
        })),
        perfume_items: [],
        discount,
        sale_type: saleType,
        paid_amount: saleType === "cash" || saleType === "delivery" ? (saleType === "cash" ? total : 0) : normalizedPaid,
        customer_name: customerName,
        customer_phone: customerPhone,
        due_date: dueDate,
        credit_note: creditNote,
        sale_date: saleDate,
        cashier: user.display_name
      });
      setReceipt(sale);
      setCart([]);
      setDiscount(0);
      setSaleType("cash");
      setCustomerName("");
      setCustomerPhone("");
      setPaidAmount(0);
      setDueDate("");
      setCreditNote("");
      setSaleDate(todayInputValue());
      const nextProducts = await api.products({ query, category, stock: "all" });
      setProducts(nextProducts.filter((product) => allowNegativeStock || product.quantity > 0));
      const nextCatalog = await api.products({ stock: "all" });
      setProductCatalog(nextCatalog);
      onSale();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <section className="pos-grid">
      <section className="panel table-panel">
        <div className="filter-row">
          <div className="searchbar">
            <Search size={18} />
            <input
              autoFocus
              placeholder={t.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addScannedBarcode(query);
                }
              }}
            />
          </div>
          <select aria-label={t.category} value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">{t.allCategories}</option>
            {categories.map((item) => <option value={item} key={item}>{displayCategory(item)}</option>)}
          </select>
        </div>
        <div className="product-picker">
          {products.map((product) => (
            <button key={product.id} className="product-tile" onClick={() => addProduct(product)}>
              <span className="product-tile-media">
                {product.image_data ? <img src={product.image_data} alt="" /> : <ShoppingBag size={22} />}
              </span>
              <strong>{product.name}</strong>
              <em><Barcode size={13} /> {product.barcode}</em>
              <small>{product.quantity} قطعة · {money(product.sale_price)}</small>
            </button>
          ))}
        </div>
      </section>

      <aside className="panel cart-panel">
        <div className="section-title"><h2>{t.cart}</h2><span /></div>
        <div className="cart-lines">
          {cart.map((item) => (
            <article key={item.product.id} className="cart-line">
              <div>
                <strong>{item.product.name}</strong>
                <span>{item.product.barcode}</span>
              </div>
              <div className="qty-control">
                <button onClick={() => setQty(item.product.id, item.quantity - 1)}><Minus size={14} /></button>
                <b>{item.quantity}</b>
                <button onClick={() => setQty(item.product.id, item.quantity + 1)}><Plus size={14} /></button>
              </div>
              <label className="cart-price-field">
                <span>سعر البيع</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={item.unit_price === 0 ? "" : item.unit_price}
                  onChange={(event) => setItemPrice(item.product.id, Number(event.target.value))}
                />
              </label>
              <strong>{money(item.unit_price * item.quantity)}</strong>
              <button className="plain-icon" onClick={() => setCart(cart.filter((line) => line.product.id !== item.product.id))}><Trash2 size={16} /></button>
            </article>
          ))}
        </div>
        <label>
          <span>تاريخ الفاتورة</span>
          <div className="field">
            <input
              type="date"
              max={todayInputValue()}
              value={saleDate}
              onChange={(event) => setSaleDate(event.target.value || todayInputValue())}
            />
          </div>
          <small>{formatSaleDate(`${saleDate}T12:00:00`, language, false)}</small>
        </label>
        <label>
          <span>{t.discount}</span>
          <div className="field">
            <input
              type="number"
              min={0}
              max={maxDiscount}
              value={discount === 0 ? "" : discount}
              onChange={(event) => setDiscount(Math.max(0, Math.min(maxDiscount, Number(event.target.value))))}
            />
          </div>
          <small>{`${t.discountMax.replace("200", String(maxDiscount))}`}</small>
        </label>
        <label>
          <span>{t.payment}</span>
          <div className="segmented wide">
            <button className={saleType === "cash" ? "active" : ""} type="button" onClick={() => setSaleType("cash")}>{t.cash}</button>
            <button className={saleType === "credit" ? "active" : ""} type="button" onClick={() => setSaleType("credit")}>{t.credit}</button>
            <button className={saleType === "delivery" ? "active" : ""} type="button" onClick={() => setSaleType("delivery")}>التوصيل</button>
          </div>
        </label>
        {(saleType === "credit" || saleType === "delivery") && (
          <div className="credit-fields">
            <label><span>{t.customer}</span><div className="field"><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></div></label>
            <label><span>{t.phone}</span><div className="field"><input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /></div></label>
            {saleType === "credit" && <label><span>{t.paidNow}</span><div className="field"><input type="number" min={0} max={total} value={paidAmount === 0 ? "" : paidAmount} onChange={(event) => setPaidAmount(Number(event.target.value))} /></div></label>}
            {saleType === "credit" && <label><span>{t.dueDate}</span><div className="field"><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div></label>}
            <label className="full-field"><span>{saleType === "delivery" ? "العنوان / ملاحظة التوصيل" : t.note}</span><textarea value={creditNote} onChange={(event) => setCreditNote(event.target.value)} /></label>
          </div>
        )}
        <div className="totals">
          <span>{t.subtotal} <b>{money(subtotal)}</b></span>
          {saleType === "credit" && <span>{t.remaining} <b>{money(creditRemaining)}</b></span>}
          {saleType === "delivery" && <span>توصيل في الانتظار <b>{money(total)}</b></span>}
          <span>{t.total} <strong>{money(total)}</strong></span>
        </div>
        {(saleType === "credit" || saleType === "delivery") && !customerName.trim() && <p className="helper-text">{t.requiredCreditCustomer}</p>}
        {discount > maxDiscount && <p className="error">{t.discountMax.replace("200", String(maxDiscount))}</p>}
        {discount > subtotal && <p className="error">{t.discountTooHigh}</p>}
        <button className="gold-button" disabled={checkoutBlocked || checkingOut} onClick={checkout}>{checkingOut ? "جار التسجيل..." : t.checkout}</button>
      </aside>

      {receipt && <ReceiptModal sale={receipt} language={language} onClose={() => setReceipt(null)} />}
    </section>
  );
}

function ReceiptModal({ sale, language, onClose }: { sale: Sale; language: Language; onClose: () => void }) {
  const t = useText(language);
  const [, setPrintStatus] = useState("");
  const [, setPrintError] = useState("");
  const [printing, setPrinting] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [settings, setSettings] = useState<Pick<AppSettings, "receipt_title" | "receipt_subtitle" | "show_invoice_logo" | "ticket_width_chars">>({
    receipt_title: "دنزل",
    receipt_subtitle: "للألبسة",
    show_invoice_logo: true,
    ticket_width_chars: 32
  });

  useEffect(() => {
    api.appSettings()
      .then((saved) => setSettings({
        receipt_title: saved.receipt_title || "دنزل",
        receipt_subtitle: saved.receipt_subtitle || "للألبسة",
        show_invoice_logo: saved.show_invoice_logo ?? true,
        ticket_width_chars: Math.min(48, Math.max(24, saved.ticket_width_chars || 32))
      }))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(orderQrPayload(sale), { errorCorrectionLevel: "M", margin: 1, width: 128 })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [sale]);

  async function printReceipt() {
    if (printing) return;
    setPrintStatus("");
    setPrintError("");
    setPrinting(true);
    try {
      await api.printReceiptText(formatReceiptText(sale, t, settings), qrDataUrl);
      const message = "تم إرسال الفاتورة للطباعة";
      setPrintStatus(message);
      showToast(message, "success");
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      const message = detail || "لا يمكن طباعة الفاتورة. تأكد من وجود طابعة.";
      setPrintError(message);
      showToast(message, "error");
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="receipt-modal">
        <div className="receipt-paper" id="receipt">
          {settings.show_invoice_logo && <img src={denzelLogo} alt="دنزل" className="receipt-logo" />}
          <h2>{settings.receipt_title}</h2>
          <p>{settings.receipt_subtitle}</p>
          <small>{sale.receipt_no} · {formatSaleDate(sale.created_at, language)}</small>
          <hr />
          {sale.items.map((item, index) => (
            <div className="receipt-line" key={`${item.product_id}-${item.barcode}-${index}`}>
              <span>{item.product_name}<small>{item.quantity} x {money(item.unit_price)}</small></span>
              <strong>{money(item.line_total)}</strong>
            </div>
          ))}
          <hr />
          <div className="receipt-line"><span>{t.subtotal}</span><strong>{money(sale.subtotal)}</strong></div>
          <div className="receipt-line"><span>{t.discount}</span><strong>{money(sale.discount)}</strong></div>
          {sale.sale_type === "credit" && (
            <>
              <div className="receipt-line"><span>{t.customer}</span><strong>{sale.customer_name}</strong></div>
              <div className="receipt-line"><span>{t.paidCash}</span><strong>{money(sale.paid_amount)}</strong></div>
              <div className="receipt-line"><span>{t.creditRemaining}</span><strong>{money(sale.remaining_amount)}</strong></div>
            </>
          )}
          <div className="receipt-line total"><span>{t.total}</span><strong>{money(sale.total)}</strong></div>
          {qrDataUrl && <img src={qrDataUrl} alt="QR facture" className="receipt-qr" />}
          <p className="thanks">{t.thankYou}</p>
        </div>
        <div className="modal-actions">
          <button className="gold-button" disabled={printing} onClick={() => void printReceipt()}><Printer size={18} /> {printing ? "جار الطباعة..." : t.print}</button>
          <button className="ghost-button" disabled={printing} onClick={onClose}>{t.close}</button>
        </div>
      </section>
    </div>
  );
}

function formatReceiptText(sale: Sale, t: ReturnType<typeof useText>, settings: Pick<AppSettings, "receipt_title" | "receipt_subtitle" | "ticket_width_chars">) {
  const width = Math.min(48, Math.max(24, settings.ticket_width_chars || 32));
  const lines = [
    center(settings.receipt_title || "دنزل", width),
    center(settings.receipt_subtitle || "للألبسة", width),
    "-".repeat(width),
    sale.receipt_no,
    formatSaleDate(sale.created_at, "ar"),
    "-".repeat(width),
    ...sale.items.flatMap((item) => [
      item.product_name,
      `${item.quantity} x ${money(item.unit_price)}`.padEnd(width - money(item.line_total).length) + money(item.line_total)
    ]),
    "-".repeat(width),
    row(t.subtotal, money(sale.subtotal), width),
    row(t.discount, money(sale.discount), width)
  ];
  if (sale.sale_type === "credit") {
    lines.push(
      row(t.customer, sale.customer_name, width),
      row(t.paidCash, money(sale.paid_amount), width),
      row(t.creditRemaining, money(sale.remaining_amount), width)
    );
  }
  lines.push(
    row(t.total, money(sale.total), width),
    "-".repeat(width),
    center(t.thankYou, width),
    "",
    ""
  );
  return lines.join("\n");
}

function center(value: string, width: number) {
  const text = value.slice(0, width);
  const left = Math.max(0, Math.floor((width - text.length) / 2));
  return `${" ".repeat(left)}${text}`;
}

function row(label: string, value: string, width: number) {
  const left = label.slice(0, Math.max(0, width - value.length - 1));
  return `${left}${" ".repeat(Math.max(1, width - left.length - value.length))}${value}`;
}
