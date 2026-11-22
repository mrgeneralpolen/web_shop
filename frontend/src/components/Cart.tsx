import { fmtPrice, type Cart } from "../types";

interface Props {
  cart: Cart;
  onBackToCatalog: () => void;
  onRemove: (productId: number) => void;
  onCheckout: () => void;
  onChangeQty: (productId: number, qty: number) => void;
}

export default function CartView({
  cart,
  onBackToCatalog,
  onRemove,
  onCheckout,
  onChangeQty,
}: Props) {
  return (
    <div className="cart-layout">
      <div>
        {cart.items.length === 0 ? (
          <div className="empty">
            Корзина пуста.
            <br />
            <br />
            <button className="btn" onClick={onBackToCatalog}>
              Перейти к покупкам
            </button>
          </div>
        ) : (
          <div className="cart-list">
            {cart.items.map((item) => (
              <div className="cart-item" key={item.product_id}>
                {item.image && <img src={item.image} alt={item.name} />}
                <div className="cart-item-info">
                  <div className="cart-item-name">{item.name}</div>
                  <div className="cart-item-price">
                    {fmtPrice(item.price)} за шт. · в наличии {item.stock} шт.
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center" }}>
                    <div className="qty">
                      <button
                        aria-label="Уменьшить"
                        onClick={() => onChangeQty(item.product_id, item.qty - 1)}
                      >
                        −
                      </button>
                      <span>{item.qty}</span>
                      <button
                        aria-label="Увеличить"
                        onClick={() => onChangeQty(item.product_id, item.qty + 1)}
                      >
                        +
                      </button>
                    </div>
                    <button
                      className="link-btn"
                      onClick={() => onRemove(item.product_id)}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
                <div className="cart-item-sum">{fmtPrice(item.total)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <aside className="summary" aria-label="Итого">
        <h2>Итого</h2>
        <div className="row">
          <span>Товары ({cart.items.reduce((s, i) => s + i.qty, 0)})</span>
          <span>{fmtPrice(cart.goods)}</span>
        </div>
        <div className="row">
          <span>Доставка</span>
          <span>
            {cart.goods === 0 ? (
              "—"
            ) : cart.delivery === 0 ? (
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
        <button
          className="btn block"
          style={{ marginTop: 14 }}
          disabled={cart.items.length === 0}
          onClick={onCheckout}
        >
          Оформить заказ
        </button>
        <p className="note">
          Доставка курьером — от 1 дня. Бесплатно при заказе от 5 000 ₽, иначе
          399 ₽.
        </p>
        <p className="note">Заказ будет сохранён в истории заказов вашей учётной записи.</p>
      </aside>
    </div>
  );
}
