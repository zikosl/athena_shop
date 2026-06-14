import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { Calculator, HandCoins, Landmark, PackageCheck, Scale, WalletCards } from "lucide-react";
import { api } from "../../shared/api";
import { money } from "../../shared/format";
import { CashShift, CreditAccount, Language, Product } from "../../shared/types";

type StockValuationMode = "purchase" | "sale" | "custom";

function numericInput(value: number, onChange: (value: number) => void) {
  return {
    type: "number",
    min: 0,
    value: value === 0 ? "" : value,
    onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value))
  };
}

function creditRemaining(credit: CreditAccount) {
  const paid = credit.payments.reduce((sum, payment) => sum + payment.amount, 0);
  return Math.max(0, credit.sale.remaining_amount - paid);
}

export function ZakatPage({ language }: { language: Language }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [credits, setCredits] = useState<CreditAccount[]>([]);
  const [shift, setShift] = useState<CashShift | null>(null);
  const [stockMode, setStockMode] = useState<StockValuationMode>("sale");
  const [customStockValue, setCustomStockValue] = useState(0);
  const [extraAssets, setExtraAssets] = useState(0);
  const [debtsToPay, setDebtsToPay] = useState(0);
  const [nisab, setNisab] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.products(), api.credits(), api.currentShift()])
      .then(([nextProducts, nextCredits, currentShift]) => {
        setProducts(nextProducts);
        setCredits(nextCredits);
        setShift(currentShift);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const totals = useMemo(() => {
    const purchaseStockValue = products.reduce((sum, product) => (
      sum + Math.max(0, product.quantity) * product.purchase_price
    ), 0);
    const saleStockValue = products.reduce((sum, product) => (
      sum + Math.max(0, product.quantity) * product.sale_price
    ), 0);
    const collectibleDebt = credits.reduce((sum, credit) => sum + creditRemaining(credit), 0);
    const caisseCash = shift?.status === "open" ? Math.max(0, shift.expected_amount) : 0;
    const selectedStockValue = stockMode === "purchase"
      ? purchaseStockValue
      : stockMode === "sale"
        ? saleStockValue
        : customStockValue;
    const zakatBase = Math.max(0, selectedStockValue + collectibleDebt + caisseCash + extraAssets - debtsToPay);
    const eligible = nisab > 0 && zakatBase >= nisab;

    return {
      purchaseStockValue,
      saleStockValue,
      collectibleDebt,
      caisseCash,
      selectedStockValue,
      zakatBase,
      eligible,
      zakatDue: eligible ? zakatBase * 0.025 : 0
    };
  }, [credits, customStockValue, debtsToPay, extraAssets, nisab, products, shift, stockMode]);

  const locale = language === "ar" ? "ar-DZ" : "fr-DZ";

  return (
    <div className="zakat-page">
      <section className="panel zakat-hero">
        <div>
          <p className="eyebrow"><Scale size={16} /> الزكاة</p>
          <h2>حساب زكاة المتجر بطريقة بسيطة</h2>
          <p>
            اجمع قيمة البضاعة المعدة للبيع، الديون القابلة للتحصيل، والصندوق، ثم اطرح الديون الواجبة الدفع. إذا بلغ المجموع النصاب فالزكاة المقدرة هي 2.5%.
          </p>
        </div>
        <article className={`zakat-status ${totals.eligible ? "ok" : "warning"}`}>
          <span>{totals.eligible ? "بلغ النصاب" : "لم يبلغ النصاب"}</span>
          <strong>{money(totals.zakatDue)}</strong>
          <small>الزكاة المقدرة إلى غاية {new Date().toLocaleDateString(locale)}</small>
        </article>
      </section>

      {error && <p className="error">{error}</p>}

      <section className="summary-strip zakat-summary">
        <article><span><PackageCheck size={15} /> قيمة المخزون</span><strong>{money(totals.selectedStockValue)}</strong></article>
        <article><span><HandCoins size={15} /> ديون قابلة للتحصيل</span><strong>{money(totals.collectibleDebt)}</strong></article>
        <article><span><WalletCards size={15} /> الصندوق المفتوح</span><strong>{money(totals.caisseCash)}</strong></article>
        <article><span><Landmark size={15} /> وعاء الزكاة</span><strong>{money(totals.zakatBase)}</strong></article>
        <article><span><Calculator size={15} /> الزكاة 2.5%</span><strong>{money(totals.zakatDue)}</strong></article>
      </section>

      <section className="zakat-grid">
        <div className="panel zakat-form">
          <div className="section-title">
            <h2><Calculator size={18} /> عناصر الحساب</h2>
            <span />
          </div>

          <div className="zakat-mode-card">
            <span>تقييم المخزون</span>
            <div className="segmented wide">
              <button type="button" className={stockMode === "sale" ? "active" : ""} onClick={() => setStockMode("sale")}>بسعر البيع</button>
              <button type="button" className={stockMode === "purchase" ? "active" : ""} onClick={() => setStockMode("purchase")}>بسعر الشراء</button>
              <button type="button" className={stockMode === "custom" ? "active" : ""} onClick={() => setStockMode("custom")}>قيمة يدوية</button>
            </div>
            <div className="zakat-reference">
              <b>شراء: {money(totals.purchaseStockValue)}</b>
              <b>بيع: {money(totals.saleStockValue)}</b>
            </div>
          </div>

          {stockMode === "custom" && (
            <label>
              <span>قيمة المخزون اليدوية</span>
              <div className="field"><input {...numericInput(customStockValue, setCustomStockValue)} /></div>
            </label>
          )}

          <div className="zakat-input-grid">
            <label>
              <span>أموال إضافية في البنك أو الخزنة</span>
              <div className="field"><input {...numericInput(extraAssets, setExtraAssets)} /></div>
            </label>
            <label>
              <span>ديون وفواتير يجب دفعها</span>
              <div className="field"><input {...numericInput(debtsToPay, setDebtsToPay)} /></div>
            </label>
            <label>
              <span>النصاب المعتمد</span>
              <div className="field"><input {...numericInput(nisab, setNisab)} /></div>
            </label>
          </div>
        </div>

        <aside className="panel zakat-help">
          <div className="section-title">
            <h2><Scale size={18} /> طريقة الاستعمال</h2>
            <span />
          </div>
          <ol>
            <li>اختر هل تريد تقييم البضاعة بسعر البيع أو الشراء أو إدخال قيمة يدوية.</li>
            <li>أضف الأموال خارج التطبيق، مثل البنك أو الخزنة.</li>
            <li>اكتب الديون والفواتير الواجبة الدفع قبل حساب الزكاة.</li>
            <li>أدخل قيمة النصاب حسب الذهب أو الفضة التي تعتمدها.</li>
          </ol>
          <p className="helper-text">
            هذه أداة مساعدة وليست فتوى. راجع إمامك أو مستشارك الشرعي للحالات الخاصة مثل الديون، البضاعة الراكدة، أو الشركاء.
          </p>
        </aside>
      </section>
    </div>
  );
}
