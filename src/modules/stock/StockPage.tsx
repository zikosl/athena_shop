import { FormEvent, MouseEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Barcode, ClipboardList, Coins, Edit3, History, ImagePlus, PackageMinus, PackagePlus, Plus, RefreshCcw, Save, Search, Trash2, X } from "lucide-react";
import { api } from "../../shared/api";
import { money } from "../../shared/format";
import { useText } from "../../shared/i18n";
import { showToast } from "../../shared/toast";
import { Language, Product, ProductInput, ProductStockFilter, StockMovement } from "../../shared/types";

const emptyProduct: ProductInput = {
  name: "",
  barcode: "",
  category: "Products",
  size: "",
  color: "",
  quantity: 0,
  low_stock_threshold: 3,
  purchase_price: 0,
  sale_price: 0,
  image_data: ""
};
const maxProductImageSize = 5 * 1024 * 1024;

function createBarcode() {
  return `AS${Date.now().toString().slice(-10)}${Math.floor(Math.random() * 90 + 10)}`;
}

function newProduct(): ProductInput {
  return { ...emptyProduct, barcode: createBarcode() };
}

type MovementForm = {
  product: Product;
  type: "entry" | "destock";
  quantity: number;
  purchase_price: number;
  purchase_price_mode: "unit" | "total";
  note: string;
};

