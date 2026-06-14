import { FormEvent, useEffect, useState } from "react";
import { Languages, Plus, Printer, Save, SprayCan } from "lucide-react";
import { api } from "../../shared/api";
import { useText } from "../../shared/i18n";
import { Flacon, FlaconInput, Language, PrinterSettings } from "../../shared/types";

const emptyFlacon: FlaconInput = { name: "", volume_ml: 0, active: true };
const emptyPrinterSettings: PrinterSettings = { invoice_printer: "", barcode_printer: "" };

export function SettingsPage({ language, setLanguage }: { language: Language; setLanguage: (language: Language) => void }) {
  const t = useText(language);
  const [flacons, setFlacons] = useState<Flacon[]>([]);
  const [flaconForm, setFlaconForm] = useState<FlaconInput>(emptyFlacon);
  const [printers, setPrinters] = useState<string[]>([]);
  const [printerSettings, setPrinterSettings] = useState<PrinterSettings>(emptyPrinterSettings);
  const [printerMessage, setPrinterMessage] = useState("");
  const [error, setError] = useState("");

  const loadFlacons = () => api.flacons().then(setFlacons);

  useEffect(() => {
    loadFlacons().catch((err) => setError(err instanceof Error ? err.message : String(err)));
    Promise.all([api.printers(), api.printerSettings()])
      .then(([printerNames, settings]) => {
        setPrinters(printerNames);
        setPrinterSettings(settings);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function savePrinters() {
    setError("");
    setPrinterMessage("");
    try {
      const saved = await api.savePrinterSettings(printerSettings);
      setPrinterSettings(saved);
      setPrinterMessage("Imprimantes enregistrees.");
      window.setTimeout(() => setPrinterMessage(""), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveFlacon(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api.saveFlacon(flaconForm);
      setFlaconForm(emptyFlacon);
      await loadFlacons();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="panel settings-panel">
      <div className="section-title"><h2>{t.settings}</h2><span /></div>
      <article className="setting-row">
        <div><Languages size={22} /><strong>{t.language}</strong><span>{t.languagePair}</span></div>
        <div className="segmented">
          <button className={language === "fr" ? "active" : ""} onClick={() => setLanguage("fr")}>FR</button>
          <button className={language === "ar" ? "active" : ""} onClick={() => setLanguage("ar")}>AR</button>
        </div>
      </article>

      <article className="setting-row printer-settings">
        <div>
          <Printer size={22} />
          <strong>Imprimantes</strong>
          <span>Choisir une imprimante separee pour les tickets POS et les codes-barres.</span>
        </div>
        <div className="printer-settings-grid">
          <label>
            <span>Ticket de caisse</span>
            <div className="field">
              <select value={printerSettings.invoice_printer} onChange={(event) => setPrinterSettings({ ...printerSettings, invoice_printer: event.target.value })}>
                <option value="">Imprimante par defaut</option>
                {printers.map((printer) => <option key={printer} value={printer}>{printer}</option>)}
              </select>
            </div>
          </label>
          <label>
            <span>Etiquettes code-barres</span>
            <div className="field">
              <select value={printerSettings.barcode_printer} onChange={(event) => setPrinterSettings({ ...printerSettings, barcode_printer: event.target.value })}>
                <option value="">Imprimante par defaut</option>
                {printers.map((printer) => <option key={printer} value={printer}>{printer}</option>)}
              </select>
            </div>
          </label>
          <button className="gold-button" type="button" onClick={() => void savePrinters()}><Save size={17} /> Enregistrer imprimantes</button>
          {!printers.length && <p className="helper-text">Aucune imprimante detectee. Verifiez Windows puis revenez ici.</p>}
          {printerMessage && <p className="success-text">{printerMessage}</p>}
        </div>
      </article>

      <article className="setting-row flacon-settings">
        <div><SprayCan size={22} /><strong>Flacons parfumerie</strong><span>Tailles reutilisables pour le POS parfumerie.</span></div>
        <form className="flacon-form" onSubmit={saveFlacon}>
          <label><span>Nom</span><div className="field"><input placeholder="6ml" value={flaconForm.name} onChange={(event) => setFlaconForm({ ...flaconForm, name: event.target.value })} /></div></label>
          <label><span>Volume ml</span><div className="field"><input type="number" min={0} step="0.1" value={flaconForm.volume_ml === 0 ? "" : flaconForm.volume_ml} onChange={(event) => setFlaconForm({ ...flaconForm, volume_ml: Number(event.target.value) })} /></div></label>
          <button className="gold-button" disabled={!flaconForm.name.trim() || flaconForm.volume_ml <= 0}><Plus size={17} /> Ajouter flacon</button>
          {error && <p className="error">{error}</p>}
        </form>
        <div className="flacon-list">
          {flacons.map((flacon) => (
            <button key={flacon.id} type="button" className="credit-row" onClick={() => setFlaconForm({ id: flacon.id, name: flacon.name, volume_ml: flacon.volume_ml, active: flacon.active })}>
              <span><strong>{flacon.name}</strong><small>{flacon.volume_ml} ml</small></span>
              <span className={`status-pill ${flacon.active ? "ok" : "warning"}`}>{flacon.active ? "Actif" : "Inactif"}</span>
            </button>
          ))}
        </div>
        {flaconForm.id && (
          <button className="ghost-button compact-button" type="button" onClick={() => setFlaconForm(emptyFlacon)}>
            <Save size={16} /> Nouveau flacon
          </button>
        )}
      </article>
    </section>
  );
}
