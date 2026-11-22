"""FastAPI-приложение интернет-магазина «Онлайн-Трейд».

Эндпоинты:
  POST   /api/auth/register        — регистрация
  POST   /api/auth/login           — вход (токен 15 минут + обновление 30 дней)
  POST   /api/auth/refresh         — обновление токена доступа
  POST   /api/auth/logout          — выход (отзыв сессии)
  GET    /api/auth/me              — текущий пользователь
  POST   /api/auth/change-password — смена пароля
  POST   /api/auth/change-name     — смена имени
  GET    /api/products             — каталог (поиск, фильтры, сортировка)
  GET    /api/products/{id}        — карточка товара
  GET    /api/cart                 — корзина
  POST   /api/cart                 — добавить в корзину
  DELETE /api/cart/{product_id}    — убрать товар из корзины
  DELETE /api/cart                 — очистить корзину
  POST   /api/orders               — оформить заказ
  GET    /api/orders               — история заказов
  GET    /api/admin/orders         — все заказы (только admin)
  PATCH  /api/admin/orders/{id}    — сменить статус заказа (только admin)
  GET    /api/db/schema            — схема базы данных (только admin)
  GET    /admin                    — панель управления данными (SQLAdmin)

Доставка бесплатна при сумме товаров от 5 000 ₽, иначе 399 ₽.
Номер первого заказа — 1001.
"""

import os
from contextlib import asynccontextmanager
from datetime import timedelta

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

try:
    from app import auth, models, schemas
    from app.auth import get_current_user, log_audit
    from app.database import get_db, init_db, SessionLocal, utcnow
    from app.schemas import (
        ERR_EMAIL_EXISTS,
        ERR_EMAIL_NOT_FOUND,
        ERR_WRONG_CURRENT_PASSWORD,
        ERR_WRONG_PASSWORD,
    )
    from app.seed import seed
    from app.admin import setup_admin
except ModuleNotFoundError as _exc:
    # Плоская раскладка (например, Railway/Docker: файлы пакета app
    # скопированы прямо в корень /app, пакета app нет) — импортируем
    # модули как соседние файлы. Любая другая ошибка импорта — не
    # раскладка, а настоящая проблема, её не прячем.
    if _exc.name != "app":
        raise
    import auth, models, schemas  # noqa: F401
    from auth import get_current_user, log_audit
    from database import get_db, init_db, SessionLocal, utcnow
    from schemas import (
        ERR_EMAIL_EXISTS,
        ERR_EMAIL_NOT_FOUND,
        ERR_WRONG_CURRENT_PASSWORD,
        ERR_WRONG_PASSWORD,
    )
    from seed import seed
    from admin import setup_admin

FREE_DELIVERY_FROM = 5000
DELIVERY_COST = 399
FIRST_ORDER_NUMBER = 1001


def get_current_admin(
    current_user: models.User = Depends(get_current_user),
) -> models.User:
    """Зависимость: только пользователи с ролью admin."""
    if "admin" not in [r.role_name for r in current_user.roles]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Доступно только администраторам.")
    return current_user


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Онлайн-Трейд — интернет-магазин", version="1.0.0",
              lifespan=lifespan)

# CORS: локально — Vite на 5173; на проде адрес фронта задаётся
# переменной CORS_ORIGINS (через запятую), например:
# CORS_ORIGINS=https://web-shop-xxx.up.railway.app
_CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------
# Служебное
# ---------------------------------------------------------------------
@app.get("/api/health")
def health():
    """Проверка, что сервис жив (для Railway и быстрой проверки)."""
    return {"status": "ok", "service": "onlain-treid"}


