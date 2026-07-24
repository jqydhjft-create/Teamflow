from fastapi import APIRouter

from app.core.config import get_settings


router = APIRouter()


@router.get("/", tags=["root"])
def read_root() -> dict[str, str]:
    settings = get_settings()
    return {
        "message": "FastAPI project is running",
        "app_name": settings.app_name,
        "version": settings.app_version,
    }


@router.get("/health", tags=["health"])
def health_check() -> dict[str, object]:
    settings = get_settings()
    driver = settings.resolved_database_url.split("://", maxsplit=1)[0]
    return {
        "status": "ok",
        "database": {
            "driver": driver,
            "host": settings.mysql_host,
            "port": settings.mysql_port,
            "name": settings.mysql_database,
            "pool_size": settings.db_pool_size,
            "max_overflow": settings.db_max_overflow,
            "pool_recycle": settings.db_pool_recycle,
            "pool_pre_ping": settings.db_pool_pre_ping,
        },
        "redis": {
            "host": settings.redis_host,
            "port": settings.redis_port,
        },
    }
