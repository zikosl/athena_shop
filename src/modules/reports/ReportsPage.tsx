import { useEffect, useMemo, useState } from "react";
import { Pulse as Activity, ArrowCircleDown as ArrowDownCircle, CalendarDots as CalendarDays, ChartBar as ChartColumnIncreasing, HandCoins, Package as PackageSearch, Receipt as ReceiptText, ShoppingCart, Truck, Wallet } from "@phosphor-icons/react";
import { api } from "../../shared/api";
import { money, todayInputValue } from "../../shared/format";
import { Language, ReportBucket, ReportData, ReportPeriod } from "../../shared/types";

type Preset = "daily" | "weekly" | "monthly" | "custom";

export function ReportsPage({ language: _language }: { language: Language }) {
  const [preset, setPreset] = useState<Preset>("daily");
  const [period, setPeriod] = useState<ReportPeriod>("daily");
  const [fromDate, setFromDate] = useState(todayInputValue);
  const [toDate, setToDate] = useState(todayInputValue);
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (preset === "custom") return;
    const today = new Date();
    const from = new Date(today);
    if (preset === "weekly") from.setDate(today.getDate() - 6);
    if (preset === "monthly") from.setMonth(today.getMonth(), 1);
    setPeriod(preset);
    setFromDate(inputDate(from));
    setToDate(inputDate(today));
  }, [preset]);

  useEffect(() => {
    setError("");
    api.report({ period, from_date: fromDate, to_date: toDate })
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [fromDate, period, toDate]);

  const health = useMemo(() => {
    const summary = report?.summary;
    if (!summary) return { label: "جاري التحميل", tone: "warning", text: "قراءة الأرقام..." };
    if (summary.entry <= 0) {
      return { label: "لا توجد مداخيل", tone: "warning", text: "لا توجد مبيعات أو دفعات في هذه الفترة." };
    }
    if (summary.profit < 0) {
      return { label: "خسارة", tone: "danger", text: "المصاريف أكبر من الفائدة المحققة." };
    }
    if (summary.sortie / summary.entry > 0.6) {
      return { label: "يحتاج متابعة", tone: "warning", text: "المصاريف تأخذ جزءا كبيرا من المداخيل." };
    }
    return { label: "فترة جيدة", tone: "ok", text: "المداخيل تغطي المصاريف." };
  }, [report]);

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
            <h2><ReceiptText size={18} /> التقارير</h2>
            <span />
          </div>
          <h3>فهم أموال المتجر</h3>
          <p>الشراء = تكلفة السلع المباعة. البيع = مجموع التذاكر. الفائدة = البيع - الشراء - المصاريف.</p>
        </div>
        <article className={`report-health ${health.tone}`}>
          <strong>{health.label}</strong>
          <span>{health.text}</span>
        </article>
      </section>

      <section className="panel report-filters">
        <div className="segmented report-presets">
          <button className={preset === "daily" ? "active" : ""} type="button" onClick={() => setPreset("daily")}>يوم</button>
          <button className={preset === "weekly" ? "active" : ""} type="button" onClick={() => setPreset("weekly")}>أسبوع</button>
          <button className={preset === "monthly" ? "active" : ""} type="button" onClick={() => setPreset("monthly")}>شهر</button>
          <button className={preset === "custom" ? "active" : ""} type="button" onClick={() => setPreset("custom")}>مخصص</button>
        </div>
        <select aria-label="نوع الرسم" value={period} onChange={(event) => {
          setPreset("custom");
          setPeriod(event.target.value as ReportPeriod);
        }}>
          <option value="daily">رسم يومي</option>
          <option value="weekly">رسم أسبوعي</option>
          <option value="monthly">رسم شهري</option>
        </select>
        <label><span>من</span><input className="filter-input" type="date" value={fromDate} onChange={(event) => setCustomDate("from", event.target.value)} /></label>
        <label><span>إلى</span><input className="filter-input" type="date" value={toDate} onChange={(event) => setCustomDate("to", event.target.value)} /></label>
      </section>

      {error && <p className="error">{error}</p>}

      <section className="stats-grid report-stat-grid business-stat-grid">
        <ReportCard icon={PackageSearch} label="الشراء" value={money(summary?.buying_total ?? 0)} helper="تكلفة السلع المباعة" tone="danger" />
        <ReportCard icon={ShoppingCart} label="البيع" value={money(summary?.selling_total ?? 0)} helper="مجموع التذاكر" tone="success" />
        <ReportCard icon={ArrowDownCircle} label="المصاريف" value={money(summary?.sortie ?? 0)} helper="مصاريف المتجر" tone="danger" />
        <ReportCard icon={Wallet} label="الموردون" value={money(summary?.supplier_payments ?? 0)} helper={`مدفوع فعليا · شراء ${money(summary?.supplier_purchases ?? 0)} · دين ${money(summary?.supplier_remaining ?? 0)}`} tone="danger" />
        <ReportCard icon={ChartColumnIncreasing} label="الفائدة" value={money(summary?.gain_total ?? 0)} helper="البيع - الشراء - المصاريف" tone={(summary?.gain_total ?? 0) < 0 ? "danger" : "success"} />
        <ReportCard icon={ReceiptText} label="المبيعات" value={String(summary?.sales_count ?? 0)} helper={`متوسط التذكرة ${money(summary?.average_ticket ?? 0)}`} />
        <ReportCard icon={HandCoins} label="الدين المسترجع" value={money(summary?.credit_collected ?? 0)} helper={`المتبقي ${money(summary?.credit_remaining ?? 0)}`} />
        <ReportCard icon={Truck} label="التوصيل" value={money(summary?.delivery_pending_total ?? 0)} helper={`${summary?.delivery_pending_count ?? 0} في الانتظار · محصل ${money(summary?.delivery_collected ?? 0)}`} />
        <ReportCard icon={PackageSearch} label="قيمة المخزون" value={money(summary?.stock_sale_value ?? 0)} helper={`شراء ${money(summary?.stock_purchase_value ?? 0)}`} />
      </section>

      <section className="report-grid">
        <article className="panel report-chart-panel">
          <div className="section-title"><h2><Activity size={18} /> البيع / المصاريف / الفائدة</h2><span /></div>
          <LineChart buckets={report?.buckets ?? []} />
        </article>

        <article className="panel advice-panel">
          <div className="section-title"><h2><CalendarDays size={18} /> قراءة سريعة</h2><span /></div>
          <div className="advice-list">
            {(report?.advice ?? []).map((item) => <p key={item}>{item}</p>)}
          </div>
          <div className="report-legend">
            <span><b className="entry-dot" /> البيع</span>
            <span><b className="sortie-dot" /> المصاريف</span>
            <span><b className="profit-dot" /> الفائدة</span>
          </div>
        </article>
      </section>

      <section className="panel table-panel">
        <div className="section-title"><h2><Wallet size={18} /> التفاصيل حسب الفترة</h2><span /></div>
        <div className="data-table report-table">
          <table>
            <thead><tr><th>الفترة</th><th>الشراء</th><th>البيع</th><th>المصاريف</th><th>الفائدة</th><th>التذاكر</th></tr></thead>
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
        <div className="section-title"><h2><PackageSearch size={18} /> أكثر المنتجات مبيعا</h2><span /></div>
        <div className="top-products">
          {(report?.top_products ?? []).map((item, index) => (
            <article key={item.name}>
              <b>{index + 1}</b>
              <span><strong>{item.name}</strong><small>{item.quantity} قطعة</small></span>
              <em>{money(item.total)}</em>
            </article>
          ))}
          {!report?.top_products.length && <p className="empty-state">لا يوجد منتج مباع في هذا الفلتر.</p>}
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

function inputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function LineChart({ buckets }: { buckets: ReportBucket[] }) {
  if (!buckets.length) return <p className="empty-state">لا توجد بيانات لهذا الفلتر.</p>;

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
      <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="منحنى البيع والمصاريف والفائدة">
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
