"""
Module d'authentification et de contrôle d'accès pour l'API LockER.
Fournit la vérification stricte :
1. verify_admin_api_key : Pour les routes d'administration et le Dashboard.
2. verify_device_token : Pour les communications machine-to-machine de l'agent Android.
3. verify_enrollment_key : Pour la validation du processus d'enrôlement initial.
"""
import secrets
from typing import Optional
from fastapi import Security, HTTPException, status, Header, Query
from fastapi.security import APIKeyHeader
from app.core.config import settings

API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_admin_api_key(
    x_api_key: Optional[str] = Security(API_KEY_HEADER),
    authorization: Optional[str] = Header(None)
) -> str:
    """
    Dépendance FastAPI : Authentifie les requêtes administratives.
    Accepte soit le header X-API-Key, soit Authorization: Bearer <token>.
    """
    token = x_api_key
    if not token and authorization:
        parts = authorization.split(" ")
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Header X-API-Key ou Authorization manquant.",
            headers={"WWW-Authenticate": "ApiKey"}
        )

    if not secrets.compare_digest(token, settings.ADMIN_SECRET_KEY):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Clé API administrative invalide."
        )

    return token


async def verify_enrollment_key(
    x_enrollment_key: Optional[str] = Header(None, alias="X-Enrollment-Key")
) -> bool:
    """
    Valide l'enrôlement d'un nouvel appareil physique.
    """
    if not x_enrollment_key or not secrets.compare_digest(x_enrollment_key, settings.DEVICE_ENROLLMENT_SECRET):
        # Permettre également à la clé admin de provisionner
        if x_enrollment_key and secrets.compare_digest(x_enrollment_key, settings.ADMIN_SECRET_KEY):
            return True
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Clé d'enrôlement matériel invalide ou absente."
        )
    return True
