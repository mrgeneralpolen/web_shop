"""Pydantic-схемы запросов и ответов API."""

import re
from datetime import datetime

from pydantic import BaseModel, field_validator

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Сообщения об ошибках — те же, что в интерфейсе магазина.
ERR_EMAIL_EMPTY = "Укажите адрес электронной почты."
ERR_EMAIL_INVALID = "Укажите корректный адрес электронной почты."
ERR_PASSWORD_SHORT = "Пароль должен содержать не менее 6 символов."
ERR_PASSWORDS_MISMATCH = "Пароли не совпадают."
ERR_NAME_SHORT = "Имя должно содержать не менее 2 символов."
ERR_PHONE_SHORT = "Укажите корректный номер телефона (не короче 10 цифр)."
ERR_EMAIL_EXISTS = ("Учётная запись с таким адресом электронной почты уже "
                    "существует. Войдите в систему.")
ERR_EMAIL_NOT_FOUND = ("Учётная запись с таким адресом электронной почты "
                       "не найдена. Проверьте адрес или зарегистрируйтесь.")
ERR_WRONG_PASSWORD = "Неверный пароль. Попробуйте ещё раз."
ERR_WRONG_CURRENT_PASSWORD = "Указан неверный текущий пароль."


def _check_email(email: str) -> str:
    email = (email or "").strip()
    if not email:
        raise ValueError(ERR_EMAIL_EMPTY)
    if not EMAIL_RE.match(email):
        raise ValueError(ERR_EMAIL_INVALID)
    return email.lower()


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    password2: str

    @field_validator("name")
    @classmethod
    def name_len(cls, v: str) -> str:
        if len((v or "").strip()) < 2:
            raise ValueError(ERR_NAME_SHORT)
        return v.strip()

    @field_validator("email")
    @classmethod
    def email_valid(cls, v: str) -> str:
        return _check_email(v)

    @field_validator("password")
    @classmethod
    def password_len(cls, v: str) -> str:
        if len(v or "") < 6:
            raise ValueError(ERR_PASSWORD_SHORT)
        return v

    @field_validator("password2")
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        if "password" in (info.data or {}) and v != info.data["password"]:
            raise ValueError(ERR_PASSWORDS_MISMATCH)
        return v


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def email_valid(cls, v: str) -> str:
        return _check_email(v)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    new_password2: str

    @field_validator("new_password")
    @classmethod
    def password_len(cls, v: str) -> str:
        if len(v or "") < 6:
            raise ValueError(ERR_PASSWORD_SHORT)
        return v

    @field_validator("new_password2")
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        if "new_password" in (info.data or {}) and v != info.data["new_password"]:
            raise ValueError(ERR_PASSWORDS_MISMATCH)
        return v


class ChangeNameRequest(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def name_len(cls, v: str) -> str:
        if len((v or "").strip()) < 2:
            raise ValueError(ERR_NAME_SHORT)
        return v.strip()


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    email: str
    name: str | None
    phone: str | None
    roles: list[str] = []

    model_config = {"from_attributes": True}


class ProductOut(BaseModel):
    id: int
    name: str
    category: str
    price: int
    old_price: int | None
    stock: int
    rating: float
    reviews: int
    sold: int
    image: str | None
    description: str | None
    specs: dict = {}

    model_config = {"from_attributes": True}


class CartAddRequest(BaseModel):
    product_id: int
    qty: int = 1


class CartItemOut(BaseModel):
    product_id: int
    name: str
    price: int
    image: str | None
    qty: int
    stock: int
    total: int


class CartOut(BaseModel):
    items: list[CartItemOut]
    goods: int
    delivery: int
    total: int


PAY_METHODS = ("card_online", "card_on_delivery", "cash")


class OrderCreateRequest(BaseModel):
    name: str
    phone: str
    address: str
    pay_method: str

    @field_validator("name")
    @classmethod
    def name_len(cls, v: str) -> str:
        if len((v or "").strip()) < 2:
            raise ValueError(ERR_NAME_SHORT)
        return v.strip()

    @field_validator("phone")
    @classmethod
    def phone_len(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v or "")
        if len(digits) < 10:
            raise ValueError(ERR_PHONE_SHORT)
        return v.strip()

    @field_validator("address")
    @classmethod
    def address_len(cls, v: str) -> str:
        if len((v or "").strip()) < 5:
            raise ValueError("Укажите адрес доставки.")
        return v.strip()

    @field_validator("pay_method")
    @classmethod
    def pay_valid(cls, v: str) -> str:
        if v not in PAY_METHODS:
            raise ValueError("Выберите способ оплаты.")
        return v


class OrderItemOut(BaseModel):
    product_id: int
    name: str
    price: int
    qty: int


class OrderOut(BaseModel):
    id: int
    order_number: int
    name: str
    phone: str
    address: str
    pay_method: str
    goods: int
    delivery: int
    total: int
    status: str
    created_at: datetime
    items: list[OrderItemOut]

    model_config = {"from_attributes": True}
