"""Admin: credit package CRUD (prices never hard-coded)."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ... import models, schemas
from ...db import get_db
from ...deps import get_client_ip, require_admin
from ...errors import not_found
from ...services.audit import audit

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/packages")
def list_packages(admin: models.User = Depends(require_admin),
                  db: Session = Depends(get_db)):
    rows = (db.query(models.CreditPackage)
              .order_by(models.CreditPackage.sort_order).all())
    return [{"id": p.id, "name": p.name, "credits": p.credits,
             "price_cents": p.price_cents, "currency": p.currency,
             "is_active": p.is_active, "sort_order": p.sort_order,
             "created_at": p.created_at} for p in rows]


@router.post("/packages", status_code=201)
def create_package(body: schemas.PackageUpsertIn, request: Request,
                   admin: models.User = Depends(require_admin),
                   db: Session = Depends(get_db)):
    p = models.CreditPackage(name=body.name, credits=body.credits,
                             price_cents=body.price_cents,
                             currency=body.currency.upper(),
                             is_active=body.is_active,
                             sort_order=body.sort_order)
    db.add(p)
    db.flush()
    audit(db, admin_id=admin.id, action="package.create",
          target_type="package", target_id=p.id,
          details=body.model_dump(), ip=get_client_ip(request))
    db.commit()
    return {"id": p.id}


@router.put("/packages/{package_id}")
def update_package(package_id: str, body: schemas.PackageUpsertIn,
                    request: Request,
                    admin: models.User = Depends(require_admin),
                    db: Session = Depends(get_db)):
    p = db.query(models.CreditPackage).filter(
        models.CreditPackage.id == package_id).first()
    if not p:
        raise not_found("Package not found.")
    before = {"name": p.name, "credits": p.credits, "price_cents": p.price_cents,
              "currency": p.currency, "is_active": p.is_active,
              "sort_order": p.sort_order}
    p.name, p.credits, p.price_cents = body.name, body.credits, body.price_cents
    p.currency, p.is_active, p.sort_order = (body.currency.upper(),
                                            body.is_active, body.sort_order)
    db.flush()
    audit(db, admin_id=admin.id, action="package.update",
          target_type="package", target_id=p.id,
          details={"before": before, "after": body.model_dump()},
          ip=get_client_ip(request))
    db.commit()
    return {"ok": True}
