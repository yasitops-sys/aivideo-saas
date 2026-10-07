#!/bin/sh
# Railway entrypoint: api and worker share one image.
# Set SERVICE_ROLE=worker on the worker service.
set -e

# wait for postgres (up to ~60s) so seed/migrations don't race the DB
python3 - <<'PY'
import os, socket, time, urllib.parse
url = os.environ.get("DATABASE_URL", "")
if url.startswith(("postgres://", "postgresql://")):
    u = urllib.parse.urlparse(url)
    host, port = u.hostname or "localhost", u.port or 5432
    for i in range(30):
        try:
            socket.create_connection((host, port), timeout=2).close()
            print(f"postgres up at {host}:{port}", flush=True)
            break
        except OSError:
            if i == 29:
                print("postgres not reachable, continuing anyway", flush=True)
            time.sleep(2)
PY

if [ "$SERVICE_ROLE" = "worker" ]; then
  echo "starting worker…"
  exec python -m app.worker.worker
fi
if [ "$RUN_WORKER_BG" = "1" ]; then
  echo "starting worker in background…"
  python -m app.worker.worker &
fi
echo "seeding + starting api…"
python -m app.seed
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 2
