import { useEffect, useState } from "react";
import { Box, ChartColumnIncreasing, ShoppingCart, Wallet, Coins, AlertTriangle, HandCoins } from "lucide-react";
import { api } from "../../shared/api";
import { money } from "../../shared/format";
import { useText } from "../../shared/i18n";
import { DashboardStats, Language, ViewKey } from "../../shared/types";

interface Props {
  language: Language;
  refreshToken: number;
  onNavigate: (view: ViewKey) => void;
  onOpenAlerts: () => void;
}

export function DashboardPage({ language, refreshToken, onNavigate, onOpenAlerts }: Props) {
  const t = useText(language);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    api.dashboard().then(setStats).catch(console.error);
  }, [refreshToken]);

  const modules = [
    { key: "stock" as ViewKey, title: t.modules.stockTitle, icon: Box, text: t.modules.stockText },
    { key: "pos" as ViewKey, title: t.modules.posTitle, icon: ShoppingCart, text: t.modules.posText },
    { key: "revenue" as ViewKey, title: t.modules.revenueTitle, icon: ChartColumnIncreasing, text: t.modules.revenueText },
    { key: "expenses" as ViewKey, title: t.modules.expensesTitle, icon: Wallet, text: t.modules.expensesText },
    { key: "credits" as ViewKey, title: t.modules.creditsTitle, icon: HandCoins, text: t.modules.creditsText }
  ];

  const cards = [
    { label: t.dailySales, value: money(stats?.sales_today ?? 0), icon: ShoppingCart, trend: "+12.5%" },
    { label: t.salesCount, value: String(stats?.sales_count_today ?? 0), icon: Box, trend: "+8.3%" },
    { label: t.dailyRevenue, value: money(stats?.revenue_today ?? 0), icon: Coins, trend: "+12.5%" },
    { label: t.dailyExpenses, value: money(stats?.expenses_today ?? 0), icon: Wallet, trend: "-3.2%", danger: true },
    { label: t.dailyProfit, value: money(stats?.profit_today ?? 0), icon: ChartColumnIncreasing, trend: "+18.7%" },
    { label: t.paymentsToday, value: money(stats?.credit_payments_today ?? 0), icon: HandCoins, trend: t.cash },
    { label: t.totalToCollect, value: money(stats?.credit_remaining_total ?? 0), icon: HandCoins, trend: `${stats?.open_credit_count ?? 0} ${t.credit}`, danger: (stats?.open_credit_count ?? 0) > 0 },
    { label: t.lowStock, value: String(stats?.low_stock_count ?? 0), icon: AlertTriangle, trend: t.alerts, danger: (stats?.low_stock_count ?? 0) > 0 }
  ];

  return (
    <>
      <section className="module-grid">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <article className="module-card" key={module.key}>
              <div className="module-icon"><Icon size={48} /></div>
              <h3>{module.title}</h3>
              <p>{module.text}</p>
              <button onClick={() => onNavigate(module.key)}>{t.access}<span>→</span></button>
            </article>
          );
        })}
      </section>

      <section className="panel">
        <div className="section-title"><h2>{t.today}</h2><span /></div>
        <div className="stats-grid">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <article className="stat-card" key={card.label} onClick={() => {
                if (card.label === t.totalToCollect || card.label === t.paymentsToday) onNavigate("credits");
                if (card.label === t.lowStock) onOpenAlerts();
              }}>
                <div className="stat-icon"><Icon size={23} /></div>
                <div>
                  <p>{card.label}</p>
                  <strong>{card.value}</strong>
                  <em className={card.danger ? "danger" : "success"}>{card.trend}</em>
                  <small>{t.vsYesterday}</small>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
