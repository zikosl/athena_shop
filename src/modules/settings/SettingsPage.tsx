import { FormEvent, useEffect, useState } from "react";
import { DatabaseZap, PackageMinus, Plus, Save, SprayCan, Trash2, UserRound } from "lucide-react";
import { api } from "../../shared/api";
import { useText } from "../../shared/i18n";
import { AppSettings, Flacon, FlaconInput, Language, UserSession } from "../../shared/types";

const emptyFlacon: FlaconInput = { name: "", volume_ml: 0, active: true };

export function SettingsPage({
  language,
  user,
  onUserChanged
}: {
  language: Language;
  user: UserSession;
  onUserChanged: (user: UserSession) => void;
}) {
  const t = useText(language);
  const [profile, setProfile] = useState({
    username: user.username,
    display_name: user.display_name,
    password: ""
  });
  const [flacons, setFlacons] = useState<Flacon[]>([]);
  const [flaconForm, setFlaconForm] = useState<FlaconInput>(emptyFlacon);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [dataStatus, setDataStatus] = useState("");
  const [dataError, setDataError] = useState("");
  const [settings, setSettings] = useState<AppSettings>({
    allow_negative_stock: true,
    cash_register_auto_close_time: "23:59",
    max_discount_amount: 200
  });
  const [settingsStatus, setSettingsStatus] = useState("");
  const [settingsError, setSettingsError] = useState("");

  const loadFlacons = () => api.flacons().then(setFlacons);

  useEffect(() => {
    loadFlacons().catch((err) => setError(err instanceof Error ? err.message : String(err)));
    api.appSettings()
      .then(setSettings)
      .catch((err) => setSettingsError(err instanceof Error ? err.message : String(err)));
  }, []);

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

  async function saveFlacon(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api.saveFlacon(flaconForm);
      setFlaconForm(emptyFlacon);
      await loadFlacons();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveSettings() {
    setSettingsStatus("");
    setSettingsError("");
    try {
      const saved = await api.saveAppSettings(settings);
      setSettings(saved);
      setSettingsStatus("تم حفظ إعدادات المخزون");
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : String(err));
    }
  }

  async function resetDummyData() {
    setDataStatus("");
    setDataError("");
    if (!window.confirm("هل تريد إعادة تهيئة قاعدة البيانات ببيانات تجريبية؟ سيتم استبدال المنتجات والمبيعات والديون والمصاريف الحالية.")) {
      return;
    }
    try {
      await api.resetWithDummyData();
      await loadFlacons();
      setDataStatus("تمت إعادة التهيئة ببيانات تجريبية.");
    } catch (err) {
      setDataError(err instanceof Error ? err.message : String(err));
    }
  }

  async function emptyDatabase() {
    setDataStatus("");
    setDataError("");
    if (!window.confirm("تأكيد نهائي: هل تريد تفريغ قاعدة البيانات بالكامل؟ سيتم حذف المنتجات، المبيعات، المصاريف، الديون، العطور، والقوارير. حساب المدير سيبقى محفوظا.")) {
      return;
    }
    try {
      await api.emptyDatabase();
      await loadFlacons();
      setFlaconForm(emptyFlacon);
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
            <span>{"وقت غلق الصندوق تلقائيا"}</span>
            <div className="field">
              <input
                type="time"
                value={settings.cash_register_auto_close_time}
                onChange={(event) => setSettings({ ...settings, cash_register_auto_close_time: event.target.value })}
              />
            </div>
          </label>
          <label>
            <span>{"\u0623\u0642\u0635\u0649 \u0645\u0628\u0644\u063a \u0644\u0644\u062a\u062e\u0641\u064a\u0636"}</span>
            <div className="field">
              <input
                type="number"
                min={0}
                value={settings.max_discount_amount === 0 ? "" : settings.max_discount_amount}
                onChange={(event) => setSettings({ ...settings, max_discount_amount: Math.max(0, Number(event.target.value)) })}
              />
            </div>
          </label>
          <p className="helper-text">
            عند التفعيل يمكن أن تصبح كمية المنتج سالبة في البيع أو الإخراج. عند الإيقاف يمنع النظام أي عملية تتجاوز الكمية المتوفرة.
          </p>
          {settingsError && <p className="error">{settingsError}</p>}
          {settingsStatus && <p className="helper-text">{settingsStatus}</p>}
          <button className="gold-button" type="button" onClick={() => void saveSettings()}><Save size={18} /> {t.save}</button>
        </div>
      </article>

      <article className="setting-row flacon-settings">
        <div><SprayCan size={22} /><strong>قوارير العطور</strong><span>أحجام قابلة للاستعمال في نقطة بيع العطور.</span></div>
        <form className="flacon-form" onSubmit={saveFlacon}>
          <label><span>الاسم</span><div className="field"><input placeholder="6ml" value={flaconForm.name} onChange={(event) => setFlaconForm({ ...flaconForm, name: event.target.value })} /></div></label>
          <label><span>الحجم ml</span><div className="field"><input type="number" min={0} step="0.1" value={flaconForm.volume_ml === 0 ? "" : flaconForm.volume_ml} onChange={(event) => setFlaconForm({ ...flaconForm, volume_ml: Number(event.target.value) })} /></div></label>
          <button className="gold-button" disabled={!flaconForm.name.trim() || flaconForm.volume_ml <= 0}><Plus size={17} /> إضافة قارورة</button>
        </form>
        <div className="flacon-list">
          {flacons.map((flacon) => (
            <button key={flacon.id} type="button" className="credit-row" onClick={() => setFlaconForm({ id: flacon.id, name: flacon.name, volume_ml: flacon.volume_ml, active: flacon.active })}>
              <span><strong>{flacon.name}</strong><small>{flacon.volume_ml} ml</small></span>
              <span className={`status-pill ${flacon.active ? "ok" : "warning"}`}>{flacon.active ? "نشط" : "غير نشط"}</span>
            </button>
          ))}
        </div>
        {flaconForm.id && (
          <button className="ghost-button compact-button" type="button" onClick={() => setFlaconForm(emptyFlacon)}>
            <Save size={16} /> قارورة جديدة
          </button>
        )}
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
