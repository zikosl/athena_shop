import { FormEvent, useEffect, useMemo, useState } from "react";
import { Edit3, Plus, Save, Search, SprayCan, X } from "lucide-react";
import { api } from "../../shared/api";
import { money } from "../../shared/format";
import { Flacon, Language, Perfume, PerfumeInput } from "../../shared/types";

const emptyPerfume: PerfumeInput = {
  name: "",
  family: "Musc",
  added_volume_ml: 0,
  total_purchase_price: 0,
  low_stock_ml: 30,
  prices: []
};

export function PerfumeryPage({ onChanged }: { language: Language; onChanged: () => void }) {
  const [perfumes, setPerfumes] = useState<Perfume[]>([]);
  const [flacons, setFlacons] = useState<Flacon[]>([]);
  const [form, setForm] = useState<PerfumeInput>(emptyPerfume);
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [nextPerfumes, nextFlacons] = await Promise.all([api.perfumes(), api.flacons()]);
    setPerfumes(nextPerfumes);
    setFlacons(nextFlacons.filter((flacon) => flacon.active));
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return perfumes.filter((perfume) => !normalized || [perfume.name, perfume.family]
      .some((value) => value.toLowerCase().includes(normalized)));
  }, [perfumes, query]);

  const totals = useMemo(() => ({
    remaining: filtered.reduce((sum, perfume) => sum + perfume.remaining_volume_ml, 0),
    purchase: filtered.reduce((sum, perfume) => sum + perfume.cost_per_ml * perfume.remaining_volume_ml, 0),
    alerts: filtered.filter((perfume) => perfume.remaining_volume_ml <= perfume.low_stock_ml).length
  }), [filtered]);

  function openNew() {
    setError("");
    setForm({
      ...emptyPerfume,
      prices: flacons.map((flacon) => ({ flacon_id: flacon.id, sale_price: 0 }))
    });
    setFormOpen(true);
  }

  function openEdit(perfume: Perfume) {
    setError("");
    setForm({
      id: perfume.id,
      name: perfume.name,
      family: perfume.family,
      added_volume_ml: 0,
      total_purchase_price: 0,
      low_stock_ml: perfume.low_stock_ml,
      prices: flacons.map((flacon) => ({
        flacon_id: flacon.id,
        sale_price: perfume.prices.find((price) => price.flacon_id === flacon.id)?.sale_price ?? 0
      }))
    });
    setFormOpen(true);
  }

  function setPrice(flaconId: number, salePrice: number) {
    setForm((current) => ({
      ...current,
      prices: current.prices.map((price) => price.flacon_id === flaconId ? { ...price, sale_price: salePrice } : price)
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api.savePerfume(form);
      setForm(emptyPerfume);
      setFormOpen(false);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <section className="panel table-panel full">
        <div className="section-title">
          <h2><SprayCan size={18} /> Perfumerie</h2>
          <span />
          <button className="gold-button compact-button" type="button" onClick={openNew}><Plus size={17} /> Nouveau parfum</button>
        </div>
        <div className="summary-strip stock-summary">
          <article><span>Volume restant</span><strong>{totals.remaining.toFixed(1)} ml</strong></article>
          <article><span>Valeur restante</span><strong>{money(totals.purchase)}</strong></article>
          <article><span>Alertes</span><strong>{totals.alerts}</strong></article>
        </div>
        {error && !formOpen && <p className="error">{error}</p>}
        <div className="filter-row">
          <div className="searchbar"><Search size={18} /><input placeholder="Rechercher parfum, famille..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        </div>
        <div className="data-table">
          <table>
            <thead><tr><th>Parfum</th><th>Famille</th><th>Restant</th><th>Cout/ml</th><th>Alerte</th><th>Prix flacons</th><th></th></tr></thead>
            <tbody>
              {filtered.map((perfume) => (
                <tr key={perfume.id} className={perfume.remaining_volume_ml <= perfume.low_stock_ml ? "low-row" : ""}>
                  <td><strong>{perfume.name}</strong><span>{perfume.total_volume_ml.toFixed(1)} ml introduits</span></td>
                  <td>{perfume.family}</td>
                  <td>{perfume.remaining_volume_ml.toFixed(1)} ml</td>
                  <td>{money(perfume.cost_per_ml)}</td>
                  <td>{perfume.low_stock_ml} ml</td>
                  <td>{perfume.prices.map((price) => `${price.flacon_name}: ${money(price.sale_price)}`).join(" · ")}</td>
                  <td className="row-actions"><button onClick={() => openEdit(perfume)}><Edit3 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {formOpen && (
        <div className="modal-backdrop">
          <form className="panel form-panel form-modal" onSubmit={submit}>
            <div className="section-title">
              <h2><SprayCan size={18} /> {form.id ? "Modifier / recharger parfum" : "Nouveau parfum"}</h2>
              <span />
              <button className="ghost-button compact-button" type="button" onClick={() => setFormOpen(false)}><X size={16} /> Fermer</button>
            </div>
            <div className="form-grid">
              <label><span>Nom du parfum</span><div className="field"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div></label>
              <label><span>Famille</span><div className="field"><input value={form.family} onChange={(event) => setForm({ ...form, family: event.target.value })} /></div></label>
              <label><span>{form.id ? "Volume ajouté ml" : "Volume initial ml"}</span><div className="field"><input type="number" min={0} step="0.1" value={form.added_volume_ml === 0 ? "" : form.added_volume_ml} onChange={(event) => setForm({ ...form, added_volume_ml: Number(event.target.value) })} /></div></label>
              <label><span>Prix achat total du volume</span><div className="field"><input type="number" min={0} value={form.total_purchase_price === 0 ? "" : form.total_purchase_price} onChange={(event) => setForm({ ...form, total_purchase_price: Number(event.target.value) })} /></div></label>
              <label><span>Alerte stock ml</span><div className="field"><input type="number" min={0} value={form.low_stock_ml} onChange={(event) => setForm({ ...form, low_stock_ml: Number(event.target.value) })} /></div></label>
            </div>
            <div className="price-grid">
              {flacons.map((flacon) => (
                <label key={flacon.id}><span>{flacon.name} ({flacon.volume_ml} ml)</span><div className="field"><input type="number" min={0} value={form.prices.find((price) => price.flacon_id === flacon.id)?.sale_price || ""} onChange={(event) => setPrice(flacon.id, Number(event.target.value))} /></div></label>
              ))}
            </div>
            {error && <p className="error">{error}</p>}
            <button className="gold-button"><Save size={18} /> Enregistrer parfum</button>
          </form>
        </div>
      )}
    </>
  );
}
