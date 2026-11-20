import asyncio
import os
import sys

# Ajouter le chemin du backend au PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

# Utiliser SQLite en mémoire / local pour le test de validation
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_locker.db"
os.environ["SUPPORT_PHONE_NUMBER"] = "+2290191521518"

from app.main import app
from app.core.database import engine, Base, AsyncSessionLocal
from app.models.driver import Driver, PaymentStatusEnum
from app.models.device import Device
from app.services.lock_service import LockService
from sqlalchemy import select

async def main():
    print("1. Initialisation des tables SQLite...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("   [OK] Tables créées avec succès.")

    print("2. Insertion d'un conducteur de test...")
    async with AsyncSessionLocal() as session:
        test_driver = Driver(
            full_name="Bio Gado (Test)",
            phone_number="+2290191521518",
            vehicle_plate="RB-8891-Parakou",
            daily_rate_xof=5000,
            current_status=PaymentStatusEnum.UP_TO_DATE
        )
        session.add(test_driver)
        await session.commit()
        await session.refresh(test_driver)
        driver_id = test_driver.id
        print(f"   [OK] Conducteur créé avec ID: {driver_id}")

        test_device = Device(
            driver_id=driver_id,
            imei="352889110022334",
            model="Samsung Galaxy A34 5G",
            fcm_token="fake_fcm_token_device_owner_a34"
        )
        session.add(test_device)
        await session.commit()
        print("   [OK] Appareil Samsung A34 associé.")

    print("3. Test du verrouillage automatique (J+3 impayé)...")
    async with AsyncSessionLocal() as session:
        lock_res = await LockService.lock_driver_device(
            db=session,
            driver_id=driver_id,
            reason="Retard de paiement journalier > 3 jours",
            performed_by="TEST_RUNNER"
        )
        assert lock_res is True
        print("   [OK] Verrouillage exécuté avec succès.")

    print("4. Vérification de l'état du conducteur et de l'appareil...")
    async with AsyncSessionLocal() as session:
        res = await session.execute(select(Driver).where(Driver.id == driver_id))
        d = res.scalars().first()
        dev_res = await session.execute(select(Device).where(Device.driver_id == driver_id))
        dev = dev_res.scalars().first()
        assert d.current_status == PaymentStatusEnum.LOCKED
        assert dev.is_locked is True
        print(f"   [OK] Statut conducteur: {d.current_status.value}, Appareil verrouillé: {dev.is_locked}")

    print("5. Test du déverrouillage automatique (Paiement reçu)...")
    async with AsyncSessionLocal() as session:
        unlock_res = await LockService.unlock_driver_device(
            db=session,
            driver_id=driver_id,
            reason="Paiement 5000 XOF reçu via Mobile Money",
            performed_by="TEST_WEBHOOK"
        )
        assert unlock_res is True
        print("   [OK] Déverrouillage exécuté avec succès.")

    print("6. Vérification du rétablissement...")
    async with AsyncSessionLocal() as session:
        res = await session.execute(select(Driver).where(Driver.id == driver_id))
        d = res.scalars().first()
        dev_res = await session.execute(select(Device).where(Device.driver_id == driver_id))
        dev = dev_res.scalars().first()
        assert d.current_status == PaymentStatusEnum.UP_TO_DATE
        assert dev.is_locked is False
        print(f"   [OK] Statut conducteur: {d.current_status.value}, Appareil verrouillé: {dev.is_locked}")

    # Nettoyage
    await engine.dispose()
    if os.path.exists("./test_locker.db"):
        os.remove("./test_locker.db")
    print("\n🎉 TOUS LES TESTS DE VALIDATION BACKEND ONT RÉUSSI AVEC SUCCÈS (100%) !")

if __name__ == "__main__":
    asyncio.run(main())
