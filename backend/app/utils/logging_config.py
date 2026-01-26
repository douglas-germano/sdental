"""
Structured logging configuration.
"""
import logging
import sys
import json
from datetime import datetime
from typing import Any


class StructuredFormatter(logging.Formatter):
    """
    Custom formatter that outputs JSON logs for production
    and readable logs for development.
    """

    def __init__(self, json_format: bool = False):
        super().__init__()
        self.json_format = json_format

    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
        }

        # Add extra fields if present
        if hasattr(record, '__dict__'):
            for key, value in record.__dict__.items():
                if key not in [
                    'name', 'msg', 'args', 'created', 'filename', 'funcName',
                    'levelname', 'levelno', 'lineno', 'module', 'msecs',
                    'pathname', 'process', 'processName', 'relativeCreated',
                    'stack_info', 'exc_info', 'exc_text', 'thread', 'threadName',
                    'message', 'taskName'
                ]:
                    log_data[key] = self._serialize_value(value)

        # Add exception info if present
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)

        if self.json_format:
            return json.dumps(log_data, default=str)

        # Human-readable format for development
        extra_str = ''
        extra_fields = {k: v for k, v in log_data.items()
                       if k not in ['timestamp', 'level', 'logger', 'message', 'exception']}
        if extra_fields:
            extra_str = f" | {extra_fields}"

        base = f"[{log_data['timestamp']}] {log_data['level']} {log_data['logger']}: {log_data['message']}{extra_str}"

        if 'exception' in log_data:
            base += f"\n{log_data['exception']}"

        return base

    def _serialize_value(self, value: Any) -> Any:
        """Serialize value for JSON output."""
        if isinstance(value, (str, int, float, bool, type(None))):
            return value
        if isinstance(value, (list, tuple)):
            return [self._serialize_value(v) for v in value]
        if isinstance(value, dict):
            return {k: self._serialize_value(v) for k, v in value.items()}
        return str(value)


def setup_logging(app=None, json_format: bool = None):
    """
    Configure structured logging for the application.

    Args:
        app: Flask application instance
        json_format: If True, output JSON logs. If None, auto-detect from environment.
    """
    import os

    if json_format is None:
        # Use JSON format in production
        json_format = os.getenv('FLASK_ENV') == 'production'

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Create console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(StructuredFormatter(json_format=json_format))
    root_logger.addHandler(console_handler)

    # Set specific log levels
    logging.getLogger('werkzeug').setLevel(logging.WARNING)
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)

    if app:
        app.logger.handlers = []
        app.logger.propagate = True


def get_logger(name: str) -> logging.Logger:
    """Get a logger with the given name."""
    return logging.getLogger(name)
