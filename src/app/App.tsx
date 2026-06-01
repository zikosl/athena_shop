import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Box,
  ChartColumnIncreasing,
  CreditCard,
  HandCoins,
  Home,
  Languages,
  LogOut,
  Menu,
  ReceiptText,
  Save,
  Settings,
  ShoppingCart,
  Wallet
} from "lucide-react";
import { DatabaseSetupPage } from "../modules/auth/DatabaseSetupPage";
import { LoginPage } from "../modules/auth/LoginPage";
import { DashboardPage } from "../modules/dashboard/DashboardPage";
import { ExpensesPage } from "../modules/expenses/ExpensesPage";
import { CreditsPage } from "../modules/credits/CreditsPage";
import { PosPage } from "../modules/pos/PosPage";
import { RevenuePage } from "../modules/revenue/RevenuePage";
import { SettingsPage } from "../modules/settings/SettingsPage";
import { StockPage } from "../modules/stock/StockPage";
import { api } from "../shared/api";
import { appDateLabel } from "../shared/format";
import { useText } from "../shared/i18n";
import { Language, ProductStockFilter, UserSession, ViewKey } from "../shared/types";
import annaStoreLogo from "../assets/anna-store-logo.png";

const nav = [
  { key: "dashboard", icon: Home },
  { key: "stock", icon: Box },
  { key: "pos", icon: ShoppingCart },
  { key: "revenue", icon: ChartColumnIncreasing },
  { key: "expenses", icon: Wallet },
  { key: "credits", icon: HandCoins },
  { key: "settings", icon: Settings }
] as const;

export function App() {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem("anna-store-lang") as Language) || "fr");
  const [view, setView] = useState<ViewKey>("dashboard");
  const [stockFilter, setStockFilter] = useState<ProductStockFilter>("all");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [databaseConfigured, setDatabaseConfigured] = useState<boolean | null>(null);
  const [user, setUser] = useState<UserSession | null>(() => {
    const raw = localStorage.getItem("anna-store-session");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as UserSession;
    } catch {
      localStorage.removeItem("anna-store-session");
      return null;
    }
  });
  const [refreshToken, setRefreshToken] = useState(0);
  const [saveStatus, setSaveStatus] = useState("");
  const [now, setNow] = useState(() => new Date());
  const t = useText(language);

  useEffect(() => {
    localStorage.setItem("anna-store-lang", language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  useEffect(() => {
    api.isDatabaseConfigured()
      .then(setDatabaseConfigured)
      .catch(() => setDatabaseConfigured(false));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);
  const openStockAlerts = useCallback(() => {
    setStockFilter("low");
    setView("stock");
  }, []);
  const saveData = useCallback(async () => {
    try {
      await api.saveNow();
      setSaveStatus(t.saved);
    } catch {
      setSaveStatus(t.saveError);
    }
  }, [t.saveError, t.saved]);

  const logout = useCallback(async () => {
    await saveData();
    localStorage.removeItem("anna-store-session");
    setUser(null);
  }, [saveData]);

  const screen = useMemo(() => {
    if (!user) return null;
    if (view === "dashboard") return <DashboardPage language={language} onNavigate={setView} onOpenAlerts={openStockAlerts} refreshToken={refreshToken} />;
    if (view === "stock") return <StockPage language={language} onChanged={refresh} initialStockFilter={stockFilter} />;
    if (view === "pos") return <PosPage language={language} user={user} onSale={refresh} />;
    if (view === "revenue") return <RevenuePage language={language} />;
    if (view === "expenses") return <ExpensesPage language={language} onChanged={refresh} />;
    if (view === "credits") return <CreditsPage language={language} user={user} onChanged={refresh} />;
    return <SettingsPage language={language} setLanguage={setLanguage} />;
  }, [language, openStockAlerts, refresh, refreshToken, stockFilter, user, view]);

  if (databaseConfigured === null) {
    return <main className="login-shell"><div className="particles" /><section className="login-card"><h2>Loading...</h2></section></main>;
  }

  if (!databaseConfigured) {
    return <DatabaseSetupPage onConfigured={() => setDatabaseConfigured(true)} />;
  }

  if (!user) {
    return <LoginPage language={language} setLanguage={setLanguage} onLogin={(session) => {
      setUser(session);
      localStorage.setItem("anna-store-session", JSON.stringify(session));
    }} />;
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`} onContextMenu={(event) => event.preventDefault()}>
      <aside className="sidebar">
        <div className="brand-mark">
          <div className="brand-logo-frame">
            <img src={annaStoreLogo} alt="ANNA STORE HOME WEAR" className="brand-logo" />
          </div>
        </div>

        <nav className="menu">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
            <button
                key={item.key}
                className={`nav-item ${view === item.key ? "active" : ""}`}
                onClick={() => {
                  if (item.key === "stock") setStockFilter("all");
                  setView(item.key);
                }}
                title={t[item.key]}
              >
                <Icon size={20} />
                <span>{t[item.key]}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="admin-mini">
            <div className="avatar">A</div>
            <div>
              <strong>{user.display_name}</strong>
              <span>{user.role}</span>
            </div>
          </div>
          <button
            className="nav-item subtle"
            title={t.logout}
            onClick={() => void logout()}
          >
            <LogOut size={19} />
            <span>{t.logout}</span>
          </button>
        </div>
      </aside>

      <main className="dashboard-frame">
        <div className="particles" />
        <svg className="gold-waves" viewBox="0 0 900 240" aria-hidden="true">
          <path d="M8 139C143 32 258 167 392 70c149-108 276 34 500-32" />
          <path d="M73 178C216 94 303 205 453 106c142-94 256 16 438-30" />
          <path d="M486 153c113-74 221-81 395 3" />
        </svg>

        <header className="topbar">
          <section className="header-control">
            <button
              className="icon-button sidebar-toggle"
              aria-label="Toggle sidebar"
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              <Menu size={22} />
            </button>
            <section className="title-lockup">
              <img src={annaStoreLogo} alt="" className="title-logo-mark" />
              <div>
                <h1>ANNA STORE</h1>
                <p>HOME WEAR</p>
              </div>
            </section>
          </section>

          <section className="top-actions">
            <button className="glass-pill icon-only" title={t.alerts} onClick={openStockAlerts}><Bell size={18} /><b>3</b></button>
            <button className="glass-pill" onClick={() => void saveData()} title={saveStatus || t.saveData}>
              <Save size={17} />
              <span>{saveStatus || t.saveData}</span>
            </button>
            <button className="glass-pill" onClick={() => setLanguage(language === "fr" ? "ar" : "fr")}>
              <Languages size={17} />
              <span>{language === "fr" ? "FR" : "AR"}</span>
            </button>
            <div className="glass-pill"><ReceiptText size={17} />{appDateLabel(now, language)}</div>
            <div className="glass-pill"><CreditCard size={17} />{t.admin}</div>
          </section>
        </header>

        <div className="screen">{screen}</div>
      </main>
    </div>
  );
}
