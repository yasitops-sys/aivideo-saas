"""Credits, payments webhook idempotency, generation reserve/charge/refund,
admin credit adjustments, RBAC separation."""
import json
import uuid

from tests.conftest import (auth_client, csrf_headers, get_model, login, make_user,
                      register, stripe_header)

from app import models
from app.db import SessionLocal
from app.services import credits as credit_service
from app.worker.worker import process_job


def _admin_client(app):
    from fastapi.testclient import TestClient
    c = TestClient(app, raise_server_exceptions=False)
    login(c, "admin@example.com", "AdminPass123!")
    return c


# --- webhook: verified payment grants credits ---------------------------------
def _payment_for(db, user_email, package_name="Starter"):
    user = db.query(models.User).filter(models.User.email == user_email).first()
    pkg = db.query(models.CreditPackage).filter(
        models.CreditPackage.name == package_name).first()
    p = models.Payment(user_id=user.id, package_id=pkg.id,
                       amount_cents=pkg.price_cents, currency=pkg.currency,
                       status="pending", provider="stripe",
                       provider_session_id=f"cs_test_{uuid.uuid4().hex[:12]}",
                       idempotency_key=uuid.uuid4().hex)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _webhook(client, event_id, session_id, payment_id, status="completed"):
    if status == "completed":
        etype, obj = "checkout.session.completed", {
            "id": session_id, "payment_intent": f"pi_{uuid.uuid4().hex[:12]}",
            "metadata": {"payment_id": payment_id}}
    else:
        etype, obj = "payment_intent.payment_failed", {"id": f"pi_{uuid.uuid4().hex[:12]}"}
    payload = json.dumps({"id": event_id, "type": etype,
                          "data": {"object": obj}}).encode()
    return client.post("/api/payments/webhook", content=payload,
                       headers={"stripe-signature": stripe_header(payload),
                                "content-type": "application/json"})


def test_webhook_grants_credits_once(app, db):
    from fastapi.testclient import TestClient
    c = TestClient(app, raise_server_exceptions=False)
    register(c, "buyer@example.com")
    login(c, "buyer@example.com")
    p = _payment_for(db, "buyer@example.com")

    r = _webhook(c, "evt_test_001", p.provider_session_id, p.id)
    assert r.status_code == 200, r.text

    db.expire_all()
    u = db.query(models.User).filter(models.User.email == "buyer@example.com").first()
    assert u.credit_balance == 100  # Starter package
    assert u.total_credits_purchased == 100
    txs = db.query(models.CreditTransaction).filter(
        models.CreditTransaction.user_id == u.id).all()
    assert len(txs) == 1 and txs[0].transaction_type == "purchase"
    assert txs[0].balance_before == 0 and txs[0].balance_after == 100

    # DUPLICATE delivery of the same event -> no double credit
    r2 = _webhook(c, "evt_test_001", p.provider_session_id, p.id)
    assert r2.status_code == 200 and r2.json().get("duplicate") is True
    db.expire_all()
    u = db.query(models.User).filter(models.User.email == "buyer@example.com").first()
    assert u.credit_balance == 100
    assert db.query(models.CreditTransaction).filter(
        models.CreditTransaction.user_id == u.id).count() == 1


def test_webhook_bad_signature_rejected(app):
    from fastapi.testclient import TestClient
    c = TestClient(app, raise_server_exceptions=False)
    payload = json.dumps({"id": "evt_x", "type": "checkout.session.completed",
                          "data": {"object": {}}}).encode()
    r = c.post("/api/payments/webhook", content=payload,
               headers={"stripe-signature": "t=1,v1=bad",
                        "content-type": "application/json"})
    assert r.status_code == 400


def test_webhook_failed_payment_marks_failed(app, db):
    from fastapi.testclient import TestClient
    c = TestClient(app, raise_server_exceptions=False)
    register(c, "failbuyer@example.com")
    p = _payment_for(db, "failbuyer@example.com")
    pi = f"pi_{uuid.uuid4().hex[:12]}"
    p.payment_id = pi
    db.commit()
    payload = json.dumps({"id": "evt_fail_1", "type": "payment_intent.payment_failed",
                          "data": {"object": {"id": pi}}}).encode()
    r = c.post("/api/payments/webhook", content=payload,
               headers={"stripe-signature": stripe_header(payload),
                        "content-type": "application/json"})
    assert r.status_code == 200
    db.expire_all()
    assert db.query(models.Payment).filter(
        models.Payment.id == p.id).first().status == "failed"


