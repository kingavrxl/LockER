from fastapi import APIRouter, Depends, Body
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any
from app.core.database import get_db
from app.services.lockybee_service import LockybeeService

router = APIRouter(prefix="/lockybee", tags=["Lockybee AI Guardian"])


@router.get("/audit", response_model=Dict[str, Any])
async def get_system_audit(db: AsyncSession = Depends(get_db)):
    """
    Retourne l'audit complet de la plateforme LockER généré par l'agent IA Lockybee :
    Score de sécurité, alertes actives, métriques réseau & Kiosk.
    """
    return await LockybeeService.perform_system_audit(db)


@router.get("/config", response_model=Dict[str, Any])
async def get_lockybee_config():
    """
    Retourne la configuration du moteur LLM actif pour Lockybee (Gemini, Claude, OpenAI ou Simulateur).
    """
    return LockybeeService.get_llm_config()


@router.post("/config", response_model=Dict[str, Any])
async def set_lockybee_config(payload: Dict[str, str] = Body(...)):
    """
    Permet à l'administrateur de connecter dynamiquement sa clé Google Gemini ou Claude AI.
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
    db: AsyncSession = Depends(get_db)
):
    """
    Point d'échange conversationnel avec Lockybee pour analyser la plateforme,
    interroger l'état des appareils, vérifier les alertes et les paiements.
    """
    message = payload.get("message", "")
    return await LockybeeService.chat_with_lockybee(query=message, db=db)
