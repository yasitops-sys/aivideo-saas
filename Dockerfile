# ── Build frontends ──────────────────────────────────────────────
FROM node:20-slim AS webbuild
WORKDIR /build

# customer app
COPY apps/web/package.json apps/web/package-lock.json* ./apps/web/
RUN cd apps/web && npm ci --no-audit --no-fund
COPY apps/web ./apps/web
# VITE_API_URL is injected as a build arg (Railway build variable)
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN cd apps/web && npm run build

# admin app
COPY apps/admin/package.json apps/admin/package-lock.json* ./apps/admin/
RUN cd apps/admin && npm ci --no-audit --no-fund
COPY apps/admin ./apps/admin
RUN cd apps/admin && npm run build

# ── Runtime: API + worker ──────────────────────────────────────────
FROM python:3.12-slim

# ffmpeg: needed by the mock AI provider to render preview videos
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY --from=webbuild /build/apps/web/dist ./apps/web/dist
COPY --from=webbuild /build/apps/admin/dist ./apps/admin/dist
RUN mkdir -p /app/data

EXPOSE 8000

# Railway injects $PORT; default 8000 for local docker runs.
# The service start command is overridden per service on Railway:
#   api:    seed + uvicorn
#   worker: python -m app.worker.worker
CMD sh -c "python -m app.seed && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2"
