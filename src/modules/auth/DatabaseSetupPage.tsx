import { useState } from "react";
import { Database } from "lucide-react";
import { api } from "../../shared/api";
import { showErrorToast, showToast } from "../../shared/toast";
import { Language } from "../../shared/types";
import { Button } from "../../shared/ui";
import { localized } from "../../shared/i18n";
import openzeyLogo from "../../assets/openzey-logo.png";

export function DatabaseSetupPage({ language, onConfigured }: { language: Language; onConfigured: () => void }) {
  const [saving, setSaving] = useState(false);

  async function initialize() {
    setSaving(true);
    try {
      await api.configureDatabase();
      showToast(localized(language, "تم إعداد قاعدة البيانات المحلية", "Base de données locale configurée"), "success");
      onConfigured();
    } catch (err) {
      showErrorToast(err, localized(language, "تعذر إعداد قاعدة البيانات المحلية", "Impossible de configurer la base de données locale"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="login-shell">
      <div className="particles" />
      <section className="login-card setup-card">
        <div className="login-brand">
          <img src={openzeyLogo} alt="OpenZey" className="brand-logo" />
          <div>
            <h1>OpenSoft</h1>
            <p>{localized(language, "إدارة المتجر", "Gestion de magasin")}</p>
          </div>
        </div>
        <h2>{localized(language, "قاعدة البيانات المحلية", "Base de données locale")}</h2>
        <p className="helper-text">
          {localized(language, "سيتم حفظ بيانات المتجر على هذا الجهاز فقط.", "Les données du magasin seront enregistrées sur cet ordinateur uniquement.")}
        </p>
        <Button variant="primary" type="button" disabled={saving} onClick={initialize}>
          <Database size={18} />
          {saving ? localized(language, "جارٍ الإعداد...", "Configuration...") : localized(language, "إعداد قاعدة البيانات", "Configurer la base de données")}
        </Button>
      </section>
    </main>
  );
}
