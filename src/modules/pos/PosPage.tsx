import { useEffect, useMemo, useState } from "react";
import * as QRCode from "qrcode";
import { Barcode, CalendarDays, CircleDollarSign, Minus, Percent, Plus, Printer, Save, Search, ShoppingBag, SprayCan, Trash2, X } from "lucide-react";
import { api } from "../../shared/api";
import { money, todayInputValue } from "../../shared/format";
import { useText } from "../../shared/i18n";
import { localized } from "../../shared/i18n";
import { showErrorToast, showToast } from "../../shared/toast";
import { AppSettings, CartItem, ClientRecord, Language, Perfume, PerfumeCartItem, Product, Sale, UserSession } from "../../shared/types";
import { Button, SelectControl, SelectField, TextAreaField, TextField } from "../../shared/ui";
import openzeyLogo from "../../assets/openzey-logo.png";

const orderQrPrefix = "POS:";
const legacyOrderQrPrefix = "POS_ORDER:";

function orderQrPayload(sale: Sale) {
  return `${orderQrPrefix}${sale.id}`;
}

function parseOrderQr(value: string) {
  const text = value.trim();
  const prefix = text.startsWith(orderQrPrefix)
    ? orderQrPrefix
    : text.startsWith(legacyOrderQrPrefix)
      ? legacyOrderQrPrefix
      : null;
  if (!prefix) return null;
  const [idPart, receiptNo] = text.slice(prefix.length).split(":");
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

function isPerfumeCategory(category: string) {
  return ["perfumerie", "عطور", "العطور"].includes(category.trim().toLocaleLowerCase("ar"));
}

function displayCategory(category: string) {
  return category === "Products" ? "المنتجات" : category;
}

type PosAssortment = "all" | "products" | "flexy" | "tobacco" | "printing" | "perfumery";

function matchesAssortment(product: Product, assortment: PosAssortment) {
  if (assortment === "perfumery") return false;
  if (assortment === "all") return !isPerfumeCategory(product.category);
  if (assortment === "products") return product.custom_type === "standard" && !isPerfumeCategory(product.category);
  return product.custom_type === assortment;
}

function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00213")) digits = `0${digits.slice(5)}`;
  else if (digits.startsWith("213") && digits.length === 12) digits = `0${digits.slice(3)}`;
  return digits;
}

