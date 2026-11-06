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
import { Button, SelectField, TextAreaField, TextField } from "../../shared/ui";

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
            <TextField label="العنوان" value={purchaseForm.title} onValueChange={(title) => setPurchaseForm({ ...purchaseForm, title })} />
            <SelectField label="العطر اختياري" value={String(purchaseForm.perfume_id ?? "")} onValueChange={(value) => setPurchaseForm({ ...purchaseForm, perfume_id: Number(value) || undefined })} options={[{ value: "", label: "شراء عام" }, ...perfumes.map((perfume) => ({ value: String(perfume.id), label: perfume.name }))]} />
            <TextField label="المبلغ" type="number" min={0} value={purchaseForm.amount} onValueChange={(value) => setPurchaseForm({ ...purchaseForm, amount: Number(value) })} />
            <TextField label="الكمية ml اختياري" type="number" min={0} step="0.1" value={purchaseForm.volume_ml} onValueChange={(value) => setPurchaseForm({ ...purchaseForm, volume_ml: Number(value) })} />
            <TextAreaField label="ملاحظة" value={purchaseForm.note} onValueChange={(note) => setPurchaseForm({ ...purchaseForm, note })} />
            <Button variant="primary" disabled={!purchaseForm.title.trim()}><Save size={18} /> حفظ الشراء</Button>
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
            <TextField label="الحجم" placeholder="6ml" value={flaconForm.name} onValueChange={(name) => setFlaconForm({ ...flaconForm, name })} />
            <SelectField label="النوع" value={flaconForm.flacon_type} onValueChange={(flacon_type) => setFlaconForm({ ...flaconForm, flacon_type: flacon_type as FlaconInput["flacon_type"] })} options={["x1", "x2", "x3"].map((value) => ({ value, label: value }))} />
            <TextField label="الحجم ml" type="number" min={0} step="0.1" value={flaconForm.volume_ml} onValueChange={(value) => setFlaconForm({ ...flaconForm, volume_ml: Number(value) })} />
            <TextField label="سعر البيع" type="number" min={0} value={flaconForm.sale_price} onValueChange={(value) => setFlaconForm({ ...flaconForm, sale_price: Number(value) })} />
            <label className="toggle-row"><input type="checkbox" checked={flaconForm.active} onChange={(event) => setFlaconForm({ ...flaconForm, active: event.target.checked })} /><span>نشطة</span></label>
            <Button variant="primary" disabled={!flaconForm.name.trim() || flaconForm.volume_ml <= 0}><Save size={18} /> حفظ القارورة</Button>
            {flaconForm.id && <Button size="compact" type="button" onClick={() => setFlaconForm(emptyFlacon)}><Plus size={16} /> قارورة جديدة</Button>}
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
              <TextField label="اسم العطر" value={perfumeForm.name} onValueChange={(name) => setPerfumeForm({ ...perfumeForm, name })} />
              <TextField label="العائلة" value={perfumeForm.family} onValueChange={(family) => setPerfumeForm({ ...perfumeForm, family })} />
            </div>
            <p className="helper-text">إدخال الكميات والمبالغ يتم من قسم مشتريات العطور.</p>
            <Button variant="primary" disabled={!perfumeForm.name.trim()}><Save size={18} /> حفظ العطر</Button>
          </form>
        </div>
      )}
    </section>
  );
}
