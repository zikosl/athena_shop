import { FormEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Barcode, Check, ChevronLeft, ChevronRight, ClipboardList, Coins, Edit3, FileUp, History, ImagePlus, PackageMinus, PackagePlus, Plus, RefreshCcw, Save, Search, Tag, Trash2, Upload, X } from "lucide-react";
import { createPortal } from "react-dom";
import { api } from "../../shared/api";
import { money, productStockValues } from "../../shared/format";
import { useText } from "../../shared/i18n";
import { localized } from "../../shared/i18n";
import { showErrorToast, showToast } from "../../shared/toast";
import { Language, Product, ProductInput, ProductStockFilter, StockMovement } from "../../shared/types";
import { Button, SectionHeader, SelectControl, SelectField, TextAreaField, TextField } from "../../shared/ui";

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
  image_data: "",
  custom_type: "standard",
  custom_config: {}
};
const maxProductImageSize = 5 * 1024 * 1024;

function createBarcode() {
  const body = `2${Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0")}`;
  return `${body}${ean8CheckDigit(body)}`;
}

function ean8CheckDigit(body: string) {
  const sum = body.split("").reduce((total, digit, index) => (
    total + Number(digit) * (index % 2 === 0 ? 3 : 1)
  ), 0);
  return (10 - (sum % 10)) % 10;
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

type BatchCandidate = {
  id: number;
  name: string;
  barcode: string;
  blockedReason?: "missing" | "existing" | "duplicate" | "invalid";
};

type BatchEntry = BatchCandidate & {
  salePrice: number;
  quantity: number;
  alertQuantity: number;
  category: string;
};

type BatchStep = "select" | "details";

function parseCsvRows(source: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (quoted) throw new Error("unclosed quote");
  return rows;
}

function normalizeCsvHeader(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, "");
}

