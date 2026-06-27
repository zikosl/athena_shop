import { FormEvent, useState } from "react";
import { LockKeyhole, User } from "lucide-react";
import { api } from "../../shared/api";
import { useText } from "../../shared/i18n";
import { showErrorToast } from "../../shared/toast";
import { Language, UserSession } from "../../shared/types";
import openzeyLogo from "../../assets/openzey-logo.png";

interface Props {
  language: Language;
  onLogin: (session: UserSession) => void;
}

export function LoginPage({ language, onLogin }: Props) {
  const t = useText(language);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      onLogin(await api.login(username, password));
    } catch (err) {
      showErrorToast(err, "تعذر تسجيل الدخول");
    }
  }

  return (
    <main className="login-shell">
      <div className="particles" />
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <img src={openzeyLogo} alt="OpenZey" className="brand-logo" />
          <div>
            <h1>OpenSoft</h1>
            <p>منصة إدارة الأعمال من OpenZey</p>
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
        <button className="gold-button" type="submit">{t.signIn}</button>
      </form>
    </main>
  );
}
