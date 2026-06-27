import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  CircleDollarSign,
  Info,
  LogOut,
  Moon,
  ReceiptText,
  Save,
  Scale,
  Sun,
  Wallet,
  X,
  XCircle
} from "lucide-react";
import { DatabaseSetupPage } from "../modules/auth/DatabaseSetupPage";
import { LoginPage } from "../modules/auth/LoginPage";
import { AppLauncherPage } from "../modules/apps/AppLauncherPage";
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
import { ZakatPage } from "../modules/zakat/ZakatPage";
import { api } from "../shared/api";
import { appDateLabel, hijriDateLabel, money } from "../shared/format";
import { useText } from "../shared/i18n";
import { AppToast, showErrorToast, showToast } from "../shared/toast";
import { AppSettings, CashShift, Language, ProductStockFilter, UserSession, ViewKey } from "../shared/types";
import openzeyLogo from "../assets/openzey-logo.png";
import openzeyLogoWhite from "../assets/openzey-logo-white.png";

const viewLabels: Record<ViewKey, string> = {
  apps: "التطبيقات",
  dashboard: "لوحة المتابعة",
  pos: "المبيعات",
  revenue: "الطلبات",
  delivery: "التوصيل",
  stock: "المخزون",
  perfumery: "العطور",
  credits: "العملاء والديون",
  expenses: "المصاريف",
  reports: "التقارير",
  zakat: "الزكاة",
  settings: "الإعدادات"
};

type Theme = "dark" | "light";

const storageKeys = {
  theme: "opensoft-theme",
  session: "opensoft-session",
  lang: "opensoft-lang"
} as const;

const legacyStorageKeys = {
  theme: "denzel-pos-theme",
  session: "denzel-pos-session",
  lang: "denzel-pos-lang"
} as const;

function readStorage(key: string, legacyKey: string) {
  const value = localStorage.getItem(key);
  if (value !== null) return value;
  const legacyValue = localStorage.getItem(legacyKey);
  if (legacyValue !== null) localStorage.setItem(key, legacyValue);
  return legacyValue;
}

function normalizeThemeColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#2563eb";
}

