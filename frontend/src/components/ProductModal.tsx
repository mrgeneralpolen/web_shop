import { useState } from "react";
import { discountPct, fmtPrice, type Product } from "../types";
import { stars } from "./Catalog";

interface Props {
  product: Product;
  onClose: () => void;
  onAddToCart: (p: Product, qty: number) => void;
}

export default function ProductModal({ product, onClose, onAddToCart }: Props) {
  const [qty, setQty] = useState(1);
  const pct = discountPct(product);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-label={product.name}>
        <button className="modal-close" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
        <div className="modal-grid">
          <div className="modal-img">
            {product.image && <img src={product.image} alt={product.name} />}
          </div>
          <div>
            <div className="card-cat">{product.category}</div>
            <h2>{product.name}</h2>
            <div className="card-rating">
              {stars(product.rating)}
              <span>
                Рейтинг {product.rating.toFixed(1)} ({product.reviews} отзывов)
              </span>
            </div>
            <p style={{ color: "var(--ink-2)" }}>
              Куплено: {product.sold} раз
            </p>
            <div
              className={
                "stock" +
                (product.stock === 0
                  ? " out"
                  : product.stock <= 5
                    ? " low"
                    : "")
              }
            >
              {product.stock === 0 ? (
                "Нет в наличии"
              ) : product.stock <= 5 ? (
                <>
                  <span className="dot" />
                  Осталось мало: {product.stock} шт.
                </>
              ) : (
                <>
                  <span className="dot" />В наличии: {product.stock} шт.
                </>
              )}
            </div>
            <div className="price-row2">
              <span className="price" style={{ fontSize: 26 }}>
                {fmtPrice(product.price)}
              </span>
              {product.old_price && (
                <span className="old-price">{fmtPrice(product.old_price)}</span>
              )}
              {pct !== null && <span className="discount">−{pct}%</span>}
            </div>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                marginTop: 16,
              }}
            >
              <div className="qty">
                <button
                  aria-label="Уменьшить количество"
                  onClick={() => setQty((v) => Math.max(1, v - 1))}
                >
                  −
                </button>
                <span aria-label="Количество товара">{qty}</span>
                <button
                  aria-label="Увеличить количество"
                  onClick={() => setQty((v) => Math.min(product.stock, v + 1))}
                >
                  +
                </button>
              </div>
              <button
                className="btn"
                style={{ flex: 1 }}
                disabled={product.stock === 0}
                onClick={() => {
                  onAddToCart(product, qty);
                  onClose();
                }}
              >
                {product.stock === 0 ? "Нет в наличии" : "В корзину"}
              </button>
            </div>
          </div>
        </div>

        {product.description && (
          <>
            <h2 style={{ marginTop: 24 }}>Описание</h2>
            <p className="desc">{product.description}</p>
          </>
        )}

        {product.specs && Object.keys(product.specs).length > 0 && (
          <>
            <h2>Характеристики</h2>
            <table className="specs">
              <tbody>
                {Object.entries(product.specs).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
