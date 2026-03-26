FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Make start script executable
RUN chmod +x start.sh

# Expose port (Railway sets PORT dynamically)
EXPOSE ${PORT:-5001}

# Run via start.sh (handles migrations + gunicorn)
CMD ["bash", "start.sh"]