function dueDateAfterDays(daysValue: string) {
  const days = Number(daysValue);
  if (!daysValue || !Number.isInteger(days) || days < 1 || days > 3650) return "";
  const date = new Date(`${todayInputValue()}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function customProductSummary(product: Product) {
  if (product.custom_type === "flexy") return "Flexy · رسوم حسب الشرائح";
  if (product.custom_type === "tobacco") return `قطعة ${money(product.custom_config?.piece_sale_price ?? 0)} · علبة ${money(product.custom_config?.box_sale_price ?? 0)}`;
  if (product.custom_type === "printing") return `Recto ${money(product.custom_config?.recto_price ?? 0)} · Recto-verso ${money(product.custom_config?.recto_verso_price ?? 0)}`;
  return `${product.quantity} قطعة · ${money(product.sale_price)}`;
}

function flexyFee(product: Product, amount: number) {
  const tiers = [...(product.custom_config?.surcharge_tiers ?? [])].sort((a, b) => (a.up_to ?? Infinity) - (b.up_to ?? Infinity));
  return tiers.find((tier) => tier.up_to === null || amount <= tier.up_to)?.surcharge ?? 0;
}

function uniqueFlexyProduct(products: Product[]) {
  let foundFlexy = false;
  return products.filter((product) => {
    if (product.custom_type !== "flexy") return true;
    if (foundFlexy) return false;
    foundFlexy = true;
    return true;
  });
}

function createServiceBarcode() {
  const body = `2${Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0")}`;
  const sum = body.split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return `${body}${(10 - sum % 10) % 10}`;
}

type PosServices = Pick<AppSettings, "enable_perfumes" | "enable_tobacco" | "enable_flexy" | "enable_printing">;

const defaultPosServices: PosServices = {
  enable_perfumes: false,
  enable_tobacco: true,
  enable_flexy: true,
  enable_printing: true
};

function serviceProductEnabled(product: Product, services: PosServices) {
  if (isPerfumeCategory(product.category) && !services.enable_perfumes) return false;
  if (product.custom_type === "flexy" && !services.enable_flexy) return false;
  if (product.custom_type === "tobacco" && !services.enable_tobacco) return false;
  if (product.custom_type === "printing" && !services.enable_printing) return false;
  return true;
}

export function PosPage({ language, user, shiftOpen, onOpenShift, onSale }: { language: Language; user: UserSession; shiftOpen: boolean; onOpenShift: () => void; onSale: () => void }) {
  const t = useText(language);
  const tr = (arabic: string, french: string) => localized(language, arabic, french);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [assortment, setAssortment] = useState<PosAssortment>("all");
  const [products, setProducts] = useState<Product[]>([]);
  const [productCatalog, setProductCatalog] = useState<Product[]>([]);
  const [services, setServices] = useState<PosServices>(defaultPosServices);
  const [categories, setCategories] = useState<string[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [perfumes, setPerfumes] = useState<Perfume[]>([]);
  const [perfumeCart, setPerfumeCart] = useState<PerfumeCartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [saleDate, setSaleDate] = useState(todayInputValue);
  const [showSaleDate, setShowSaleDate] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [saleType, setSaleType] = useState<"cash" | "credit" | "delivery">("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [createClientOpen, setCreateClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [paidAmount, setPaidAmount] = useState(0);
  const [dueDays, setDueDays] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [allowNegativeStock, setAllowNegativeStock] = useState(true);
  const [maxDiscount, setMaxDiscount] = useState(200);
  const [customDraft, setCustomDraft] = useState<{ product: Product; amount: string; quantity: string; option: string } | null>(null);
  const [customAmountOpen, setCustomAmountOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState("");

  useEffect(() => {
    const effectiveCategory = assortment === "perfumery" ? "Perfumerie" : category;
    api.products({ query, category: effectiveCategory, stock: "all" })
      .then((items) => setProducts(uniqueFlexyProduct(items).filter((product) =>
        serviceProductEnabled(product, services) && matchesAssortment(product, assortment) && (allowNegativeStock || product.quantity > 0 || product.custom_type === "printing")
      )))
      .catch((err) => showErrorToast(err, "تعذر تحميل المنتجات"));
  }, [query, category, assortment, allowNegativeStock, services]);

  useEffect(() => {
    api.appSettings()
      .then((settings) => {
        setAllowNegativeStock(settings.allow_negative_stock);
        setMaxDiscount(settings.max_discount_amount);
        setServices({
          enable_perfumes: settings.enable_perfumes,
          enable_tobacco: settings.enable_tobacco,
          enable_flexy: settings.enable_flexy,
          enable_printing: settings.enable_printing
        });
      })
      .catch(() => {
        setAllowNegativeStock(true);
        setMaxDiscount(200);
        showToast("تم استخدام إعدادات نقطة البيع الافتراضية", "warning");
      });
  }, []);

  useEffect(() => {
    if (!services.enable_perfumes) {
      setPerfumes([]);
      setPerfumeCart([]);
      if (assortment === "perfumery") setAssortment("all");
      return;
    }
    api.perfumes()
      .then((items) => setPerfumes(items.filter((perfume) => perfume.remaining_volume_ml > 0)))
      .catch((err) => showErrorToast(err, "تعذر تحميل العطور"));
  }, [services.enable_perfumes, assortment]);

  useEffect(() => {
    Promise.all([api.products(), api.categories()])
      .then(async ([loadedItems, categoryNames]) => {
        let items = loadedItems;
        if (services.enable_flexy && !items.some((product) => product.custom_type === "flexy")) {
          const service = await api.saveProduct({
            name: "Flexy",
            barcode: createServiceBarcode(),
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
          items = [...items, service];
        }
        const visibleProducts = uniqueFlexyProduct(items).filter((product) => serviceProductEnabled(product, services) && (services.enable_perfumes || !isPerfumeCategory(product.category)));
        setProductCatalog(visibleProducts);
        setCategories(categoryNames.filter((name) => services.enable_perfumes || !isPerfumeCategory(name)));
      })
      .catch((err) => showErrorToast(err, "تعذر تحميل دليل المنتجات"));
  }, [services]);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
    + perfumeCart.reduce((sum, item) => sum + item.price.sale_price * item.quantity, 0), [cart, perfumeCart]);
  const visiblePerfumes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return perfumes.filter((perfume) => !normalized || [perfume.name, perfume.family].some((value) => value.toLowerCase().includes(normalized)));
  }, [perfumes, query]);
  const flexyProduct = productCatalog.find((product) => product.custom_type === "flexy");
  const amountQuery = query.trim().replace(/\D/g, "");
  const flexyQuickAmounts = [...new Set(flexyProduct?.custom_config?.quick_amounts ?? [])]
    .filter((amount) => Number.isFinite(amount) && amount > 0 && (!amountQuery || String(amount).includes(amountQuery)))
    .sort((left, right) => left - right);
  const total = Math.max(0, subtotal - discount);
  const normalizedPaid = Math.max(0, Math.min(paidAmount, total));
  const creditRemaining = saleType === "credit" ? Math.max(0, total - normalizedPaid) : 0;
  const normalizedCustomerPhone = normalizePhone(customerPhone);
  const matchingClients = useMemo(() => normalizedCustomerPhone.length >= 3
    ? clients.filter((client) => normalizePhone(client.phone).includes(normalizedCustomerPhone)).slice(0, 5)
    : [], [clients, normalizedCustomerPhone]);
  const exactClient = clients.find((client) => normalizePhone(client.phone) === normalizedCustomerPhone);

  useEffect(() => {
    api.clients().then(setClients).catch((err) => showErrorToast(err, "تعذر تحميل دليل العملاء"));
  }, []);

  useEffect(() => {
    if (exactClient) setCustomerName(exactClient.name);
  }, [exactClient?.id]);

  function selectClient(client: ClientRecord) {
    setCustomerName(client.name);
    setCustomerPhone(client.phone);
  }

  function changeCustomerPhone(value: string) {
    const matched = clients.find((client) => normalizePhone(client.phone) === normalizePhone(value));
    setCustomerPhone(value);
    if (matched) setCustomerName(matched.name);
    else if (exactClient) setCustomerName("");
  }

  async function createClient() {
    if (!newClientName.trim()) {
      showToast(tr("أدخل اسم العميل", "Saisissez le nom du client"), "warning");
      return;
    }
    try {
      const client = await api.saveClient({ name: newClientName, phone: customerPhone });
      setClients((items) => [...items.filter((item) => item.phone !== client.phone), client]);
      setCustomerName(client.name);
      setCustomerPhone(client.phone);
      setNewClientName("");
      setCreateClientOpen(false);
      showToast(tr("تم حفظ العميل", "Client enregistré"), "success");
    } catch (err) {
      showErrorToast(err, tr("تعذر إنشاء العميل", "Impossible de créer le client"));
    }
  }
  function addProduct(product: Product) {
    if (!serviceProductEnabled(product, services)) return;
    if (product.custom_type && product.custom_type !== "standard") {
      setCustomDraft({ product, amount: "", quantity: "1", option: product.custom_type === "tobacco" ? "piece" : "recto" });
      return;
    }
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

  function addFlexyAmount(product: Product, value: number) {
    const amount = Math.floor(value);
    const hasMatchingTier = (product.custom_config?.surcharge_tiers ?? []).some((tier) => tier.up_to === null || amount <= tier.up_to);
    if (!Number.isFinite(amount) || amount <= 0 || !hasMatchingTier) {
      showToast(tr("تحقق من مبلغ Flexy وشرائح الرسوم", "Vérifiez le montant Flexy et les tranches de frais"), "warning");
      return false;
    }
    if (amount > product.quantity && !allowNegativeStock) {
      showToast(tr("الرصيد المتاح من Flexy غير كاف", "Solde Flexy insuffisant"), "warning");
      return false;
    }
    const surcharge = flexyFee(product, amount);
    setCart((items) => [...items, {
      product,
      quantity: 1,
      unit_price: amount + surcharge,
      unit_cost: product.purchase_price * amount,
      stock_quantity: amount,
      display_name: `${product.name} ${amount} دج`,
      custom_option: `flexy:${amount}`,
      cart_key: `${product.id}-${Date.now()}-${Math.random()}`
    }]);
    return true;
  }

  function confirmCustomProduct() {
    if (!customDraft) return;
    const { product } = customDraft;
    if (product.custom_type === "flexy") {
      if (addFlexyAmount(product, Number(customDraft.amount))) setCustomDraft(null);
      return;
    }
    const quantity = Math.floor(Number(customDraft.quantity));
    let stockQuantity = quantity;
    let unitPrice = product.sale_price;
    let unitCost = product.purchase_price;
    let displayName = product.name;
    let customOption = customDraft.option;
    if (product.custom_type === "tobacco") {
      const piecesPerBox = Math.max(1, product.custom_config?.pieces_per_box ?? 1);
      const isBox = customDraft.option === "box";
      stockQuantity = quantity * (isBox ? piecesPerBox : 1);
      unitPrice = isBox ? (product.custom_config?.box_sale_price ?? 0) : (product.custom_config?.piece_sale_price ?? 0);
      unitCost = product.purchase_price * (isBox ? piecesPerBox : 1);
      displayName = `${product.name} (${isBox ? "علبة" : "قطعة"})`;
    } else if (product.custom_type === "printing") {
      const duplex = customDraft.option === "recto_verso";
      unitPrice = duplex ? (product.custom_config?.recto_verso_price ?? 0) : (product.custom_config?.recto_price ?? 0);
      unitCost = 0;
      displayName = `${product.name} (${duplex ? "Recto-verso" : "Recto"})`;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) { showToast(tr("أدخل كمية صحيحة", "Saisissez une quantité valide"), "warning"); return; }
    if (product.custom_type !== "printing" && stockQuantity > product.quantity && !allowNegativeStock) { showToast(tr("المخزون غير كاف", "Stock insuffisant"), "warning"); return; }
    setCart((items) => [...items, { product, quantity, unit_price: unitPrice, unit_cost: unitCost, stock_quantity: stockQuantity, display_name: displayName, custom_option: customOption, cart_key: `${product.id}-${Date.now()}-${Math.random()}` }]);
    setCustomDraft(null);
  }

  function addCustomAmount() {
    const price = Number(customAmount);
    if (!Number.isFinite(price) || price <= 0) {
      showToast(tr("أدخل مبلغًا صحيحًا أكبر من صفر", "Saisissez un montant supérieur à zéro"), "warning");
      return;
    }
    const product: Product = {
      id: 0,
      name: "مبلغ مخصص",
      barcode: "",
      category: "",
      size: "",
      color: "",
      quantity: 0,
      low_stock_threshold: 0,
      purchase_price: 0,
      sale_price: price,
      image_data: "",
      created_at: "",
      updated_at: "",
      custom_type: "standard",
      custom_config: {}
    };
    setCart((items) => [...items, {
      product,
      quantity: 1,
      unit_price: price,
      stock_quantity: 0,
      display_name: "مبلغ مخصص",
      custom_option: "custom_amount",
      unit_cost: 0,
      cart_key: `custom-amount-${Date.now()}-${Math.random()}`
    }]);
    setCustomAmount("");
    setCustomAmountOpen(false);
  }

  async function addScannedBarcode(value: string) {
    const barcode = value.trim();
    if (!barcode) return;
    try {
      const orderRef = parseOrderQr(barcode);
      if (orderRef) {
        const matchedSale = await api.sale(orderRef.id);
        setReceipt(matchedSale);
        setQuery("");
        showToast(tr("تم فتح الفاتورة", "Facture ouverte"), "success");
        return;
      }

      let product = productCatalog.find((item) => item.barcode.trim().toLowerCase() === barcode.toLowerCase());
      if (!product) {
        const matches = await api.products({ query: barcode, stock: "all" });
        product = matches.find((item) => item.barcode.trim().toLowerCase() === barcode.toLowerCase());
      }
      if (!product) {
        showToast(tr("لم يتم العثور على منتج بهذا الباركود", "Aucun produit ne correspond à ce code-barres"), "error");
        return;
      }
      if (!serviceProductEnabled(product, services)) {
        showToast(tr("هذه الخدمة معطلة من الإعدادات", "Ce service est désactivé dans les paramètres"), "warning");
        return;
      }
      if (!allowNegativeStock && product.quantity <= 0) {
        showToast(tr("هذا المنتج غير متوفر في المخزون", "Ce produit est en rupture de stock"), "error");
        setQuery("");
        return;
      }
      addProduct(product);
      setQuery("");
    } catch (err) {
      showToast(err instanceof Error ? err.message : tr("تعذرت قراءة الباركود", "Impossible de lire le code-barres"), "error");
    }
  }

  function setQty(productId: number, quantity: number) {
    setCart((items) => items
      .map((item) => item.product.id === productId
        ? { ...item, quantity: allowNegativeStock ? Math.max(1, quantity) : Math.max(1, Math.min(quantity, item.product.quantity)) }
        : item)
      .filter((item) => item.quantity > 0));
  }

  function addPerfume(perfume: Perfume, flaconId: number) {
    const price = perfume.prices.find((item) => item.flacon_id === flaconId);
    if (!price || price.sale_price <= 0) return;
    const maxQty = Math.floor(perfume.remaining_volume_ml / price.volume_ml);
    if (maxQty <= 0) return;
    setPerfumeCart((items) => {
      const existing = items.find((item) => item.perfume.id === perfume.id && item.price.flacon_id === flaconId);
      if (existing) return items.map((item) => item.perfume.id === perfume.id && item.price.flacon_id === flaconId
        ? { ...item, quantity: Math.min(item.quantity + 1, maxQty) }
        : item);
      return [...items, { perfume, price, quantity: 1 }];
    });
  }

  function setPerfumeQty(perfumeId: number, flaconId: number, quantity: number) {
    setPerfumeCart((items) => items.map((item) => {
      if (item.perfume.id !== perfumeId || item.price.flacon_id !== flaconId) return item;
      const maxQty = Math.floor(item.perfume.remaining_volume_ml / item.price.volume_ml);
      return { ...item, quantity: Math.max(1, Math.min(quantity, maxQty)) };
    }));
  }

  async function checkout() {
    if (checkingOut) return;
    if (!cart.length && !perfumeCart.length) {
      showToast(tr("أضف منتجًا واحدًا على الأقل إلى السلة", "Ajoutez au moins un article au panier"), "warning");
      return;
    }
    if (saleType !== "delivery" && !shiftOpen) {
      onOpenShift();
      showToast(tr("افتح الصندوق أولًا لإتمام عملية البيع", "Ouvrez la caisse avant de finaliser la vente"), "warning");
      return;
    }
    if (cart.some((item) => !Number.isFinite(item.unit_price) || item.unit_price < 0)) {
      showToast(tr("تحقق من أسعار المنتجات في السلة", "Vérifiez les prix des articles dans le panier"), "warning");
      return;
    }
    if (discount < 0 || discount > maxDiscount) {
      showToast(tr(`أقصى تخفيض مسموح هو ${maxDiscount}`, `La remise maximale autorisée est de ${maxDiscount}`), "warning");
      return;
    }
    if (discount > subtotal) {
      showToast(t.discountTooHigh, "warning");
      return;
    }
    if ((saleType === "credit" || saleType === "delivery") && !customerName.trim()) {
      showToast(t.requiredCreditCustomer, "warning");
      return;
    }
    if (saleType === "credit" && dueDays && !dueDateAfterDays(dueDays)) {
      showToast(tr("أدخل عدد أيام صحيحًا بين 1 و3650", "Saisissez un nombre de jours entre 1 et 3650"), "warning");
      return;
    }
    if (paidAmount < 0 || paidAmount > total) {
      showToast(tr("المبلغ المدفوع غير صالح", "Le montant payé est invalide"), "warning");
      return;
    }
    setCheckingOut(true);
    try {
      const sale = await api.checkout({
        items: cart.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.unit_price
          , stock_quantity: item.stock_quantity,
          display_name: item.display_name,
          custom_option: item.custom_option
        })),
        perfume_items: perfumeCart.map((item) => ({
          perfume_id: item.perfume.id,
          flacon_id: item.price.flacon_id,
          quantity: item.quantity
        })),
        discount,
        sale_type: saleType,
        paid_amount: saleType === "cash" || saleType === "delivery" ? (saleType === "cash" ? total : 0) : normalizedPaid,
        customer_name: customerName,
        customer_phone: customerPhone,
        due_date: saleType === "credit" ? dueDateAfterDays(dueDays) : "",
        credit_note: creditNote,
        sale_date: saleDate,
        cashier: user.display_name
      });
      setReceipt(sale);
      setCart([]);
      setPerfumeCart([]);
      setDiscount(0);
      setSaleType("cash");
      setCustomerName("");
      setCustomerPhone("");
      setDueDays("");
      setPaidAmount(0);
      setCreditNote("");
      setSaleDate(todayInputValue());
      const nextProducts = await api.products({ query, category: assortment === "perfumery" ? "Perfumerie" : category, stock: "all" });
      setProducts(nextProducts.filter((product) =>
        serviceProductEnabled(product, services) && matchesAssortment(product, assortment) && (allowNegativeStock || product.quantity > 0 || product.custom_type === "printing")
      ));
      const nextCatalog = await api.products({ stock: "all" });
      const visibleCatalog = nextCatalog.filter((product) => serviceProductEnabled(product, services) && (services.enable_perfumes || !isPerfumeCategory(product.category)));
      setProductCatalog(visibleCatalog);
      setCategories((await api.categories()).filter((name) => services.enable_perfumes || !isPerfumeCategory(name)));
      if (services.enable_perfumes) setPerfumes((await api.perfumes()).filter((perfume) => perfume.remaining_volume_ml > 0));
      onSale();
      showToast(sale.sale_type === "delivery" ? tr("تم إرسال الطلب إلى التوصيل", "Commande envoyée en livraison") : tr("تم إنشاء الفاتورة بنجاح", "Facture créée avec succès"), "success");
    } catch (err) {
      showErrorToast(err, tr("تعذر إنشاء الفاتورة", "Impossible de créer la facture"));
    } finally {
      setCheckingOut(false);
    }
  }

  useEffect(() => {
    function handlePosShortcut(event: KeyboardEvent) {
      if (event.isComposing) return;

      if (event.key === "Escape") {
        if (createClientOpen) setCreateClientOpen(false);
        else if (customAmountOpen) setCustomAmountOpen(false);
        else if (customDraft) setCustomDraft(null);
        else if (receipt) setReceipt(null);
        else return;
        event.preventDefault();
        return;
      }

      if (event.key === "F10") {
        if (customDraft || customAmountOpen || createClientOpen || receipt) return;
        event.preventDefault();
        void checkout();
        return;
      }

      if (customDraft || customAmountOpen || createClientOpen || receipt) return;
      if (event.key === "F6") {
        event.preventDefault();
        setCustomAmountOpen(true);
      } else if (event.key === "F2") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>(".pos-grid .searchbar input")?.focus();
      } else if (event.key === "F3") {
        event.preventDefault();
        setShowSaleDate((shown) => !shown);
      } else if (event.key === "F4") {
        event.preventDefault();
        setShowDiscount((shown) => !shown);
      }
    }

    window.addEventListener("keydown", handlePosShortcut);
    return () => window.removeEventListener("keydown", handlePosShortcut);
  }, [checkout, customDraft, customAmountOpen, createClientOpen, receipt]);

  return (
    <section className="pos-grid">
      <section className="panel table-panel">
        <div className="segmented pos-mode-tabs">
          <button className={assortment === "all" ? "active" : ""} type="button" onClick={() => { setAssortment("all"); setCategory(""); }}>{tr("الكل", "Tout")}</button>
          <button className={assortment === "products" ? "active" : ""} type="button" onClick={() => { setAssortment("products"); setCategory(""); }}>{tr("المنتجات", "Produits")}</button>
          {services.enable_flexy && <button className={assortment === "flexy" ? "active" : ""} type="button" onClick={() => { setAssortment("flexy"); setCategory(""); }}>Flexy</button>}
          {services.enable_tobacco && <button className={assortment === "tobacco" ? "active" : ""} type="button" onClick={() => { setAssortment("tobacco"); setCategory(""); }}>{tr("التبغ", "Tabac")}</button>}
          {services.enable_printing && <button className={assortment === "printing" ? "active" : ""} type="button" onClick={() => { setAssortment("printing"); setCategory(""); }}>{tr("الطباعة", "Impression")}</button>}
          {services.enable_perfumes && <button className={assortment === "perfumery" ? "active" : ""} type="button" onClick={() => { setAssortment("perfumery"); setCategory(""); }}>العطور</button>}
        </div>
        <div className={`filter-row pos-filter-row${assortment === "all" || assortment === "products" ? "" : " pos-filter-row-service"}`}>
          <div className="searchbar">
            <Search size={18} />
            <input
              autoFocus
              aria-keyshortcuts="F2"
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
          <button className="ghost-button custom-amount-trigger" type="button" aria-keyshortcuts="F6" onClick={() => setCustomAmountOpen(true)}>
            <CircleDollarSign size={18} /> <span>مبلغ مخصص</span><kbd>F6</kbd>
          </button>
          {(assortment === "all" || assortment === "products") && <SelectControl aria-label={t.category} value={category} onValueChange={setCategory} options={[{ value: "", label: t.allCategories }, ...categories.map((item) => ({ value: item, label: displayCategory(item) }))]} />}
        </div>
        <div className="product-picker">
          {assortment === "flexy" && flexyProduct && <>
            {flexyQuickAmounts.map((amount) => {
              const surcharge = flexyFee(flexyProduct, amount);
              const disabled = !allowNegativeStock && amount > flexyProduct.quantity;
              return <button
                key={`flexy-${amount}`}
                className="product-tile flexy-quick-tile"
                type="button"
                disabled={disabled}
                aria-label={`${tr("تعبئة", "Recharge")} ${money(amount)} · ${tr("الإجمالي", "Total")} ${money(amount + surcharge)}`}
                onClick={() => addFlexyAmount(flexyProduct, amount)}
              >
                <span>{tr("تعبئة", "Recharge")}</span>
                <strong>{money(amount)}</strong>
                <small>{tr("رسوم", "Frais")} {money(surcharge)}</small>
                <b>{money(amount + surcharge)}</b>
              </button>;
            })}
            <button className="product-tile flexy-quick-tile flexy-other-tile" type="button" onClick={() => addProduct(flexyProduct)}>
              <Plus size={20} />
              <strong>{tr("مبلغ آخر", "Autre montant")}</strong>
            </button>
          </>}
          {(assortment === "all" || assortment === "perfumery") && services.enable_perfumes && visiblePerfumes.map((perfume) => (
            <article key={`perfume-${perfume.id}`} className="product-tile perfume-tile">
              <span><SprayCan size={22} /></span>
              <strong>{perfume.name}</strong>
              <em>{perfume.family} · {perfume.remaining_volume_ml.toFixed(1)} ml</em>
              <div className="flacon-choice-row">
                {perfume.prices
                  .filter((price) => price.sale_price > 0 && perfume.remaining_volume_ml >= price.volume_ml)
                  .map((price) => <button type="button" key={price.flacon_id} onClick={() => addPerfume(perfume, price.flacon_id)}>{price.flacon_name}<small>{money(price.sale_price)}</small></button>)}
              </div>
            </article>
          ))}
          {assortment !== "flexy" && products.map((product) => (
            <button key={product.id} className="product-tile" onClick={() => addProduct(product)}>
              <span className="product-tile-media">
                {product.image_data ? <img src={product.image_data} alt="" /> : <ShoppingBag size={22} />}
              </span>
              <span className="product-tile-overlay">
                <strong>{product.name}</strong>
                <small>{product.custom_type === "standard" ? money(product.sale_price) : customProductSummary(product)}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <aside className="panel cart-panel">
        <div className="section-title cart-heading">
          <h2>{t.cart}</h2>
          <button className={`cart-option-toggle ${showSaleDate ? "active" : ""}`} type="button" title="تاريخ الفاتورة" aria-label="تاريخ الفاتورة" aria-keyshortcuts="F3" aria-pressed={showSaleDate} onClick={() => setShowSaleDate((shown) => !shown)}><CalendarDays size={17} /></button>
          <button className={`cart-option-toggle ${showDiscount ? "active" : ""}`} type="button" title={t.discount} aria-label={t.discount} aria-keyshortcuts="F4" aria-pressed={showDiscount} onClick={() => setShowDiscount((shown) => !shown)}><Percent size={17} /></button>
          <span />
        </div>
        <div className="cart-lines">
          {cart.map((item) => (
            <article key={item.cart_key ?? item.product.id} className="cart-line">
              <div className="cart-item-info">
                <strong>{item.display_name ?? item.product.name}</strong>
                <span className="cart-unit-price">{money(item.unit_price)} / {item.custom_option?.startsWith("standard") || !item.custom_option ? "قطعة" : "وحدة"}</span>
              </div>
              {!item.custom_option && <div className="qty-control">
                <button type="button" aria-label="تقليل الكمية" onClick={() => setQty(item.product.id, item.quantity - 1)}><Minus size={14} /></button>
                <b>{item.quantity}</b>
                <button type="button" aria-label="زيادة الكمية" onClick={() => setQty(item.product.id, item.quantity + 1)}><Plus size={14} /></button>
              </div>}
              <button type="button" className="plain-icon" aria-label="حذف المنتج" onClick={() => setCart(cart.filter((line) => (line.cart_key ?? String(line.product.id)) !== (item.cart_key ?? String(item.product.id))))}><Trash2 size={16} /></button>
            </article>
          ))}
          {perfumeCart.map((item) => (
            <article key={`${item.perfume.id}-${item.price.flacon_id}`} className="cart-line perfume-cart-line">
              <div className="cart-item-info">
                <strong>{item.perfume.name}</strong>
                <span>{item.price.flacon_name} · {item.price.volume_ml} ml</span>
                <span className="cart-unit-price">سعر القارورة: {money(item.price.sale_price)}</span>
              </div>
              <div className="qty-control">
                <button type="button" aria-label="تقليل الكمية" onClick={() => setPerfumeQty(item.perfume.id, item.price.flacon_id, item.quantity - 1)}><Minus size={14} /></button>
                <b>{item.quantity}</b>
                <button type="button" aria-label="زيادة الكمية" onClick={() => setPerfumeQty(item.perfume.id, item.price.flacon_id, item.quantity + 1)}><Plus size={14} /></button>
              </div>
              <button type="button" className="plain-icon" aria-label="حذف المنتج" onClick={() => setPerfumeCart((items) => items.filter((line) => line.perfume.id !== item.perfume.id || line.price.flacon_id !== item.price.flacon_id))}><Trash2 size={16} /></button>
            </article>
          ))}
        </div>
        {showSaleDate && <label className="cart-option-field">
          <span>تاريخ الفاتورة</span>
          <div className="field">
            <input type="date" max={todayInputValue()} value={saleDate} onChange={(event) => setSaleDate(event.target.value || todayInputValue())} />
          </div>
          <small>{formatSaleDate(`${saleDate}T12:00:00`, language, false)}</small>
        </label>}
        {showDiscount && <label className="cart-option-field">
          <span>{t.discount}</span>
          <div className="field">
            <input type="number" min={0} max={maxDiscount} value={discount === 0 ? "" : discount} onChange={(event) => setDiscount(Math.max(0, Math.min(maxDiscount, Number(event.target.value))))} />
          </div>
          <small>{`${t.discountMax.replace("200", String(maxDiscount))}`}</small>
        </label>}
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
            <div className="client-phone-field">
              <TextField label={t.phone} type="tel" inputMode="tel" autoComplete="tel" value={customerPhone} onValueChange={changeCustomerPhone} />
              {matchingClients.length > 0 && !exactClient && <div className="client-match-list">{matchingClients.map((client) => <button type="button" key={client.id} onClick={() => selectClient(client)}><strong>{client.name}</strong><span>{client.phone}</span></button>)}</div>}
              {normalizedCustomerPhone.length >= 9 && normalizedCustomerPhone.length <= 12 && !exactClient && <button className="ghost-button compact-button create-client-trigger" type="button" onClick={() => { setNewClientName(customerName); setCreateClientOpen(true); }}><Plus size={15} /> إنشاء عميل بهذا الرقم</button>}
              {exactClient && <small className="client-match-confirmation">عميل محفوظ: {exactClient.name}</small>}
            </div>
            <TextField label={t.customer} value={customerName} onValueChange={setCustomerName} />
            {saleType === "credit" && <TextField label={t.paidNow} type="number" min={0} max={total} value={paidAmount} onValueChange={(value) => setPaidAmount(Number(value))} />}
            {saleType === "credit" && <div><TextField label="موعد السداد بعد (أيام) · اختياري" type="number" min={1} max={3650} step={1} placeholder="مثال: 15" value={dueDays} onValueChange={setDueDays} />{dueDays && dueDateAfterDays(dueDays) && <small>التاريخ المتوقع: {dueDateAfterDays(dueDays)}</small>}</div>}
            <TextAreaField className="full-field" label={saleType === "delivery" ? "العنوان / ملاحظة التوصيل" : t.note} value={creditNote} onValueChange={setCreditNote} />
          </div>
        )}
        <div className="totals">
          <span>{t.subtotal} <b>{money(subtotal)}</b></span>
          {saleType === "credit" && <span>{t.remaining} <b>{money(creditRemaining)}</b></span>}
          {saleType === "delivery" && <span>توصيل في الانتظار <b>{money(total)}</b></span>}
          <span>{t.total} <strong>{money(total)}</strong></span>
        </div>
        <button className="gold-button" aria-keyshortcuts="F10" disabled={checkingOut} onClick={checkout}>{checkingOut ? "جار التسجيل..." : t.checkout}</button>
      </aside>

      {customDraft && <div className="modal-backdrop"><section className="panel form-panel form-modal"><div className="section-title"><h2>{customDraft.product.name}</h2><span /><button className="plain-icon" onClick={() => setCustomDraft(null)}><X size={18} /></button></div>
        {customDraft.product.custom_type === "flexy" && <>
          <div className="flexy-pos-shortcuts" aria-label="مبالغ Flexy السريعة">{(customDraft.product.custom_config?.quick_amounts ?? []).map((amount, index) => <button type="button" key={`${amount}-${index}`} className={Number(customDraft.amount) === amount ? "active" : ""} onClick={() => setCustomDraft({ ...customDraft, amount: String(amount) })}>{money(amount)}</button>)}</div>
          <TextField label="مبلغ التعبئة (دج)" autoFocus type="number" min="1" value={customDraft.amount} onValueChange={(amount) => setCustomDraft({ ...customDraft, amount })} />
          <p>الرسم: {money(flexyFee(customDraft.product, Number(customDraft.amount || 0)))} · الإجمالي: {money(Number(customDraft.amount || 0) + flexyFee(customDraft.product, Number(customDraft.amount || 0)))}</p>
        </>}
        {customDraft.product.custom_type === "tobacco" && <><SelectField label="نوع البيع" value={customDraft.option} onValueChange={(option) => setCustomDraft({ ...customDraft, option })} options={[{ value: "piece", label: `قطعة · ${money(customDraft.product.custom_config?.piece_sale_price ?? 0)}` }, { value: "box", label: `علبة · ${money(customDraft.product.custom_config?.box_sale_price ?? 0)}` }]} /><TextField label="الكمية" type="number" min="1" value={customDraft.quantity} onValueChange={(quantity) => setCustomDraft({ ...customDraft, quantity })} /><p>خصم المخزون: {Number(customDraft.quantity || 0) * (customDraft.option === "box" ? (customDraft.product.custom_config?.pieces_per_box ?? 1) : 1)} قطعة</p></>}
        {customDraft.product.custom_type === "printing" && <><SelectField label="نوع الطباعة" value={customDraft.option} onValueChange={(option) => setCustomDraft({ ...customDraft, option })} options={[{ value: "recto", label: `Recto · ${money(customDraft.product.custom_config?.recto_price ?? 0)}` }, { value: "recto_verso", label: `Recto-verso · ${money(customDraft.product.custom_config?.recto_verso_price ?? 0)}` }]} /><TextField label="عدد الخدمات" type="number" min="1" value={customDraft.quantity} onValueChange={(quantity) => setCustomDraft({ ...customDraft, quantity })} /></>}
        <div className="button-row"><button type="button" className="ghost-button" onClick={() => setCustomDraft(null)}>{t.close}</button><button type="button" className="gold-button" onClick={confirmCustomProduct}>إضافة · {customDraft.product.custom_type === "flexy" ? money(Number(customDraft.amount || 0) + flexyFee(customDraft.product, Number(customDraft.amount || 0))) : money((customDraft.product.custom_type === "tobacco" ? customDraft.option === "box" ? customDraft.product.custom_config?.box_sale_price ?? 0 : customDraft.product.custom_config?.piece_sale_price ?? 0 : customDraft.option === "recto_verso" ? customDraft.product.custom_config?.recto_verso_price ?? 0 : customDraft.product.custom_config?.recto_price ?? 0) * Number(customDraft.quantity || 0))}</button></div>
      </section></div>}

      {customAmountOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCustomAmountOpen(false); }}><section className="panel form-panel form-modal custom-amount-modal" role="dialog" aria-modal="true" aria-labelledby="custom-amount-title"><div className="section-title"><h2 id="custom-amount-title">مبلغ مخصص</h2><span /><button className="plain-icon" type="button" aria-label={t.close} onClick={() => setCustomAmountOpen(false)}><X size={18} /></button></div><TextField label="المبلغ (دج)" autoFocus type="number" min="1" step="1" value={customAmount} onValueChange={setCustomAmount} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomAmount(); } }} /><div className="button-row"><Button type="button" onClick={() => setCustomAmountOpen(false)}>{t.close}</Button><Button variant="primary" type="button" onClick={addCustomAmount}>إضافة إلى الطلب · {money(Number(customAmount) || 0)}</Button></div></section></div>}

      {createClientOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateClientOpen(false); }}>
        <form className="panel form-panel form-modal client-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-client-title" onSubmit={(event) => { event.preventDefault(); void createClient(); }}>
          <div className="section-title"><h2 id="create-client-title">إنشاء عميل</h2><span /><button className="plain-icon" type="button" aria-label={t.close} onClick={() => setCreateClientOpen(false)}><X size={18} /></button></div>
          <TextField label="رقم الهاتف" value={customerPhone} readOnly />
          <TextField label="اسم العميل" autoFocus value={newClientName} onValueChange={setNewClientName} />
          <div className="button-row"><Button type="button" onClick={() => setCreateClientOpen(false)}>{t.close}</Button><Button variant="primary" type="submit" disabled={!newClientName.trim()}><Save size={17} /> إنشاء العميل</Button></div>
        </form>
      </div>}

      {receipt && <ReceiptModal sale={receipt} language={language} onClose={() => setReceipt(null)} />}
    </section>
  );
}

