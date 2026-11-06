import { FormEvent, useEffect, useState } from "react";
import { DatabaseZap, LayoutPanelLeft, PackageMinus, Palette, Printer, Save, SlidersHorizontal, Trash2, UserRound } from "lucide-react";
import { api } from "../../shared/api";
import { useText } from "../../shared/i18n";
import { localized } from "../../shared/i18n";
import { showErrorToast, showToast } from "../../shared/toast";
import { AppSettings, Language, UserSession } from "../../shared/types";
import { Button, SectionHeader, SelectField, TextField } from "../../shared/ui";

const zoomStep = 5;
type SettingsTab = "profile" | "interface" | "printing" | "system";
const themePresets = [
  { name: ["أزرق OpenZey", "Bleu OpenZey"], value: "#2563eb" },
  { name: ["أزرق داكن", "Bleu foncé"], value: "#1d4ed8" },
  { name: ["فيروزي", "Turquoise"], value: "#0f766e" },
  { name: ["أخضر", "Vert"], value: "#15803d" },
  { name: ["بنفسجي", "Violet"], value: "#7c3aed" },
  { name: ["أحمر", "Rouge"], value: "#dc2626" }
] as const;

const defaultSettings: AppSettings = {
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
  pos_cart_width: 420,
  enable_perfumes: false,
  enable_tobacco: true,
  enable_flexy: true,
  enable_printing: true
};

