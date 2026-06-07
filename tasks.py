"""Celery tasks.

    process_spatial_qa    - vision answer for a selected zone
    update_recommendations- recompute + cache a user's recommendations
    track_price_changes   - notify trackers when a price drops
    moderate_seller       - AI moderation when complaints reach the threshold
    send_notification     - universal notification dispatcher

All tasks open their own DB session and never assume a request context.
"""
from __future__ import annotations

import base64
import json
from pathlib import Path

from celery_app import celery
from config import MEDIA_DIR
from models import (
    SessionLocal,
    SpatialQA,
    Property,
    PriceTracker,
    Complaint,
    User,
    UserStatus,
    ModerationRecord,
    ModerationDecision,
    NotificationType,
)
from modules.ai.service import ask_with_image, chat, is_configured, AIError
from modules.notifications.crud import create_notification
from modules.recommendations.crud import compute_recommendations, cache_recommendations
from modules.realtime.manager import publish_event_sync
from modules.email.service import send_email, code_email


def _read_image_b64(image_url: str | None) -> str | None:
    if not image_url:
        return None
    name = image_url.rsplit("/", 1)[-1]
    path = Path(MEDIA_DIR) / name
    if not path.exists():
        return None
    return base64.b64encode(path.read_bytes()).decode("ascii")


@celery.task(name="tasks.process_spatial_qa", bind=True, max_retries=2)
def process_spatial_qa(self, qa_id: int) -> dict:
    """Send the selected zone screenshot + question to the AI and save the answer."""
    db = SessionLocal()
    try:
        qa = db.query(SpatialQA).filter(SpatialQA.id == qa_id).first()
        if not qa:
            return {"error": "qa not found"}
        prop = db.query(Property).filter(Property.id == qa.property_id).first()
        metadata = {
            "title": prop.title if prop else None,
            "type": prop.type.value if prop else None,
            "area": prop.area if prop else None,
            "price": prop.price if prop else None,
            "room_id": qa.room_id,
            "zone": qa.zone_coords,
        }
        try:
            if not is_configured():
                raise AIError("AI not configured")
            lang = "ru" if any("\u0400" <= ch <= "\u04FF" for ch in (qa.question or "")) else "en"
            lang_name = "Russian" if lang == "ru" else "English"
            image_b64 = _read_image_b64(qa.image_url)
            if image_b64:
                answer = ask_with_image(image_b64, qa.question, metadata, lang=lang)
            else:
                answer = chat(
                    [
                        {
                            "role": "system",
                            "content": (
                                "You are a property surveyor answering about a specific zone of a "
                                "listing. No photo is available, so answer from the metadata and "
                                "general domain knowledge, and clearly note that no image was "
                                f"provided. Reply in {lang_name}, 2-4 sentences, specific, no filler."
                            ),
                        },
                        {"role": "user", "content": f"Property: {json.dumps(metadata, ensure_ascii=False)}\nQuestion: {qa.question}"},
                    ],
                    max_tokens=400,
                    timeout=25.0,
                )
            qa.answer = answer or "No answer produced."
            qa.status = "done"
        except AIError as exc:
            qa.answer = None
            qa.status = "error"
            db.commit()
            publish_event_sync(qa.user_id, "spatial_qa:error", {"id": qa.id, "error": str(exc)})
            return {"error": str(exc)}

        db.commit()
        publish_event_sync(
            qa.user_id,
            "spatial_qa:done",
            {"id": qa.id, "property_id": qa.property_id, "answer": qa.answer},
        )
        return {"ok": True, "qa_id": qa.id}
    finally:
        db.close()


@celery.task(name="tasks.update_recommendations")
def update_recommendations(user_id: int) -> dict:
    db = SessionLocal()
    try:
        ids = compute_recommendations(db, user_id, limit=10)
        cache_recommendations(user_id, ids)
        publish_event_sync(user_id, "recommendations:updated", {"count": len(ids)})
        return {"ok": True, "count": len(ids)}
    finally:
        db.close()


