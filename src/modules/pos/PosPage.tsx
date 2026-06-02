import { useEffect, useMemo, useState } from "react";
import { Barcode, Minus, Plus, Printer, Search, ShoppingBag, Trash2 } from "lucide-react";
import { api } from "../../shared/api";
import { money } from "../../shared/format";
import { useText } from "../../shared/i18n";
import { CartItem, Language, Product, Sale, UserSession } from "../../shared/types";

const maxDiscount = 200;

export function PosPage({ language, user, onSale }: { language: Language; user: UserSession; onSale: () => void }) {
  const t = useText(language);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [saleType, setSaleType] = useState<"cash" | "credit">("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paidAmount, setPaidAmount] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.products({ query, category, stock: "all" })
      .then((items) => setProducts(items.filter((product) => product.quantity > 0)))
      .catch((err) => setError(String(err)));
  }, [query, category]);

  useEffect(() => {
    api.products()
      .then((items) => setCategories(Array.from(new Set(items.map((product) => product.category))).sort()))
      .catch((err) => setError(String(err)));
  }, []);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.product.sale_price * item.quantity, 0), [cart]);
  const total = Math.max(0, subtotal - discount);
  const normalizedPaid = Math.max(0, Math.min(paidAmount, total));
  const creditRemaining = saleType === "credit" ? Math.max(0, total - normalizedPaid) : 0;
  const checkoutBlocked =
    !cart.length ||
    discount < 0 ||
    discount > maxDiscount ||
    discount > subtotal ||
    (saleType === "credit" && (!customerName.trim() || paidAmount < 0 || paidAmount > total));

  function addProduct(product: Product) {
    if (product.quantity <= 0) return;
    setCart((items) => {
      const existing = items.find((item) => item.product.id === product.id);
      if (existing) {
        return items.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: Math.min(item.quantity + 1, product.quantity) }
            : item
        );
      }
      return [...items, { product, quantity: 1 }];
    });
  }

  function setQty(productId: number, quantity: number) {
    setCart((items) => items
      .map((item) => item.product.id === productId ? { ...item, quantity: Math.max(1, Math.min(quantity, item.product.quantity)) } : item)
      .filter((item) => item.quantity > 0));
  }

  async function checkout() {
    setError("");
    try {
      const sale = await api.checkout({
        items: cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity })),
        discount,
        sale_type: saleType,
        paid_amount: saleType === "cash" ? total : normalizedPaid,
        customer_name: customerName,
        customer_phone: customerPhone,
        due_date: dueDate,
        credit_note: creditNote,
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
      const nextProducts = await api.products({ query, category, stock: "all" });
      setProducts(nextProducts.filter((product) => product.quantity > 0));
      onSale();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="pos-grid">
      <section className="panel table-panel">
        <div className="filter-row">
          <div className="searchbar"><Search size={18} /><input autoFocus placeholder={t.search} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <select aria-label={t.category} value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">{t.allCategories}</option>
            {categories.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </div>
        <div className="product-picker">
          {products.map((product) => (
            <button key={product.id} className="product-tile" onClick={() => addProduct(product)}>
              <span><ShoppingBag size={22} /></span>
              <strong>{product.name}</strong>
              <em><Barcode size={13} /> {product.barcode}</em>
              <small>{product.quantity} pcs · {money(product.sale_price)}</small>
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
              <strong>{money(item.product.sale_price * item.quantity)}</strong>
              <button className="plain-icon" onClick={() => setCart(cart.filter((line) => line.product.id !== item.product.id))}><Trash2 size={16} /></button>
            </article>
          ))}
        </div>
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
        </label>
        <label>
          <span>{t.payment}</span>
          <div className="segmented wide">
            <button className={saleType === "cash" ? "active" : ""} type="button" onClick={() => setSaleType("cash")}>{t.cash}</button>
            <button className={saleType === "credit" ? "active" : ""} type="button" onClick={() => setSaleType("credit")}>{t.credit}</button>
          </div>
        </label>
        {saleType === "credit" && (
          <div className="credit-fields">
            <label><span>{t.customer}</span><div className="field"><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></div></label>
            <label><span>{t.phone}</span><div className="field"><input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /></div></label>
            <label><span>{t.paidNow}</span><div className="field"><input type="number" min={0} max={total} value={paidAmount === 0 ? "" : paidAmount} onChange={(event) => setPaidAmount(Number(event.target.value))} /></div></label>
            <label><span>{t.dueDate}</span><div className="field"><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div></label>
            <label className="full-field"><span>{t.note}</span><textarea value={creditNote} onChange={(event) => setCreditNote(event.target.value)} /></label>
          </div>
        )}
        <div className="totals">
          <span>{t.subtotal} <b>{money(subtotal)}</b></span>
          {saleType === "credit" && <span>{t.remaining} <b>{money(creditRemaining)}</b></span>}
          <span>{t.total} <strong>{money(total)}</strong></span>
        </div>
        {saleType === "credit" && !customerName.trim() && <p className="helper-text">{t.requiredCreditCustomer}</p>}
        {discount > maxDiscount && <p className="error">{t.discountMax}</p>}
        {discount > subtotal && <p className="error">{t.discountTooHigh}</p>}
        {error && <p className="error">{error}</p>}
        <button className="gold-button" disabled={checkoutBlocked} onClick={checkout}>{t.checkout}</button>
      </aside>

      {receipt && <ReceiptModal sale={receipt} language={language} onClose={() => setReceipt(null)} />}
    </section>
  );
}

function ReceiptModal({ sale, language, onClose }: { sale: Sale; language: Language; onClose: () => void }) {
  const t = useText(language);
  return (
    <div className="modal-backdrop">
      <section className="receipt-modal">
        <div className="receipt-paper" id="receipt">
          <h2>ATHENA SHOP</h2>
          <p>RETAIL ATELIER</p>
          <small>{sale.receipt_no} · {sale.created_at}</small>
          <hr />
          {sale.items.map((item) => (
            <div className="receipt-line" key={item.product_id}>
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
          <p className="thanks">{t.thankYou}</p>
        </div>
        <div className="modal-actions">
          <button className="gold-button" onClick={() => window.print()}><Printer size={18} /> {t.print}</button>
          <button className="ghost-button" onClick={onClose}>{t.close}</button>
        </div>
      </section>
    </div>
  );
}
