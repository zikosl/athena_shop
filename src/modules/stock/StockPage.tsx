import { FormEvent, MouseEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Barcode, ClipboardList, Coins, Edit3, Plus, RefreshCcw, Save, Search, Trash2, X } from "lucide-react";
import { api } from "../../shared/api";
import { money } from "../../shared/format";
import { useText } from "../../shared/i18n";
import { Language, PrinterSettings, Product, ProductInput, ProductStockFilter } from "../../shared/types";

const emptyProduct: ProductInput = {
  name: "",
  barcode: "",
  category: "Products",
  size: "",
  color: "",
  quantity: 0,
  low_stock_threshold: 3,
  purchase_price: 0,
  sale_price: 0
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
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
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

  async function remove(id: number) {
    setError("");
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
    openEditProduct(contextMenu.product);
    setContextMenu(null);
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
        sale_price: product.sale_price
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
                  onClick={() => setBarcodeProduct(product)}
                  onContextMenu={(event) => openContextMenu(event, product)}
                >
                  <td><strong>{product.name}</strong><span>{product.category} · {product.size} · {product.color}</span></td>
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
                    <button onClick={(event) => { event.stopPropagation(); openEditProduct(product); }} onContextMenu={(event) => openContextMenu(event, product)}><Edit3 size={16} /></button>
                    <button onClick={(event) => { event.stopPropagation(); void remove(product.id); }}><Trash2 size={16} /></button>
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

      {barcodeProduct && (
        <BarcodePrintModal product={barcodeProduct} onClose={() => setBarcodeProduct(null)} />
      )}
    </>
  );
}

function BarcodePrintModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [count, setCount] = useState(1);
  const [printerSettings, setPrinterSettings] = useState<PrinterSettings | null>(null);
  const labels = Array.from({ length: Math.max(1, Math.min(200, count)) });

  useEffect(() => {
    api.printerSettings().then(setPrinterSettings).catch(() => setPrinterSettings(null));
  }, []);

  function printLabels() {
    window.setTimeout(() => window.print(), 50);
  }

  return (
    <div className="modal-backdrop">
      <section className="panel barcode-modal">
        <div className="section-title">
          <h2><Barcode size={18} /> Barcode</h2>
          <span />
          <button className="ghost-button compact-button" type="button" onClick={onClose}><X size={16} /> Fermer</button>
        </div>
        <div className="barcode-preview-card">
          <BarcodeLabel product={product} />
        </div>
        <p className="helper-text">
          Imprimante code-barres: {printerSettings?.barcode_printer || "imprimante par defaut"}
        </p>
        <label>
          <span>Nombre d'etiquettes</span>
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
        <div className="modal-actions">
          <button className="gold-button" type="button" onClick={printLabels}><Barcode size={18} /> Imprimer</button>
          <button className="ghost-button" type="button" onClick={onClose}>Fermer</button>
        </div>
        <div className="barcode-print-sheet" aria-hidden="true">
          {labels.map((_, index) => <BarcodeLabel key={index} product={product} />)}
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
