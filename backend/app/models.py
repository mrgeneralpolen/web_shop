"""SQLAlchemy-модели.

Таблицы модуля авторизации — 11 таблиц, один в один по словарю данных
отчёта (таблицы 2.3–2.13): users, roles, user_roles, permissions,
role_permissions, sessions, refresh_tokens, password_resets,
login_attempts, audit_log, oauth_accounts.

Плюс таблицы магазина: products, cart_items, orders, order_items.

Типы — SQLite-совместимые эквиваленты типов словаря:
UUID → String(36), INET → String(45), JSONB → JSON,
TIMESTAMP → DateTime. Первичные ключи BIGINT (users.user_id,
login_attempts.attempt_id, audit_log.log_id) — Integer: только
INTEGER PRIMARY KEY даёт автоинкремент в SQLite. Та же схема для
PostgreSQL 16 — в ``db/schema_postgres.sql`` (там UUID, INET, JSONB
и BIGINT — нативные типы).
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

try:
    from app.database import Base, utcnow
except ModuleNotFoundError as _exc:
    if _exc.name != "app":
        raise
    from database import Base, utcnow


def _uuid():
    return str(uuid.uuid4())




# ---------------------------------------------------------------------
# Модуль авторизации — словарь данных отчёта, таблицы 2.3–2.13
# ---------------------------------------------------------------------
class User(Base):
    """Таблица 2.3 — users."""

    __tablename__ = "users"
    __table_args__ = (CheckConstraint("failed_login_attempts >= 0",
                                      name="ck_users_failed_attempts"),)

    user_id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False)
    # Соль и хеш — одной строкой "salt_hex$hash_hex" (как у Argon2id:
    # закодированный хеш самодостаточен). Отдельной колонки salt нет.
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    phone = Column(String(20))
    is_active = Column(Boolean, nullable=False, default=True)
    is_blocked = Column(Boolean, nullable=False, default=False)
    failed_login_attempts = Column(Integer, nullable=False, default=0)
    blocked_until = Column(DateTime)
    two_factor_enabled = Column(Boolean, nullable=False, default=False)
    two_factor_secret = Column(String(64))
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow,
                        onupdate=utcnow)

    roles = relationship(
        "Role", secondary="user_roles",
        primaryjoin="User.user_id == UserRole.user_id",
        secondaryjoin="Role.role_id == UserRole.role_id",
        back_populates="users")
    sessions = relationship("Session", back_populates="user",
                            cascade="all, delete-orphan")
    refresh_tokens = relationship("RefreshToken", back_populates="user",
                                  cascade="all, delete-orphan")
    cart_items = relationship("CartItem", back_populates="user",
                              cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="user")


class Role(Base):
    """Таблица 2.4 — roles."""

    __tablename__ = "roles"

    role_id = Column(Integer, primary_key=True)
    role_name = Column(String(50), unique=True, nullable=False)
    description = Column(String(500))

    users = relationship(
        "User", secondary="user_roles",
        primaryjoin="Role.role_id == UserRole.role_id",
        secondaryjoin="User.user_id == UserRole.user_id",
        back_populates="roles")
    permissions = relationship("Permission", secondary="role_permissions",
                               back_populates="roles")


class UserRole(Base):
    """Таблица 2.5 — user_roles (составной PK)."""

    __tablename__ = "user_roles"

    user_id = Column(BigInteger, ForeignKey("users.user_id", ondelete="CASCADE"),
                     primary_key=True)
    role_id = Column(Integer, ForeignKey("roles.role_id", ondelete="CASCADE"),
                     primary_key=True)
    assigned_at = Column(DateTime, nullable=False, default=utcnow)
    assigned_by = Column(BigInteger, ForeignKey("users.user_id",
                                                ondelete="SET NULL"))


class Permission(Base):
    """Таблица 2.6 — permissions."""

    __tablename__ = "permissions"

    permission_id = Column(Integer, primary_key=True)
    permission_code = Column(String(100), unique=True, nullable=False)
    description = Column(String(500))

    roles = relationship("Role", secondary="role_permissions",
                         back_populates="permissions")


class RolePermission(Base):
    """Таблица 2.7 — role_permissions (составной PK)."""

    __tablename__ = "role_permissions"

    role_id = Column(Integer, ForeignKey("roles.role_id", ondelete="CASCADE"),
                     primary_key=True)
    permission_id = Column(Integer, ForeignKey("permissions.permission_id",
                                               ondelete="CASCADE"),
                           primary_key=True)


class Session(Base):
    """Таблица 2.8 — sessions.

    Токен доступа — это и есть session_id (UUID): клиенту выдаётся
    сам идентификатор сессии, хеш токена в этой таблице не хранится.
    """

    __tablename__ = "sessions"
    __table_args__ = (CheckConstraint("expires_at > created_at",
                                      name="ck_sessions_expires"),)

    session_id = Column(String(36), primary_key=True, default=_uuid)
    user_id = Column(BigInteger, ForeignKey("users.user_id", ondelete="CASCADE"),
                     nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    expires_at = Column(DateTime, nullable=False)
    ip_address = Column(String(45))
    user_agent = Column(String(500))
    is_revoked = Column(Boolean, nullable=False, default=False)

    user = relationship("User", back_populates="sessions")


class RefreshToken(Base):
    """Таблица 2.9 — refresh_tokens. Живёт 30 дней, можно отозвать."""

    __tablename__ = "refresh_tokens"

    token_id = Column(String(36), primary_key=True, default=_uuid)
    user_id = Column(BigInteger, ForeignKey("users.user_id", ondelete="CASCADE"),
                     nullable=False)
    token_hash = Column(String(255), unique=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime)
    created_at = Column(DateTime, nullable=False, default=utcnow)

    user = relationship("User", back_populates="refresh_tokens")


class PasswordReset(Base):
    """Таблица 2.10 — password_resets."""

    __tablename__ = "password_resets"
    __table_args__ = (CheckConstraint("expires_at > created_at",
                                      name="ck_resets_expires"),)

    reset_id = Column(String(36), primary_key=True, default=_uuid)
    user_id = Column(BigInteger, ForeignKey("users.user_id", ondelete="CASCADE"),
                     nullable=False)
    token_hash = Column(String(255), unique=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class LoginAttempt(Base):
    """Таблица 2.11 — login_attempts: каждая попытка входа."""

    __tablename__ = "login_attempts"

    attempt_id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), nullable=False)
    ip_address = Column(String(45), nullable=False)
    attempted_at = Column(DateTime, nullable=False, default=utcnow)
    is_successful = Column(Boolean, nullable=False)
    failure_reason = Column(String(100))


class AuditLog(Base):
    """Таблица 2.12 — audit_log: журнал событий безопасности."""

    __tablename__ = "audit_log"
    __table_args__ = (CheckConstraint("result IN ('success', 'failure')",
                                      name="ck_audit_result"),)

    log_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.user_id", ondelete="SET NULL"))
    event_type = Column(String(100), nullable=False)
    event_time = Column(DateTime, nullable=False, default=utcnow)
    ip_address = Column(String(45))
    details = Column(JSON)
    result = Column(String(20), nullable=False)


class OAuthAccount(Base):
    """Таблица 2.13 — oauth_accounts (составной PK)."""

    __tablename__ = "oauth_accounts"
    __table_args__ = (UniqueConstraint("user_id", "provider",
                                       name="uq_oauth_user_provider"),)

    provider = Column(String(50), primary_key=True)
    provider_user_id = Column(String(255), primary_key=True)
    user_id = Column(BigInteger, ForeignKey("users.user_id", ondelete="CASCADE"),
                     nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)


# ---------------------------------------------------------------------
# Магазин
# ---------------------------------------------------------------------
class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    category = Column(String(64), nullable=False)
    price = Column(Integer, nullable=False)
    old_price = Column(Integer)
    stock = Column(Integer, nullable=False, default=0)
    rating = Column(Numeric(2, 1), nullable=False, default=0)
    reviews = Column(Integer, nullable=False, default=0)
    sold = Column(Integer, nullable=False, default=0)
    image = Column(String(255))
    description = Column(String)
    specs = Column(JSON, nullable=False, default=dict)


class CartItem(Base):
    __tablename__ = "cart_items"
    __table_args__ = (UniqueConstraint("user_id", "product_id",
                                       name="uq_cart_user_product"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(BigInteger, ForeignKey("users.user_id", ondelete="CASCADE"),
                     nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    qty = Column(Integer, nullable=False, default=1)

    user = relationship("User", back_populates="cart_items")
    product = relationship("Product")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True)
    order_number = Column(Integer, unique=True, nullable=False)
    user_id = Column(BigInteger, ForeignKey("users.user_id"), nullable=False)
    name = Column(String(255), nullable=False)
    phone = Column(String(32), nullable=False)
    address = Column(String, nullable=False)
    pay_method = Column(String(32), nullable=False)
    goods = Column(Integer, nullable=False)
    delivery = Column(Integer, nullable=False, default=0)
    total = Column(Integer, nullable=False)
    status = Column(String(64), nullable=False, default="Принят в обработку")
    created_at = Column(DateTime, nullable=False, default=utcnow)

    user = relationship("User", back_populates="orders")
    items = relationship("OrderItem", back_populates="order",
                         cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"),
                      nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    name = Column(String, nullable=False)
    price = Column(Integer, nullable=False)
    qty = Column(Integer, nullable=False)

    order = relationship("Order", back_populates="items")
    product = relationship("Product")
