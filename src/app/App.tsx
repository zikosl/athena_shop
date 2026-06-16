import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Box,
  ChartColumnIncreasing,
  CreditCard,
  ExternalLink,
  CircleDollarSign,
  HandCoins,
  Home,
  Info,
  LogOut,
  Menu,
  Moon,
  ReceiptText,
  Save,
  Settings,
  ShoppingCart,
  Scale,
  SprayCan,
  Sun,
  Truck,
  UsersRound,
  Wallet,
  X
} from "lucide-react";
import { DatabaseSetupPage } from "../modules/auth/DatabaseSetupPage";
import { LoginPage } from "../modules/auth/LoginPage";
import { DashboardPage } from "../modules/dashboard/DashboardPage";
import { DeliveryPage } from "../modules/delivery/DeliveryPage";
import { ExpensesPage } from "../modules/expenses/ExpensesPage";
import { CreditsPage } from "../modules/credits/CreditsPage";
import { PosPage } from "../modules/pos/PosPage";
import { PerfumeryPage } from "../modules/perfumery/PerfumeryPage";
import { ReportsPage } from "../modules/reports/ReportsPage";
import { RevenuePage } from "../modules/revenue/RevenuePage";
import { SettingsPage } from "../modules/settings/SettingsPage";
import { StockPage } from "../modules/stock/StockPage";
import { SuppliersPage } from "../modules/suppliers/SuppliersPage";
import { ZakatPage } from "../modules/zakat/ZakatPage";
import { api } from "../shared/api";
import { appDateLabel, hijriDateLabel, money } from "../shared/format";
import { useText } from "../shared/i18n";
import { AppToast, showToast } from "../shared/toast";
import { AppSettings, CashShift, Language, ProductStockFilter, UserSession, ViewKey } from "../shared/types";
import annaStoreLogo from "../assets/anna-store-logo.png";
import openzeyLogo from "../assets/openzey-logo.png";
import openzeyLogoWhite from "../assets/openzey-logo-white.png";

const nav = [
  { key: "dashboard", icon: Home },
  { key: "pos", icon: ShoppingCart },
  { key: "delivery", icon: Truck },
  { key: "revenue", icon: ChartColumnIncreasing },
  { key: "credits", icon: HandCoins },
  { key: "expenses", icon: Wallet },
  { key: "suppliers", icon: UsersRound },
  { key: "stock", icon: Box },
  { key: "perfumery", icon: SprayCan },
  { key: "reports", icon: ReceiptText },
  { key: "zakat", icon: Scale },
  { key: "settings", icon: Settings }
] as const;

type Theme = "dark" | "light";

const defaultAppSettings: AppSettings = {
  allow_negative_stock: true,
  cash_register_auto_close_time: "23:59",
  max_discount_amount: 200,
  invoice_printer: "",
  barcode_printer: "",
  ui_font_scale: "normal",
  ui_density: "comfortable",
  pos_layout: "auto",
  pos_cart_width: 320
};