export function StockPage({
  language,
  onChanged,
  initialStockFilter = "all"
}: {
  language: Language;
  onChanged: () => void;
  initialStockFilter?: ProductStockFilter;
}) {
  const t = useText(language);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [stockFilter, setStockFilter] = useState<ProductStockFilter>(initialStockFilter);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [form, setForm] = useState<ProductInput>(newProduct);
  const [formOpen, setFormOpen] = useState(false);
  const [inventoryMode, setInventoryMode] = useState(false);
  const [inventoryCounts, setInventoryCounts] = useState<Record<number, number>>({});
  const [movementForm, setMovementForm] = useState<MovementForm | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [allowNegativeStock, setAllowNegativeStock] = useState(true);
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; product: Product } | null>(null);
  const [error, setError] = useState("");

  const load = () => api.products({ query, category, stock: stockFilter }).then(setProducts);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [query, category, stockFilter]);

  useEffect(() => {
    setStockFilter(initialStockFilter);
  }, [initialStockFilter]);

  useEffect(() => {
    refreshCategories().catch((err) => setError(err instanceof Error ? err.message : String(err)));
    api.appSettings()
      .then((settings) => setAllowNegativeStock(settings.allow_negative_stock))
      .catch(() => setAllowNegativeStock(true));
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  const margin = useMemo(() => form.sale_price - form.purchase_price, [form]);
  const stockTotals = useMemo(() => {
    const purchaseValue = products.reduce((sum, product) => sum + product.purchase_price * product.quantity, 0);
    const revenueValue = products.reduce((sum, product) => sum + product.sale_price * product.quantity, 0);
    return {
      purchaseValue,
      revenueValue,
      marginValue: revenueValue - purchaseValue,
      quantity: products.reduce((sum, product) => sum + product.quantity, 0)
    };
  }, [products]);
  const inventoryDiff = useMemo(
    () => products.reduce((sum, product) => sum + ((inventoryCounts[product.id] ?? product.quantity) - product.quantity), 0),
    [inventoryCounts, products]
  );

  async function refreshCategories() {
    const items = await api.products();
    setCategories(Array.from(new Set(items.map((product) => product.category).filter(Boolean))).sort());
  }

  function openNewProduct() {
    setError("");
    setForm(newProduct());
    setFormOpen(true);
  }

  function openEditProduct(product: Product) {
    setError("");
    setForm(product);
    setFormOpen(true);
  }

  function openMovement(product: Product, type: "entry" | "destock") {
    setError("");
    setMovementForm({
      product,
      type,
      quantity: 1,
      purchase_price: type === "entry" ? product.purchase_price : 0,
      purchase_price_mode: "unit",
      note: type === "entry" ? "شراء مخزون" : "إخراج من المخزون"
    });
  }

  async function openHistory(product: Product) {
    setError("");
    setHistoryProduct(product);
    setHistoryLoading(true);
    try {
      setMovements(await api.stockMovements(product.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api.saveProduct(form);
      setForm(newProduct());
      setFormOpen(false);
      await load();
      await refreshCategories();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove(product: Product) {
    setError("");
    if (!window.confirm(`هل تريد حذف المنتج "${product.name}"؟ لا يمكن التراجع عن هذه العملية.`)) return;
    try {
      await api.deleteProduct(product.id);
      await load();
      await refreshCategories();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function toggleInventory() {
    setError("");
    setInventoryMode((enabled) => {
      const next = !enabled;
      if (next) {
        setInventoryCounts(Object.fromEntries(products.map((product) => [product.id, product.quantity])));
      }
      return next;
    });
  }

  function resetInventory() {
    setInventoryCounts(Object.fromEntries(products.map((product) => [product.id, product.quantity])));
  }

  function openContextMenu(event: MouseEvent<HTMLElement>, product: Product) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 180),
      y: Math.min(event.clientY, window.innerHeight - 54),
      product
    });
  }

  function updateFromContextMenu() {
    if (!contextMenu) return;
    openEditProduct(contextMenu.product);
    setContextMenu(null);
  }

  async function submitMovement(event: FormEvent) {
    event.preventDefault();
    if (!movementForm) return;
    setError("");
    try {
      const unitPurchasePrice = movementForm.type === "entry" && movementForm.purchase_price_mode === "total"
        ? movementForm.purchase_price / Math.max(1, movementForm.quantity)
        : movementForm.purchase_price;
      await api.adjustProductStock({
        product_id: movementForm.product.id,
        movement_type: movementForm.type,
        quantity: movementForm.quantity,
        purchase_price: movementForm.type === "entry" ? unitPurchasePrice : 0,
        note: movementForm.note
      });
      setMovementForm(null);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function chooseImage(file: File | undefined) {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("يرجى اختيار صورة صالحة");
      return;
    }
    if (file.size > maxProductImageSize) {
      setError("الصورة كبيرة جدا. الحد الأقصى 5 MB");
      return;
    }
    const imageData = await readImage(file);
    setForm((current) => ({ ...current, image_data: imageData }));
  }

  async function saveInventory() {
    setError("");
    try {
      const changed = products.filter((product) => (inventoryCounts[product.id] ?? product.quantity) !== product.quantity);
      await Promise.all(changed.map((product) => {
        const counted = inventoryCounts[product.id] ?? product.quantity;
        const diff = counted - product.quantity;
        return diff > 0
          ? api.adjustProductStock({
            product_id: product.id,
            movement_type: "entry",
            quantity: diff,
            purchase_price: product.purchase_price,
            note: "تصحيح الجرد"
          })
          : api.adjustProductStock({
            product_id: product.id,
            movement_type: "destock",
            quantity: Math.abs(diff),
            purchase_price: 0,
            note: "تصحيح الجرد"
          });
      }));
      await api.saveNow();
      await load();
      setInventoryMode(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <section className="panel table-panel full">
        <div className="section-title">
          <h2><ClipboardList size={18} /> {t.stock}</h2>
          <button className="gold-button compact-button" type="button" onClick={openNewProduct}>
            <Plus size={17} /> {t.newProduct}
          </button>
          <button className={inventoryMode ? "gold-button compact-button" : "ghost-button compact-button"} onClick={toggleInventory}>
            <ClipboardList size={17} /> {t.inventory}
          </button>
        </div>
        <div className="summary-strip stock-summary">
          <article><span>{t.stockPurchaseValue}</span><strong>{money(stockTotals.purchaseValue)}</strong></article>
          <article><span>{t.stockRevenueValue}</span><strong>{money(stockTotals.revenueValue)}</strong></article>
          <article><span>{t.stockMarginValue}</span><strong>{money(stockTotals.marginValue)}</strong></article>
          <article><span>{t.quantity}</span><strong><Coins size={16} /> {stockTotals.quantity}</strong></article>
        </div>
        {error && !formOpen && <p className="error">{error}</p>}
        {inventoryMode && (
          <div className="inventory-toolbar">
            <span>{t.inventoryGap}: <strong>{inventoryDiff}</strong></span>
            <div>
              <button className="ghost-button compact-button" onClick={resetInventory}><RefreshCcw size={16} /> {t.reset}</button>
              <button className="gold-button compact-button" onClick={() => void saveInventory()}><Save size={16} /> {t.saveInventory}</button>
            </div>
          </div>
        )}
        <div className="filter-row">
          <div className="searchbar"><Search size={18} /><input placeholder={t.search} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <select aria-label={t.category} value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">{t.allCategories}</option>
            {categories.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
          <select aria-label={t.stockFilter} value={stockFilter} onChange={(event) => setStockFilter(event.target.value as ProductStockFilter)}>
            <option value="all">{t.stockAll}</option>
            <option value="available">{t.inStock}</option>
            <option value="low">{t.lowOnly}</option>
            <option value="out">{t.outOfStock}</option>
          </select>
        </div>
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>{t.product}</th>
                <th>{t.barcode}</th>
                <th>{t.quantity}</th>
                {inventoryMode && <th>{t.countedQuantity}</th>}
                {inventoryMode && <th>{t.gap}</th>}
                <th>{t.buyPrice}</th>
                <th>{t.salePrice}</th>
                <th>{t.stockPurchaseValue}</th>
                <th>{t.stockRevenueValue}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.id}
                  className={product.quantity <= product.low_stock_threshold ? "low-row" : ""}
                  onClick={() => setBarcodeProduct(product)}
                  onContextMenu={(event) => openContextMenu(event, product)}
                >
                  <td>
                    <div className="product-cell">
                      {product.image_data ? <img src={product.image_data} alt="" /> : <span className="product-thumb-placeholder"><ImagePlus size={16} /></span>}
                      <div><strong>{product.name}</strong><span>{product.category} · {product.size} · {product.color}</span></div>
                    </div>
                  </td>
                  <td>{product.barcode}</td>
                  <td>{product.quantity}</td>
                  {inventoryMode && (
                    <td>
                      <input
                        className="quantity-input"
                        type="number"
                        min={0}
                        value={inventoryCounts[product.id] ?? product.quantity}
                        onChange={(event) => setInventoryCounts({ ...inventoryCounts, [product.id]: Number(event.target.value) })}
                      />
                    </td>
                  )}
                  {inventoryMode && <td>{(inventoryCounts[product.id] ?? product.quantity) - product.quantity}</td>}
                  <td>{money(product.purchase_price)}</td>
                  <td>{money(product.sale_price)}</td>
                  <td>{money(product.purchase_price * product.quantity)}</td>
                  <td>{money(product.sale_price * product.quantity)}</td>
                  <td className="row-actions">
                    <button title="إدخال مخزون" onClick={(event) => { event.stopPropagation(); openMovement(product, "entry"); }}><PackagePlus size={16} /></button>
                    <button title="إخراج مخزون" onClick={(event) => { event.stopPropagation(); openMovement(product, "destock"); }}><PackageMinus size={16} /></button>
                    <button title="حركات المخزون" onClick={(event) => { event.stopPropagation(); void openHistory(product); }}><History size={16} /></button>
                    <button onClick={(event) => { event.stopPropagation(); openEditProduct(product); }} onContextMenu={(event) => openContextMenu(event, product)}><Edit3 size={16} /></button>
                    <button className="danger-action" title="حذف المنتج" onClick={(event) => { event.stopPropagation(); void remove(product); }}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {contextMenu && (
          <div className="context-menu" style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }} onContextMenu={(event) => event.preventDefault()}>
            <button type="button" onClick={updateFromContextMenu}>
              <Edit3 size={15} /> {t.update}
            </button>
          </div>
        )}
      </section>

      {formOpen && (
        <div className="modal-backdrop">
          <form className="panel form-panel form-modal" onSubmit={submit}>
            <div className="section-title">
              <h2><Plus size={18} /> {form.id ? t.edit : t.newProduct}</h2>
              <span />
              <button className="ghost-button compact-button" type="button" onClick={() => setFormOpen(false)}><X size={16} /> {t.close}</button>
            </div>
            <div className="form-grid">
              <Input label={t.product} value={form.name} onChange={(name) => setForm({ ...form, name })} />
              <Input label={t.barcode} value={form.barcode} icon={<Barcode size={16} />} onChange={(barcode) => setForm({ ...form, barcode })} />
              <Input label={t.category} value={form.category} list="product-categories" onChange={(category) => setForm({ ...form, category })} />
              <Input label={t.size} value={form.size} onChange={(size) => setForm({ ...form, size })} />
              <Input label={t.color} value={form.color} onChange={(color) => setForm({ ...form, color })} />
              <Input label={t.quantity} type="number" value={form.quantity} onChange={(quantity) => setForm({ ...form, quantity: Number(quantity) })} />
              <Input label={t.alert} type="number" value={form.low_stock_threshold} onChange={(value) => setForm({ ...form, low_stock_threshold: Number(value) })} />
              <Input label={t.buyPrice} type="number" value={form.purchase_price} onChange={(value) => setForm({ ...form, purchase_price: Number(value) })} />
              <Input label={t.salePrice} type="number" value={form.sale_price} onChange={(value) => setForm({ ...form, sale_price: Number(value) })} />
            </div>
            <datalist id="product-categories">
              {categories.map((item) => <option value={item} key={item} />)}
            </datalist>
            <div className="image-uploader">
              <div className="product-image-preview">
                {form.image_data ? <img src={form.image_data} alt="" /> : <ImagePlus size={30} />}
              </div>
              <div className="image-actions">
                <label className="ghost-button compact-button">
                  <ImagePlus size={16} /> صورة المنتج
                  <input type="file" accept="image/*" onChange={(event) => void chooseImage(event.target.files?.[0])} />
                </label>
                {form.image_data && (
                  <button className="ghost-button compact-button" type="button" onClick={() => setForm({ ...form, image_data: "" })}>
                    <X size={16} /> إزالة الصورة
                  </button>
                )}
              </div>
            </div>
            <div className="profit-preview">{t.estimatedMargin} <strong>{money(margin)}</strong></div>
            {error && <p className="error">{error}</p>}
            <div className="button-row">
              {!form.id && (
                <button className="ghost-button" type="button" onClick={() => setForm({ ...form, barcode: createBarcode() })}>
                  <RefreshCcw size={17} /> {t.generateBarcode}
                </button>
              )}
              <button className="gold-button" type="submit"><Save size={18} /> {t.save}</button>
            </div>
          </form>
        </div>
      )}

      {movementForm && (
        <div className="modal-backdrop">
          <form className="panel form-panel compact-form-modal stock-movement-modal" onSubmit={submitMovement}>
            <div className="section-title">
              <h2>
                {movementForm.type === "entry" ? <PackagePlus size={18} /> : <PackageMinus size={18} />}
                {movementForm.type === "entry" ? "إدخال مخزون" : "إخراج مخزون"}
              </h2>
              <span />
              <button className="ghost-button compact-button" type="button" onClick={() => setMovementForm(null)}><X size={16} /> {t.close}</button>
            </div>
            <div className="movement-product-card">
              <strong>{movementForm.product.name}</strong>
              <span>{movementForm.product.barcode}</span>
              <b>المتوفر الآن: {movementForm.product.quantity}</b>
            </div>
            <div className="form-grid one-column">
              <Input
                label="الكمية"
                type="number"
                value={movementForm.quantity}
                onChange={(value) => setMovementForm({ ...movementForm, quantity: Math.max(0, Number(value)) })}
              />
              {movementForm.type === "entry" && (
                <>
                  <div className="segmented wide price-mode-tabs full-field">
                    <button
                      className={movementForm.purchase_price_mode === "unit" ? "active" : ""}
                      type="button"
                      onClick={() => setMovementForm({ ...movementForm, purchase_price_mode: "unit" })}
                    >
                      سعر القطعة
                    </button>
                    <button
                      className={movementForm.purchase_price_mode === "total" ? "active" : ""}
                      type="button"
                      onClick={() => setMovementForm({ ...movementForm, purchase_price_mode: "total" })}
                    >
                      سعر الكمية كاملة
                    </button>
                  </div>
                  <Input
                    label={movementForm.purchase_price_mode === "unit" ? "سعر شراء القطعة" : "سعر شراء الكمية كاملة"}
                    type="number"
                    value={movementForm.purchase_price}
                    onChange={(value) => setMovementForm({ ...movementForm, purchase_price: Math.max(0, Number(value)) })}
                  />
                </>
              )}
              <label className="full-field">
                <span>ملاحظة</span>
                <textarea value={movementForm.note} onChange={(event) => setMovementForm({ ...movementForm, note: event.target.value })} />
              </label>
            </div>
            <div className="movement-preview">
              <span>{movementForm.type === "entry" ? "بعد العملية / تكلفة القطعة" : "بعد العملية"}</span>
              <strong>
                {movementForm.type === "entry"
                  ? `${movementForm.product.quantity + movementForm.quantity} · ${money(entryUnitPurchasePrice(movementForm))}`
                  : Math.max(0, movementForm.product.quantity - movementForm.quantity)}
              </strong>
            </div>
            {error && <p className="error">{error}</p>}
            <div className="button-row">
              <button className="gold-button" type="submit" disabled={movementForm.quantity <= 0 || (!allowNegativeStock && movementForm.type === "destock" && movementForm.quantity > movementForm.product.quantity)}>
                <Save size={18} /> تأكيد العملية
              </button>
            </div>
          </form>
        </div>
      )}

      {historyProduct && (
        <div className="modal-backdrop">
          <section className="panel form-panel form-modal stock-history-modal">
            <div className="section-title">
              <h2><History size={18} /> حركات المخزون</h2>
              <span />
              <button className="ghost-button compact-button" type="button" onClick={() => setHistoryProduct(null)}><X size={16} /> {t.close}</button>
            </div>
            <div className="movement-product-card">
              <strong>{historyProduct.name}</strong>
              <span>{historyProduct.barcode}</span>
              <b>المتوفر الآن: {historyProduct.quantity}</b>
            </div>
            {historyLoading ? (
              <p className="helper-text">جاري تحميل الحركات...</p>
            ) : movements.length ? (
              <div className="data-table stock-history-table">
                <table>
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>العملية</th>
                      <th>الكمية</th>
                      <th>قبل</th>
                      <th>بعد</th>
                      <th>سعر الشراء</th>
                      <th>ملاحظة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((movement) => (
                      <tr key={movement.id}>
                        <td>{new Date(movement.created_at).toLocaleString("ar-DZ")}</td>
                        <td><span className={`status-pill ${movement.quantity >= 0 ? "ok" : "warning"}`}>{movementLabel(movement.movement_type)}</span></td>
                        <td>{movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}</td>
                        <td>{movement.before_quantity}</td>
                        <td>{movement.after_quantity}</td>
                        <td>{money(movement.unit_purchase_price)}</td>
                        <td>{movement.note || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-state">لا توجد حركات مخزون لهذا المنتج بعد.</p>
            )}
          </section>
        </div>
      )}

      {barcodeProduct && (
        <BarcodePrintModal product={barcodeProduct} onClose={() => setBarcodeProduct(null)} />
      )}
    </>
  );
}

function BarcodePrintModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [count, setCount] = useState(1);
  const [barcodePrinter, setBarcodePrinter] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const labelCount = Math.max(1, Math.min(200, count || 1));

  useEffect(() => {
    api.appSettings()
      .then((settings) => setBarcodePrinter(settings.barcode_printer))
      .catch(() => setBarcodePrinter(""));
  }, []);

  async function printLabels() {
    setStatus("");
    setError("");
    try {
      await api.printBarcodeLabels({
        product_name: product.name,
        barcode: product.barcode,
        price: product.sale_price,
        count: labelCount
      });
      const message = `تم إرسال ${labelCount} ملصق إلى طابعة الباركود`;
      setStatus(message);
      showToast(message, "success");
    } catch (err) {
      console.log(err)
      const message = err instanceof Error ? err.message : "تعذرت طباعة الباركود";
      setError(message);
      showToast(message, "error");
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="panel barcode-modal">
        <div className="section-title">
          <h2><Barcode size={18} /> طباعة الباركود</h2>
          <span />
          <button className="ghost-button compact-button" type="button" onClick={onClose}><X size={16} /> إغلاق</button>
        </div>
        <div className="barcode-preview-card">
          <BarcodeLabel product={product} />
        </div>
        <div className="movement-product-card">
          <strong>{product.name}</strong>
          <span>{product.barcode}</span>
          <b>{money(product.sale_price)}</b>
        </div>
        <p className="helper-text">طابعة الباركود: {barcodePrinter || "الطابعة الافتراضية"}</p>
        <label>
          <span>عدد الملصقات</span>
          <div className="field">
            <input
              type="number"
              min={1}
              max={200}
              value={count}
              onChange={(event) => setCount(Math.max(1, Math.min(200, Number(event.target.value) || 1)))}
            />
          </div>
        </label>
        {status && <p className="helper-text">{status}</p>}
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button className="gold-button" type="button" onClick={() => void printLabels()}><Barcode size={18} /> طباعة {labelCount}</button>
          <button className="ghost-button" type="button" onClick={onClose}>إغلاق</button>
        </div>
      </section>
    </div>
  );
}

function BarcodeLabel({ product }: { product: Product }) {
  return (
    <article className="barcode-label">
      <strong>{product.name}</strong>
      <Code128Svg value={product.barcode} />
      <span>{product.barcode}</span>
      <small>{money(product.sale_price)}</small>
    </article>
  );
}

function Code128Svg({ value }: { value: string }) {
  const encoded = encodeCode128B(value || " ");
  const barHeight = 54;
  let x = 0;
  const bars: JSX.Element[] = [];
  encoded.forEach((pattern, index) => {
    for (let i = 0; i < pattern.length; i += 1) {
      const width = Number(pattern[i]);
      if (i % 2 === 0) {
        bars.push(<rect key={`${index}-${i}`} x={x} y={0} width={width} height={barHeight} />);
      }
      x += width;
    }
  });
  return (
    <svg className="barcode-svg" viewBox={`0 0 ${x} ${barHeight}`} role="img" aria-label={value} preserveAspectRatio="none">
      {bars}
    </svg>
  );
}

function encodeCode128B(value: string) {
  const sanitized = value
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code <= 126 ? char : " ";
    })
    .join("");
  const codes = [104, ...sanitized.split("").map((char) => char.charCodeAt(0) - 32)];
  const checksum = codes.reduce((sum, code, index) => sum + (index === 0 ? code : code * index), 0) % 103;
  return [...codes, checksum, 106].map((code) => CODE128_PATTERNS[code]);
}

const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
];

function movementLabel(type: StockMovement["movement_type"]) {
  if (type === "entry") return "إدخال";
  if (type === "destock") return "إخراج";
  if (type === "initial") return "مخزون أولي";
  return "تصحيح";
}

function entryUnitPurchasePrice(form: MovementForm) {
  if (form.type !== "entry") return 0;
  if (form.purchase_price_mode === "total") {
    return form.quantity > 0 ? form.purchase_price / form.quantity : 0;
  }
  return form.purchase_price;
}

function Input({ label, value, onChange, type = "text", icon, list }: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  icon?: ReactNode;
  list?: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <div className="field">
        {icon}
        <input type={type} list={list} value={type === "number" && value === 0 ? "" : value} onChange={(event) => onChange(event.target.value)} />
      </div>
    </label>
  );
}

function readImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
