import { useEffect, useMemo, useState } from "react";
import { ReceiptText, Search } from "lucide-react";
import { api } from "../../shared/api";
import { money, todayInputValue } from "../../shared/format";
import { useText } from "../../shared/i18n";
import { Language, Sale } from "../../shared/types";

export function RevenuePage({ language }: { language: Language }) {
  const t = useText(language);
  const [sales, setSales] = useState<Sale[]>([]);
  const [query, setQuery] = useState("");
  const [saleType, setSaleType] = useState<"all" | "cash" | "credit">("all");
  const [fromDate, setFromDate] = useState(todayInputValue);
  const [toDate, setToDate] = useState(todayInputValue);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  useEffect(() => {
    api.sales().then(setSales).catch(console.error);
  }, []);

  const filteredSales = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sales.filter((sale) => {
      const saleDate = sale.created_at.slice(0, 10);
      const matchesQuery = !normalizedQuery || [
        sale.receipt_no,
        sale.customer_name,
        sale.customer_phone,
        sale.cashier,
        ...sale.items.map((item) => `${item.product_name} ${item.barcode}`)
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
      const matchesType = saleType === "all" || sale.sale_type === saleType;
      const matchesFrom = !fromDate || saleDate >= fromDate;
      const matchesTo = !toDate || saleDate <= toDate;
      return matchesQuery && matchesType && matchesFrom && matchesTo;
    });
  }, [fromDate, query, saleType, sales, toDate]);

  const totals = useMemo(() => ({
    revenue: filteredSales.reduce((sum, sale) => sum + sale.paid_amount, 0),
    remaining: filteredSales.reduce((sum, sale) => sum + sale.remaining_amount, 0),
    profit: filteredSales.reduce((sum, sale) => sum + sale.profit, 0),
    count: filteredSales.length
  }), [filteredSales]);

  function filterToday() {
    const today = todayInputValue();
    setFromDate(today);
    setToDate(today);
  }

  return (
    <section className="panel table-panel full">
      <div className="section-title"><h2>{t.revenue}</h2><span /></div>
      <div className="summary-strip">
        <article><span>{t.dailyRevenue}</span><strong>{money(totals.revenue)}</strong></article>
        <article><span>{t.totalToCollect}</span><strong>{money(totals.remaining)}</strong></article>
        <article><span>{t.dailyProfit}</span><strong>{money(totals.profit)}</strong></article>
        <article><span>{t.salesCount}</span><strong>{totals.count}</strong></article>
      </div>
      <div className="filter-row">
        <div className="searchbar"><Search size={18} /><input placeholder={t.search} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <select aria-label={t.type} value={saleType} onChange={(event) => setSaleType(event.target.value as "all" | "cash" | "credit")}>
          <option value="all">{t.allTypes}</option>
          <option value="cash">{t.cash}</option>
          <option value="credit">{t.credit}</option>
        </select>
        <input className="filter-input" aria-label={t.fromDate} type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        <input className="filter-input" aria-label={t.toDate} type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        <button className="ghost-button compact-button" type="button" onClick={filterToday}>{t.today}</button>
      </div>
      <div className="data-table">
        <table>
          <thead><tr><th>{t.ticket}</th><th>{t.date}</th><th>{t.type}</th><th>{t.collected}</th><th>{t.remaining}</th><th>{t.total}</th><th>{t.items}</th></tr></thead>
          <tbody>
            {filteredSales.map((sale) => (
              <tr key={sale.id}>
                <td>
                  <button className="ticket-link" onClick={() => setSelectedSale(sale)}>
                    <ReceiptText size={15} /> {sale.receipt_no}
                  </button>
                </td>
                <td>{sale.created_at}</td>
                <td><span className={`status-pill ${sale.sale_type === "credit" ? "warning" : "ok"}`}>{sale.sale_type === "credit" ? t.credit : t.cash}</span></td>
                <td>{money(sale.paid_amount)}</td>
                <td>{money(sale.remaining_amount)}</td>
                <td>{money(sale.total)}</td>
                <td>{sale.items.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedSale && <TicketDetails sale={selectedSale} language={language} onClose={() => setSelectedSale(null)} />}
    </section>
  );
}

function TicketDetails({ sale, language, onClose }: { sale: Sale; language: Language; onClose: () => void }) {
  const t = useText(language);

  return (
    <div className="modal-backdrop">
      <section className="receipt-modal ticket-details">
        <div className="section-title">
          <h2><ReceiptText size={18} /> {sale.receipt_no}</h2>
          <button className="ghost-button compact-button" onClick={onClose}>{t.close}</button>
        </div>

        <div className="ticket-meta">
          <span>{t.date}: <strong>{sale.created_at}</strong></span>
          <span>{t.type}: <strong>{sale.sale_type === "credit" ? t.credit : t.cash}</strong></span>
          <span>{t.collected}: <strong>{money(sale.paid_amount)}</strong></span>
          <span>{t.remaining}: <strong>{money(sale.remaining_amount)}</strong></span>
          {sale.customer_name && <span>{t.customer}: <strong>{sale.customer_name}</strong></span>}
          {sale.customer_phone && <span>{t.phone}: <strong>{sale.customer_phone}</strong></span>}
        </div>

        <div className="data-table ticket-items">
          <table>
            <thead>
              <tr><th>{t.product}</th><th>{t.barcode}</th><th>{t.quantity}</th><th>{t.salePrice}</th><th>{t.total}</th></tr>
            </thead>
            <tbody>
              {sale.items.map((item) => (
                <tr key={`${item.product_id}-${item.barcode}`}>
                  <td><strong>{item.product_name}</strong></td>
                  <td>{item.barcode}</td>
                  <td>{item.quantity}</td>
                  <td>{money(item.unit_price)}</td>
                  <td>{money(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ticket-totals">
          <span>{t.subtotal}<strong>{money(sale.subtotal)}</strong></span>
          <span>{t.discount}<strong>{money(sale.discount)}</strong></span>
          <span>{t.total}<strong>{money(sale.total)}</strong></span>
        </div>
      </section>
    </div>
  );
}
