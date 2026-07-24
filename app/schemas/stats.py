from pydantic import BaseModel


class ProjectStatsOverview(BaseModel):
    total_tasks: int
    completed_tasks: int
    completion_rate: float


class ProjectStatusStat(BaseModel):
    status: str
    count: int


class ProjectAssigneeStat(BaseModel):
    user_id: int
    username: str
    count: int


class ProjectStatsResponse(BaseModel):
    overview: ProjectStatsOverview
    status_breakdown: list[ProjectStatusStat]
    assignee_breakdown: list[ProjectAssigneeStat]
