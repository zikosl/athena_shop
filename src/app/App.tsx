import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Box,
  ChartColumnIncreasing,
  CreditCard,
  CircleDollarSign,
  HandCoins,
  Home,
  Languages,
  LogOut,
  Menu,
  Moon,
  ReceiptText,
  Save,
  Settings,
  ShoppingCart,
  SprayCan,
  Sun,
  Wallet
} from "lucide-react";
import { DatabaseSetupPage } from "../modules/auth/DatabaseSetupPage";
import { LoginPage } from "../modules/auth/LoginPage";
import { DashboardPage } from "../modules/dashboard/DashboardPage";
import { ExpensesPage } from "../modules/expenses/ExpensesPage";
import { CreditsPage } from "../modules/credits/CreditsPage";
import { PosPage } from "../modules/pos/PosPage";
import { PerfumeryPage } from "../modules/perfumery/PerfumeryPage";
import { ReportsPage } from "../modules/reports/ReportsPage";
import { RevenuePage } from "../modules/revenue/RevenuePage";
import { SettingsPage } from "../modules/settings/SettingsPage";
import { StockPage } from "../modules/stock/StockPage";
import { api } from "../shared/api";
import { appDateLabel, money } from "../shared/format";
import { useText } from "../shared/i18n";
import { CashShift, Language, ProductStockFilter, UserSession, ViewKey } from "../shared/types";
import annaStoreLogo from "../assets/anna-store-logo.png";

const nav = [
  { key: "dashboard", icon: Home },
  { key: "stock", icon: Box },
  { key: "perfumery", icon: SprayCan },
  { key: "pos", icon: ShoppingCart },
  { key: "revenue", icon: ChartColumnIncreasing },
  { key: "reports", icon: ReceiptText },
  { key: "expenses", icon: Wallet },
  { key: "credits", icon: HandCoins },
  { key: "settings", icon: Settings }
] as const;

type Theme = "dark" | "light";

