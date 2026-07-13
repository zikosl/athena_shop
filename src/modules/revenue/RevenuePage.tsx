import { useCallback, useEffect, useState } from "react";
import { Edit3, ReceiptText, RotateCcw, Save, Search, Trash2, X } from "lucide-react";
import { api } from "../../shared/api";
import { money, todayInputValue } from "../../shared/format";
import { useText } from "../../shared/i18n";
import { Language, RevenuePageData, Sale } from "../../shared/types";

export function RevenuePage({ language }: { language: Language }) {
  const t = useText(language);
  const [pageData, setPageData] = useState<RevenuePageData | null>(null);
  const [query, setQuery] = useState("");
  const [saleType, setSaleType] = useState<"all" | "cash" | "credit">("all");
  const [fromDate, setFromDate] = useState(todayInputValue);
  const [toDate, setToDate] = useState(todayInputValue);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setError("");
    setLoading(true);
    return api.revenuePage({
      query,
      sale_type: saleType,
      from_date: fromDate,
      to_date: toDate,
      page,
      page_size: pageSize
    })
      .then((data) => {
        setPageData(data);
        if (data.page !== page) setPage(data.page);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [fromDate, page, pageSize, query, saleType, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [fromDate, pageSize, query, saleType, toDate]);

  async function handleSaleChanged(sale?: Sale) {
    await load();
    setSelectedSale(sale ?? null);
  }

  async function handleSaleDeleted() {
    await load();
    setSelectedSale(null);
  }

  const sales = pageData?.sales ?? [];
  const totals = pageData?.totals ?? { revenue: 0, remaining: 0, payments: 0, expenses: 0, profit: 0, count: 0 };
  const totalPages = pageData?.total_pages ?? 1;
  const totalRows = pageData?.total_rows ?? 0;

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
        <article><span>{t.paymentsToday}</span><strong>{money(totals.payments)}</strong></article>
        <article><span>{t.dailyExpenses}</span><strong>{money(totals.expenses)}</strong></article>
        <article><span>{t.dailyProfit}</span><strong>{money(totals.profit)}</strong></article>
        <article><span>{t.salesCount}</span><strong>{totals.count}</strong></article>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="filter-row">
        <div className="searchbar"><Search size={18} /><input placeholder={t.search} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <select aria-label={t.type} value={saleType} onChange={(event) => setSaleType(event.target.value as "all" | "cash" | "credit")}>
          <option value="all">{t.allTypes}</option>
          <option value="cash">{t.cash}</option>
          <option value="credit">{t.credit}</option>
        </select>
        <input className="filter-input" aria-label={t.fromDate} type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        <input className="filter-input" aria-label={t.toDate} type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        <select aria-label="Page size" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
          <option value={10}>10 / page</option>
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </select>
        <button className="ghost-button compact-button" type="button" onClick={filterToday}>{t.today}</button>
      </div>
      <div className="pagination-bar">
        <span>{loading ? "Chargement..." : `${totalRows} bons - page ${page} / ${totalPages}`}</span>
        <div>
          <button className="ghost-button compact-button" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Précédent</button>
          <button className="ghost-button compact-button" type="button" disabled={page >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Suivant</button>
        </div>
      </div>
      <div className="data-table">
        <table>
          <thead><tr><th>{t.ticket}</th><th>{t.date}</th><th>{t.type}</th><th>{t.collected}</th><th>{t.remaining}</th><th>{t.total}</th><th>{t.items}</th></tr></thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id}>
                <td>
                  <button className="ticket-link" onClick={() => setSelectedSale(sale)}>
                    <ReceiptText size={15} /> {sale.receipt_no}
                  </button>
                </td>
                <td>{sale.created_at}</td>
                <td><span className={`status-pill ${sale.sale_type === "credit" ? "warning" : "ok"}`}>{sale.sale_type === "credit" ? t.credit : t.cash}</span></td>
                <td>{money(sale.collected_amount ?? sale.paid_amount)}</td>
                <td>{money(sale.remaining_amount)}</td>
                <td>{money(sale.total)}</td>
                <td>{sale.items.length}</td>
              </tr>
            ))}
            {!sales.length && !loading && (
              <tr><td colSpan={7}><span className="empty-state">Aucun historique pour ces filtres.</span></td></tr>
            )}
          </tbody>
        </table>
      </div>
      {selectedSale && (
        <TicketDetails
          sale={selectedSale}
          language={language}
          onClose={() => setSelectedSale(null)}
          onChanged={handleSaleChanged}
          onDeleted={handleSaleDeleted}
        />
      )}
    </section>
  );
}

