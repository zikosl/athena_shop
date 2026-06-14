import { FormEvent, useState } from "react";
import { LockKeyhole, User } from "lucide-react";
import { api } from "../../shared/api";
import { useText } from "../../shared/i18n";
import { Language, UserSession } from "../../shared/types";
import annaStoreLogo from "../../assets/anna-store-logo.png";

interface Props {
  language: Language;
  onLogin: (session: UserSession) => void;
}

export function LoginPage({ language, onLogin }: Props) {
  const t = useText(language);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      onLogin(await api.login(username, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="login-shell">
      <div className="particles" />
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <img src={annaStoreLogo} alt="ياسين لافار لأقمصة والعطور" className="brand-logo" />
          <div>
            <h1>ياسين لافار لأقمصة والعطور</h1>
            <p>متجر الأقمصة والعطور</p>
          </div>
        </div>
        <h2>{t.login}</h2>
        <label>
          <span>{t.username}</span>
          <div className="field"><User size={18} /><input value={username} autoComplete="username" onChange={(event) => setUsername(event.target.value)} /></div>
        </label>
        <label>
          <span>{t.password}</span>
          <div className="field"><LockKeyhole size={18} /><input type="password" value={password} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} /></div>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="gold-button" type="submit">{t.signIn}</button>
      </form>
    </main>
  );
}
