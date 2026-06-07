import os

from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-key-change-in-production")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback"
)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./estate.db")

MEDIA_DIR = os.getenv("MEDIA_DIR", "./media_files")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", REDIS_URL)

AI_BASE_URL = os.getenv("AI_BASE_URL", "https://openrouter.ai/api/v1")
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_MODEL = os.getenv("AI_MODEL", "google/gemma-4-31b-it:free")
AI_VISION_MODEL = os.getenv("AI_VISION_MODEL", AI_MODEL)
AI_RECOMMEND_MODEL = os.getenv("AI_RECOMMEND_MODEL", "deepseek/deepseek-v4-flash:free")
AI_FALLBACK_MODELS = [
    m.strip() for m in os.getenv(
        "AI_FALLBACK_MODELS",
        "deepseek/deepseek-v4-flash:free,google/gemma-4-31b-it:free,deepseek/deepseek-v3.2-exp",
    ).split(",") if m.strip()
]
AI_MAX_TOKENS = int(os.getenv("AI_MAX_TOKENS", "1024"))
AI_APP_URL = os.getenv("AI_APP_URL", "http://localhost:3000")
AI_APP_TITLE = os.getenv("AI_APP_TITLE", "Nestora")

MAPBOX_TOKEN = os.getenv("MAPBOX_TOKEN", "")
MAPBOX_GEOCODING_URL = os.getenv(
    "MAPBOX_GEOCODING_URL",
    "https://api.mapbox.com/geocoding/v5/mapbox.places",
)

PAYMENTS_BASE_URL = os.getenv("PAYMENTS_BASE_URL", "http://localhost:8000")
PAYMENT_CURRENCY = os.getenv("PAYMENT_CURRENCY", "usd")
PAYMENT_SESSION_TTL_MIN = int(os.getenv("PAYMENT_SESSION_TTL_MIN", "30"))

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER or "no-reply@estate.local")
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "Nestora")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"

EMAIL_CODE_TTL_MIN = int(os.getenv("EMAIL_CODE_TTL_MIN", "10"))
EMAIL_CODE_MAX_ATTEMPTS = int(os.getenv("EMAIL_CODE_MAX_ATTEMPTS", "5"))
REQUIRE_EMAIL_VERIFICATION = os.getenv("REQUIRE_EMAIL_VERIFICATION", "false").lower() == "true"

COMPLAINT_THRESHOLD = int(os.getenv("COMPLAINT_THRESHOLD", "3"))

AI_RATE_LIMIT = int(os.getenv("AI_RATE_LIMIT", "20"))
AI_RATE_WINDOW_SEC = int(os.getenv("AI_RATE_WINDOW_SEC", "60"))