function TicketDetails({
  sale,
  language,
  onClose,
  onChanged,
  onDeleted
}: {
  sale: Sale;
  language: Language;
  onClose: () => void;
  onChanged: (sale: Sale) => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const t = useText(language);
  const [editing, setEditing] = useState(false);
  const [quantities, setQuantities] = useState<Record<number, number>>(
    Object.fromEntries(sale.items.map((item) => [item.product_id, item.quantity]))
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function resetEdit() {
    setEditing(false);
    setError("");
    setQuantities(Object.fromEntries(sale.items.map((item) => [item.product_id, item.quantity])));
  }

  async function saveEdit() {
    setError("");
    setSaving(true);
    try {
      const updated = await api.updateSale({
        sale_id: sale.id,
        items: sale.items.map((item) => ({
          product_id: item.product_id,
          quantity: quantities[item.product_id] ?? item.quantity
        }))
      });
      setEditing(false);
      await onChanged(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function returnOne(productId: number) {
    setError("");
    setSaving(true);
    try {
      const updated = await api.returnSaleItem({
        sale_id: sale.id,
        product_id: productId,
        quantity: 1
      });
      await onChanged(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteTicket() {
    setError("");
    if (!window.confirm(t.confirmDeleteTicket)) return;
    setSaving(true);
    try {
      await api.deleteSale(sale.id);
      await onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="receipt-modal ticket-details">
        <div className="section-title">
          <h2><ReceiptText size={18} /> {sale.receipt_no}</h2>
          <div className="button-row">
            {editing ? (
              <>
                <button className="gold-button compact-button" type="button" disabled={saving} onClick={() => void saveEdit()}><Save size={16} /> {saving ? t.saving : t.save}</button>
                <button className="ghost-button compact-button" type="button" disabled={saving} onClick={resetEdit}><X size={16} /> {t.close}</button>
              </>
            ) : (
              <>
                <button className="ghost-button compact-button" type="button" disabled={saving} onClick={() => setEditing(true)}><Edit3 size={16} /> {t.edit}</button>
                <button className="ghost-button compact-button danger-action" type="button" disabled={saving} onClick={() => void deleteTicket()}><Trash2 size={16} /> {t.delete}</button>
                <button className="ghost-button compact-button" type="button" disabled={saving} onClick={onClose}>{t.close}</button>
              </>
            )}
          </div>
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
              <tr><th>{t.product}</th><th>{t.barcode}</th><th>{t.quantity}</th><th>{t.salePrice}</th><th>{t.total}</th><th></th></tr>
            </thead>
            <tbody>
              {sale.items.map((item) => (
                <tr key={`${item.product_id}-${item.barcode}`}>
                  <td><strong>{item.product_name}</strong></td>
                  <td>{item.barcode}</td>
                  <td>
                    {editing ? (
                      <input
                        className="quantity-input"
                        type="number"
                        min={1}
                        value={quantities[item.product_id] ?? item.quantity}
                        onChange={(event) => setQuantities({
                          ...quantities,
                          [item.product_id]: Math.max(1, Number(event.target.value))
                        })}
                      />
                    ) : item.quantity}
                  </td>
                  <td>{money(item.unit_price)}</td>
                  <td>{money(item.line_total)}</td>
                  <td className="row-actions">
                    <button type="button" title="Retour" onClick={() => void returnOne(item.product_id)} disabled={editing || saving}>
                      <RotateCcw size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && <p className="error">{error}</p>}

        <div className="ticket-totals">
          <span>{t.subtotal}<strong>{money(sale.subtotal)}</strong></span>
          <span>{t.discount}<strong>{money(sale.discount)}</strong></span>
          <span>{t.total}<strong>{money(sale.total)}</strong></span>
        </div>
      </section>
    </div>
  );
}