export function App() {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem("athena-shop-lang") as Language) || "fr");
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("athena-shop-theme") as Theme) || "dark");
  const [view, setView] = useState<ViewKey>("dashboard");
  const [stockFilter, setStockFilter] = useState<ProductStockFilter>("all");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [databaseConfigured, setDatabaseConfigured] = useState<boolean | null>(null);
  const [user, setUser] = useState<UserSession | null>(() => {
    const raw = localStorage.getItem("athena-shop-session");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as UserSession;
    } catch {
      localStorage.removeItem("athena-shop-session");
      return null;
    }
  });
  const [refreshToken, setRefreshToken] = useState(0);
  const [saveStatus, setSaveStatus] = useState("");
  const [alertCount, setAlertCount] = useState(0);
  const [shift, setShift] = useState<CashShift | null>(null);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const t = useText(language);

  useEffect(() => {
    localStorage.setItem("athena-shop-lang", language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  useEffect(() => {
    localStorage.setItem("athena-shop-theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    api.isDatabaseConfigured()
      .then(setDatabaseConfigured)
      .catch(() => setDatabaseConfigured(false));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    api.dashboard()
      .then((stats) => setAlertCount(stats.low_stock_count))
      .catch(() => setAlertCount(0));
    api.currentShift()
      .then(setShift)
      .catch(() => setShift(null));
  }, [refreshToken, user]);

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);
  const refreshShift = useCallback(async () => {
    setShift(await api.currentShift());
    refresh();
  }, [refresh]);
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
    localStorage.removeItem("athena-shop-session");
    setUser(null);
  }, [saveData]);

  const updateUserSession = useCallback((session: UserSession) => {
    setUser(session);
    localStorage.setItem("athena-shop-session", JSON.stringify(session));
  }, []);

  const screen = useMemo(() => {
    if (!user) return null;
    if (view === "dashboard") return <DashboardPage language={language} onNavigate={setView} onOpenAlerts={openStockAlerts} refreshToken={refreshToken} />;
    if (view === "stock") return <StockPage language={language} onChanged={refresh} initialStockFilter={stockFilter} />;
    if (view === "perfumery") return <PerfumeryPage language={language} onChanged={refresh} />;
    if (view === "pos") return <PosPage language={language} user={user} onSale={refresh} />;
    if (view === "revenue") return <RevenuePage language={language} />;
    if (view === "reports") return <ReportsPage language={language} />;
    if (view === "expenses") return <ExpensesPage language={language} onChanged={refresh} />;
    if (view === "credits") return <CreditsPage language={language} user={user} onChanged={refresh} />;
    return <SettingsPage language={language} setLanguage={setLanguage} user={user} onUserChanged={updateUserSession} />;
  }, [language, openStockAlerts, refresh, refreshToken, stockFilter, updateUserSession, user, view]);

  if (databaseConfigured === null) {
    return <main className="login-shell"><div className="particles" /><section className="login-card"><h2>Loading...</h2></section></main>;
  }

  if (!databaseConfigured) {
    return <DatabaseSetupPage onConfigured={() => setDatabaseConfigured(true)} />;
  }

  if (!user) {
    return <LoginPage language={language} setLanguage={setLanguage} onLogin={(session) => {
      setUser(session);
      localStorage.setItem("athena-shop-session", JSON.stringify(session));
    }} />;
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`} onContextMenu={(event) => event.preventDefault()}>
      <aside className="sidebar">
        <div className="brand-mark">
          <div className="brand-logo-frame">
            <img src={annaStoreLogo} alt="Anna Store" className="brand-logo" />
          </div>
          <strong>ANNA STORE</strong>
          <span>Home Wear</span>
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
            <button className="glass-pill icon-only" title={t.alerts} onClick={openStockAlerts}><Bell size={18} />{alertCount > 0 && <b>{alertCount}</b>}</button>
            <button className="glass-pill" title="Caisse" onClick={() => setShiftModalOpen(true)}>
              <CircleDollarSign size={17} />
              <span>{shift ? `Caisse ${money(shift.expected_amount)}` : "Ouvrir caisse"}</span>
            </button>
            <button
              className="glass-pill icon-only"
              title={theme === "dark" ? "Mode clair" : "Mode sombre"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
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
        {shiftModalOpen && user && (
          <CashShiftModal
            shift={shift}
            cashier={user.display_name}
            onClose={() => setShiftModalOpen(false)}
            onChanged={() => void refreshShift()}
          />
        )}
      </main>
    </div>
  );
}

function CashShiftModal({
  shift,
  cashier,
  onClose,
  onChanged
}: {
  shift: CashShift | null;
  cashier: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [openingAmount, setOpeningAmount] = useState(0);
  const [closingAmount, setClosingAmount] = useState(shift?.expected_amount ?? 0);
  const [autoCloseTime, setAutoCloseTime] = useState("23:59");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    setClosingAmount(shift?.expected_amount ?? 0);
  }, [shift]);

  async function openCaisse() {
    setError("");
    setStatus("");
    try {
      await api.openShift({ opening_amount: openingAmount, auto_close_time: autoCloseTime, cashier });
      setStatus("Caisse ouverte");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function closeCaisse() {
    if (!shift) return;
    setError("");
    setStatus("");
    try {
      await api.closeShift({ id: shift.id, closing_amount: closingAmount });
      setStatus("Caisse fermee");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="panel compact-form-modal cash-shift-modal">
        <div className="section-title"><h2><CircleDollarSign size={18} /> Caisse</h2><span /></div>
        {shift ? (
          <div className="cash-shift-body">
            <div className="summary-strip compact">
              <article><span>Ouverture</span><strong>{money(shift.opening_amount)}</strong></article>
              <article><span>Ventes cash</span><strong>{money(shift.cash_sales)}</strong></article>
              <article><span>Versements</span><strong>{money(shift.credit_payments)}</strong></article>
              <article><span>Depenses</span><strong>{money(shift.expenses)}</strong></article>
              <article><span>Attendu caisse</span><strong>{money(shift.expected_amount)}</strong></article>
              <article><span>Fermeture auto</span><strong>{shift.auto_close_at.slice(0, 16)}</strong></article>
            </div>
            <label><span>Montant compte en caisse</span><div className="field"><input type="number" min={0} value={closingAmount === 0 ? "" : closingAmount} onChange={(event) => setClosingAmount(Number(event.target.value))} /></div></label>
            <div className="modal-actions">
              <button className="gold-button" type="button" onClick={() => void closeCaisse()}>Fermer caisse</button>
              <button className="ghost-button" type="button" onClick={onClose}>Fermer</button>
            </div>
          </div>
        ) : (
          <div className="cash-shift-body">
            <label><span>Montant ouverture</span><div className="field"><input type="number" min={0} value={openingAmount === 0 ? "" : openingAmount} onChange={(event) => setOpeningAmount(Number(event.target.value))} /></div></label>
            <label><span>Fermeture automatique</span><div className="field"><input type="time" value={autoCloseTime} onChange={(event) => setAutoCloseTime(event.target.value)} /></div></label>
            <div className="modal-actions">
              <button className="gold-button" type="button" onClick={() => void openCaisse()}>Ouvrir caisse</button>
              <button className="ghost-button" type="button" onClick={onClose}>Fermer</button>
            </div>
          </div>
        )}
        {status && <p className="helper-text">{status}</p>}
        {error && <p className="error">{error}</p>}
      </section>
    </div>
  );
}
