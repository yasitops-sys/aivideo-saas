"""Seed: roles, super-admin, packages, AI models, default settings.
Idempotent — safe to run multiple times. Run: python -m app.seed"""
import json

from . import models
from .ai_providers.registry import register_builtin_providers, registry
from .config import get_settings
from .db import Base, SessionLocal, engine, utcnow
from .security import hash_password
from .services.settings import DEFAULTS

settings = get_settings()


def seed():
    Base.metadata.create_all(bind=engine)
    register_builtin_providers()
    db = SessionLocal()
    try:
        # roles
        for name, desc in [("customer", "Pays for and generates videos"),
                           ("admin", "Manages users, credits, content"),
                           ("super_admin", "Full control incl. secrets")]:
            if not db.query(models.Role).filter(models.Role.name == name).first():
                db.add(models.Role(name=name, description=desc))
        db.flush()
        roles = {r.name: r.id for r in db.query(models.Role).all()}

        # super-admin from env
        email = settings.ADMIN_EMAIL.lower().strip()
        if not db.query(models.User).filter(models.User.email == email).first():
            db.add(models.User(
                email=email, password_hash=hash_password(settings.ADMIN_PASSWORD),
                full_name=settings.ADMIN_NAME, role_id=roles["super_admin"],
                email_verified=True))
            print(f"Created super-admin: {email}")

        # credit packages
        defaults = [
            ("Starter", 100, 900, "USD", True, 1),
            ("Creator", 500, 3900, "USD", True, 2),
            ("Pro", 1500, 9900, "USD", True, 3),
            ("Business", 5000, 29000, "USD", True, 4),
        ]
        for name, credits_, price, curr, active, sort in defaults:
            if not db.query(models.CreditPackage).filter(
                    models.CreditPackage.name == name).first():
                db.add(models.CreditPackage(
                    name=name, credits=credits_, price_cents=price,
                    currency=curr, is_active=active, sort_order=sort))

        # AI models
        model_defaults = [
            ("CineFast T2V", "mock", "cinefast-t2v-v1", "text_to_video", 10,
             [5, 10], ["16:9", "9:16", "1:1"], True),
            ("CineFast I2V", "mock", "cinefast-i2v-v1", "image_to_video", 15,
             [5, 10], ["16:9", "9:16", "1:1"], True),
            ("VisionPro T2V", "replicate", "owner/visionpro:version",
             "text_to_video", 25, [5], ["16:9", "9:16"], False),
            ("Veo 3.1 Fast", "google_veo", "veo-3.1-fast-generate-preview",
             "text_to_video", 80, [4, 6, 8], ["16:9", "9:16"], True),
            ("Omni Flash", "google_veo", "gemini-omni-flash-preview",
             "text_to_video", 100, [4, 6, 8, 10], ["16:9", "9:16"], True),
        ]
        for name, provider, mid, gtype, cost, durs, ratios, enabled in model_defaults:
            if provider not in registry.names():
                print(f"  (skipping {name}: provider '{provider}' not registered)")
                continue
            if not db.query(models.AIModel).filter(models.AIModel.name == name).first():
                db.add(models.AIModel(
                    name=name, provider=provider, model_id=mid,
                    generation_type=gtype, credit_cost=cost,
                    durations_json=json.dumps(durs),
                    aspect_ratios_json=json.dumps(ratios), is_enabled=enabled))

        # settings defaults
        for key, value in DEFAULTS.items():
            if not db.query(models.SystemSetting).filter(
                    models.SystemSetting.key == key).first():
                db.add(models.SystemSetting(key=key, value_json=json.dumps(value)))

        db.commit()
        print("Seed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
