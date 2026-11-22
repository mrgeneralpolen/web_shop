export interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  old_price: number | null;
  stock: number;
  rating: number;
  reviews: number;
  sold: number;
  image: string | null;
  description: string | null;
  specs: Record<string, string>;
}

export interface CartItem {
  product_id: number;
  name: string;
  price: number;
  image: string | null;
  qty: number;
  stock: number;
  total: number;
}

export interface Cart {
  items: CartItem[];
  goods: number;
  delivery: number;
  total: number;
}

export interface OrderItem {
  product_id: number;
  name: string;
  price: number;
  qty: number;
}

export interface Order {
  id: number;
  order_number: number;
  name: string;
  phone: string;
  address: string;
  pay_method: string;
  goods: number;
  delivery: number;
  total: number;
  status: string;
  created_at: string;
  items: OrderItem[];
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  roles: string[];
}

export interface DbColumn {
  name: string;
  type: string;
  nullable: boolean;
  primary_key: boolean;
  unique: boolean;
  default: string | number | boolean | null;
  foreign_key: { table: string; column: string } | null;
}

export interface DbTable {
  name: string;
  columns: DbColumn[];
  rows: number;
}

export interface DbSchema {
  tables: DbTable[];
}

export interface AdminOrder extends Order {
  user_email: string | null;
}

export const ORDER_STATUSES = [
  "Принят в обработку",
  "Подтверждён",
  "Отправлен",
  "Завершён",
  "Отменён",
] as const;

/** Кнопки смены статуса, доступные из текущего статуса заказа. */
export const ORDER_NEXT_STATUSES: Record<string, string[]> = {
  "Принят в обработку": ["Подтверждён", "Отменён"],
  "Подтверждён": ["Отправлен", "Отменён"],
  "Отправлен": ["Завершён"],
  "Завершён": [],
  "Отменён": [],
};

export type PayMethod = "card_online" | "card_on_delivery" | "cash";

export const PAY_METHOD_LABELS: Record<PayMethod, string> = {
  card_online: "Банковской картой онлайн",
  card_on_delivery: "Картой при получении",
  cash: "Наличными при получении",
};

export const CATEGORIES = ["Электроника", "Кухонная техника", "Бытовая техника"];

export function fmtPrice(value: number): string {
  return value.toLocaleString("ru-RU") + " ₽";
}

export function discountPct(p: Product): number | null {
  if (!p.old_price || p.old_price <= p.price) return null;
  return Math.round((1 - p.price / p.old_price) * 100);
}
