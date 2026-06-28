import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Landmark, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import { api } from "../../shared/api";
import { money } from "../../shared/format";
import { Language, UserSession, VaultDashboard, VaultDebt, VaultDebtInput, VaultMovement, VaultMovementInput } from "../../shared/types";

type TabKey = "movements" | "debts";
type DebtFilter = "all" | "receivable" | "payable";

function newMovement(cashier: string): VaultMovementInput {
  return { movement_type: "in", label: "", amount: 0, note: "", cashier };
}

function newDebt(): VaultDebtInput {
  return { party_name: "", phone: "", debt_type: "receivable", principal_amount: 0, due_date: "", note: "" };
}

export function VaultPage({ language: _language, user, onChanged }: { language: Language; user: UserSession; onChanged: () => void }) {
  const [dashboard, setDashboard] = useState<VaultDashboard | null>(null);
  const [allMovements, setAllMovements] = useState<VaultMovement[]>([]);
  const [tab, setTab] = useState<TabKey>("movements");
  const [debtFilter, setDebtFilter] = useState<DebtFilter>("all");
  const [query, setQuery] = useState("");
  const [movementForm, setMovementForm] = useState<VaultMovementInput>(() => newMovement(user.display_name));
  const [debtForm, setDebtForm] = useState<VaultDebtInput>(newDebt);
  const [paymentDebt, setPaymentDebt] = useState<VaultDebt | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentNote, setPaymentNote] = useState("");
  const [formOpen, setFormOpen] = useState<"movement" | "debt" | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    const [nextDashboard, nextMovements] = await Promise.all([
      api.vaultDashboard(),
      api.vaultMovements()
    ]);
    setDashboard(nextDashboard);
    setAllMovements(nextMovements);
  };

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const movements = allMovements;
  const debts = dashboard?.debts ?? [];

  const filteredDebts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return debts.filter((debt) => {
      const matchesType = debtFilter === "all" || debt.debt_type === debtFilter;
      const matchesQuery = !normalized || [debt.party_name, debt.phone, debt.note]
        .some((value) => value.toLowerCase().includes(normalized));
      return matchesType && matchesQuery;
    });
  }, [debtFilter, debts, query]);

  async function refreshAll() {
    await load();
    onChanged();
  }

  async function submitMovement(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api.saveVaultMovement({ ...movementForm, label: movementForm.label.trim(), note: movementForm.note.trim(), cashier: user.display_name });
      setMovementForm(newMovement(user.display_name));
      setFormOpen(null);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function submitDebt(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api.saveVaultDebt({ ...debtForm, party_name: debtForm.party_name.trim(), phone: debtForm.phone.trim(), note: debtForm.note.trim() });
      setDebtForm(newDebt());
      setFormOpen(null);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function submitPayment(event: FormEvent) {
    event.preventDefault();
    if (!paymentDebt) return;
    setError("");
    try {
      await api.addVaultDebtPayment({ debt_id: paymentDebt.id, amount: paymentAmount, note: paymentNote.trim(), cashier: user.display_name });
      setPaymentDebt(null);
      setPaymentAmount(0);
      setPaymentNote("");
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function removeMovement(movement: VaultMovement) {
    if (!window.confirm(`حذف حركة "${movement.label}"؟`)) return;
    await api.deleteVaultMovement(movement.id);
    await refreshAll();
  }

  async function removeDebt(debt: VaultDebt) {
    if (!window.confirm(`حذف دين "${debt.party_name}" وكل دفعاته؟`)) return;
    await api.deleteVaultDebt(debt.id);
    await refreshAll();
  }

  async function removePayment(id: number) {
    if (!window.confirm("حذف هذه الدفعة؟")) return;
    await api.deleteVaultDebtPayment(id);
    await refreshAll();
  }

  function editMovement(movement: VaultMovement) {
    setError("");
    setMovementForm({
      id: movement.id,
      movement_type: movement.movement_type,
      label: movement.label,
      amount: movement.amount,
      note: movement.note,
      cashier: user.display_name
    });
    setFormOpen("movement");
  }

  function editDebt(debt: VaultDebt) {
    setError("");
    setDebtForm({
      id: debt.id,
      party_name: debt.party_name,
      phone: debt.phone,
      debt_type: debt.debt_type,
      principal_amount: debt.principal_amount,
      due_date: debt.due_date,
      note: debt.note
    });
    setFormOpen("debt");
  }

  return (
    <>
      <section className="vault-dashboard">
        <article className="vault-hero panel">
          <span>الصندوق</span>
          <strong>{money(dashboard?.cash_balance ?? 0)}</strong>
          <small>القيمة الصافية مع الديون: {money(dashboard?.net_position ?? 0)}</small>
        </article>
        <VaultMetric label="دخل الصندوق" value={dashboard?.cash_in_total ?? 0} icon="in" />
        <VaultMetric label="خرج الصندوق" value={dashboard?.cash_out_total ?? 0} icon="out" danger />
        <VaultMetric label="ديون لنا" value={dashboard?.total_receivable ?? 0} helper={`يدوي ${money(dashboard?.manual_receivable ?? 0)} · فواتير ${money(dashboard?.sales_credit_remaining ?? 0)}`} icon="in" />
        <VaultMetric label="ديون علينا" value={dashboard?.total_payable ?? 0} helper={`يدوي ${money(dashboard?.manual_payable ?? 0)} · موردين ${money(dashboard?.supplier_remaining ?? 0)}`} icon="out" danger />
      </section>

      <section className="panel table-panel full">
        <div className="section-title">
          <h2><Landmark size={19} /> coffre-fort</h2>
          <span />
          <button className="ghost-button compact-button" type="button" onClick={() => {
            setMovementForm(newMovement(user.display_name));
            setFormOpen("movement");
          }}><Plus size={16} /> حركة</button>
          <button className="gold-button compact-button" type="button" onClick={() => {
            setDebtForm(newDebt());
            setFormOpen("debt");
          }}><Plus size={16} /> دين</button>
        </div>

        <div className="vault-toolbar">
          <div className="segmented wide">
            <button type="button" className={tab === "movements" ? "active" : ""} onClick={() => setTab("movements")}>الحركات</button>
            <button type="button" className={tab === "debts" ? "active" : ""} onClick={() => setTab("debts")}>الديون</button>
          </div>
          {tab === "debts" && (
            <>
              <div className="searchbar"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث بالاسم أو الهاتف..." /></div>
              <select value={debtFilter} onChange={(event) => setDebtFilter(event.target.value as DebtFilter)}>
                <option value="all">كل الديون</option>
                <option value="receivable">ديون لنا</option>
                <option value="payable">ديون علينا</option>
              </select>
            </>
          )}
        </div>

        {error && <p className="error">{error}</p>}

        {tab === "movements" ? (
          <div className="data-table">
            <table>
              <thead><tr><th>الحركة</th><th>النوع</th><th>المبلغ</th><th>المستخدم</th><th>التاريخ</th><th></th></tr></thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td><strong>{movement.label}</strong><span>{movement.note || "-"}</span></td>
                    <td><span className={`status-pill ${movement.movement_type === "in" ? "ok" : "warning"}`}>{movement.movement_type === "in" ? "إضافة" : "سحب"}</span></td>
                    <td>{money(movement.amount)}</td>
                    <td>{movement.cashier}</td>
                    <td>{movement.created_at.slice(0, 16)}</td>
                    <td className="row-actions">
                      <button onClick={() => editMovement(movement)}><Pencil size={16} /></button>
                      <button className="danger-action" onClick={() => removeMovement(movement)}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="vault-debt-grid">
            {filteredDebts.map((debt) => (
              <article className="vault-debt-card" key={debt.id}>
                <div>
                  <strong>{debt.party_name}</strong>
                  <span>{debt.phone || "بدون هاتف"}</span>
                </div>
                <span className={`status-pill ${debt.debt_type === "receivable" ? "ok" : "warning"}`}>{debt.debt_type === "receivable" ? "لنا" : "علينا"}</span>
                <dl>
                  <div><dt>الأصل</dt><dd>{money(debt.principal_amount)}</dd></div>
                  <div><dt>مدفوع</dt><dd>{money(debt.paid_amount)}</dd></div>
                  <div><dt>باقي</dt><dd>{money(debt.remaining_amount)}</dd></div>
                </dl>
                {debt.note && <p>{debt.note}</p>}
                {debt.due_date && <small>آخر أجل: {debt.due_date}</small>}
                <div className="vault-card-actions">
                  <button className="ghost-button compact-button" type="button" onClick={() => editDebt(debt)}><Pencil size={15} /> تعديل</button>
                  <button className="gold-button compact-button" type="button" disabled={debt.remaining_amount <= 0} onClick={() => {
                    setPaymentDebt(debt);
                    setPaymentAmount(0);
                    setPaymentNote("");
                  }}><Plus size={15} /> دفعة</button>
                  <button className="danger-action" type="button" onClick={() => removeDebt(debt)}><Trash2 size={15} /></button>
                </div>
                {!!debt.payments.length && (
                  <div className="vault-payments">
                    {debt.payments.map((payment) => (
                      <button key={payment.id} type="button" onClick={() => removePayment(payment.id)}>
                        <span>{money(payment.amount)}</span>
                        <small>{payment.paid_at.slice(0, 10)} · {payment.note || payment.cashier}</small>
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
            {!filteredDebts.length && <p className="empty-state">لا توجد ديون في الصندوق.</p>}
          </div>
        )}
      </section>

      {formOpen === "movement" && (
        <VaultModal title="حركة الصندوق" onClose={() => setFormOpen(null)}>
          <form className="vault-form" onSubmit={submitMovement}>
            <div className="segmented wide">
              <button type="button" className={movementForm.movement_type === "in" ? "active" : ""} onClick={() => setMovementForm({ ...movementForm, movement_type: "in" })}>إضافة</button>
              <button type="button" className={movementForm.movement_type === "out" ? "active" : ""} onClick={() => setMovementForm({ ...movementForm, movement_type: "out" })}>سحب</button>
            </div>
            <label><span>التسمية</span><div className="field"><input value={movementForm.label} onChange={(event) => setMovementForm({ ...movementForm, label: event.target.value })} /></div></label>
            <label><span>المبلغ</span><div className="field"><input type="number" min={0} step="0.01" value={movementForm.amount || ""} onChange={(event) => setMovementForm({ ...movementForm, amount: Number(event.target.value) })} /></div></label>
            <label><span>ملاحظة</span><textarea value={movementForm.note} onChange={(event) => setMovementForm({ ...movementForm, note: event.target.value })} /></label>
            {error && <p className="error">{error}</p>}
            <button className="gold-button" disabled={!movementForm.label.trim() || movementForm.amount <= 0}><Save size={18} /> حفظ</button>
          </form>
        </VaultModal>
      )}

      {formOpen === "debt" && (
        <VaultModal title="دين يدوي" onClose={() => setFormOpen(null)}>
          <form className="vault-form" onSubmit={submitDebt}>
            <div className="segmented wide">
              <button type="button" className={debtForm.debt_type === "receivable" ? "active" : ""} onClick={() => setDebtForm({ ...debtForm, debt_type: "receivable" })}>لنا</button>
              <button type="button" className={debtForm.debt_type === "payable" ? "active" : ""} onClick={() => setDebtForm({ ...debtForm, debt_type: "payable" })}>علينا</button>
            </div>
            <label><span>الاسم</span><div className="field"><input value={debtForm.party_name} onChange={(event) => setDebtForm({ ...debtForm, party_name: event.target.value })} /></div></label>
            <label><span>الهاتف</span><div className="field"><input value={debtForm.phone} onChange={(event) => setDebtForm({ ...debtForm, phone: event.target.value })} /></div></label>
            <label><span>المبلغ الأصلي</span><div className="field"><input type="number" min={0} step="0.01" value={debtForm.principal_amount || ""} onChange={(event) => setDebtForm({ ...debtForm, principal_amount: Number(event.target.value) })} /></div></label>
            <label><span>آخر أجل</span><div className="field"><input type="date" value={debtForm.due_date} onChange={(event) => setDebtForm({ ...debtForm, due_date: event.target.value })} /></div></label>
            <label><span>ملاحظة</span><textarea value={debtForm.note} onChange={(event) => setDebtForm({ ...debtForm, note: event.target.value })} /></label>
            {error && <p className="error">{error}</p>}
            <button className="gold-button" disabled={!debtForm.party_name.trim() || debtForm.principal_amount <= 0}><Save size={18} /> حفظ</button>
          </form>
        </VaultModal>
      )}

      {paymentDebt && (
        <VaultModal title={`دفعة · ${paymentDebt.party_name}`} onClose={() => setPaymentDebt(null)}>
          <form className="vault-form" onSubmit={submitPayment}>
            <div className="summary-strip compact">
              <article><span>المتبقي</span><strong>{money(paymentDebt.remaining_amount)}</strong></article>
            </div>
            <label><span>المبلغ</span><div className="field"><input type="number" min={0} max={paymentDebt.remaining_amount} step="0.01" value={paymentAmount || ""} onChange={(event) => setPaymentAmount(Number(event.target.value))} /></div></label>
            <label><span>ملاحظة</span><textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} /></label>
            {error && <p className="error">{error}</p>}
            <button className="gold-button" disabled={paymentAmount <= 0 || paymentAmount > paymentDebt.remaining_amount}><Save size={18} /> حفظ الدفعة</button>
          </form>
        </VaultModal>
      )}
    </>
  );
}

function VaultMetric({ label, value, helper, icon, danger = false }: { label: string; value: number; helper?: string; icon: "in" | "out"; danger?: boolean }) {
  const Icon = icon === "in" ? ArrowUp : ArrowDown;
  return (
    <article className="vault-metric panel">
      <div className={danger ? "danger" : "success"}><Icon size={20} /></div>
      <span>{label}</span>
      <strong>{money(value)}</strong>
      {helper && <small>{helper}</small>}
    </article>
  );
}

function VaultModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop">
      <section className="panel form-panel form-modal compact-form-modal">
        <div className="section-title">
          <h2>{title}</h2>
          <span />
          <button className="ghost-button compact-button" type="button" onClick={onClose}><X size={16} /> إغلاق</button>
        </div>
        {children}
      </section>
    </div>
  );
}
