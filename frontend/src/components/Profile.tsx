import { useEffect, useState } from "react";
import { changeName, changePassword, getOrders, logout } from "../api";
import { fmtPrice, PAY_METHOD_LABELS, type Order, type PayMethod, type User } from "../types";

interface Props {
  user: User;
  onUserChange: (user: User) => void;
  onLogout: () => void;
  onGoCatalog: () => void;
}

export default function Profile({ user, onUserChange, onLogout, onGoCatalog }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [name, setName] = useState(user.name ?? "");
  const [nameMsg, setNameMsg] = useState("");
  const [nameErr, setNameErr] = useState("");
  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [passMsg, setPassMsg] = useState("");
  const [passErr, setPassErr] = useState("");

  useEffect(() => {
    getOrders().then(setOrders).catch(() => setOrders([]));
  }, []);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setNameMsg("");
    setNameErr("");
    if (name.trim().length < 2) {
      setNameErr("Укажите имя (не короче 2 символов).");
      return;
    }
    try {
      const res = await changeName(name.trim());
      setNameMsg(res.detail);
      onUserChange({ ...user, name: name.trim() });
    } catch (err) {
      setNameErr((err as { detail?: string }).detail ?? "Не удалось сохранить.");
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPassMsg("");
    setPassErr("");
    if (newPass.length < 6) {
      setPassErr("Пароль должен содержать не менее 6 символов.");
      return;
    }
    if (newPass !== newPass2) {
      setPassErr("Пароли не совпадают.");
      return;
    }
    try {
      const res = await changePassword(curPass, newPass, newPass2);
      setPassMsg(res.detail);
      setCurPass("");
      setNewPass("");
      setNewPass2("");
    } catch (err) {
      setPassErr((err as { detail?: string }).detail ?? "Не удалось сменить пароль.");
    }
  }

  async function doLogout() {
    await logout();
    onLogout();
  }

  return (
    <div>
      <p style={{ color: "var(--ink-2)" }}>
        Здравствуйте, <b>{user.name ?? user.email}</b> · {user.email}
      </p>
      <div className="profile-grid">
        <div>
          <div className="panel">
            <h2>Личные данные</h2>
            <form onSubmit={saveName} noValidate>
              {nameMsg && <div className="form-ok">{nameMsg}</div>}
              <div className="field">
                <label htmlFor="profileName">Имя</label>
                <input
                  id="profileName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {nameErr && <div className="err">{nameErr}</div>}
              </div>
              <div className="field">
                <label>Адрес электронной почты</label>
                <input value={user.email} disabled />
                <div className="hint">
                  Адрес электронной почты используется как логин и не изменяется.
                </div>
              </div>
              <button className="btn" type="submit">
                Сохранить изменения
              </button>
            </form>
          </div>

          <div className="panel">
            <h2>Смена пароля</h2>
            <form onSubmit={savePassword} noValidate>
              {passMsg && <div className="form-ok">{passMsg}</div>}
              {passErr && <div className="form-error">{passErr}</div>}
              <div className="field">
                <label htmlFor="curPass">Текущий пароль</label>
                <input
                  id="curPass"
                  type="password"
                  value={curPass}
                  onChange={(e) => setCurPass(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="field">
                <label htmlFor="newPass">Новый пароль</label>
                <input
                  id="newPass"
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="field">
                <label htmlFor="newPass2">Повторите новый пароль</label>
                <input
                  id="newPass2"
                  type="password"
                  value={newPass2}
                  onChange={(e) => setNewPass2(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <button className="btn" type="submit">
                Сменить пароль
              </button>
            </form>
          </div>

          <button className="btn danger-ghost block" onClick={doLogout}>
            Выйти из системы
          </button>
        </div>

        <div>
          <div className="panel">
            <h2>История заказов</h2>
            {orders.length === 0 ? (
              <div>
                У вас пока нет заказов.
                <br />
                <br />
                <button className="btn" onClick={onGoCatalog}>
                  Перейти к покупкам
                </button>
              </div>
            ) : (
              orders.map((o) => (
                <div className="order-card" key={o.id}>
                  <div className="head">
                    <b>Заказ № {o.order_number}</b>
                    <span>
                      {new Date(o.created_at).toLocaleString("ru-RU", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="status">{o.status}</span>
                  </div>
                  <div className="items">
                    {o.items.map((i) => (
                      <div key={i.product_id}>
                        {i.name} × {i.qty} — {fmtPrice(i.price)}
                      </div>
                    ))}
                  </div>
                  <div className="total">
                    <span>
                      Итого (с доставкой{" "}
                      {o.delivery === 0 ? "бесплатно" : fmtPrice(o.delivery)})
                    </span>
                    <span>{fmtPrice(o.total)}</span>
                  </div>
                  <div className="items" style={{ marginTop: 6 }}>
                    Доставка: {o.address} · Оплата:{" "}
                    {PAY_METHOD_LABELS[o.pay_method as PayMethod] ?? o.pay_method}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
