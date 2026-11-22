# Интернет-магазин «Онлайн-Трейд»



- **Фронтенд:** React 18 + Vite + TypeScript
- **Бэкенд:** Python 3.14 + FastAPI + SQLAlchemy
- **БД:** SQLite по умолчанию (файл `backend/shop.db`, создаётся сам при запуске),
  схема для PostgreSQL 16 — в `db/schema_postgres.sql`

## Структура

```
web-shop/
├── README.md                  — этот файл
├── requirements.txt           — зависимости Python
├── .gitignore
├── db/
│   └── schema_postgres.sql    — схема БД для PostgreSQL 16 (11 таблиц модуля
│                                авторизации + таблицы магазина)
├── backend/
│   ├── app/
│   │   ├── main.py            — FastAPI-приложение, все эндпоинты /api/*
│   │   ├── models.py          — SQLAlchemy-модели: 11 таблиц авторизации
│   │   │                        один в один по словарю данных отчёта
│   │   │                        (таблицы 2.3–2.13) + товары, корзина, заказы
│   │   ├── auth.py            — хеш пароля, токены сессий, блокировка
│   │   ├── schemas.py         — Pydantic-схемы запросов/ответов
│   │   ├── seed.py            — 12 товаров, роли, демо-аккаунт
│   │   └── database.py        — подключение к БД
│   └── tests/
│       └── test_api.py        — сквозные тесты API (TestClient)
└── frontend/
    ├── package.json
    ├── vite.config.ts         — dev-сервер на 5173, proxy /api → :8000
    ├── index.html
    ├── public/images/         — фото 12 товаров
    └── src/
        ├── main.tsx
        ├── App.tsx            — шапка, навигация по экранам, подвал
        ├── api.ts             — клиент API (токены в localStorage)
        ├── types.ts
        ├── styles.css
        └── components/
            ├── Catalog.tsx    — каталог, поиск, фильтры, сортировка
            ├── ProductModal.tsx — карточка товара
            ├── Cart.tsx       — корзина
            ├── Checkout.tsx   — оформление заказа
            ├── AuthForms.tsx  — вход и регистрация
            └── Profile.tsx    — личный кабинет, история заказов
```

## Запуск локально.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r ../requirements.txt
uvicorn app.main:app --reload    # http://localhost:8000
```

При первом запуске создаются таблицы и выполняется seed:
12 товаров, роли `admin` / `user`, демо-аккаунт (см. ниже).
Документация API: http://localhost:8000/docs

Переменная окружения `DATABASE_URL` (по умолчанию `sqlite:///./shop.db`)
позволяет указать другую базу, например PostgreSQL:
`DATABASE_URL=postgresql+psycopg2://user:pass@localhost:5432/shop`
(для PostgreSQL установите `psycopg2-binary` и примените
`db/schema_postgres.sql`).


## Запуск фронтенда (локал.)

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173
npm run build   # production-сборка в dist/
```

## Демо-данные для входа

| | Покупатель | Администратор |
|---|---|---|
| Имя | `Иван Петров` | `Анна Соколова` |
| Email | `demo@onlain-treid.ru` | `admin@onlain-treid.ru` |
| Пароль | `Demo1234` | `Admin1234` |

Пароль в базе хранится только как хеш: в `users.password_hash` лежит
одна строка `salt_hex$hash_hex`, где hash = SHA-256(соль + пароль),
соль — 16 случайных байт (хеш прототипа — по §3.2 отчёта; в словаре
данных для этой колонки указан Argon2id как проектное решение).
Токен доступа — это UUID сессии (`sessions.session_id`), живёт 15 минут;
токен обновления (30 дней) хранится только как SHA-256-хеш.
5 неудачных попыток входа подряд блокируют учётную запись на 15 минут.
Доставка бесплатна при заказе от 5 000 ₽, иначе 399 ₽.
Номер первого заказа — 1001.

## Админка

В шапке сайта у администратора есть кнопка «Админка»:
все заказы магазина с фильтром по статусу и кнопками
«Принять», «Отправить», «Завершить», «Отменить»
(статусы: «Принят в обработку» → «Подтверждён» → «Отправлен» →
«Завершён», в любой момент — «Отменён»). Смена статуса пишется
в журнал аудита. API: `GET /api/admin/orders`,
`PATCH /api/admin/orders/{id}` — только роль `admin`.
