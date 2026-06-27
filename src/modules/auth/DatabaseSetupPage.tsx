import { FormEvent, useState } from "react";
import { Database, Server, User } from "lucide-react";
import { api } from "../../shared/api";
import { showErrorToast, showToast } from "../../shared/toast";
import { PostgresConfig } from "../../shared/types";
import openzeyLogo from "../../assets/openzey-logo.png";

export function DatabaseSetupPage({ onConfigured }: { onConfigured: () => void }) {
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
      showToast("تم الاتصال بقاعدة البيانات وإعداد مساحة العمل", "success");
      onConfigured();
    } catch (err) {
      showErrorToast(err, "تعذر الاتصال بقاعدة البيانات");
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
            <p>إعداد مساحة عمل المؤسسة</p>
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
        <button className="gold-button" type="submit" disabled={saving}>
          {saving ? "جاري الاتصال..." : "حفظ الإعداد"}
        </button>
      </form>
    </main>
  );
}
