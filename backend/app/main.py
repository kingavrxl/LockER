import logging
import os
import secrets
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.core.config import settings
from app.core.database import engine, Base, AsyncSessionLocal
from app.models.device import Device
from app.models.payment_schedule import PaymentScheduleRule
from app.api.v1.endpoints import drivers, devices, lock, webhooks, lockybee, rules, provisioning
from app.services.cloud_push_hub import CloudPushHub
from app.services.provisioning_qr import find_apk_path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("LockER")


import asyncio

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Démarrage de LockER Cloud Platform (Mode Cloud Native - 100% Hors Firebase & Hors SQLite)...")
    try:
        async def _init_db():
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        await asyncio.wait_for(_init_db(), timeout=3.0)
        logger.info("Tables PostgreSQL Cloud initialisées avec succès.")
    except Exception as e:
        logger.warning(f"Initialisation BD non-bloquante ({e}).")
    yield
    logger.info("Arrêt de LockER Cloud Platform.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Plateforme Cloud MDM Unifiée LockER (Web Dashboard + API Rest + WebSocket direct sub-50ms)",
    lifespan=lifespan
)

# Configuration CORS stricte et conforme W3C
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inclusion des routes API REST
app.include_router(drivers.router, prefix=settings.API_V1_STR)
app.include_router(devices.router, prefix=settings.API_V1_STR)
app.include_router(lock.router, prefix=settings.API_V1_STR)
app.include_router(webhooks.router, prefix=settings.API_V1_STR)
app.include_router(lockybee.router, prefix=settings.API_V1_STR)
app.include_router(rules.router, prefix=settings.API_V1_STR)
app.include_router(provisioning.router, prefix=settings.API_V1_STR)


# =========================================================================
# LIAISON CLOUD PUSH NATIVE : WebSocket Direct Sécurisé (100% Hors Firebase)
# =========================================================================
@app.websocket("/api/v1/devices/{imei}/ws")
async def device_websocket_endpoint(
    websocket: WebSocket,
    imei: str,
    token: Optional[str] = Query(None)
):
    """
    Canal de push Cloud direct et persistant avec les smartphones Android de la flotte.
    Vérifie cryptographiquement l'identité du terminal avant d'établir la socket.
    Permet de verrouiller ou déverrouiller instantanément en sub-50ms.
    """
    clean_imei = imei.strip()
    # Vérification d'authentification matérielle
    async with AsyncSessionLocal() as session:
        res = await session.execute(select(Device).where(Device.imei == clean_imei))
        device = res.scalars().first()
        if not device:
            await websocket.close(code=1008, reason="Terminal non enregistré")
            return

        if device.auth_token:
            if not token or (
                not secrets.compare_digest(token, device.auth_token) and
                not secrets.compare_digest(token, settings.ADMIN_SECRET_KEY)
            ):
                await websocket.close(code=1008, reason="Token matériel invalide")
                return

    await websocket.accept()
    await CloudPushHub.register_socket(clean_imei, websocket)
    try:
        while True:
            # Réception du heartbeat et keepalive périodique
            data = await websocket.receive_text()
            await websocket.send_json({"status": "ack", "imei": clean_imei})
    except WebSocketDisconnect:
        await CloudPushHub.unregister_socket(clean_imei, websocket)
    except Exception as e:
        logger.warning(f"Erreur WebSocket {clean_imei}: {e}")
        await CloudPushHub.unregister_socket(clean_imei, websocket)


# =========================================================================
# ROUTES UTILITAIRES CLOUD
# =========================================================================
@app.get("/api", tags=["API Root"])
async def api_root():
    return {
        "status": "online",
        "service": "LockER MDM Cloud Platform (Android - Bénin)",
        "version": "1.0.0",
        "docs_url": "/docs",
        "health_check": "/health",
        "apk_download_url": "/download/app-release.apk"
    }


@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "region": "Bénin (XOF)",
        "cloud_mode": "NATIVE_CLOUD_PUSH_WEBSOCKET",
        "database": "POSTGRESQL_CLOUD"
    }


@app.api_route("/download/app-release.apk", methods=["GET", "HEAD"], tags=["APK Download"])
async def download_apk():
    apk_path = find_apk_path()
    if apk_path:
        return FileResponse(apk_path, media_type="application/vnd.android.package-archive", filename="app-release.apk")
    raise HTTPException(status_code=404, detail="L'APK n'est pas encore compilé.")


# =========================================================================
# HÉBERGEMENT CLOUD UNIFIÉ DU FRONTEND REACT SPA (100% Hors Firebase)
# =========================================================================
possible_dist_dirs = [
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "static", "dist")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")),
]
dist_dir: Optional[str] = None
for candidate in possible_dist_dirs:
    if os.path.exists(candidate) and os.path.exists(os.path.join(candidate, "index.html")):
        dist_dir = candidate
        break

if dist_dir:
    logger.info(f"Frontend SPA LockER monté avec succès depuis {dist_dir}")
    assets_dir = os.path.join(dist_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", tags=["Frontend Cloud Dashboard"])
    async def serve_frontend_spa(full_path: str):
        if full_path.startswith("api") or full_path in ["docs", "openapi.json", "health", "download/app-release.apk"]:
            raise HTTPException(status_code=404, detail="Not Found")

        file_path = os.path.abspath(os.path.join(dist_dir, full_path))
        # Protection stricte contre Path Traversal
        if not file_path.startswith(dist_dir):
            raise HTTPException(status_code=403, detail="Forbidden")

        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)

        index_path = os.path.join(dist_dir, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)

        raise HTTPException(status_code=404, detail="Dashboard Web index.html introuvable.")
else:
    logger.warning("Dossier frontend/dist introuvable. Exécutez 'npm run build' dans frontend.")
    @app.get("/")
    async def fallback_root():
        return {
            "status": "online",
            "message": "Backend Cloud LockER opérationnel. Compilez le frontend avec 'npm run build' pour afficher le Dashboard."
        }
