import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from config import MEDIA_DIR, MAPBOX_TOKEN, GOOGLE_CLIENT_ID, AI_API_KEY
from models import Base, engine
from modules.observability.middleware import RequestLogMiddleware, configure_logging

from modules.users.router import router as auth_router, users_router
from modules.media.router import router as media_router
from modules.properties.router import router as properties_router
from modules.tours.router import router as tours_router
from modules.favorites.router import router as favorites_router
from modules.history.router import router as history_router
from modules.spatial_qa.router import router as spatial_qa_router
from modules.agent.router import router as agent_router
from modules.bookings.router import router as bookings_router
from modules.payments.router import router as payments_router
from modules.requests.router import router as requests_router
from modules.messages.router import router as messages_router
from modules.trackers.router import router as trackers_router
from modules.recommendations.router import router as recommendations_router
from modules.complaints.router import router as complaints_router
from modules.admin.router import router as admin_router
from modules.dashboard.router import router as dashboard_router
from modules.notifications.router import router as notifications_router
from modules.realtime.router import router as realtime_router
from modules.realtime.manager import pubsub_listener


Base.metadata.create_all(bind=engine)
Path(MEDIA_DIR).mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    task = asyncio.create_task(pubsub_listener())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(
    title="Nestora API",
    version="1.0.0",
    description=(
        "Nestora — an AI-powered real estate marketplace: map + catalog, 360° tours "
        "with Spatial Q&A, a tool-using AI agent (OpenRouter), bookings with a built-in "
        "MockPay gateway, price tracking, and automatic complaint moderation. All heavy "
        "work runs on Celery + Redis."
    ),
    swagger_ui_parameters={"persistAuthorization": True, "tryItOutEnabled": True},
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLogMiddleware)

app.include_router(auth_router)
app.include_router(users_router)

app.include_router(properties_router)
app.include_router(tours_router)
app.include_router(favorites_router)
app.include_router(history_router)
app.include_router(spatial_qa_router)
app.include_router(agent_router)

app.include_router(bookings_router)
app.include_router(payments_router)
app.include_router(requests_router)
app.include_router(messages_router)
app.include_router(trackers_router)

app.include_router(recommendations_router)
app.include_router(complaints_router)
app.include_router(admin_router)
app.include_router(dashboard_router)

app.include_router(notifications_router)
app.include_router(media_router)
app.include_router(realtime_router)

app.mount("/media-files", StaticFiles(directory=MEDIA_DIR), name="media-files")


@app.get("/api", tags=["Meta"])
def api_root():
    return {"name": "Nestora API", "version": "1.0.0", "docs": "/docs"}


@app.get("/config.js", tags=["Meta"])
def frontend_config():
    """Expose public, frontend-safe config (Mapbox public token, Google client id).

    Served as JS so the SPA can read it synchronously before booting. Only public
    tokens are included here — never secrets like the AI key or SMTP password.
    """
    from fastapi.responses import Response

    cfg = (
        "window.NESTORA_CONFIG = "
        + __import__("json").dumps(
            {
                "mapboxToken": MAPBOX_TOKEN or "",
                "googleClientId": GOOGLE_CLIENT_ID or "",
                "aiEnabled": bool(AI_API_KEY),
                "apiBase": "",
            }
        )
        + ";"
    )
    return Response(content=cfg, media_type="application/javascript")


@app.get("/health", tags=["Meta"])
def health():
    """Liveness + dependency checks (database and Redis)."""
    from sqlalchemy import text
    from config import REDIS_URL

    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    redis_ok = False
    try:
        import redis as sync_redis
        client = sync_redis.from_url(REDIS_URL, socket_connect_timeout=2)
        redis_ok = bool(client.ping())
        client.close()
    except Exception:
        redis_ok = False

    status = "ok" if db_ok else "degraded"
    return {"status": status, "database": db_ok, "redis": redis_ok}


_FRONTEND_DIR = Path(__file__).parent / "frontend"
_FRONTEND_DIR.mkdir(parents=True, exist_ok=True)


class NoCacheStaticFiles(StaticFiles):
    """Static files with caching disabled — avoids browsers serving stale JS/CSS
    during development (the source of 'nothing changed after reload')."""

    def is_not_modified(self, response_headers, request_headers) -> bool:
        return False

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response


app.mount("/", NoCacheStaticFiles(directory=str(_FRONTEND_DIR), html=True), name="frontend")
