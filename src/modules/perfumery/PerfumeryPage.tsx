import { FormEvent, useEffect, useMemo, useState } from "react";
import { Edit3, PackagePlus, Plus, Save, Search, SprayCan, X } from "lucide-react";
import { api } from "../../shared/api";
import { money } from "../../shared/format";
import { showErrorToast, showToast } from "../../shared/toast";
import {
  Flacon,
  FlaconInput,
  Language,
  Perfume,
  PerfumeInput,
  PerfumePurchase,
  PerfumePurchaseInput
} from "../../shared/types";

type Tab = "perfumes" | "purchases" | "flacons";

const emptyPerfume: PerfumeInput = {
  name: "",
  family: "مسك",
  added_volume_ml: 0,
  total_purchase_price: 0,
  low_stock_ml: 0,
  prices: []
};

const emptyPurchase: PerfumePurchaseInput = {
  perfume_id: undefined,
  title: "",
  amount: 0,
  volume_ml: 0,
  note: ""
};

const emptyFlacon: FlaconInput = {
  name: "",
  flacon_type: "x1",
  volume_ml: 0,
  sale_price: 0,
  active: true
};

export function PerfumeryPage({ onChanged }: { language: Language; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>("perfumes");
  const [perfumes, setPerfumes] = useState<Perfume[]>([]);
  const [purchases, setPurchases] = useState<PerfumePurchase[]>([]);
  const [flacons, setFlacons] = useState<Flacon[]>([]);
  const [perfumeForm, setPerfumeForm] = useState<PerfumeInput | null>(null);
  const [purchaseForm, setPurchaseForm] = useState<PerfumePurchaseInput>(emptyPurchase);
  const [flaconForm, setFlaconForm] = useState<FlaconInput>(emptyFlacon);
  const [query, setQuery] = useState("");

  async function load() {
    const [nextPerfumes, nextFlacons, nextPurchases] = await Promise.all([
      api.perfumes(),
      api.flacons(),
      api.perfumePurchases()
    ]);
    setPerfumes(nextPerfumes);
    setFlacons(nextFlacons);
    setPurchases(nextPurchases);
  }

  useEffect(() => {
    load().catch((err) => showErrorToast(err, "تعذر تحميل بيانات العطور"));
  }, []);

  const filteredPerfumes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return perfumes.filter((perfume) => !normalized || [perfume.name, perfume.family]
      .some((value) => value.toLowerCase().includes(normalized)));
  }, [perfumes, query]);

  const purchaseTotal = purchases.reduce((sum, purchase) => sum + purchase.amount, 0);

  function openNewPerfume() {
    setPerfumeForm({
      ...emptyPerfume,
      prices: flacons.filter((flacon) => flacon.active).map((flacon) => ({
        flacon_id: flacon.id,
        sale_price: flacon.sale_price
      }))
    });
  }

  function openEditPerfume(perfume: Perfume) {
    setPerfumeForm({
      id: perfume.id,
      name: perfume.name,
      family: perfume.family,
      added_volume_ml: 0,
      total_purchase_price: 0,
      low_stock_ml: perfume.low_stock_ml,
      prices: flacons.filter((flacon) => flacon.active).map((flacon) => ({
        flacon_id: flacon.id,
        sale_price: flacon.sale_price
      }))
    });
  }

  async function savePerfume(event: FormEvent) {
    event.preventDefault();
    if (!perfumeForm) return;
    try {
      await api.savePerfume(perfumeForm);
      setPerfumeForm(null);
      await load();
      onChanged();
      showToast("تم حفظ العطر", "success");
    } catch (err) {
      showErrorToast(err, "تعذر حفظ العطر");
    }
  }

  async function savePurchase(event: FormEvent) {
    event.preventDefault();
    try {
      await api.savePerfumePurchase({
        ...purchaseForm,
        perfume_id: purchaseForm.perfume_id || undefined
      });
      setPurchaseForm(emptyPurchase);
      await load();
      onChanged();
      showToast("تم حفظ شراء العطر", "success");
    } catch (err) {
      showErrorToast(err, "تعذر حفظ شراء العطر");
    }
  }

  async function saveFlacon(event: FormEvent) {
    event.preventDefault();
    try {
      await api.saveFlacon(flaconForm);
      setFlaconForm(emptyFlacon);
      await load();
      onChanged();
      showToast("تم حفظ القارورة", "success");
    } catch (err) {
      showErrorToast(err, "تعذر حفظ القارورة");
    }
  }

  return (
    <section className="panel table-panel full perfumery-workspace">
      <div className="section-title">
        <h2><SprayCan size={18} /> العطور</h2>
        <span />
        <button className="gold-button compact-button" type="button" onClick={openNewPerfume}><Plus size={17} /> عطر جديد</button>
      </div>

      <div className="segmented wide perfumery-tabs">
        <button className={tab === "perfumes" ? "active" : ""} type="button" onClick={() => setTab("perfumes")}>العطور</button>
        <button className={tab === "purchases" ? "active" : ""} type="button" onClick={() => setTab("purchases")}>مشتريات العطور</button>
        <button className={tab === "flacons" ? "active" : ""} type="button" onClick={() => setTab("flacons")}>القوارير</button>
      </div>


      {tab === "perfumes" && (
        <>
          <div className="summary-strip stock-summary">
            <article><span>عدد العطور</span><strong>{perfumes.length}</strong></article>
            <article><span>القوارير النشطة</span><strong>{flacons.filter((flacon) => flacon.active).length}</strong></article>
            <article><span>مشتريات العطور</span><strong>{money(purchaseTotal)}</strong></article>
          </div>
          <div className="filter-row">
            <div className="searchbar"><Search size={18} /><input placeholder="بحث عن عطر أو عائلة..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          </div>
          <div className="data-table">
            <table>
              <thead><tr><th>العطر</th><th>العائلة</th><th>أسعار القوارير</th><th></th></tr></thead>
              <tbody>
                {filteredPerfumes.map((perfume) => (
                  <tr key={perfume.id}>
                    <td><strong>{perfume.name}</strong></td>
                    <td>{perfume.family}</td>
                    <td>{perfume.prices.filter((price) => price.sale_price > 0).map((price) => `${price.flacon_name}: ${money(price.sale_price)}`).join(" · ") || "لا توجد أسعار"}</td>
                    <td className="row-actions"><button type="button" onClick={() => openEditPerfume(perfume)}><Edit3 size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "purchases" && (
        <div className="perfumery-two-column">
          <form className="mini-panel perfumery-form" onSubmit={savePurchase}>
            <h3><PackagePlus size={17} /> إضافة شراء عطور</h3>
            <label><span>العنوان</span><div className="field"><input value={purchaseForm.title} onChange={(event) => setPurchaseForm({ ...purchaseForm, title: event.target.value })} /></div></label>
            <label><span>العطر اختياري</span><div className="field"><select value={purchaseForm.perfume_id ?? ""} onChange={(event) => setPurchaseForm({ ...purchaseForm, perfume_id: Number(event.target.value) || undefined })}>
              <option value="">شراء عام</option>
              {perfumes.map((perfume) => <option key={perfume.id} value={perfume.id}>{perfume.name}</option>)}
            </select></div></label>
            <label><span>المبلغ</span><div className="field"><input type="number" min={0} value={purchaseForm.amount || ""} onChange={(event) => setPurchaseForm({ ...purchaseForm, amount: Number(event.target.value) })} /></div></label>
            <label><span>الكمية ml اختياري</span><div className="field"><input type="number" min={0} step="0.1" value={purchaseForm.volume_ml || ""} onChange={(event) => setPurchaseForm({ ...purchaseForm, volume_ml: Number(event.target.value) })} /></div></label>
            <label><span>ملاحظة</span><textarea value={purchaseForm.note} onChange={(event) => setPurchaseForm({ ...purchaseForm, note: event.target.value })} /></label>
            <button className="gold-button" disabled={!purchaseForm.title.trim()}><Save size={18} /> حفظ الشراء</button>
          </form>

          <div className="perfumery-list">
            {purchases.map((purchase) => (
              <article className="credit-row" key={purchase.id}>
                <span>
                  <strong>{purchase.title}</strong>
                  <small>{purchase.perfume_name || "شراء عام"}{purchase.volume_ml > 0 ? ` · ${purchase.volume_ml} ml` : ""}</small>
                </span>
                <b>{money(purchase.amount)}</b>
              </article>
            ))}
            {!purchases.length && <p className="empty-state">لا توجد مشتريات عطور بعد.</p>}
          </div>
        </div>
      )}

      {tab === "flacons" && (
        <div className="perfumery-two-column">
          <form className="mini-panel perfumery-form" onSubmit={saveFlacon}>
            <h3><SprayCan size={17} /> قارورة</h3>
            <label><span>الحجم</span><div className="field"><input placeholder="6ml" value={flaconForm.name} onChange={(event) => setFlaconForm({ ...flaconForm, name: event.target.value })} /></div></label>
            <label><span>النوع</span><div className="field"><select value={flaconForm.flacon_type} onChange={(event) => setFlaconForm({ ...flaconForm, flacon_type: event.target.value as FlaconInput["flacon_type"] })}>
              <option value="x1">x1</option>
              <option value="x2">x2</option>
              <option value="x3">x3</option>
            </select></div></label>
            <label><span>الحجم ml</span><div className="field"><input type="number" min={0} step="0.1" value={flaconForm.volume_ml || ""} onChange={(event) => setFlaconForm({ ...flaconForm, volume_ml: Number(event.target.value) })} /></div></label>
            <label><span>سعر البيع</span><div className="field"><input type="number" min={0} value={flaconForm.sale_price || ""} onChange={(event) => setFlaconForm({ ...flaconForm, sale_price: Number(event.target.value) })} /></div></label>
            <label className="toggle-row"><input type="checkbox" checked={flaconForm.active} onChange={(event) => setFlaconForm({ ...flaconForm, active: event.target.checked })} /><span>نشطة</span></label>
            <button className="gold-button" disabled={!flaconForm.name.trim() || flaconForm.volume_ml <= 0}><Save size={18} /> حفظ القارورة</button>
            {flaconForm.id && <button className="ghost-button compact-button" type="button" onClick={() => setFlaconForm(emptyFlacon)}><Plus size={16} /> قارورة جديدة</button>}
          </form>

          <div className="perfumery-list flacon-card-list">
            {flacons.map((flacon) => (
              <button
                key={flacon.id}
                type="button"
                className="credit-row"
                onClick={() => setFlaconForm({
                  id: flacon.id,
                  name: flacon.name,
                  flacon_type: flacon.flacon_type,
                  volume_ml: flacon.volume_ml,
                  sale_price: flacon.sale_price,
                  active: flacon.active
                })}
              >
                <span>
                  <strong>{flacon.name} {flacon.flacon_type}</strong>
                  <small>{flacon.volume_ml} ml · {money(flacon.sale_price)}</small>
                </span>
                <span className={`status-pill ${flacon.active ? "ok" : "neutral"}`}>{flacon.active ? "نشطة" : "متوقفة"}</span>
              </button>
            ))}
            {!flacons.length && <p className="empty-state">لا توجد قوارير بعد.</p>}
          </div>
        </div>
      )}

      {perfumeForm && (
        <div className="modal-backdrop">
          <form className="panel form-panel form-modal" onSubmit={savePerfume}>
            <div className="section-title">
              <h2><SprayCan size={18} /> {perfumeForm.id ? "تعديل العطر" : "عطر جديد"}</h2>
              <span />
              <button className="ghost-button compact-button" type="button" onClick={() => setPerfumeForm(null)}><X size={16} /> إغلاق</button>
            </div>
            <div className="form-grid">
              <label><span>اسم العطر</span><div className="field"><input value={perfumeForm.name} onChange={(event) => setPerfumeForm({ ...perfumeForm, name: event.target.value })} /></div></label>
              <label><span>العائلة</span><div className="field"><input value={perfumeForm.family} onChange={(event) => setPerfumeForm({ ...perfumeForm, family: event.target.value })} /></div></label>
            </div>
            <p className="helper-text">إدخال الكميات والمبالغ يتم من قسم مشتريات العطور.</p>
            <button className="gold-button" disabled={!perfumeForm.name.trim()}><Save size={18} /> حفظ العطر</button>
          </form>
        </div>
      )}
    </section>
  );
}