# --- generation credit lifecycle ------------------------------------------------
def _make_generation(client, db, email, model_name="CineFast T2V"):
    m = get_model(db, model_name)
    r = client.post("/api/generations", headers=csrf_headers(client), data={
        "model_id": m.id, "prompt": "A robot dancing in the rain",
        "duration_seconds": "5", "aspect_ratio": "16:9"})
    assert r.status_code == 202, r.text
    return r.json()["id"], m


def test_generation_reserves_then_charges_on_success(app, db):
    from fastapi.testclient import TestClient
    c = TestClient(app, raise_server_exceptions=False)
    register(c, "gen1@example.com")
    login(c, "gen1@example.com")
    # fund via service (simulating verified webhook)
    u = db.query(models.User).filter(models.User.email == "gen1@example.com").first()
    credit_service.add_purchase(db, user_id=u.id, credits=100,
                                payment_id="pay_test", description="test")
    db.commit()

    gen_id, model = _make_generation(c, db, "gen1@example.com")
    db.expire_all()
    u = db.query(models.User).filter(models.User.email == "gen1@example.com").first()
    assert u.credit_balance == 100 - model.credit_cost
    reserve = db.query(models.CreditTransaction).filter(
        models.CreditTransaction.transaction_type == "generation_reserve").all()
    assert len(reserve) == 1 and reserve[0].amount == -model.credit_cost

    # run the worker synchronously (mock provider renders a real mp4)
    gen = db.query(models.VideoGeneration).filter(
        models.VideoGeneration.id == gen_id).first()
    gen.status = models.GEN_PROCESSING
    db.commit()
    process_job(db, gen)

    db.expire_all()
    gen = db.query(models.VideoGeneration).filter(
        models.VideoGeneration.id == gen_id).first()
    assert gen.status == "completed", gen.error_message
    assert gen.storage_key and gen.credits_charged == model.credit_cost
    charge = db.query(models.CreditTransaction).filter(
        models.CreditTransaction.transaction_type == "generation_charge").all()
    assert len(charge) == 1
    # video detail includes a signed URL
    r = c.get(f"/api/generations/{gen_id}")
    assert r.status_code == 200
    assert r.json()["video_url"].startswith("/api/files/")
    # notification created
    n = db.query(models.Notification).filter(
        models.Notification.user_id == u.id,
        models.Notification.type == "generation_completed").count()
    assert n == 1


def test_generation_insufficient_credits(app):
    from fastapi.testclient import TestClient
    c = TestClient(app, raise_server_exceptions=False)
    register(c, "poor@example.com")
    login(c, "poor@example.com")
    db = SessionLocal()
    m = get_model(db, "CineFast T2V")
    db.close()
    r = c.post("/api/generations", headers=csrf_headers(c), data={
        "model_id": m.id, "prompt": "test", "duration_seconds": "5",
        "aspect_ratio": "16:9"})
    assert r.status_code == 402
    assert r.json()["error"]["code"] == "insufficient_credits"


def test_failed_generation_refunds(app, db):
    from fastapi.testclient import TestClient
    c = TestClient(app, raise_server_exceptions=False)
    register(c, "refund@example.com")
    login(c, "refund@example.com")
    u = db.query(models.User).filter(models.User.email == "refund@example.com").first()
    credit_service.add_purchase(db, user_id=u.id, credits=100,
                                payment_id="pay_r", description="test")
    db.commit()
    gen_id, model = _make_generation(c, db, "refund@example.com")

    # sabotage the provider so it fails permanently
    from app.ai_providers import registry as reg_mod
    real = reg_mod.registry.get("mock")

    class Boom:
        name = "mock"
        def text_to_video(self, **kw): raise RuntimeError("provider down")
        def image_to_video(self, **kw): raise RuntimeError("provider down")
        def get_status(self, jid): raise RuntimeError("unreachable")

    reg_mod.registry._providers["mock"] = Boom()
    try:
        gen = db.query(models.VideoGeneration).filter(
            models.VideoGeneration.id == gen_id).first()
        gen.status = models.GEN_PROCESSING
        gen.retry_count = 99  # skip retries -> permanent failure path
        db.commit()
        process_job(db, gen)
    finally:
        reg_mod.registry._providers["mock"] = real

    db.expire_all()
    gen = db.query(models.VideoGeneration).filter(
        models.VideoGeneration.id == gen_id).first()
    assert gen.status == "refunded", gen.status
    u = db.query(models.User).filter(models.User.email == "refund@example.com").first()
    assert u.credit_balance == 100  # fully refunded
    refund = db.query(models.CreditTransaction).filter(
        models.CreditTransaction.transaction_type == "generation_refund").all()
    assert len(refund) == 1 and refund[0].amount == model.credit_cost
    n = db.query(models.Notification).filter(
        models.Notification.user_id == u.id,
        models.Notification.type == "generation_failed").count()
    assert n == 1


