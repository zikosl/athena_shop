import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit3, ReceiptText, RotateCcw, Save, Search, Trash2, X } from "lucide-react";
import { api } from "../../shared/api";
import { money, todayInputValue } from "../../shared/format";
import { useText } from "../../shared/i18n";
import { CreditAccount, Expense, Language, Sale } from "../../shared/types";

export function RevenuePage({ language }: { language: Language }) {
  const t = useText(language);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [credits, setCredits] = useState<CreditAccount[]>([]);
  const [query, setQuery] = useState("");
  const [saleType, setSaleType] = useState<"all" | "cash" | "credit">("all");
  const [fromDate, setFromDate] = useState(todayInputValue);
  const [toDate, setToDate] = useState(todayInputValue);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    return Promise.all([api.sales(), api.expenses(), api.credits()])
      .then(([sales, expenses, credits]) => {
        setSales(sales);
        setExpenses(expenses);
        setCredits(credits);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSaleChanged(sale?: Sale) {
    await load();
    setSelectedSale(sale ?? null);
  }

  async function handleSaleDeleted() {
    await load();
    setSelectedSale(null);
  }

  const creditPaymentsBySale = useMemo(() => {
    return Object.fromEntries(credits.map((credit) => [
      credit.sale.id,
      credit.payments.reduce((sum, payment) => sum + payment.amount, 0)
    ]));
  }, [credits]);

  const creditPayments = useMemo(() => credits.flatMap((credit) =>
    credit.payments.map((payment) => ({ ...payment, sale: credit.sale }))
  ), [credits]);

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

  const filteredExpenses = useMemo(() => expenses.filter((expense) => {
    const matchesFrom = !fromDate || expense.expense_date >= fromDate;
    const matchesTo = !toDate || expense.expense_date <= toDate;
    return matchesFrom && matchesTo;
  }), [expenses, fromDate, toDate]);

  const filteredCreditPayments = useMemo(() => creditPayments.filter((payment) => {
    const paymentDate = payment.paid_at.slice(0, 10);
    const matchesFrom = !fromDate || paymentDate >= fromDate;
    const matchesTo = !toDate || paymentDate <= toDate;
    return saleType !== "cash" && matchesFrom && matchesTo;
  }), [creditPayments, fromDate, saleType, toDate]);

  const totals = useMemo(() => {
    const saleRevenue = filteredSales.reduce((sum, sale) => {
      if (sale.sale_type === "cash") return sum + sale.total;
      const laterPayments = creditPaymentsBySale[sale.id] ?? 0;
      return sum + Math.max(0, sale.paid_amount - laterPayments);
    }, 0);
    const creditPaymentTotal = filteredCreditPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const expenseTotal = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const saleProfit = filteredSales.reduce((sum, sale) => {
      const collected = sale.sale_type === "cash"
        ? sale.total
        : Math.max(0, sale.paid_amount - (creditPaymentsBySale[sale.id] ?? 0));
      return sum + realizedProfit(sale, collected);
    }, 0);
    const creditPaymentProfit = filteredCreditPayments.reduce(
      (sum, payment) => sum + realizedProfit(payment.sale, payment.amount),
      0
    );
    return {
      revenue: saleRevenue + creditPaymentTotal,
      remaining: filteredSales.reduce((sum, sale) => sum + sale.remaining_amount, 0),
      expenses: expenseTotal,
      payments: creditPaymentTotal,
      profit: saleProfit + creditPaymentProfit - expenseTotal,
      count: filteredSales.length
    };
  }, [creditPaymentsBySale, filteredCreditPayments, filteredExpenses, filteredSales]);

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

function realizedProfit(sale: Sale, collected: number) {
  if (sale.total <= 0 || collected <= 0) return 0;
  return sale.profit * Math.min(collected / sale.total, 1);
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

  function resetEdit() {
    setEditing(false);
    setError("");
    setQuantities(Object.fromEntries(sale.items.map((item) => [item.product_id, item.quantity])));
  }

  async function saveEdit() {
    setError("");
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
    }
  }

  async function returnOne(productId: number) {
    setError("");
    try {
      const updated = await api.returnSaleItem({
        sale_id: sale.id,
        product_id: productId,
        quantity: 1
      });
      await onChanged(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function deleteTicket() {
    setError("");
    if (!window.confirm("Supprimer ce bon ? Le stock sera restaure et la recette diminuera.")) return;
    try {
      await api.deleteSale(sale.id);
      await onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
                <button className="gold-button compact-button" type="button" onClick={() => void saveEdit()}><Save size={16} /> {t.save}</button>
                <button className="ghost-button compact-button" type="button" onClick={resetEdit}><X size={16} /> {t.close}</button>
              </>
            ) : (
              <>
                <button className="ghost-button compact-button" type="button" onClick={() => setEditing(true)}><Edit3 size={16} /> Modifier</button>
                <button className="ghost-button compact-button danger-action" type="button" onClick={() => void deleteTicket()}><Trash2 size={16} /> Supprimer</button>
                <button className="ghost-button compact-button" type="button" onClick={onClose}>{t.close}</button>
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
                          [item.product_id]: Number(event.target.value)
                        })}
                      />
                    ) : item.quantity}
                  </td>
                  <td>{money(item.unit_price)}</td>
                  <td>{money(item.line_total)}</td>
                  <td className="row-actions">
                    <button type="button" title="Retour" onClick={() => void returnOne(item.product_id)} disabled={editing}>
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
