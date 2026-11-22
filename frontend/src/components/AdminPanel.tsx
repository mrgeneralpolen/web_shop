import { useEffect, useState } from "react";
import { getAdminOrders, setOrderStatus } from "../api";
import {
  ORDER_NEXT_STATUSES,
  ORDER_STATUSES,
  fmtPrice,
  type AdminOrder,
} from "../types";

interface Props {
  onBack: () => void;
  onGoDb: () => void;
}

const STATUS_CLASS: Record<string, string> = {
  "Принят в обработку": "status-new",
  "Подтверждён": "status-confirmed",
  "Отправлен": "status-shipped",
  "Завершён": "status-done",
  "Отменён": "status-cancelled",
};

function fmtDate(value: string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminPanel({ onBack, onGoDb }: Props) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [filter, setFilter] = useState<string>("Все");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    getAdminOrders()
      .then(setOrders)
      .catch(() => setError("Не удалось загрузить заказы."));
  }, []);

  async function changeStatus(order: AdminOrder, status: string) {
    setBusyId(order.id);
    setError("");
    try {
      const updated = await setOrderStatus(order.id, status);
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? updated : o)),
      );
    } catch (err) {
      setError(
        (err as { detail?: string }).detail ?? "Не удалось сменить статус.",
      );
    } finally {
      setBusyId(null);
    }
  }

  const visible =
    filter === "Все" ? orders : orders.filter((o) => o.status === filter);

  return (
    <div className="admin-panel">
      <div className="breadcrumbs">
        <button onClick={onBack}>Каталог</button> <span>/</span>{" "}
        <span>Админка</span>
      </div>
      <h1>Админка — заказы</h1>

      <div className="admin-links">
        <button className="btn ghost" onClick={onGoDb}>
          Схема базы данных
        </button>
        <a
          className="btn ghost"
          href="/admin"
          target="_blank"
          rel="noreferrer"
        >
          Управление данными
        </a>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="db-tabs">
        <button
          className={filter === "Все" ? "active" : ""}
          onClick={() => setFilter("Все")}
        >
          Все ({orders.length})
        </button>
        {ORDER_STATUSES.map((s) => (
          <button
            key={s}
            className={filter === s ? "active" : ""}
            onClick={() => setFilter(s)}
          >
            {s} ({orders.filter((o) => o.status === s).length})
          </button>
        ))}
      </div>

      {visible.length === 0 && <p>Заказов с таким статусом нет.</p>}

      {visible.map((order) => (
        <div key={order.id} className="admin-order">
          <div className="admin-order-head">
            <strong>Заказ № {order.order_number}</strong>
            <span className="admin-order-date">{fmtDate(order.created_at)}</span>
            <span className={`status-pill ${STATUS_CLASS[order.status] ?? ""}`}>
              {order.status}
            </span>
          </div>
          <p>
            {order.name}
            {order.user_email ? ` (${order.user_email})` : ""} · {order.phone}
          </p>
          <p className="admin-order-addr">{order.address}</p>
          <ul className="admin-order-items">
            {order.items.map((item) => (
              <li key={item.product_id}>
                {item.name} — {item.qty} шт. × {fmtPrice(item.price)}
              </li>
            ))}
          </ul>
          <p>
            Товары: {fmtPrice(order.goods)} · Доставка:{" "}
            {order.delivery === 0 ? "бесплатно" : fmtPrice(order.delivery)} ·{" "}
            <strong>Итого: {fmtPrice(order.total)}</strong>
          </p>
          <div className="admin-order-actions">
            {ORDER_NEXT_STATUSES[order.status]?.map((next) => (
              <button
                key={next}
                className="btn"
                disabled={busyId === order.id}
                onClick={() => changeStatus(order, next)}
              >
                {next === "Подтверждён"
                  ? "Принять"
                  : next === "Отправлен"
                    ? "Отправить"
                    : next === "Завершён"
                      ? "Завершить"
                      : "Отменить"}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
