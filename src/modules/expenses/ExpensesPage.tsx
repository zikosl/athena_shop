import { FormEvent, useEffect, useMemo, useState } from "react";
import { Plus, Save, Search, Trash2, X } from "lucide-react";
import { api } from "../../shared/api";
import { money, todayInputValue } from "../../shared/format";
import { localized, useText } from "../../shared/i18n";
import { showErrorToast, showToast } from "../../shared/toast";
import { Expense, ExpenseInput, Language } from "../../shared/types";
import { Button, SectionHeader, SelectControl, TextAreaField, TextField } from "../../shared/ui";

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
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [fromDate, setFromDate] = useState(todayInputValue);
  const [toDate, setToDate] = useState(todayInputValue);
  const load = () => api.expenses().then(setExpenses);
  useEffect(() => {
    load().catch((err) => showErrorToast(err, localized(language, "تعذر تحميل المصاريف", "Impossible de charger les dépenses")));
  }, [language]);

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
    if (!form.label.trim() || form.amount <= 0) {
      showToast(localized(language, "التسمية والمبلغ الصحيحان إجباريان", "Un libellé et un montant valide sont obligatoires"), "warning");
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
      showToast(localized(language, "تم حفظ المصروف", "Dépense enregistrée"), "success");
    } catch (err) {
      showErrorToast(err, localized(language, "تعذر حفظ المصروف", "Impossible d’enregistrer la dépense"));
    }
  }

  async function remove(expense: Expense) {
    if (!window.confirm(localized(language, `هل تريد حذف المصروف "${expense.label}"؟ سيتم إنقاصه من سجلات المصاريف.`, `Supprimer la dépense « ${expense.label} » ? Elle sera retirée des registres.`))) return;
    try {
      await api.deleteExpense(expense.id);
      await load();
      onChanged();
      showToast(localized(language, "تم حذف المصروف", "Dépense supprimée"), "success");
    } catch (err) {
      showErrorToast(err, localized(language, "تعذر حذف المصروف", "Impossible de supprimer la dépense"));
    }
  }

  function filterToday() {
    const today = todayInputValue();
    setFromDate(today);
    setToDate(today);
  }

  function openNewExpense() {
    setForm(newExpense());
    setFormOpen(true);
  }

  return (
    <>
      <section className="panel table-panel full">
        <SectionHeader title={t.expenses}>
          <Button variant="primary" size="compact" type="button" onClick={openNewExpense}>
            <Plus size={17} /> {localized(language, "مصروف جديد", "Nouvelle dépense")}
          </Button>
        </SectionHeader>
        <div className="filter-row">
          <div className="searchbar"><Search size={18} /><input placeholder={t.searchExpenses} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <SelectControl aria-label={t.category} value={category} onValueChange={setCategory} options={[{ value: "", label: t.allCategories }, ...categories.map((item) => ({ value: item, label: item }))]} />
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
                  <td className="row-actions"><button className="danger-action" onClick={() => remove(expense)}><Trash2 size={16} /></button></td>
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
            <TextField label={t.label} value={form.label} onValueChange={(label) => setForm({ ...form, label })} />
            <TextField label={t.category} value={form.category} onValueChange={(category) => setForm({ ...form, category })} />
            <TextField label={t.amount} type="number" min={0} step="0.01" value={form.amount} onValueChange={(value) => setForm({ ...form, amount: Number(value) })} />
            <TextField label={t.date} type="date" value={form.expense_date} onValueChange={(expense_date) => setForm({ ...form, expense_date })} />
            <TextAreaField label={t.note} value={form.note} onValueChange={(note) => setForm({ ...form, note })} />
            <button className="gold-button" disabled={!form.label.trim() || form.amount <= 0}><Save size={18} /> {t.save}</button>
          </form>
        </div>
      )}
    </>
  );
}
