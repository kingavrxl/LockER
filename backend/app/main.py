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
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Tables de la base de données initialisées.")
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
