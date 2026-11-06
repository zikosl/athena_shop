import { useMemo, useState } from "react";
import {
  BarChart3,
  Boxes,
  CircleDollarSign,
  HandCoins,
  LayoutGrid,
  PackageSearch,
  ReceiptText,
  Scale,
  Search,
  Settings,
  ShoppingCart,
  Truck,
  Wallet
} from "lucide-react";
import { Language, ViewKey } from "../../shared/types";
import { localized } from "../../shared/i18n";

interface Props {
  language: Language;
  userName: string;
  shiftOpen: boolean;
  alertCount: number;
  onNavigate: (view: ViewKey) => void;
}

export function AppLauncherPage({ language, userName, shiftOpen, alertCount, onNavigate }: Props) {
  const modules = useMemo(() => getModules(language), [language]);
  const [query, setQuery] = useState("");
  const visibleModules = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(language === "ar" ? "ar" : "fr");
    if (!normalized) return modules;
    return modules.filter((module) =>
      `${module.title} ${module.description}`.toLocaleLowerCase(language === "ar" ? "ar" : "fr").includes(normalized)
    );
  }, [language, modules, query]);

  return (
    <section className="app-launcher">
      <header className="launcher-heading">
        <div>
          <span className="launcher-eyebrow"><LayoutGrid size={16} /> {localized(language, "مساحة العمل", "Espace de travail")}</span>
          <h2>{localized(language, "مرحبًا", "Bienvenue")} {userName}</h2>
          <p>{localized(language, "اختر التطبيق الذي تريد العمل عليه. كل وحدة مستقلة وتستخدم نفس بيانات المؤسسة.", "Choisissez une application. Chaque module fonctionne séparément avec les mêmes données d’entreprise.")}</p>
        </div>
        <div className="launcher-status">
          <span className={shiftOpen ? "is-online" : "is-offline"}>
            <CircleDollarSign size={16} />
            {shiftOpen ? localized(language, "الصندوق مفتوح", "Caisse ouverte") : localized(language, "الصندوق مغلق", "Caisse fermée")}
          </span>
          <span><Boxes size={16} /> {alertCount} {localized(language, "تنبيه مخزون", "alertes de stock")}</span>
        </div>
      </header>

      <div className="launcher-toolbar">
        <label className="app-search">
          <Search size={19} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={localized(language, "ابحث عن تطبيق...", "Rechercher une application...")}
          />
        </label>
        <span>{visibleModules.length} {localized(language, "تطبيقات", "applications")}</span>
      </div>

      <div className="app-module-grid">
        {visibleModules.map((module) => {
          const Icon = module.icon;
          return (
            <button
              className="app-module-tile"
              data-tone={module.tone}
              key={module.key}
              type="button"
              onClick={() => onNavigate(module.key)}
            >
              <span className="app-module-icon"><Icon size={28} /></span>
              <span className="app-module-copy">
                <strong>{module.title}</strong>
                <small>{module.description}</small>
              </span>
              <span className="app-module-open">{localized(language, "فتح", "Ouvrir")}</span>
            </button>
          );
        })}
      </div>

      {!visibleModules.length && (
        <div className="launcher-empty">
          <Search size={28} />
          <strong>{localized(language, "لم نجد تطبيقًا بهذا الاسم", "Aucune application trouvée")}</strong>
          <span>{localized(language, "جرّب كلمة مثل المبيعات، المخزون أو التقارير.", "Essayez un terme comme ventes, stock ou rapports.")}</span>
        </div>
      )}
    </section>
  );
}

function getModules(language: Language) {
  const modules: Array<{ key: ViewKey; title: [string, string]; description: [string, string]; icon: typeof ShoppingCart; tone: string }> = [
    { key: "pos", title: ["المبيعات", "Ventes"], description: ["نقطة البيع، الفواتير، الخصومات والتحصيل", "Caisse, factures, remises et encaissements"], icon: ShoppingCart, tone: "blue" },
    { key: "stock", title: ["المخزون", "Stock"], description: ["المنتجات، الكميات، حركات المخزون والباركود", "Produits, quantités, mouvements et codes-barres"], icon: Boxes, tone: "cyan" },
    { key: "revenue", title: ["الطلبات", "Recettes"], description: ["مراجعة الفواتير، التعديل، الإرجاع والحذف", "Consulter, modifier, retourner et supprimer les ventes"], icon: ReceiptText, tone: "indigo" },
    { key: "delivery", title: ["التوصيل", "Livraison"], description: ["الطلبات قيد التوصيل، التحصيل والإرجاع", "Commandes en livraison, encaissements et retours"], icon: Truck, tone: "orange" },
    { key: "credits", title: ["العملاء والديون", "Clients et crédits"], description: ["حسابات العملاء، الدفعات والسجل المالي", "Comptes clients, paiements et historique financier"], icon: HandCoins, tone: "violet" },
    { key: "expenses", title: ["المصاريف", "Dépenses"], description: ["تسجيل المصاريف ومتابعة التدفقات الخارجة", "Enregistrer et suivre les sorties d’argent"], icon: Wallet, tone: "rose" },
    { key: "dashboard", title: ["لوحة المتابعة", "Tableau de bord"], description: ["ملخص اليوم والتنبيهات والمؤشرات الأساسية", "Résumé du jour, alertes et indicateurs clés"], icon: BarChart3, tone: "emerald" },
    { key: "reports", title: ["التقارير", "Rapports"], description: ["تحليل المبيعات، المصاريف، الأرباح والفترات", "Analyse des ventes, dépenses, bénéfices et périodes"], icon: PackageSearch, tone: "teal" },
    { key: "zakat", title: ["الزكاة", "Zakat"], description: ["متابعة الحول الهجري وتقدير وعاء الزكاة", "Suivre l’année hégirienne et estimer l’assiette de la zakat"], icon: Scale, tone: "amber" },
    { key: "settings", title: ["الإعدادات", "Paramètres"], description: ["الحساب، المظهر، الطباعة وقاعدة البيانات", "Compte, interface, impression et base de données"], icon: Settings, tone: "slate" }
  ];
  return modules.map((module) => ({ ...module, title: localized(language, ...module.title), description: localized(language, ...module.description) }));
}
