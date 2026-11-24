import logging
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from app.core.config import settings

logger = logging.getLogger("Database")

raw_db_url = settings.DATABASE_URL
if raw_db_url.startswith("postgres://"):
    db_url = raw_db_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif raw_db_url.startswith("postgresql://") and not raw_db_url.startswith("postgresql+asyncpg://"):
    db_url = raw_db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
else:
    db_url = raw_db_url

is_sqlite = db_url.startswith("sqlite")

engine_kwargs = {
    "echo": False,
    "future": True,
}

if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20

try:
    engine = create_async_engine(
        db_url,
        **engine_kwargs
    )
except Exception as e:
    logger.warning(f"Driver PostgreSQL non disponible sur l'environnement hôte ({e}). Bascule en mode de repli mémoire.")
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False}
    )

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
