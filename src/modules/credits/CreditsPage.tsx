import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, HandCoins, Phone, Plus, ReceiptText, Save, Search, UserRoundPlus, X } from "lucide-react";
import { api } from "../../shared/api";
import { money } from "../../shared/format";
import { localized, useText } from "../../shared/i18n";
import { showErrorToast, showToast } from "../../shared/toast";
import { ClientRecord, CreditAccount, Language, UserSession } from "../../shared/types";
import { Button, SectionHeader, SelectField, TextAreaField, TextField } from "../../shared/ui";

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
      .catch((err) => showErrorToast(err, localized(language, "تعذر تحميل حسابات العملاء", "Impossible de charger les comptes clients")));
  }, []);

  const clients = useMemo(() => {
    const groups = new Map<string, ClientCreditAccount>();
    for (const record of clientRecords) {
      const phone = normalizePhone(record.phone);
      const key = phone ? `phone:${phone}` : `name:${record.name.toLowerCase()}`;
      groups.set(key, { key, name: record.name, phone, credits: [], total: 0, paid: 0, remaining: 0, lastDate: "" });
    }
    for (const credit of credits) {
      const name = credit.sale.customer_name.trim() || localized(language, "زبون بدون اسم", "Client sans nom");
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
      showToast(localized(language, "تم تسجيل دفعة العميل", "Paiement client enregistré"), "success");
    } catch (err) {
      showErrorToast(err, localized(language, "تعذر تسجيل الدفعة", "Impossible d’enregistrer le paiement"));
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
      showToast(localized(language, "تم إنشاء العميل", "Client créé"), "success");
    } catch (err) {
      showErrorToast(err, localized(language, "تعذر إنشاء العميل", "Impossible de créer le client"));
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
        <SectionHeader title={<><HandCoins size={18} /> {localized(language, "الديون والعملاء", "Crédits et clients")}</>}><Button variant="primary" size="compact" type="button" onClick={() => setCreateClientOpen(true)}><UserRoundPlus size={16} /> {localized(language, "عميل جديد", "Nouveau client")}</Button></SectionHeader>
        <div className="summary-strip compact">
          <article><span>{t.openCredits}</span><strong>{totals.open}</strong></article>
          <article><span>{t.totalToCollect}</span><strong>{money(totals.remaining)}</strong></article>
          <article><span>{t.totalPaid}</span><strong>{money(totals.paid)}</strong></article>
        </div>
        <div className="searchbar credit-client-search"><Search size={17} /><input type="search" placeholder={localized(language, "ابحث باسم العميل أو رقم الهاتف", "Rechercher par nom ou téléphone")} value={clientQuery} onChange={(event) => setClientQuery(event.target.value)} /></div>
        <div className="credit-list wide-credit-list">
          {filteredClients.map((client) => (
            <button
              key={client.key}
              className="credit-row"
              onClick={() => openClient(client)}
            >
              <span>
                <strong>{client.name}</strong>
                <small><ReceiptText size={13} /> {client.credits.length ? `${client.credits.length} ${localized(language, "قسيمة · آخر تعامل", "factures · dernier contact")} ${client.lastDate.slice(0, 10)}` : localized(language, "لا توجد ديون سابقة", "Aucun crédit antérieur")}</small>
              </span>
              <span>
                <b>{money(client.remaining)}</b>
                <small>{t.remaining} · <span className={`status-pill ${client.remaining <= 0 ? "ok" : "pending"}`}>{client.remaining <= 0 ? t.settled : t.inProgress}</span></small>
              </span>
            </button>
          ))}
          {!filteredClients.length && <p className="empty-state">{clientQuery ? localized(language, "لا توجد نتائج لهذا البحث", "Aucun résultat pour cette recherche") : t.noCredits}</p>}
        </div>
      </section> : <section className="panel table-panel full client-detail-screen">
        <div className="client-detail-heading">
          <Button size="compact" type="button" onClick={closeCredit}><ArrowRight size={17} /> {localized(language, "رجوع إلى العملاء", "Retour aux clients")}</Button>
          <div><h2>{selectedClient.name}</h2><span><Phone size={14} /> {selectedClient.phone || t.noPhone}</span></div>
          <span className={`status-pill ${selectedClient.remaining > 0 ? "pending" : "ok"}`}>{selectedClient.remaining > 0 ? t.inProgress : t.settled}</span>
        </div>
        <div className="summary-strip compact client-detail-summary">
          <article><span>{localized(language, "إجمالي الديون", "Total des crédits")}</span><strong>{money(selectedClient.total)}</strong></article>
          <article><span>{localized(language, "إجمالي المدفوع", "Total payé")}</span><strong>{money(selectedClient.paid)}</strong></article>
          <article><span>{localized(language, "الرصيد الحالي", "Solde actuel")}</span><strong>{money(selectedClient.remaining)}</strong></article>
          <article><span>{localized(language, "عدد القسائم", "Nombre de factures")}</span><strong>{selectedClient.credits.length}</strong></article>
        </div>
        <div className="client-history-toolbar">
          <div className="searchbar"><Search size={17} /><input type="search" placeholder={localized(language, "ابحث برقم القسيمة أو اسم المنتج أو الملاحظة", "Rechercher par facture, produit ou note")} value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} /></div>
          <label><span>{t.fromDate}</span><input className="filter-input" type="date" value={historyFrom} onChange={(event) => setHistoryFrom(event.target.value)} /></label>
          <label><span>{t.toDate}</span><input className="filter-input" type="date" value={historyTo} onChange={(event) => setHistoryTo(event.target.value)} /></label>
          {historyTab === "debts" && <SelectField className="client-status-filter" label={localized(language, "حالة الدين", "État du crédit")} aria-label={localized(language, "حالة الدين", "État du crédit")} value={debtFilter} onValueChange={(value) => setDebtFilter(value as typeof debtFilter)} options={[{ value: "all", label: localized(language, "كل الديون", "Tous") }, { value: "open", label: localized(language, "غير المسددة", "Non réglés") }, { value: "paid", label: localized(language, "المسددة", "Réglés") }]} />}
        </div>
        <div className="segmented client-history-tabs">
          <button className={historyTab === "debts" ? "active" : ""} type="button" onClick={() => setHistoryTab("debts")}>{localized(language, "الديون", "Crédits")} · {filteredDebts.length}</button>
          <button className={historyTab === "payments" ? "active" : ""} type="button" onClick={() => setHistoryTab("payments")}>{localized(language, "الدفعات", "Paiements")} · {filteredPayments.length}</button>
        </div>
        {historyTab === "debts" ? <div className={`client-history-layout${hasOutstandingDebt ? "" : " no-open-debts"}`}>
          <section className="client-history-section">
            <div className="section-title"><h3>{localized(language, "سجل الديون", "Historique des crédits")}</h3><span /></div>
            <div className="data-table client-credit-table"><table><thead><tr><th>{localized(language, "القسيمة والتاريخ", "Facture et date")}</th><th>{t.items}</th><th>{t.total}</th><th>{t.paid}</th><th>{t.remaining}</th><th>{t.dueDate}</th><th></th></tr></thead><tbody>
              {filteredDebts.map((credit) => <tr key={credit.sale.id} className={selectedId === credit.sale.id ? "selected-client-debt" : ""}>
                <td><strong>{credit.sale.receipt_no}</strong><small>{credit.sale.created_at.slice(0, 16).replace("T", " ")}</small></td>
                <td><div className="client-debt-products">{credit.sale.items.map((item, index) => <span key={`${item.product_id}-${index}`}>{item.product_name} ×{item.quantity}</span>)}</div></td>
                <td>{money(credit.sale.total)}</td><td>{money(credit.sale.paid_amount)}</td><td><strong>{money(credit.sale.remaining_amount)}</strong></td><td>{credit.sale.due_date || "—"}</td>
                <td><button className="ghost-button compact-button" type="button" disabled={credit.sale.remaining_amount <= 0} onClick={() => { setSelectedId(credit.sale.id); setAmount(0); setNote(""); }}>{localized(language, "تسديد", "Régler")}</button></td>
              </tr>)}
            </tbody></table>{!filteredDebts.length && <p className="empty-state">{localized(language, "لا توجد ديون مطابقة للفلاتر.", "Aucun crédit ne correspond aux filtres.")}</p>}</div>
          </section>
          {hasOutstandingDebt && <aside className="client-payment-panel">
            <h3>{localized(language, "تسجيل دفعة", "Enregistrer un paiement")}</h3>
            {selected && selected.sale.remaining_amount > 0 ? <form className="payment-form" onSubmit={submit}>
              <p>{selected.sale.receipt_no}<small>{t.remaining}: {money(selected.sale.remaining_amount)}</small></p>
              <TextField label={localized(language, "مبلغ الدفعة", "Montant du paiement")} autoFocus type="number" min={1} max={selected.sale.remaining_amount} value={amount} onValueChange={(value) => setAmount(Number(value))} />
              <TextAreaField label={`${t.note} · اختياري`} value={note} onValueChange={setNote} />
              <button className="gold-button" disabled={amount <= 0 || amount > selected.sale.remaining_amount}><Save size={18} /> {localized(language, "تسجيل الدفعة", "Enregistrer le paiement")}</button>
            </form> : <p className="empty-state">{localized(language, "اختر قسيمة غير مسددة لتسجيل دفعة.", "Sélectionnez une facture non réglée pour enregistrer un paiement.")}</p>}
          </aside>}
        </div> : <section className="client-history-section">
          <div className="section-title"><h3>{localized(language, "سجل الدفعات", "Historique des paiements")}</h3><span /></div>
          <div className="data-table client-credit-table"><table><thead><tr><th>{t.date}</th><th>{t.ticket}</th><th>{t.amount}</th><th>{t.note}</th></tr></thead><tbody>
            {filteredPayments.map(({ payment, receiptNo }) => <tr key={payment.id}><td>{payment.paid_at.slice(0, 16).replace("T", " ")}</td><td>{receiptNo}</td><td><strong>{money(payment.amount)}</strong></td><td>{payment.note || "—"}</td></tr>)}
          </tbody></table>{!filteredPayments.length && <p className="empty-state">{localized(language, "لا توجد دفعات مطابقة للفلاتر.", "Aucun paiement ne correspond aux filtres.")}</p>}</div>
        </section>}
      </section>}

      {createClientOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateClientOpen(false); }}>
        <form className="panel form-panel form-modal credit-create-client-modal" role="dialog" aria-modal="true" aria-labelledby="credit-create-client-title" onSubmit={createClient}>
          <div className="section-title"><h2 id="credit-create-client-title"><UserRoundPlus size={18} /> {localized(language, "عميل جديد", "Nouveau client")}</h2><span /><button className="plain-icon" type="button" aria-label={t.close} onClick={() => setCreateClientOpen(false)}><X size={18} /></button></div>
          <TextField label={localized(language, "اسم العميل", "Nom du client")} autoFocus required maxLength={100} value={newClientName} onValueChange={setNewClientName} />
          <TextField label={t.phone} type="tel" inputMode="tel" autoComplete="tel" required value={newClientPhone} onValueChange={setNewClientPhone} />
          <div className="button-row">
            <Button type="button" onClick={() => setCreateClientOpen(false)}>{t.close}</Button>
            <Button variant="primary" type="submit" disabled={!newClientName.trim() || !newClientPhone.trim()}><Plus size={17} /> {localized(language, "إنشاء العميل", "Créer le client")}</Button>
          </div>
        </form>
      </div>}
    </>
  );
}
