from datetime import datetime

from pydantic import BaseModel


class ActivityLogResponse(BaseModel):
    id: int
    project_id: int
    user_id: int
    username: str
    action: str
    target_type: str
    target_id: int
    created_at: datetime


class ActivityLogListResponse(BaseModel):
    items: list[ActivityLogResponse]
