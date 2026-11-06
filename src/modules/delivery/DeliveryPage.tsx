import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, PackageCheck, RotateCcw, Truck } from "lucide-react";
import { api } from "../../shared/api";
import { money } from "../../shared/format";
import { showErrorToast, showToast } from "../../shared/toast";
import { Language, Sale } from "../../shared/types";
import { localized } from "../../shared/i18n";

function deliveryStatusLabel(status: Sale["credit_status"], language: Language) {
  if (status === "delivery_paid") return localized(language, "تم التحصيل", "Encaissé");
  if (status === "delivery_returned") return localized(language, "راجع للمخزون", "Retourné au stock");
  return localized(language, "في انتظار التوصيل", "En attente de livraison");
}

function deliveryStatusClass(status: Sale["credit_status"]) {
  if (status === "delivery_paid") return "ok";
  if (status === "delivery_returned") return "warning";
  return "pending";
}

export function DeliveryPage({ language, onChanged }: { language: Language; onChanged: () => void }) {
  const [deliveries, setDeliveries] = useState<Sale[]>([]);
  const load = () => api.deliveries().then(setDeliveries);

  useEffect(() => {
    load().catch((err) => showErrorToast(err, localized(language, "تعذر تحميل طلبات التوصيل", "Impossible de charger les livraisons")));
  }, [language]);

  const stats = useMemo(() => {
    const pending = deliveries.filter((sale) => sale.credit_status === "delivery_pending");
    const collected = deliveries.filter((sale) => sale.credit_status === "delivery_paid");
    const returned = deliveries.filter((sale) => sale.credit_status === "delivery_returned");
    return {
      pendingCount: pending.length,
      pendingTotal: pending.reduce((sum, sale) => sum + sale.total, 0),
      collectedTotal: collected.reduce((sum, sale) => sum + sale.total, 0),
      returnedCount: returned.length
    };
  }, [deliveries]);

  async function collect(id: number) {
    try {
      await api.collectDelivery(id);
      await load();
      onChanged();
      showToast(localized(language, "تم تحصيل مبلغ التوصيل", "Livraison encaissée"), "success");
    } catch (err) {
      showErrorToast(err, localized(language, "تعذر تحصيل طلب التوصيل", "Impossible d’encaisser la livraison"));
    }
  }

  async function returnToStock(id: number) {
    if (!window.confirm(localized(language, "هل تريد إرجاع هذه الطلبية إلى المخزون؟", "Voulez-vous retourner cette commande au stock ?"))) return;
    try {
      await api.returnDelivery(id);
      await load();
      onChanged();
      showToast(localized(language, "تم إرجاع المنتجات إلى المخزون", "Produits retournés au stock"), "success");
    } catch (err) {
      showErrorToast(err, localized(language, "تعذر إرجاع الطلب إلى المخزون", "Impossible de retourner la commande au stock"));
    }
  }

  return (
    <section className="delivery-page">
      <section className="panel">
        <div className="section-title">
          <h2><Truck size={18} /> {localized(language, "التوصيل", "Livraison")}</h2>
          <span />
        </div>
        <div className="summary-strip delivery-summary">
          <article><span>{localized(language, "في الانتظار", "En attente")}</span><strong>{stats.pendingCount}</strong></article>
          <article><span>{localized(language, "قيمة في الطريق", "Montant en livraison")}</span><strong>{money(stats.pendingTotal)}</strong></article>
          <article><span>{localized(language, "تم تحصيله", "Encaissé")}</span><strong>{money(stats.collectedTotal)}</strong></article>
          <article><span>{localized(language, "راجع", "Retourné")}</span><strong>{stats.returnedCount}</strong></article>
        </div>
      </section>

      <section className="delivery-card-grid">
        {deliveries.map((sale) => (
          <article className={`panel delivery-card ${deliveryStatusClass(sale.credit_status)}`} key={sale.id}>
            <div className="delivery-card-head">
              <span className={`status-pill ${
                sale.credit_status === "delivery_paid"
                  ? "ok"
                  : sale.credit_status === "delivery_returned"
                    ? "danger"
                    : "pending"
              }`}>
                {deliveryStatusLabel(sale.credit_status, language)}
              </span>
              <strong>{sale.receipt_no}</strong>
            </div>
            <div className="delivery-customer">
              <b>{sale.customer_name || localized(language, "زبون التوصيل", "Client livraison")}</b>
              <span>{sale.customer_phone || localized(language, "بدون هاتف", "Sans téléphone")}</span>
              {sale.credit_note && <small>{sale.credit_note}</small>}
            </div>
            <div className="delivery-items">
              {sale.items.map((item, index) => (
                <span key={`${item.product_id}-${index}`}>
                  {item.product_name} <b>x{item.quantity}</b>
                </span>
              ))}
            </div>
            <div className="delivery-total">
              <span>{sale.created_at}</span>
              <strong>{money(sale.total)}</strong>
            </div>
            {sale.credit_status === "delivery_pending" && (
              <div className="modal-actions">
                <button className="gold-button" type="button" onClick={() => void collect(sale.id)}>
                  <CheckCircle2 size={17} /> {localized(language, "تحصيل", "Encaisser")}
                </button>
                <button className="ghost-button" type="button" onClick={() => void returnToStock(sale.id)}>
                  <RotateCcw size={17} /> {localized(language, "إرجاع", "Retourner")}
                </button>
              </div>
            )}
          </article>
        ))}
        {!deliveries.length && (
          <section className="panel empty-state delivery-empty">
            <PackageCheck size={32} />
            <p>{localized(language, "لا توجد طلبيات توصيل حاليا.", "Aucune livraison pour le moment.")}</p>
          </section>
        )}
      </section>
    </section>
  );
}
