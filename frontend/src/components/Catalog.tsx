import { useEffect, useMemo, useState } from "react";
import { getProducts } from "../api";
import { CATEGORIES, discountPct, fmtPrice, type Product } from "../types";

export type SortKey = "popular" | "price_asc" | "price_desc" | "name";

const SORT_LABELS: Record<SortKey, string> = {
  popular: "Сначала популярные",
  price_asc: "Цена: по возрастанию",
  price_desc: "Цена: по убыванию",
  name: "По названию",
};

interface Props {
  search: string;
  category: string | null;
  onCategory: (c: string | null) => void;
  onOpenProduct: (p: Product) => void;
  onAddToCart: (p: Product) => void;
  cartQty: (productId: number) => number;
  onGoCart: () => void;
}

export function stars(rating: number): string {
  const full = Math.round(rating);
  return "★".repeat(full) + "☆".repeat(5 - full);
}

export default function Catalog({
  search,
  category,
  onCategory,
  onOpenProduct,
  onAddToCart,
  cartQty,
  onGoCart,
}: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [inStock, setInStock] = useState(false);
  const [sort, setSort] = useState<SortKey>("popular");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getProducts({
      q: search || undefined,
      category: category ?? undefined,
      min_price: minPrice ? Number(minPrice) : undefined,
      max_price: maxPrice ? Number(maxPrice) : undefined,
      in_stock: inStock || undefined,
      sort,
    })
      .then((list) => {
        if (!cancelled) setProducts(list);
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить каталог.");
      });
    return () => {
      cancelled = true;
    };
  }, [search, category, minPrice, maxPrice, inStock, sort]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of products) map[p.category] = (map[p.category] ?? 0) + 1;
    return map;
  }, [products]);

  return (
    <div className="catalog-layout">
      <aside className="filters" aria-label="Фильтры каталога">
        <h2>Категории</h2>
        <ul className="filter-cats">
          <li>
            <button
              className={category === null ? "active" : ""}
              onClick={() => onCategory(null)}
            >
              <span>Все товары</span>
              <span className="count">{products.length}</span>
            </button>
          </li>
          {CATEGORIES.map((c) => (
            <li key={c}>
              <button
                className={category === c ? "active" : ""}
                onClick={() => onCategory(c)}
              >
                <span>{c}</span>
                <span className="count">{counts[c] ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>

        <h3>Цена, ₽</h3>
        <div className="price-row">
          <input
            type="number"
            min={0}
            placeholder="от"
            aria-label="Цена от"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
          />
          <span>—</span>
          <input
            type="number"
            min={0}
            placeholder="до"
            aria-label="Цена до"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
          />
        </div>

        <h3>Наличие</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={inStock}
            onChange={(e) => setInStock(e.target.checked)}
          />
          Только в наличии
        </label>
      </aside>

      <div>
        <div className="catalog-head">
          <span>Найдено товаров: {products.length}</span>
          <label className="sort">
            Сортировка
            <select
              aria-label="Сортировка товаров"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <div className="form-error">{error}</div>}

        {products.length === 0 ? (
          <div className="empty">
            По вашему запросу ничего не найдено.
            <br />
            Попробуйте изменить фильтры или поисковый запрос.
          </div>
        ) : (
          <div className="grid">
            {products.map((p) => {
              const inCart = cartQty(p.id);
              const pct = discountPct(p);
              return (
                <article className="card" key={p.id}>
                  <button
                    className="card-img"
                    style={{ border: 0, padding: 0 }}
                    onClick={() => onOpenProduct(p)}
                    aria-label={`Открыть карточку товара ${p.name}`}
                  >
                    {p.image && <img src={p.image} alt={p.name} loading="lazy" />}
                  </button>
                  <div className="card-cat">{p.category}</div>
                  <div className="card-name">{p.name}</div>
                  <div className="card-rating">
                    {stars(p.rating)}
                    <span>
                      {p.rating.toFixed(1)} · {p.reviews} отзывов
                    </span>
                  </div>
                  <div
                    className={
                      "stock" +
                      (p.stock === 0 ? " out" : p.stock <= 5 ? " low" : "")
                    }
                  >
                    {p.stock === 0 ? (
                      "Нет в наличии"
                    ) : p.stock <= 5 ? (
                      <>
                        <span className="dot" />
                        Осталось мало: {p.stock} шт.
                      </>
                    ) : (
                      <>
                        <span className="dot" />В наличии: {p.stock} шт.
                      </>
                    )}
                  </div>
                  <div className="price-row2">
                    <span className="price">{fmtPrice(p.price)}</span>
                    {p.old_price && (
                      <span className="old-price">{fmtPrice(p.old_price)}</span>
                    )}
                    {pct !== null && <span className="discount">−{pct}%</span>}
                  </div>
                  {p.stock === 0 ? (
                    <button className="btn block" disabled>
                      Нет в наличии
                    </button>
                  ) : inCart > 0 ? (
                    <button className="btn ghost block" onClick={onGoCart}>
                      В корзине: {inCart}
                    </button>
                  ) : (
                    <button className="btn block" onClick={() => onAddToCart(p)}>
                      В корзину
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
