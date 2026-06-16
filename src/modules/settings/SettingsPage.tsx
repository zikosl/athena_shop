import { FormEvent, useEffect, useState } from "react";
import { DatabaseZap, LayoutPanelLeft, PackageMinus, Printer, Save, SlidersHorizontal, Trash2, UserRound } from "lucide-react";
import { api } from "../../shared/api";
import { useText } from "../../shared/i18n";
import { AppSettings, Language, UserSession } from "../../shared/types";

const defaultSettings: AppSettings = {
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

export function SettingsPage({
  language,
  user,
  onUserChanged,
  onSettingsChanged
}: {
  language: Language;
  user: UserSession;
  onUserChanged: (user: UserSession) => void;
  onSettingsChanged?: (settings: AppSettings) => void;
}) {
  const t = useText(language);
  const [profile, setProfile] = useState({
    username: user.username,
    display_name: user.display_name,
    password: ""
  });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [dataStatus, setDataStatus] = useState("");
  const [dataError, setDataError] = useState("");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [printers, setPrinters] = useState<string[]>([]);
  const [settingsStatus, setSettingsStatus] = useState("");
  const [settingsError, setSettingsError] = useState("");

  useEffect(() => {
    api.appSettings()
      .then((saved) => {
        const normalized = { ...defaultSettings, ...saved };
        setSettings(normalized);
        onSettingsChanged?.(normalized);
      })
      .catch((err) => setSettingsError(err instanceof Error ? err.message : String(err)));
    api.printers()
      .then(setPrinters)
      .catch(() => setPrinters([]));
  }, [onSettingsChanged]);

  function updateSettings(next: AppSettings) {
    setSettings(next);
    onSettingsChanged?.(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus("");
    setError("");
    try {
      const updated = await api.updateProfile({
        id: user.id,
        username: profile.username,
        display_name: profile.display_name,
        password: profile.password
      });
      setProfile({ username: updated.username, display_name: updated.display_name, password: "" });
      onUserChanged(updated);
      setStatus("تم حفظ الحساب");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveSettings() {
    setSettingsStatus("");
    setSettingsError("");
    try {
      const saved = await api.saveAppSettings(settings);
      const normalized = { ...defaultSettings, ...saved };
      setSettings(normalized);
      onSettingsChanged?.(normalized);
      setSettingsStatus("تم حفظ الإعدادات");
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : String(err));
    }
  }

  async function resetDummyData() {
    setDataStatus("");
    setDataError("");
    if (!window.confirm("هل تريد إعادة تهيئة قاعدة البيانات ببيانات تجريبية؟ سيتم استبدال المنتجات والمبيعات والديون والمصاريف الحالية.")) return;
    try {
      await api.resetWithDummyData();
      setDataStatus("تمت إعادة التهيئة ببيانات تجريبية.");
    } catch (err) {
      setDataError(err instanceof Error ? err.message : String(err));
    }
  }

  async function emptyDatabase() {
    setDataStatus("");
    setDataError("");
    if (!window.confirm("تأكيد نهائي: هل تريد تفريغ قاعدة البيانات بالكامل؟ سيتم حذف المنتجات، المبيعات، المصاريف، الديون، العطور، والقوارير. حساب المدير سيبقى محفوظا.")) return;
    try {
      await api.emptyDatabase();
      setDataStatus("تم تفريغ قاعدة البيانات بنجاح.");
    } catch (err) {
      setDataError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="panel settings-panel">
      <div className="section-title"><h2>{t.settings}</h2><span /></div>

      <form className="setting-row profile-editor" onSubmit={submit}>
        <div><UserRound size={22} /><strong>{t.adminAccount}</strong><span>{user.role}</span></div>
        <div className="profile-fields">
          <label><span>{t.username}</span><div className="field"><input value={profile.username} onChange={(event) => setProfile({ ...profile, username: event.target.value })} /></div></label>
          <label><span>الاسم المعروض</span><div className="field"><input value={profile.display_name} onChange={(event) => setProfile({ ...profile, display_name: event.target.value })} /></div></label>
          <label><span>كلمة مرور جديدة</span><div className="field"><input type="password" value={profile.password} onChange={(event) => setProfile({ ...profile, password: event.target.value })} /></div></label>
          {error && <p className="error">{error}</p>}
          {status && <p className="helper-text">{status}</p>}
          <button className="gold-button" disabled={!profile.username.trim() || !profile.display_name.trim()}><Save size={18} /> {t.save}</button>
        </div>
      </form>

      <article className="setting-row profile-editor">
        <div>
          <SlidersHorizontal size={22} />
          <strong>مظهر الواجهة</strong>
          <span>اضبط حجم الخط وكثافة العناصر حسب شاشة العمل.</span>
        </div>
        <div className="profile-fields">
          <label>
            <span>حجم الخط</span>
            <div className="segmented wide">
              <button className={settings.ui_font_scale === "small" ? "active" : ""} type="button" onClick={() => updateSettings({ ...settings, ui_font_scale: "small" })}>صغير</button>
              <button className={settings.ui_font_scale === "normal" ? "active" : ""} type="button" onClick={() => updateSettings({ ...settings, ui_font_scale: "normal" })}>عادي</button>
              <button className={settings.ui_font_scale === "large" ? "active" : ""} type="button" onClick={() => updateSettings({ ...settings, ui_font_scale: "large" })}>كبير</button>
            </div>
          </label>
          <label>
            <span>كثافة العناصر</span>
            <div className="segmented wide">
              <button className={settings.ui_density === "compact" ? "active" : ""} type="button" onClick={() => updateSettings({ ...settings, ui_density: "compact" })}>مضغوط</button>
              <button className={settings.ui_density === "comfortable" ? "active" : ""} type="button" onClick={() => updateSettings({ ...settings, ui_density: "comfortable" })}>مريح</button>
              <button className={settings.ui_density === "spacious" ? "active" : ""} type="button" onClick={() => updateSettings({ ...settings, ui_density: "spacious" })}>واسع</button>
            </div>
          </label>
          <p className="helper-text">الوضع المضغوط مناسب لشاشات 1024px لأنه يقلل المسافات ويحافظ على البيانات ظاهرة.</p>
          {settingsError && <p className="error">{settingsError}</p>}
          {settingsStatus && <p className="helper-text">{settingsStatus}</p>}
          <button className="gold-button" type="button" onClick={() => void saveSettings()}><Save size={18} /> {t.save}</button>
        </div>
      </article>

      <article className="setting-row profile-editor">
        <div>
          <LayoutPanelLeft size={22} />
          <strong>تخطيط نقطة البيع</strong>
          <span>تحكم في مكان السلة حتى تبقى عملية البيع سريعة على الشاشات الصغيرة.</span>
        </div>
        <div className="profile-fields">
          <label>
            <span>مكان السلة</span>
            <div className="segmented wide">
              <button className={settings.pos_layout === "auto" ? "active" : ""} type="button" onClick={() => updateSettings({ ...settings, pos_layout: "auto" })}>تلقائي</button>
              <button className={settings.pos_layout === "side" ? "active" : ""} type="button" onClick={() => updateSettings({ ...settings, pos_layout: "side" })}>جانبية</button>
              <button className={settings.pos_layout === "bottom" ? "active" : ""} type="button" onClick={() => updateSettings({ ...settings, pos_layout: "bottom" })}>أسفل</button>
            </div>
          </label>
          <label>
            <span>عرض السلة الجانبية: {settings.pos_cart_width}px</span>
            <div className="field">
              <input
                type="range"
                min={280}
                max={420}
                step={10}
                value={settings.pos_cart_width}
                onChange={(event) => updateSettings({ ...settings, pos_cart_width: Number(event.target.value) })}
              />
            </div>
          </label>
          <p className="helper-text">على شاشة 1024px يفضل اختيار تلقائي أو جانبية مع عرض 300-320px.</p>
          <button className="gold-button" type="button" onClick={() => void saveSettings()}><Save size={18} /> {t.save}</button>
        </div>
      </article>

      <article className="setting-row profile-editor">
        <div>
          <PackageMinus size={22} />
          <strong>إعدادات المخزون</strong>
          <span>التحكم في السماح ببيع أو إخراج كميات أكبر من المتوفر.</span>
        </div>
        <div className="profile-fields">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.allow_negative_stock}
              onChange={(event) => setSettings({ ...settings, allow_negative_stock: event.target.checked })}
            />
            <span>السماح بالمخزون السالب</span>
          </label>
          <label>
            <span>وقت غلق الصندوق تلقائيا</span>
            <div className="field"><input type="time" value={settings.cash_register_auto_close_time} onChange={(event) => setSettings({ ...settings, cash_register_auto_close_time: event.target.value })} /></div>
          </label>
          <label>
            <span>أقصى مبلغ للتخفيض</span>
            <div className="field"><input type="number" min={0} value={settings.max_discount_amount === 0 ? "" : settings.max_discount_amount} onChange={(event) => setSettings({ ...settings, max_discount_amount: Math.max(0, Number(event.target.value)) })} /></div>
          </label>
          <p className="helper-text">عند التفعيل يمكن أن تصبح كمية المنتج سالبة في البيع أو الإخراج. عند الإيقاف يمنع النظام أي عملية تتجاوز الكمية المتوفرة.</p>
          <button className="gold-button" type="button" onClick={() => void saveSettings()}><Save size={18} /> {t.save}</button>
        </div>
      </article>

      <article className="setting-row profile-editor">
        <div>
          <Printer size={22} />
          <strong>الطابعات</strong>
          <span>اختر طابعة مخصصة للفواتير وطابعة أخرى لملصقات الباركود.</span>
        </div>
        <div className="profile-fields">
          <label>
            <span>طابعة فاتورة نقطة البيع</span>
            <div className="field">
              <select value={settings.invoice_printer} onChange={(event) => setSettings({ ...settings, invoice_printer: event.target.value })}>
                <option value="">الطابعة الافتراضية</option>
                {printers.map((printer) => <option key={printer} value={printer}>{printer}</option>)}
              </select>
            </div>
          </label>
          <label>
            <span>طابعة ملصقات الباركود</span>
            <div className="field">
              <select value={settings.barcode_printer} onChange={(event) => setSettings({ ...settings, barcode_printer: event.target.value })}>
                <option value="">الطابعة الافتراضية</option>
                {printers.map((printer) => <option key={printer} value={printer}>{printer}</option>)}
              </select>
            </div>
          </label>
          {!printers.length && <p className="helper-text">لم يتم العثور على طابعات. تأكد من إعدادات Windows ثم أعد فتح الصفحة.</p>}
          <button className="gold-button" type="button" onClick={() => void saveSettings()}><Save size={18} /> {t.save}</button>
        </div>
      </article>

      <article className="setting-row debug-reset-row">
        <div>
          <DatabaseZap size={22} />
          <strong>إدارة بيانات التجربة</strong>
          <span>أدوات مؤقتة لاختبار النظام أو تفريغ بيانات العمل.</span>
        </div>
        <div className="profile-fields">
          <p className="helper-text">زر البيانات التجريبية يستبدل بيانات العمل بأرقام جاهزة للاختبار. زر التفريغ يحذف كل بيانات العمل ويترك حساب المدير فقط.</p>
          {dataError && <p className="error">{dataError}</p>}
          {dataStatus && <p className="helper-text">{dataStatus}</p>}
          <button className="ghost-button danger-action" type="button" onClick={() => void resetDummyData()}>
            <DatabaseZap size={18} /> تهيئة بيانات تجريبية
          </button>
          <button className="ghost-button danger-action" type="button" onClick={() => void emptyDatabase()}>
            <Trash2 size={18} /> تفريغ قاعدة البيانات
          </button>
        </div>
      </article>
    </section>
  );
}
