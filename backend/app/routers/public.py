"""Public (unauthenticated) endpoints: health, public settings."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..services.settings import get_public_settings

router = APIRouter(tags=["public"])


@router.get("/health")
def health():
    return {"ok": True}


@router.get("/settings/public")
def public_settings(db: Session = Depends(get_db)):
    return get_public_settings(db)
