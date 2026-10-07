#!/bin/sh
# HF Spaces entrypoint: api + worker in one container, SQLite.
set -e

echo "seeding…"
python -m app.seed

echo "starting worker in background…"
python -m app.worker.worker &
echo "starting api…"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-7860}" --workers 2
