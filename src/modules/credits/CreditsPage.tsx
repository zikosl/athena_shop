import { FormEvent, useEffect, useMemo, useState } from "react";
import { HandCoins, Phone, Receipt as ReceiptText, FloppyDisk as Save, X } from "@phosphor-icons/react";
import { api } from "../../shared/api";
import { money } from "../../shared/format";
import { useText } from "../../shared/i18n";
import { CreditAccount, Language, UserSession } from "../../shared/types";

type ClientCreditAccount = {
  key: string;
  name: string;
  phone: string;
  credits: CreditAccount[];
  total: number;
  paid: number;
  remaining: number;
  lastDate: string;
};

export function CreditsPage({ language, user, onChanged }: { language: Language; user: UserSession; onChanged: () => void }) {
  const t = useText(language);
  const [credits, setCredits] = useState<CreditAccount[]>([]);
  const [selectedClientKey, setSelectedClientKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const load = () => api.credits().then(setCredits);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const clients = useMemo(() => {
    const groups = new Map<string, ClientCreditAccount>();
    for (const credit of credits) {
      const name = credit.sale.customer_name.trim() || "زبون بدون اسم";
      const phone = credit.sale.customer_phone.trim();
      const key = `${name.toLowerCase()}|${phone}`;
      const current = groups.get(key) ?? {
        key,
        name,
        phone,
        credits: [],
        total: 0,
        paid: 0,
        remaining: 0,
        lastDate: ""
      };
      current.credits.push(credit);
      current.total += credit.sale.total;
      current.paid += credit.sale.paid_amount;
      current.remaining += credit.sale.remaining_amount;
      const dates = [current.lastDate, credit.sale.created_at].filter(Boolean).sort();
      current.lastDate = dates[dates.length - 1] ?? "";
      groups.set(key, current);
    }
    return Array.from(groups.values())
      .map((client) => ({
        ...client,
        credits: client.credits.sort((a, b) => b.sale.created_at.localeCompare(a.sale.created_at) || b.sale.id - a.sale.id)
      }))
      .sort((a, b) => b.remaining - a.remaining || b.lastDate.localeCompare(a.lastDate));
  }, [credits]);

  const selectedClient = useMemo(
    () => clients.find((client) => client.key === selectedClientKey) ?? null,
    [clients, selectedClientKey]
  );

  const selected = useMemo(
    () => credits.find((credit) => credit.sale.id === selectedId) ?? null,
    [credits, selectedId]
  );

  const totals = useMemo(() => ({
    open: clients.filter((client) => client.remaining > 0).length,
    remaining: credits.reduce((sum, credit) => sum + credit.sale.remaining_amount, 0),
    paid: credits.reduce((sum, credit) => sum + credit.sale.paid_amount, 0)
  }), [credits, clients]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setError("");
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
    }
  }

  function openClient(client: ClientCreditAccount) {
    setSelectedClientKey(client.key);
    const firstOpen = client.credits.find((credit) => credit.sale.remaining_amount > 0) ?? client.credits[0];
    setSelectedId(firstOpen?.sale.id ?? null);
    setAmount(0);
    setNote("");
    setError("");
  }

  function closeCredit() {
    setSelectedClientKey(null);
    setSelectedId(null);
    setAmount(0);
    setNote("");
    setError("");
  }

  return (
    <>
      <section className="panel table-panel full">
        <div className="section-title"><h2><HandCoins size={18} /> {t.credits}</h2><span /></div>
        <div className="summary-strip compact">
          <article><span>{t.openCredits}</span><strong>{totals.open}</strong></article>
          <article><span>{t.totalToCollect}</span><strong>{money(totals.remaining)}</strong></article>
          <article><span>{t.totalPaid}</span><strong>{money(totals.paid)}</strong></article>
        </div>
        {error && !selected && <p className="error">{error}</p>}
        <div className="credit-list wide-credit-list">
          {clients.map((client) => (
            <button
              key={client.key}
              className="credit-row"
              onClick={() => openClient(client)}
            >
              <span>
                <strong>{client.name}</strong>
                <small><ReceiptText size={13} /> {client.credits.length} قسيمة · آخر تعامل {client.lastDate.slice(0, 10)}</small>
              </span>
              <span>
                <b>{money(client.remaining)}</b>
                <small className={`status-pill ${client.remaining <= 0 ? "ok" : "warning"}`}>{client.remaining <= 0 ? t.settled : t.inProgress}</small>
              </span>
            </button>
          ))}
          {!clients.length && <p className="empty-state">{t.noCredits}</p>}
        </div>
      </section>

      {selectedClient && (
        <div className="modal-backdrop">
          <section className="panel form-panel form-modal compact-form-modal">
            <div className="section-title">
              <h2>سجل الزبون</h2>
              <span />
              <button className="ghost-button compact-button" type="button" onClick={closeCredit}><X size={16} /> {t.close}</button>
            </div>
            <div className="credit-detail">
              <strong>{selectedClient.name}</strong>
              <span><Phone size={14} /> {selectedClient.phone || t.noPhone}</span>
              <span>{t.total}: {money(selectedClient.total)}</span>
              <span>{t.paid}: {money(selectedClient.paid)}</span>
              <span>{t.remaining}: <b>{money(selectedClient.remaining)}</b></span>
            </div>
            <div className="payment-history">
              <h3>قسائم الزبون</h3>
              {selectedClient.credits.map((credit) => (
                <article key={credit.sale.id} className={selectedId === credit.sale.id ? "active" : ""}>
                  <strong>{credit.sale.receipt_no}</strong>
                  <span>{credit.sale.created_at}</span>
                  <small>{t.total}: {money(credit.sale.total)} · {t.paid}: {money(credit.sale.paid_amount)} · {t.remaining}: {money(credit.sale.remaining_amount)}</small>
                  {credit.sale.due_date && <small>{t.dueDate}: {credit.sale.due_date}</small>}
                  <button className="ghost-button compact-button" type="button" disabled={credit.sale.remaining_amount <= 0} onClick={() => {
                    setSelectedId(credit.sale.id);
                    setAmount(0);
                    setNote("");
                  }}>اختيار للدفع</button>
                </article>
              ))}
            </div>
            {selected && (
              <form className="payment-form" onSubmit={submit}>
                <label><span>{t.cashInstallment} · {selected.sale.receipt_no}</span><div className="field"><input type="number" min={0} max={selected.sale.remaining_amount} value={amount === 0 ? "" : amount} onChange={(event) => setAmount(Number(event.target.value))} /></div></label>
                <label><span>{t.note}</span><textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
                {error && <p className="error">{error}</p>}
                <button className="gold-button" disabled={selected.sale.remaining_amount <= 0 || amount <= 0 || amount > selected.sale.remaining_amount}><Save size={18} /> {t.save}</button>
              </form>
            )}
            <div className="payment-history">
              <h3>سجل الدفعات</h3>
              {!selectedClient.credits.some((credit) => credit.payments.length) && <p className="empty-state">{t.noCreditPayments}</p>}
              {selectedClient.credits.flatMap((credit) => credit.payments.map((payment) => ({ payment, receiptNo: credit.sale.receipt_no }))).map(({ payment, receiptNo }) => (
                <article key={payment.id}>
                  <strong>{money(payment.amount)}</strong>
                  <span>{receiptNo} · {payment.paid_at}</span>
                  {payment.note && <small>{payment.note}</small>}
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
