import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CalendarClock, HandCoins, Landmark, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import { api } from "../../shared/api";
import { money } from "../../shared/format";
import {
  Language,
  UserSession,
  VaultDashboard,
  VaultDebt,
  VaultDebtInput,
  VaultDebtPaymentInput,
  VaultMovement,
  VaultMovementInput
} from "../../shared/types";
import { showToast } from "../../shared/toast";

const emptyMovement: VaultMovementInput = {
  movement_type: "in",
  label: "",
  amount: 0,
  note: "",
  cashier: ""
};

const emptyDebt: VaultDebtInput = {
  party_name: "",
  phone: "",
  debt_type: "receivable",
  principal_amount: 0,
  due_date: "",
  note: ""
};

export function VaultPage({ language: _language, user, onChanged }: { language: Language; user: UserSession; onChanged: () => void }) {
  const [dashboard, setDashboard] = useState<VaultDashboard | null>(null);
  const [movements, setMovements] = useState<VaultMovement[]>([]);
  const [debts, setDebts] = useState<VaultDebt[]>([]);
  const [tab, setTab] = useState<"debts" | "movements">("debts");
  const [query, setQuery] = useState("");
  const [movementForm, setMovementForm] = useState<VaultMovementInput | null>(null);
  const [debtForm, setDebtForm] = useState<VaultDebtInput | null>(null);
  const [paymentForm, setPaymentForm] = useState<VaultDebtPaymentInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const [nextDashboard, nextMovements, nextDebts] = await Promise.all([
      api.vaultDashboard(),
      api.vaultMovements(),
      api.vaultDebts()
    ]);
    setDashboard(nextDashboard);
    setMovements(nextMovements);
    setDebts(nextDebts);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const filteredDebts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return debts.filter((debt) => !normalized || [debt.party_name, debt.phone, debt.note]
      .some((value) => value.toLowerCase().includes(normalized)));
  }, [debts, query]);
  const receivableCount = debts.filter((debt) => debt.debt_type === "receivable" && debt.remaining_amount > 0).length;
  const payableCount = debts.filter((debt) => debt.debt_type === "payable" && debt.remaining_amount > 0).length;

  function openMovement(type: VaultMovementInput["movement_type"], movement?: VaultMovement) {
    setMovementForm(movement ? {
      id: movement.id,
      movement_type: movement.movement_type,
      label: movement.label,
      amount: movement.amount,
      note: movement.note,
      cashier: movement.cashier
    } : { ...emptyMovement, movement_type: type, cashier: user.display_name });
  }

  function openDebt(type: VaultDebtInput["debt_type"], debt?: VaultDebt) {
    setDebtForm(debt ? {
      id: debt.id,
      party_name: debt.party_name,
      phone: debt.phone,
      debt_type: debt.debt_type,
      principal_amount: debt.principal_amount,
      due_date: debt.due_date,
      note: debt.note
    } : { ...emptyDebt, debt_type: type });
  }

  async function saveMovement(event: FormEvent) {
    event.preventDefault();
    if (!movementForm) return;
    setSaving(true);
    setError("");
    try {
      await api.saveVaultMovement({ ...movementForm, cashier: movementForm.cashier || user.display_name });
      setMovementForm(null);
      await load();
      onChanged();
      showToast("تم حفظ حركة الخزنة", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveDebt(event: FormEvent) {
    event.preventDefault();
    if (!debtForm) return;
    setSaving(true);
    setError("");
    try {
      await api.saveVaultDebt(debtForm);
      setDebtForm(null);
      await load();
      onChanged();
      showToast("تم حفظ الدين", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function savePayment(event: FormEvent) {
    event.preventDefault();
    if (!paymentForm) return;
    setSaving(true);
    setError("");
    try {
      await api.addVaultDebtPayment({ ...paymentForm, cashier: user.display_name });
      setPaymentForm(null);
      await load();
      onChanged();
      showToast("تم تسجيل الدفعة", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function removeDebt(id: number) {
    if (!confirm("حذف هذا الدين؟")) return;
    await api.deleteVaultDebt(id);
    await load();
    onChanged();
  }

  async function removeMovement(id: number) {
    if (!confirm("حذف هذه الحركة؟")) return;
    await api.deleteVaultMovement(id);
    await load();
    onChanged();
  }

  return (
    <section className="vault-workspace">
      <div className="vault-topline">
        <article className="vault-hero">
          <div className="vault-hero-icon"><Landmark size={28} /></div>
          <div>
            <span>الخزنة / Coffre-fort</span>
            <strong>{money(dashboard?.cash_balance ?? 0)}</strong>
            <small>المال الموجود في الخزنة الآن</small>
          </div>
        </article>
        <div className="vault-quick-actions">
          <button className="vault-action positive" type="button" onClick={() => openMovement("in")}><ArrowDown size={17} /> دخول مال</button>
          <button className="vault-action negative" type="button" onClick={() => openMovement("out")}><ArrowUp size={17} /> خروج مال</button>
          <button className="vault-action primary" type="button" onClick={() => openDebt("receivable")}><Plus size={17} /> دين جديد</button>
        </div>
      </div>

      <div className="vault-dashboard">
        <VaultMetric title="الصافي" subtitle="الخزنة + الحقوق - الالتزامات" value={dashboard?.net_position ?? 0} tone="gold" />
        <VaultMetric title="لي عند الناس" subtitle={`${receivableCount} ملفات مفتوحة`} value={dashboard?.total_receivable ?? 0} tone="positive" />
        <VaultMetric title="لي علينا" subtitle={`${payableCount} ملفات مفتوحة`} value={dashboard?.total_payable ?? 0} tone="negative" />
        <VaultMetric title="متأخر" subtitle="ديون تجاوزت آخر أجل" value={dashboard?.overdue_debts_count ?? 0} plain tone="warning" />
      </div>

      <section className="panel table-panel full vault-panel">
        <div className="vault-panel-head">
          <div>
            <h2>متابعة الخزنة والديون</h2>
            <p>حركات المال والديون اليدوية منفصلة عن فواتير البيع، مع الصافي في الأعلى.</p>
          </div>
          <span className="vault-count-pill"><HandCoins size={16} /> {dashboard?.active_debts_count ?? 0} ديون مفتوحة</span>
        </div>

        <div className="segmented wide vault-tabs">
          <button className={tab === "debts" ? "active" : ""} type="button" onClick={() => setTab("debts")}>الديون</button>
          <button className={tab === "movements" ? "active" : ""} type="button" onClick={() => setTab("movements")}>حركات المال</button>
        </div>

        {tab === "debts" && (
          <>
            <div className="filter-row">
              <div className="searchbar"><Search size={18} /><input placeholder="بحث بالاسم، الهاتف أو الملاحظة..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>
              <button className="vault-action negative slim" type="button" onClick={() => openDebt("payable")}><Plus size={16} /> دين علينا</button>
            </div>
            <div className="vault-debt-list">
              {filteredDebts.map((debt) => (
                <article className={`vault-debt-card ${debt.debt_type}`} key={debt.id}>
                  <div className="vault-debt-main">
                    <span className={`status-pill ${debt.debt_type === "receivable" ? "success" : "warning"}`}>{debt.debt_type === "receivable" ? "لي عنده" : "علينا"}</span>
                    <h3>{debt.party_name}</h3>
                    <p>{debt.phone || "بدون هاتف"}</p>
                  </div>
                  <div className="vault-amounts">
                    <span>الأصل <b>{money(debt.principal_amount)}</b></span>
                    <span>مدفوع <b>{money(debt.paid_amount)}</b></span>
                    <span>باقي <strong>{money(debt.remaining_amount)}</strong></span>
                  </div>
                  <div className="vault-debt-meta">
                    {debt.due_date && <span><CalendarClock size={14} /> آخر أجل {debt.due_date}</span>}
                    {debt.note && <span>{debt.note}</span>}
                  </div>
                  <div className="vault-card-actions">
                    {debt.remaining_amount > 0 && <button className="vault-action primary slim" type="button" onClick={() => setPaymentForm({ debt_id: debt.id, amount: debt.remaining_amount, note: "", cashier: user.display_name })}><Plus size={15} /> دفعة</button>}
                    <button className="vault-icon-button" type="button" onClick={() => openDebt(debt.debt_type, debt)}><Pencil size={15} /></button>
                    <button className="vault-icon-button danger" type="button" onClick={() => removeDebt(debt.id)}><Trash2 size={15} /></button>
                  </div>
                </article>
              ))}
              {!filteredDebts.length && <p className="empty-state">لا توجد ديون مسجلة في الخزنة.</p>}
            </div>
          </>
        )}

        {tab === "movements" && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>النوع</th><th>التسمية</th><th>المبلغ</th><th>الموظف</th><th>التاريخ</th><th /></tr></thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{movement.movement_type === "in" ? "دخول" : "خروج"}</td>
                    <td><strong>{movement.label}</strong><small>{movement.note}</small></td>
                    <td>{money(movement.amount)}</td>
                    <td>{movement.cashier}</td>
                    <td>{new Date(movement.created_at).toLocaleString("fr-DZ")}</td>
                    <td className="vault-table-actions">
                      <button className="vault-icon-button" type="button" onClick={() => openMovement(movement.movement_type, movement)}><Pencil size={15} /></button>
                      <button className="vault-icon-button danger" type="button" onClick={() => removeMovement(movement.id)}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      {movementForm && (
        <div className="modal-backdrop">
          <form className="panel form-panel form-modal" onSubmit={saveMovement}>
            <div className="section-title"><h2>حركة خزنة</h2><button className="ghost-button compact-button" type="button" onClick={() => setMovementForm(null)}><X size={16} /> إغلاق</button></div>
            <label><span>النوع</span><div className="segmented wide"><button type="button" className={movementForm.movement_type === "in" ? "active" : ""} onClick={() => setMovementForm({ ...movementForm, movement_type: "in" })}>دخول</button><button type="button" className={movementForm.movement_type === "out" ? "active" : ""} onClick={() => setMovementForm({ ...movementForm, movement_type: "out" })}>خروج</button></div></label>
            <label><span>التسمية</span><div className="field"><input value={movementForm.label} onChange={(event) => setMovementForm({ ...movementForm, label: event.target.value })} /></div></label>
            <label><span>المبلغ</span><div className="field"><input type="number" min={0} value={movementForm.amount || ""} onChange={(event) => setMovementForm({ ...movementForm, amount: Number(event.target.value) })} /></div></label>
            <label><span>ملاحظة</span><textarea value={movementForm.note} onChange={(event) => setMovementForm({ ...movementForm, note: event.target.value })} /></label>
            <button className="gold-button" disabled={saving || !movementForm.label.trim() || movementForm.amount <= 0}><Save size={18} /> حفظ</button>
          </form>
        </div>
      )}

      {debtForm && (
        <div className="modal-backdrop">
          <form className="panel form-panel form-modal" onSubmit={saveDebt}>
            <div className="section-title"><h2>دين يدوي</h2><button className="ghost-button compact-button" type="button" onClick={() => setDebtForm(null)}><X size={16} /> إغلاق</button></div>
            <label><span>النوع</span><div className="segmented wide"><button type="button" className={debtForm.debt_type === "receivable" ? "active" : ""} onClick={() => setDebtForm({ ...debtForm, debt_type: "receivable" })}>لي عنده</button><button type="button" className={debtForm.debt_type === "payable" ? "active" : ""} onClick={() => setDebtForm({ ...debtForm, debt_type: "payable" })}>علينا</button></div></label>
            <label><span>الاسم</span><div className="field"><input value={debtForm.party_name} onChange={(event) => setDebtForm({ ...debtForm, party_name: event.target.value })} /></div></label>
            <label><span>الهاتف</span><div className="field"><input value={debtForm.phone} onChange={(event) => setDebtForm({ ...debtForm, phone: event.target.value })} /></div></label>
            <label><span>المبلغ</span><div className="field"><input type="number" min={0} value={debtForm.principal_amount || ""} onChange={(event) => setDebtForm({ ...debtForm, principal_amount: Number(event.target.value) })} /></div></label>
            <label><span>آخر أجل</span><div className="field"><input type="date" value={debtForm.due_date} onChange={(event) => setDebtForm({ ...debtForm, due_date: event.target.value })} /></div></label>
            <label><span>ملاحظة</span><textarea value={debtForm.note} onChange={(event) => setDebtForm({ ...debtForm, note: event.target.value })} /></label>
            <button className="gold-button" disabled={saving || !debtForm.party_name.trim() || debtForm.principal_amount <= 0}><Save size={18} /> حفظ الدين</button>
          </form>
        </div>
      )}

      {paymentForm && (
        <div className="modal-backdrop">
          <form className="panel form-panel form-modal" onSubmit={savePayment}>
            <div className="section-title"><h2>تسجيل دفعة</h2><button className="ghost-button compact-button" type="button" onClick={() => setPaymentForm(null)}><X size={16} /> إغلاق</button></div>
            <label><span>المبلغ</span><div className="field"><input type="number" min={0} value={paymentForm.amount || ""} onChange={(event) => setPaymentForm({ ...paymentForm, amount: Number(event.target.value) })} /></div></label>
            <label><span>ملاحظة</span><textarea value={paymentForm.note} onChange={(event) => setPaymentForm({ ...paymentForm, note: event.target.value })} /></label>
            <button className="gold-button" disabled={saving || paymentForm.amount <= 0}><Save size={18} /> تسجيل</button>
          </form>
        </div>
      )}
    </section>
  );
}

function VaultMetric({ title, subtitle, value, plain = false, tone = "gold" }: { title: string; subtitle: string; value: number; plain?: boolean; tone?: "gold" | "positive" | "negative" | "warning" }) {
  return (
    <article className={`vault-metric ${tone}`}>
      <span>{title}</span>
      <strong>{plain ? value : money(value)}</strong>
      <small>{subtitle}</small>
    </article>
  );
}
