from datetime import datetime

from pydantic import BaseModel, Field


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


class CommentResponse(BaseModel):
    id: int
    task_id: int
    user_id: int
    username: str
    content: str
    created_at: datetime


class CommentListResponse(BaseModel):
    items: list[CommentResponse]
