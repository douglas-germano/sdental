#!/bin/bash
set -e

echo "=== SDental Backend Starting ==="
echo "Environment: ${FLASK_ENV:-development}"
echo "Port: ${PORT:-5001}"

# Initialize new databases, then migrate existing ones. Never start the web
# server after a database preparation failure.
python bootstrap_database.py
echo "Running database migrations..."
ENABLE_SCHEDULER=false flask --app run:app db upgrade
echo "Migrations completed successfully."

# Calculate workers based on available resources
# Railway free tier: use 2 workers; otherwise scale with CPU
WORKERS=${WEB_CONCURRENCY:-2}
THREADS=${WEB_THREADS:-4}
echo "Starting Gunicorn with ${WORKERS} workers x ${THREADS} threads..."

# gthread lets each worker hold multiple connections (incl. the long-lived
# SSE stream used by the conversations chat) without needing a full async
# worker class - a sync worker would otherwise be pinned per open connection.
exec gunicorn \
    -w "${WORKERS}" \
    --worker-class gthread \
    --threads "${THREADS}" \
    -b "0.0.0.0:${PORT:-5001}" \
    --timeout 120 \
    --keep-alive 5 \
    --graceful-timeout 30 \
    --access-logfile - \
    --error-logfile - \
    --log-level info \
    "run:app"
