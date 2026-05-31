import os

from dotenv import load_dotenv

load_dotenv()

# ===== Auth / JWT =====
SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-key-change-in-production")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

# Google OAuth (login via Google)
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback"
)

# ===== Database =====
# Local dev defaults to SQLite; set DATABASE_URL to a Postgres/Supabase URL in prod.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./estate.db")

# ===== Media / storage =====
MEDIA_DIR = os.getenv("MEDIA_DIR", "./media_files")

# ===== Redis / Celery =====
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", REDIS_URL)

# ===== AI (OpenRouter, OpenAI-compatible) =====
# Provider-agnostic layer. Defaults target OpenRouter's free tier.
AI_BASE_URL = os.getenv("AI_BASE_URL", "https://openrouter.ai/api/v1")
AI_API_KEY = os.getenv("AI_API_KEY", "")
# A tool-capable + vision free model. Override in .env if it changes.
AI_MODEL = os.getenv("AI_MODEL", "google/gemma-4-31b-it:free")
AI_VISION_MODEL = os.getenv("AI_VISION_MODEL", AI_MODEL)
AI_MAX_TOKENS = int(os.getenv("AI_MAX_TOKENS", "1024"))
# Optional attribution headers recommended by OpenRouter
AI_APP_URL = os.getenv("AI_APP_URL", "http://localhost:3000")
AI_APP_TITLE = os.getenv("AI_APP_TITLE", "AI Real Estate Marketplace")

# ===== Mapbox (geocoding + map) =====
MAPBOX_TOKEN = os.getenv("MAPBOX_TOKEN", "")
MAPBOX_GEOCODING_URL = os.getenv(
    "MAPBOX_GEOCODING_URL",
    "https://api.mapbox.com/geocoding/v5/mapbox.places",
)

# ===== Payments (built-in MockPay gateway, Stripe-like, no external keys) =====
# Base URL where the hosted checkout page is served (this API itself).
PAYMENTS_BASE_URL = os.getenv("PAYMENTS_BASE_URL", "http://localhost:8000")
PAYMENT_CURRENCY = os.getenv("PAYMENT_CURRENCY", "usd")
# Minutes a checkout session stays valid before it expires.
PAYMENT_SESSION_TTL_MIN = int(os.getenv("PAYMENT_SESSION_TTL_MIN", "30"))

# ===== Moderation =====
# Number of complaints against a seller that triggers automatic AI moderation.
COMPLAINT_THRESHOLD = int(os.getenv("COMPLAINT_THRESHOLD", "3"))
