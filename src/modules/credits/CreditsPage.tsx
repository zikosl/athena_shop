import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, HandCoins, Phone, Plus, ReceiptText, Save, Search, UserRoundPlus, X } from "lucide-react";
import { api } from "../../shared/api";
import { money } from "../../shared/format";
import { useText } from "../../shared/i18n";
import { showErrorToast, showToast } from "../../shared/toast";
import { ClientRecord, CreditAccount, Language, UserSession } from "../../shared/types";
import { Button, SectionHeader, TextAreaField, TextField } from "../../shared/ui";

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

function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00213")) digits = `0${digits.slice(5)}`;
  else if (digits.startsWith("213") && digits.length === 12) digits = `0${digits.slice(3)}`;
  return digits;
}

export function CreditsPage({ language, user, onChanged }: { language: Language; user: UserSession; onChanged: () => void }) {
  const t = useText(language);
  const [credits, setCredits] = useState<CreditAccount[]>([]);
  const [clientRecords, setClientRecords] = useState<ClientRecord[]>([]);
  const [selectedClientKey, setSelectedClientKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [historyTab, setHistoryTab] = useState<"debts" | "payments">("debts");
  const [debtFilter, setDebtFilter] = useState<"all" | "open" | "paid">("open");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [createClientOpen, setCreateClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const load = () => api.credits().then(setCredits);

  useEffect(() => {
    Promise.all([load(), api.clients().then(setClientRecords)])
      .catch((err) => showErrorToast(err, "تعذر تحميل حسابات العملاء"));
  }, []);

  const clients = useMemo(() => {
    const groups = new Map<string, ClientCreditAccount>();
    for (const record of clientRecords) {
      const phone = normalizePhone(record.phone);
      const key = phone ? `phone:${phone}` : `name:${record.name.toLowerCase()}`;
      groups.set(key, { key, name: record.name, phone, credits: [], total: 0, paid: 0, remaining: 0, lastDate: "" });
    }
    for (const credit of credits) {
      const name = credit.sale.customer_name.trim() || "زبون بدون اسم";
      const phone = normalizePhone(credit.sale.customer_phone);
      const key = phone ? `phone:${phone}` : `name:${name.toLowerCase()}`;
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
  }, [credits, clientRecords]);

  const selectedClient = useMemo(
    () => clients.find((client) => client.key === selectedClientKey) ?? null,
    [clients, selectedClientKey]
  );
  const hasOutstandingDebt = selectedClient?.credits.some((credit) => credit.sale.remaining_amount > 0) ?? false;

  const filteredClients = useMemo(() => {
    const query = clientQuery.trim().toLowerCase();
    const phoneQuery = normalizePhone(query);
    return clients.filter((client) => !query || client.name.toLowerCase().includes(query) || (!!phoneQuery && normalizePhone(client.phone).includes(phoneQuery)));
  }, [clients, clientQuery]);

  const selected = useMemo(
    () => credits.find((credit) => credit.sale.id === selectedId) ?? null,
    [credits, selectedId]
  );

  const filteredDebts = useMemo(() => {
    if (!selectedClient) return [];
    const query = historyQuery.trim().toLowerCase();
    return selectedClient.credits.filter((credit) => {
      const date = credit.sale.created_at.slice(0, 10);
      const matchesStatus = debtFilter === "all" || (debtFilter === "open" ? credit.sale.remaining_amount > 0 : credit.sale.remaining_amount <= 0);
      const matchesDate = (!historyFrom || date >= historyFrom) && (!historyTo || date <= historyTo);
      const matchesQuery = !query || credit.sale.receipt_no.toLowerCase().includes(query)
        || credit.sale.items.some((item) => item.product_name.toLowerCase().includes(query));
      return matchesStatus && matchesDate && matchesQuery;
    });
  }, [selectedClient, debtFilter, historyFrom, historyQuery, historyTo]);

  const filteredPayments = useMemo(() => {
    if (!selectedClient) return [];
    const query = historyQuery.trim().toLowerCase();
    return selectedClient.credits.flatMap((credit) => credit.payments.map((payment) => ({ payment, receiptNo: credit.sale.receipt_no })))
      .filter(({ payment, receiptNo }) => {
        const date = payment.paid_at.slice(0, 10);
        return (!historyFrom || date >= historyFrom) && (!historyTo || date <= historyTo)
          && (!query || receiptNo.toLowerCase().includes(query) || payment.note.toLowerCase().includes(query));
      })
      .sort((a, b) => b.payment.paid_at.localeCompare(a.payment.paid_at) || b.payment.id - a.payment.id);
  }, [selectedClient, historyFrom, historyQuery, historyTo]);

  const totals = useMemo(() => ({
    open: clients.filter((client) => client.remaining > 0).length,
    remaining: credits.reduce((sum, credit) => sum + credit.sale.remaining_amount, 0),
    paid: credits.reduce((sum, credit) => sum + credit.sale.paid_amount, 0)
  }), [credits, clients]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
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
      showToast("تم تسجيل دفعة العميل", "success");
    } catch (err) {
      showErrorToast(err, "تعذر تسجيل الدفعة");
    }
  }

  async function createClient(event: FormEvent) {
    event.preventDefault();
    try {
      const client = await api.saveClient({ name: newClientName, phone: newClientPhone });
      setClientRecords((items) => [...items.filter((item) => normalizePhone(item.phone) !== normalizePhone(client.phone)), client]);
      setSelectedClientKey(`phone:${normalizePhone(client.phone)}`);
      setSelectedId(null);
      setHistoryTab("debts");
      setDebtFilter("all");
      setHistoryQuery("");
      setHistoryFrom("");
      setHistoryTo("");
      setNewClientName("");
      setNewClientPhone("");
      setCreateClientOpen(false);
      showToast("تم إنشاء العميل", "success");
    } catch (err) {
      showErrorToast(err, "تعذر إنشاء العميل");
    }
  }

  function openClient(client: ClientCreditAccount) {
    setSelectedClientKey(client.key);
    setHistoryTab("debts");
    setDebtFilter("all");
    setHistoryQuery("");
    setHistoryFrom("");
    setHistoryTo("");
    const firstOpen = client.credits.find((credit) => credit.sale.remaining_amount > 0) ?? client.credits[0];
    setSelectedId(firstOpen?.sale.id ?? null);
    setAmount(0);
    setNote("");
  }

  function closeCredit() {
    setSelectedClientKey(null);
    setSelectedId(null);
    setAmount(0);
    setNote("");
  }

  return (
    <>
      {!selectedClient ? <section className="panel table-panel full">
        <SectionHeader title={<><HandCoins size={18} /> {t.credits} والعملاء</>}><Button variant="primary" size="compact" type="button" onClick={() => setCreateClientOpen(true)}><UserRoundPlus size={16} /> عميل جديد</Button></SectionHeader>
        <div className="summary-strip compact">
          <article><span>{t.openCredits}</span><strong>{totals.open}</strong></article>
          <article><span>{t.totalToCollect}</span><strong>{money(totals.remaining)}</strong></article>
          <article><span>{t.totalPaid}</span><strong>{money(totals.paid)}</strong></article>
        </div>
        <div className="searchbar credit-client-search"><Search size={17} /><input type="search" placeholder="ابحث باسم العميل أو رقم الهاتف" value={clientQuery} onChange={(event) => setClientQuery(event.target.value)} /></div>
        <div className="credit-list wide-credit-list">
          {filteredClients.map((client) => (
            <button
              key={client.key}
              className="credit-row"
              onClick={() => openClient(client)}
            >
              <span>
                <strong>{client.name}</strong>
                <small><ReceiptText size={13} /> {client.credits.length ? `${client.credits.length} قسيمة · آخر تعامل ${client.lastDate.slice(0, 10)}` : "لا توجد ديون سابقة"}</small>
              </span>
              <span>
                <b>{money(client.remaining)}</b>
                <small>{t.remaining} · <span className={`status-pill ${client.remaining <= 0 ? "ok" : "pending"}`}>{client.remaining <= 0 ? t.settled : t.inProgress}</span></small>
              </span>
            </button>
          ))}
          {!filteredClients.length && <p className="empty-state">{clientQuery ? "لا توجد نتائج لهذا البحث" : t.noCredits}</p>}
        </div>
      </section> : <section className="panel table-panel full client-detail-screen">
        <div className="client-detail-heading">
          <Button size="compact" type="button" onClick={closeCredit}><ArrowRight size={17} /> رجوع إلى العملاء</Button>
          <div><h2>{selectedClient.name}</h2><span><Phone size={14} /> {selectedClient.phone || t.noPhone}</span></div>
          <span className={`status-pill ${selectedClient.remaining > 0 ? "pending" : "ok"}`}>{selectedClient.remaining > 0 ? t.inProgress : t.settled}</span>
        </div>
        <div className="summary-strip compact client-detail-summary">
          <article><span>إجمالي الديون</span><strong>{money(selectedClient.total)}</strong></article>
          <article><span>إجمالي المدفوع</span><strong>{money(selectedClient.paid)}</strong></article>
          <article><span>الرصيد الحالي</span><strong>{money(selectedClient.remaining)}</strong></article>
          <article><span>عدد القسائم</span><strong>{selectedClient.credits.length}</strong></article>
        </div>
        <div className="client-history-toolbar">
          <div className="searchbar"><Search size={17} /><input type="search" placeholder="ابحث برقم القسيمة أو اسم المنتج أو الملاحظة" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} /></div>
          <label><span>من تاريخ</span><input className="filter-input" type="date" value={historyFrom} onChange={(event) => setHistoryFrom(event.target.value)} /></label>
          <label><span>إلى تاريخ</span><input className="filter-input" type="date" value={historyTo} onChange={(event) => setHistoryTo(event.target.value)} /></label>
          {historyTab === "debts" && <label className="client-status-filter"><span>حالة الدين</span><select aria-label="حالة الدين" value={debtFilter} onChange={(event) => setDebtFilter(event.target.value as typeof debtFilter)}><option value="all">كل الديون</option><option value="open">غير المسددة</option><option value="paid">المسددة</option></select></label>}
        </div>
        <div className="segmented client-history-tabs">
          <button className={historyTab === "debts" ? "active" : ""} type="button" onClick={() => setHistoryTab("debts")}>الديون · {filteredDebts.length}</button>
          <button className={historyTab === "payments" ? "active" : ""} type="button" onClick={() => setHistoryTab("payments")}>الدفعات · {filteredPayments.length}</button>
        </div>
        {historyTab === "debts" ? <div className={`client-history-layout${hasOutstandingDebt ? "" : " no-open-debts"}`}>
          <section className="client-history-section">
            <div className="section-title"><h3>سجل الديون</h3><span /></div>
            <div className="data-table client-credit-table"><table><thead><tr><th>القسيمة والتاريخ</th><th>المنتجات</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الاستحقاق</th><th></th></tr></thead><tbody>
              {filteredDebts.map((credit) => <tr key={credit.sale.id} className={selectedId === credit.sale.id ? "selected-client-debt" : ""}>
                <td><strong>{credit.sale.receipt_no}</strong><small>{credit.sale.created_at.slice(0, 16).replace("T", " ")}</small></td>
                <td><div className="client-debt-products">{credit.sale.items.map((item, index) => <span key={`${item.product_id}-${index}`}>{item.product_name} ×{item.quantity}</span>)}</div></td>
                <td>{money(credit.sale.total)}</td><td>{money(credit.sale.paid_amount)}</td><td><strong>{money(credit.sale.remaining_amount)}</strong></td><td>{credit.sale.due_date || "—"}</td>
                <td><button className="ghost-button compact-button" type="button" disabled={credit.sale.remaining_amount <= 0} onClick={() => { setSelectedId(credit.sale.id); setAmount(0); setNote(""); }}>تسديد</button></td>
              </tr>)}
            </tbody></table>{!filteredDebts.length && <p className="empty-state">لا توجد ديون مطابقة للفلاتر.</p>}</div>
          </section>
          {hasOutstandingDebt && <aside className="client-payment-panel">
            <h3>تسجيل دفعة</h3>
            {selected && selected.sale.remaining_amount > 0 ? <form className="payment-form" onSubmit={submit}>
              <p>{selected.sale.receipt_no}<small>المتبقي: {money(selected.sale.remaining_amount)}</small></p>
              <TextField label="مبلغ الدفعة" autoFocus type="number" min={1} max={selected.sale.remaining_amount} value={amount} onValueChange={(value) => setAmount(Number(value))} />
              <TextAreaField label={`${t.note} · اختياري`} value={note} onValueChange={setNote} />
              <button className="gold-button" disabled={amount <= 0 || amount > selected.sale.remaining_amount}><Save size={18} /> تسجيل الدفعة</button>
            </form> : <p className="empty-state">اختر قسيمة غير مسددة لتسجيل دفعة.</p>}
          </aside>}
        </div> : <section className="client-history-section">
          <div className="section-title"><h3>سجل الدفعات</h3><span /></div>
          <div className="data-table client-credit-table"><table><thead><tr><th>التاريخ</th><th>القسيمة</th><th>المبلغ</th><th>ملاحظة</th></tr></thead><tbody>
            {filteredPayments.map(({ payment, receiptNo }) => <tr key={payment.id}><td>{payment.paid_at.slice(0, 16).replace("T", " ")}</td><td>{receiptNo}</td><td><strong>{money(payment.amount)}</strong></td><td>{payment.note || "—"}</td></tr>)}
          </tbody></table>{!filteredPayments.length && <p className="empty-state">لا توجد دفعات مطابقة للفلاتر.</p>}</div>
        </section>}
      </section>}

      {createClientOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateClientOpen(false); }}>
        <form className="panel form-panel form-modal credit-create-client-modal" role="dialog" aria-modal="true" aria-labelledby="credit-create-client-title" onSubmit={createClient}>
          <div className="section-title"><h2 id="credit-create-client-title"><UserRoundPlus size={18} /> عميل جديد</h2><span /><button className="plain-icon" type="button" aria-label={t.close} onClick={() => setCreateClientOpen(false)}><X size={18} /></button></div>
          <TextField label="اسم العميل" autoFocus required maxLength={100} value={newClientName} onValueChange={setNewClientName} />
          <TextField label={t.phone} type="tel" inputMode="tel" autoComplete="tel" required value={newClientPhone} onValueChange={setNewClientPhone} />
          <div className="button-row">
            <Button type="button" onClick={() => setCreateClientOpen(false)}>{t.close}</Button>
            <Button variant="primary" type="submit" disabled={!newClientName.trim() || !newClientPhone.trim()}><Plus size={17} /> إنشاء العميل</Button>
          </div>
        </form>
      </div>}
    </>
  );
}
