/**
 * Клиент API интернет-магазина.
 * Токены хранятся в localStorage; при 401 пробуем обновить
 * токен доступа через refresh_token и повторяем запрос один раз.
 */

import type {
  Cart,
  DbSchema,
  Order,
  PayMethod,
  Product,
  User,
} from "./types";

const ACCESS_KEY = "onlain-treid.access_token";
const REFRESH_KEY = "onlain-treid.refresh_token";
export const GUEST_CART_KEY = "onlain-treid.guest_cart";

/** Базовый URL API. В dev — пусто (Vite проксирует /api на :8000),
 *  в production — VITE_API_URL, например
 *  https://web-shop-production-3ef6c47a.up.railway.app */
const API_BASE = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? ""
).replace(/\/$/, "");

export interface ApiError {
  status: number;
  detail: string;
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function isLoggedIn(): boolean {
  return getAccessToken() !== null;
}

export function saveTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return false;
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) {
    clearTokens();
    return false;
  }
  const data = await res.json();
  saveTokens(data.access_token, data.refresh_token);
  return true;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string> | undefined) ?? {}),
  };
  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401 && retry && token) {
    if (await refreshAccessToken()) {
      return request<T>(path, options, false);
    }
  }
  if (!res.ok) {
    let detail = `Ошибка ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
      else if (Array.isArray(body?.detail) && body.detail[0]?.msg) {
        detail = body.detail[0].msg;
      }
    } catch {
      /* оставить текст по умолчанию */
    }
    throw { status: res.status, detail } as ApiError;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface ProductsQuery {
  q?: string;
  category?: string;
  min_price?: number;
  max_price?: number;
  in_stock?: boolean;
  sort?: string;
}

export async function getProducts(query: ProductsQuery = {}): Promise<Product[]> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.min_price !== undefined) params.set("min_price", String(query.min_price));
  if (query.max_price !== undefined) params.set("max_price", String(query.max_price));
  if (query.in_stock) params.set("in_stock", "true");
  if (query.sort) params.set("sort", query.sort);
  const qs = params.toString();
  return request<Product[]>(`/api/products${qs ? `?${qs}` : ""}`);
}

export async function getProduct(id: number): Promise<Product> {
  return request<Product>(`/api/products/${id}`);
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export async function register(
  name: string,
  email: string,
  password: string,
  password2: string,
): Promise<User> {
  return request<User>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password, password2 }),
  });
}

export async function login(email: string, password: string): Promise<AuthTokens> {
  const tokens = await request<AuthTokens>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  saveTokens(tokens.access_token, tokens.refresh_token);
  return tokens;
}

export async function logout(): Promise<void> {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } finally {
    clearTokens();
  }
}

export async function getMe(): Promise<User> {
  return request<User>("/api/auth/me");
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  newPassword2: string,
): Promise<{ detail: string }> {
  return request<{ detail: string }>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
      new_password2: newPassword2,
    }),
  });
}

export async function changeName(name: string): Promise<{ detail: string }> {
  return request<{ detail: string }>("/api/auth/change-name", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function getCart(): Promise<Cart> {
  return request<Cart>("/api/cart");
}

export async function addToCart(productId: number, qty = 1): Promise<Cart> {
  return request<Cart>("/api/cart", {
    method: "POST",
    body: JSON.stringify({ product_id: productId, qty }),
  });
}

export async function removeFromCart(productId: number): Promise<Cart> {
  return request<Cart>(`/api/cart/${productId}`, { method: "DELETE" });
}

export async function clearCart(): Promise<Cart> {
  return request<Cart>("/api/cart", { method: "DELETE" });
}

export interface OrderForm {
  name: string;
  phone: string;
  address: string;
  pay_method: PayMethod;
}

export async function createOrder(form: OrderForm): Promise<Order> {
  return request<Order>("/api/orders", {
    method: "POST",
    body: JSON.stringify(form),
  });
}

export async function getOrders(): Promise<Order[]> {
  return request<Order[]>("/api/orders");
}

/** Схема базы данных для встроенного просмотрщика. */
export async function getDbSchema(): Promise<DbSchema> {
  return request<DbSchema>("/api/db/schema");
}

/** Корзина гостя: хранится в localStorage до входа, потом переносится
 *  в учётную запись (см. App.tsx). */
export function loadGuestCart(): Record<number, number> {
  try {
    return JSON.parse(localStorage.getItem(GUEST_CART_KEY) ?? "{}") as Record<
      number,
      number
    >;
  } catch {
    return {};
  }
}

export function saveGuestCart(cart: Record<number, number>): void {
  localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cart));
}
