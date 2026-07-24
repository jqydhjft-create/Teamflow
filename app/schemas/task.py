from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    status: str = Field(..., pattern="^(todo|in_progress|done)$")
    priority: str = Field(..., pattern="^(low|medium|high)$")
    assignee_id: int | None = None


class TaskUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    status: str = Field(..., pattern="^(todo|in_progress|done)$")
    priority: str = Field(..., pattern="^(low|medium|high)$")
    assignee_id: int | None = None


class TaskOrderItem(BaseModel):
    task_id: int
    status: str = Field(..., pattern="^(todo|in_progress|done)$")
    sort_order: int = Field(..., ge=1)


class TaskBatchOrderUpdate(BaseModel):
    items: list[TaskOrderItem]


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    title: str
    description: str | None = None
    status: str
    priority: str
    assignee_id: int | None = None
    sort_order: int
    comment_count: int = 0
    created_at: datetime


class TaskListResponse(BaseModel):
    items: list[TaskResponse]


class TaskBatchOrderResponse(BaseModel):
    updated: int


class TaskDeleteResponse(BaseModel):
    deleted: bool
