"""WebSocket endpoint for realtime notifications.

Connect:  ws://host/ws?token=<JWT>

The server pushes events; the client never polls. Events include:
    notification:new, price:drop, booking:confirmed, complaint:decision, ...
"""
from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from config import SECRET_KEY, ALGORITHM
from models import SessionLocal, User, UserStatus
from modules.realtime.manager import manager


router = APIRouter(tags=["Realtime"])


def _authenticate(token: str | None) -> User | None:
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        if sub is None:
            return None
        user_id = int(sub)
    except (JWTError, ValueError):
        return None

    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user or user.status == UserStatus.banned:
            return None
        return user
    finally:
        db.close()


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    token = ws.query_params.get("token")
    user = _authenticate(token)
    if not user:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized")
        return

    await manager.connect(user.id, ws)
    await ws.send_json({"event": "connected", "data": {"user_id": user.id}})
    try:
        while True:
            # Client may send pings; we just echo a pong. No polling needed.
            msg = await ws.receive_json()
            if (msg or {}).get("event") == "ping":
                await ws.send_json({"event": "pong", "data": {}})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await manager.disconnect(user.id, ws)
