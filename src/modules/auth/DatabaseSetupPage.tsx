import { FormEvent, useState } from "react";
import { Cloud as Server, Database, User } from "@phosphor-icons/react";
import { api } from "../../shared/api";
import { PostgresConfig } from "../../shared/types";
import denzelLogoDark from "../../assets/denzel-logo-dark.png";
import denzelLogo from "../../assets/denzel-logo.png";

export function DatabaseSetupPage({ theme, onConfigured }: { theme: "dark" | "light"; onConfigured: () => void }) {
  const [form, setForm] = useState<PostgresConfig>({
    host: "localhost",
    port: 5432,
    database: "",
    user: "postgres",
    password: ""
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.configureDatabase(form);
      onConfigured();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="login-shell">
      <div className="particles" />
      <form className="login-card setup-card" onSubmit={submit}>
        <div className="login-brand">
          <img src={theme === "dark" ? denzelLogoDark : denzelLogo} alt="دنزل" className="brand-logo" />
          <div>
            <h1>دنزل</h1>
            <p>إعداد قاعدة البيانات</p>
          </div>
        </div>
        <h2>إعداد قاعدة البيانات</h2>
        <p className="helper-text">أدخل معلومات خادم PostgreSQL. سيتم إنشاء قاعدة البيانات إذا كان المستخدم يملك الصلاحية.</p>
        <label>
          <span>الخادم</span>
          <div className="field"><Server size={18} /><input value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} /></div>
        </label>
        <label>
          <span>المنفذ</span>
          <div className="field"><input type="number" value={form.port} onChange={(event) => setForm({ ...form, port: Number(event.target.value) })} /></div>
        </label>
        <label>
          <span>قاعدة البيانات</span>
          <div className="field"><Database size={18} /><input value={form.database} onChange={(event) => setForm({ ...form, database: event.target.value })} /></div>
        </label>
        <label>
          <span>المستخدم</span>
          <div className="field"><User size={18} /><input value={form.user} onChange={(event) => setForm({ ...form, user: event.target.value })} /></div>
        </label>
        <label>
          <span>كلمة المرور</span>
          <div className="field"><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></div>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="gold-button" type="submit" disabled={saving}>
          {saving ? "جاري الاتصال..." : "حفظ الإعداد"}
        </button>
      </form>
    </main>
  );
}
