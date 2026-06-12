import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownCircle, CalendarDays, ChartColumnIncreasing, HandCoins, PackageSearch, ReceiptText, ShoppingCart, Wallet } from "lucide-react";
import { api } from "../../shared/api";
import { money, todayInputValue } from "../../shared/format";
import { Language, ReportBucket, ReportData, ReportPeriod } from "../../shared/types";

type Preset = "daily" | "weekly" | "monthly" | "custom";

export function ReportsPage({ language }: { language: Language }) {
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
    if (!summary) return { label: "Chargement", tone: "warning", text: "Lecture des chiffres..." };
    if (summary.entry <= 0) {
      return { label: "Aucune entree", tone: "warning", text: "Aucune vente ou versement dans cette periode." };
    }
    if (summary.profit < 0) {
      return { label: "Perte", tone: "danger", text: "Les sorties sont plus fortes que le benefice realise." };
    }
    if (summary.sortie / summary.entry > 0.6) {
      return { label: "A surveiller", tone: "warning", text: "Les depenses prennent une grande partie des entrees." };
    }
    return { label: "Bonne periode", tone: "ok", text: "Les entrees couvrent les sorties." };
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
            <h2><ReceiptText size={18} /> Rapports</h2>
            <span />
          </div>
          <h3>Comprendre l'argent du magasin</h3>
          <p>Achat = cout vendu. Vente = chiffre vendu. Benefice = vente - achat - depenses.</p>
        </div>
        <article className={`report-health ${health.tone}`}>
          <strong>{health.label}</strong>
          <span>{health.text}</span>
        </article>
      </section>

      <section className="panel report-filters">
        <div className="segmented report-presets">
          <button className={preset === "daily" ? "active" : ""} type="button" onClick={() => setPreset("daily")}>Jour</button>
          <button className={preset === "weekly" ? "active" : ""} type="button" onClick={() => setPreset("weekly")}>Semaine</button>
          <button className={preset === "monthly" ? "active" : ""} type="button" onClick={() => setPreset("monthly")}>Mois</button>
          <button className={preset === "custom" ? "active" : ""} type="button" onClick={() => setPreset("custom")}>Custom</button>
        </div>
        <select aria-label="Graph" value={period} onChange={(event) => {
          setPreset("custom");
          setPeriod(event.target.value as ReportPeriod);
        }}>
          <option value="daily">Graph daily</option>
          <option value="weekly">Graph weekly</option>
          <option value="monthly">Graph monthly</option>
        </select>
        <label><span>De</span><input className="filter-input" type="date" value={fromDate} onChange={(event) => setCustomDate("from", event.target.value)} /></label>
        <label><span>A</span><input className="filter-input" type="date" value={toDate} onChange={(event) => setCustomDate("to", event.target.value)} /></label>
      </section>

      {error && <p className="error">{error}</p>}

      <section className="stats-grid report-stat-grid business-stat-grid">
        <ReportCard icon={PackageSearch} label="Achat" value={money(summary?.buying_total ?? 0)} helper="Cout des articles vendus" tone="danger" />
        <ReportCard icon={ShoppingCart} label="Vente" value={money(summary?.selling_total ?? 0)} helper="Total des bons" tone="success" />
        <ReportCard icon={ArrowDownCircle} label="Depenses" value={money(summary?.sortie ?? 0)} helper="Charges payees" tone="danger" />
        <ReportCard icon={ChartColumnIncreasing} label="Benefice" value={money(summary?.gain_total ?? 0)} helper="Vente - achat - depenses" tone={(summary?.gain_total ?? 0) < 0 ? "danger" : "success"} />
        <ReportCard icon={ReceiptText} label="Ventes" value={String(summary?.sales_count ?? 0)} helper={`Ticket moyen ${money(summary?.average_ticket ?? 0)}`} />
        <ReportCard icon={HandCoins} label="Credit recupere" value={money(summary?.credit_collected ?? 0)} helper={`Reste ${money(summary?.credit_remaining ?? 0)}`} />
        <ReportCard icon={PackageSearch} label="Valeur stock" value={money(summary?.stock_sale_value ?? 0)} helper={`Achat ${money(summary?.stock_purchase_value ?? 0)}`} />
      </section>

      <section className="report-grid">
        <article className="panel report-chart-panel">
          <div className="section-title"><h2><Activity size={18} /> Vente / Depenses / Benefice</h2><span /></div>
          <LineChart buckets={report?.buckets ?? []} />
        </article>

        <article className="panel advice-panel">
          <div className="section-title"><h2><CalendarDays size={18} /> Lecture rapide</h2><span /></div>
          <div className="advice-list">
            {(report?.advice ?? []).map((item) => <p key={item}>{item}</p>)}
          </div>
          <div className="report-legend">
            <span><b className="entry-dot" /> Vente</span>
            <span><b className="sortie-dot" /> Depenses</span>
            <span><b className="profit-dot" /> Benefice</span>
          </div>
        </article>
      </section>

      <section className="panel table-panel">
        <div className="section-title"><h2><Wallet size={18} /> Detail par periode</h2><span /></div>
        <div className="data-table report-table">
          <table>
            <thead><tr><th>Periode</th><th>Achat</th><th>Vente</th><th>Depenses</th><th>Benefice</th><th>Bons</th></tr></thead>
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
        <div className="section-title"><h2><PackageSearch size={18} /> Produits qui vendent le plus</h2><span /></div>
        <div className="top-products">
          {(report?.top_products ?? []).map((item, index) => (
            <article key={item.name}>
              <b>{index + 1}</b>
              <span><strong>{item.name}</strong><small>{item.quantity} pieces</small></span>
              <em>{money(item.total)}</em>
            </article>
          ))}
          {!report?.top_products.length && <p className="empty-state">Aucun produit vendu dans ce filtre.</p>}
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
  if (!buckets.length) return <p className="empty-state">Aucune donnee pour ce filtre.</p>;

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
      <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Courbe des ventes, depenses et benefices">
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
