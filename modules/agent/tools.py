"""Tool definitions + executors for the global AI agent.

Each tool is described in OpenAI/OpenRouter function-calling format and backed by
a real executor that touches the database. The agent calls these to search,
open tours, manage favorites/history, compare, track prices and give advice.
"""
from __future__ import annotations

from typing import Any, Callable

from sqlalchemy.orm import Session

from datetime import date, datetime, timedelta

from models import (
    Property,
    PropertyStatus,
    DealType,
    PropertyType,
    PriceTracker,
    Booking,
    BookingStatus,
    PaymentStatus,
)
from modules.properties.crud import search_properties, get_property, cover_url, has_tour
from modules.favorites.crud import add_favorite, remove_favorite, clear_favorites, list_favorites
from modules.history.crud import list_history, clear_history
from modules.recommendations.crud import load_recommended_properties
from modules.messages.crud import get_or_create_conversation, add_message



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
            "description": "Add a property to the current user's favorites (save/like it).",
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
            "name": "remove_from_favorites",
            "description": (
                "Remove ONE property from the user's favorites (unsave/unlike). Use this when the "
                "user asks to remove/delete/unfavorite a specific listing. Do NOT call "
                "add_to_favorites for removal requests."
            ),
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
            "name": "clear_favorites",
            "description": "Remove ALL properties from the user's favorites at once. Only use when the user clearly asks to clear/empty their entire favorites list.",
            "parameters": {"type": "object", "properties": {}},
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
            "name": "remove_price_tracker",
            "description": "Stop tracking the price of a property. Use when the user asks to stop/remove price tracking for a listing.",
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
            "name": "get_recommendations",
            "description": "Get personalized property recommendations for the user.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "book_viewing",
            "description": (
                "Book a rental property for given dates (creates a real booking + payment "
                "checkout link). ONLY for rentals (deal_type='rent'). Dates must be ISO "
                "YYYY-MM-DD and in the future. If the user gives relative dates ('next "
                "weekend'), convert to concrete dates first."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "property_id": {"type": "integer"},
                    "start_date": {"type": "string", "description": "Check-in date, YYYY-MM-DD"},
                    "end_date": {"type": "string", "description": "Check-out date, YYYY-MM-DD"},
                },
                "required": ["property_id", "start_date", "end_date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "contact_seller",
            "description": (
                "Open a chat with the seller of a property and send the user's first message. "
                "Use when the user wants to contact/message the seller or ask the owner a "
                "question about a specific listing."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "property_id": {"type": "integer"},
                    "message": {"type": "string", "description": "The message to send the seller"},
                },
                "required": ["property_id"],
            },
        },
    },
]



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
    except Exception as exc:
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
    return {"total": total, "results": [_serialize_card(db, p) for p in items]}


def _t_open_tour(db, user_id, args):
    from config import AI_APP_URL
    pid = int(args["property_id"])
    prop = get_property(db, pid)
    if not prop:
        return {"error": "Property not found"}
    return {
        "property_id": pid,
        "tour_url": f"{AI_APP_URL.rstrip('/')}/properties/{pid}/tour",
        "property": _serialize_card(db, prop),
    }


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
    return {"properties": [_serialize_card(db, p) for p in props]}


def _t_get_favorites(db, user_id, args):
    props = list_favorites(db, user_id)
    return {"favorites": [_serialize_card(db, p) for p in props]}


def _t_add_favorite(db, user_id, args):
    pid = int(args["property_id"])
    prop = get_property(db, pid)
    if not prop:
        return {"error": "Property not found"}
    add_favorite(db, user_id, pid)
    return {"ok": True, "action": "added_favorite", "property_id": pid, "property": _serialize_card(db, prop)}


def _t_remove_favorite(db, user_id, args):
    pid = int(args["property_id"])
    prop = get_property(db, pid)
    if not prop:
        return {"error": "Property not found"}
    removed = remove_favorite(db, user_id, pid)
    if not removed:
        return {"ok": False, "action": "remove_favorite", "property_id": pid,
                "message": "That property was not in favorites."}
    return {"ok": True, "action": "removed_favorite", "property_id": pid, "property": _serialize_card(db, prop)}


def _t_clear_favorites(db, user_id, args):
    count = clear_favorites(db, user_id)
    return {"ok": True, "action": "cleared_favorites", "deleted": count}