def test_upload_validation_rejects_non_image(app, db):
    from fastapi.testclient import TestClient
    c = TestClient(app, raise_server_exceptions=False)
    register(c, "upl@example.com")
    login(c, "upl@example.com")
    u = db.query(models.User).filter(models.User.email == "upl@example.com").first()
    credit_service.add_purchase(db, user_id=u.id, credits=100,
                                payment_id="pay_u", description="test")
    db.commit()
    m = get_model(db, "CineFast I2V")
    r = c.post("/api/generations", headers=csrf_headers(c), data={
        "model_id": m.id, "prompt": "animate this", "duration_seconds": "5",
        "aspect_ratio": "16:9"},
        files={"image": ("evil.exe", b"MZ\x90\x00evil-bytes", "image/png")})
    assert r.status_code == 422
    # balance untouched by the rejected upload
    db.expire_all()
    u = db.query(models.User).filter(models.User.email == "upl@example.com").first()
    assert u.credit_balance == 100


# --- admin: RBAC separation, credit adjust, audit --------------------------------
def test_customer_cannot_touch_admin_api(app):
    from fastapi.testclient import TestClient
    c = TestClient(app, raise_server_exceptions=False)
    register(c, "custx@example.com")
    login(c, "custx@example.com")
    h = csrf_headers(c)
    for method, path in [("GET", "/api/admin/dashboard"),
                         ("GET", "/api/admin/users"),
                         ("POST", "/api/admin/credits/adjust"),
                         ("GET", "/api/admin/audit-logs"),
                         ("GET", "/api/admin/settings")]:
        r = c.request(method, path, headers=h, json={})
        assert r.status_code == 403, (method, path, r.status_code)
        assert r.json()["error"]["code"] == "forbidden"


def test_admin_credit_adjust_with_audit(app, db):
    admin_c = _admin_client(app)
    u = make_user(db, "adj@example.com", balance=50)
    r = admin_c.post("/api/admin/credits/adjust", headers=csrf_headers(admin_c),
                     json={"user_id": u.id, "amount": 25,
                           "reason": "Goodwill credit for outage"})
    assert r.status_code == 200, r.text
    assert r.json()["balance"] == 75
    db.expire_all()
    tx = db.query(models.CreditTransaction).filter(
        models.CreditTransaction.transaction_type == "admin_adjust",
        models.CreditTransaction.user_id == u.id).first()
    assert tx and tx.amount == 25 and tx.balance_before == 50 and tx.balance_after == 75
    log = db.query(models.AdminAuditLog).filter(
        models.AdminAuditLog.action == "credits.adjust").order_by(
        models.AdminAuditLog.created_at.desc()).first()
    assert log and "Goodwill" in log.details_json

    # removing more than balance -> rejected, no negative balances
    r2 = admin_c.post("/api/admin/credits/adjust", headers=csrf_headers(admin_c),
                      json={"user_id": u.id, "amount": -1000,
                            "reason": "attempt overdraw"})
    assert r2.status_code == 422


def test_admin_user_suspend_and_reactivate(app, db):
    admin_c = _admin_client(app)
    u = make_user(db, "susp@example.com")
    h = csrf_headers(admin_c)
    r = admin_c.patch(f"/api/admin/users/{u.id}", headers=h, json={"is_active": False})
    assert r.status_code == 200 and r.json()["user"]["is_active"] is False
    # suspended user cannot log in
    from fastapi.testclient import TestClient
    c = TestClient(app, raise_server_exceptions=False)
    assert c.post("/api/auth/login", json={"email": "susp@example.com",
                                           "password": "Password123!"}).status_code == 401
    r2 = admin_c.patch(f"/api/admin/users/{u.id}", headers=h, json={"is_active": True})
    assert r2.json()["user"]["is_active"] is True


def test_unauthenticated_admin_api_rejected(app):
    from fastapi.testclient import TestClient
    c = TestClient(app, raise_server_exceptions=False)
    assert c.get("/api/admin/dashboard").status_code == 401
