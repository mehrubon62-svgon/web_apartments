# AI Real Estate Marketplace — Backend

An AI-powered real estate marketplace API built with **FastAPI**. Map + catalog,
360° tours with **Spatial Q&A**, a tool-using **AI agent**, online bookings with
a built-in **MockPay** payment gateway, price tracking, personalized
recommendations, and **automatic complaint moderation**. All heavy work runs on
**Celery + Redis**, with realtime notifications delivered over WebSockets.

## Tech stack

| Concern | Choice |
|---|---|
| API | FastAPI (auto Swagger at `/docs`) |
| ORM / DB | SQLAlchemy + PostgreSQL (SQLite for zero-setup local dev) |
| Background tasks | Celery + Redis (broker, result backend, pub/sub) |
| Realtime | WebSocket `/ws` bridged to Celery via Redis pub/sub |
| Auth | JWT (access + refresh), role-based, Google OAuth |
| AI | OpenRouter (OpenAI-compatible) — tool calling + vision |
| Payments | Built-in MockPay gateway (Stripe-like hosted checkout, no keys) |
| Geocoding / map | Mapbox |
| Storage | Local disk (`/media-files`), Supabase-Storage-ready contract |

> **Design notes.** The brief specified Supabase/Claude/Stripe. To keep the
> project fully runnable for free and offline, this implementation uses a
> provider-agnostic AI layer (defaults to OpenRouter's free tier, switchable to
> Claude/Gemini via env vars), local file storage behind a swappable upload
> contract, WebSocket+Redis realtime instead of Supabase Realtime, and a
> self-contained **MockPay** gateway that mimics a hosted Stripe Checkout
> (payment session → hosted card page → confirmation). Behaviour is the same;
> only the provider changes.

## Roles

- **buyer** — browse map/catalog, view 360° tours, Spatial Q&A, book rentals,
  submit purchase requests, chat with the AI agent, favorites/history, complaints.
- **seller** — register and publish immediately (no verification), upload photos
  and 360° images, pin location, manage listings, view analytics.
- **admin** — review complaints and AI moderation decisions, override them.

## Run with Docker (recommended)

```bash
cp .env.example .env          # optional: fill in AI/Stripe/Mapbox keys
docker compose up --build
```

- API: http://localhost:8000  ·  Swagger: http://localhost:8000/docs
- Brings up Postgres, Redis, the API, a Celery worker, and Celery beat.
- Host ports: API `8000`, Postgres `5433`, Redis `6380` (chosen to avoid clashes).

## Run locally (no Docker)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python seed_data.py --reset   # demo users + listings + tours
uvicorn main:app --reload
```

Local dev defaults to SQLite, so it works without Postgres. For Celery features,
run Redis and start a worker:

```bash
celery -A celery_app.celery worker --loglevel=info
celery -A celery_app.celery beat --loglevel=info   # periodic price checks
```

## Demo accounts (after seeding)

Password for all: `demo1234`

| Email | Role |
|---|---|
| admin@estate.local | admin |
| realtor@estate.local | seller |
| agency@estate.local | seller |
| buyer@estate.local | buyer (has favorites + history) |

## Configuration

All keys are environment variables (see `.env.example`). Notable ones:

- `AI_API_KEY`, `AI_MODEL` — OpenRouter key + tool-capable model
  (default `google/gemma-4-31b-it:free`).
- `DATABASE_URL` — SQLite by default; set a Postgres/Supabase URL for production.
- `STRIPE_SECRET_KEY` — *(removed)* payments use the built-in MockPay gateway;
  open the returned `checkout_url`, pay with test card `4242 4242 4242 4242`.
- `MAPBOX_TOKEN` — enables address geocoding (manual pin always wins).
- `COMPLAINT_THRESHOLD` — complaints against a seller that trigger AI moderation
  (default 3).

## Modules / API groups

Auth, Users, Properties, 360 Tours, Spatial Q&A, AI Agent, Favorites, Viewing
History, Bookings, Payments (MockPay), Purchase/Viewing Requests, Price Trackers,
Recommendations, Complaints, Admin, Seller Dashboard, Notifications, Realtime
(`/ws`), Media.

Full interactive documentation is generated at **`/docs`**.

## Celery tasks

| Task | Trigger |
|---|---|
| `process_spatial_qa` | a zone question is submitted |
| `update_recommendations` | after each new view/favorite |
| `track_price_changes` | on a price drop + every 30 min (beat) |
| `moderate_seller` | seller reaches the complaint threshold |
| `send_notification` | universal dispatcher |

## Project layout

```
main.py            # FastAPI app + router wiring + realtime listener
config.py          # env-driven settings
models.py          # SQLAlchemy models (all tables)
dependencies.py    # JWT auth + role guards
celery_app.py      # Celery app + beat schedule
tasks.py           # the 5 Celery tasks
seed_data.py       # demo data
modules/<feature>/ # router.py (+ crud.py, schemas.py) per feature
  ai/              # provider-agnostic AI layer (OpenRouter)
  agent/           # AI agent tools + function-calling loop
  realtime/        # WebSocket manager + Redis pub/sub bridge
```
