import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from models import get_db, User, AIConversation
from dependencies import get_current_user
from modules.ai.service import chat_with_tools, chat, is_configured, AIError
from modules.agent.tools import TOOLS, execute_tool
from modules.ratelimit.limiter import rate_limit


router = APIRouter(prefix="/agent", tags=["AI Agent"])

SYSTEM_PROMPT = (
    "You are Nestora's real-estate assistant. Your ONLY domain is this marketplace: "
    "finding, comparing, booking and managing property listings, plus practical advice on "
    "neighborhoods, mortgages, pricing and the buying/renting process.\n"
    "\n"
    "RULES:\n"
    "1. Stay strictly on real-estate. If asked about anything unrelated (coding, politics, "
    "general chit-chat, other products), briefly decline in one sentence and steer back to "
    "property search. Do not answer off-topic questions.\n"
    "2. Use the tools for every factual claim about listings, favorites, history or trackers. "
    "Never invent properties, prices, ids or features — if a tool returns nothing, say so.\n"
    "3. After tool results, give a clear, structured answer. CRITICAL: when a search/favorites/"
    "recommendations/history/compare tool returns listings, the UI renders them as clickable "
    "cards directly below your message. Your text MUST then be ONLY a brief confirmation line "
    "(e.g. 'Yes — here are houses under $800k, tap a card to open one.'). You MUST NOT describe "
    "the listings in text: no titles, no prices, no area/rooms, no addresses, no numbered or "
    "bulleted lists of properties, and never embed image markdown. The cards already show every "
    "detail. If a tool returns nothing, say so plainly.\n"
    "4. Be substantive but tight — no filler, no repetition, no hedging. Prefer short paragraphs "
    "or compact bullet lists. Aim for 2-6 sentences unless the user asks for more detail.\n"
    "5. When the user's request is ambiguous, make a reasonable assumption and proceed, noting "
    "the assumption in one short clause rather than asking a question.\n"
    "6. Be honest about limits: if data is missing or you are unsure, say it plainly instead "
    "of guessing.\n"
    "7. NEVER invent a price filter. For 'cheapest', 'most affordable', 'budget' requests, call "
    "search_properties with sort_by='price', order='asc' and NO max_price. For 'most expensive', "
    "'premium', 'biggest', use order='desc' (and sort_by='area' for size). Only pass min_price/"
    "max_price when the user states an explicit number.\n"
    "8. Pick the EXACT tool for the action and never substitute. To save/like → add_to_favorites. "
    "To remove/unsave/unlike ONE listing → remove_from_favorites (NEVER add_to_favorites). To "
    "empty the whole favorites list → clear_favorites. To start price tracking → set_price_tracker; "
    "to stop it → remove_price_tracker. Only call delete_viewing_history when the user explicitly "
    "asks to clear their VIEWING HISTORY — never as a side effect of a favorites or tracker "
    "request. Call only the single tool the user asked for; do not chain unrelated tools."
)

MAX_TOOL_ROUNDS = 5


def _build_ui_results(tool_results: list[dict]) -> list[dict]:
    """Flatten raw tool outputs into UI blocks the chat widget can render
    (clickable listing cards, action confirmations, links). The text reply
    still comes from the model; these blocks make actions tangible."""
    blocks: list[dict] = []
    for tr in tool_results:
        tool = tr.get("tool")
        res = tr.get("result") or {}
        if not isinstance(res, dict) or res.get("error"):
            continue

        if tool in ("search_properties",) and res.get("results"):
            blocks.append({"kind": "listings", "items": res["results"]})
        elif tool == "get_favorites" and res.get("favorites"):
            blocks.append({"kind": "listings", "items": res["favorites"]})
        elif tool == "get_recommendations" and res.get("recommendations"):
            blocks.append({"kind": "listings", "items": res["recommendations"]})
        elif tool == "get_viewing_history" and res.get("history"):
            blocks.append({"kind": "listings", "items": res["history"]})
        elif tool == "compare_properties" and res.get("properties"):
            blocks.append({"kind": "listings", "items": res["properties"]})
        elif tool == "add_to_favorites" and res.get("ok"):
            blocks.append({
                "kind": "action", "icon": "heart", "status": "ok",
                "label_en": "Added to favorites", "label_ru": "Добавлено в избранное",
                "property": res.get("property"),
            })
        elif tool == "remove_from_favorites" and res.get("ok"):
            blocks.append({
                "kind": "action", "icon": "heart-outline", "status": "ok",
                "label_en": "Removed from favorites", "label_ru": "Удалено из избранного",
                "property": res.get("property"),
            })
        elif tool == "clear_favorites" and res.get("ok"):
            blocks.append({
                "kind": "action", "icon": "trash", "status": "ok",
                "label_en": f"Favorites cleared ({res.get('deleted', 0)})",
                "label_ru": f"Избранное очищено ({res.get('deleted', 0)})",
            })
        elif tool == "set_price_tracker" and res.get("ok"):
            blocks.append({
                "kind": "action", "icon": "trending-down", "status": "ok",
                "label_en": "Price tracking on", "label_ru": "Отслеживание цены включено",
                "property": res.get("property"),
            })
        elif tool == "remove_price_tracker" and res.get("ok"):
            blocks.append({
                "kind": "action", "icon": "trending-down", "status": "ok",
                "label_en": "Price tracking off", "label_ru": "Отслеживание цены выключено",
                "property": res.get("property"),
            })
        elif tool == "delete_viewing_history" and res.get("ok"):
            blocks.append({
                "kind": "action", "icon": "trash", "status": "ok",
                "label_en": f"Viewing history cleared ({res.get('deleted', 0)})",
                "label_ru": f"История просмотров очищена ({res.get('deleted', 0)})",
            })
        elif tool == "open_tour" and res.get("tour_url"):
            prop = res.get("property") or {}
            blocks.append({
                "kind": "link", "icon": "globe",
                "path": f"/properties/{res.get('property_id')}/tour",
                "label_en": "Open 360° tour", "label_ru": "Открыть 360° тур",
                "property": prop,
            })
        elif tool == "show_on_map" and res.get("map_url"):
            blocks.append({
                "kind": "link", "icon": "map", "path": "/map",
                "label_en": "Show on map", "label_ru": "Показать на карте",
            })
    return blocks


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: int | None = None
    lang: str = "en"