export function App() {
  const [language] = useState<Language>("ar");
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
  const [drawerStatus, setDrawerStatus] = useState("");
  const [alertCount, setAlertCount] = useState(0);
  const [shift, setShift] = useState<CashShift | null>(null);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultAppSettings);
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
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<Omit<AppToast, "id">>).detail;
      const toast = { ...detail, id: Date.now() + Math.random() };
      setToasts((items) => [toast, ...items].slice(0, 4));
      window.setTimeout(() => {
        setToasts((items) => items.filter((item) => item.id !== toast.id));
      }, 5_000);
    };
    window.addEventListener("app-toast", onToast);
    return () => window.removeEventListener("app-toast", onToast);
  }, []);

  useEffect(() => {
    if (!user) return;
    api.dashboard()
      .then((stats) => setAlertCount(stats.low_stock_count))
      .catch(() => setAlertCount(0));
    api.currentShift()
      .then(setShift)
      .catch(() => setShift(null));
    api.appSettings()
      .then((settings) => setAppSettings({ ...defaultAppSettings, ...settings }))
      .catch(() => setAppSettings(defaultAppSettings));
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
      showToast(t.saved, "success");
    } catch {
      setSaveStatus(t.saveError);
      showToast(t.saveError, "error");
    }
  }, [t.saveError, t.saved]);

  const openDrawer = useCallback(async () => {
    setDrawerStatus("");
    try {
      await api.openCashDrawer();
      setDrawerStatus("\u062a\u0645 \u0641\u062a\u062d \u0627\u0644\u062f\u0631\u062c");
      showToast("\u062a\u0645 \u0641\u062a\u062d \u0627\u0644\u062f\u0631\u062c", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "\u062a\u0639\u0630\u0631 \u0641\u062a\u062d \u0627\u0644\u062f\u0631\u062c";
      setDrawerStatus(message);
      showToast(message, "error");
    }
  }, []);

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
    if (view === "delivery") return <DeliveryPage language={language} onChanged={refresh} />;
    if (view === "revenue") return <RevenuePage language={language} onChanged={refresh} />;
    if (view === "reports") return <ReportsPage language={language} />;
    if (view === "expenses") return <ExpensesPage language={language} onChanged={refresh} />;
    if (view === "suppliers") return <SuppliersPage language={language} user={user} onChanged={refresh} />;
    if (view === "credits") return <CreditsPage language={language} user={user} onChanged={refresh} />;
    if (view === "zakat") return <ZakatPage language={language} />;
    return <SettingsPage language={language} user={user} onUserChanged={updateUserSession} onSettingsChanged={setAppSettings} />;
  }, [language, openStockAlerts, refresh, refreshToken, stockFilter, updateUserSession, user, view]);

  if (databaseConfigured === null) {
    return <main className="login-shell"><div className="particles" /><section className="login-card"><h2>Loading...</h2></section></main>;
  }

  if (!databaseConfigured) {
    return <DatabaseSetupPage onConfigured={() => setDatabaseConfigured(true)} />;
  }

  if (!user) {
    return <LoginPage language={language} onLogin={(session) => {
      setUser(session);
      localStorage.setItem("athena-shop-session", JSON.stringify(session));
    }} />;
  }

  return (
    <div
      className={[
        "app-shell",
        sidebarCollapsed ? "sidebar-collapsed" : "",
        `ui-font-${appSettings.ui_font_scale}`,
        `ui-density-${appSettings.ui_density}`,
        `ui-pos-${appSettings.pos_layout}`
      ].filter(Boolean).join(" ")}
      style={{ "--pos-cart-width": `${appSettings.pos_cart_width}px` } as CSSProperties}
      onContextMenu={(event) => event.preventDefault()}
    >
      <aside className="sidebar">
        <div className="brand-mark">
          <div className="brand-logo-frame">
            <img src={annaStoreLogo} alt="ياسين لافار لأقمصة والعطور" className="brand-logo" />
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
              <div>
                <h1>ياسين لافار</h1>
              </div>
            </section>
          </section>

          <section className="top-actions">
            <button className="glass-pill icon-only" title="معلومات التطبيق" onClick={() => setInfoOpen(true)}><Info size={18} /></button>
            <button className="glass-pill icon-only" title={t.alerts} onClick={openStockAlerts}><Bell size={18} />{alertCount > 0 && <b>{alertCount}</b>}</button>
            <button className="glass-pill" title="الصندوق" onClick={() => setShiftModalOpen(true)}>
              <CircleDollarSign size={17} />
              <span>{shift ? `الصندوق ${money(shift.expected_amount)}` : "فتح الصندوق"}</span>
            </button>
            <button className="glass-pill icon-only" title={drawerStatus || "\u0641\u062a\u062d \u062f\u0631\u062c \u0627\u0644\u0635\u0646\u062f\u0648\u0642"} onClick={() => void openDrawer()}>
              <Wallet size={18} />
            </button>
            <button
              className="glass-pill icon-only"
              title={theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="glass-pill" onClick={() => void saveData()} title={saveStatus || t.saveData}>
              <Save size={17} />
              <span>{saveStatus || t.saveData}</span>
            </button>
            <div className="glass-pill"><ReceiptText size={17} />{appDateLabel(now, language)}</div>
            <div className="glass-pill"><Scale size={17} />{hijriDateLabel(now, language)}</div>
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
        {infoOpen && <OpenzeyInfoModal theme={theme} onClose={() => setInfoOpen(false)} />}
      </main>
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            className={`toast-card ${toast.tone}`}
            type="button"
            onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}
          >
            {toast.message}
          </button>
        ))}
      </div>
    </div>
  );
}

