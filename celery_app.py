"""Celery application.

Run a worker:
    celery -A celery_app.celery worker --loglevel=info

Run the beat scheduler (periodic price checks):
    celery -A celery_app.celery beat --loglevel=info
"""
from celery import Celery
from celery.schedules import crontab

from config import CELERY_BROKER_URL, CELERY_RESULT_BACKEND

celery = Celery(
    "estate",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
    include=["tasks"],
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    # Fail fast when the broker is unreachable so API callers can fall back
    # (e.g. send email inline) instead of hanging on connection retries.
    broker_connection_retry_on_startup=False,
    broker_connection_max_retries=0,
    broker_transport_options={
        "socket_connect_timeout": 2,
        "socket_timeout": 2,
    },
)

# Periodic: re-check tracked prices every 30 minutes.
celery.conf.beat_schedule = {
    "track-price-changes-every-30-min": {
        "task": "tasks.track_price_changes",
        "schedule": crontab(minute="*/30"),
    },
}
