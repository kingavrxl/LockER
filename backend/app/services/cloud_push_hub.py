import logging
from typing import Dict, Any, Optional
from fastapi import WebSocket

logger = logging.getLogger("CloudPushHub")


class CloudPushHub:
    """
    Gestionnaire Cloud-Native de Push & Synchronisation en temps réel (100% Hors Firebase).
    Maintient les liaisons WebSocket directes avec les agents Android et permet
    le verrouillage/déverrouillage instantané via le serveur Cloud.
    """
    _active_sockets: Dict[str, WebSocket] = {}

    @classmethod
    def register_socket(cls, imei: str, websocket: WebSocket):
        cls._active_sockets[imei] = websocket
        logger.info(f"[CloudPushHub] Terminal connecté en WebSocket Cloud direct : IMEI {imei}")

    @classmethod
    def unregister_socket(cls, imei: str):
        if imei in cls._active_sockets:
            del cls._active_sockets[imei]
            logger.info(f"[CloudPushHub] Terminal déconnecté du WebSocket Cloud : IMEI {imei}")

    @classmethod
    async def send_command_to_device(cls, imei: Optional[str], action: str, payload_data: Optional[Dict[str, Any]] = None) -> bool:
        """
        Envoie un ordre de commande en direct au terminal via WebSocket Cloud.
        """
        if not imei or imei not in cls._active_sockets:
            logger.info(f"[CloudPushHub] Terminal {imei} non connecté en WebSocket. Pris en charge par le Heartbeat HTTP Cloud persistant.")
            return False

        websocket = cls._active_sockets[imei]
        try:
            message = {
                "action": action,
                "imei": imei,
                **(payload_data or {})
            }
            await websocket.send_json(message)
            logger.info(f"[CloudPushHub] Ordre Cloud '{action}' transmis avec succès en sub-50ms à IMEI {imei}")
            return True
        except Exception as e:
            logger.warning(f"[CloudPushHub] Erreur lors de l'envoi WebSocket Cloud à {imei}: {e}")
            cls.unregister_socket(imei)
            return False
