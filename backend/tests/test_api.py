"""Сквозной тест API интернет-магазина «Онлайн-Трейд».

Сценарий (как в таблице 3.1 отчёта):
  регистрация → вход → добавление 2 товаров в корзину →
  оформление заказа (9 380 ₽: наушники SoundWave Pro 6 490 ₽ +
  чайник SteelKettle 2 890 ₽, доставка бесплатно) →
  заказ № 1001 в истории; вход с неверным паролем отклоняется;
  после «перезапуска» (новый TestClient на том же файле БД)
  демо-аккаунт входит.

Запуск:  cd backend && python -m pytest tests/ -v
"""

import os
import sys

import pytest
from fastapi.testclient import TestClient

TEST_DB = "/tmp/test_webshop.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

HEADPHONES_ID = 3   # Наушники SoundWave Pro — 6 490 ₽
KETTLE_ID = 8       # Чайник SteelKettle — 2 890 ₽


@pytest.fixture()
def client():
    """Чистая БД на каждый тест.

    Файл НЕ удаляем: у engine уровня модуля остаются открытые
    соединения, и удаление файла ломает SQLite («readonly database»).
    Вместо этого сбрасываем схему через drop_all/create_all.
    """
    from app.database import Base, engine
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    from app.main import app
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(bind=engine)


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_full_scenario(client):
    # --- регистрация ---
    r = client.post("/api/auth/register", json={
        "name": "Тест Тестов", "email": "test@example.ru",
        "password": "Test1234", "password2": "Test1234",
    })
    assert r.status_code == 201, r.text
    assert r.json()["email"] == "test@example.ru"

    # --- повторная регистрация с тем же email ---
    r = client.post("/api/auth/register", json={
        "name": "Тест Тестов", "email": "test@example.ru",
        "password": "Test1234", "password2": "Test1234",
    })
    assert r.status_code == 400
    assert "уже существует" in r.json()["detail"]

    # --- вход с неверным паролем — точный текст ошибки ---
    r = client.post("/api/auth/login", json={
        "email": "test@example.ru", "password": "WrongPass1",
    })
    assert r.status_code == 401
    assert r.json()["detail"] == "Неверный пароль. Попробуйте ещё раз."

    # --- вход с несуществующим email ---
    r = client.post("/api/auth/login", json={
        "email": "nobody@example.ru", "password": "Whatever1",
    })
    assert r.status_code == 400
    assert "не найдена" in r.json()["detail"]

    # --- вход ---
    r = client.post("/api/auth/login", json={
        "email": "test@example.ru", "password": "Test1234",
    })
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    headers = _auth_headers(token)

    # --- каталог: 12 товаров ---
    r = client.get("/api/products")
    assert r.status_code == 200
    assert len(r.json()) == 12

    # --- корзина: наушники + чайник ---
    r = client.post("/api/cart", json={"product_id": HEADPHONES_ID, "qty": 1},
                    headers=headers)
    assert r.status_code == 200, r.text
    r = client.post("/api/cart", json={"product_id": KETTLE_ID, "qty": 1},
                    headers=headers)
    assert r.status_code == 200, r.text
    r = client.get("/api/cart", headers=headers)
    cart = r.json()
    assert cart["goods"] == 9380
    assert cart["delivery"] == 0  # бесплатно от 5 000 ₽
    assert cart["total"] == 9380

    # --- оформление заказа ---
    r = client.post("/api/orders", json={
        "name": "Тест Тестов",
        "phone": "+7 999 123-45-67",
        "address": "г. Тюмень, ул. Ленина, д. 10, кв. 25",
        "pay_method": "card_online",
    }, headers=headers)
    assert r.status_code == 201, r.text
    order = r.json()
    assert order["order_number"] == 1001
    assert order["status"] == "Принят в обработку"
    assert order["goods"] == 9380
    assert order["delivery"] == 0
    assert order["total"] == 9380
    assert len(order["items"]) == 2

    # --- корзина после заказа пуста ---
    r = client.get("/api/cart", headers=headers)
    assert r.json()["items"] == []

    # --- заказ в истории ---
    r = client.get("/api/orders", headers=headers)
    assert r.status_code == 200
    orders = r.json()
    assert len(orders) == 1
    assert orders[0]["order_number"] == 1001

    # --- смена пароля и вход с новым паролем ---
    r = client.post("/api/auth/change-password", json={
        "current_password": "Test1234",
        "new_password": "NewPass567",
        "new_password2": "NewPass567",
    }, headers=headers)
    assert r.status_code == 200, r.text
    r = client.post("/api/auth/login", json={
        "email": "test@example.ru", "password": "NewPass567",
    })
    assert r.status_code == 200