export function SettingsPage({
  language,
  onLanguageChange,
  user,
  onUserChanged,
  onSettingsChanged
}: {
  language: Language;
  onLanguageChange: (language: Language) => void;
  user: UserSession;
  onUserChanged: (user: UserSession) => void;
  onSettingsChanged?: (settings: AppSettings) => void;
}) {
  const t = useText(language);
  const tr = (arabic: string, french: string) => localized(language, arabic, french);
  const [profile, setProfile] = useState({
    username: user.username,
    display_name: user.display_name,
    password: ""
  });
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [printers, setPrinters] = useState<string[]>([]);
  const [tab, setTab] = useState<SettingsTab>("profile");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [resettingData, setResettingData] = useState(false);
  const [emptyingData, setEmptyingData] = useState(false);

  useEffect(() => {
    api.appSettings()
      .then((saved) => {
        const normalized = { ...defaultSettings, ...saved };
        setSettings(normalized);
        onSettingsChanged?.(normalized);
      })
      .catch((err) => showErrorToast(err, tr("تعذر تحميل الإعدادات", "Impossible de charger les paramètres")));
    api.printers()
      .then(setPrinters)
      .catch((err) => {
        setPrinters([]);
        showToast(tr("تعذر قراءة طابعات Windows. تحقق من اتصال الطابعة.", "Impossible de détecter les imprimantes Windows. Vérifiez leur connexion."), "warning", {
          title: tr("الطابعات غير متاحة", "Imprimantes indisponibles")
        });
        console.warn(err);
      });
  }, [onSettingsChanged]);

  function updateSettings(next: AppSettings) {
    setSettings(next);
    onSettingsChanged?.(next);
  }

  function updateZoom(nextZoom: number) {
    updateSettings({
      ...settings,
      ui_zoom: Math.min(125, Math.max(80, nextZoom))
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      const updated = await api.updateProfile({
        id: user.id,
        username: profile.username,
        display_name: profile.display_name,
        password: profile.password
      });
      setProfile({ username: updated.username, display_name: updated.display_name, password: "" });
      onUserChanged(updated);
      showToast(tr("تم حفظ بيانات الحساب", "Informations du compte enregistrées"), "success");
    } catch (err) {
      showErrorToast(err, tr("تعذر حفظ الحساب", "Impossible d’enregistrer le compte"));
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveSettings() {
    if (savingSettings) return;
    setSavingSettings(true);
    try {
      const saved = await api.saveAppSettings(settings);
      const normalized = { ...defaultSettings, ...saved };
      setSettings(normalized);
      onSettingsChanged?.(normalized);
      showToast(tr("تم حفظ الإعدادات وتطبيقها", "Paramètres enregistrés et appliqués"), "success");
    } catch (err) {
      showErrorToast(err, tr("تعذر حفظ الإعدادات", "Impossible d’enregistrer les paramètres"));
    } finally {
      setSavingSettings(false);
    }
  }

  async function resetDummyData() {
    if (!window.confirm(tr("هل تريد إعادة تهيئة قاعدة البيانات ببيانات تجريبية؟ سيتم استبدال المنتجات والمبيعات والديون والمصاريف الحالية.", "Réinitialiser la base avec des données de démonstration ? Les produits, ventes, crédits et dépenses actuels seront remplacés."))) return;
    setResettingData(true);
    try {
      await api.resetWithDummyData();
      showToast(tr("تمت إعادة التهيئة ببيانات تجريبية", "Base réinitialisée avec des données de démonstration"), "success");
    } catch (err) {
      showErrorToast(err, tr("تعذرت إعادة تهيئة البيانات", "Impossible de réinitialiser les données"));
    } finally {
      setResettingData(false);
    }
  }

  async function emptyDatabase() {
    if (!window.confirm(tr("تأكيد نهائي: هل تريد تفريغ قاعدة البيانات بالكامل؟ سيتم حذف المنتجات، المبيعات، المصاريف، الديون، العطور، والقوارير. حساب المدير سيبقى محفوظا.", "Confirmation finale : vider entièrement la base de données ? Les produits, ventes, dépenses, crédits, parfums et flacons seront supprimés. Le compte administrateur sera conservé."))) return;
    setEmptyingData(true);
    try {
      await api.emptyDatabase();
      showToast(tr("تم تفريغ قاعدة البيانات بنجاح", "Base de données vidée"), "success");
    } catch (err) {
      showErrorToast(err, tr("تعذر تفريغ قاعدة البيانات", "Impossible de vider la base de données"));
    } finally {
      setEmptyingData(false);
    }
  }

  return (
    <section className="panel settings-panel">
      <SectionHeader title={t.settings} />
      <div className="segmented wide settings-tabs">
        <button type="button" className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>{tr("الحساب", "Compte")}</button>
        <button type="button" className={tab === "interface" ? "active" : ""} onClick={() => setTab("interface")}>{tr("الواجهة", "Interface")}</button>
        <button type="button" className={tab === "printing" ? "active" : ""} onClick={() => setTab("printing")}>{tr("الطباعة والتذاكر", "Impression et tickets")}</button>
        <button type="button" className={tab === "system" ? "active" : ""} onClick={() => setTab("system")}>{tr("النظام", "Système")}</button>
      </div>

      <form className="setting-row profile-editor" onSubmit={submit} style={{ display: tab === "profile" ? undefined : "none" }}>
        <div><UserRound size={22} /><strong>{t.adminAccount}</strong><span>{user.role}</span></div>
        <div className="profile-fields">
          <TextField label={t.username} value={profile.username} onValueChange={(username) => setProfile({ ...profile, username })} />
          <TextField label={tr("الاسم المعروض", "Nom affiché")} value={profile.display_name} onValueChange={(display_name) => setProfile({ ...profile, display_name })} />
          <TextField label={tr("كلمة مرور جديدة", "Nouveau mot de passe")} type="password" value={profile.password} onValueChange={(password) => setProfile({ ...profile, password })} />
          <Button variant="primary" disabled={!profile.username.trim() || !profile.display_name.trim()}><Save size={18} /> {t.save}</Button>
        </div>
      </form>

      <article className="setting-row profile-editor" style={{ display: tab === "interface" ? undefined : "none" }}>
        <div>
          <SlidersHorizontal size={22} />
          <strong>{tr("لغة التطبيق", "Langue de l’application")}</strong>
          <span>{tr("اختر لغة الواجهة واتجاه العرض.", "Choisissez la langue et le sens de l’interface.")}</span>
        </div>
        <div className="profile-fields">
          <SelectField
            label={t.language}
            value={language}
            onValueChange={(value) => onLanguageChange(value as Language)}
            options={[{ value: "ar", label: "العربية" }, { value: "fr", label: "Français" }]}
          />
        </div>
      </article>

      <article className="setting-row profile-editor" style={{ display: tab === "interface" ? undefined : "none" }}>
        <div>
          <Palette size={22} />
          <strong>{tr("هوية المؤسسة", "Identité de l’entreprise")}</strong>
          <span>{tr("اختر اللون الرئيسي الذي سيظهر في الأزرار، الحالات النشطة والروابط داخل OpenSoft.", "Choisissez la couleur principale des boutons, états actifs et liens dans OpenSoft.")}</span>
        </div>
        <div className="profile-fields">
          <div className="theme-preset-grid">
            {themePresets.map((preset) => (
              <button
                className={`theme-preset ${settings.theme_primary_color.toLowerCase() === preset.value ? "active" : ""}`}
                key={preset.value}
                type="button"
                onClick={() => updateSettings({ ...settings, theme_primary_color: preset.value })}
              >
                <span className="theme-swatch" style={{ backgroundColor: preset.value }} />
                {preset.name[language === "ar" ? 0 : 1]}
              </button>
            ))}
          </div>
          <label className="theme-custom-label">
            <span>{tr("لون مخصص", "Couleur personnalisée")}</span>
            <div className="theme-color-field">
              <input
                type="color"
                value={settings.theme_primary_color}
                onChange={(event) => updateSettings({ ...settings, theme_primary_color: event.target.value })}
                aria-label={tr("اختيار اللون الرئيسي", "Choisir la couleur principale")}
              />
              <input
                value={settings.theme_primary_color}
                maxLength={7}
                dir="ltr"
                onChange={(event) => {
                  const value = event.target.value;
                  setSettings({ ...settings, theme_primary_color: value });
                  if (/^#[0-9a-f]{6}$/i.test(value)) {
                    onSettingsChanged?.({ ...settings, theme_primary_color: value });
                  }
                }}
              />
            </div>
          </label>
          <p className="helper-text">{tr("يمكن التبديل بين الوضع الفاتح والداكن من الشريط العلوي. اللون المختار يعمل في الوضعين تلقائيًا.", "Vous pouvez changer de thème depuis la barre supérieure. La couleur choisie s’adapte automatiquement aux deux modes.")}</p>
          <Button variant="primary" type="button" disabled={savingSettings} onClick={() => void saveSettings()}>
            <Save size={18} /> {savingSettings ? "جار الحفظ..." : t.save}
          </Button>
        </div>
      </article>

      <article className="setting-row profile-editor service-settings" style={{ display: tab === "interface" ? undefined : "none" }}>
        <div>
          <SlidersHorizontal size={22} />
          <strong>{tr("خدمات نقطة البيع", "Services de caisse")}</strong>
          <span>{tr("اختر الخدمات التي تظهر للكاشير أثناء البيع.", "Choisissez les services affichés au caissier pendant la vente.")}</span>
        </div>
        <div className="profile-fields service-toggle-grid">
          <label className="toggle-row"><input type="checkbox" checked={settings.enable_perfumes} onChange={(event) => setSettings({ ...settings, enable_perfumes: event.target.checked })} /><span>{tr("العطور", "Parfums")}</span></label>
          <label className="toggle-row"><input type="checkbox" checked={settings.enable_tobacco} onChange={(event) => setSettings({ ...settings, enable_tobacco: event.target.checked })} /><span>{tr("التبغ", "Tabac")}</span></label>
          <label className="toggle-row"><input type="checkbox" checked={settings.enable_flexy} onChange={(event) => setSettings({ ...settings, enable_flexy: event.target.checked })} /><span>Flexy</span></label>
          <label className="toggle-row"><input type="checkbox" checked={settings.enable_printing} onChange={(event) => setSettings({ ...settings, enable_printing: event.target.checked })} /><span>{tr("خدمات الطباعة", "Services d’impression")}</span></label>
          <Button variant="primary" type="button" disabled={savingSettings} onClick={() => void saveSettings()}><Save size={18} /> {t.save}</Button>
        </div>
      </article>

      <article className="setting-row profile-editor" style={{ display: tab === "interface" ? undefined : "none" }}>
        <div>
          <SlidersHorizontal size={22} />
          <strong>{tr("مظهر الواجهة", "Apparence de l’interface")}</strong>
          <span>{tr("اضبط حجم الخط وكثافة العناصر حسب شاشة العمل.", "Réglez la taille du texte et la densité selon votre écran de travail.")}</span>
        </div>
        <div className="profile-fields">
          <label>
            <span>{tr("حجم الخط", "Taille du texte")}</span>
            <div className="segmented wide">
              <button className={settings.ui_font_scale === "small" ? "active" : ""} type="button" onClick={() => updateSettings({ ...settings, ui_font_scale: "small" })}>{tr("صغير", "Petit")}</button>
              <button className={settings.ui_font_scale === "normal" ? "active" : ""} type="button" onClick={() => updateSettings({ ...settings, ui_font_scale: "normal" })}>{tr("عادي", "Normal")}</button>
              <button className={settings.ui_font_scale === "large" ? "active" : ""} type="button" onClick={() => updateSettings({ ...settings, ui_font_scale: "large" })}>{tr("كبير", "Grand")}</button>
            </div>
          </label>
          <label>
            <span>{tr("تكبير الواجهة:", "Zoom de l’interface :")} {settings.ui_zoom ?? 100}%</span>
            <div className="segmented wide zoom-controls">
              <button type="button" onClick={() => updateZoom((settings.ui_zoom ?? 100) - zoomStep)}>-</button>
              <button className={(settings.ui_zoom ?? 100) === 100 ? "active" : ""} type="button" onClick={() => updateZoom(100)}>100%</button>
              <button type="button" onClick={() => updateZoom((settings.ui_zoom ?? 100) + zoomStep)}>+</button>
            </div>
          </label>
          <label>
            <span>{tr("كثافة العناصر", "Densité de l’interface")}</span>
            <div className="segmented wide">
              <button className={settings.ui_density === "compact" ? "active" : ""} type="button" onClick={() => updateSettings({ ...settings, ui_density: "compact" })}>{tr("مضغوط", "Compact")}</button>
              <button className={settings.ui_density === "comfortable" ? "active" : ""} type="button" onClick={() => updateSettings({ ...settings, ui_density: "comfortable" })}>{tr("مريح", "Confortable")}</button>
              <button className={settings.ui_density === "spacious" ? "active" : ""} type="button" onClick={() => updateSettings({ ...settings, ui_density: "spacious" })}>{tr("واسع", "Aéré")}</button>
            </div>
          </label>
          <p className="helper-text">{tr("الوضع المضغوط مناسب لشاشات 1024px لأنه يقلل المسافات ويحافظ على البيانات ظاهرة.", "Le mode compact convient aux écrans de 1024 px : il réduit l’espacement et garde davantage d’informations visibles.")}</p>
          <Button variant="primary" type="button" onClick={() => void saveSettings()}><Save size={18} /> {t.save}</Button>
        </div>
      </article>

      <article className="setting-row profile-editor" style={{ display: tab === "interface" ? undefined : "none" }}>
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
          <p className="helper-text">على الشاشات الضيقة اختر العرض التلقائي لتوفير مساحة المنتجات.</p>
          <Button variant="primary" type="button" onClick={() => void saveSettings()}><Save size={18} /> {t.save}</Button>
        </div>
      </article>

      <article className="setting-row profile-editor" style={{ display: tab === "interface" ? undefined : "none" }}>
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
          <TextField label="وقت غلق الصندوق تلقائيا" type="time" value={settings.cash_register_auto_close_time} onValueChange={(cash_register_auto_close_time) => setSettings({ ...settings, cash_register_auto_close_time })} />
          <TextField label="أقصى مبلغ للتخفيض" type="number" min={0} value={settings.max_discount_amount} onValueChange={(value) => setSettings({ ...settings, max_discount_amount: Math.max(0, Number(value)) })} />
          <p className="helper-text">عند التفعيل يمكن أن تصبح كمية المنتج سالبة في البيع أو الإخراج. عند الإيقاف يمنع النظام أي عملية تتجاوز الكمية المتوفرة.</p>
          <Button variant="primary" type="button" onClick={() => void saveSettings()}><Save size={18} /> {t.save}</Button>
        </div>
      </article>

      <article className="setting-row profile-editor" style={{ display: tab === "printing" ? undefined : "none" }}>
        <div>
          <Printer size={22} />
          <strong>{tr("الطابعات", "Imprimantes")}</strong>
          <span>{tr("اختر طابعة مخصصة للفواتير وطابعة أخرى لملصقات الباركود.", "Choisissez une imprimante pour les factures et une autre pour les étiquettes de codes-barres.")}</span>
        </div>
        <div className="profile-fields">
          <SelectField label={tr("طابعة فاتورة نقطة البيع", "Imprimante des factures de vente")} value={settings.invoice_printer} onValueChange={(invoice_printer) => setSettings({ ...settings, invoice_printer })} options={[{ value: "", label: tr("الطابعة الافتراضية", "Imprimante par défaut") }, ...printers.map((printer) => ({ value: printer, label: printer }))]} />
          <SelectField label={tr("طابعة ملصقات الباركود", "Imprimante des étiquettes code-barres")} value={settings.barcode_printer} onValueChange={(barcode_printer) => setSettings({ ...settings, barcode_printer })} options={[{ value: "", label: tr("الطابعة الافتراضية", "Imprimante par défaut") }, ...printers.map((printer) => ({ value: printer, label: printer }))]} />
          {!printers.length && <p className="helper-text">{tr("لم يتم العثور على طابعات. تأكد من إعدادات Windows ثم أعد فتح الصفحة.", "Aucune imprimante détectée. Vérifiez les paramètres Windows puis rechargez cette page.")}</p>}
          <Button variant="primary" type="button" onClick={() => void saveSettings()}><Save size={18} /> {t.save}</Button>
        </div>
      </article>

      <article className="setting-row profile-editor" style={{ display: tab === "printing" ? undefined : "none" }}>
        <div>
          <Printer size={22} />
          <strong>{tr("ضبط التذكرة والباركود", "Format des tickets et codes-barres")}</strong>
          <span>{tr("إعدادات منفصلة لتذكرة البيع وملصق الباركود، مناسبة لمقاسات 20x40 مم.", "Réglages distincts pour les tickets de vente et les étiquettes code-barres, adaptés au format 20 × 40 mm.")}</span>
        </div>
        <div className="profile-fields">
          <TextField label={tr("عنوان الفاتورة", "Titre du ticket")} value={settings.receipt_title} onValueChange={(receipt_title) => setSettings({ ...settings, receipt_title })} />
          <TextField label={tr("العنوان الفرعي", "Sous-titre")} value={settings.receipt_subtitle} onValueChange={(receipt_subtitle) => setSettings({ ...settings, receipt_subtitle })} />
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.show_invoice_logo}
              onChange={(event) => setSettings({ ...settings, show_invoice_logo: event.target.checked })}
            />
            <span>{tr("إظهار الشعار في الفاتورة", "Afficher le logo sur le ticket")}</span>
          </label>
          <TextField label={tr("عرض نص الفاتورة بالحروف", "Largeur du ticket (caractères)")} type="number" min={24} max={48} value={settings.ticket_width_chars} onValueChange={(value) => setSettings({ ...settings, ticket_width_chars: Number(value) })} />
          <TextField label={tr("عرض ملصق الباركود بالملم", "Largeur de l’étiquette (mm)")} type="number" min={20} max={100} value={settings.barcode_label_width_mm} onValueChange={(value) => setSettings({ ...settings, barcode_label_width_mm: Number(value) })} />
          <TextField label={tr("ارتفاع ملصق الباركود بالملم", "Hauteur de l’étiquette (mm)")} type="number" min={10} max={80} value={settings.barcode_label_height_mm} onValueChange={(value) => setSettings({ ...settings, barcode_label_height_mm: Number(value) })} />
          <label className="barcode-range-field">
            <span>{tr("كثافة طباعة الباركود:", "Densité d’impression du code-barres :")} {settings.barcode_darkness}/5</span>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={settings.barcode_darkness}
              onChange={(event) => setSettings({ ...settings, barcode_darkness: Number(event.target.value) })}
            />
          </label>
          <label className="barcode-speed-field">
            <span>{tr("سرعة طباعة الباركود", "Vitesse d’impression du code-barres")}</span>
            <div className="segmented wide">
              <button className={settings.barcode_speed === "slow" ? "active" : ""} type="button" onClick={() => setSettings({ ...settings, barcode_speed: "slow" })}>{tr("بطيئة · أفضل جودة", "Lente · meilleure qualité")}</button>
              <button className={settings.barcode_speed === "normal" ? "active" : ""} type="button" onClick={() => setSettings({ ...settings, barcode_speed: "normal" })}>{tr("عادية", "Normale")}</button>
              <button className={settings.barcode_speed === "fast" ? "active" : ""} type="button" onClick={() => setSettings({ ...settings, barcode_speed: "fast" })}>{tr("سريعة", "Rapide")}</button>
            </div>
          </label>
          <p className="helper-text">{tr("لملصقات 20x40 مم اجعل العرض 40 والارتفاع 20. إذا كان الباركود لا يقرأ، جرّب تقليل طول اسم المنتج أو زيادة الارتفاع قليلا.", "Pour une étiquette 20 × 40 mm, réglez la largeur sur 40 et la hauteur sur 20. Si le code-barres est illisible, raccourcissez le nom du produit ou augmentez légèrement la hauteur.")}</p>
          <Button variant="primary" type="button" disabled={savingSettings} onClick={() => void saveSettings()}><Save size={18} /> {savingSettings ? tr("جار الحفظ...", "Enregistrement...") : t.save}</Button>
        </div>
      </article>

      <article className="setting-row debug-reset-row" style={{ display: tab === "system" ? undefined : "none" }}>
        <div>
          <DatabaseZap size={22} />
          <strong>{tr("إدارة بيانات التجربة", "Gestion des données de test")}</strong>
          <span>{tr("أدوات مؤقتة لاختبار النظام أو تفريغ بيانات العمل.", "Outils temporaires pour tester le système ou vider les données de travail.")}</span>
        </div>
        <div className="profile-fields">
          <p className="helper-text">{tr("زر البيانات التجريبية يستبدل بيانات العمل بأرقام جاهزة للاختبار. زر التفريغ يحذف كل بيانات العمل ويترك حساب المدير فقط.", "Les données de démonstration remplacent les données de travail par des exemples. La suppression vide toutes les données et conserve uniquement le compte administrateur.")}</p>
          <button className="ghost-button danger-action" type="button" disabled={resettingData || emptyingData} onClick={() => void resetDummyData()}>
            <DatabaseZap size={18} /> {resettingData ? tr("جار التهيئة...", "Réinitialisation...") : tr("تهيئة بيانات تجريبية", "Charger les données de démonstration")}
          </button>
          <button className="ghost-button danger-action" type="button" disabled={resettingData || emptyingData} onClick={() => void emptyDatabase()}>
            <Trash2 size={18} /> {emptyingData ? tr("جار التفريغ...", "Suppression en cours...") : tr("تفريغ قاعدة البيانات", "Vider la base de données")}
          </button>
        </div>
      </article>
    </section>
  );
}
