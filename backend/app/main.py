import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine, Base
from app.api.v1.endpoints import drivers, devices, lock, webhooks

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("LockER")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Démarrage de LockER Backend API...")
    # Création des tables automatiques au lancement
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Tables de la base de données initialisées avec succès.")

        # Peuplement initial si la base est vide
        from app.core.database import AsyncSessionLocal
        from app.models.driver import Driver, PaymentStatusEnum
        from app.models.device import Device
        from sqlalchemy import select

        async with AsyncSessionLocal() as session:
            res = await session.execute(select(Driver))
            if not res.scalars().first():
                logger.info("Initialisation des 5 conducteurs de flotte au Bénin...")
                demo_drivers = [
                    Driver(id=1, full_name="Koffi Mensah", phone_number="+229 97 12 34 56", vehicle_plate="RB-4512-Cotonou", daily_rate_xof=5000, current_status=PaymentStatusEnum.UP_TO_DATE, consecutive_overdue_days=0),
                    Driver(id=2, full_name="Bio Gado", phone_number="+229 96 44 21 00", vehicle_plate="RB-8891-Parakou", daily_rate_xof=5000, current_status=PaymentStatusEnum.OVERDUE_1, consecutive_overdue_days=1),
                    Driver(id=3, full_name="Sébastien Dossou", phone_number="+229 61 78 90 12", vehicle_plate="RB-1209-Abomey", daily_rate_xof=5000, current_status=PaymentStatusEnum.LOCKED, consecutive_overdue_days=3),
                    Driver(id=4, full_name="Awaou Chabi", phone_number="+229 95 33 22 11", vehicle_plate="RB-6677-PortoNovo", daily_rate_xof=5000, current_status=PaymentStatusEnum.UP_TO_DATE, consecutive_overdue_days=0),
                    Driver(id=5, full_name="Aimé Houndegbe", phone_number="+229 90 11 88 44", vehicle_plate="RB-3321-Calavi", daily_rate_xof=5000, current_status=PaymentStatusEnum.OVERDUE_2, consecutive_overdue_days=2),
                ]
                session.add_all(demo_drivers)
                await session.flush()

                # Appareil Samsung Galaxy A34 5G associé à Sébastien Dossou (bloqué)
                device_3 = Device(driver_id=3, imei="352889110022334", model="Samsung Galaxy A34 5G", is_locked=True, lock_reason="Paiement en retard de plus de 3 jours", fcm_token="token_samsung_a34_dossou")
                session.add(device_3)
                await session.commit()
                logger.info("Conducteurs et terminaux Samsung A34 prêts.")
    except Exception as e:
        logger.warning(f"Impossible d'initialiser les tables de la base de données ({e}). Vérifiez la disponibilité du serveur PostgreSQL ou de la base locale.")
    yield
    logger.info("Arrêt de LockER Backend API.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Plateforme MDM de gestion et de verrouillage à distance pour Samsung Galaxy A34 5G au Bénin",
    lifespan=lifespan
)

# Configuration CORS pour le frontend React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inclusion des routes API
app.include_router(drivers.router, prefix=settings.API_V1_STR)
app.include_router(devices.router, prefix=settings.API_V1_STR)
app.include_router(lock.router, prefix=settings.API_V1_STR)
app.include_router(webhooks.router, prefix=settings.API_V1_STR)


@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "region": "Bénin (XOF)"
    }
