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
        Envoie un ordre de commande en direct au terminal via WebSocket Cloud (sub-50ms).
        Garantit l'acheminement même en cas d'alias ou d'identifiant Android ID.
        """
        if not cls._active_sockets:
            logger.info(f"[CloudPushHub] Aucun terminal connecté en WebSocket. Pris en charge par le Heartbeat HTTP Cloud.")
            return False

        message = {
            "action": action,
            "imei": imei or "UNKNOWN",
            **(payload_data or {})
        }

        # 1. Correspondance exacte sur l'IMEI ou identifiant
        if imei and imei in cls._active_sockets:
            try:
                await cls._active_sockets[imei].send_json(message)
                logger.info(f"[CloudPushHub] Ordre Cloud direct '{action}' transmis à IMEI {imei}")
                return True
            except Exception as e:
                logger.warning(f"[CloudPushHub] Erreur envoi WebSocket à {imei}: {e}")
                cls.unregister_socket(imei)

        # 2. Diffusion à tous les terminaux actifs si un seul ou ciblé
        sent_any = False
        for target_id, ws in list(cls._active_sockets.items()):
            try:
                await ws.send_json(message)
                logger.info(f"[CloudPushHub] Ordre Cloud '{action}' diffusé au terminal actif : {target_id}")
                sent_any = True
            except Exception as e:
                logger.warning(f"[CloudPushHub] Socket déconnectée lors de la diffusion : {target_id} ({e})")
                cls.unregister_socket(target_id)

        return sent_any
