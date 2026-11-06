import { FormEvent, useState } from "react";
import { Database, Server, User } from "lucide-react";
import { api } from "../../shared/api";
import { showErrorToast, showToast } from "../../shared/toast";
import { Language, PostgresConfig } from "../../shared/types";
import { Button, TextField } from "../../shared/ui";
import { localized } from "../../shared/i18n";
import openzeyLogo from "../../assets/openzey-logo.png";

export function DatabaseSetupPage({ language, onConfigured }: { language: Language; onConfigured: () => void }) {
  const [form, setForm] = useState<PostgresConfig>({
    host: "localhost",
    port: 5432,
    database: "",
    user: "postgres",
    password: ""
  });
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.configureDatabase(form);
      showToast(localized(language, "تم الاتصال بقاعدة البيانات وإعداد مساحة العمل", "Base de données connectée et espace de travail configuré"), "success");
      onConfigured();
    } catch (err) {
      showErrorToast(err, localized(language, "تعذر الاتصال بقاعدة البيانات", "Connexion à la base de données impossible"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="login-shell">
      <div className="particles" />
      <form className="login-card setup-card" onSubmit={submit}>
        <div className="login-brand">
          <img src={openzeyLogo} alt="OpenZey" className="brand-logo" />
          <div>
            <h1>OpenSoft</h1>
            <p>{localized(language, "إعداد مساحة عمل المؤسسة", "Configuration de l’espace de travail")}</p>
          </div>
        </div>
        <h2>{localized(language, "إعداد قاعدة البيانات", "Configuration de la base de données")}</h2>
        <p className="helper-text">{localized(language, "أدخل معلومات خادم PostgreSQL. سيتم إنشاء قاعدة البيانات إذا كان المستخدم يملك الصلاحية.", "Saisissez les paramètres PostgreSQL. La base sera créée si l’utilisateur dispose des droits nécessaires.")}</p>
        <TextField label={localized(language, "الخادم", "Hôte")} icon={<Server size={18} />} value={form.host} onValueChange={(host) => setForm({ ...form, host })} />
        <TextField label={localized(language, "المنفذ", "Port")} type="number" value={form.port} onValueChange={(port) => setForm({ ...form, port: Number(port) })} />
        <TextField label={localized(language, "قاعدة البيانات", "Base de données")} icon={<Database size={18} />} value={form.database} onValueChange={(database) => setForm({ ...form, database })} />
        <TextField label={localized(language, "المستخدم", "Utilisateur")} icon={<User size={18} />} value={form.user} onValueChange={(user) => setForm({ ...form, user })} />
        <TextField label={localized(language, "كلمة المرور", "Mot de passe")} type="password" value={form.password} onValueChange={(password) => setForm({ ...form, password })} />
        <Button variant="primary" type="submit" disabled={saving}>
          {saving ? localized(language, "جاري الاتصال...", "Connexion...") : localized(language, "حفظ الإعداد", "Enregistrer la configuration")}
        </Button>
      </form>
    </main>
  );
}
