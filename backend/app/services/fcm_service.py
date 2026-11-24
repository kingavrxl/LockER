"""
DEPRECATED: Firebase Cloud Messaging a été intégralement éliminé du projet LockER.
Toutes les commandes de verrouillage et de télémétrie transitent désormais
directement via la liaison CloudPushHub WebSocket native sub-50ms (100% Hors Firebase).
"""
import logging

logger = logging.getLogger("FCMService")


class FCMService:
    @staticmethod
    def send_device_command(*args, **kwargs) -> bool:
        logger.warning("FCMService est obsolète. Utilisez CloudPushHub pour la diffusion Cloud directe.")
        return True
