import { FormEvent, useEffect, useMemo, useState } from "react";
import { HandCoins, Phone, ReceiptText } from "lucide-react";
import { api } from "../../shared/api";
import { money } from "../../shared/format";
import { useText } from "../../shared/i18n";
import { CreditAccount, Language, UserSession } from "../../shared/types";

export function CreditsPage({ language, user, onChanged }: { language: Language; user: UserSession; onChanged: () => void }) {
  const t = useText(language);
  const [credits, setCredits] = useState<CreditAccount[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => api.credits().then(setCredits);

  useEffect(() => {
    void load();
  }, []);

  const selected = useMemo(
    () => credits.find((credit) => credit.sale.id === selectedId) ?? credits[0],
    [credits, selectedId]
  );

  useEffect(() => {
    if (!selectedId && credits[0]) setSelectedId(credits[0].sale.id);
  }, [credits, selectedId]);

  const totals = useMemo(() => ({
    open: credits.filter((credit) => credit.sale.remaining_amount > 0).length,
    remaining: credits.reduce((sum, credit) => sum + credit.sale.remaining_amount, 0),
    paid: credits.reduce((sum, credit) => sum + credit.sale.paid_amount, 0)
  }), [credits]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setError("");
    setSaving(true);
    try {
      await api.addCreditPayment({
        sale_id: selected.sale.id,
        amount,
        note,
        cashier: user.display_name
      });
      setAmount(0);
      setNote("");
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="credits-grid">
      <section className="panel table-panel">
        <div className="section-title"><h2><HandCoins size={18} /> {t.credits}</h2><span /></div>
        <div className="summary-strip compact">
          <article><span>{t.openCredits}</span><strong>{totals.open}</strong></article>
          <article><span>{t.totalToCollect}</span><strong>{money(totals.remaining)}</strong></article>
          <article><span>{t.totalPaid}</span><strong>{money(totals.paid)}</strong></article>
        </div>
        <div className="credit-list">
          {credits.map((credit) => (
            <button
              key={credit.sale.id}
              className={`credit-row ${selected?.sale.id === credit.sale.id ? "active" : ""}`}
              onClick={() => setSelectedId(credit.sale.id)}
            >
              <span>
                <strong>{credit.sale.customer_name}</strong>
                <small><ReceiptText size={13} /> {credit.sale.receipt_no}</small>
              </span>
              <span>
                <b>{money(credit.sale.remaining_amount)}</b>
                <small className={`status-pill ${credit.sale.credit_status === "paid" ? "ok" : "warning"}`}>{credit.sale.credit_status === "paid" ? t.settled : t.inProgress}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <aside className="panel cart-panel">
        <div className="section-title"><h2>{t.installment}</h2><span /></div>
        {selected ? (
          <>
            <div className="credit-detail">
              <strong>{selected.sale.customer_name}</strong>
              <span><Phone size={14} /> {selected.sale.customer_phone || t.noPhone}</span>
              <span>{t.total}: {money(selected.sale.total)}</span>
              <span>{t.paid}: {money(selected.sale.paid_amount)}</span>
              <span>{t.remaining}: <b>{money(selected.sale.remaining_amount)}</b></span>
              {selected.sale.due_date && <span>{t.dueDate}: {selected.sale.due_date}</span>}
            </div>
            <form className="payment-form" onSubmit={submit}>
              <label><span>{t.cashInstallment}</span><div className="field"><input type="number" min={0} max={selected.sale.remaining_amount} value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></div></label>
              <label><span>{t.note}</span><textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
              {error && <p className="error">{error}</p>}
              <button className="gold-button" disabled={saving || selected.sale.remaining_amount <= 0 || amount <= 0 || amount > selected.sale.remaining_amount}>{saving ? t.saving : t.save}</button>
            </form>
            <div className="payment-history">
              {!selected.payments.length && <p className="empty-state">{t.noCreditPayments}</p>}
              {selected.payments.map((payment) => (
                <article key={payment.id}>
                  <strong>{money(payment.amount)}</strong>
                  <span>{payment.paid_at}</span>
                  {payment.note && <small>{payment.note}</small>}
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="empty-state">{t.noCredits}</p>
        )}
      </aside>
    </section>
  );
}