function ReceiptModal({ sale, language, onClose }: { sale: Sale; language: Language; onClose: () => void }) {
  const t = useText(language);
  const [printing, setPrinting] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrGenerating, setQrGenerating] = useState(true);
  const [settings, setSettings] = useState<Pick<AppSettings, "receipt_title" | "receipt_subtitle" | "show_invoice_logo" | "ticket_width_chars">>({
    receipt_title: "OpenSoft",
    receipt_subtitle: "حلول إدارة الأعمال من OpenZey",
    show_invoice_logo: true,
    ticket_width_chars: 32
  });

  useEffect(() => {
    api.appSettings()
      .then((saved) => setSettings({
        receipt_title: saved.receipt_title || "OpenSoft",
        receipt_subtitle: saved.receipt_subtitle || "حلول إدارة الأعمال من OpenZey",
        show_invoice_logo: saved.show_invoice_logo ?? true,
        ticket_width_chars: Math.min(48, Math.max(24, saved.ticket_width_chars || 32))
      }))
      .catch((err) => showErrorToast(err, "تعذر تحميل إعدادات الفاتورة"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setQrGenerating(true);
    setQrDataUrl("");
    QRCode.toDataURL(orderQrPayload(sale), {
      errorCorrectionLevel: "H",
      margin: 4,
      scale: 6,
      type: "image/png",
      color: { dark: "#000000", light: "#ffffff" }
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrDataUrl(dataUrl);
          setQrGenerating(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl("");
          setQrGenerating(false);
          showToast("تعذر إنشاء رمز QR للفاتورة", "error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sale]);

  async function printReceipt() {
    if (printing || qrGenerating) return;
    if (!qrDataUrl) {
      const message = "تعذر إنشاء رمز QR للفاتورة";
      showToast(message, "error");
      return;
    }
    setPrinting(true);
    try {
      await api.printReceiptText(formatReceiptText(sale, t, settings), qrDataUrl);
      const message = "\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629 \u0644\u0644\u0637\u0628\u0627\u0639\u0629";
      showToast(message, "success");
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      const message = detail || "\u0644\u0627 \u064a\u0645\u0643\u0646 \u0637\u0628\u0627\u0639\u0629 \u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629. \u062a\u0623\u0643\u062f \u0645\u0646 \u0648\u062c\u0648\u062f \u0637\u0627\u0628\u0639\u0629.";
      showToast(message, "error");
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="receipt-modal">
        <div className="receipt-paper" id="receipt">
          {settings.show_invoice_logo && <img src={openzeyLogo} alt="OpenSoft" className="receipt-logo" />}
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
          <button className="gold-button" disabled={printing || qrGenerating} onClick={() => void printReceipt()}><Printer size={18} /> {qrGenerating ? "تحضير QR..." : printing ? "جار الطباعة..." : t.print}</button>
          <button className="ghost-button" disabled={printing} onClick={onClose}>{t.close}</button>
        </div>
      </section>
    </div>
  );
}

function formatReceiptText(sale: Sale, t: ReturnType<typeof useText>, settings: Pick<AppSettings, "receipt_title" | "receipt_subtitle" | "ticket_width_chars">) {
  const width = Math.min(48, Math.max(24, settings.ticket_width_chars || 32));
  const lines = [
    center(settings.receipt_title || "OpenSoft", width),
    center(settings.receipt_subtitle || "حلول إدارة الأعمال من OpenZey", width),
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
