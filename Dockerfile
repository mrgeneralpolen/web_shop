# «Онлайн-Трейд»: один сервис — один адрес.
# Этап 1 — сборка фронтенда (React/Vite), этап 2 — бэкенд (FastAPI),
# который раздаёт и API, и собранный фронт с того же адреса:
# открыл ссылку — и сразу магазин, без второго сервиса и без CORS.
# Запуск: uvicorn app.main:app из /app/backend.
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# VITE_API_URL не задаём: фронт ходит в API относительными путями /api/*,
# то есть на тот же origin, где лежит сам.
RUN npm run build

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY --from=frontend /frontend/dist ./static

WORKDIR /app/backend

# Railway/Fly/Render подставляют $PORT; локально — 8000.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
