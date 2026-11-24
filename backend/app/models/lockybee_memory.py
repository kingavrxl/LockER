from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime
from app.core.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class LockybeeMemory(Base):
    """
    Mémoire permanente et apprentissage de l'agent IA Lockybee.
    Enregistre les consignes, règles et préférences dictées par l'administrateur
    afin qu'il applique strictement ce qui lui est demandé.
    """
    __tablename__ = "lockybee_memories"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(50), default="INSTRUCTION")  # INSTRUCTION, REGLE, PREFERENCE, DEROGATION
    key = Column(String(100), nullable=True, index=True)
    content = Column(Text, nullable=False)
    learned_from = Column(String(150), default="ADMINISTRATEUR")
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
