import { FormEvent, useEffect, useState } from "react";
import { DatabaseZap, Languages, Plus, Save, SprayCan, UserRound } from "lucide-react";
import { api } from "../../shared/api";
import { useText } from "../../shared/i18n";
import { Flacon, FlaconInput, Language, UserSession } from "../../shared/types";

const emptyFlacon: FlaconInput = { name: "", volume_ml: 0, active: true };

export function SettingsPage({
  language,
  setLanguage,
  user,
  onUserChanged
}: {
  language: Language;
  setLanguage: (language: Language) => void;
  user: UserSession;
  onUserChanged: (user: UserSession) => void;
}) {
  const t = useText(language);
  const [profile, setProfile] = useState({
    username: user.username,
    display_name: user.display_name,
    password: ""
  });
  const [flacons, setFlacons] = useState<Flacon[]>([]);
  const [flaconForm, setFlaconForm] = useState<FlaconInput>(emptyFlacon);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [resetStatus, setResetStatus] = useState("");
  const [resetError, setResetError] = useState("");

  const loadFlacons = () => api.flacons().then(setFlacons);

  useEffect(() => {
    loadFlacons().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus("");
    setError("");
    try {
      const updated = await api.updateProfile({
        id: user.id,
        username: profile.username,
        display_name: profile.display_name,
        password: profile.password
      });
      setProfile({ username: updated.username, display_name: updated.display_name, password: "" });
      onUserChanged(updated);
      setStatus("Profil enregistre");
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

  async function resetDummyData() {
    setResetStatus("");
    setResetError("");
    if (!window.confirm("Reinitialiser la base avec des donnees dummy ? Les produits, ventes, credits et depenses actuels seront remplaces.")) {
      return;
    }
    try {
      await api.resetWithDummyData();
      setResetStatus("Base reinitialisee avec dummy data. Vous pouvez tester Stock, POS, Recettes, Credits et Rapports.");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : String(err));
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

      <form className="setting-row profile-editor" onSubmit={submit}>
        <div><UserRound size={22} /><strong>{t.adminAccount}</strong><span>{user.role}</span></div>
        <div className="profile-fields">
          <label><span>{t.username}</span><div className="field"><input value={profile.username} onChange={(event) => setProfile({ ...profile, username: event.target.value })} /></div></label>
          <label><span>Nom affiche</span><div className="field"><input value={profile.display_name} onChange={(event) => setProfile({ ...profile, display_name: event.target.value })} /></div></label>
          <label><span>Nouveau mot de passe</span><div className="field"><input type="password" value={profile.password} onChange={(event) => setProfile({ ...profile, password: event.target.value })} /></div></label>
          {error && <p className="error">{error}</p>}
          {status && <p className="helper-text">{status}</p>}
          <button className="gold-button" disabled={!profile.username.trim() || !profile.display_name.trim()}><Save size={18} /> {t.save}</button>
        </div>
      </form>

      <article className="setting-row flacon-settings">
        <div><SprayCan size={22} /><strong>Flacons parfumerie</strong><span>Tailles reutilisables pour le POS parfumerie.</span></div>
        <form className="flacon-form" onSubmit={saveFlacon}>
          <label><span>Nom</span><div className="field"><input placeholder="6ml" value={flaconForm.name} onChange={(event) => setFlaconForm({ ...flaconForm, name: event.target.value })} /></div></label>
          <label><span>Volume ml</span><div className="field"><input type="number" min={0} step="0.1" value={flaconForm.volume_ml === 0 ? "" : flaconForm.volume_ml} onChange={(event) => setFlaconForm({ ...flaconForm, volume_ml: Number(event.target.value) })} /></div></label>
          <button className="gold-button" disabled={!flaconForm.name.trim() || flaconForm.volume_ml <= 0}><Plus size={17} /> Ajouter flacon</button>
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

      <article className="setting-row debug-reset-row">
        <div>
          <DatabaseZap size={22} />
          <strong>Temp test data</strong>
          <span>Reinitialise les donnees business pour tester tous les modules avec des chiffres reels.</span>
        </div>
        <div className="profile-fields">
          <p className="helper-text">Attention: ce bouton remplace produits, ventes, credits et depenses par des donnees dummy. Le compte admin reste conserve.</p>
          {resetError && <p className="error">{resetError}</p>}
          {resetStatus && <p className="helper-text">{resetStatus}</p>}
          <button className="ghost-button danger-action" type="button" onClick={() => void resetDummyData()}>
            <DatabaseZap size={18} /> Reset dummy data
          </button>
        </div>
      </article>
    </section>
  );
}
