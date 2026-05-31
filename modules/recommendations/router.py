from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from models import get_db, User
from dependencies import get_current_user
from modules.properties.schemas import PropertyList
from modules.properties.router import serialize
from modules.recommendations.crud import load_recommended_properties


router = APIRouter(prefix="/recommendations", tags=["Recommendations"])


@router.get("", response_model=PropertyList)
def my_recommendations(
    limit: int = Query(10, le=30),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Personalized suggestions based on viewing history + favorites."""
    props = load_recommended_properties(db, current_user.id, limit)
    return PropertyList(
        items=[serialize(db, p, current_user.id) for p in props],
        total=len(props),
    )