class ChatResponse(BaseModel):
    conversation_id: int
    reply: str
    tool_calls: list[str] = []
    results: list[dict] = []


class ConversationOut(BaseModel):
    id: int
    messages: list
    created_at: datetime

    class Config:
        from_attributes = True


def _get_or_create_conversation(db: Session, user_id: int, conversation_id: int | None) -> AIConversation:
    if conversation_id is not None:
        convo = (
            db.query(AIConversation)
            .filter(AIConversation.id == conversation_id, AIConversation.user_id == user_id)
            .first()
        )
        if not convo:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return convo
    convo = AIConversation(user_id=user_id, messages=[])
    db.add(convo)
    db.commit()
    db.refresh(convo)
    return convo


@router.post("/chat", response_model=ChatResponse)
def agent_chat(
    data: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(rate_limit("agent")),
):
    """Talk to the AI agent. Runs a function-calling loop against real tools."""
    if not is_configured():
        raise HTTPException(
            status_code=503,
            detail="AI is not configured. Set AI_API_KEY (OpenRouter) in the environment.",
        )

    convo = _get_or_create_conversation(db, current_user.id, data.conversation_id)

    # Rebuild the working transcript: system + stored history + new user turn.
    history = list(convo.messages or [])
    lang = "ru" if str(data.lang).lower().startswith("ru") else "en"
    if lang == "ru":
        lang_instr = (
            "\n\nЯЗЫК ОТВЕТА: отвечай пользователю ТОЛЬКО на русском языке, при любых обстоятельствах, "
            "даже если предыдущие сообщения или данные на английском. Все твои ответы — на русском."
        )
    else:
        lang_instr = (
            "\n\nRESPONSE LANGUAGE: reply to the user ONLY in English under all circumstances, "
            "even if earlier messages or data are in another language."
        )
    working: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT + lang_instr}]
    working.extend(history)
    working.append({"role": "user", "content": data.message})
    # Reinforce language right before generation (strongest position).
    working.append({"role": "system", "content": (
        "Отвечай на русском языке." if lang == "ru" else "Respond in English."
    )})

    used_tools: list[str] = []
    tool_results: list[dict] = []

    try:
        for _ in range(MAX_TOOL_ROUNDS):
            assistant_msg = chat_with_tools(working, TOOLS)
            working.append(assistant_msg)

            tool_calls = assistant_msg.get("tool_calls") or []
            if not tool_calls:
                break

            for call in tool_calls:
                fn = call.get("function", {})
                name = fn.get("name", "")
                used_tools.append(name)
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                except ValueError:
                    args = {}
                result = execute_tool(db, current_user.id, name, args)
                tool_results.append({"tool": name, "result": result})
                working.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.get("id", name),
                        "name": name,
                        "content": json.dumps(result, ensure_ascii=False),
                    }
                )
        else:
            # Ran out of rounds: ask for a final plain answer (no more tools).
            working.append({
                "role": "user",
                "content": (
                    "Now give your final answer based on the tool results so far, without "
                    "calling more tools. Be concise and specific; reference listings by id."
                ),
            })
            final = chat(working, timeout=30.0)
            working.append({"role": "assistant", "content": final})
    except AIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    reply = ""
    for msg in reversed(working):
        if msg.get("role") == "assistant" and msg.get("content"):
            content = msg["content"]
            reply = content if isinstance(content, str) else json.dumps(content)
            break

    # Persist the conversation (exclude the system prompt).
    convo.messages = [m for m in working if m.get("role") != "system"]
    db.commit()
    db.refresh(convo)

    return ChatResponse(
        conversation_id=convo.id,
        reply=reply,
        tool_calls=used_tools,
        results=_build_ui_results(tool_results),
    )


@router.get("/conversations", response_model=list[ConversationOut])
def my_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(AIConversation)
        .filter(AIConversation.user_id == current_user.id)
        .order_by(AIConversation.updated_at.desc())
        .all()
    )
    return [ConversationOut.model_validate(r) for r in rows]


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    convo = (
        db.query(AIConversation)
        .filter(AIConversation.id == conversation_id, AIConversation.user_id == current_user.id)
        .first()
    )
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    db.delete(convo)
    db.commit()
    return {"detail": "Conversation deleted"}
