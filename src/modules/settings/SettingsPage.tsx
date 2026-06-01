import { Languages } from "lucide-react";
import { useText } from "../../shared/i18n";
import { Language } from "../../shared/types";

export function SettingsPage({ language, setLanguage }: { language: Language; setLanguage: (language: Language) => void }) {
  const t = useText(language);
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
      <article className="setting-row">
        <div><strong>{t.adminAccount}</strong><span>{t.defaultUser}</span></div>
      </article>
      <article className="setting-row">
        <div><strong>{t.database}</strong><span>{t.databaseInfo}</span></div>
      </article>
    </section>
  );
}
