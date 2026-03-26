#!/bin/bash
set -e

echo "=== SDental Backend Starting ==="
echo "Environment: ${FLASK_ENV:-development}"
echo "Port: ${PORT:-5001}"

# Run database migrations
echo "Running database migrations..."
if flask db upgrade; then
    echo "Migrations completed successfully."
else
    echo "WARNING: Migrations failed. Attempting to start anyway..."
fi

# Calculate workers based on available resources
# Railway free tier: use 2 workers; otherwise scale with CPU
WORKERS=${WEB_CONCURRENCY:-2}
echo "Starting Gunicorn with ${WORKERS} workers..."

exec gunicorn \
    -w "${WORKERS}" \
    -b "0.0.0.0:${PORT:-5001}" \
    --timeout 120 \
    --keep-alive 5 \
    --graceful-timeout 30 \
    --access-logfile - \
    --error-logfile - \
    --log-level info \
    "run:app"
