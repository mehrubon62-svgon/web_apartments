from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import get_db, User
from dependencies import get_current_user
from modules.properties.schemas import PropertyList, PropertyOut
from modules.properties.router import serialize
from modules.recommendations.crud import (
    load_recommended_properties,
    compute_recommendations,
    ai_rerank,
)


router = APIRouter(prefix="/recommendations", tags=["Recommendations"])


@router.get("", response_model=PropertyList)
def my_recommendations(
    limit: int = Query(10, le=30),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Personalized suggestions based on viewing history + favorites.

    Fast path: content-based algorithm (+ Redis cache from the Celery task).
    """
    props = load_recommended_properties(db, current_user.id, limit)
    return PropertyList(
        items=[serialize(db, p, current_user.id) for p in props],
        total=len(props),
    )


class AIRecommendationItem(BaseModel):
    property: PropertyOut
    reason: str | None = None


class AIRecommendationList(BaseModel):
    items: list[AIRecommendationItem]
    total: int
    ai_used: bool


@router.get("/ai", response_model=AIRecommendationList)
def ai_recommendations(
    limit: int = Query(10, le=30),
    query: str | None = Query(None, description="Optional natural-language hint, e.g. 'best for a family with kids'"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Hybrid recommendations.

    The content-based algorithm selects candidates, then a reasoning LLM
    (DeepSeek via OpenRouter) re-ranks them and explains each pick. Falls back
    to the pure algorithm order if AI is unavailable.
    """
    # Pull a slightly larger candidate set so the LLM has room to reorder.
    candidate_ids = compute_recommendations(db, current_user.id, limit=max(limit * 2, 10))
    rerank = ai_rerank(db, current_user.id, candidate_ids, query=query)

    ai_used = rerank is not None
    if rerank:
        ordered_ids = rerank["order"][:limit]
        explanations = rerank["explanations"]
    else:
        ordered_ids = candidate_ids[:limit]
        explanations = {}

    from modules.properties.crud import get_property

    items = []
    for pid in ordered_ids:
        prop = get_property(db, pid)
        if not prop:
            continue
        items.append(
            AIRecommendationItem(
                property=serialize(db, prop, current_user.id),
                reason=explanations.get(pid),
            )
        )
    return AIRecommendationList(items=items, total=len(items), ai_used=ai_used)
