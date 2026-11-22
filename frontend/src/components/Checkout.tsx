import { useState } from "react";
import { createOrder } from "../api";
import {
  fmtPrice,
  PAY_METHOD_LABELS,
  type Cart,
  type Order,
  type PayMethod,
} from "../types";

interface Props {
  cart: Cart;
  userName: string;
  onBackToCart: () => void;
  onOrderCreated: (order: Order) => void;
}

export default function Checkout({
  cart,
  userName,
  onBackToCart,
  onOrderCreated,
}: Props) {
  const [name, setName] = useState(userName);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [payMethod, setPayMethod] = useState<PayMethod>("card_online");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = "Имя должно содержать не менее 2 символов.";
    if (phone.replace(/\D/g, "").length < 10)
      errs.phone = "Укажите корректный номер телефона (не короче 10 цифр).";
    if (address.trim().length < 5) errs.address = "Укажите адрес доставки.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      setSubmitError("Проверьте выделенные поля формы оформления заказа.");
      return;
    }
    setBusy(true);
    setSubmitError("");
    try {
      const order = await createOrder({ name, phone, address, pay_method: payMethod });
      onOrderCreated(order);
    } catch (err) {
      setSubmitError((err as { detail?: string }).detail ?? "Не удалось оформить заказ.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="checkout-layout">
      <form onSubmit={submit} noValidate>
        <div className="panel">
          <h2>Получатель</h2>
          <div className="field">
            <label htmlFor="coName">Имя получателя</label>
            <input
              id="coName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
            {errors.name && <div className="err">Укажите имя получателя.</div>}
          </div>
          <div className="field">
            <label htmlFor="coPhone">Телефон</label>
            <input
              id="coPhone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 999 123-45-67"
              autoComplete="tel"
            />
            {errors.phone && <div className="err">{errors.phone}</div>}
          </div>
        </div>

        <div className="panel">
          <h2>Адрес доставки</h2>
          <div className="field">
            <label htmlFor="coAddress">Город, улица, дом, квартира</label>
            <textarea
              id="coAddress"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Например: г. Тюмень, ул. Ленина, д. 10, кв. 25"
            />
            {errors.address && <div className="err">Укажите адрес доставки.</div>}
          </div>
        </div>

        <div className="panel">
          <h2>Способ оплаты</h2>
          <div className="pay-options">
            {(Object.keys(PAY_METHOD_LABELS) as PayMethod[]).map((m) => (
              <label key={m}>
                <input
                  type="radio"
                  name="pay"
                  checked={payMethod === m}
                  onChange={() => setPayMethod(m)}
                />
                <span>
                  {PAY_METHOD_LABELS[m]}
                  {m === "card_online" && (
                    <small>Оплата сразу после подтверждения заказа</small>
                  )}
                  {m === "card_on_delivery" && (
                    <small>Оплата курьеру банковской картой</small>
                  )}
                  {m === "cash" && <small>Оплата курьеру наличными</small>}
                </span>
              </label>
            ))}
          </div>
        </div>

        {submitError && <div className="form-error">{submitError}</div>}
        <button className="btn block" type="submit" disabled={busy}>
          Подтвердить заказ
        </button>
      </form>

      <aside className="summary" aria-label="Ваш заказ">
        <h2>Ваш заказ</h2>
        <div className="row">
          <span>Товары</span>
          <span>{fmtPrice(cart.goods)}</span>
        </div>
        <div className="row">
          <span>Доставка</span>
          <span>
            {cart.delivery === 0 ? (
              <span className="free">Бесплатно</span>
            ) : (
              fmtPrice(cart.delivery)
            )}
          </span>
        </div>
        <div className="row total">
          <span>К оплате</span>
          <span>{fmtPrice(cart.total)}</span>
        </div>
        <button className="btn ghost block" style={{ marginTop: 14 }} onClick={onBackToCart}>
          Корзина
        </button>
      </aside>
    </div>
  );
}
