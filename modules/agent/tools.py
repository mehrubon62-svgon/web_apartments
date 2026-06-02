"""Tool definitions + executors for the global AI agent.

Each tool is described in OpenAI/OpenRouter function-calling format and backed by
a real executor that touches the database. The agent calls these to search,
open tours, manage favorites/history, compare, track prices and give advice.
"""
from __future__ import annotations

from typing import Any, Callable

from sqlalchemy.orm import Session

from models import (
    Property,
    PropertyStatus,
    DealType,
    PropertyType,
    PriceTracker,
)
from modules.properties.crud import search_properties, get_property, cover_url, has_tour
from modules.favorites.crud import add_favorite, list_favorites
from modules.history.crud import list_history, clear_history
from modules.recommendations.crud import load_recommended_properties


# ===== Tool schemas (sent to the model) =====

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_properties",
            "description": (
                "Search active property listings by filters and sorting. Use for queries like "
                "'apartments under $500k', 'cheapest houses', 'biggest rentals'. To find the "
                "most affordable/cheapest, set sort_by='price' and order='asc' WITHOUT a "
                "max_price. To find premium/expensive, use order='desc'. For largest, "
                "sort_by='area' order='desc'. Only set max_price/min_price when the user gives "
                "an explicit number."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "deal_type": {"type": "string", "enum": ["rent", "sale"]},
                    "type": {"type": "string", "enum": ["apartment", "house", "commercial"]},
                    "max_price": {"type": "number"},
                    "min_price": {"type": "number"},
                    "min_area": {"type": "number"},
                    "rooms": {"type": "integer"},
                    "sort_by": {"type": "string", "enum": ["price", "area"], "description": "Field to sort by"},
                    "order": {"type": "string", "enum": ["asc", "desc"], "description": "asc = cheapest/smallest first, desc = most expensive/largest first"},
                    "limit": {"type": "integer", "description": "Max results (default 5)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "open_tour",
            "description": "Return a deep link to open the 360° tour of a specific property by id.",
            "parameters": {
                "type": "object",
                "properties": {"property_id": {"type": "integer"}},
                "required": ["property_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "show_on_map",
            "description": "Return a link to the map filtered by the given criteria.",
            "parameters": {
                "type": "object",
                "properties": {
                    "deal_type": {"type": "string", "enum": ["rent", "sale"]},
                    "type": {"type": "string", "enum": ["apartment", "house", "commercial"]},
                    "max_price": {"type": "number"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_properties",
            "description": "Compare two or more properties by id and produce a comparison table.",
            "parameters": {
                "type": "object",
                "properties": {
                    "property_ids": {"type": "array", "items": {"type": "integer"}},
                },
                "required": ["property_ids"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_favorites",
            "description": "List the current user's favorited properties. Use to answer 'which of my favorites is best for a family'.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_to_favorites",
            "description": "Add a property to the current user's favorites.",
            "parameters": {
                "type": "object",
                "properties": {"property_id": {"type": "integer"}},
                "required": ["property_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_viewing_history",
            "description": "List what the user viewed recently (e.g. 'what did I view yesterday').",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_viewing_history",
            "description": "Delete all of the user's viewing history.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_price_tracker",
            "description": "Track the price of a property and notify the user when it drops (optionally to a target).",
            "parameters": {
                "type": "object",
                "properties": {
                    "property_id": {"type": "integer"},
                    "target_price": {"type": "number"},
                },
                "required": ["property_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recommendations",
            "description": "Get personalized property recommendations for the user.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]


# ===== Executors =====

def _serialize_brief(p: Property) -> dict:
    return {
        "id": p.id,
        "title": p.title,
        "type": p.type.value,
        "deal_type": p.deal_type.value,
        "price": p.price,
        "area": p.area,
        "rooms": p.rooms,
        "address": p.address,
    }


def _serialize_card(db: Session, p: Property) -> dict:
    """Richer payload used to render a clickable listing card in the chat UI."""
    d = _serialize_brief(p)
    try:
        d["cover_url"] = cover_url(p)
    except Exception:
        d["cover_url"] = None
    try:
        d["has_tour"] = has_tour(db, p.id)
    except Exception:
        d["has_tour"] = False
    return d


def _enum(value, enum_cls):
    if value is None:
        return None
    try:
        return enum_cls(value)
    except ValueError:
        return None


def execute_tool(db: Session, user_id: int, name: str, args: dict[str, Any]) -> dict[str, Any]:
    """Run a tool by name. Always returns a JSON-serializable dict."""
    handler: Callable | None = _HANDLERS.get(name)
    if handler is None:
        return {"error": f"Unknown tool: {name}"}
    try:
        return handler(db, user_id, args)
    except Exception as exc:  # never let a tool crash the agent loop
        return {"error": str(exc)}


def _t_search(db, user_id, args):
    items, total = search_properties(
        db,
        deal_type=_enum(args.get("deal_type"), DealType),
        type=_enum(args.get("type"), PropertyType),
        min_price=args.get("min_price"),
        max_price=args.get("max_price"),
        min_area=args.get("min_area"),
        rooms=args.get("rooms"),
        sort_by=args.get("sort_by"),
        order=args.get("order"),
        limit=min(int(args.get("limit", 5)), 20),
    )
    return {"total": total, "results": [_serialize_brief(p) for p in items]}


def _t_open_tour(db, user_id, args):
    from config import AI_APP_URL
    pid = int(args["property_id"])
    prop = get_property(db, pid)
    if not prop:
        return {"error": "Property not found"}
    return {"property_id": pid, "tour_url": f"{AI_APP_URL.rstrip('/')}/properties/{pid}/tour"}


def _t_show_on_map(db, user_id, args):
    from config import AI_APP_URL
    params = []
    for key in ("deal_type", "type", "max_price"):
        if args.get(key) is not None:
            params.append(f"{key}={args[key]}")
    query = ("?" + "&".join(params)) if params else ""
    return {"map_url": f"{AI_APP_URL.rstrip('/')}/map{query}"}


def _t_compare(db, user_id, args):
    ids = [int(i) for i in args.get("property_ids", [])]
    props = [get_property(db, i) for i in ids]
    props = [p for p in props if p and p.status != PropertyStatus.deleted]
    if len(props) < 2:
        return {"error": "Need at least two valid properties to compare"}
    return {"properties": [_serialize_brief(p) for p in props]}


def _t_get_favorites(db, user_id, args):
    props = list_favorites(db, user_id)
    return {"favorites": [_serialize_brief(p) for p in props]}


def _t_add_favorite(db, user_id, args):
    pid = int(args["property_id"])
    prop = get_property(db, pid)
    if not prop:
        return {"error": "Property not found"}
    add_favorite(db, user_id, pid)
    return {"ok": True, "property_id": pid}


def _t_get_history(db, user_id, args):
    rows, total, props_map = list_history(db, user_id, limit=20)
    out = []
    for r in rows:
        p = props_map.get(r.property_id)
        if p:
            entry = _serialize_brief(p)
            entry["viewed_at"] = r.viewed_at.isoformat()
            out.append(entry)
    return {"total": total, "history": out}


def _t_delete_history(db, user_id, args):
    count = clear_history(db, user_id)
    return {"ok": True, "deleted": count}


def _t_set_tracker(db, user_id, args):
    pid = int(args["property_id"])
    prop = get_property(db, pid)
    if not prop:
        return {"error": "Property not found"}
    existing = (
        db.query(PriceTracker)
        .filter(PriceTracker.user_id == user_id, PriceTracker.property_id == pid)
        .first()
    )
    if existing:
        existing.target_price = args.get("target_price")
        existing.last_seen_price = prop.price
    else:
        db.add(
            PriceTracker(
                user_id=user_id,
                property_id=pid,
                target_price=args.get("target_price"),
                last_seen_price=prop.price,
            )
        )
    db.commit()
    return {"ok": True, "property_id": pid, "target_price": args.get("target_price")}


def _t_get_recommendations(db, user_id, args):
    props = load_recommended_properties(db, user_id, limit=5)
    return {"recommendations": [_serialize_brief(p) for p in props]}


_HANDLERS: dict[str, Callable] = {
    "search_properties": _t_search,
    "open_tour": _t_open_tour,
    "show_on_map": _t_show_on_map,
    "compare_properties": _t_compare,
    "get_favorites": _t_get_favorites,
    "add_to_favorites": _t_add_favorite,
    "get_viewing_history": _t_get_history,
    "delete_viewing_history": _t_delete_history,
    "set_price_tracker": _t_set_tracker,
    "get_recommendations": _t_get_recommendations,
}
