import { FormEvent, useState } from "react";
import { Database, Server, User } from "lucide-react";
import { api } from "../../shared/api";
import { PostgresConfig } from "../../shared/types";
import annaStoreLogo from "../../assets/anna-store-logo.png";

export function DatabaseSetupPage({ onConfigured }: { onConfigured: () => void }) {
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
          <img src={annaStoreLogo} alt="Anna Store" className="brand-logo" />
          <div>
            <h1>ANNA STORE</h1>
            <p>POSTGRESQL</p>
          </div>
        </div>
        <h2>Database setup</h2>
        <p className="helper-text">Enter a PostgreSQL server. The database will be created if your user has permission.</p>
        <label>
          <span>Host</span>
          <div className="field"><Server size={18} /><input value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} /></div>
        </label>
        <label>
          <span>Port</span>
          <div className="field"><input type="number" value={form.port} onChange={(event) => setForm({ ...form, port: Number(event.target.value) })} /></div>
        </label>
        <label>
          <span>Database</span>
          <div className="field"><Database size={18} /><input value={form.database} onChange={(event) => setForm({ ...form, database: event.target.value })} /></div>
        </label>
        <label>
          <span>User</span>
          <div className="field"><User size={18} /><input value={form.user} onChange={(event) => setForm({ ...form, user: event.target.value })} /></div>
        </label>
        <label>
          <span>Password</span>
          <div className="field"><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></div>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="gold-button" type="submit" disabled={saving}>
          {saving ? "Connecting..." : "Save setup"}
        </button>
      </form>
    </main>
  );
}
