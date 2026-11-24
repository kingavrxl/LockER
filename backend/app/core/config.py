import os
import secrets
from typing import List, Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "LockER - Device Lock & Fleet Management"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "production"

    # Base de données PostgreSQL Cloud Obligatoire (100% hors SQLite local)
    DATABASE_URL: str = "postgresql+asyncpg://locker_user:locker_pass@localhost:5432/locker_db"

    # Sécurité & Support
    SUPPORT_PHONE_NUMBER: str = "+2290191521518"  # Support Flotte Bénin (+229 01 91 52 15 18)
    ADMIN_SECRET_KEY: str = "locker_admin_prod_secret_2026_xof"
    DEVICE_ENROLLMENT_SECRET: str = "locker_device_enrollment_key_xof"

    # CORS — origines autorisées (séparées par des virgules dans .env)
    CORS_ORIGINS: str = "https://locker-2nuk.onrender.com,http://localhost:3000,http://localhost:5173"

    # Passerelles de paiement (lire depuis .env)
    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None
    FEDAPAY_SECRET_KEY: Optional[str] = None
    KKIAPAY_PRIVATE_KEY: Optional[str] = None

    # Règles métier (Bénin / Journalier)
    DAILY_PAYMENT_AMOUNT_XOF: int = 5000  # 5 000 FCFA / jour
    OVERDUE_DAYS_BEFORE_LOCK: int = 3
    OFFLINE_GRACE_PERIOD_HOURS: int = 72  # 3 jours hors-ligne maximum

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

# Validation de sécurité au démarrage : interdire SQLite local en production
if settings.ENVIRONMENT == "production" and settings.DATABASE_URL.startswith("sqlite"):
    raise RuntimeError(
        "CRITICAL SECURITY & ARCHITECTURE ERROR: SQLite local n'est pas autorisé en production. "
        "Une base de données PostgreSQL Cloud est strictement obligatoire (DATABASE_URL=postgresql+asyncpg://...)."
    )
