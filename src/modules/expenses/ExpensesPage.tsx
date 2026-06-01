import { FormEvent, useEffect, useMemo, useState } from "react";
import { Save, Search, Trash2 } from "lucide-react";
import { api } from "../../shared/api";
import { money, todayInputValue } from "../../shared/format";
import { useText } from "../../shared/i18n";
import { Expense, ExpenseInput, Language } from "../../shared/types";

const emptyExpense: ExpenseInput = {
  label: "",
  category: "Boutique",
  amount: 0,
  note: "",
  expense_date: todayInputValue()
};

export function ExpensesPage({ language, onChanged }: { language: Language; onChanged: () => void }) {
  const t = useText(language);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [form, setForm] = useState<ExpenseInput>(emptyExpense);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [fromDate, setFromDate] = useState(todayInputValue);
  const [toDate, setToDate] = useState(todayInputValue);

  const load = () => api.expenses().then(setExpenses);
  useEffect(() => {
    void load();
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
    await api.saveExpense(form);
    setForm(emptyExpense);
    await load();
    onChanged();
  }

  async function remove(id: number) {
    await api.deleteExpense(id);
    await load();
    onChanged();
  }

  function filterToday() {
    const today = todayInputValue();
    setFromDate(today);
    setToDate(today);
  }

  return (
    <section className="work-grid">
      <form className="panel form-panel" onSubmit={submit}>
        <div className="section-title"><h2>{t.expenses}</h2><span /></div>
        <label><span>{t.label}</span><div className="field"><input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></div></label>
        <label><span>{t.category}</span><div className="field"><input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></div></label>
        <label><span>{t.amount}</span><div className="field"><input type="number" value={form.amount === 0 ? "" : form.amount} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} /></div></label>
        <label><span>{t.date}</span><div className="field"><input type="date" value={form.expense_date} onChange={(event) => setForm({ ...form, expense_date: event.target.value })} /></div></label>
        <label><span>{t.note}</span><textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
        <button className="gold-button"><Save size={18} /> {t.save}</button>
      </form>

      <section className="panel table-panel">
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
    </section>
  );
}
