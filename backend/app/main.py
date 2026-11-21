import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import os

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

        logger.info("Base de données prête en mode dynamique (zéro conducteur fictif).")
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


@app.get("/download/app-release.apk", tags=["APK Download"])
async def download_apk():
    paths_to_check = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "static", "app-release.apk")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "android", "app", "build", "outputs", "apk", "release", "app-release.apk")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "app-release.apk")),
    ]
    for p in paths_to_check:
        if os.path.exists(p):
            return FileResponse(p, media_type="application/vnd.android.package-archive", filename="app-release.apk")
    raise HTTPException(status_code=404, detail="L'APK n'est pas encore compilé. Veuillez compiler le projet Android.")
