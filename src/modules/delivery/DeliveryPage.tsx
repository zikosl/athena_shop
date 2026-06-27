import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, PackageCheck, RotateCcw, Truck } from "lucide-react";
import { api } from "../../shared/api";
import { money } from "../../shared/format";
import { showErrorToast, showToast } from "../../shared/toast";
import { Language, Sale } from "../../shared/types";

function deliveryStatusLabel(status: Sale["credit_status"]) {
  if (status === "delivery_paid") return "تم التحصيل";
  if (status === "delivery_returned") return "راجع للمخزون";
  return "في انتظار التوصيل";
}

function deliveryStatusClass(status: Sale["credit_status"]) {
  if (status === "delivery_paid") return "ok";
  if (status === "delivery_returned") return "warning";
  return "pending";
}

export function DeliveryPage({ language: _language, onChanged }: { language: Language; onChanged: () => void }) {
  const [deliveries, setDeliveries] = useState<Sale[]>([]);
  const load = () => api.deliveries().then(setDeliveries);

  useEffect(() => {
    load().catch((err) => showErrorToast(err, "تعذر تحميل طلبات التوصيل"));
  }, []);

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
      showToast("تم تحصيل مبلغ التوصيل", "success");
    } catch (err) {
      showErrorToast(err, "تعذر تحصيل طلب التوصيل");
    }
  }

  async function returnToStock(id: number) {
    if (!window.confirm("هل تريد إرجاع هذه الطلبية إلى المخزون؟")) return;
    try {
      await api.returnDelivery(id);
      await load();
      onChanged();
      showToast("تم إرجاع المنتجات إلى المخزون", "success");
    } catch (err) {
      showErrorToast(err, "تعذر إرجاع الطلب إلى المخزون");
    }
  }

  return (
    <section className="delivery-page">
      <section className="panel">
        <div className="section-title">
          <h2><Truck size={18} /> التوصيل</h2>
          <span />
        </div>
        <div className="summary-strip delivery-summary">
          <article><span>في الانتظار</span><strong>{stats.pendingCount}</strong></article>
          <article><span>قيمة في الطريق</span><strong>{money(stats.pendingTotal)}</strong></article>
          <article><span>تم تحصيله</span><strong>{money(stats.collectedTotal)}</strong></article>
          <article><span>راجع</span><strong>{stats.returnedCount}</strong></article>
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
                {deliveryStatusLabel(sale.credit_status)}
              </span>
              <strong>{sale.receipt_no}</strong>
            </div>
            <div className="delivery-customer">
              <b>{sale.customer_name || "زبون التوصيل"}</b>
              <span>{sale.customer_phone || "بدون هاتف"}</span>
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
                  <CheckCircle2 size={17} /> تحصيل
                </button>
                <button className="ghost-button" type="button" onClick={() => void returnToStock(sale.id)}>
                  <RotateCcw size={17} /> إرجاع
                </button>
              </div>
            )}
          </article>
        ))}
        {!deliveries.length && (
          <section className="panel empty-state delivery-empty">
            <PackageCheck size={32} />
            <p>لا توجد طلبيات توصيل حاليا.</p>
          </section>
        )}
      </section>
    </section>
  );
}
