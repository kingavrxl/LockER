import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.database import Base, get_db
from app.main import app
from app.models.driver import Driver, PaymentStatusEnum
from app.models.device import Device
from app.api.v1.endpoints.devices import resolve_target_device

# Base de données de test en mémoire isolée
test_engine = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)


async def override_get_db():
    async with TestingSessionLocal() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture(autouse=True)
async def setup_test_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_admin_routes_require_authentication():
    """Vérifie que les routes sensibles bloquent tout accès sans clé X-API-Key (401 Unauthorized)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Verrouillage manuel
        res_lock = await ac.post("/api/v1/block/1", json={"reason": "test"})
        assert res_lock.status_code == 401, f"Expected 401, got {res_lock.status_code}"

        # 2. Déverrouillage manuel
        res_unlock = await ac.post("/api/v1/unblock/1", json={"reason": "test"})
        assert res_unlock.status_code == 401, f"Expected 401, got {res_unlock.status_code}"

        # 3. Liste de la flotte
        res_devs = await ac.get("/api/v1/devices")
        assert res_devs.status_code == 401, f"Expected 401, got {res_devs.status_code}"

        # 4. Liste des chauffeurs
        res_drivers = await ac.get("/api/v1/drivers")
        assert res_drivers.status_code == 401, f"Expected 401, got {res_drivers.status_code}"

        # 5. Simulation de paiement
        res_sim = await ac.post("/api/v1/webhooks/simulate-payment", json={"driver_id": 1, "amount": 5000})
        assert res_sim.status_code == 401, f"Expected 401, got {res_sim.status_code}"

        # 6. Règles de paiement
        res_rules = await ac.post("/api/v1/rules", json={"due_date_str": "test", "amount_xof": 5000})
        assert res_rules.status_code == 401, f"Expected 401, got {res_rules.status_code}"

        # 7. Lockybee Chat
        res_chat = await ac.post("/api/v1/lockybee/chat", json={"message": "verrouille"})
        assert res_chat.status_code == 401, f"Expected 401, got {res_chat.status_code}"


@pytest.mark.asyncio
async def test_admin_routes_work_with_valid_key():
    """Vérifie qu'avec le header X-API-Key valide, l'administrateur a accès aux routes."""
    transport = ASGITransport(app=app)
    headers = {"X-API-Key": settings.ADMIN_SECRET_KEY}
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res_devs = await ac.get("/api/v1/devices", headers=headers)
        assert res_devs.status_code == 200

        res_drivers = await ac.get("/api/v1/drivers", headers=headers)
        assert res_drivers.status_code == 200


@pytest.mark.asyncio
async def test_webhook_stripe_rejects_missing_or_invalid_signature():
    """Vérifie qu'un faux appel webhook Stripe sans signature est immédiatement rejeté (400)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        fake_payload = {"type": "payment_intent.succeeded", "data": {"object": {"metadata": {"driver_id": 1}}}}
        res = await ac.post("/api/v1/webhooks/stripe", json=fake_payload)
        assert res.status_code == 400


@pytest.mark.asyncio
async def test_resolve_target_device_no_fallback_vulnerability():
    """Vérifie que la faille SEC-04 (fallback all_devs[0]) est formellement éliminée."""
    async with TestingSessionLocal() as session:
        # Création d'un premier appareil légitime
        driver = Driver(full_name="Chauffeur 1", phone_number="+2290197000000")
        session.add(driver)
        await session.flush()

        legit_device = Device(driver_id=driver.id, imei="352965710000001", serial_number="SN_LEGIT_001")
        session.add(legit_device)
        await session.commit()

        # Un attaquant envoie un IMEI totalement inconnu
        resolved = await resolve_target_device(session, imei="UNKNOWN_ATTACKER_IMEI")
        assert resolved is None, "CRITICAL: resolve_target_device ne doit JAMAIS retourner l'appareil d'un autre utilisateur par défaut!"
