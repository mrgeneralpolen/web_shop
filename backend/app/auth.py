"""Авторизация: хеш пароля, токены сессий, блокировка при переборе.

Пароль НИГДЕ не хранится открытым текстом: ``hash_password`` возвращает
одну строку ``"salt_hex$hash_hex"``, где hash = SHA-256(соль + пароль),
соль — 16 случайных байт. Соль и хеш лежат в одной колонке
``users.password_hash`` (как у Argon2id: закодированный хеш
самодостаточен; отдельной колонки соли в словаре нет).

Токен доступа — это UUID сессии (``sessions.session_id``): клиенту
выдаётся сам идентификатор сессии, живёт 15 минут. Токен обновления —
случайная строка, в базе только его SHA-256-хеш, живёт 30 дней.

Блокировка при переборе: 5 неудачных попыток подряд — учётная запись
блокируется на 15 минут (``users.is_blocked``, ``users.blocked_until``).
"""

import hashlib
import hmac
import secrets
import uuid
from datetime import timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

try:
    from app import models
    from app.database import get_db, utcnow
except ModuleNotFoundError as _exc:
    if _exc.name != "app":
        raise
    import models  # noqa: F401
    from database import get_db, utcnow

ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 30
MAX_FAILED_ATTEMPTS = 5
BLOCK_MINUTES = 15

_bearer = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------
# Пароли
# ---------------------------------------------------------------------
def hash_password(password: str) -> str:
    """Вернуть "salt_hex$hash_hex" для пароля."""
    salt = secrets.token_bytes(16)
    digest = hashlib.sha256(salt + password.encode("utf-8")).hexdigest()
    return salt.hex() + "$" + digest


def verify_password(password: str, password_hash: str) -> bool:
    """Проверить пароль по строке "salt_hex$hash_hex"."""
    if not password_hash or "$" not in password_hash:
        return False
    salt_hex, hash_hex = password_hash.split("$", 1)
    try:
        salt = bytes.fromhex(salt_hex)
    except ValueError:
        return False
    digest = hashlib.sha256(salt + password.encode("utf-8")).hexdigest()
    return hmac.compare_digest(digest, hash_hex)


# ---------------------------------------------------------------------
# Токены
# ---------------------------------------------------------------------
def new_token() -> str:
    return secrets.token_hex(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(db: Session, user: models.User,
                   ip_address: str | None = None,
                   user_agent: str | None = None) -> tuple[str, str]:
    """Создать сессию (15 минут) и токен обновления (30 дней).

    Токен доступа — это session_id: возвращается клиенту и одновременно
    является первичным ключом строки в таблице sessions.
    Возвращает (access_token, refresh_token) открытым текстом —
    в базе остаются только session_id и хеш токена обновления.
    """
    now = utcnow()
    access_token = str(uuid.uuid4())
    refresh_token = new_token()
    db.add(models.Session(
        session_id=access_token,
        user_id=user.user_id,
        ip_address=ip_address,
        user_agent=user_agent,
        expires_at=now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        created_at=now,
    ))
    db.add(models.RefreshToken(
        user_id=user.user_id,
        token_hash=hash_token(refresh_token),
        expires_at=now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        created_at=now,
    ))
    db.commit()
    return access_token, refresh_token


def revoke_session(db: Session, access_token: str) -> None:
    """Удалить сессию по токену (выход из системы)."""
    try:
        session_id = str(uuid.UUID(access_token))
    except (ValueError, AttributeError, TypeError):
        return
    session = db.query(models.Session).filter_by(
        session_id=session_id).first()
    if session:
        db.delete(session)
        db.commit()


def end_all_sessions(db: Session, user_id: int) -> None:
    """Завершить все сессии пользователя и отозвать токены обновления
    (например, при смене пароля)."""
    db.query(models.Session).filter_by(user_id=user_id).delete()
    db.query(models.RefreshToken).filter_by(
        user_id=user_id, revoked_at=None).update(
            {models.RefreshToken.revoked_at: utcnow()})
    db.commit()


# ---------------------------------------------------------------------
# Попытки входа и блокировка
# ---------------------------------------------------------------------
def note_failed_login(db: Session, user: models.User | None, email: str,
                      ip_address: str | None,
                      reason: str) -> None:
    """Зафиксировать неудачную попытку; при 5-й подряд — блокировка
    учётной записи на 15 минут."""
    db.add(models.LoginAttempt(email=email, ip_address=ip_address,
                               is_successful=False, failure_reason=reason))
    if user is not None:
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
            user.is_blocked = True
            user.blocked_until = utcnow() + timedelta(minutes=BLOCK_MINUTES)
    db.commit()


def note_successful_login(db: Session, user: models.User, email: str,
                          ip_address: str | None) -> None:
    """Зафиксировать успешный вход и сбросить счётчик неудач."""
    db.add(models.LoginAttempt(email=email, ip_address=ip_address,
                               is_successful=True))
    user.failed_login_attempts = 0
    user.is_blocked = False
    user.blocked_until = None
    db.commit()


def clear_expired_block(user: models.User) -> None:
    """Снять блокировку, срок которой уже истёк."""
    if (user.is_blocked and user.blocked_until is not None
            and user.blocked_until <= utcnow()):
        user.is_blocked = False
        user.blocked_until = None
        user.failed_login_attempts = 0


# ---------------------------------------------------------------------
# Текущий пользователь (зависимость FastAPI)
# ---------------------------------------------------------------------
def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> models.User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Требуется вход в систему.")
    try:
        session_id = str(uuid.UUID(credentials.credentials))
    except (ValueError, AttributeError, TypeError):
        session_id = None
    session = (db.query(models.Session).filter_by(
        session_id=session_id).first() if session_id else None)
    if (session is None or session.is_revoked
            or session.expires_at < utcnow()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Сессия завершена. Войдите в систему ещё раз.")
    user = db.query(models.User).filter_by(
        user_id=session.user_id).first()
    if user is None or not user.is_active or user.is_blocked:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Учётная запись недоступна.")
    return user


def log_audit(db: Session, user_id: int | None, event_type: str,
              result: str, details: str | None = None,
              ip_address: str | None = None) -> None:
    """Записать событие в журнал аудита (таблица 2.12)."""
    db.add(models.AuditLog(user_id=user_id, event_type=event_type,
                           result=result, details=details,
                           ip_address=ip_address))
    db.commit()