function isSupportedBarcode(value: string) {
  if (!/^\d{8}$/.test(value) && !/^\d{13}$/.test(value)) return false;
  const body = value.slice(0, -1);
  const sum = [...body].reduce((total, digit, index) => {
    const weight = value.length === 8 ? (index % 2 === 0 ? 3 : 1) : (index % 2 === 0 ? 1 : 3);
    return total + Number(digit) * weight;
  }, 0);
  return Number(value[value.length - 1]) === (10 - sum % 10) % 10;
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
  const tr = (arabic: string, french: string) => localized(language, arabic, french);
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
  const [regeneratingBarcodes, setRegeneratingBarcodes] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [editingCategory, setEditingCategory] = useState("");
  const [flexyProduct, setFlexyProduct] = useState<Product | null>(null);
  const [flexyTiers, setFlexyTiers] = useState<Array<{ up_to: number | null; surcharge: number }>>([]);
  const [flexyQuickAmounts, setFlexyQuickAmounts] = useState<number[]>([]);
  const [flexySaving, setFlexySaving] = useState(false);
  const [batchStep, setBatchStep] = useState<BatchStep | null>(null);
  const [batchFileName, setBatchFileName] = useState("");
  const [batchCandidates, setBatchCandidates] = useState<BatchCandidate[]>([]);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<number>>(new Set());
  const [batchQuery, setBatchQuery] = useState("");
  const [batchPage, setBatchPage] = useState(0);
  const [batchEntries, setBatchEntries] = useState<BatchEntry[]>([]);
  const [batchDetailPage, setBatchDetailPage] = useState(0);
  const [batchSaving, setBatchSaving] = useState(false);
  const load = () => api.products({ query, category, stock: stockFilter }).then(setProducts);

  const batchFilteredCandidates = useMemo(() => {
    const search = batchQuery.trim().toLocaleLowerCase();
    return batchCandidates.filter((item) => !search || item.name.toLocaleLowerCase().includes(search) || item.barcode.includes(search));
  }, [batchCandidates, batchQuery]);
  const batchPageSize = 25;
  const batchPageCount = Math.max(1, Math.ceil(batchFilteredCandidates.length / batchPageSize));
  const visibleBatchCandidates = batchFilteredCandidates.slice(batchPage * batchPageSize, (batchPage + 1) * batchPageSize);
  const batchDetailPageSize = 15;
  const batchDetailPageCount = Math.max(1, Math.ceil(batchEntries.length / batchDetailPageSize));
  const visibleBatchEntries = batchEntries.slice(batchDetailPage * batchDetailPageSize, (batchDetailPage + 1) * batchDetailPageSize);

  async function importBatchFile(file?: File) {
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith(".csv")) {
      showToast(tr("اختر ملف CSV فقط", "Sélectionnez un fichier CSV uniquement"), "warning");
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      let source: string;
      try {
        source = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      } catch {
        source = new TextDecoder("windows-1252").decode(buffer);
      }
      const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
      const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
      const rows = parseCsvRows(source.replace(/^\uFEFF/, ""), delimiter);
      if (rows.length < 2) throw new Error("empty");
      const headers = rows[0].map(normalizeCsvHeader);
      const nameIndex = headers.findIndex((value) => ["name", "product", "productname", "designation", "productdesignation", "nom", "nomproduit", "nomduproduit", "الاسم", "اسم", "اسم المنتج", "المنتج", "التسمية"].map(normalizeCsvHeader).includes(value));
      const barcodeIndex = headers.findIndex((value) => ["barcode", "barcodes", "codebarre", "codebarres", "ean", "ean13", "باركود", "الباركود", "رمز"].map(normalizeCsvHeader).includes(value));
      if (nameIndex < 0 || barcodeIndex < 0) throw new Error("headers");
      const productList = await api.products();
      const existingBarcodes = new Set(productList.map((product) => product.barcode.trim()));
      const parsed = rows.slice(1).map((cells, index) => ({
        id: index,
        name: (cells[nameIndex] ?? "").trim(),
        barcode: (cells[barcodeIndex] ?? "").trim()
      }));
      const counts = new Map<string, number>();
      for (const item of parsed) if (item.barcode) counts.set(item.barcode, (counts.get(item.barcode) ?? 0) + 1);
      const candidates = parsed.map((item): BatchCandidate => ({
        ...item,
        blockedReason: !item.name || !item.barcode ? "missing"
          : existingBarcodes.has(item.barcode) ? "existing"
            : (counts.get(item.barcode) ?? 0) > 1 ? "duplicate"
              : !isSupportedBarcode(item.barcode) ? "invalid"
                : undefined
      }));
      setBatchCandidates(candidates);
      setBatchSelectedIds(new Set());
      setBatchFileName(file.name);
      setBatchQuery("");
      setBatchPage(0);
      setBatchStep("select");
    } catch (error) {
      const message = error instanceof Error && error.message === "headers"
        ? tr("يجب أن يحتوي الملف على عمود للاسم وعمود للباركود", "Le fichier doit contenir une colonne de nom et une colonne de code-barres")
        : error instanceof Error && error.message === "empty"
          ? tr("الملف لا يحتوي على منتجات", "Le fichier ne contient aucun produit")
          : tr("تعذر قراءة ملف CSV. تحقق من تنسيق الملف والعناوين.", "Impossible de lire le CSV. Vérifiez son format et ses en-têtes.");
      showToast(message, "error");
    }
  }

  function startBatchImport() {
    setBatchFileName("");
    setBatchCandidates([]);
    setBatchSelectedIds(new Set());
    setBatchEntries([]);
    setBatchQuery("");
    setBatchPage(0);
    setBatchStep("select");
  }

  function closeBatchImport() {
    if (batchSaving) return;
    setBatchStep(null);
    setBatchCandidates([]);
    setBatchEntries([]);
  }

  function continueBatchToDetails() {
    const selected = batchCandidates.filter((item) => batchSelectedIds.has(item.id));
    if (!selected.length) {
      showToast(tr("حدد منتجًا واحدًا على الأقل", "Sélectionnez au moins un produit"), "warning");
      return;
    }
    setBatchEntries(selected.map((item) => ({ ...item, salePrice: 0, quantity: 0, alertQuantity: 0, category: "Products" })));
    setBatchDetailPage(0);
    setBatchStep("details");
  }

  function updateBatchEntry(id: number, key: "salePrice" | "quantity" | "alertQuantity" | "category", value: number | string) {
    setBatchEntries((entries) => entries.map((entry) => entry.id === id ? { ...entry, [key]: value } : entry));
  }

  async function submitBatchImport() {
    if (!batchEntries.length || batchSaving) return;
    setBatchSaving(true);
    let saved = false;
    try {
      await api.saveProductsBatch(batchEntries.map((entry) => ({
        name: entry.name,
        barcode: entry.barcode,
        category: entry.category || "Products",
        size: "",
        color: "",
        quantity: entry.quantity,
        low_stock_threshold: entry.alertQuantity,
        purchase_price: 0,
        sale_price: entry.salePrice,
        image_data: "",
        custom_type: "standard",
        custom_config: {}
      })));
      saved = true;
      showToast(tr(`تمت إضافة ${batchEntries.length} منتج إلى المخزون`, `${batchEntries.length} produits ajoutés au stock`), "success");
      setBatchStep(null);
      setBatchCandidates([]);
      setBatchEntries([]);
      onChanged();
    } catch (error) {
      showErrorToast(error, tr("تعذر إضافة المنتجات. لم يتم حفظ أي منتج.", "Impossible d’ajouter les produits. Aucun produit n’a été enregistré."));
    } finally {
      setBatchSaving(false);
    }
    if (saved) load().catch((error) => showErrorToast(error, tr("تمت الإضافة لكن تعذر تحديث قائمة المخزون", "Import terminé, mais impossible d’actualiser la liste du stock")));
  }

  useEffect(() => {
    load().catch((err) => showErrorToast(err, "تعذر تحميل المخزون"));
  }, [query, category, stockFilter]);

  useEffect(() => {
    setStockFilter(initialStockFilter);
  }, [initialStockFilter]);

  useEffect(() => {
    refreshCategories().catch((err) => showErrorToast(err, "تعذر تحميل أصناف المنتجات"));
    api.appSettings()
      .then((settings) => setAllowNegativeStock(settings.allow_negative_stock))
      .catch((err) => {
        setAllowNegativeStock(true);
        showErrorToast(err, "تعذر تحميل إعدادات المخزون");
      });
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

  const margin = useMemo(() => form.sale_price - form.purchase_price, [form.sale_price, form.purchase_price]);
  const stockTotals = useMemo(() => {
    const purchaseValue = products.reduce((sum, product) => sum + productStockValues(product).cost, 0);
    const revenueValue = products.reduce((sum, product) => sum + productStockValues(product).sale, 0);
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

  function updateTier(index: number, key: "up_to" | "surcharge", value: number | null) {
    const tiers = [...(form.custom_config?.surcharge_tiers ?? [])];
    tiers[index] = { ...tiers[index], [key]: value };
    setForm({ ...form, custom_config: { ...form.custom_config, surcharge_tiers: tiers } });
  }

  async function openFlexyManager() {
    try {
      const existing = (await api.products()).find((product) => product.custom_type === "flexy");
      const product = existing ?? await api.saveProduct({
        name: "Flexy",
        barcode: createBarcode(),
        category: "",
        size: "",
        color: "",
        quantity: 0,
        low_stock_threshold: 0,
        purchase_price: 0,
        sale_price: 0,
        image_data: "",
        custom_type: "flexy",
        custom_config: { surcharge_tiers: [{ up_to: 499, surcharge: 10 }, { up_to: null, surcharge: 20 }], quick_amounts: [40, 50, 100, 1500, 2000] }
      });
      setFlexyProduct(product);
      const tiers = product.custom_config?.surcharge_tiers?.length ? product.custom_config.surcharge_tiers : [{ up_to: 499, surcharge: 10 }, { up_to: null, surcharge: 20 }];
      setFlexyTiers(tiers.map((tier) => ({ up_to: tier.up_to, surcharge: tier.surcharge })));
      setFlexyQuickAmounts(product.custom_config?.quick_amounts ?? [40, 50, 100, 1500, 2000]);
      if (!existing) await load();
    } catch (err) {
      showErrorToast(err, tr("تعذر فتح إعدادات Flexy", "Impossible d’ouvrir les paramètres Flexy"));
    }
  }

  async function saveFlexyManager(event: FormEvent) {
    event.preventDefault();
    if (!flexyProduct || flexySaving) return;
    const tiers = [...flexyTiers].sort((a, b) => (a.up_to ?? Infinity) - (b.up_to ?? Infinity));
    const invalidTiers = tiers.some((tier, index) => {
      if (!Number.isInteger(tier.surcharge) || tier.surcharge < 0) return true;
      if (tier.up_to === null) return index !== tiers.length - 1;
      return !Number.isInteger(tier.up_to) || tier.up_to <= 0 || (index > 0 && tier.up_to <= (tiers[index - 1].up_to ?? 0));
    });
    if (!tiers.length || tiers[tiers.length - 1]?.up_to !== null || invalidTiers) {
      showToast(tr("أضف شرائح رسوم صحيحة مع شريحة أخيرة بدون حد", "Ajoutez des tranches de frais valides et terminez par une tranche sans limite"), "warning");
      return;
    }
    if (!flexyQuickAmounts.some((amount) => Number.isInteger(amount) && amount > 0)) {
      showToast(tr("أضف مبلغًا سريعًا واحدًا على الأقل", "Ajoutez au moins un montant rapide"), "warning");
      return;
    }
    if (flexyQuickAmounts.some((amount) => !Number.isInteger(amount) || amount <= 0) || new Set(flexyQuickAmounts).size !== flexyQuickAmounts.length) {
      showToast(tr("يجب أن تكون المبالغ السريعة أعدادًا صحيحة وموجبة وغير مكررة", "Les montants rapides doivent être des nombres entiers positifs et uniques"), "warning");
      return;
    }
    setFlexySaving(true);
    try {
      const saved = await api.saveProduct({ ...flexyProduct, custom_config: { ...flexyProduct.custom_config, surcharge_tiers: tiers, quick_amounts: flexyQuickAmounts } });
      setFlexyProduct(saved);
      setFlexyTiers(tiers);
      setFlexyProduct(null);
      await load();
      onChanged();
      showToast(tr("تم حفظ إعدادات Flexy", "Paramètres Flexy enregistrés"), "success");
    } catch (err) {
      showErrorToast(err, tr("تعذر حفظ إعدادات Flexy", "Impossible d’enregistrer les paramètres Flexy"));
    } finally {
      setFlexySaving(false);
    }
  }

  function changeFlexyTier(index: number, key: "up_to" | "surcharge", value: string) {
    setFlexyTiers((tiers) => tiers.map((tier, current) => current === index
      ? { ...tier, [key]: value === "" && key === "up_to" ? null : Number(value) }
      : tier));
  }

  function changeFlexyQuickAmount(amountIndex: number, value: string) {
    setFlexyQuickAmounts((amounts) => amounts.map((amount, current) => current === amountIndex ? (value === "" ? 0 : Number(value)) : amount));
  }

  async function refreshCategories() {
    setCategories(await api.categories());
  }

  async function saveCategory(event: FormEvent) {
    event.preventDefault();
    try {
      const saved = await api.saveCategory(categoryDraft, editingCategory || undefined);
      setCategory(saved);
      setCategoryDraft("");
      setEditingCategory("");
      await refreshCategories();
      await load();
      onChanged();
      showToast("تم حفظ الصنف", "success");
    } catch (err) {
      showErrorToast(err, "تعذر حفظ الصنف");
    }
  }

  async function removeCategory(name: string) {
    try {
      await api.deleteCategory(name);
      if (category === name) setCategory("");
      await refreshCategories();
      showToast("تم حذف الصنف", "success");
    } catch (err) {
      showErrorToast(err, "تعذر حذف الصنف");
    }
  }

  async function regenerateAllBarcodes() {
    if (regeneratingBarcodes) return;
    if (!window.confirm("سيتم استبدال باركود جميع المنتجات برموز EAN-8 جديدة. الملصقات القديمة لن تعمل بعد ذلك. هل تريد المتابعة؟")) return;
    setRegeneratingBarcodes(true);
    try {
      await api.regenerateAllBarcodes();
      await load();
      onChanged();
      showToast("تم إنشاء باركود EAN-8 جديد لكل المنتجات", "success");
    } catch (err) {
      showErrorToast(err, "تعذر تجديد الباركود");
    } finally {
      setRegeneratingBarcodes(false);
    }
  }

  function openNewProduct() {
    setForm({ ...newProduct(), category: categories.includes("Products") ? "Products" : categories[0] ?? "" });
    setFormOpen(true);
  }

  function openEditProduct(product: Product) {
    setForm(product.custom_type === "standard" ? product : { ...product, low_stock_threshold: 0, image_data: "" });
    setFormOpen(true);
  }

  function openMovement(product: Product, type: "entry" | "destock") {
    setMovementForm({
      product,
      type,
      quantity: 1,
      purchase_price: type === "entry" ? product.purchase_price * (product.custom_type === "tobacco" ? product.custom_config?.pieces_per_box ?? 1 : 1) : 0,
      purchase_price_mode: "unit",
      note: type === "entry" ? "شراء مخزون" : "إخراج من المخزون"
    });
  }

  async function openHistory(product: Product) {
    setHistoryProduct(product);
    setHistoryLoading(true);
    try {
      setMovements(await api.stockMovements(product.id));
    } catch (err) {
      showErrorToast(err, "تعذر تحميل حركات المخزون");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const initialQuantity = form.id ? 0 : (form.custom_type === "standard" || form.custom_type === "flexy") ? form.quantity : 0;
    if (!form.id && (!Number.isInteger(initialQuantity) || initialQuantity < 0)) {
      showToast("أدخل كمية أولية صحيحة", "warning");
      return;
    }
    try {
      const productInput = form.custom_type === "standard" ? form : { ...form, image_data: "" };
      const product = await api.saveProduct(form.id ? productInput : { ...productInput, quantity: 0, purchase_price: 0 });
      setForm(newProduct());
      setFormOpen(false);
      await load();
      await refreshCategories();
      onChanged();
      if (!form.id && initialQuantity > 0) {
        setMovementForm({
          product,
          type: "entry",
          quantity: initialQuantity,
          purchase_price: 0,
          purchase_price_mode: "unit",
          note: "مخزون أولي"
        });
        showToast("أكمل إدخال المخزون الأولي بتسجيل تكلفة الشراء", "info");
      } else {
        showToast(form.id ? "تم تحديث المنتج" : "تم إنشاء المنتج", "success");
      }
    } catch (err) {
      showErrorToast(err, "تعذر حفظ المنتج");
    }
  }

  async function remove(product: Product) {
    if (!window.confirm(`هل تريد حذف المنتج "${product.name}"؟ لا يمكن التراجع عن هذه العملية.`)) return;
    try {
      await api.deleteProduct(product.id);
      await load();
      await refreshCategories();
      onChanged();
      showToast("تم حذف المنتج", "success");
    } catch (err) {
      showErrorToast(err, "تعذر حذف المنتج");
    }
  }

  function toggleInventory() {
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
    try {
      const unitMultiplier = movementForm.product.custom_type === "tobacco" ? movementForm.product.custom_config?.pieces_per_box ?? 1 : 1;
      const stockQuantity = movementForm.quantity * unitMultiplier;
      const unitPurchasePrice = entryUnitPurchasePrice(movementForm);
      await api.adjustProductStock({
        product_id: movementForm.product.id,
        movement_type: movementForm.type,
        quantity: stockQuantity,
        purchase_price: movementForm.type === "entry" ? unitPurchasePrice : 0,
        note: movementForm.note
      });
      setMovementForm(null);
      await load();
      onChanged();
      showToast(
        movementForm.type === "entry" ? "تم إدخال الكمية إلى المخزون" : "تم إخراج الكمية من المخزون",
        "success"
      );
    } catch (err) {
      showErrorToast(err, "تعذر تنفيذ حركة المخزون");
    }
  }

  async function chooseImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("يرجى اختيار صورة صالحة", "warning");
      return;
    }
    if (file.size > maxProductImageSize) {
      showToast("الصورة كبيرة جدًا. الحد الأقصى 5 MB", "warning");
      return;
    }
    const imageData = await readImage(file);
    setForm((current) => ({ ...current, image_data: imageData }));
  }

  async function saveInventory() {
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
      showToast("تم حفظ الجرد وتحديث المخزون", "success");
    } catch (err) {
      showErrorToast(err, "تعذر حفظ الجرد");
    }
  }

  if (batchStep) {
    const selectableCount = batchCandidates.filter((item) => !item.blockedReason).length;
    const blockedCount = batchCandidates.length - selectableCount;
    const selectableVisibleCount = visibleBatchCandidates.filter((item) => !item.blockedReason).length;
    const selectedVisibleCount = visibleBatchCandidates.filter((item) => !item.blockedReason && batchSelectedIds.has(item.id)).length;
    const toggleVisible = () => setBatchSelectedIds((current) => {
      const next = new Set(current);
      if (selectedVisibleCount === visibleBatchCandidates.filter((item) => !item.blockedReason).length) {
        visibleBatchCandidates.forEach((item) => next.delete(item.id));
      } else {
        visibleBatchCandidates.forEach((item) => { if (!item.blockedReason) next.add(item.id); });
      }
      return next;
    });
    return (
      <section className="panel table-panel full batch-import-page">
        <SectionHeader title={<><FileUp size={19} /> {tr("إضافة منتجات من ملف CSV", "Importer des produits depuis un CSV")}</>}>
          <Button size="compact" type="button" disabled={batchSaving} onClick={closeBatchImport}><X size={16} /> {t.close}</Button>
        </SectionHeader>
        <div className="batch-import-steps" aria-label={tr("خطوات الاستيراد", "Étapes d’importation")}>
          <span className={batchStep === "select" ? "active" : "complete"}>{tr("1. اختيار المنتجات", "1. Sélection des produits")}</span>
          <span className={batchStep === "details" ? "active" : ""}>{tr("2. مراجعة التفاصيل", "2. Révision des détails")}</span>
        </div>
        {batchStep === "select" ? (
          <>
            <div className="batch-import-upload">
              <div><strong>{tr("حمّل ملف المنتجات", "Importer un fichier de produits")}</strong><p>{tr("يجب أن يحتوي الملف على عمود للاسم وعمود للباركود. الملفات المفصولة بفاصلة أو فاصلة منقوطة مدعومة.", "Le fichier doit contenir une colonne de nom et une colonne de code-barres. Les séparateurs virgule et point-virgule sont pris en charge.")}</p></div>
              <label className="ghost-button batch-file-button"><Upload size={17} /> {batchFileName ? tr("اختيار ملف آخر", "Choisir un autre fichier") : tr("اختيار ملف CSV", "Choisir un fichier CSV")}<input type="file" accept=".csv,text/csv" onChange={(event) => { void importBatchFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
              {batchFileName && <span className="batch-file-name">{batchFileName}</span>}
            </div>
            {batchCandidates.length > 0 && <>
              <div className="batch-import-summary">
                <span>{tr("الأسطر", "Lignes")} <b>{batchCandidates.length}</b></span>
                <span>{tr("متاحة للاختيار", "Disponibles")} <b>{selectableCount}</b></span>
                <span>{tr("مستبعدة", "Exclues")} <b>{blockedCount}</b></span>
                <span>{tr("محددة", "Sélectionnées")} <b>{batchSelectedIds.size}</b></span>
              </div>
              <div className="filter-row batch-import-filter-row">
                <div className="searchbar"><Search size={18} /><input value={batchQuery} placeholder={tr("ابحث بالاسم أو الباركود", "Rechercher par nom ou code-barres")} onChange={(event) => { setBatchQuery(event.target.value); setBatchPage(0); }} /></div>
                <button className="ghost-button compact-button" type="button" disabled={!selectableCount} onClick={() => setBatchSelectedIds(batchSelectedIds.size ? new Set() : new Set(batchCandidates.filter((item) => !item.blockedReason).map((item) => item.id)))}><Check size={15} /> {batchSelectedIds.size ? tr("إلغاء التحديد", "Tout désélectionner") : tr("تحديد كل المتاح", "Tout sélectionner")} · {batchSelectedIds.size ? batchSelectedIds.size : selectableCount}</button>
                <button className="ghost-button compact-button" type="button" onClick={toggleVisible} disabled={!visibleBatchCandidates.some((item) => !item.blockedReason)}>
                  <Check size={15} /> {tr("تحديد الظاهر", "Sélectionner la page")}
                </button>
              </div>
              <div className="data-table batch-candidate-table">
                <table>
                  <thead><tr><th><input type="checkbox" aria-label={tr("تحديد المنتجات الظاهرة", "Sélectionner les produits affichés")} checked={selectableVisibleCount > 0 && selectedVisibleCount === selectableVisibleCount} onChange={toggleVisible} /></th><th>{t.product}</th><th>{t.barcode}</th><th>{tr("الحالة", "État")}</th></tr></thead>
                  <tbody>{visibleBatchCandidates.map((item) => <tr key={item.id} className={item.blockedReason ? "batch-row-blocked" : ""}>
                    <td><input type="checkbox" checked={batchSelectedIds.has(item.id)} disabled={Boolean(item.blockedReason)} onChange={(event) => setBatchSelectedIds((current) => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} /></td>
                    <td>{item.name || <span className="muted">{tr("اسم مفقود", "Nom manquant")}</span>}</td><td dir="ltr">{item.barcode || "-"}</td>
                    <td>{item.blockedReason ? <span className="status-pill danger">{item.blockedReason === "existing" ? tr("الباركود موجود", "Code-barres déjà utilisé") : item.blockedReason === "duplicate" ? tr("مكرر في الملف", "Doublon dans le fichier") : item.blockedReason === "invalid" ? tr("باركود غير صالح", "Code-barres invalide") : tr("الاسم أو الباركود مفقود", "Nom ou code-barres manquant")}</span> : <span className="status-pill ok">{tr("متاح", "Disponible")}</span>}</td>
                  </tr>)}</tbody>
                </table>
                {!batchFilteredCandidates.length && <p className="empty-state">{tr("لا توجد نتائج مطابقة", "Aucun résultat correspondant")}</p>}
              </div>
              <div className="batch-pagination"><span>{tr("صفحة", "Page")} {batchPage + 1} / {batchPageCount}</span><div><button className="ghost-button compact-button" type="button" disabled={batchPage === 0} onClick={() => setBatchPage((page) => Math.max(0, page - 1))} aria-label={tr("الصفحة السابقة", "Page précédente")}>{language === "fr" ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</button><button className="ghost-button compact-button" type="button" disabled={batchPage + 1 >= batchPageCount} onClick={() => setBatchPage((page) => Math.min(batchPageCount - 1, page + 1))} aria-label={tr("الصفحة التالية", "Page suivante")}>{language === "fr" ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button></div></div>
            </>}
            <div className="button-row batch-import-actions"><Button type="button" onClick={closeBatchImport}>{t.close}</Button><Button variant="primary" type="button" disabled={!batchSelectedIds.size} onClick={continueBatchToDetails}><ArrowRight size={16} /> {tr("متابعة المنتجات المحددة", "Continuer avec la sélection")} · {batchSelectedIds.size}</Button></div>
          </>
        ) : (
          <>
            <p className="batch-details-intro">{tr("راجع بيانات المنتجات المحددة. الأسعار والكميات والتنبيه اختيارية؛ القيم الافتراضية هي صفر.", "Vérifiez les produits sélectionnés. Prix, quantité et seuil d’alerte sont facultatifs et valent zéro par défaut.")}</p>
            <div className="data-table batch-details-table">
              <table>
                <thead><tr><th>{t.product}</th><th>{t.barcode}</th><th>{t.salePrice}</th><th>{tr("الكمية الأولية", "Stock initial")}</th><th>{t.alert}</th><th>{t.category}</th></tr></thead>
                <tbody>{visibleBatchEntries.map((entry) => <tr key={entry.id}>
                  <td>{entry.name}</td><td dir="ltr">{entry.barcode}</td>
                  <td><TextField label={t.salePrice} type="number" min="0" step="1" value={entry.salePrice} onValueChange={(value) => updateBatchEntry(entry.id, "salePrice", Math.max(0, Number(value)))} /></td>
                  <td><TextField label={tr("الكمية الأولية", "Stock initial")} type="number" min="0" step="1" value={entry.quantity} onValueChange={(value) => updateBatchEntry(entry.id, "quantity", Math.max(0, Number(value)))} /></td>
                  <td><TextField label={t.alert} type="number" min="0" step="1" value={entry.alertQuantity} onValueChange={(value) => updateBatchEntry(entry.id, "alertQuantity", Math.max(0, Number(value)))} /></td>
                  <td><SelectControl aria-label={`${t.category}: ${entry.name}`} value={entry.category} onValueChange={(value) => updateBatchEntry(entry.id, "category", value)} options={[{ value: "Products", label: tr("الافتراضي (Products)", "Par défaut (Products)") }, ...categories.filter((name) => name !== "Products").map((name) => ({ value: name, label: name }))]} /></td>
                </tr>)}</tbody>
              </table>
            </div>
            <div className="batch-pagination"><span>{tr("صفحة", "Page")} {batchDetailPage + 1} / {batchDetailPageCount} · {batchEntries.length} {tr("منتج", "produits")}</span><div><button className="ghost-button compact-button" type="button" disabled={batchDetailPage === 0} onClick={() => setBatchDetailPage((page) => Math.max(0, page - 1))} aria-label={tr("الصفحة السابقة", "Page précédente")}>{language === "fr" ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</button><button className="ghost-button compact-button" type="button" disabled={batchDetailPage + 1 >= batchDetailPageCount} onClick={() => setBatchDetailPage((page) => Math.min(batchDetailPageCount - 1, page + 1))} aria-label={tr("الصفحة التالية", "Page suivante")}>{language === "fr" ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button></div></div>
            <div className="button-row batch-import-actions"><Button type="button" disabled={batchSaving} onClick={() => setBatchStep("select")}>{language === "fr" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />} {tr("العودة للاختيار", "Retour à la sélection")}</Button><Button variant="primary" type="button" disabled={batchSaving} onClick={() => void submitBatchImport()}><Check size={16} /> {batchSaving ? tr("جار إضافة المنتجات...", "Ajout des produits...") : tr("تأكيد وإضافة", "Confirmer et ajouter")} · {batchEntries.length}</Button></div>
          </>
        )}
      </section>
    );
  }

  return (
    <>
      <section className="panel table-panel full">
        <SectionHeader title={<><ClipboardList size={18} /> {t.stock}</>}>
          <Button size="compact" type="button" onClick={startBatchImport}>
            <FileUp size={16} /> {tr("استيراد CSV", "Importer CSV")}
          </Button>
          <Button variant="primary" size="compact" type="button" onClick={openNewProduct}>
            <Plus size={17} /> {t.newProduct}
          </Button>
          <Button size="compact" type="button" onClick={() => void openFlexyManager()}>
            <Coins size={16} /> {tr("إدارة Flexy", "Gérer Flexy")}
          </Button>
          <Button size="compact" type="button" onClick={() => { setCategoryDraft(""); setEditingCategory(""); setCategoryManagerOpen(true); }}>
            <Tag size={16} /> {tr("إدارة الأصناف", "Gérer les catégories")}
          </Button>
          <Button size="compact" type="button" disabled={regeneratingBarcodes} onClick={() => void regenerateAllBarcodes()} title={tr("إعادة إنشاء باركود EAN-8 لكل المخزون", "Régénérer les codes-barres EAN-8 de tout le stock")}>
            <Barcode size={16} /> {regeneratingBarcodes ? tr("جاري التوليد...", "Génération en cours...") : tr("تجديد الباركود", "Régénérer les codes-barres")}
          </Button>
          <Button variant={inventoryMode ? "primary" : "secondary"} size="compact" onClick={toggleInventory}>
            <ClipboardList size={17} /> {t.inventory}
          </Button>
        </SectionHeader>
        <div className="summary-strip stock-summary">
          <article><span>{t.stockPurchaseValue}</span><strong>{money(stockTotals.purchaseValue)}</strong></article>
          <article><span>{t.stockRevenueValue}</span><strong>{money(stockTotals.revenueValue)}</strong></article>
          <article><span>{t.stockMarginValue}</span><strong>{money(stockTotals.marginValue)}</strong></article>
          <article><span>{t.quantity}</span><strong><Coins size={16} /> {stockTotals.quantity}</strong></article>
        </div>
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
          <SelectControl aria-label={t.category} value={category} onValueChange={setCategory} options={[{ value: "", label: t.allCategories }, ...categories.map((item) => ({ value: item, label: item }))]} />
          <SelectControl aria-label={t.stockFilter} value={stockFilter} onValueChange={(value) => setStockFilter(value as ProductStockFilter)} options={[{ value: "all", label: t.stockAll }, { value: "available", label: t.inStock }, { value: "low", label: t.lowOnly }, { value: "out", label: t.outOfStock }]} />
        </div>
        <div className="data-table stock-table">
          <table>
            <thead>
              <tr>
                <th>{t.product}</th>
                <th>{t.barcode}</th>
                <th>{t.quantity}</th>
                {inventoryMode && <th>{t.countedQuantity}</th>}
                {inventoryMode && <th>{t.gap}</th>}
                <th>{products.some((product) => product.custom_type !== "standard") ? "تكلفة الوحدة الأساسية" : t.buyPrice}</th>
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
                  className={product.custom_type === "standard" && product.quantity <= product.low_stock_threshold ? "low-row" : ""}
                    onContextMenu={(event) => { if (product.custom_type !== "flexy") openContextMenu(event, product); }}
                >
                  <td>
                    <div className="product-cell">
                      {product.image_data ? <img src={product.image_data} alt="" /> : <span className="product-thumb-placeholder"><ImagePlus size={16} /></span>}
                      <div><strong>{product.name}</strong><span>{product.custom_type === "flexy" ? "Flexy · الرصيد بالدج" : product.custom_type === "tobacco" ? `تبغ · ${product.custom_config?.pieces_per_box ?? 0} قطعة/علبة` : product.custom_type === "printing" ? "طباعة · مخزون خدمات" : product.category}</span></div>
                    </div>
                  </td>
                  <td><button className="stock-barcode-button" type="button" title="طباعة ملصقات الباركود" onClick={(event) => { event.stopPropagation(); setBarcodeProduct(product); }}><Barcode size={14} />{product.barcode}</button></td>
                  <td>{product.custom_type === "printing" ? "غير محدود" : product.quantity}</td>
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
                  <td>{product.custom_type === "printing" ? "لا توجد تكلفة" : money(product.purchase_price)}</td>
                  <td>{product.custom_type === "flexy" ? "حسب الشريحة" : product.custom_type === "tobacco" ? `${money(product.custom_config?.piece_sale_price ?? 0)} / ${money(product.custom_config?.box_sale_price ?? 0)}` : product.custom_type === "printing" ? `${money(product.custom_config?.recto_price ?? 0)} / ${money(product.custom_config?.recto_verso_price ?? 0)}` : money(product.sale_price)}</td>
                  <td>{money(productStockValues(product).cost)}</td>
                  <td>{money(productStockValues(product).sale)}</td>
                  <td className="row-actions"><div className="row-action-group">
                    {product.custom_type !== "printing" && <>
                      <button type="button" aria-label="إدخال مخزون" title="إدخال مخزون" onClick={() => openMovement(product, "entry")}><PackagePlus size={16} /></button>
                      <button type="button" aria-label="إخراج مخزون" title="إخراج مخزون" onClick={() => openMovement(product, "destock")}><PackageMinus size={16} /></button>
                      <button type="button" aria-label="حركات المخزون" title="حركات المخزون" onClick={() => void openHistory(product)}><History size={16} /></button>
                    </>}
                    {product.custom_type === "flexy"
                      ? <button type="button" aria-label="إدارة Flexy" title="إدارة Flexy" onClick={() => void openFlexyManager()}><Coins size={16} /></button>
                      : <button type="button" aria-label="تعديل المنتج" title="تعديل المنتج" onClick={() => openEditProduct(product)} onContextMenu={(event) => openContextMenu(event, product)}><Edit3 size={16} /></button>}
                    {product.custom_type !== "flexy" && <button type="button" className="danger-action" aria-label="حذف المنتج" title="حذف المنتج" onClick={() => void remove(product)}><Trash2 size={16} /></button>}
                  </div></td>
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

      {formOpen && createPortal(
        <div className="modal-backdrop stock-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false); }}>
          <form className="panel form-panel form-modal stock-modal-dialog" onSubmit={submit}>
            <div className="section-title">
              <h2><Plus size={18} /> {form.id ? t.edit : t.newProduct}</h2>
              <span />
              <button className="ghost-button compact-button" type="button" onClick={() => setFormOpen(false)}><X size={16} /> {t.close}</button>
            </div>
            <SelectField className="product-type-field" label="نوع المنتج" value={form.custom_type ?? "standard"} disabled={!!form.id} onValueChange={(value) => {
              const type = value as NonNullable<ProductInput["custom_type"]>;
              const custom_config = type === "flexy" ? { surcharge_tiers: [{ up_to: 499, surcharge: 10 }, { up_to: null, surcharge: 20 }], quick_amounts: [40, 50, 100, 1500, 2000] }
                : type === "tobacco" ? { pieces_per_box: 10, piece_sale_price: 0, box_sale_price: 0 }
                  : type === "printing" ? { recto_price: 0, recto_verso_price: 0 }
                    : {};
              setForm({
                ...form,
                custom_type: type,
                custom_config,
                quantity: !form.id && type !== "standard" ? 0 : form.quantity,
                low_stock_threshold: type === "standard" ? form.low_stock_threshold || 3 : 0,
                image_data: type === "standard" ? form.image_data : "",
                purchase_price: type === "printing" ? 0 : form.purchase_price
              });
            }} options={[{ value: "standard", label: "عادي" }, { value: "tobacco", label: "تبغ" }, { value: "printing", label: "طباعة" }]} />
            <div className="form-section-heading"><strong>البيانات الأساسية</strong></div>
            <div className="form-grid product-core-grid">
              <TextField label={t.product} value={form.name} onValueChange={(name) => setForm({ ...form, name })} />
              {form.custom_type === "standard" && <TextField label={t.salePrice} type="number" value={form.sale_price} onValueChange={(value) => setForm({ ...form, sale_price: Number(value) })} />}
              {!form.id && form.custom_type === "standard" && <TextField label="الكمية الأولية" type="number" value={form.quantity} onValueChange={(quantity) => setForm({ ...form, quantity: Number(quantity) })} />}
              {!form.id && form.custom_type === "flexy" && <TextField label="رصيد Flexy المتاح أوليًا (دج)" type="number" value={form.quantity} onValueChange={(quantity) => setForm({ ...form, quantity: Number(quantity) })} />}
              {form.custom_type === "standard" && <TextField label={t.alert} type="number" value={form.low_stock_threshold} onValueChange={(value) => setForm({ ...form, low_stock_threshold: Number(value) })} />}
            </div>
            <div className="form-section-heading"><strong>تفاصيل المنتج</strong></div>
            <div className="form-grid product-details-grid">
              {form.custom_type === "standard" && <SelectField label={t.category} required value={form.category} placeholder={categories.length ? "اختر الصنف" : "لا توجد أصناف؛ أضف صنفًا من إدارة الأصناف"} onValueChange={(category) => setForm({ ...form, category })} options={[...(form.category && !categories.includes(form.category) ? [{ value: form.category, label: form.category }] : []), ...categories.map((item) => ({ value: item, label: item }))]} />}
              {form.custom_type === "standard" && <TextField label={t.barcode} value={form.barcode} icon={<Barcode size={16} />} onValueChange={(barcode) => setForm({ ...form, barcode: barcode.replace(/\D/g, "").slice(0, 8) })} />}
            </div>
            <div className={`custom-settings-section ${form.custom_type === "standard" ? "is-standard" : ""} ${form.custom_type === "flexy" ? "is-flexy" : ""}`}>
              {form.custom_type === "flexy" && <div className="field form-wide flexy-tier-editor">
                <span>شرائح رسوم Flexy (حتى المبلغ / الرسوم)</span>
                <div className="flexy-tier-list">
                  {(form.custom_config?.surcharge_tiers ?? []).map((tier, index, tiers) => (
                    <div className="flexy-tier-row" key={index}>
                      <span className="tier-index">{index + 1}</span>
                      <TextField label="حتى (دج)" type="number" value={tier.up_to ?? ""} placeholder={tier.up_to === null ? "بدون حد" : ""} onValueChange={(value) => updateTier(index, "up_to", value === "" ? null : Number(value))} />
                      <TextField label="الرسم (دج)" type="number" value={tier.surcharge} onValueChange={(value) => updateTier(index, "surcharge", Number(value))} />
                      <button type="button" className="plain-icon flexy-tier-delete" aria-label="حذف الشريحة" title="حذف الشريحة" onClick={() => setForm({ ...form, custom_config: { ...form.custom_config, surcharge_tiers: tiers.filter((_, i) => i !== index) } })}><Trash2 size={17} /></button>
                    </div>
                  ))}
                </div>
                <button type="button" className="ghost-button tier-add-button" onClick={() => setForm({ ...form, custom_config: { ...form.custom_config, surcharge_tiers: [...(form.custom_config?.surcharge_tiers ?? []), { up_to: null, surcharge: 0 }] } })}><Plus size={16} /> إضافة شريحة</button>
              </div>}
              {form.custom_type === "tobacco" && <><TextField label="عدد القطع في العلبة" type="number" value={form.custom_config?.pieces_per_box ?? 10} onValueChange={(value) => setForm({ ...form, custom_config: { ...form.custom_config, pieces_per_box: Number(value) } })} /><TextField label="سعر بيع القطعة" type="number" value={form.custom_config?.piece_sale_price ?? 0} onValueChange={(value) => setForm({ ...form, custom_config: { ...form.custom_config, piece_sale_price: Number(value) } })} /><TextField label="سعر بيع العلبة" type="number" value={form.custom_config?.box_sale_price ?? 0} onValueChange={(value) => setForm({ ...form, custom_config: { ...form.custom_config, box_sale_price: Number(value) } })} /></>}
              {form.custom_type === "printing" && <><TextField label="سعر Recto" type="number" value={form.custom_config?.recto_price ?? 0} onValueChange={(value) => setForm({ ...form, custom_config: { ...form.custom_config, recto_price: Number(value) } })} /><TextField label="سعر Recto-verso" type="number" value={form.custom_config?.recto_verso_price ?? 0} onValueChange={(value) => setForm({ ...form, custom_config: { ...form.custom_config, recto_verso_price: Number(value) } })} /></>}
            </div>
            {form.custom_type === "standard" && <div className="image-uploader">
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
            </div>}
            {form.custom_type === "standard" && <div className="profit-preview">{t.estimatedMargin} <strong>{money(margin)}</strong></div>}
            <div className="button-row">
              {!form.id && form.custom_type === "standard" && (
                <button className="ghost-button" type="button" onClick={() => setForm({ ...form, barcode: createBarcode() })}>
                  <RefreshCcw size={17} /> {t.generateBarcode}
                </button>
              )}
              <button className="gold-button" type="submit"><Save size={18} /> {t.save}</button>
            </div>
          </form>
        </div>
      , document.body)}

      {categoryManagerOpen && createPortal(
        <div className="modal-backdrop stock-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCategoryManagerOpen(false); }}>
          <section className="panel form-panel form-modal stock-modal-dialog category-manager-modal" role="dialog" aria-modal="true" aria-labelledby="category-manager-title">
            <div className="section-title"><h2 id="category-manager-title"><Tag size={18} /> إدارة الأصناف</h2><span /><button className="ghost-button compact-button" type="button" onClick={() => setCategoryManagerOpen(false)}><X size={16} /> {t.close}</button></div>
            <form className="category-create-row" onSubmit={saveCategory}>
              <TextField label={editingCategory ? "تعديل اسم الصنف" : "اسم الصنف الجديد"} value={categoryDraft} onValueChange={setCategoryDraft} />
              <div className="button-row"><button className="gold-button compact-button" type="submit" disabled={!categoryDraft.trim()}><Save size={16} /> {editingCategory ? t.update : "إضافة"}</button>{editingCategory && <button className="ghost-button compact-button" type="button" onClick={() => { setEditingCategory(""); setCategoryDraft(""); }}>إلغاء</button>}</div>
            </form>
            <div className="category-manager-list">
              {categories.map((name) => <div className="category-manager-item" key={name}><strong>{name}</strong><div><button className="plain-icon" type="button" title="تعديل الصنف" aria-label="تعديل الصنف" onClick={() => { setEditingCategory(name); setCategoryDraft(name); }}><Edit3 size={16} /></button><button className="plain-icon danger-action" type="button" title="حذف الصنف" aria-label="حذف الصنف" onClick={() => void removeCategory(name)}><Trash2 size={16} /></button></div></div>)}
              {!categories.length && <p className="muted">لا توجد أصناف بعد.</p>}
            </div>
          </section>
        </div>, document.body
      )}

      {movementForm && createPortal(
        <div className="modal-backdrop stock-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMovementForm(null); }}>
          <form className="panel form-panel compact-form-modal stock-movement-modal stock-modal-dialog" onSubmit={submitMovement}>
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
              <TextField
                label={movementForm.product.custom_type === "tobacco" ? `عدد العلب (${movementForm.product.custom_config?.pieces_per_box ?? 1} قطعة/علبة)` : movementForm.product.custom_type === "flexy" ? "مبلغ الرصيد (دج)" : movementForm.product.custom_type === "printing" ? "عدد خدمات الطباعة" : "الكمية"}
                type="number"
                value={movementForm.quantity}
                onValueChange={(value) => setMovementForm({ ...movementForm, quantity: Math.max(0, Number(value)) })}
              />
              {movementForm.type === "entry" && movementForm.product.custom_type !== "printing" && (
                <>
                  <div className="segmented wide price-mode-tabs full-field">
                    <button
                      className={movementForm.purchase_price_mode === "unit" ? "active" : ""}
                      type="button"
                      onClick={() => setMovementForm({ ...movementForm, purchase_price_mode: "unit" })}
                    >
                      {movementForm.product.custom_type === "tobacco" ? "سعر العلبة" : movementForm.product.custom_type === "flexy" ? "تكلفة 1 دج رصيد" : "تكلفة الوحدة"}
                    </button>
                    <button
                      className={movementForm.purchase_price_mode === "total" ? "active" : ""}
                      type="button"
                      onClick={() => setMovementForm({ ...movementForm, purchase_price_mode: "total" })}
                    >
                      سعر الكمية كاملة
                    </button>
                  </div>
                  <TextField
                    label={movementForm.purchase_price_mode === "unit" ? movementForm.product.custom_type === "tobacco" ? "تكلفة شراء العلبة" : movementForm.product.custom_type === "flexy" ? "تكلفة الرصيد" : "تكلفة شراء الوحدة" : "تكلفة الكمية كاملة"}
                    type="number"
                    value={movementForm.purchase_price}
                    onValueChange={(value) => setMovementForm({ ...movementForm, purchase_price: Math.max(0, Number(value)) })}
                  />
                </>
              )}
              <TextAreaField className="full-field" label="ملاحظة" value={movementForm.note} onValueChange={(note) => setMovementForm({ ...movementForm, note })} />
            </div>
            <div className="movement-preview">
              <span>{movementForm.type === "entry" && movementForm.product.custom_type !== "printing" ? `بعد العملية / تكلفة ${movementForm.product.custom_type === "tobacco" ? "القطعة" : movementForm.product.custom_type === "flexy" ? "الدج" : "الوحدة"}` : "بعد العملية"}</span>
              <strong>
                {movementForm.type === "entry"
                  ? `${movementForm.product.quantity + movementForm.quantity * (movementForm.product.custom_type === "tobacco" ? movementForm.product.custom_config?.pieces_per_box ?? 1 : 1)}${movementForm.product.custom_type === "printing" ? "" : ` · ${money(entryUnitPurchasePrice(movementForm))}`}`
                  : Math.max(0, movementForm.product.quantity - movementForm.quantity * (movementForm.product.custom_type === "tobacco" ? movementForm.product.custom_config?.pieces_per_box ?? 1 : 1))}
              </strong>
            </div>
            <div className="button-row">
              <button className="gold-button" type="submit" disabled={movementForm.quantity <= 0 || (!allowNegativeStock && movementForm.type === "destock" && movementForm.quantity > movementForm.product.quantity)}>
                <Save size={18} /> تأكيد العملية
              </button>
            </div>
          </form>
        </div>
      , document.body)}

      {flexyProduct && createPortal(
        <div className="modal-backdrop stock-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setFlexyProduct(null); }}>
          <form className="panel form-panel form-modal stock-modal-dialog flexy-manager-modal" role="dialog" aria-modal="true" aria-labelledby="flexy-manager-title" onSubmit={saveFlexyManager}>
            <div className="section-title"><h2 id="flexy-manager-title"><Coins size={18} /> {tr("إدارة Flexy", "Gestion de Flexy")}</h2><span /><button className="ghost-button compact-button" type="button" onClick={() => setFlexyProduct(null)}><X size={16} /> {t.close}</button></div>
            <div className="flexy-manager-balance"><span>{tr("الرصيد المتاح", "Solde disponible")}</span><strong>{money(flexyProduct.quantity)}</strong></div>
            <section className="flexy-manager-section">
              <div className="flexy-manager-heading"><div><strong>{tr("شرائح الرسوم", "Tranches de frais")}</strong><small>{tr("تحدد الرسوم حسب مبلغ التعبئة", "Les frais sont déterminés selon le montant de recharge")}</small></div><button className="ghost-button compact-button" type="button" onClick={() => setFlexyTiers((tiers) => { const last = tiers[tiers.length - 1]; return last ? [...tiers.slice(0, -1), { ...last, up_to: last.up_to ?? 0 }, { up_to: null, surcharge: last.surcharge }] : [{ up_to: null, surcharge: 0 }]; })}><Plus size={15} /> {tr("شريحة", "Tranche")}</button></div>
              <div className="flexy-manager-tiers">{flexyTiers.map((tier, index) => <div className="flexy-manager-tier" key={index}>
                <div className="flexy-manager-tier-fields"><TextField label={tr("حتى (دج)", "Jusqu’à (DA)")} type="number" min="1" value={tier.up_to ?? ""} placeholder={tier.up_to === null ? tr("بدون حد", "Sans limite") : ""} onValueChange={(value) => changeFlexyTier(index, "up_to", value)} /><TextField label={tr("الرسم (دج)", "Frais (DA)")} type="number" min="0" value={tier.surcharge} onValueChange={(value) => changeFlexyTier(index, "surcharge", value)} />{index < flexyTiers.length - 1 && <button className="plain-icon danger-action" type="button" title={tr("حذف الشريحة", "Supprimer la tranche")} aria-label={tr("حذف الشريحة", "Supprimer la tranche")} onClick={() => setFlexyTiers((tiers) => tiers.filter((_, current) => current !== index))}><Trash2 size={16} /></button>}</div>
              </div>)}</div>
            </section>
            <section className="flexy-manager-section">
              <div className="flexy-manager-heading"><div><strong>{tr("المبالغ السريعة", "Montants rapides")}</strong><small>{tr("اختصارات مستقلة؛ تُحسب الرسوم تلقائيًا حسب الشريحة", "Raccourcis indépendants ; les frais sont calculés selon la tranche")}</small></div></div>
              <div className="flexy-tier-shortcuts"><div>{flexyQuickAmounts.map((amount, amountIndex) => <div className="flexy-tier-shortcut" key={amountIndex}><TextField label={tr("مبلغ (دج)", "Montant (DA)")} type="number" min="1" value={amount || ""} onValueChange={(value) => changeFlexyQuickAmount(amountIndex, value)} /><button className="plain-icon danger-action" type="button" title={tr("حذف المبلغ", "Supprimer le montant")} aria-label={tr("حذف المبلغ", "Supprimer le montant")} onClick={() => setFlexyQuickAmounts((amounts) => amounts.filter((_, index) => index !== amountIndex))}><Trash2 size={15} /></button></div>)}<button className="ghost-button compact-button" type="button" onClick={() => setFlexyQuickAmounts((amounts) => [...amounts, 0])}><Plus size={14} /> {tr("إضافة مبلغ", "Ajouter un montant")}</button></div></div>
            </section>
            <div className="button-row"><Button type="button" onClick={() => setFlexyProduct(null)}>{t.close}</Button><Button variant="primary" type="submit" disabled={flexySaving}><Save size={16} /> {flexySaving ? tr("جار الحفظ...", "Enregistrement...") : t.save}</Button></div>
          </form>
        </div>, document.body
      )}

      {historyProduct && createPortal(
        <div className="modal-backdrop stock-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryProduct(null); }}>
          <section className="panel form-panel form-modal stock-history-modal stock-modal-dialog">
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
                        <td><span className={`status-pill ${movement.quantity >= 0 ? "ok" : "danger"}`}>{movementLabel(movement.movement_type)}</span></td>
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
      , document.body)}

      {barcodeProduct && (
        <BarcodePrintModal product={barcodeProduct} onClose={() => setBarcodeProduct(null)} />
      )}
    </>
  );
}

function BarcodePrintModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [count, setCount] = useState(1);
  const [barcodePrinter, setBarcodePrinter] = useState("");
  const [printing, setPrinting] = useState(false);
  const labelCount = Math.max(1, Math.min(200, count || 1));

  useEffect(() => {
    api.appSettings()
      .then((settings) => setBarcodePrinter(settings.barcode_printer))
      .catch(() => setBarcodePrinter(""));
  }, []);

  async function printLabels() {
    if (printing) return;
    setPrinting(true);
    try {
      await api.printBarcodeLabels({
        product_name: product.name,
        barcode: product.barcode,
        price: product.sale_price,
        count: labelCount
      });
      const message = `تم إرسال ${labelCount} ملصق إلى طابعة الباركود`;
      showToast(message, "success");
    } catch (err) {
      showErrorToast(err, "تعذرت طباعة الباركود");
    } finally {
      setPrinting(false);
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
        <div className="modal-actions">
          <button className="gold-button" type="button" disabled={printing} onClick={() => void printLabels()}><Barcode size={18} /> {printing ? "جار الطباعة..." : `طباعة ${labelCount}`}</button>
          <button className="ghost-button" type="button" disabled={printing} onClick={onClose}>إغلاق</button>
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
  if (/^\d{8}$/.test(value)) {
    const bits = encodeEan8(value);
    const quietZone = 7;
    return (
      <svg className="barcode-svg" viewBox={`0 0 ${bits.length + quietZone * 2} 54`} role="img" aria-label={value} preserveAspectRatio="none">
        {bits.split("").map((bit, index) => bit === "1"
          ? <rect key={index} x={index + quietZone} y={0} width={1} height={54} />
          : null)}
      </svg>
    );
  }
  const encoded = encodeCode128B(value || " ");
  const barHeight = 54;
  const quietZone = 10;
  let x = quietZone;
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
    <svg className="barcode-svg" viewBox={`0 0 ${x + quietZone} ${barHeight}`} role="img" aria-label={value} preserveAspectRatio="none">
      {bars}
    </svg>
  );
}

function encodeEan8(value: string) {
  const left = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
  const right = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
  return `101${value.slice(0, 4).split("").map((digit) => left[Number(digit)]).join("")}01010${value.slice(4).split("").map((digit) => right[Number(digit)]).join("")}101`;
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
  const multiplier = form.product.custom_type === "tobacco" ? Math.max(1, form.product.custom_config?.pieces_per_box ?? 1) : 1;
  if (form.purchase_price_mode === "total") {
    return form.quantity > 0 ? form.purchase_price / (form.quantity * multiplier) : 0;
  }
  return form.purchase_price / multiplier;
}

function readImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
