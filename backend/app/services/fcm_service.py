import logging
import os
from typing import Dict, Any, Optional
import firebase_admin
from firebase_admin import credentials, messaging
from app.core.config import settings

logger = logging.getLogger(__name__)

# Initialisation du SDK Firebase
_firebase_initialized = False

def init_firebase():
    global _firebase_initialized
    if _firebase_initialized:
        return
    
    cred_path = settings.FIREBASE_CREDENTIALS_PATH
    if cred_path and os.path.exists(cred_path):
        try:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            _firebase_initialized = True
            logger.info("Firebase Admin SDK initialisé avec succès.")
        except Exception as e:
            logger.error(f"Erreur d'initialisation Firebase avec le fichier {cred_path}: {e}")
    else:
        logger.warning(f"Fichier d'identifiants Firebase introuvable à {cred_path}. Mode simulation activé.")


class FCMService:
    @staticmethod
    def send_device_command(
        fcm_token: str,
        action: str,  # "LOCK", "UNLOCK", "HEARTBEAT", "RENEW_LEASE"
        payload_data: Optional[Dict[str, str]] = None
    ) -> bool:
        """
        Envoie un message Push High-Priority FCM à l'agent Android.
        Utilise un message de données 'data' pur pour être traité en tâche de fond immédiate
        par FirebaseMessagingService sans dépendre d'une notification visuelle de base.
        """
        init_firebase()
        
        data = {
            "action": action,
            "timestamp": str(os.times().elapsed),
            "support_phone": settings.SUPPORT_PHONE_NUMBER
        }
        if payload_data:
            data.update(payload_data)

        if not _firebase_initialized:
            logger.info(f"[SIMULATION FCM] Commande {action} envoyée au token: {fcm_token[:15]}... avec données: {data}")
            return True

        try:
            # Message haute priorité (Direct wakeup pour Device Owner)
            message = messaging.Message(
                data=data,
                token=fcm_token,
                android=messaging.AndroidConfig(
                    priority="high",
                    ttl=3600  # 1 heure de conservation si hors-ligne
                )
            )
            response = messaging.send(message)
            logger.info(f"FCM envoyé avec succès: {response} pour l'action {action}")
            return True
        except Exception as e:
            logger.error(f"Échec de l'envoi FCM vers {fcm_token[:15]}... : {e}")
            return False
