import asyncio
import logging
from typing import Dict, Any, Optional
from fastapi import WebSocket

logger = logging.getLogger("CloudPushHub")


class CloudPushHub:
    """
    Gestionnaire Cloud-Native de Push & Synchronisation en temps réel (100% Hors Firebase).
    Maintient les liaisons WebSocket directes et persistantes avec les agents Android.
    Garantit le verrouillage et déverrouillage instantané en sub-50ms.
    """
    _active_sockets: Dict[str, WebSocket] = {}
    _lock = asyncio.Lock()

    @classmethod
    async def register_socket(cls, imei: str, websocket: WebSocket):
        async with cls._lock:
            # Si un ancien socket existe déjà pour cet IMEI, le fermer proprement
            old_ws = cls._active_sockets.get(imei)
            if old_ws and old_ws != websocket:
                try:
                    await old_ws.close(code=1000, reason="Replaced by new connection")
                except Exception:
                    pass
            cls._active_sockets[imei] = websocket
            logger.info(f"[CloudPushHub] Terminal connecté en WebSocket Cloud direct : IMEI {imei}")

    @classmethod
    async def unregister_socket(cls, imei: str, websocket: Optional[WebSocket] = None):
        async with cls._lock:
            if imei in cls._active_sockets:
                current_ws = cls._active_sockets[imei]
                if websocket is None or current_ws == websocket:
                    del cls._active_sockets[imei]
                    logger.info(f"[CloudPushHub] Terminal déconnecté du WebSocket Cloud : IMEI {imei}")

    @classmethod
    def is_device_online(cls, imei: str) -> bool:
        return imei in cls._active_sockets

    @classmethod
    async def send_command_to_device(
        cls,
        imei: Optional[str],
        action: str,
        payload_data: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Envoie un ordre de commande en direct au terminal via WebSocket Cloud (sub-50ms).
        Ne cible STRICTEMENT que le terminal identifié par son IMEI.
        """
        if not imei:
            logger.warning("[CloudPushHub] IMEI non fourni — commande ignorée.")
            return False

        message = {
            "action": action,
            "imei": imei,
            **(payload_data or {})
        }

        target_ws: Optional[WebSocket] = None
        async with cls._lock:
            target_ws = cls._active_sockets.get(imei)

        if target_ws:
            try:
                await target_ws.send_json(message)
                logger.info(f"[CloudPushHub] Ordre direct '{action}' transmis avec succès à IMEI {imei}")
                return True
            except Exception as e:
                logger.warning(f"[CloudPushHub] Échec envoi WebSocket à {imei}: {e}. Fermeture du socket.")
                await cls.unregister_socket(imei, target_ws)

        logger.info(f"[CloudPushHub] IMEI {imei} non connecté en direct. L'ordre sera appliqué lors du prochain contact.")
        return False
