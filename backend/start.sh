#!/bin/bash

echo "Starting SDental Backend..."

# Run database migrations
echo "Running database migrations..."
flask db upgrade

# Start gunicorn server
echo "Starting Gunicorn server..."
gunicorn -w 4 -b 0.0.0.0:${PORT:-5001} "run:app"
