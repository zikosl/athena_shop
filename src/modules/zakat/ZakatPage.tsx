import { useEffect, useMemo, useState } from "react";
import { Calculator, CalendarDays, HandCoins, Landmark, PackageCheck, Scale, WalletCards } from "lucide-react";
import { api } from "../../shared/api";
import { addHijriYear, hijriDateLabel, money, todayInputValue } from "../../shared/format";
import { showErrorToast } from "../../shared/toast";
import { localized } from "../../shared/i18n";
import { CashShift, CreditAccount, Language, Product } from "../../shared/types";
import { TextField } from "../../shared/ui";

type StockValuationMode = "purchase" | "sale" | "custom";

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
  const [lastZakatDate, setLastZakatDate] = useState("");

  useEffect(() => {
    Promise.all([api.products(), api.credits(), api.currentShift()])
      .then(([nextProducts, nextCredits, currentShift]) => {
        setProducts(nextProducts);
        setCredits(nextCredits);
        setShift(currentShift);
      })
      .catch((err) => showErrorToast(err, localized(language, "تعذر تحميل بيانات الزكاة", "Impossible de charger les données de la zakat")));
  }, []);

  const today = useMemo(() => new Date(), []);
  const hijriToday = hijriDateLabel(today, language);
  const nextZakatDate = lastZakatDate ? addHijriYear(new Date(lastZakatDate)) : null;
  const hijriCycleComplete = !nextZakatDate || today >= nextZakatDate;

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
    const reachedNisab = nisab > 0 && zakatBase >= nisab;
    const eligible = reachedNisab && hijriCycleComplete;

    return {
      purchaseStockValue,
      saleStockValue,
      collectibleDebt,
      caisseCash,
      selectedStockValue,
      zakatBase,
      reachedNisab,
      eligible,
      zakatDue: eligible ? zakatBase * 0.025 : 0
    };
  }, [credits, customStockValue, debtsToPay, extraAssets, hijriCycleComplete, nisab, products, shift, stockMode]);

  return (
    <div className="zakat-page">
      <section className="panel zakat-hero">
        <div>
          <p className="eyebrow"><Scale size={16} /> {localized(language, "الزكاة", "Zakat")}</p>
          <h2>{localized(language, "حساب زكاة المتجر حسب السنة الهجرية", "Calcul de la zakat du magasin selon l’année hégirienne")}</h2>
          <p>{localized(language, "تجب الزكاة بعد مرور حول هجري كامل على المال الذي بلغ النصاب. اجمع قيمة البضاعة المعدة للبيع، والديون القابلة للتحصيل، ورصيد الصندوق، ثم اطرح الديون الواجبة الدفع. عند بلوغ النصاب واكتمال الحول تكون الزكاة المقدرة 2.5%.", "La zakat est due après une année hégirienne complète sur les biens ayant atteint le nisab. Additionnez le stock destiné à la vente, les créances recouvrables et le solde de caisse, puis déduisez les dettes à payer. Le taux estimé est de 2,5 % lorsque le nisab et l’année sont atteints.")}</p>
        </div>
        <article className={`zakat-status ${totals.eligible ? "ok" : "warning"}`}>
          <span>{totals.eligible ? localized(language, "الزكاة واجبة الآن", "Zakat due maintenant") : totals.reachedNisab ? localized(language, "النصاب موجود، تحقق من الحول", "Nisab atteint, vérifiez l’année") : localized(language, "لم يبلغ النصاب", "Nisab non atteint")}</span>
          <strong>{money(totals.zakatDue)}</strong>
          <small>{localized(language, "تاريخ اليوم الهجري:", "Date hégirienne du jour :")} {hijriToday}</small>
        </article>
      </section>

      <section className="summary-strip zakat-summary">
        <article><span><PackageCheck size={15} /> {localized(language, "قيمة المخزون", "Valeur du stock")}</span><strong>{money(totals.selectedStockValue)}</strong></article>
        <article><span><HandCoins size={15} /> {localized(language, "ديون قابلة للتحصيل", "Créances recouvrables")}</span><strong>{money(totals.collectibleDebt)}</strong></article>
        <article><span><WalletCards size={15} /> {localized(language, "الصندوق المفتوح", "Caisse ouverte")}</span><strong>{money(totals.caisseCash)}</strong></article>
        <article><span><Landmark size={15} /> {localized(language, "وعاء الزكاة", "Assiette de la zakat")}</span><strong>{money(totals.zakatBase)}</strong></article>
        <article><span><CalendarDays size={15} /> {localized(language, "الحول الهجري", "Année hégirienne")}</span><strong>{hijriCycleComplete ? localized(language, "مكتمل", "Complète") : localized(language, "غير مكتمل", "Incomplète")}</strong></article>
        <article><span><Calculator size={15} /> {localized(language, "الزكاة 2.5%", "Zakat 2,5 %")}</span><strong>{money(totals.zakatDue)}</strong></article>
      </section>

      <section className="zakat-grid">
        <div className="panel zakat-form">
          <div className="section-title">
            <h2><Calculator size={18} /> {localized(language, "عناصر الحساب", "Éléments du calcul")}</h2>
            <span />
          </div>

          <div className="zakat-mode-card">
            <span>{localized(language, "تقييم المخزون", "Évaluation du stock")}</span>
            <div className="segmented wide">
              <button type="button" className={stockMode === "sale" ? "active" : ""} onClick={() => setStockMode("sale")}>{localized(language, "بسعر البيع", "Prix de vente")}</button>
              <button type="button" className={stockMode === "purchase" ? "active" : ""} onClick={() => setStockMode("purchase")}>{localized(language, "بسعر الشراء", "Prix d’achat")}</button>
              <button type="button" className={stockMode === "custom" ? "active" : ""} onClick={() => setStockMode("custom")}>{localized(language, "قيمة يدوية", "Valeur manuelle")}</button>
            </div>
            <div className="zakat-reference">
              <b>{localized(language, "شراء:", "Achat :")} {money(totals.purchaseStockValue)}</b>
              <b>{localized(language, "بيع:", "Vente :")} {money(totals.saleStockValue)}</b>
            </div>
          </div>

          {stockMode === "custom" && (
            <TextField label={localized(language, "قيمة المخزون اليدوية", "Valeur manuelle du stock")} type="number" min={0} value={customStockValue} onValueChange={(value) => setCustomStockValue(Number(value))} />
          )}

          <div className="zakat-input-grid">
            <div>
              <TextField label={localized(language, "آخر تاريخ أخرجت فيه الزكاة", "Date du dernier paiement de zakat")} type="date" value={lastZakatDate} onValueChange={setLastZakatDate} />
              <small className="helper-text">
                {nextZakatDate
                  ? `${localized(language, "موعد الزكاة القادم تقريبا:", "Prochaine échéance estimée :")} ${hijriDateLabel(nextZakatDate, language)}`
                  : localized(language, "اتركه فارغا إذا كانت هذه أول مرة تحسب فيها الزكاة.", "Laissez vide si c’est votre premier calcul de zakat.")}
              </small>
            </div>
            <TextField label={localized(language, "أموال إضافية في البنك أو الخزنة", "Autres fonds en banque ou en caisse")} type="number" min={0} value={extraAssets} onValueChange={(value) => setExtraAssets(Number(value))} />
            <TextField label={localized(language, "ديون وفواتير يجب دفعها", "Dettes et factures à payer")} type="number" min={0} value={debtsToPay} onValueChange={(value) => setDebtsToPay(Number(value))} />
            <TextField label={localized(language, "النصاب المعتمد", "Nisab retenu")} type="number" min={0} value={nisab} onValueChange={(value) => setNisab(Number(value))} />
          </div>
        </div>

        <aside className="panel zakat-help">
          <div className="section-title">
            <h2><Scale size={18} /> {localized(language, "طريقة الاستعمال", "Mode d’emploi")}</h2>
            <span />
          </div>
          <ol>
            <li>{localized(language, "أدخل آخر تاريخ أخرجت فيه الزكاة حتى يحسب النظام حول السنة الهجرية.", "Indiquez la date du dernier paiement pour calculer l’année hégirienne.")}</li>
            <li>{localized(language, "اختر تقييم البضاعة بسعر البيع أو الشراء أو أدخل قيمة يدوية.", "Évaluez le stock au prix de vente, d’achat ou saisissez une valeur manuelle.")}</li>
            <li>{localized(language, "أضف الأموال خارج التطبيق مثل البنك أو الخزنة، ثم اطرح الديون الواجبة الدفع.", "Ajoutez les fonds hors application, comme la banque ou la caisse, puis déduisez les dettes à payer.")}</li>
            <li>{localized(language, "أدخل قيمة النصاب المعتمد حسب الذهب أو الفضة التي تعتمدها.", "Saisissez le nisab retenu selon la référence or ou argent choisie.")}</li>
          </ol>
          <p className="helper-text">
            {localized(language, "هذه أداة مساعدة وليست فتوى. راجع إمامك أو مستشارك الشرعي للحالات الخاصة مثل الديون، البضاعة الراكدة، أو الشركاء.", "Cet outil est indicatif et ne constitue pas un avis religieux. Consultez votre imam ou conseiller pour les cas particuliers (dettes, stock dormant ou associés).")}
          </p>
        </aside>
      </section>
    </div>
  );
}
