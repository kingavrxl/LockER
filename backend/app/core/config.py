from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    PROJECT_NAME: str = "LockER - Device Lock & Fleet Management"
    API_V1_STR: str = "/api/v1"
    
    # Base de données PostgreSQL
    DATABASE_URL: str = "postgresql+asyncpg://locker_user:locker_pass@localhost:5432/locker_db"
    
    # Firebase
    FIREBASE_CREDENTIALS_PATH: Optional[str] = "firebase-service-account.json"
    
    # Sécurité & Support
    SUPPORT_PHONE_NUMBER: str = "+2290191521518"  # Support Flotte Bénin (+229 01 91 52 15 18)
    ADMIN_SECRET_KEY: str = "locker_super_secret_key_change_in_production"
    
    # Passerelles de paiement
    STRIPE_SECRET_KEY: Optional[str] = "sk_test_placeholder"
    STRIPE_WEBHOOK_SECRET: Optional[str] = "whsec_placeholder"
    FEDAPAY_SECRET_KEY: Optional[str] = "fedapay_secret_placeholder"
    KKIAPAY_PRIVATE_KEY: Optional[str] = "kkiapay_private_placeholder"
    
    # Règles métier (Bénin / Journalier)
    DAILY_PAYMENT_AMOUNT_XOF: int = 5000  # Ex: 5 000 FCFA / jour
    OVERDUE_DAYS_BEFORE_LOCK: int = 3
    OFFLINE_GRACE_PERIOD_HOURS: int = 72  # 3 jours hors-ligne maximum
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