@app.get("/api/db/schema")
def db_schema(admin: models.User = Depends(get_current_admin),
              db: Session = Depends(get_db)):
    """Схема базы данных для встроенного просмотрщика (как в DBeaver):
    таблицы, столбцы с типами и связями, число строк. Строится из
    SQLAlchemy-моделей, поэтому всегда соответствует реальной базе.
    Хеши и секреты в ответ не попадают — только структура.
    Доступ — только у администраторов."""
    from sqlalchemy import func

    tables = []
    for table in models.Base.metadata.tables.values():
        if table.name == "sqlite_sequence":
            continue
        columns = []
        for column in table.columns:
            fk = next(iter(column.foreign_keys), None)
            default = None
            if column.default is not None:
                arg = column.default.arg
                if isinstance(arg, (str, int, float, bool)):
                    default = arg
            columns.append({
                "name": column.name,
                "type": str(column.type),
                "nullable": bool(column.nullable),
                "primary_key": bool(column.primary_key),
                "unique": bool(column.unique),
                "default": default,
                "foreign_key": (
                    {"table": fk.column.table.name,
                     "column": fk.column.name}
                    if fk is not None else None
                ),
            })
        rows = db.query(func.count()).select_from(table).scalar() or 0
        tables.append({"name": table.name, "columns": columns,
                       "rows": rows})
    return {"tables": tables}


def _client_ip(request: Request) -> str | None:
    if request.client:
        return request.client.host
    return None


def _user_out(user: models.User) -> schemas.UserOut:
    return schemas.UserOut(
        id=str(user.user_id),  # в API id — строка, как раньше (UUID)
        email=user.email,
        name=user.full_name,
        phone=user.phone,
        roles=[r.role_name for r in user.roles],
    )


def _product_out(product: models.Product) -> schemas.ProductOut:
    return schemas.ProductOut(
        id=product.id,
        name=product.name,
        category=product.category,
        price=product.price,
        old_price=product.old_price,
        stock=product.stock,
        rating=float(product.rating),
        reviews=product.reviews,
        sold=product.sold,
        image=product.image,
        description=product.description,
        specs=product.specs or {},
    )


def delivery_for(goods: int) -> int:
    return 0 if goods >= FREE_DELIVERY_FROM else DELIVERY_COST


# ---------------------------------------------------------------------
# Авторизация
# ---------------------------------------------------------------------
@app.post("/api/auth/register", response_model=schemas.UserOut,
          status_code=status.HTTP_201_CREATED)
def register(data: schemas.RegisterRequest, request: Request,
             db: Session = Depends(get_db)):
    if db.query(models.User).filter_by(email=data.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=ERR_EMAIL_EXISTS)
    password_hash = auth.hash_password(data.password)
    user = models.User(email=data.email, password_hash=password_hash,
                       full_name=data.name, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    role = db.query(models.Role).filter_by(role_name="user").first()
    if role is not None:
        user.roles.append(role)
        db.commit()
    log_audit(db, user.user_id, "register", "success",
              f"Регистрация: {user.email}", _client_ip(request))
    return _user_out(user)


@app.post("/api/auth/login", response_model=schemas.TokenResponse)
def login(data: schemas.LoginRequest, request: Request,
          db: Session = Depends(get_db)):
    ip = _client_ip(request)
    user = db.query(models.User).filter_by(email=data.email).first()
    if user is None:
        auth.note_failed_login(db, None, data.email, ip, "no_user")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=ERR_EMAIL_NOT_FOUND)
    auth.clear_expired_block(user)
    if user.is_blocked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Учётная запись временно заблокирована. "
                                   "Попробуйте позже.")
    if not auth.verify_password(data.password, user.password_hash):
        auth.note_failed_login(db, user, data.email, ip, "wrong_password")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail=ERR_WRONG_PASSWORD)
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Учётная запись заблокирована.")
    auth.note_successful_login(db, user, data.email, ip)
    access_token, refresh_token = auth.create_session(
        db, user, ip_address=ip,
        user_agent=request.headers.get("user-agent"))
    log_audit(db, user.user_id, "login", "success", f"Вход: {user.email}",
              ip)
    return schemas.TokenResponse(access_token=access_token,
                                 refresh_token=refresh_token)


