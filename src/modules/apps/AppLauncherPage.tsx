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
import { ViewKey } from "../../shared/types";

interface Props {
  userName: string;
  shiftOpen: boolean;
  alertCount: number;
  onNavigate: (view: ViewKey) => void;
}

const modules: Array<{
  key: ViewKey;
  title: string;
  description: string;
  icon: typeof ShoppingCart;
  tone: string;
}> = [
  { key: "pos", title: "المبيعات", description: "نقطة البيع، الفواتير، الخصومات والتحصيل", icon: ShoppingCart, tone: "blue" },
  { key: "stock", title: "المخزون", description: "المنتجات، الكميات، حركات المخزون والباركود", icon: Boxes, tone: "cyan" },
  { key: "revenue", title: "الطلبات", description: "مراجعة الفواتير، التعديل، الإرجاع والحذف", icon: ReceiptText, tone: "indigo" },
  { key: "delivery", title: "التوصيل", description: "الطلبات قيد التوصيل، التحصيل والإرجاع", icon: Truck, tone: "orange" },
  { key: "credits", title: "العملاء والديون", description: "حسابات العملاء، الدفعات والسجل المالي", icon: HandCoins, tone: "violet" },
  { key: "expenses", title: "المصاريف", description: "تسجيل المصاريف ومتابعة التدفقات الخارجة", icon: Wallet, tone: "rose" },
  { key: "dashboard", title: "لوحة المتابعة", description: "ملخص اليوم والتنبيهات والمؤشرات الأساسية", icon: BarChart3, tone: "emerald" },
  { key: "reports", title: "التقارير", description: "تحليل المبيعات، المصاريف، الأرباح والفترات", icon: PackageSearch, tone: "teal" },
  { key: "zakat", title: "الزكاة", description: "متابعة الحول الهجري وتقدير وعاء الزكاة", icon: Scale, tone: "amber" },
  { key: "settings", title: "الإعدادات", description: "الحساب، المظهر، الطباعة وقاعدة البيانات", icon: Settings, tone: "slate" }
];

export function AppLauncherPage({ userName, shiftOpen, alertCount, onNavigate }: Props) {
  const [query, setQuery] = useState("");
  const visibleModules = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ar");
    if (!normalized) return modules;
    return modules.filter((module) =>
      `${module.title} ${module.description}`.toLocaleLowerCase("ar").includes(normalized)
    );
  }, [query]);

  return (
    <section className="app-launcher">
      <header className="launcher-heading">
        <div>
          <span className="launcher-eyebrow"><LayoutGrid size={16} /> مساحة العمل</span>
          <h2>مرحبًا {userName}</h2>
          <p>اختر التطبيق الذي تريد العمل عليه. كل وحدة مستقلة وتستخدم نفس بيانات المؤسسة.</p>
        </div>
        <div className="launcher-status">
          <span className={shiftOpen ? "is-online" : "is-offline"}>
            <CircleDollarSign size={16} />
            {shiftOpen ? "الصندوق مفتوح" : "الصندوق مغلق"}
          </span>
          <span><Boxes size={16} /> {alertCount} تنبيه مخزون</span>
        </div>
      </header>

      <div className="launcher-toolbar">
        <label className="app-search">
          <Search size={19} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث عن تطبيق..."
          />
        </label>
        <span>{visibleModules.length} تطبيقات</span>
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
              <span className="app-module-open">فتح</span>
            </button>
          );
        })}
      </div>

      {!visibleModules.length && (
        <div className="launcher-empty">
          <Search size={28} />
          <strong>لم نجد تطبيقًا بهذا الاسم</strong>
          <span>جرّب كلمة مثل المبيعات، المخزون أو التقارير.</span>
        </div>
      )}
    </section>
  );
}
