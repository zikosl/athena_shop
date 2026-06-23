import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, HandCoins, PackagePlus, Plus, Save, Search, UserRound, X } from "lucide-react";
import { api } from "../../shared/api";
import { money } from "../../shared/format";
import {
  Language,
  Product,
  PurchaseOrder,
  Supplier,
  SupplierInput,
  SupplierPayment,
  UserSession
} from "../../shared/types";

type Tab = "suppliers" | "orders" | "payments";
type DraftLine = { product_id: number; quantity: number; purchase_price: number; price_mode: "unit" | "total" };

const emptySupplier: SupplierInput = { name: "", phone: "", address: "", note: "", active: true };

export function SuppliersPage({
  user,
  onChanged
}: {
  language: Language;
  user: UserSession;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>("suppliers");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [supplierForm, setSupplierForm] = useState<SupplierInput | null>(null);
  const [orderForm, setOrderForm] = useState<PurchaseOrder | null | "new">(null);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [error, setError] = useState("");

  const load = () => Promise.all([
    api.suppliers(),
    api.purchaseOrders(),
    api.supplierPayments(),
    api.products()
  ]).then(([nextSuppliers, nextOrders, nextPayments, nextProducts]) => {
    setSuppliers(nextSuppliers);
    setOrders(nextOrders);
    setPayments(nextPayments);
    setProducts(nextProducts);
  });

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const totals = useMemo(() => ({
    purchases: suppliers.reduce((sum, supplier) => sum + supplier.total_purchases, 0),
    paid: suppliers.reduce((sum, supplier) => sum + supplier.total_paid, 0),
    remaining: suppliers.reduce((sum, supplier) => sum + supplier.remaining_amount, 0),
    active: suppliers.filter((supplier) => supplier.active).length
  }), [suppliers]);

  const filteredSuppliers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return suppliers.filter((supplier) => !normalized || [supplier.name, supplier.phone, supplier.address]
      .some((value) => value.toLowerCase().includes(normalized)));
  }, [query, suppliers]);

  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return orders.filter((order) => !normalized || [order.bon_no, order.supplier_name, order.status]
      .some((value) => value.toLowerCase().includes(normalized)));
  }, [orders, query]);

  async function saveSupplier(event: FormEvent) {
    event.preventDefault();
    if (!supplierForm) return;
    setError("");
    try {
      await api.saveSupplier(supplierForm);
      setSupplierForm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function disableSupplier(supplier: Supplier) {
    if (!window.confirm(`هل تريد تعطيل المورد "${supplier.name}"؟`)) return;
    setError("");
    try {
      await api.disableSupplier(supplier.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function openOrder(order: PurchaseOrder) {
    setError("");
    try {
      setSelectedOrder(await api.purchaseOrder(order.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function refreshAfterOrder(order?: PurchaseOrder) {
    await load();
    onChanged();
    if (order) setSelectedOrder(await api.purchaseOrder(order.id));
  }

  return (
    <section className="panel suppliers-page">
      <div className="section-title">
        <h2><UserRound size={18} /> الموردون</h2>
        <button className="gold-button compact-button" type="button" onClick={() => setOrderForm("new")}><PackagePlus size={17} /> قسيمة شراء</button>
        <button className="ghost-button compact-button" type="button" onClick={() => setSupplierForm(emptySupplier)}><Plus size={17} /> مورد جديد</button>
      </div>

      <div className="summary-strip supplier-summary">
        <article><span>عدد الموردين</span><strong>{totals.active}</strong></article>
        <article><span>إجمالي الشراء</span><strong>{money(totals.purchases)}</strong></article>
        <article><span>المدفوع</span><strong>{money(totals.paid)}</strong></article>
        <article><span>المتبقي</span><strong>{money(totals.remaining)}</strong></article>
      </div>

      <div className="segmented page-tabs">
        <button className={tab === "suppliers" ? "active" : ""} type="button" onClick={() => setTab("suppliers")}>الموردون</button>
        <button className={tab === "orders" ? "active" : ""} type="button" onClick={() => setTab("orders")}>قسائم الشراء</button>
        <button className={tab === "payments" ? "active" : ""} type="button" onClick={() => setTab("payments")}>دفعات الموردين</button>
      </div>

      <div className="searchbar"><Search size={18} /><input placeholder="بحث..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      {error && <p className="error">{error}</p>}

      {tab === "suppliers" && (
        <div className="supplier-card-grid">
          {filteredSuppliers.map((supplier) => (
            <article className="supplier-card" key={supplier.id}>
              <div className="delivery-card-head">
                <strong>{supplier.name}</strong>
                <span className={`status-pill ${supplier.active ? "ok" : "warning"}`}>{supplier.active ? "نشط" : "معطل"}</span>
              </div>
              <span>{supplier.phone || "بدون هاتف"}</span>
              <small>{supplier.address || "بدون عنوان"}</small>
              <div className="supplier-money-grid">
                <span>شراء <b>{money(supplier.total_purchases)}</b></span>
                <span>مدفوع <b>{money(supplier.total_paid)}</b></span>
                <span>متبقي <b>{money(supplier.remaining_amount)}</b></span>
              </div>
              <div className="button-row">
                <button className="ghost-button compact-button" type="button" onClick={() => setSupplierForm(supplier)}>تعديل</button>
                <button className="ghost-button compact-button danger-action" type="button" disabled={!supplier.active} onClick={() => void disableSupplier(supplier)}>تعطيل</button>
              </div>
            </article>
          ))}
          {!filteredSuppliers.length && <p className="empty-state">لا يوجد موردون بعد.</p>}
        </div>
      )}

      {tab === "orders" && (
        <div className="data-table">
          <table>
            <thead><tr><th>القسيمة</th><th>المورد</th><th>الحالة</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id} onClick={() => void openOrder(order)}>
                  <td>{order.bon_no}<span>{order.created_at.slice(0, 10)}</span></td>
                  <td>{order.supplier_name}</td>
                  <td><span className={`status-pill ${order.status === "paid" ? "ok" : order.status === "draft" ? "warning" : ""}`}>{orderStatus(order.status)}</span></td>
                  <td>{money(order.subtotal)}</td>
                  <td>{money(order.paid_amount)}</td>
                  <td>{money(order.remaining_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredOrders.length && <p className="empty-state">لا توجد قسائم شراء بعد.</p>}
        </div>
      )}

      {tab === "payments" && (
        <div className="data-table">
          <table>
            <thead><tr><th>التاريخ</th><th>المورد</th><th>القسيمة</th><th>المبلغ</th><th>المستخدم</th><th>ملاحظة</th></tr></thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.paid_at.slice(0, 16)}</td>
                  <td>{payment.supplier_name}</td>
                  <td>{payment.bon_no}</td>
                  <td>{money(payment.amount)}</td>
                  <td>{payment.cashier}</td>
                  <td>{payment.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!payments.length && <p className="empty-state">لا توجد دفعات موردين بعد.</p>}
        </div>
      )}

      {supplierForm && (
        <div className="modal-backdrop">
          <form className="panel compact-form-modal supplier-form-modal" onSubmit={saveSupplier}>
            <div className="section-title"><h2>مورد</h2><span /><button className="ghost-button compact-button" type="button" onClick={() => setSupplierForm(null)}><X size={16} /> إغلاق</button></div>
            <label><span>الاسم</span><div className="field"><input value={supplierForm.name} onChange={(event) => setSupplierForm({ ...supplierForm, name: event.target.value })} /></div></label>
            <label><span>الهاتف</span><div className="field"><input value={supplierForm.phone} onChange={(event) => setSupplierForm({ ...supplierForm, phone: event.target.value })} /></div></label>
            <label><span>العنوان</span><div className="field"><input value={supplierForm.address} onChange={(event) => setSupplierForm({ ...supplierForm, address: event.target.value })} /></div></label>
            <label><span>ملاحظة</span><textarea value={supplierForm.note} onChange={(event) => setSupplierForm({ ...supplierForm, note: event.target.value })} /></label>
            <label className="toggle-row"><input type="checkbox" checked={supplierForm.active} onChange={(event) => setSupplierForm({ ...supplierForm, active: event.target.checked })} /><span>نشط</span></label>
            <button className="gold-button" disabled={!supplierForm.name.trim()}><Save size={18} /> حفظ</button>
          </form>
        </div>
      )}

      {orderForm && (
        <PurchaseOrderForm
          order={orderForm === "new" ? null : orderForm}
          suppliers={suppliers.filter((supplier) => (
            supplier.active || (orderForm !== "new" && supplier.id === orderForm.supplier_id)
          ))}
          products={products}
          cashier={user.display_name}
          onSupplierCreated={(supplier) => setSuppliers((current) => (
            current.some((item) => item.id === supplier.id) ? current : [supplier, ...current]
          ))}
          onClose={() => setOrderForm(null)}
          onSaved={(order) => {
            setOrderForm(null);
            setTab("orders");
            void refreshAfterOrder(order);
          }}
        />
      )}

      {selectedOrder && (
        <PurchaseOrderDetail
          order={selectedOrder}
          cashier={user.display_name}
          onClose={() => setSelectedOrder(null)}
          onEdit={(order) => {
            setSelectedOrder(null);
            setOrderForm(order);
          }}
          onChanged={(order) => void refreshAfterOrder(order)}
        />
      )}
    </section>
  );
}

function PurchaseOrderForm({
  order,
  suppliers,
  products,
  cashier,
  onSupplierCreated,
  onClose,
  onSaved
}: {
  order: PurchaseOrder | null;
  suppliers: Supplier[];
  products: Product[];
  cashier: string;
  onSupplierCreated: (supplier: Supplier) => void;
  onClose: () => void;
  onSaved: (order: PurchaseOrder) => void;
}) {
  const [availableSuppliers, setAvailableSuppliers] = useState(suppliers);
  const initialSupplier = suppliers.find((supplier) => supplier.id === order?.supplier_id) ?? suppliers[0];
  const [supplierId, setSupplierId] = useState(order?.supplier_id ?? initialSupplier?.id ?? 0);
  const [supplierSearch, setSupplierSearch] = useState(initialSupplier?.name ?? "");
  const [supplierMenuOpen, setSupplierMenuOpen] = useState(false);
  const [quickSupplier, setQuickSupplier] = useState<SupplierInput | null>(null);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [note, setNote] = useState(order?.note ?? "");
  const [lines, setLines] = useState<DraftLine[]>(order?.items.map((item) => ({
    product_id: item.product_id,
    quantity: item.quantity,
    purchase_price: item.unit_purchase_price,
    price_mode: "unit"
  })) ?? [{ product_id: products[0]?.id ?? 0, quantity: 1, purchase_price: 0, price_mode: "unit" }]);
  const [error, setError] = useState("");
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * unitPrice(line), 0);
  const supplierMatches = availableSuppliers.filter((supplier) => {
    const search = supplierSearch.trim().toLowerCase();
    return !search || [supplier.name, supplier.phone, supplier.address]
      .some((value) => value.toLowerCase().includes(search));
  }).slice(0, 7);
  const hasExactSupplier = availableSuppliers.some((supplier) => (
    supplier.name.trim().toLowerCase() === supplierSearch.trim().toLowerCase()
  ));

  useEffect(() => {
    setAvailableSuppliers(suppliers);
  }, [suppliers]);

  function selectSupplier(supplier: Supplier) {
    setSupplierId(supplier.id);
    setSupplierSearch(supplier.name);
    setSupplierMenuOpen(false);
    setQuickSupplier(null);
  }

  function startQuickSupplier() {
    setQuickSupplier({ ...emptySupplier, name: supplierSearch.trim() });
    setSupplierMenuOpen(false);
  }

  async function createQuickSupplier() {
    if (!quickSupplier?.name.trim() || savingSupplier) return;
    setSavingSupplier(true);
    setError("");
    try {
      const supplier = await api.saveSupplier(quickSupplier);
      setAvailableSuppliers((current) => [supplier, ...current.filter((item) => item.id !== supplier.id)]);
      onSupplierCreated(supplier);
      selectSupplier(supplier);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingSupplier(false);
    }
  }

  function updateLine(index: number, next: DraftLine) {
    setLines(lines.map((line, lineIndex) => lineIndex === index ? next : line));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const saved = await api.savePurchaseOrderDraft({
        id: order?.id,
        supplier_id: supplierId,
        note,
        cashier,
        items: lines.map((line) => ({
          product_id: line.product_id,
          quantity: line.quantity,
          unit_purchase_price: unitPrice(line)
        }))
      });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="panel form-modal purchase-form-modal" onSubmit={submit}>
        <div className="section-title"><h2><ClipboardList size={18} /> قسيمة شراء</h2><span /><button className="ghost-button compact-button" type="button" onClick={onClose}><X size={16} /> إغلاق</button></div>
        <div className="form-grid">
          <div className="supplier-picker-block">
            <label><span>المورد</span></label>
            <div className={`supplier-combobox ${supplierMenuOpen ? "open" : ""}`}>
              <Search size={18} />
              <input
                role="combobox"
                aria-expanded={supplierMenuOpen}
                aria-controls="supplier-options"
                autoComplete="off"
                placeholder="اكتب اسم المورد أو رقم الهاتف..."
                value={supplierSearch}
                onFocus={() => setSupplierMenuOpen(true)}
                onBlur={() => window.setTimeout(() => setSupplierMenuOpen(false), 120)}
                onChange={(event) => {
                  setSupplierSearch(event.target.value);
                  setSupplierId(0);
                  setSupplierMenuOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSupplierMenuOpen(false);
                  if (event.key === "Enter" && supplierMenuOpen && supplierMatches.length > 0) {
                    event.preventDefault();
                    selectSupplier(supplierMatches[0]);
                  } else if (event.key === "Enter" && supplierMenuOpen && !supplierMatches.length) {
                    event.preventDefault();
                    startQuickSupplier();
                  }
                }}
              />
              {supplierMenuOpen && (
                <div className="supplier-options" id="supplier-options" role="listbox">
                  {supplierMatches.map((supplier) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={supplier.id === supplierId}
                      key={supplier.id}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectSupplier(supplier)}
                    >
                      <UserRound size={18} />
                      <span><strong>{supplier.name}</strong><small>{supplier.phone || "بدون رقم هاتف"}</small></span>
                      {supplier.id === supplierId && <CheckCircle2 size={17} />}
                    </button>
                  ))}
                  {!supplierMatches.length && <p>لا يوجد مورد مطابق.</p>}
                  {(!hasExactSupplier || !availableSuppliers.length) && (
                    <button className="supplier-create-option" type="button" onMouseDown={(event) => event.preventDefault()} onClick={startQuickSupplier}>
                      <Plus size={18} />
                      <span><strong>إنشاء مورد جديد</strong><small>{supplierSearch.trim() ? `باستعمال الاسم «${supplierSearch.trim()}»` : "إضافة مورد دون مغادرة القسيمة"}</small></span>
                    </button>
                  )}
                </div>
              )}
            </div>
            {quickSupplier && (
              <div className="quick-supplier-panel">
                <div className="quick-supplier-title"><span><Plus size={16} /> مورد جديد</span><button type="button" className="plain-icon" onClick={() => setQuickSupplier(null)}><X size={15} /></button></div>
                <div className="quick-supplier-grid">
                  <label><span>الاسم *</span><div className="field"><input autoFocus value={quickSupplier.name} onChange={(event) => setQuickSupplier({ ...quickSupplier, name: event.target.value })} /></div></label>
                  <label><span>الهاتف</span><div className="field"><input value={quickSupplier.phone} onChange={(event) => setQuickSupplier({ ...quickSupplier, phone: event.target.value })} /></div></label>
                  <label><span>العنوان</span><div className="field"><input value={quickSupplier.address} onChange={(event) => setQuickSupplier({ ...quickSupplier, address: event.target.value })} /></div></label>
                </div>
                <div className="button-row">
                  <button className="gold-button compact-button" type="button" disabled={!quickSupplier.name.trim() || savingSupplier} onClick={() => void createQuickSupplier()}><Save size={16} /> {savingSupplier ? "جار الحفظ..." : "إنشاء واختيار"}</button>
                  <button className="ghost-button compact-button" type="button" disabled={savingSupplier} onClick={() => setQuickSupplier(null)}>إلغاء</button>
                </div>
              </div>
            )}
          </div>
          <label><span>ملاحظة</span><div className="field"><input value={note} onChange={(event) => setNote(event.target.value)} /></div></label>
        </div>
        <div className="purchase-lines">
          {lines.map((line, index) => (
            <article className="purchase-line" key={index}>
              <label><span>المنتج</span><div className="field"><select value={line.product_id} onChange={(event) => updateLine(index, { ...line, product_id: Number(event.target.value) })}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></div></label>
              <label><span>الكمية</span><div className="field"><input type="number" min={1} value={line.quantity} onChange={(event) => updateLine(index, { ...line, quantity: Math.max(1, Number(event.target.value)) })} /></div></label>
              <label><span>طريقة السعر</span><div className="segmented wide"><button className={line.price_mode === "unit" ? "active" : ""} type="button" onClick={() => updateLine(index, { ...line, price_mode: "unit" })}>سعر القطعة</button><button className={line.price_mode === "total" ? "active" : ""} type="button" onClick={() => updateLine(index, { ...line, price_mode: "total" })}>سعر الكمية</button></div></label>
              <label><span>{line.price_mode === "unit" ? "سعر القطعة" : "سعر الكمية كاملة"}</span><div className="field"><input type="number" min={0} value={line.purchase_price === 0 ? "" : line.purchase_price} onChange={(event) => updateLine(index, { ...line, purchase_price: Math.max(0, Number(event.target.value)) })} /></div></label>
              <strong>{money(line.quantity * unitPrice(line))}</strong>
              <button className="plain-icon danger-action" type="button" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))}><X size={16} /></button>
            </article>
          ))}
        </div>
        <button className="ghost-button compact-button" type="button" onClick={() => setLines([...lines, { product_id: products[0]?.id ?? 0, quantity: 1, purchase_price: 0, price_mode: "unit" }])}><Plus size={16} /> إضافة منتج</button>
        <div className="totals"><span>الإجمالي <strong>{money(subtotal)}</strong></span></div>
        {error && <p className="error">{error}</p>}
        <button className="gold-button" disabled={!supplierId || !products.length}><Save size={18} /> حفظ كمسودة</button>
      </form>
    </div>
  );
}

function PurchaseOrderDetail({
  order,
  cashier,
  onClose,
  onEdit,
  onChanged
}: {
  order: PurchaseOrder;
  cashier: string;
  onClose: () => void;
  onEdit: (order: PurchaseOrder) => void;
  onChanged: (order: PurchaseOrder) => void;
}) {
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentNote, setPaymentNote] = useState("");
  const [error, setError] = useState("");

  async function confirmOrder() {
    setError("");
    try {
      onChanged(await api.confirmPurchaseOrder(order.id, Math.max(0, paidAmount), cashier));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function addPayment() {
    setError("");
    try {
      onChanged(await api.addSupplierPayment({
        purchase_order_id: order.id,
        amount: Math.max(0, paymentAmount),
        note: paymentNote,
        cashier
      }));
      setPaymentAmount(0);
      setPaymentNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="panel form-modal purchase-detail-modal">
        <div className="section-title"><h2>{order.bon_no} · {order.supplier_name}</h2><span /><button className="ghost-button compact-button" type="button" onClick={onClose}><X size={16} /> إغلاق</button></div>
        <div className="summary-strip compact">
          <article><span>الحالة</span><strong>{orderStatus(order.status)}</strong></article>
          <article><span>الإجمالي</span><strong>{money(order.subtotal)}</strong></article>
          <article><span>المدفوع</span><strong>{money(order.paid_amount)}</strong></article>
          <article><span>المتبقي</span><strong>{money(order.remaining_amount)}</strong></article>
        </div>
        <div className="data-table">
          <table>
            <thead><tr><th>المنتج</th><th>الكمية</th><th>سعر الشراء</th><th>الإجمالي</th></tr></thead>
            <tbody>{order.items.map((item) => <tr key={item.id}><td>{item.product_name}<span>{item.barcode}</span></td><td>{item.quantity}</td><td>{money(item.unit_purchase_price)}</td><td>{money(item.line_total)}</td></tr>)}</tbody>
          </table>
        </div>
        {order.status === "draft" ? (
          <div className="form-grid">
            <label><span>المدفوع الآن</span><div className="field"><input type="number" min={0} max={order.subtotal} value={paidAmount === 0 ? "" : paidAmount} onChange={(event) => setPaidAmount(Number(event.target.value))} /></div></label>
            <button className="ghost-button" type="button" onClick={() => onEdit(order)}>تعديل المسودة</button>
            <button className="gold-button" type="button" onClick={() => void confirmOrder()}><CheckCircle2 size={18} /> تأكيد القسيمة</button>
          </div>
        ) : order.remaining_amount > 0 ? (
          <div className="form-grid">
            <label><span>دفعة جديدة</span><div className="field"><input type="number" min={0} max={order.remaining_amount} value={paymentAmount === 0 ? "" : paymentAmount} onChange={(event) => setPaymentAmount(Number(event.target.value))} /></div></label>
            <label><span>ملاحظة</span><div className="field"><input value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} /></div></label>
            <button className="gold-button" type="button" onClick={() => void addPayment()}><HandCoins size={18} /> إضافة دفعة</button>
          </div>
        ) : <p className="helper-text">تم دفع هذه القسيمة بالكامل.</p>}
        {!!order.payments.length && (
          <div className="data-table">
            <table><thead><tr><th>التاريخ</th><th>المبلغ</th><th>المستخدم</th><th>ملاحظة</th></tr></thead><tbody>{order.payments.map((payment) => <tr key={payment.id}><td>{payment.paid_at.slice(0, 16)}</td><td>{money(payment.amount)}</td><td>{payment.cashier}</td><td>{payment.note || "-"}</td></tr>)}</tbody></table>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>
    </div>
  );
}

function unitPrice(line: DraftLine) {
  return line.price_mode === "total" ? line.purchase_price / Math.max(1, line.quantity) : line.purchase_price;
}

function orderStatus(status: PurchaseOrder["status"]) {
  if (status === "draft") return "مسودة";
  if (status === "paid") return "مدفوع";
  return "مؤكد";
}
