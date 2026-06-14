import { useEffect, useState } from "react";
import { Box, ChartColumnIncreasing, ShoppingCart, Wallet, Coins, AlertTriangle, HandCoins, ReceiptText, SprayCan } from "lucide-react";
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
    { key: "perfumery" as ViewKey, title: t.modules.perfumeryTitle, icon: SprayCan, text: t.modules.perfumeryText },
    { key: "pos" as ViewKey, title: t.modules.posTitle, icon: ShoppingCart, text: t.modules.posText },
    { key: "revenue" as ViewKey, title: t.modules.revenueTitle, icon: ChartColumnIncreasing, text: t.modules.revenueText },
    { key: "reports" as ViewKey, title: t.modules.reportsTitle, icon: ReceiptText, text: t.modules.reportsText },
    { key: "expenses" as ViewKey, title: t.modules.expensesTitle, icon: Wallet, text: t.modules.expensesText },
    { key: "credits" as ViewKey, title: t.modules.creditsTitle, icon: HandCoins, text: t.modules.creditsText }
  ];

  const cards = [
    {
      label: t.dailySales,
      value: money(stats?.sales_today ?? 0),
      icon: ShoppingCart,
      trend: trendLabel(stats?.sales_today ?? 0, stats?.sales_yesterday ?? 0),
      danger: false
    },
    {
      label: t.salesCount,
      value: String(stats?.sales_count_today ?? 0),
      icon: Box,
      trend: trendLabel(stats?.sales_count_today ?? 0, stats?.sales_count_yesterday ?? 0),
      danger: false
    },
    {
      label: t.dailyRevenue,
      value: money(stats?.revenue_today ?? 0),
      icon: Coins,
      trend: trendLabel(stats?.revenue_today ?? 0, stats?.revenue_yesterday ?? 0),
      danger: false
    },
    {
      label: t.dailyExpenses,
      value: money(stats?.expenses_today ?? 0),
      icon: Wallet,
      trend: trendLabel(stats?.expenses_today ?? 0, stats?.expenses_yesterday ?? 0),
      danger: (stats?.expenses_today ?? 0) > (stats?.expenses_yesterday ?? 0)
    },
    {
      label: t.dailyProfit,
      value: money(stats?.profit_today ?? 0),
      icon: ChartColumnIncreasing,
      trend: trendLabel(stats?.profit_today ?? 0, stats?.profit_yesterday ?? 0),
      danger: (stats?.profit_today ?? 0) < 0 || (stats?.profit_today ?? 0) < (stats?.profit_yesterday ?? 0)
    },
    {
      label: t.paymentsToday,
      value: money(stats?.credit_payments_today ?? 0),
      icon: HandCoins,
      trend: trendLabel(stats?.credit_payments_today ?? 0, stats?.credit_payments_yesterday ?? 0),
      danger: false
    },
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
                  <small>{card.label === t.totalToCollect || card.label === t.lowStock ? t.alerts : t.vsYesterday}</small>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}

function trendLabel(current: number, previous: number) {
  if (previous === 0) return current === 0 ? "0" : "جديد";
  const diff = current - previous;
  const percent = Math.round((diff / Math.abs(previous)) * 100);
  return `${diff >= 0 ? "+" : ""}${percent}%`;
}
