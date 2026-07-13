import { FormEvent, MouseEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Barcode, ClipboardList, Coins, Edit3, ImagePlus, Plus, RefreshCcw, Save, Search, Trash2, X } from "lucide-react";
import { api } from "../../shared/api";
import { money } from "../../shared/format";
import { useText } from "../../shared/i18n";
import { Language, Product, ProductInput, ProductStockFilter } from "../../shared/types";

const emptyProduct: ProductInput = {
  name: "",
  barcode: "",
  category: "Home Wear",
  size: "",
  color: "",
  quantity: 0,
  low_stock_threshold: 3,
  purchase_price: 0,
  sale_price: 0,
  image_data: ""
};

function createBarcode() {
  return `AS${Date.now().toString().slice(-10)}${Math.floor(Math.random() * 90 + 10)}`;
}

function newProduct(): ProductInput {
  return { ...emptyProduct, barcode: createBarcode() };
}

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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; product: Product } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => api.products({ query, category, stock: stockFilter }).then(setProducts).catch((err) => setError(String(err)));

  useEffect(() => {
    void load();
  }, [query, category, stockFilter]);

  useEffect(() => {
    setStockFilter(initialStockFilter);
  }, [initialStockFilter]);

  useEffect(() => {
    refreshCategories().catch((err) => setError(String(err)));
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.saveProduct(form);
      setForm(newProduct());
      setFormOpen(false);
      await load();
      await refreshCategories();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    setError("");
    if (!window.confirm(t.confirmDeleteProduct)) return;
    try {
      await api.deleteProduct(id);
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
    setForm(contextMenu.product);
    setFormOpen(true);
    setContextMenu(null);
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

  async function refreshCategories() {
    const items = await api.products();
    setCategories(Array.from(new Set(items.map((product) => product.category).filter(Boolean))).sort());
  }

  async function chooseImage(file: File | undefined) {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Veuillez choisir une image valide");
      return;
    }
    if (file.size > 1_500_000) {
      setError("Image trop grande. Maximum 1.5 MB");
      return;
    }
    const imageData = await readImage(file);
    setForm((current) => ({ ...current, image_data: imageData }));
  }

  async function saveInventory() {
    setError("");
    try {
      const changed = products.filter((product) => (inventoryCounts[product.id] ?? product.quantity) !== product.quantity);
      await Promise.all(changed.map((product) => api.saveProduct({
        id: product.id,
        name: product.name,
        barcode: product.barcode,
        category: product.category,
        size: product.size,
        color: product.color,
        quantity: inventoryCounts[product.id] ?? product.quantity,
        low_stock_threshold: product.low_stock_threshold,
        purchase_price: product.purchase_price,
        sale_price: product.sale_price,
        image_data: product.image_data
      })));
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
                        onChange={(event) => setInventoryCounts({ ...inventoryCounts, [product.id]: Math.max(0, Number(event.target.value)) })}
                      />
                    </td>
                  )}
                  {inventoryMode && <td>{(inventoryCounts[product.id] ?? product.quantity) - product.quantity}</td>}
                  <td>{money(product.purchase_price)}</td>
                  <td>{money(product.sale_price)}</td>
                  <td>{money(product.purchase_price * product.quantity)}</td>
                  <td>{money(product.sale_price * product.quantity)}</td>
                  <td className="row-actions">
                    <button onClick={() => openEditProduct(product)} onContextMenu={(event) => openContextMenu(event, product)}><Edit3 size={16} /></button>
                    <button onClick={() => remove(product.id)}><Trash2 size={16} /></button>
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
              <Input label={t.quantity} type="number" value={form.quantity} onChange={(quantity) => setForm({ ...form, quantity: Math.max(0, Number(quantity)) })} />
              <Input label={t.alert} type="number" value={form.low_stock_threshold} onChange={(value) => setForm({ ...form, low_stock_threshold: Math.max(0, Number(value)) })} />
              <Input label={t.buyPrice} type="number" value={form.purchase_price} onChange={(value) => setForm({ ...form, purchase_price: Math.max(0, Number(value)) })} />
              <Input label={t.salePrice} type="number" value={form.sale_price} onChange={(value) => setForm({ ...form, sale_price: Math.max(0, Number(value)) })} />
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
                  <ImagePlus size={16} /> Image produit
                  <input type="file" accept="image/*" onChange={(event) => void chooseImage(event.target.files?.[0])} />
                </label>
                {form.image_data && (
                  <button className="ghost-button compact-button" type="button" onClick={() => setForm({ ...form, image_data: "" })}>
                    <X size={16} /> Retirer image
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
              <button className="gold-button" type="submit" disabled={saving}><Save size={18} /> {saving ? t.saving : t.save}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
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