@app.post("/api/auth/refresh", response_model=schemas.TokenResponse)
def refresh(data: schemas.RefreshRequest, request: Request,
            db: Session = Depends(get_db)):
    record = db.query(models.RefreshToken).filter_by(
        token_hash=auth.hash_token(data.refresh_token)).first()
    if (record is None or record.revoked_at is not None
            or record.expires_at < utcnow()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Токен обновления недействителен.")
    user = db.query(models.User).filter_by(user_id=record.user_id).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Учётная запись недоступна.")
    # Ротация: старый токен обновления отзываем, выдаём пару заново.
    record.revoked_at = utcnow()
    access_token, refresh_token = auth.create_session(
        db, user, ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"))
    return schemas.TokenResponse(access_token=access_token,
                                 refresh_token=refresh_token)


@app.post("/api/auth/logout")
def logout(request: Request,
           current_user: models.User = Depends(get_current_user),
           db: Session = Depends(get_db)):
    auth_header = request.headers.get("authorization", "")
    token = auth_header.split(" ", 1)[1] if " " in auth_header else ""
    if token:
        auth.revoke_session(db, token)
    log_audit(db, current_user.user_id, "logout", "success",
              f"Выход: {current_user.email}", _client_ip(request))
    return {"detail": "Вы вышли из системы"}


@app.get("/api/auth/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return _user_out(current_user)


@app.post("/api/auth/change-password")
def change_password(data: schemas.ChangePasswordRequest, request: Request,
                    current_user: models.User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    if not auth.verify_password(data.current_password,
                                current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=ERR_WRONG_CURRENT_PASSWORD)
    current_user.password_hash = auth.hash_password(data.new_password)
    current_user.updated_at = utcnow()
    db.commit()
    # При смене пароля все прежние сессии завершаются.
    auth.end_all_sessions(db, current_user.user_id)
    log_audit(db, current_user.user_id, "change_password", "success",
              "Пароль изменён", _client_ip(request))
    return {"detail": "Пароль успешно изменён."}


@app.post("/api/auth/change-name")
def change_name(data: schemas.ChangeNameRequest, request: Request,
                current_user: models.User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    current_user.full_name = data.name
    current_user.updated_at = utcnow()
    db.commit()
    log_audit(db, current_user.user_id, "change_name", "success",
              f"Имя изменено на: {data.name}", _client_ip(request))
    return {"detail": "Личные данные сохранены."}


# ---------------------------------------------------------------------
# Каталог
# ---------------------------------------------------------------------
@app.get("/api/products", response_model=list[schemas.ProductOut])
def list_products(
    q: str | None = Query(default=None, description="Поиск по названию"),
    category: str | None = Query(default=None),
    min_price: int | None = Query(default=None, ge=0),
    max_price: int | None = Query(default=None, ge=0),
    in_stock: bool = Query(default=False),
    sort: str = Query(default="popular",
                      description="popular | price_asc | price_desc | name"),
    db: Session = Depends(get_db),
):
    query = db.query(models.Product)
    if q:
        query = query.filter(models.Product.name.ilike(f"%{q}%"))
    if category:
        query = query.filter(models.Product.category == category)
    if min_price is not None:
        query = query.filter(models.Product.price >= min_price)
    if max_price is not None:
        query = query.filter(models.Product.price <= max_price)
    if in_stock:
        query = query.filter(models.Product.stock > 0)
    if sort == "price_asc":
        query = query.order_by(models.Product.price.asc())
    elif sort == "price_desc":
        query = query.order_by(models.Product.price.desc())
    elif sort == "name":
        query = query.order_by(models.Product.name.asc())
    else:  # popular — сначала популярные (по числу продаж)
        query = query.order_by(models.Product.sold.desc())
    return [_product_out(p) for p in query.all()]


@app.get("/api/products/{product_id}", response_model=schemas.ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter_by(id=product_id).first()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Товар не найден.")
    return _product_out(product)


# ---------------------------------------------------------------------
# Корзина (привязана к учётной записи)
# ---------------------------------------------------------------------
def _cart_out(db: Session, user: models.User) -> schemas.CartOut:
    items = (db.query(models.CartItem)
             .filter_by(user_id=user.user_id)
             .order_by(models.CartItem.id)
             .all())
    out_items = []
    goods = 0
    for item in items:
        product = db.query(models.Product).filter_by(id=item.product_id).first()
        if product is None:
            continue
        total = product.price * item.qty
        goods += total
        out_items.append(schemas.CartItemOut(
            product_id=product.id, name=product.name, price=product.price,
            image=product.image, qty=item.qty, stock=product.stock,
            total=total))
    delivery = delivery_for(goods) if goods else 0
    return schemas.CartOut(items=out_items, goods=goods,
                           delivery=delivery, total=goods + delivery)


@app.get("/api/cart", response_model=schemas.CartOut)
def get_cart(current_user: models.User = Depends(get_current_user),
             db: Session = Depends(get_db)):
    return _cart_out(db, current_user)


@app.post("/api/cart", response_model=schemas.CartOut)
def add_to_cart(data: schemas.CartAddRequest,
                current_user: models.User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    product = db.query(models.Product).filter_by(id=data.product_id).first()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Товар не найден.")
    if data.qty < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Укажите количество.")
    item = db.query(models.CartItem).filter_by(
        user_id=current_user.user_id, product_id=product.id).first()
    new_qty = (item.qty if item else 0) + data.qty
    if new_qty > product.stock:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"В наличии только {product.stock} шт. товара "
                   f"«{product.name}».")
    if item is None:
        item = models.CartItem(user_id=current_user.user_id,
                               product_id=product.id, qty=data.qty)
        db.add(item)
    else:
        item.qty = new_qty
    db.commit()
    return _cart_out(db, current_user)


@app.delete("/api/cart/{product_id}", response_model=schemas.CartOut)
def remove_from_cart(product_id: int,
                     current_user: models.User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    item = db.query(models.CartItem).filter_by(
        user_id=current_user.user_id, product_id=product_id).first()
    if item is not None:
        db.delete(item)
        db.commit()
    return _cart_out(db, current_user)


@app.delete("/api/cart", response_model=schemas.CartOut)
def clear_cart(current_user: models.User = Depends(get_current_user),
               db: Session = Depends(get_db)):
    db.query(models.CartItem).filter_by(user_id=current_user.user_id).delete()
    db.commit()
    return _cart_out(db, current_user)


# ---------------------------------------------------------------------
# Заказы
# ---------------------------------------------------------------------
@app.post("/api/orders", response_model=schemas.OrderOut,
          status_code=status.HTTP_201_CREATED)
def create_order(data: schemas.OrderCreateRequest, request: Request,
                 current_user: models.User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    cart = _cart_out(db, current_user)
    if not cart.items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Корзина пуста.")
    last = db.query(models.Order).order_by(
        models.Order.order_number.desc()).first()
    order_number = (last.order_number + 1) if last else FIRST_ORDER_NUMBER
    order = models.Order(
        order_number=order_number,
        user_id=current_user.user_id,
        name=data.name,
        phone=data.phone,
        address=data.address,
        pay_method=data.pay_method,
        goods=cart.goods,
        delivery=cart.delivery,
        total=cart.total,
        status="Принят в обработку",
    )
    db.add(order)
    db.flush()
    for item in cart.items:
        product = db.query(models.Product).filter_by(id=item.product_id).first()
        product.stock -= item.qty
        product.sold += item.qty
        db.add(models.OrderItem(order_id=order.id, product_id=product.id,
                                name=product.name, price=product.price,
                                qty=item.qty))
    db.query(models.CartItem).filter_by(user_id=current_user.user_id).delete()
    db.commit()
    db.refresh(order)
    log_audit(db, current_user.user_id, "order_created", "success",
              f"Заказ № {order_number} на сумму {order.total} ₽",
              _client_ip(request))
    return _order_out(order)


def _order_out(order: models.Order) -> schemas.OrderOut:
    return schemas.OrderOut(
        id=order.id,
        order_number=order.order_number,
        name=order.name,
        phone=order.phone,
        address=order.address,
        pay_method=order.pay_method,
        goods=order.goods,
        delivery=order.delivery,
        total=order.total,
        status=order.status,
        created_at=order.created_at,
        items=[schemas.OrderItemOut(product_id=i.product_id, name=i.name,
                                    price=i.price, qty=i.qty)
               for i in order.items],
    )


@app.get("/api/orders", response_model=list[schemas.OrderOut])
def list_orders(current_user: models.User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    orders = (db.query(models.Order)
              .filter_by(user_id=current_user.user_id)
              .order_by(models.Order.created_at.desc())
              .all())
    return [_order_out(o) for o in orders]


# ---------------------------------------------------------------------
# Админка: заказы (только роль admin)
# ---------------------------------------------------------------------
def _admin_order_out(order: models.Order) -> schemas.AdminOrderOut:
    out = _order_out(order)
    return schemas.AdminOrderOut(**out.model_dump(), user_email=None)


@app.get("/api/admin/orders", response_model=list[schemas.AdminOrderOut])
def admin_list_orders(admin: models.User = Depends(get_current_admin),
                      db: Session = Depends(get_db)):
    """Все заказы магазина (для админки)."""
    orders = (db.query(models.Order)
              .order_by(models.Order.created_at.desc())
              .all())
    result = []
    for order in orders:
        out = _admin_order_out(order)
        buyer = db.query(models.User).filter_by(
            user_id=order.user_id).first()
        out.user_email = buyer.email if buyer else None
        result.append(out)
    return result


@app.patch("/api/admin/orders/{order_id}",
           response_model=schemas.AdminOrderOut)
def admin_set_order_status(order_id: int, data: schemas.OrderStatusUpdate,
                           request: Request,
                           admin: models.User = Depends(get_current_admin),
                           db: Session = Depends(get_db)):
    """Сменить статус заказа (принять, отправить, завершить, отменить)."""
    order = db.query(models.Order).filter_by(id=order_id).first()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Заказ не найден.")
    old_status = order.status
    order.status = data.status
    db.commit()
    db.refresh(order)
    log_audit(db, admin.user_id, "order_status", "success",
              f"Заказ № {order.order_number}: {old_status} → {data.status}",
              _client_ip(request))
    out = _admin_order_out(order)
    buyer = db.query(models.User).filter_by(user_id=order.user_id).first()
    out.user_email = buyer.email if buyer else None
    return out


# ---------------------------------------------------------------------
# Фронтенд: один сервис — один адрес.
# Собранный React (dist) раздаётся с того же адреса, что и API,
# поэтому магазин открывается сразу по корню сайта, а запросы /api/*
# идут на тот же origin (CORS не нужен). Если папки со сборкой нет
# (локальная разработка бэкенда), монтирование просто пропускается.
# ---------------------------------------------------------------------
def _mount_frontend() -> str | None:
    import os
    from pathlib import Path

    from fastapi.staticfiles import StaticFiles

    here = Path(__file__).resolve().parent
    candidates = [
        os.environ.get("FRONTEND_DIST"),
        "/app/static",
        str(here.parent / "static"),
        str(here.parent.parent / "frontend" / "dist"),
    ]
    for candidate in candidates:
        if not candidate:
            continue
        dist = Path(candidate)
        if dist.is_dir() and (dist / "index.html").is_file():
            app.mount("/", StaticFiles(directory=str(dist), html=True),
                      name="frontend")
            return str(dist)
    return None


# Панель управления данными (SQLAdmin) — /admin. Подключается до
# монтирования фронтенда, чтобы маршруты /admin не перехватывались
# раздачей статики.
setup_admin(app)

FRONTEND_DIST = _mount_frontend()
