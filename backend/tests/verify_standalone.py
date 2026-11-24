import os
import sys

print("[1] Script démarré", flush=True)

import asyncio
from app.core.config import settings
from app.core.auth import verify_admin_api_key

print("[2] Settings chargés. Admin key =", settings.ADMIN_SECRET_KEY, flush=True)

from app.models.driver import Driver
from app.models.device import Device
from app.models.payment import Payment
from app.models.audit_log import AuditLog
from app.models.payment_schedule import PaymentScheduleRule
from app.models.lockybee_memory import LockybeeMemory
from app.api.v1.endpoints.devices import resolve_target_device
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.database import Base

print("[3] Models chargés", flush=True)

test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False})
TestSession = async_sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)

async def run_tests():
    print("[4] Initialisation DB SQLite test...", flush=True)
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("[5] Tables créées avec succès !", flush=True)

    # Test 1 : SEC-04 elimination (Fallback)
    async with TestSession() as session:
        driver = Driver(full_name="Chauffeur 1", phone_number="+2290197000000")
        session.add(driver)
        await session.flush()
        dev = Device(driver_id=driver.id, imei="352965710000001", serial_number="SN_LEGIT_001")
        session.add(dev)
        await session.commit()

        # Requête avec un faux IMEI
        res = await resolve_target_device(session, imei="UNKNOWN_ATTACKER_IMEI")
        assert res is None, "CRITIQUE: Fallback encore actif !"
        print("  ✓ Test SEC-04 : Pas de fallback sur all_devs[0] (OK)", flush=True)

        # Requête avec le vrai IMEI
        res_real = await resolve_target_device(session, imei="352965710000001")
        assert res_real is not None, "Le vrai IMEI devrait être trouvé !"
        assert res_real.id == dev.id
        print("  ✓ Test résolution IMEI légitime : Correspondance exacte (OK)", flush=True)

    # Test 2 : Authentification
    from fastapi import HTTPException
    try:
        await verify_admin_api_key(x_api_key=None, authorization=None)
        assert False, "Devrait lever 401"
    except HTTPException as e:
        assert e.status_code == 401
        print("  ✓ Test vérification sans clé : 401 Unauthorized (OK)", flush=True)

    try:
        await verify_admin_api_key(x_api_key="FAUSSE_CLE", authorization=None)
        assert False, "Devrait lever 403"
    except HTTPException as e:
        assert e.status_code == 403
        print("  ✓ Test vérification mauvaise clé : 403 Forbidden (OK)", flush=True)

    valid = await verify_admin_api_key(x_api_key=settings.ADMIN_SECRET_KEY, authorization=None)
    assert valid == settings.ADMIN_SECRET_KEY
    print("  ✓ Test vérification clé valide : Autorisé (OK)", flush=True)

    print("\n[RESULTAT] Tous les tests unitaires fondamentaux sont validés à 100% !", flush=True)

if __name__ == "__main__":
    print("[3.8] Lancement de run_tests...", flush=True)
    asyncio.run(run_tests())
    print("[6] Fin de run_tests", flush=True)
