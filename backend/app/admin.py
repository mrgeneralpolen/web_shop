"""Панель управления данными (SQLAdmin) — /admin.

Настоящая Python-библиотека sqladmin поверх SQLAlchemy: просмотр,
редактирование, создание и удаление строк во всех таблицах базы.
Вход — только для пользователей с ролью admin
(учётная запись администратора: admin@onlain-treid.ru).
Пароли через эту панель не меняются: колонка password_hash
в формах скрыта, пароль меняется в личном кабинете.
"""

import os

from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend

try:
    from app import auth, models
    from app.database import SessionLocal, engine
except ModuleNotFoundError as _exc:
    if _exc.name != "app":
        raise
    import auth  # noqa: F401
    import models  # noqa: F401
    from database import SessionLocal, engine

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")


class AdminAuth(AuthenticationBackend):
    """Вход в /admin по email и паролю из таблицы users (роль admin)."""

    async def login(self, request):
        form = await request.form()
        email = (form.get("username") or "").strip().lower()
        password = form.get("password") or ""
        db = SessionLocal()
        try:
            user = db.query(models.User).filter_by(email=email).first()
            if (user is None
                    or not auth.verify_password(password,
                                                user.password_hash)
                    or not user.is_active
                    or "admin" not in [r.role_name for r in user.roles]):
                return False
        finally:
            db.close()
        request.session.update({"admin_user_id": user.user_id})
        return True

    async def logout(self, request):
        request.session.clear()
        return True

    async def authenticate(self, request):
        user_id = request.session.get("admin_user_id")
        if not user_id:
            return False
        db = SessionLocal()
        try:
            user = db.query(models.User).filter_by(user_id=user_id).first()
            return bool(user and user.is_active and "admin" in
                        [r.role_name for r in user.roles])
        finally:
            db.close()


def _view(model, name, name_plural, *, column_list=None,
          form_columns=None, searchable=None, can_create=True,
          can_edit=True, can_delete=True):
    """Фабрика ModelView с русскими именами."""
    attrs = {
        "model": model,
        "name": name,
        "name_plural": name_plural,
        "can_create": can_create,
        "can_edit": can_edit,
        "can_delete": can_delete,
    }
    if column_list is not None:
        attrs["column_list"] = column_list
    if form_columns is not None:
        attrs["form_columns"] = form_columns
    if searchable is not None:
        attrs["column_searchable_list"] = searchable
    # model — обязательно как kwarg: метакласс ModelViewMeta берёт
    # модель именно из kwargs, а не из атрибутов класса.
    return type(f"{model.__name__}Admin", (ModelView,), attrs, model=model)


VIEWS = [
    _view(models.User, "Пользователь", "Пользователи",
          column_list=["user_id", "email", "full_name", "phone",
                       "is_active", "is_blocked", "failed_login_attempts",
                       "blocked_until", "two_factor_enabled", "created_at"],
          form_columns=["email", "full_name", "phone", "is_active",
                        "is_blocked", "two_factor_enabled"],
          searchable=["email", "full_name"],
          can_create=False),
    _view(models.Role, "Роль", "Роли",
          column_list=["role_id", "role_name", "description"],
          searchable=["role_name"]),
    _view(models.UserRole, "Роль пользователя", "Роли пользователей"),
    _view(models.Permission, "Право", "Права",
          column_list=["permission_id", "permission_code", "description"],
          searchable=["permission_code"]),
    _view(models.RolePermission, "Право роли", "Права ролей"),
    _view(models.Session, "Сессия", "Сессии",
          form_columns=["user_id", "expires_at", "is_revoked"],
          can_create=False),
    _view(models.RefreshToken, "Токен обновления", "Токены обновления",
          form_columns=["user_id", "expires_at", "revoked_at"],
          can_create=False),
    _view(models.PasswordReset, "Сброс пароля", "Сбросы пароля",
          form_columns=["user_id", "expires_at", "used_at"],
          can_create=False),
    _view(models.LoginAttempt, "Попытка входа", "Попытки входа",
          can_create=False, can_edit=False),
    _view(models.AuditLog, "Запись аудита", "Журнал аудита",
          can_create=False, can_edit=False),
    _view(models.OAuthAccount, "OAuth-аккаунт", "OAuth-аккаунты",
          can_create=False),
    _view(models.Product, "Товар", "Товары",
          column_list=["id", "name", "category", "price", "old_price",
                       "stock", "rating", "reviews", "sold"],
          form_columns=["name", "category", "price", "old_price", "stock",
                        "rating", "reviews", "sold", "image", "description",
                        "specs"],
          searchable=["name"]),
    _view(models.CartItem, "Позиция корзины", "Корзина",
          can_create=False),
    _view(models.Order, "Заказ", "Заказы",
          column_list=["id", "order_number", "user_id", "name", "phone",
                       "goods", "delivery", "total", "status", "created_at"],
          form_columns=["status"],
          searchable=["name", "phone"],
          can_create=False),
    _view(models.OrderItem, "Позиция заказа", "Позиции заказов",
          can_create=False),
]


def setup_admin(app):
    """Подключить /admin к FastAPI-приложению."""
    admin = Admin(app, engine,
                  authentication_backend=AdminAuth(secret_key=SECRET_KEY))
    for view in VIEWS:
        admin.add_view(view)
    return admin
