from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models import get_db, User, Property, PropertyStatus
from dependencies import get_current_user
from modules.properties.schemas import PropertyList
from modules.properties.router import serialize
from modules.favorites.crud import (
    add_favorite,
    remove_favorite,
    list_favorites,
    clear_favorites,
)


router = APIRouter(prefix="/favorites", tags=["Favorites"])


@router.get("", response_model=PropertyList)
def my_favorites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    props = list_favorites(db, current_user.id)
    return PropertyList(
        items=[serialize(db, p, current_user.id) for p in props],
        total=len(props),
    )


@router.post("/{property_id}", status_code=201)
def add(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop or prop.status == PropertyStatus.deleted:
        raise HTTPException(status_code=404, detail="Property not found")
    add_favorite(db, current_user.id, property_id)
    return {"detail": "Added to favorites"}


@router.delete("/{property_id}")
def remove(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not remove_favorite(db, current_user.id, property_id):
        raise HTTPException(status_code=404, detail="Not in favorites")
    return {"detail": "Removed from favorites"}


@router.delete("")
def clear_all(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = clear_favorites(db, current_user.id)
    return {"detail": "Favorites cleared", "removed": count}
