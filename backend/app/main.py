import logging
import os
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine, Base
from app.api.v1.endpoints import drivers, devices, lock, webhooks, lockybee
from app.services.cloud_push_hub import CloudPushHub

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("LockER")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Démarrage de LockER Cloud Platform...")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Tables de la base de données initialisées avec succès.")
    except Exception as e:
        logger.warning(f"Initialisation BD ({e}).")
    yield
    logger.info("Arrêt de LockER Cloud Platform.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Plateforme Cloud MDM Unifiée LockER (Web Dashboard + API Rest + WebSocket direct)",
    lifespan=lifespan
)

# Configuration CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


# =========================================================================
# LIAISON CLOUD PUSH NATIVE : WebSocket Direct (100% Hors Firebase)
# =========================================================================
@app.websocket("/api/v1/devices/{imei}/ws")
async def device_websocket_endpoint(websocket: WebSocket, imei: str):
    """
    Canal de push Cloud direct et persistant avec les smartphones Samsung Galaxy A34.
    Permet de verrouiller ou déverrouiller instantanément en sub-50ms sans passer par Firebase.
    """
    await websocket.accept()
    CloudPushHub.register_socket(imei, websocket)
    try:
        while True:
            # Réception du heartbeat et keepalive périodique
            data = await websocket.receive_text()
            await websocket.send_json({"status": "ack", "imei": imei})
    except WebSocketDisconnect:
        CloudPushHub.unregister_socket(imei)


# =========================================================================
# ROUTES UTILITAIRES CLOUD
# =========================================================================
@app.get("/api", tags=["API Root"])
async def api_root():
    return {
        "status": "online",
        "service": "LockER MDM Cloud Platform (Samsung Galaxy A34 5G - Bénin)",
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
        "cloud_mode": "NATIVE_CLOUD_NO_FIREBASE"
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
    raise HTTPException(status_code=404, detail="L'APK n'est pas encore compilé.")


# =========================================================================
# HÉBERGEMENT CLOUD UNIFIÉ DU FRONTEND REACT SPA (100% Hors Firebase)
# =========================================================================
# Recherche du dossier de build frontend compilé
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
        # Ne pas intercepter les routes d'API, docs ou téléchargements
        if full_path.startswith("api") or full_path in ["docs", "openapi.json", "health", "download/app-release.apk"]:
            raise HTTPException(status_code=404, detail="Not Found")

        file_path = os.path.join(dist_dir, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)

        # Fallback React Router SPA vers index.html
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
