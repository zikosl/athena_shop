import { FormEvent, useState } from "react";
import { LockKey as LockKeyhole, User } from "@phosphor-icons/react";
import { api } from "../../shared/api";
import { useText } from "../../shared/i18n";
import { Language, UserSession } from "../../shared/types";
import denzelLogoDark from "../../assets/denzel-logo-dark.png";
import denzelLogo from "../../assets/denzel-logo.png";

interface Props {
  language: Language;
  theme: "dark" | "light";
  onLogin: (session: UserSession) => void;
}

export function LoginPage({ language, theme, onLogin }: Props) {
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
          <img src={theme === "dark" ? denzelLogoDark : denzelLogo} alt="دنزل" className="brand-logo" />
          <div>
            <h1>دنزل</h1>
            <p>متجر الألبسة</p>
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
