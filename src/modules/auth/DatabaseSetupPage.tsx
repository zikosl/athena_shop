import { FormEvent, useState } from "react";
import { Database, Server, User } from "lucide-react";
import { api } from "../../shared/api";
import { showErrorToast, showToast } from "../../shared/toast";
import { PostgresConfig } from "../../shared/types";
import { Button, TextField } from "../../shared/ui";
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
        <TextField label="الخادم" icon={<Server size={18} />} value={form.host} onValueChange={(host) => setForm({ ...form, host })} />
        <TextField label="المنفذ" type="number" value={form.port} onValueChange={(port) => setForm({ ...form, port: Number(port) })} />
        <TextField label="قاعدة البيانات" icon={<Database size={18} />} value={form.database} onValueChange={(database) => setForm({ ...form, database })} />
        <TextField label="المستخدم" icon={<User size={18} />} value={form.user} onValueChange={(user) => setForm({ ...form, user })} />
        <TextField label="كلمة المرور" type="password" value={form.password} onValueChange={(password) => setForm({ ...form, password })} />
        <Button variant="primary" type="submit" disabled={saving}>
          {saving ? "جاري الاتصال..." : "حفظ الإعداد"}
        </Button>
      </form>
    </main>
  );
}
