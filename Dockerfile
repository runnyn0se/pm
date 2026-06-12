# Stage 1: Build Next.js frontend
FROM node:22-slim AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Python backend
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

COPY backend/pyproject.toml .
RUN uv sync --no-dev --no-install-project

COPY backend/ .
COPY --from=frontend-builder /frontend/out ./static

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