def test_demo_login_after_restart(client):
    """Демо-аккаунт засеян при старте и входит после «перезапуска».

    «Перезапуск» — это закрытие всех соединений с файлом БД
    (engine.dispose) и новый TestClient: приложение стартует заново,
    seed не затирает данные, а демо-пароль проверяется по хешу
    из базы.
    """
    r = client.post("/api/auth/login", json={
        "email": "demo@onlain-treid.ru", "password": "Demo1234",
    })
    assert r.status_code == 200, r.text
    assert r.json()["access_token"]

    from app.database import engine
    engine.dispose()

    from app.main import app as app2
    with TestClient(app2) as client2:
        r = client2.post("/api/auth/login", json={
            "email": "demo@onlain-treid.ru", "password": "Demo1234",
        })
        assert r.status_code == 200, r.text
        r = client2.get("/api/auth/me",
                        headers=_auth_headers(r.json()["access_token"]))
        assert r.status_code == 200
        assert r.json()["email"] == "demo@onlain-treid.ru"


def test_guest_cart_requires_auth(client):
    """Без входа корзина недоступна — гость должен войти."""
    r = client.get("/api/cart")
    assert r.status_code == 401
    r = client.post("/api/cart", json={"product_id": HEADPHONES_ID, "qty": 1})
    assert r.status_code == 401


def test_block_after_five_failed_logins(client):
    """5 неверных паролей подряд — блокировка на 15 минут."""
    client.post("/api/auth/register", json={
        "name": "Тест Тестов", "email": "block@example.ru",
        "password": "Test1234", "password2": "Test1234",
    })
    for _ in range(5):
        r = client.post("/api/auth/login", json={
            "email": "block@example.ru", "password": "WrongPass1",
        })
        assert r.status_code == 401
    # Шестая попытка — уже с верным паролем — отклоняется блокировкой.
    r = client.post("/api/auth/login", json={
        "email": "block@example.ru", "password": "Test1234",
    })
    assert r.status_code == 403
    assert "заблокирована" in r.json()["detail"]


def test_db_schema_matches_dictionary(client):
    """Встроенный просмотрщик БД: все таблицы словаря на месте,
    у users — ключ user_id, всего 15 таблиц (11 авторизации + 4 магазина)."""
    r = client.get("/api/db/schema")
    assert r.status_code == 200, r.text
    tables = {t["name"]: t for t in r.json()["tables"]}
    assert len(tables) == 15
    for name in ("users", "roles", "user_roles", "permissions",
                 "role_permissions", "sessions", "refresh_tokens",
                 "password_resets", "login_attempts", "audit_log",
                 "oauth_accounts", "products", "cart_items", "orders",
                 "order_items"):
        assert name in tables, name
    users = tables["users"]
    cols = {c["name"]: c for c in users["columns"]}
    assert cols["user_id"]["primary_key"] is True
    assert cols["email"]["unique"] is True
    assert "salt" not in cols
    assert "failed_login_attempts" in cols
    assert "is_blocked" in cols
    assert users["rows"] >= 1  # демо-аккаунт засеян при старте
    sessions = tables["sessions"]
    scols = {c["name"] for c in sessions["columns"]}
    assert "token_hash" not in scols  # токен — это session_id
    assert "is_revoked" in scols
