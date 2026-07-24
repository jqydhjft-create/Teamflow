from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)


class ProjectJoin(BaseModel):
    invite_code: str = Field(..., min_length=4, max_length=12)


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    owner_id: int
    invite_code: str
    created_at: datetime


class ProjectListItem(ProjectResponse):
    role: str


class ProjectListResponse(BaseModel):
    items: list[ProjectListItem]


class ProjectMemberResponse(BaseModel):
    project_id: int
    user_id: int
    role: str


class ProjectMemberItem(BaseModel):
    user_id: int
    username: str
    email: str
    role: str


class ProjectMemberListResponse(BaseModel):
    items: list[ProjectMemberItem]
