#!/bin/sh
# Railway entrypoint: api and worker share one image.
# Set SERVICE_ROLE=worker on the worker service.
set -e
if [ "$SERVICE_ROLE" = "worker" ]; then
  echo "starting worker…"
  exec python -m app.worker.worker
fi
echo "seeding + starting api…"
python -m app.seed
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 2
