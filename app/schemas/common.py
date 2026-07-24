from pydantic import BaseModel


class DatabaseHealth(BaseModel):
    driver: str
    host: str
    port: int
    name: str
    pool_size: int
    max_overflow: int
    pool_recycle: int
    pool_pre_ping: bool


class RedisHealth(BaseModel):
    host: str
    port: int


class HealthResponse(BaseModel):
    status: str
    database: DatabaseHealth
    redis: RedisHealth
