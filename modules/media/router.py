"""File upload.

The brief specifies Supabase Storage. To keep the project runnable for free and
offline, files are stored on local disk and served from /media-files. The upload
contract (returns a public URL) is identical, so swapping in Supabase Storage
later only touches this module.
"""
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from models import User
from dependencies import get_current_user
from config import MEDIA_DIR


ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
# Broader set for chat attachments (images + common documents)
ALLOWED_ATTACHMENT_TYPES = ALLOWED_IMAGE_TYPES | {
    "application/pdf",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
}
MAX_SIZE_MB = 30
MAX_ATTACHMENT_MB = 20

router = APIRouter(prefix="/media", tags=["Media"])


class UploadResponse(BaseModel):
    url: str
    filename: str
    content_type: str
    size: int


def ensure_media_dir() -> Path:
    path = Path(MEDIA_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


async def save_attachment(file: UploadFile) -> dict:
    """Save a chat attachment (image or common document). Returns metadata dict
    with the public url, original name, MIME type and size."""
    if file.content_type not in ALLOWED_ATTACHMENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")
    content = await file.read()
    size = len(content)
    if size > MAX_ATTACHMENT_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File exceeds {MAX_ATTACHMENT_MB} MB")

    media_dir = ensure_media_dir()
    ext = os.path.splitext(file.filename or "")[1].lower() or ""
    unique_name = f"{uuid.uuid4().hex}{ext}"
    with (media_dir / unique_name).open("wb") as f:
        f.write(content)

    return {
        "url": f"/media-files/{unique_name}",
        "name": file.filename or unique_name,
        "type": file.content_type,
        "size": size,
    }


async def save_upload(file: UploadFile) -> UploadResponse:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")
    content = await file.read()
    size = len(content)
    if size > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File exceeds {MAX_SIZE_MB} MB")

    media_dir = ensure_media_dir()
    ext = os.path.splitext(file.filename or "")[1].lower() or ""
    unique_name = f"{uuid.uuid4().hex}{ext}"
    with (media_dir / unique_name).open("wb") as f:
        f.write(content)

    return UploadResponse(
        url=f"/media-files/{unique_name}",
        filename=unique_name,
        content_type=file.content_type,
        size=size,
    )


@router.post("/upload", response_model=UploadResponse)
async def upload(
    file: UploadFile = File(...),
    _user: User = Depends(get_current_user),
):
    """Upload a single image (photo or 360° panorama). Returns its public URL."""
    return await save_upload(file)
