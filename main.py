import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import MEDIA_DIR
from models import Base, engine

# Routers
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
from modules.trackers.router import router as trackers_router
from modules.recommendations.router import router as recommendations_router
from modules.complaints.router import router as complaints_router
from modules.admin.router import router as admin_router
from modules.dashboard.router import router as dashboard_router
from modules.notifications.router import router as notifications_router
from modules.realtime.router import router as realtime_router
from modules.realtime.manager import pubsub_listener


# Create tables (dev convenience; use Alembic for real migrations).
Base.metadata.create_all(bind=engine)
Path(MEDIA_DIR).mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the Redis->WebSocket relay so Celery-produced events reach clients.
    task = asyncio.create_task(pubsub_listener())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(
    title="AI Real Estate Marketplace API",
    version="1.0.0",
    description=(
        "AI-powered real estate marketplace: map + catalog, 360° tours with Spatial Q&A, "
        "a tool-using AI agent (OpenRouter), bookings with a built-in MockPay gateway, "
        "price tracking, and automatic complaint moderation. All heavy work runs on "
        "Celery + Redis."
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

# Auth & users
app.include_router(auth_router)
app.include_router(users_router)

# Core marketplace
app.include_router(properties_router)
app.include_router(tours_router)
app.include_router(favorites_router)
app.include_router(history_router)
app.include_router(spatial_qa_router)
app.include_router(agent_router)

# Transactions
app.include_router(bookings_router)
app.include_router(payments_router)
app.include_router(requests_router)
app.include_router(trackers_router)

# Intelligence & moderation
app.include_router(recommendations_router)
app.include_router(complaints_router)
app.include_router(admin_router)
app.include_router(dashboard_router)

# Notifications & realtime
app.include_router(notifications_router)
app.include_router(media_router)
app.include_router(realtime_router)

# Serve uploaded files
app.mount("/media-files", StaticFiles(directory=MEDIA_DIR), name="media-files")


@app.get("/", tags=["Meta"])
def root():
    return {"name": "AI Real Estate Marketplace API", "version": "1.0.0", "docs": "/docs"}


@app.get("/health", tags=["Meta"])
def health():
    return {"status": "ok"}
