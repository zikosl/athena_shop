import { FormEvent, useState } from "react";
import { Languages, Save, UserRound } from "lucide-react";
import { api } from "../../shared/api";
import { useText } from "../../shared/i18n";
import { Language, UserSession } from "../../shared/types";

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
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

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
      setStatus("Profil enregistré");
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

      <form className="setting-row profile-editor" onSubmit={submit}>
        <div><UserRound size={22} /><strong>{t.adminAccount}</strong><span>{user.role}</span></div>
        <div className="profile-fields">
          <label><span>{t.username}</span><div className="field"><input value={profile.username} onChange={(event) => setProfile({ ...profile, username: event.target.value })} /></div></label>
          <label><span>Nom affiché</span><div className="field"><input value={profile.display_name} onChange={(event) => setProfile({ ...profile, display_name: event.target.value })} /></div></label>
          <label><span>Nouveau mot de passe</span><div className="field"><input type="password" value={profile.password} onChange={(event) => setProfile({ ...profile, password: event.target.value })} /></div></label>
          {error && <p className="error">{error}</p>}
          {status && <p className="helper-text">{status}</p>}
          <button className="gold-button" disabled={!profile.username.trim() || !profile.display_name.trim()}><Save size={18} /> {t.save}</button>
        </div>
      </form>
    </section>
  );
}
