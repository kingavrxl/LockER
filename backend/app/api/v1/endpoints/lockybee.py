from fastapi import APIRouter, Depends, Body
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any
from app.core.database import get_db
from app.core.auth import verify_admin_api_key
from app.services.lockybee_service import LockybeeService

router = APIRouter(prefix="/lockybee", tags=["Lockybee AI Guardian"])


@router.get("/audit", response_model=Dict[str, Any])
async def get_system_audit(
    db: AsyncSession = Depends(get_db),
    admin_token: str = Depends(verify_admin_api_key)
):
    """
    Retourne l'audit complet de la plateforme LockER généré par l'agent IA Lockybee.
    Protégé par clé d'administration.
    """
    return await LockybeeService.perform_system_audit(db)


@router.get("/config", response_model=Dict[str, Any])
async def get_lockybee_config(
    admin_token: str = Depends(verify_admin_api_key)
):
    """
    Retourne la configuration du moteur LLM actif pour Lockybee.
    Protégé par clé d'administration.
    """
    return LockybeeService.get_llm_config()


@router.post("/config", response_model=Dict[str, Any])
async def set_lockybee_config(
    payload: Dict[str, str] = Body(...),
    admin_token: str = Depends(verify_admin_api_key)
):
    """
    Permet à l'administrateur de connecter dynamiquement sa clé Google Gemini ou Claude AI.
    Protégé par clé d'administration.
    """
    api_key = payload.get("api_key", "")
    provider = payload.get("provider", "gemini")
    LockybeeService.set_custom_llm_key(api_key, provider)
    return {
        "status": "configured",
        "provider": provider,
        "config": LockybeeService.get_llm_config()
    }


@router.post("/chat", response_model=Dict[str, Any])
async def chat_with_lockybee(
    payload: Dict[str, str] = Body(..., example={"message": "Quel est le statut de la plateforme ?"}),
    db: AsyncSession = Depends(get_db),
    admin_token: str = Depends(verify_admin_api_key)
):
    """
    Point d'échange conversationnel avec Lockybee pour analyser la plateforme.
    Protégé par clé d'administration.
    """
    message = payload.get("message", "")
    return await LockybeeService.chat_with_lockybee(query=message, db=db)