def _t_get_history(db, user_id, args):
    rows, total, props_map = list_history(db, user_id, limit=20)
    out = []
    for r in rows:
        p = props_map.get(r.property_id)
        if p:
            entry = _serialize_card(db, p)
            entry["viewed_at"] = r.viewed_at.isoformat()
            out.append(entry)
    return {"total": total, "history": out}


def _t_delete_history(db, user_id, args):
    count = clear_history(db, user_id)
    return {"ok": True, "action": "cleared_history", "deleted": count}


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
    return {"ok": True, "action": "price_tracker_set", "property_id": pid, "target_price": args.get("target_price"), "property": _serialize_card(db, prop)}


def _t_remove_tracker(db, user_id, args):
    pid = int(args["property_id"])
    prop = get_property(db, pid)
    tracker = (
        db.query(PriceTracker)
        .filter(PriceTracker.user_id == user_id, PriceTracker.property_id == pid)
        .first()
    )
    if not tracker:
        return {"ok": False, "action": "remove_tracker", "property_id": pid,
                "message": "No price tracker was set for that property."}
    db.delete(tracker)
    db.commit()
    return {"ok": True, "action": "price_tracker_removed", "property_id": pid,
            "property": _serialize_card(db, prop) if prop else None}


def _t_get_recommendations(db, user_id, args):
    props = load_recommended_properties(db, user_id, limit=5)
    return {"recommendations": [_serialize_card(db, p) for p in props]}


def _parse_date(s):
    try:
        return date.fromisoformat(str(s)[:10])
    except (ValueError, TypeError):
        return None


def _t_book_viewing(db, user_id, args):
    from modules.payments.service import create_session, checkout_url
    pid = int(args["property_id"])
    prop = get_property(db, pid)
    if not prop or prop.status == PropertyStatus.deleted:
        return {"error": "Property not found"}
    if prop.deal_type != DealType.rent:
        return {"error": "This property is not for rent — booking is only for rentals."}
    start = _parse_date(args.get("start_date"))
    end = _parse_date(args.get("end_date"))
    if not start or not end:
        return {"error": "Provide start_date and end_date as YYYY-MM-DD."}
    if end <= start:
        return {"error": "end_date must be after start_date."}
    if start < date.today():
        return {"error": "start_date must be in the future."}
    rows = (
        db.query(Booking)
        .filter(Booking.property_id == pid, Booking.status != BookingStatus.cancelled)
        .all()
    )
    for b in rows:
        if start < b.end_date and b.start_date < end:
            return {"error": "Selected dates are not available."}
    nights = max((end - start).days, 1)
    total = round(prop.price * nights, 2)
    booking = Booking(
        property_id=pid, renter_id=user_id, start_date=start, end_date=end,
        total_price=total, status=BookingStatus.pending, payment_status=PaymentStatus.unpaid,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    session = create_session(db, booking)
    return {
        "ok": True, "action": "booked_viewing", "booking_id": booking.id,
        "nights": nights, "total_price": total,
        "checkout_url": checkout_url(session.token),
        "property": _serialize_card(db, prop),
    }


def _t_contact_seller(db, user_id, args):
    pid = int(args["property_id"])
    prop = get_property(db, pid)
    if not prop or prop.status == PropertyStatus.deleted:
        return {"error": "Property not found"}
    if prop.seller_id == user_id:
        return {"error": "This is your own listing."}
    convo = get_or_create_conversation(db, buyer_id=user_id, seller_id=prop.seller_id, property_id=pid)
    text = (args.get("message") or "").strip() or "Здравствуйте! Интересует ваш объект."
    add_message(db, convo, sender_id=user_id, text=text)
    return {
        "ok": True, "action": "contacted_seller", "conversation_id": convo.id,
        "sent_message": text, "property": _serialize_card(db, prop),
    }


_HANDLERS: dict[str, Callable] = {
    "search_properties": _t_search,
    "open_tour": _t_open_tour,
    "show_on_map": _t_show_on_map,
    "compare_properties": _t_compare,
    "get_favorites": _t_get_favorites,
    "add_to_favorites": _t_add_favorite,
    "remove_from_favorites": _t_remove_favorite,
    "clear_favorites": _t_clear_favorites,
    "get_viewing_history": _t_get_history,
    "delete_viewing_history": _t_delete_history,
    "set_price_tracker": _t_set_tracker,
    "remove_price_tracker": _t_remove_tracker,
    "get_recommendations": _t_get_recommendations,
    "book_viewing": _t_book_viewing,
    "contact_seller": _t_contact_seller,
}
