import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownCircle, CalendarDays, ChartColumnIncreasing, HandCoins, PackageSearch, ReceiptText, ShoppingCart, Truck, Wallet } from "lucide-react";
import { api } from "../../shared/api";
import { dateInputValue, money, todayInputValue } from "../../shared/format";
import { showErrorToast } from "../../shared/toast";
import { localized, useText } from "../../shared/i18n";
import { Language, ReportBucket, ReportData, ReportPeriod } from "../../shared/types";
import { SelectControl } from "../../shared/ui";

type Preset = "daily" | "weekly" | "monthly" | "custom";

export function ReportsPage({ language }: { language: Language }) {
  const t = useText(language);
  const [preset, setPreset] = useState<Preset>("daily");
  const [period, setPeriod] = useState<ReportPeriod>("daily");
  const [fromDate, setFromDate] = useState(todayInputValue);
  const [toDate, setToDate] = useState(todayInputValue);
  const [report, setReport] = useState<ReportData | null>(null);

  useEffect(() => {
    if (preset === "custom") return;
    const today = new Date();
    const from = new Date(today);
    if (preset === "weekly") from.setDate(today.getDate() - 6);
    if (preset === "monthly") from.setMonth(today.getMonth(), 1);
    setPeriod(preset);
    setFromDate(dateInputValue(from));
    setToDate(dateInputValue(today));
  }, [preset]);

  useEffect(() => {
    api.report({ period, from_date: fromDate, to_date: toDate })
      .then(setReport)
      .catch((err) => showErrorToast(err, localized(language, "تعذر تحميل التقرير", "Impossible de charger le rapport")));
  }, [fromDate, language, period, toDate]);

  const health = useMemo(() => {
    const summary = report?.summary;
    if (!summary) return { label: localized(language, "جاري التحميل", "Chargement"), tone: "warning", text: localized(language, "قراءة الأرقام...", "Analyse des chiffres...") };
    if (summary.entry <= 0) {
      return { label: localized(language, "لا توجد مداخيل", "Aucune recette"), tone: "warning", text: localized(language, "لا توجد مبيعات أو دفعات في هذه الفترة.", "Aucune vente ou paiement sur cette période.") };
    }
    if (summary.profit < 0) {
      return { label: localized(language, "خسارة", "Perte"), tone: "danger", text: localized(language, "المصاريف أكبر من الفائدة المحققة.", "Les dépenses dépassent le bénéfice réalisé.") };
    }
    if (summary.sortie / summary.entry > 0.6) {
      return { label: localized(language, "يحتاج متابعة", "À surveiller"), tone: "warning", text: localized(language, "المصاريف تأخذ جزءا كبيرا من المداخيل.", "Les dépenses représentent une part importante des recettes.") };
    }
    return { label: localized(language, "فترة جيدة", "Bonne période"), tone: "ok", text: localized(language, "المداخيل تغطي المصاريف.", "Les recettes couvrent les dépenses.") };
  }, [language, report]);

  const summary = report?.summary;

  function setCustomDate(kind: "from" | "to", value: string) {
    setPreset("custom");
    if (kind === "from") setFromDate(value);
    else setToDate(value);
  }

  return (
    <section className="reports-page">
      <section className="panel report-hero">
        <div>
          <div className="section-title">
            <h2><ReceiptText size={18} /> {localized(language, "التقارير", "Rapports")}</h2>
            <span />
          </div>
          <h3>{localized(language, "فهم أموال المتجر", "Comprendre les finances du magasin")}</h3>
          <p>{localized(language, "الشراء = تكلفة السلع المباعة. البيع = مجموع التذاكر. الفائدة = البيع - الشراء - المصاريف.", "Achats = coût des articles vendus. Ventes = total des tickets. Bénéfice = ventes - achats - dépenses.")}</p>
        </div>
        <article className={`report-health ${health.tone}`}>
          <strong>{health.label}</strong>
          <span>{health.text}</span>
        </article>
      </section>

      <section className="panel report-filters">
        <div className="segmented report-presets">
          <button className={preset === "daily" ? "active" : ""} type="button" onClick={() => setPreset("daily")}>{localized(language, "يوم", "Jour")}</button>
          <button className={preset === "weekly" ? "active" : ""} type="button" onClick={() => setPreset("weekly")}>{localized(language, "أسبوع", "Semaine")}</button>
          <button className={preset === "monthly" ? "active" : ""} type="button" onClick={() => setPreset("monthly")}>{localized(language, "شهر", "Mois")}</button>
          <button className={preset === "custom" ? "active" : ""} type="button" onClick={() => setPreset("custom")}>{localized(language, "مخصص", "Personnalisé")}</button>
        </div>
        <SelectControl aria-label={localized(language, "نوع الرسم", "Type de graphique")} value={period} onValueChange={(value) => {
          setPreset("custom");
          setPeriod(value as ReportPeriod);
        }} options={[{ value: "daily", label: localized(language, "رسم يومي", "Graphique journalier") }, { value: "weekly", label: localized(language, "رسم أسبوعي", "Graphique hebdomadaire") }, { value: "monthly", label: localized(language, "رسم شهري", "Graphique mensuel") }]} />
        <label><span>{localized(language, "من", "Du")}</span><input className="filter-input" type="date" value={fromDate} onChange={(event) => setCustomDate("from", event.target.value)} /></label>
        <label><span>{localized(language, "إلى", "Au")}</span><input className="filter-input" type="date" value={toDate} onChange={(event) => setCustomDate("to", event.target.value)} /></label>
      </section>

      <section className="stats-grid report-stat-grid business-stat-grid">
        <ReportCard icon={PackageSearch} label={localized(language, "الشراء", "Achats")} value={money(summary?.buying_total ?? 0)} helper={localized(language, "تكلفة السلع المباعة", "Coût des articles vendus")} tone="danger" />
        <ReportCard icon={ShoppingCart} label={localized(language, "البيع", "Ventes")} value={money(summary?.selling_total ?? 0)} helper={localized(language, "مجموع التذاكر", "Total des tickets")} tone="success" />
        <ReportCard icon={ArrowDownCircle} label={t.expenses} value={money(summary?.sortie ?? 0)} helper={localized(language, "مصاريف المتجر", "Dépenses du magasin")} tone="danger" />
        <ReportCard icon={ChartColumnIncreasing} label={localized(language, "الفائدة", "Bénéfice")} value={money(summary?.gain_total ?? 0)} helper={localized(language, "البيع - الشراء - المصاريف", "Ventes - achats - dépenses")} tone={(summary?.gain_total ?? 0) < 0 ? "danger" : "success"} />
        <ReportCard icon={ReceiptText} label={localized(language, "المبيعات", "Ventes")} value={String(summary?.sales_count ?? 0)} helper={`${localized(language, "متوسط التذكرة", "Ticket moyen")} ${money(summary?.average_ticket ?? 0)}`} />
        <ReportCard icon={HandCoins} label={localized(language, "الدين المسترجع", "Crédits encaissés")} value={money(summary?.credit_collected ?? 0)} helper={`${t.remaining} ${money(summary?.credit_remaining ?? 0)}`} />
        <ReportCard icon={Truck} label={t.delivery} value={money(summary?.delivery_pending_total ?? 0)} helper={`${summary?.delivery_pending_count ?? 0} ${localized(language, "في الانتظار · محصل", "en attente · encaissé")} ${money(summary?.delivery_collected ?? 0)}`} />
        <ReportCard icon={PackageSearch} label={localized(language, "قيمة المخزون", "Valeur du stock")} value={money(summary?.stock_sale_value ?? 0)} helper={`${localized(language, "شراء", "Achat")} ${money(summary?.stock_purchase_value ?? 0)}`} />
      </section>

      <section className="report-grid">
        <article className="panel report-chart-panel">
          <div className="section-title"><h2><Activity size={18} /> {localized(language, "البيع / المصاريف / الفائدة", "Ventes / dépenses / bénéfice")}</h2><span /></div>
          <LineChart buckets={report?.buckets ?? []} language={language} />
        </article>

        <article className="panel advice-panel">
          <div className="section-title"><h2><CalendarDays size={18} /> {localized(language, "قراءة سريعة", "En bref")}</h2><span /></div>
          <div className="advice-list">
            {(report?.advice ?? []).map((item) => <p key={item}>{reportAdvice(item, language)}</p>)}
          </div>
          <div className="report-legend">
            <span><b className="entry-dot" /> {localized(language, "البيع", "Ventes")}</span>
            <span><b className="sortie-dot" /> {t.expenses}</span>
            <span><b className="profit-dot" /> {localized(language, "الفائدة", "Bénéfice")}</span>
          </div>
        </article>
      </section>

      <section className="panel table-panel">
        <div className="section-title"><h2><Wallet size={18} /> {localized(language, "التفاصيل حسب الفترة", "Détails par période")}</h2><span /></div>
        <div className="data-table report-table">
          <table>
            <thead><tr><th>{localized(language, "الفترة", "Période")}</th><th>{localized(language, "الشراء", "Achats")}</th><th>{localized(language, "البيع", "Ventes")}</th><th>{t.expenses}</th><th>{localized(language, "الفائدة", "Bénéfice")}</th><th>{t.ticket}</th></tr></thead>
            <tbody>
              {(report?.buckets ?? []).map((bucket) => (
                <tr key={`${bucket.start_date}-row`}>
                  <td><strong>{bucket.label}</strong><span>{bucket.start_date} - {bucket.end_date}</span></td>
                  <td>{money(bucket.buying)}</td>
                  <td>{money(bucket.selling)}</td>
                  <td>{money(bucket.sortie)}</td>
                  <td className={bucket.gain < 0 ? "danger" : "success"}>{money(bucket.gain)}</td>
                  <td>{bucket.sales_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="section-title"><h2><PackageSearch size={18} /> {localized(language, "أكثر المنتجات مبيعا", "Meilleures ventes")}</h2><span /></div>
        <div className="top-products">
          {(report?.top_products ?? []).map((item, index) => (
            <article key={item.name}>
              <b>{index + 1}</b>
              <span><strong>{item.name}</strong><small>{item.quantity} {localized(language, "قطعة", "articles")}</small></span>
              <em>{money(item.total)}</em>
            </article>
          ))}
          {!report?.top_products.length && <p className="empty-state">{localized(language, "لا يوجد منتج مباع في هذا الفلتر.", "Aucun produit vendu avec ces filtres.")}</p>}
        </div>
      </section>
    </section>
  );
}

function ReportCard({
  icon: Icon,
  label,
  value,
  helper,
  tone
}: {
  icon: typeof ChartColumnIncreasing;
  label: string;
  value: string;
  helper: string;
  tone?: "success" | "danger";
}) {
  return (
    <article className="stat-card report-stat-card">
      <div className="stat-icon"><Icon size={23} /></div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <em className={tone}>{helper}</em>
      </div>
    </article>
  );
}

function reportAdvice(item: string, language: Language) {
  const translations: Record<string, string> = {
    "لا توجد مبيعات في هذه الفترة. تحقق من التذاكر أو اختر تاريخا آخر.": "Aucune vente sur cette période. Vérifiez les tickets ou choisissez d’autres dates.",
    "تنبيه: الفائدة سالبة. راجع المصاريف وأسعار الشراء وأسعار البيع.": "Attention : le bénéfice est négatif. Vérifiez les dépenses et les prix d’achat et de vente.",
    "الفترة إيجابية: المبيعات تغطي الشراء والمصاريف.": "Période positive : les ventes couvrent les achats et les dépenses.",
    "تكلفة الشراء مرتفعة مقارنة بالمبيعات. راجع أسعار الشراء والهامش.": "Le coût d’achat est élevé par rapport aux ventes. Vérifiez les prix d’achat et les marges.",
    "المصاريف مرتفعة مقارنة بالمداخيل. راجع تفاصيل المصاريف.": "Les dépenses sont élevées par rapport aux recettes. Consultez leur détail.",
    "يوجد دين متبق يجب تحصيله. دفعات الزبائن تحسن الصندوق.": "Des crédits restent à encaisser. Les paiements clients améliorent la caisse.",
    "لم يتم العثور على مبيعات في هذا الفلتر.": "Aucune vente ne correspond à ces filtres."
  };
  return language === "ar" ? item : translations[item] ?? item;
}

function LineChart({ buckets, language }: { buckets: ReportBucket[]; language: Language }) {
  if (!buckets.length) return <p className="empty-state">{localized(language, "لا توجد بيانات لهذا الفلتر.", "Aucune donnée pour ces filtres.")}</p>;

  const width = 720;
  const height = 260;
  const padding = { top: 18, right: 22, bottom: 42, left: 44 };
  const values = buckets.flatMap((bucket) => [bucket.selling, bucket.sortie, bucket.gain]);
  const maxValue = Math.max(1, ...values);
  const minValue = Math.min(0, ...values);
  const valueRange = Math.max(1, maxValue - minValue);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xFor = (index: number) => padding.left + (buckets.length === 1 ? plotWidth / 2 : (index / (buckets.length - 1)) * plotWidth);
  const yFor = (value: number) => padding.top + ((maxValue - value) / valueRange) * plotHeight;
  const zeroY = yFor(0);

  const series = [
    { key: "entry", className: "entry-line", values: buckets.map((bucket) => bucket.selling) },
    { key: "sortie", className: "sortie-line", values: buckets.map((bucket) => bucket.sortie) },
    { key: "profit", className: "profit-line", values: buckets.map((bucket) => bucket.gain) }
  ];

  return (
    <div className="line-chart-wrap">
      <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={localized(language, "منحنى البيع والمصاريف والفائدة", "Courbe des ventes, dépenses et bénéfices")}>
        <line className="chart-grid-line" x1={padding.left} x2={width - padding.right} y1={padding.top} y2={padding.top} />
        <line className="chart-grid-line" x1={padding.left} x2={width - padding.right} y1={padding.top + plotHeight / 2} y2={padding.top + plotHeight / 2} />
        <line className="chart-zero-line" x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} />
        <text className="chart-scale" x={8} y={padding.top + 4}>{shortMoney(maxValue)}</text>
        <text className="chart-scale" x={8} y={zeroY + 4}>0</text>
        {minValue < 0 && <text className="chart-scale" x={8} y={height - padding.bottom}>{shortMoney(minValue)}</text>}
        {series.map((item) => (
          <g key={item.key}>
            <path className={`chart-line ${item.className}`} d={smoothPath(item.values.map((value, index) => [xFor(index), yFor(value)]))} />
            {item.values.map((value, index) => (
              <circle className={`chart-point ${item.className}`} key={`${item.key}-${buckets[index].start_date}`} cx={xFor(index)} cy={yFor(value)} r="4">
                <title>{`${buckets[index].label} - ${money(value)}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {buckets.map((bucket, index) => (
          <text className="chart-label" key={bucket.start_date} x={xFor(index)} y={height - 14}>{bucket.label}</text>
        ))}
      </svg>
    </div>
  );
}

function smoothPath(points: number[][]) {
  if (!points.length) return "";
  if (points.length === 1) {
    const [x, y] = points[0];
    return `M ${x - 8} ${y} L ${x + 8} ${y}`;
  }
  return points.reduce((path, point, index) => {
    const [x, y] = point;
    if (index === 0) return `M ${x} ${y}`;
    const [prevX, prevY] = points[index - 1];
    const midX = (prevX + x) / 2;
    return `${path} Q ${prevX} ${prevY} ${midX} ${(prevY + y) / 2} T ${x} ${y}`;
  }, "");
}

function shortMoney(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}
