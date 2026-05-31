import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from models import get_db, User, AIConversation
from dependencies import get_current_user
from modules.ai.service import chat_with_tools, chat, is_configured, AIError
from modules.agent.tools import TOOLS, execute_tool


router = APIRouter(prefix="/agent", tags=["AI Agent"])

SYSTEM_PROMPT = (
    "You are the AI assistant of a real-estate marketplace. Help users find, compare and "
    "manage properties. Use the provided tools to search listings, open 360° tours, manage "
    "favorites and viewing history, set price trackers and give advice on neighborhoods, "
    "mortgages and market trends. Always base property facts on tool results, never invent "
    "listings. Be concise and helpful."
)

MAX_TOOL_ROUNDS = 5


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: int | None = None


class ChatResponse(BaseModel):
    conversation_id: int
    reply: str
    tool_calls: list[str] = []


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
    current_user: User = Depends(get_current_user),
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
    working: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    working.extend(history)
    working.append({"role": "user", "content": data.message})

    used_tools: list[str] = []

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
                working.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.get("id", name),
                        "name": name,
                        "content": json.dumps(result, ensure_ascii=False),
                    }
                )
        else:
            # Ran out of rounds: ask for a final plain summary.
            working.append({
                "role": "user",
                "content": "Summarize the result for me now, without calling more tools.",
            })
            final = chat(working)
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

    return ChatResponse(conversation_id=convo.id, reply=reply, tool_calls=used_tools)


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