function OpenzeyInfoModal({ theme, onClose }: { theme: Theme; onClose: () => void }) {
  const logo = theme === "dark" ? openzeyLogoWhite : openzeyLogo;
  async function openWebsite() {
    showToast("Openzey...", "info");
    try {
      await api.openExternalUrl("https://openzey.com");
    } catch {
      window.open("https://openzey.com", "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="panel compact-form-modal openzey-info-modal">
        <div className="section-title">
          <h2><Info size={18} /> معلومات التطبيق</h2>
          <span />
          <button className="ghost-button compact-button" type="button" onClick={onClose}><X size={16} /> إغلاق</button>
        </div>
        <div className="openzey-brand">
          <img src={logo} alt="Openzey" />
          <div>
            <strong>Openzey</strong>
            <span>حلول رقمية ذكية للمتاجر والشركات</span>
          </div>
        </div>
        <p>
          تم بناء هذا التطبيق من طرف شركة Openzey لمساعدة المتجر على إدارة المبيعات، المخزون، المصاريف، الديون، والتقارير بطريقة بسيطة وواضحة.
        </p>
        <p className="helper-text">
          إذا أردت تطوير نسخة خاصة، إضافة ميزات جديدة، أو تحتاج دعما تقنيا، يمكنك التواصل معنا عبر موقعنا.
        </p>
        <button className="gold-button openzey-link" type="button" onClick={() => void openWebsite()}>
          <ExternalLink size={17} /> openzey.com
        </button>
      </section>
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
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");


  async function openCaisse() {
    setError("");
    setStatus("");
    try {
      await api.openShift({ opening_amount: openingAmount, cashier });
      const message = "\u062a\u0645 \u0641\u062a\u062d \u0627\u0644\u0635\u0646\u062f\u0648\u0642";
      setStatus(message);
      showToast(message, "success");
      onChanged();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showToast(message, "error");
    }
  }

  async function closeCaisse() {
    if (!shift) return;
    setError("");
    setStatus("");
    try {
      await api.closeShift({ id: shift.id });
      const message = "\u062a\u0645 \u063a\u0644\u0642 \u0627\u0644\u0635\u0646\u062f\u0648\u0642";
      setStatus(message);
      showToast(message, "success");
      onChanged();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showToast(message, "error");
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="panel compact-form-modal cash-shift-modal">
        <div className="section-title"><h2><CircleDollarSign size={18} /> الصندوق</h2><span /></div>
        {shift ? (
          <div className="cash-shift-body">
            <div className="summary-strip compact">
              <article><span>مبلغ الفتح</span><strong>{money(shift.opening_amount)}</strong></article>
              <article><span>مبيعات نقدية</span><strong>{money(shift.cash_sales)}</strong></article>
              <article><span>دفعات الدين</span><strong>{money(shift.credit_payments)}</strong></article>
              <article><span>المصاريف</span><strong>{money(shift.expenses)}</strong></article>
              <article><span>دفعات الموردين</span><strong>{money(shift.supplier_payments)}</strong></article>
              <article><span>المبلغ المتوقع</span><strong>{money(shift.expected_amount)}</strong></article>
              <article><span>الغلق التلقائي</span><strong>{shift.auto_close_at.slice(0, 16)}</strong></article>
            </div>
            <p className="helper-text">{"عند الغلق سيسجل النظام المبلغ المتوقع تلقائيا بدون إدخال مبلغ."}</p>
            <div className="modal-actions">
              <button className="gold-button" type="button" onClick={() => void closeCaisse()}>غلق الصندوق</button>
              <button className="ghost-button" type="button" onClick={onClose}>إغلاق</button>
            </div>
          </div>
        ) : (
          <div className="cash-shift-body">
            <label><span>مبلغ الفتح</span><div className="field"><input type="number" min={0} value={openingAmount === 0 ? "" : openingAmount} onChange={(event) => setOpeningAmount(Number(event.target.value))} /></div></label>
            <p className="helper-text">{"وقت الغلق التلقائي يحدده المدير من الإعدادات."}</p>
            <div className="modal-actions">
              <button className="gold-button" type="button" onClick={() => void openCaisse()}>فتح الصندوق</button>
              <button className="ghost-button" type="button" onClick={onClose}>إغلاق</button>
            </div>
          </div>
        )}
        {status && <p className="helper-text">{status}</p>}
        {error && <p className="error">{error}</p>}
      </section>
    </div>
  );
}
