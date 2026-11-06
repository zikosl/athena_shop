import { FormEvent, useState } from "react";
import { LockKeyhole, User } from "lucide-react";
import { api } from "../../shared/api";
import { localized, useText } from "../../shared/i18n";
import { showErrorToast } from "../../shared/toast";
import { Language, UserSession } from "../../shared/types";
import { Button, TextField } from "../../shared/ui";
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
      showErrorToast(err, localized(language, "تعذر تسجيل الدخول", "Connexion impossible"));
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
            <p>{localized(language, "منصة إدارة الأعمال من OpenZey", "Gestion d’entreprise par OpenZey")}</p>
          </div>
        </div>
        <h2>{t.login}</h2>
        <TextField label={t.username} icon={<User size={18} />} value={username} autoComplete="username" onValueChange={setUsername} />
        <TextField label={t.password} icon={<LockKeyhole size={18} />} type="password" value={password} autoComplete="current-password" onValueChange={setPassword} />
        <Button variant="primary" type="submit">{t.signIn}</Button>
      </form>
    </main>
  );
}