function shadeColor(value: string, amount: number) {
  const normalized = normalizeThemeColor(value).slice(1);
  const channels = [0, 2, 4].map((offset) =>
    Math.max(0, Math.min(255, Number.parseInt(normalized.slice(offset, offset + 2), 16) + amount))
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

const defaultAppSettings: AppSettings = {
  allow_negative_stock: true,
  cash_register_auto_close_time: "23:59",
  max_discount_amount: 200,
  invoice_printer: "",
  barcode_printer: "",
  receipt_title: "OpenSoft",
  receipt_subtitle: "حلول إدارة الأعمال من OpenZey",
  show_invoice_logo: true,
  ticket_width_chars: 32,
  barcode_label_width_mm: 40,
  barcode_label_height_mm: 20,
  barcode_darkness: 5,
  barcode_speed: "slow",
  theme_primary_color: "#2563eb",
  ui_font_scale: "normal",
  ui_zoom: 100,
  ui_density: "comfortable",
  pos_layout: "auto",
  pos_cart_width: 320
};

export function App() {
  const [language] = useState<Language>("ar");
  const [theme, setTheme] = useState<Theme>(() => (readStorage(storageKeys.theme, legacyStorageKeys.theme) as Theme) || "dark");
  const [view, setView] = useState<ViewKey>("apps");
  const [stockFilter, setStockFilter] = useState<ProductStockFilter>("all");
  const [databaseConfigured, setDatabaseConfigured] = useState<boolean | null>(null);
  const [user, setUser] = useState<UserSession | null>(() => {
    const raw = readStorage(storageKeys.session, legacyStorageKeys.session);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as UserSession;
    } catch {
      localStorage.removeItem(storageKeys.session);
      localStorage.removeItem(legacyStorageKeys.session);
      return null;
    }
  });
  const [refreshToken, setRefreshToken] = useState(0);
  const [alertCount, setAlertCount] = useState(0);
  const [shift, setShift] = useState<CashShift | null>(null);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultAppSettings);
  const t = useText(language);
  const primaryColor = normalizeThemeColor(appSettings.theme_primary_color);
  const activeLogo = theme === "dark" ? openzeyLogoWhite : openzeyLogo;
  const currentViewLabel = viewLabels[view];

  useEffect(() => {
    localStorage.setItem(storageKeys.lang, language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  useEffect(() => {
    localStorage.setItem(storageKeys.theme, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    api.isDatabaseConfigured()
      .then(setDatabaseConfigured)
      .catch((err) => {
        setDatabaseConfigured(false);
        showErrorToast(err, "تعذر التحقق من إعداد قاعدة البيانات");
      });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<Omit<AppToast, "id">>).detail;
      const toast = { ...detail, id: Date.now() + Math.random() };
      setToasts((items) => {
        const withoutDuplicate = items.filter((item) => (
          item.message !== toast.message || item.tone !== toast.tone
        ));
        return [toast, ...withoutDuplicate].slice(0, 4);
      });
      window.setTimeout(() => {
        setToasts((items) => items.filter((item) => item.id !== toast.id));
      }, detail.duration ?? 5_000);
    };
    window.addEventListener("app-toast", onToast);
    return () => window.removeEventListener("app-toast", onToast);
  }, []);

  useEffect(() => {
    if (!user) return;
    api.dashboard()
      .then((stats) => setAlertCount(stats.low_stock_count))
      .catch((err) => {
        setAlertCount(0);
        showErrorToast(err, "تعذر تحميل تنبيهات المخزون");
      });
    api.currentShift()
      .then(setShift)
      .catch((err) => {
        setShift(null);
        showErrorToast(err, "تعذر تحميل حالة الصندوق");
      });
    api.appSettings()
      .then((settings) => setAppSettings({ ...defaultAppSettings, ...settings }))
      .catch((err) => {
        setAppSettings(defaultAppSettings);
        showErrorToast(err, "تعذر تحميل إعدادات التطبيق");
      });
  }, [refreshToken, user]);

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);
  const navigate = useCallback((nextView: ViewKey) => {
    if (nextView === view) return;
    setView(nextView);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, [view]);
  const refreshShift = useCallback(async () => {
    setShift(await api.currentShift());
    refresh();
  }, [refresh]);
  const openStockAlerts = useCallback(() => {
    setStockFilter("low");
    navigate("stock");
  }, [navigate]);
  const saveData = useCallback(async () => {
    try {
      await api.saveNow();
      showToast(t.saved, "success");
    } catch {
      showToast(t.saveError, "error");
    }
  }, [t.saveError, t.saved]);

  const openDrawer = useCallback(async () => {
    try {
      await api.openCashDrawer();
      showToast("\u062a\u0645 \u0641\u062a\u062d \u0627\u0644\u062f\u0631\u062c", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "\u062a\u0639\u0630\u0631 \u0641\u062a\u062d \u0627\u0644\u062f\u0631\u062c";
      showToast(message, "error");
    }
  }, []);

  const logout = useCallback(async () => {
    await saveData();
    localStorage.removeItem(storageKeys.session);
    localStorage.removeItem(legacyStorageKeys.session);
    setUser(null);
  }, [saveData]);

  const updateUserSession = useCallback((session: UserSession) => {
    setUser(session);
    localStorage.setItem(storageKeys.session, JSON.stringify(session));
  }, []);

  const screen = useMemo(() => {
    if (!user) return null;
    if (view === "apps") {
      return (
        <AppLauncherPage
          userName={user.display_name}
          shiftOpen={Boolean(shift)}
          alertCount={alertCount}
          onNavigate={navigate}
        />
      );
    }
    if (view === "dashboard") return <DashboardPage language={language} onNavigate={navigate} onOpenAlerts={openStockAlerts} refreshToken={refreshToken} />;
    if (view === "stock") return <StockPage language={language} onChanged={refresh} initialStockFilter={stockFilter} />;
    if (view === "perfumery") return <PerfumeryPage language={language} onChanged={refresh} />;
    if (view === "pos") return <PosPage language={language} user={user} onSale={refresh} />;
    if (view === "delivery") return <DeliveryPage language={language} onChanged={refresh} />;
    if (view === "revenue") return <RevenuePage language={language} onChanged={refresh} />;
    if (view === "reports") return <ReportsPage language={language} />;
    if (view === "expenses") return <ExpensesPage language={language} onChanged={refresh} />;
    if (view === "credits") return <CreditsPage language={language} user={user} onChanged={refresh} />;
    if (view === "zakat") return <ZakatPage language={language} />;
    return <SettingsPage language={language} user={user} onUserChanged={updateUserSession} onSettingsChanged={setAppSettings} />;
  }, [alertCount, language, navigate, openStockAlerts, refresh, refreshToken, shift, stockFilter, updateUserSession, user, view]);

  const toastViewport = (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => {
        const ToastIcon = toast.tone === "success"
          ? CheckCircle2
          : toast.tone === "error"
            ? XCircle
            : toast.tone === "warning"
              ? AlertTriangle
              : Info;
        const defaultTitle = toast.tone === "success"
          ? "تم بنجاح"
          : toast.tone === "error"
            ? "تعذر إتمام العملية"
            : toast.tone === "warning"
              ? "تنبيه"
              : "معلومة";
        return (
          <article key={toast.id} className={`toast-card ${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}>
            <span className="toast-icon"><ToastIcon size={20} /></span>
            <span className="toast-content">
              <strong>{toast.title || defaultTitle}</strong>
              <small>{toast.message}</small>
            </span>
            <button
              className="toast-close"
              type="button"
              aria-label="إغلاق الإشعار"
              onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}
            >
              <X size={16} />
            </button>
            <span className="toast-progress" style={{ animationDuration: `${toast.duration ?? 5_000}ms` }} />
          </article>
        );
      })}
    </div>
  );

  if (databaseConfigured === null) {
    return <><main className="login-shell"><div className="particles" /><section className="login-card"><h2>Loading...</h2></section></main>{toastViewport}</>;
  }

  if (!databaseConfigured) {
    return <><DatabaseSetupPage onConfigured={() => setDatabaseConfigured(true)} />{toastViewport}</>;
  }

  if (!user) {
    return <><LoginPage language={language} onLogin={(session) => {
      setUser(session);
      localStorage.setItem(storageKeys.session, JSON.stringify(session));
    }} />{toastViewport}</>;
  }

  return (
    <div
      className={[
        "app-shell",
        `ui-font-${appSettings.ui_font_scale}`,
        `ui-density-${appSettings.ui_density}`,
        `ui-pos-${appSettings.pos_layout}`
      ].filter(Boolean).join(" ")}
      style={{
        "--pos-cart-width": `${appSettings.pos_cart_width}px`,
        "--app-zoom": `${(appSettings.ui_zoom ?? 100) / 100}`,
        "--accent": primaryColor,
        "--accent-strong": shadeColor(primaryColor, -22),
        "--accent-soft": `${primaryColor}1f`,
        "--brand-primary": primaryColor
      } as CSSProperties}
      onContextMenu={(event) => event.preventDefault()}
    >
      <main className="dashboard-frame">
        <div className="particles" />
        <svg className="gold-waves" viewBox="0 0 900 240" aria-hidden="true">
          <path d="M8 139C143 32 258 167 392 70c149-108 276 34 500-32" />
          <path d="M73 178C216 94 303 205 453 106c142-94 256 16 438-30" />
          <path d="M486 153c113-74 221-81 395 3" />
        </svg>

        <header className="topbar">
          <section className="header-control">
            {view !== "apps" && (
              <button
                className="glass-pill back-button brand-back-button"
                title={language === "fr" ? "Retour aux applications" : "العودة إلى التطبيقات"}
                onClick={() => navigate("apps")}
              >
                {language === "fr" ? <ArrowLeft size={18} /> : <ArrowRight size={18} />}
                <span>{language === "fr" ? "Retour" : "رجوع"}</span>
              </button>
            )}
            <section className="title-lockup">
              <img src={activeLogo} alt="" className="title-brand-icon" />
              <div>
                <h1>OpenSoft</h1>
                <p key={view} className="view-label">{currentViewLabel}</p>
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
            <button className="glass-pill icon-only" title="\u0641\u062a\u062d \u062f\u0631\u062c \u0627\u0644\u0635\u0646\u062f\u0648\u0642" onClick={() => void openDrawer()}>
              <Wallet size={18} />
            </button>
            <button
              className="glass-pill icon-only"
              title={theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="glass-pill" onClick={() => void saveData()} title={t.saveData}>
              <Save size={17} />
              <span>{t.saveData}</span>
            </button>
            <div className="glass-pill"><ReceiptText size={17} />{appDateLabel(now, language)}</div>
            <div className="glass-pill"><Scale size={17} />{hijriDateLabel(now, language)}</div>
            <div className="glass-pill"><CreditCard size={17} />{user.display_name}</div>
            <button className="glass-pill icon-only" title={t.logout} onClick={() => void logout()}>
              <LogOut size={18} />
            </button>
          </section>
        </header>

        <div className="screen screen-enter" key={view}>{screen}</div>
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
      {toastViewport}
    </div>
  );
}

function OpenzeyInfoModal({ theme, onClose }: { theme: Theme; onClose: () => void }) {
  const logo = theme === "dark" ? openzeyLogoWhite : openzeyLogo;
  async function openWebsite() {
    showToast("جار فتح موقع OpenZey...", "info");
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
          <h2><Info size={18} /> عن OpenSoft</h2>
          <span />
          <button className="ghost-button compact-button" type="button" onClick={onClose}><X size={16} /> إغلاق</button>
        </div>
        <div className="openzey-brand">
          <img src={logo} alt="Openzey" />
          <div>
            <strong>OpenSoft by OpenZey</strong>
            <span>منصة معيارية لإدارة عمليات المؤسسات</span>
          </div>
        </div>
        <p>
          OpenSoft منتج من OpenZey يجمع تطبيقات المبيعات والمخزون والعملاء والمصاريف والتقارير في مساحة عمل واحدة قابلة للتخصيص.
        </p>
        <p className="helper-text">
          للدعم التقني، التخصيص أو إضافة وحدات جديدة، يمكن التواصل مباشرة مع فريق OpenZey.
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
  const [busy, setBusy] = useState(false);


  async function openCaisse() {
    if (busy) return;
    setBusy(true);
    try {
      await api.openShift({ opening_amount: openingAmount, cashier });
      const message = "\u062a\u0645 \u0641\u062a\u062d \u0627\u0644\u0635\u0646\u062f\u0648\u0642";
      showToast(message, "success");
      onChanged();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function closeCaisse() {
    if (!shift || busy) return;
    setBusy(true);
    try {
      await api.closeShift({ id: shift.id });
      const message = "\u062a\u0645 \u063a\u0644\u0642 \u0627\u0644\u0635\u0646\u062f\u0648\u0642";
      showToast(message, "success");
      onChanged();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(message, "error");
    } finally {
      setBusy(false);
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
              <article><span>المبلغ المتوقع</span><strong>{money(shift.expected_amount)}</strong></article>
              <article><span>الغلق التلقائي</span><strong>{shift.auto_close_at.slice(0, 16)}</strong></article>
            </div>
            <p className="helper-text">{"عند الغلق سيسجل النظام المبلغ المتوقع تلقائيا بدون إدخال مبلغ."}</p>
            <div className="modal-actions">
              <button className="gold-button" type="button" disabled={busy} onClick={() => void closeCaisse()}>{busy ? "جار الغلق..." : "غلق الصندوق"}</button>
              <button className="ghost-button" type="button" disabled={busy} onClick={onClose}>إغلاق</button>
            </div>
          </div>
        ) : (
          <div className="cash-shift-body">
            <label><span>مبلغ الفتح</span><div className="field"><input type="number" min={0} value={openingAmount === 0 ? "" : openingAmount} onChange={(event) => setOpeningAmount(Number(event.target.value))} /></div></label>
            <p className="helper-text">{"وقت الغلق التلقائي يحدده المدير من الإعدادات."}</p>
            <div className="modal-actions">
              <button className="gold-button" type="button" disabled={busy} onClick={() => void openCaisse()}>{busy ? "جار الفتح..." : "فتح الصندوق"}</button>
              <button className="ghost-button" type="button" disabled={busy} onClick={onClose}>إغلاق</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
