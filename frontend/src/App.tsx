import { useCallback, useEffect, useState } from "react";
import {
  addToCart as apiAddToCart,
  getCart,
  getMe,
  getProducts,
  isLoggedIn,
  loadGuestCart,
  logout as apiLogout,
  removeFromCart as apiRemoveFromCart,
  saveGuestCart,
} from "./api";
import AuthForms from "./components/AuthForms";
import CartView from "./components/Cart";
import Catalog from "./components/Catalog";
import Checkout from "./components/Checkout";
import DbViewer from "./components/DbViewer";
import ProductModal from "./components/ProductModal";
import Profile from "./components/Profile";
import { CATEGORIES, fmtPrice, type Cart, type Order, type Product, type User } from "./types";

type View =
  | "catalog"
  | "cart"
  | "checkout"
  | "login"
  | "register"
  | "profile"
  | "order-success"
  | "database";

const EMPTY_CART: Cart = { items: [], goods: 0, delivery: 0, total: 0 };

export default function App() {
  const [view, setView] = useState<View>("catalog");
  const [user, setUser] = useState<User | null>(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [guestCart, setGuestCart] = useState<Record<number, number>>(loadGuestCart());
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [toast, setToast] = useState("");
  const [needsAuth, setNeedsAuth] = useState(false);

  const loggedIn = user !== null;

  const refreshCart = useCallback(async () => {
    if (!isLoggedIn()) return;
    try {
      setCart(await getCart());
    } catch {
      /* корзина недоступна — покажем пустую */
    }
  }, []);

  // Восстановить сессию при загрузке
  useEffect(() => {
    if (!isLoggedIn()) return;
    getMe()
      .then((u) => {
        setUser(u);
        refreshCart();
      })
      .catch(() => setUser(null));
  }, [refreshCart]);

  // Корзина гостя — в localStorage
  useEffect(() => {
    saveGuestCart(guestCart);
  }, [guestCart]);

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(""), 2500);
  }

  function guestCount(): number {
    return Object.values(guestCart).reduce((s, q) => s + q, 0);
  }

  function cartQty(productId: number): number {
    if (loggedIn) {
      return cart.items.find((i) => i.product_id === productId)?.qty ?? 0;
    }
    return guestCart[productId] ?? 0;
  }

  function cartCount(): number {
    if (loggedIn) return cart.items.reduce((s, i) => s + i.qty, 0);
    return guestCount();
  }

  async function handleAddToCart(product: Product, qty = 1) {
    if (loggedIn) {
      try {
        setCart(await apiAddToCart(product.id, qty));
        showToast("Товар добавлен в корзину");
      } catch (err) {
        showToast((err as { detail?: string }).detail ?? "Не удалось добавить товар.");
      }
      return;
    }
    setGuestCart((prev) => {
      const next = { ...prev };
      next[product.id] = Math.min(
        product.stock,
        (next[product.id] ?? 0) + qty,
      );
      return next;
    });
    showToast("Товар добавлен в корзину");
  }

  /** После входа корзина гостя переносится в учётную запись. */
  async function handleAuth(newUser: User) {
    let me: User = newUser;
    try {
      me = await getMe();
    } catch {
      /* оставить данные из ответа регистрации */
    }
    setUser(me);
    setNeedsAuth(false);
    const guest = loadGuestCart();
    for (const [productId, qty] of Object.entries(guest)) {
      try {
        await apiAddToCart(Number(productId), qty);
      } catch {
        /* товар мог закончиться — пропускаем */
      }
    }
    setGuestCart({});
    await refreshCart();
    setView("catalog");
  }

  async function handleLogout() {
    try {
      await apiLogout();
    } catch {
      /* всё равно выходим */
    }
    setUser(null);
    setCart(EMPTY_CART);
    setView("catalog");
    showToast("Вы вышли из системы");
  }

  async function handleChangeQty(productId: number, qty: number) {
    if (!loggedIn) {
      setGuestCart((prev) => {
        const next = { ...prev };
        if (qty <= 0) delete next[productId];
        else next[productId] = qty;
        return next;
      });
      return;
    }
    if (qty <= 0) {
      setCart(await apiRemoveFromCart(productId));
      return;
    }
    const current = cart.items.find((i) => i.product_id === productId);
    if (!current) return;
    const diff = qty - current.qty;
    if (diff > 0) {
      try {
        setCart(await apiAddToCart(productId, diff));
      } catch (err) {
        showToast((err as { detail?: string }).detail ?? "Не удалось изменить количество.");
      }
    } else if (diff < 0) {
      // Уменьшение: пересоздаём позицию через удаление и добавление
      await apiRemoveFromCart(productId);
      setCart(await apiAddToCart(productId, qty));
    }
  }

  function goCatalog() {
    setView("catalog");
  }

  function goCart() {
    if (!loggedIn) {
      // Гостю показываем его корзину из localStorage
      setView("cart");
      return;
    }
    refreshCart();
    setView("cart");
  }

  /** Корзина для экрана корзины: у гостя — из localStorage по каталогу. */
  const [guestCartView, setGuestCartView] = useState<Cart>(EMPTY_CART);

  useEffect(() => {
    if (loggedIn || view !== "cart") return;
    let cancelled = false;
    (async () => {
      const products = await getProducts({});
      const byId = new Map(products.map((p) => [p.id, p]));
      const items = Object.entries(guestCart)
        .map(([pid, qty]) => {
          const p = byId.get(Number(pid));
          if (!p) return null;
          return {
            product_id: p.id,
            name: p.name,
            price: p.price,
            image: p.image,
            qty,
            stock: p.stock,
            total: p.price * qty,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const goods = items.reduce((s, i) => s + i.total, 0);
      const delivery = goods === 0 ? 0 : goods >= 5000 ? 0 : 399;
      if (!cancelled) {
        setGuestCartView({ items, goods, delivery, total: goods + delivery });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guestCart, loggedIn, view]);

  const cartForView = loggedIn ? cart : guestCartView;

  function handleCheckoutClick() {
    if (!loggedIn) {
      setNeedsAuth(true);
      setView("login");
      return;
    }
    setView("checkout");
  }

  return (
    <div>
      <header className="header">
        <div className="header-inner">
          <button className="logo" onClick={goCatalog} aria-label="Онлайн-Трейд — на главную">
            <span className="logo-name">
              Онлайн-<b>Трейд</b>
            </span>
            <br />
            <span className="logo-sub">
              Интернет-магазин техники и товаров для дома
            </span>
          </button>

          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
              setView("catalog");
            }}
          >
            <input
              type="search"
              placeholder="Поиск по каталогу: товар, категория…"
              aria-label="Поиск по каталогу"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <button type="submit">Найти</button>
          </form>

          <div className="header-actions">
            <button
              className={`icon-btn ${view === "cart" ? "active" : ""}`}
              onClick={goCart}
              aria-label="Корзина"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="9" cy="20" r="1.6" />
                <circle cx="17" cy="20" r="1.6" />
                <path d="M3 3h2l2.4 12.4a1.5 1.5 0 0 0 1.5 1.1h7.9a1.5 1.5 0 0 0 1.5-1.2L20.5 7H6" />
              </svg>
              Корзина
              {cartCount() > 0 && <span className="cart-badge">{cartCount()}</span>}
            </button>
            {loggedIn && user ? (
              <button
                className={`icon-btn ${view === "profile" ? "active" : ""}`}
                onClick={() => setView("profile")}
                aria-label="Личный кабинет"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
                </svg>
                {user.name ?? "Кабинет"}
              </button>
            ) : (
              <button
                className={`icon-btn ${view === "login" ? "active" : ""}`}
                onClick={() => setView("login")}
                aria-label="Личный кабинет"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
                </svg>
                Войти
              </button>
            )}
          </div>
        </div>

        <nav className="catnav" aria-label="Категории товаров">
          <div className="catnav-inner">
            <button
              className={category === null ? "active" : ""}
              onClick={() => {
                setCategory(null);
                setView("catalog");
              }}
            >
              Все товары
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                className={category === c ? "active" : ""}
                onClick={() => {
                  setCategory(c);
                  setView("catalog");
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </nav>
      </header>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--ink)",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 8,
            zIndex: 100,
            boxShadow: "var(--shadow)",
          }}
        >
          {toast}
        </div>
      )}

      <main className="page">
        <div className="container">
          {view === "catalog" && (
            <>
              <h1>Каталог товаров</h1>
              <Catalog
                search={search}
                category={category}
                onCategory={setCategory}
                onOpenProduct={setModalProduct}
                onAddToCart={(p) => handleAddToCart(p, 1)}
                cartQty={cartQty}
                onGoCart={goCart}
              />
            </>
          )}

          {view === "cart" && (
            <>
              <h1>Корзина</h1>
              {!loggedIn && (
                <div className="form-error" style={{ marginBottom: 14 }}>
                  Вы не вошли в систему. Корзина гостя будет перенесена в вашу
                  учётную запись после входа.
                </div>
              )}
              <CartView
                cart={cartForView}
                onBackToCatalog={goCatalog}
                onRemove={async (pid) => {
                  if (loggedIn) {
                    setCart(await apiRemoveFromCart(pid));
                  } else {
                    await handleChangeQty(pid, 0);
                  }
                }}
                onCheckout={handleCheckoutClick}
                onChangeQty={handleChangeQty}
              />
            </>
          )}

          {view === "checkout" && loggedIn && (
            <>
              <div className="breadcrumbs">
                <button onClick={goCart}>Корзина</button> <span>/</span>{" "}
                <span>Оформление заказа</span>
              </div>
              <h1>Оформление заказа</h1>
              <Checkout
                cart={cart}
                userName={user?.name ?? ""}
                onBackToCart={goCart}
                onOrderCreated={(order) => {
                  setLastOrder(order);
                  setCart(EMPTY_CART);
                  setView("order-success");
                }}
              />
            </>
          )}

          {(view === "login" || view === "register") && (
            <>
              {needsAuth && (
                <div className="form-error" style={{ maxWidth: 520, margin: "0 auto 14px" }}>
                  Войдите в систему или зарегистрируйтесь, чтобы оформить заказ.
                </div>
              )}
              <AuthForms
                mode={view}
                onMode={setView}
                onAuth={handleAuth}
                onCancel={goCatalog}
              />
            </>
          )}

          {view === "profile" && user && (
            <>
              <h1>Личный кабинет</h1>
              <Profile
                user={user}
                onUserChange={setUser}
                onLogout={handleLogout}
                onGoCatalog={goCatalog}
              />
            </>
          )}

          {view === "order-success" && lastOrder && (
            <div className="success-card">
              <h1>Заказ № {lastOrder.order_number} оформлен</h1>
              <p>
                Спасибо за покупку, {lastOrder.name}! Заказ на сумму{" "}
                {fmtPrice(lastOrder.total)} будет доставлен по адресу:{" "}
                {lastOrder.address}. Способ оплаты:{" "}
                {lastOrder.pay_method === "card_online"
                  ? "банковской картой онлайн"
                  : lastOrder.pay_method === "card_on_delivery"
                    ? "картой при получении"
                    : "наличными при получении"}
                .
              </p>
              <p style={{ color: "var(--ink-2)" }}>
                Информация о заказе доступна в личном кабинете.
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                <button className="btn" onClick={() => setView("profile")}>
                  Мои заказы
                </button>
                <button className="btn ghost" onClick={goCatalog}>
                  Продолжить покупки
                </button>
              </div>
            </div>
          )}
          {view === "database" && <DbViewer onBack={goCatalog} />}
        </div>
      </main>

      {modalProduct && (
        <ProductModal
          product={modalProduct}
          onClose={() => setModalProduct(null)}
          onAddToCart={(p, qty) => handleAddToCart(p, qty)}
        />
      )}

      <footer className="footer">
        <div className="footer-inner footer-slim">
          <div>
            <h3>Онлайн-Трейд</h3>
            <p>Интернет-магазин электроники и товаров для дома.</p>
          </div>
          <div>
            <button
              className="footer-link"
              onClick={() => setView("database")}
            >
              Схема базы данных
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