@celery.task(name="tasks.track_price_changes")
def track_price_changes(property_id: int | None = None) -> dict:
    """Check trackers. If called with a property_id, check just that one;
    otherwise (beat schedule) scan all trackers."""
    db = SessionLocal()
    try:
        q = db.query(PriceTracker)
        if property_id is not None:
            q = q.filter(PriceTracker.property_id == property_id)
        trackers = q.all()

        notified = 0
        for tracker in trackers:
            prop = db.query(Property).filter(Property.id == tracker.property_id).first()
            if not prop:
                continue
            current = prop.price
            previous = tracker.last_seen_price if tracker.last_seen_price is not None else current

            dropped = current < previous
            hit_target = tracker.target_price is not None and current <= tracker.target_price

            if dropped or hit_target:
                create_notification(
                    db,
                    user_id=tracker.user_id,
                    type=NotificationType.price_drop,
                    content={
                        "title": "Price drop",
                        "body": f"'{prop.title}' is now {current} (was {previous}).",
                        "property_id": prop.id,
                        "old_price": previous,
                        "new_price": current,
                    },
                )
                notified += 1

            tracker.last_seen_price = current
            db.commit()
        return {"ok": True, "notified": notified, "checked": len(trackers)}
    finally:
        db.close()


@celery.task(name="tasks.moderate_seller")
def moderate_seller(seller_id: int) -> dict:
    """Send all complaints about a seller to the AI and apply its decision."""
    db = SessionLocal()
    try:
        seller = db.query(User).filter(User.id == seller_id).first()
        if not seller:
            return {"error": "seller not found"}
        complaints = (
            db.query(Complaint)
            .filter(Complaint.seller_id == seller_id)
            .order_by(Complaint.created_at.asc())
            .all()
        )
        complaint_texts = [c.reason for c in complaints]

        decision = ModerationDecision.warning
        reasoning = "Default decision."

        if is_configured():
            prompt = (
                "You are a content-moderation system for a real-estate marketplace. "
                "Given the complaints below about one seller, decide ONE outcome and reply "
                "with strict JSON: {\"decision\": \"unfounded|warning|ban\", \"reasoning\": \"...\"}. "
                "Use 'ban' only for severe/repeated fraud or abuse.\n\nComplaints:\n"
                + "\n".join(f"- {t}" for t in complaint_texts)
            )
            try:
                raw = chat([{"role": "user", "content": prompt}], temperature=0.0)
                parsed = _parse_decision(raw)
                decision = parsed["decision"]
                reasoning = parsed["reasoning"]
            except AIError as exc:
                reasoning = f"AI unavailable, defaulted to warning. ({exc})"
        else:
            reasoning = "AI not configured; defaulted to warning."

        if decision == ModerationDecision.ban:
            seller.status = UserStatus.banned
            notif_type = NotificationType.ban
        elif decision == ModerationDecision.warning:
            seller.status = UserStatus.warned
            notif_type = NotificationType.warning
        else:
            seller.status = UserStatus.active
            notif_type = NotificationType.complaint_decision

        record = ModerationRecord(
            seller_id=seller_id,
            decision=decision,
            ai_reasoning=reasoning,
            overridden_by_admin=False,
        )
        db.add(record)
        db.commit()

        create_notification(
            db,
            user_id=seller_id,
            type=notif_type,
            content={
                "title": f"Moderation decision: {decision.value}",
                "body": reasoning,
                "decision": decision.value,
            },
        )
        return {"ok": True, "decision": decision.value}
    finally:
        db.close()


def _parse_decision(raw: str) -> dict:
    decision = ModerationDecision.warning
    reasoning = raw.strip()
    try:
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1:
            obj = json.loads(raw[start : end + 1])
            value = (obj.get("decision") or "").lower()
            if value in {d.value for d in ModerationDecision}:
                decision = ModerationDecision(value)
            reasoning = obj.get("reasoning") or reasoning
    except (ValueError, KeyError):
        pass
    return {"decision": decision, "reasoning": reasoning}


@celery.task(name="tasks.send_notification")
def send_notification(user_id: int, type: str, content: dict) -> dict:
    """Universal notification dispatcher (persist + realtime push)."""
    db = SessionLocal()
    try:
        try:
            ntype = NotificationType(type)
        except ValueError:
            ntype = NotificationType.recommendation
        create_notification(db, user_id=user_id, type=ntype, content=content)
        return {"ok": True}
    finally:
        db.close()


@celery.task(name="tasks.send_email_code", bind=True, max_retries=3, default_retry_delay=10)
def send_email_code(self, email: str, code: str, purpose: str) -> dict:
    """Email a verification code (the 'рассылка' runs through Celery)."""
    from config import EMAIL_CODE_TTL_MIN

    subject, text, html = code_email(code, purpose, EMAIL_CODE_TTL_MIN)
    ok = send_email(email, subject, text, html)
    if not ok:
        try:
            raise self.retry(exc=RuntimeError("email send failed"))
        except self.MaxRetriesExceededError:
            return {"ok": False, "email": email}
    return {"ok": True, "email": email}
