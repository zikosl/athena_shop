import { FormEvent, useEffect, useMemo, useState } from "react";
import { Plus, Save, Search, Trash2, X } from "lucide-react";
import { api } from "../../shared/api";
import { money, todayInputValue } from "../../shared/format";
import { useText } from "../../shared/i18n";
import { Expense, ExpenseInput, Language } from "../../shared/types";

function newExpense(): ExpenseInput {
  return {
    label: "",
    category: "Boutique",
    amount: 0,
    note: "",
    expense_date: todayInputValue()
  };
}

export function ExpensesPage({ language, onChanged }: { language: Language; onChanged: () => void }) {
  const t = useText(language);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [form, setForm] = useState<ExpenseInput>(newExpense);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [fromDate, setFromDate] = useState(todayInputValue);
  const [toDate, setToDate] = useState(todayInputValue);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const load = () => api.expenses().then(setExpenses);
  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(expenses.map((expense) => expense.category))).sort(),
    [expenses]
  );

  const filteredExpenses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return expenses.filter((expense) => {
      const matchesQuery = !normalizedQuery || [expense.label, expense.category, expense.note]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
      const matchesCategory = !category || expense.category === category;
      const matchesFrom = !fromDate || expense.expense_date >= fromDate;
      const matchesTo = !toDate || expense.expense_date <= toDate;
      return matchesQuery && matchesCategory && matchesFrom && matchesTo;
    });
  }, [category, expenses, fromDate, query, toDate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!form.label.trim() || form.amount <= 0) {
      setError("Libelle et montant valides obligatoires");
      return;
    }
    try {
      await api.saveExpense({
        ...form,
        label: form.label.trim(),
        category: form.category.trim() || "Boutique",
        note: form.note.trim()
      });
      setForm(newExpense());
      setFormOpen(false);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove(id: number) {
    setError("");
    try {
      await api.deleteExpense(id);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function filterToday() {
    const today = todayInputValue();
    setFromDate(today);
    setToDate(today);
  }

  return (
    <>
      <section className="panel table-panel full">
        <div className="section-title">
          <h2>{t.expenses}</h2>
          <span />
          <button
            className="gold-button compact-button"
            type="button"
            onClick={() => {
              setError("");
              setForm(newExpense());
              setFormOpen(true);
            }}
          >
            <Plus size={17} /> {t.expenses}
          </button>
        </div>
        {error && !formOpen && <p className="error">{error}</p>}
        <div className="filter-row">
          <div className="searchbar"><Search size={18} /><input placeholder={t.searchExpenses} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <select aria-label={t.category} value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">{t.allCategories}</option>
            {categories.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
          <input className="filter-input" aria-label={t.fromDate} type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <input className="filter-input" aria-label={t.toDate} type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          <button className="ghost-button compact-button" type="button" onClick={filterToday}>{t.today}</button>
        </div>
        <div className="data-table">
          <table>
            <thead><tr><th>{t.label}</th><th>{t.category}</th><th>{t.date}</th><th>{t.amount}</th><th></th></tr></thead>
            <tbody>
              {filteredExpenses.map((expense) => (
                <tr key={expense.id}>
                  <td><strong>{expense.label}</strong><span>{expense.note}</span></td>
                  <td>{expense.category}</td>
                  <td>{expense.expense_date}</td>
                  <td>{money(expense.amount)}</td>
                  <td className="row-actions"><button onClick={() => remove(expense.id)}><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {formOpen && (
        <div className="modal-backdrop">
          <form className="panel form-panel form-modal compact-form-modal" onSubmit={submit}>
            <div className="section-title">
              <h2>{t.expenses}</h2>
              <span />
              <button className="ghost-button compact-button" type="button" onClick={() => setFormOpen(false)}><X size={16} /> {t.close}</button>
            </div>
            <label><span>{t.label}</span><div className="field"><input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></div></label>
            <label><span>{t.category}</span><div className="field"><input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></div></label>
            <label><span>{t.amount}</span><div className="field"><input type="number" min={0} step="0.01" value={form.amount === 0 ? "" : form.amount} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} /></div></label>
            <label><span>{t.date}</span><div className="field"><input type="date" value={form.expense_date} onChange={(event) => setForm({ ...form, expense_date: event.target.value })} /></div></label>
            <label><span>{t.note}</span><textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
            {error && <p className="error">{error}</p>}
            <button className="gold-button" disabled={!form.label.trim() || form.amount <= 0}><Save size={18} /> {t.save}</button>
          </form>
        </div>
      )}
    </>
  );
}
