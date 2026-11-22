-- =====================================================================
-- Интернет-магазин «Онлайн-Трейд» — схема базы данных для PostgreSQL 16
-- Модуль авторизации: 11 таблиц, один в один по словарю данных отчёта
-- (таблицы 2.3–2.13), плюс таблицы магазина: products, cart_items,
-- orders, order_items.
-- Применение:  psql -d shop -f db/schema_postgres.sql
-- Демо-аккаунт: demo@onlain-treid.ru / Demo1234
-- (в таблице users — только хеш пароля, см. INSERT ниже).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- Таблица 2.4 — roles
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    role_id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    role_name   VARCHAR(50)  NOT NULL UNIQUE,
    description VARCHAR(500)
);

-- ---------------------------------------------------------------------
-- Таблица 2.6 — permissions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
    permission_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    permission_code VARCHAR(100) NOT NULL UNIQUE,
    description     VARCHAR(500)
);

-- ---------------------------------------------------------------------
-- Таблица 2.3 — users
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    user_id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email                 VARCHAR(255) NOT NULL UNIQUE,
    password_hash         VARCHAR(255) NOT NULL,
    full_name             VARCHAR(255) NOT NULL,
    phone                 VARCHAR(20),
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    is_blocked            BOOLEAN NOT NULL DEFAULT FALSE,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0
                          CHECK (failed_login_attempts >= 0),
    blocked_until         TIMESTAMP,
    two_factor_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    two_factor_secret     VARCHAR(64),
    created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Таблица 2.5 — user_roles
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
    user_id     BIGINT    NOT NULL REFERENCES users (user_id)
                          ON DELETE CASCADE,
    role_id     INTEGER   NOT NULL REFERENCES roles (role_id)
                          ON DELETE CASCADE,
    assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    assigned_by BIGINT REFERENCES users (user_id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, role_id)
);

-- ---------------------------------------------------------------------
-- Таблица 2.7 — role_permissions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       INTEGER NOT NULL REFERENCES roles (role_id)
                            ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions (permission_id)
                            ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- ---------------------------------------------------------------------
-- Таблица 2.8 — sessions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    BIGINT    NOT NULL REFERENCES users (user_id)
                         ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    ip_address INET,
    user_agent VARCHAR(500),
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    CHECK (expires_at > created_at)
);

-- ---------------------------------------------------------------------
-- Таблица 2.9 — refresh_tokens
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    BIGINT       NOT NULL REFERENCES users (user_id)
                            ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP    NOT NULL,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Таблица 2.10 — password_resets
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
    reset_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    BIGINT       NOT NULL REFERENCES users (user_id)
                            ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP    NOT NULL,
    used_at    TIMESTAMP,
    created_at TIMESTAMP    NOT NULL DEFAULT NOW(),
    CHECK (expires_at > created_at)
);

-- ---------------------------------------------------------------------
-- Таблица 2.11 — login_attempts
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_attempts (
    attempt_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         VARCHAR(255) NOT NULL,
    ip_address    INET NOT NULL,
    attempted_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    is_successful BOOLEAN NOT NULL,
    failure_reason VARCHAR(100)
);

-- ---------------------------------------------------------------------
-- Таблица 2.12 — audit_log
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    log_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT REFERENCES users (user_id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    event_time TIMESTAMP NOT NULL DEFAULT NOW(),
    ip_address INET,
    details    JSONB,
    result     VARCHAR(20) NOT NULL
               CHECK (result IN ('success', 'failure'))
);

-- ---------------------------------------------------------------------
-- Таблица 2.13 — oauth_accounts
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_accounts (
    provider         VARCHAR(50)  NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    user_id          BIGINT NOT NULL REFERENCES users (user_id)
                              ON DELETE CASCADE,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider, provider_user_id),
    UNIQUE (user_id, provider)
);

-- ---------------------------------------------------------------------
-- Магазин: товары, корзина, заказы
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY,
    name        TEXT         NOT NULL,
    category    VARCHAR(64)  NOT NULL,
    price       INTEGER      NOT NULL CHECK (price >= 0),
    old_price   INTEGER      CHECK (old_price IS NULL OR old_price >= 0),
    stock       INTEGER      NOT NULL DEFAULT 0 CHECK (stock >= 0),
    rating      NUMERIC(2, 1) NOT NULL DEFAULT 0,
    reviews     INTEGER      NOT NULL DEFAULT 0,
    sold        INTEGER      NOT NULL DEFAULT 0,
    image       VARCHAR(255),
    description TEXT,
    specs       JSONB        NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS cart_items (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT  NOT NULL REFERENCES users (user_id)
                          ON DELETE CASCADE,
    product_id  INTEGER NOT NULL REFERENCES products (id),
    qty         INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
    UNIQUE (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_number  INTEGER      NOT NULL UNIQUE,
    user_id       BIGINT       NOT NULL REFERENCES users (user_id),
    name          VARCHAR(255) NOT NULL,
    phone         VARCHAR(32)  NOT NULL,
    address       TEXT         NOT NULL,
    pay_method    VARCHAR(32)  NOT NULL,
    goods         INTEGER      NOT NULL,
    delivery      INTEGER      NOT NULL DEFAULT 0,
    total         INTEGER      NOT NULL,
    status        VARCHAR(64)  NOT NULL DEFAULT 'Принят в обработку',
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id    BIGINT  NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    product_id  INTEGER NOT NULL REFERENCES products (id),
    name        TEXT    NOT NULL,
    price       INTEGER NOT NULL,
    qty         INTEGER NOT NULL CHECK (qty > 0)
);

-- ---------------------------------------------------------------------
-- Справочные данные: роли и права (идемпотентно)
-- ---------------------------------------------------------------------
INSERT INTO roles (role_name, description) VALUES
    ('admin', 'Администратор магазина'),
    ('user',  'Покупатель')
ON CONFLICT (role_name) DO NOTHING;

INSERT INTO permissions (permission_code, description) VALUES
    ('products.read',  'Просмотр каталога товаров'),
    ('cart.manage',    'Управление своей корзиной'),
    ('orders.create',  'Оформление заказов'),
    ('orders.read',    'Просмотр своих заказов'),
    ('profile.manage', 'Управление своим профилем'),
    ('users.manage',   'Управление пользователями (администратор)'),
    ('products.manage','Управление каталогом (администратор)')
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id FROM roles r, permissions p
WHERE r.role_name = 'user'
  AND p.permission_code IN ('products.read', 'cart.manage', 'orders.create',
                            'orders.read', 'profile.manage')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id FROM roles r, permissions p
WHERE r.role_name = 'admin'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Демо-аккаунт: demo@onlain-treid.ru / Demo1234
-- Пароль хранится только как хеш: password_hash = "salt_hex$hash_hex",
-- hash = SHA-256(соль + пароль), соль — 16 случайных байт.
-- ---------------------------------------------------------------------
INSERT INTO users (email, password_hash, full_name, is_active,
                   two_factor_enabled)
VALUES (
    'demo@onlain-treid.ru',
    '508ce30f5067c661506b748246ad1d09$17e84a3b039ba056b3263ddb194e9c0b5ee75e39d9922d185cddf3d438923bc9',
    'Иван Петров',
    TRUE,
    FALSE
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.user_id, r.role_id FROM users u, roles r
WHERE u.email = 'demo@onlain-treid.ru' AND r.role_name = 'user'
ON CONFLICT DO NOTHING;
