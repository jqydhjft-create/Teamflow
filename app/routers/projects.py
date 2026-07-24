import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.activity_log import ActivityLog
from app.models.comment import Comment
from app.models.project import Project, ProjectMember, ProjectRole
from app.models.task import Task
from app.models.user import User
from app.schemas.activity_log import ActivityLogListResponse, ActivityLogResponse
from app.schemas.project import (
    ProjectCreate,
    ProjectJoin,
    ProjectListItem,
    ProjectListResponse,
    ProjectMemberItem,
    ProjectMemberListResponse,
    ProjectMemberResponse,
    ProjectResponse,
)
from app.schemas.stats import (
    ProjectAssigneeStat,
    ProjectStatsOverview,
    ProjectStatsResponse,
    ProjectStatusStat,
)
from app.schemas.task import TaskCreate, TaskListResponse, TaskResponse


router = APIRouter(prefix="/api/projects", tags=["projects"])


def generate_invite_code() -> str:
    return secrets.token_hex(3).upper()


def require_project_member(db: Session, project_id: int, user_id: int) -> ProjectMember:
    membership = db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return membership


@router.post("")
def create_project(
    payload: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    invite_code = generate_invite_code()
    while db.scalar(select(Project).where(Project.invite_code == invite_code)) is not None:
        invite_code = generate_invite_code()

    project = Project(
        name=payload.name,
        description=payload.description,
        owner_id=current_user.id,
        invite_code=invite_code,
    )
    db.add(project)
    db.flush()

    membership = ProjectMember(
        project_id=project.id,
        user_id=current_user.id,
        role=ProjectRole.owner.value,
    )
    db.add(membership)
    db.commit()
    db.refresh(project)

    return {"code": 0, "message": "ok", "data": ProjectResponse.model_validate(project).model_dump()}


@router.get("")
def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    rows = db.execute(
        select(Project, ProjectMember.role)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == current_user.id)
        .order_by(Project.id.desc())
    ).all()

    items = [
        ProjectListItem(
            id=project.id,
            name=project.name,
            description=project.description,
            owner_id=project.owner_id,
            invite_code=project.invite_code,
            created_at=project.created_at,
            role=role,
        )
        for project, role in rows
    ]
    return {"code": 0, "message": "ok", "data": ProjectListResponse(items=items).model_dump()}


@router.post("/{project_id}/join")
def join_project(
    project_id: int,
    payload: ProjectJoin,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    project = db.scalar(select(Project).where(Project.id == project_id))
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if project.invite_code != payload.invite_code:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid invite code")

    existing_membership = db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == current_user.id,
        )
    )
    if existing_membership is not None:
        return {
            "code": 0,
            "message": "ok",
            "data": ProjectMemberResponse(
                project_id=existing_membership.project_id,
                user_id=existing_membership.user_id,
                role=existing_membership.role,
            ).model_dump(),
        }

    membership = ProjectMember(
        project_id=project_id,
        user_id=current_user.id,
        role=ProjectRole.member.value,
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)

    return {
        "code": 0,
        "message": "ok",
        "data": ProjectMemberResponse(
            project_id=membership.project_id,
            user_id=membership.user_id,
            role=membership.role,
        ).model_dump(),
    }


@router.get("/{project_id}")
def get_project_detail(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    require_project_member(db, project_id, current_user.id)
    project = db.scalar(select(Project).where(Project.id == project_id))
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    return {"code": 0, "message": "ok", "data": ProjectResponse.model_validate(project).model_dump()}


@router.get("/{project_id}/members")
def list_project_members(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    require_project_member(db, project_id, current_user.id)
    rows = db.execute(
        select(User, ProjectMember.role)
        .join(ProjectMember, ProjectMember.user_id == User.id)
        .where(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.id.asc())
    ).all()

    items = [
        ProjectMemberItem(
            user_id=user.id,
            username=user.username,
            email=user.email,
            role=role,
        )
        for user, role in rows
    ]
    return {"code": 0, "message": "ok", "data": ProjectMemberListResponse(items=items).model_dump()}


@router.post("/{project_id}/tasks")
def create_task(
    project_id: int,
    payload: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    require_project_member(db, project_id, current_user.id)

    next_sort_order = (
        db.scalar(
            select(func.max(Task.sort_order)).where(
                Task.project_id == project_id,
                Task.status == payload.status,
            )
        )
        or 0
    ) + 1

    task = Task(
        project_id=project_id,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        priority=payload.priority,
        assignee_id=payload.assignee_id,
        sort_order=next_sort_order,
    )
    db.add(task)
    db.flush()
    db.add(
        ActivityLog(
            project_id=project_id,
            user_id=current_user.id,
            action="task_created",
            target_type="task",
            target_id=task.id,
        )
    )
    db.commit()
    db.refresh(task)

    data = TaskResponse.model_validate(task).model_copy(update={"comment_count": 0})
    return {"code": 0, "message": "ok", "data": data.model_dump()}


@router.get("/{project_id}/activity-logs")
def list_activity_logs(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    require_project_member(db, project_id, current_user.id)
    rows = db.execute(
        select(ActivityLog, User.username)
        .join(User, User.id == ActivityLog.user_id)
        .where(ActivityLog.project_id == project_id)
        .order_by(ActivityLog.id.asc())
    ).all()
    items = [
        ActivityLogResponse(
            id=log.id,
            project_id=log.project_id,
            user_id=log.user_id,
            username=username,
            action=log.action,
            target_type=log.target_type,
            target_id=log.target_id,
            created_at=log.created_at,
        )
        for log, username in rows
    ]
    return {"code": 0, "message": "ok", "data": ActivityLogListResponse(items=items).model_dump()}


@router.get("/{project_id}/tasks")
def list_tasks(
    project_id: int,
    status: str | None = None,
    priority: str | None = None,
    assignee_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    require_project_member(db, project_id, current_user.id)
    query = select(Task).where(Task.project_id == project_id)
    if status is not None:
        query = query.where(Task.status == status)
    if priority is not None:
        query = query.where(Task.priority == priority)
    if assignee_id is not None:
        query = query.where(Task.assignee_id == assignee_id)

    tasks = db.scalars(query.order_by(Task.status.asc(), Task.sort_order.asc(), Task.id.asc())).all()
    task_ids = [task.id for task in tasks]
    comment_counts: dict[int, int] = {}
    if task_ids:
        comment_rows = db.execute(
            select(Comment.task_id, func.count(Comment.id))
            .where(Comment.task_id.in_(task_ids))
            .group_by(Comment.task_id)
        ).all()
        comment_counts = {task_id: count for task_id, count in comment_rows}

    items = [
        TaskResponse.model_validate(task).model_copy(
            update={"comment_count": comment_counts.get(task.id, 0)}
        )
        for task in tasks
    ]
    return {"code": 0, "message": "ok", "data": TaskListResponse(items=items).model_dump()}


@router.get("/{project_id}/stats")
def get_project_stats(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    require_project_member(db, project_id, current_user.id)

    total_tasks = db.scalar(select(func.count(Task.id)).where(Task.project_id == project_id)) or 0
    completed_tasks = (
        db.scalar(
            select(func.count(Task.id)).where(
                Task.project_id == project_id,
                Task.status == "done",
            )
        )
        or 0
    )
    completion_rate = round((completed_tasks / total_tasks * 100) if total_tasks else 0.0, 2)

    status_rows = db.execute(
        select(Task.status, func.count(Task.id))
        .where(Task.project_id == project_id)
        .group_by(Task.status)
        .order_by(Task.status.asc())
    ).all()
    status_breakdown = [
        ProjectStatusStat(status=status, count=count)
        for status, count in status_rows
    ]

    assignee_rows = db.execute(
        select(User.id, User.username, func.count(Task.id))
        .join(Task, Task.assignee_id == User.id)
        .where(Task.project_id == project_id)
        .group_by(User.id, User.username)
        .order_by(func.count(Task.id).desc(), User.id.asc())
    ).all()
    assignee_breakdown = [
        ProjectAssigneeStat(user_id=user_id, username=username, count=count)
        for user_id, username, count in assignee_rows
    ]

    data = ProjectStatsResponse(
        overview=ProjectStatsOverview(
            total_tasks=total_tasks,
            completed_tasks=completed_tasks,
            completion_rate=completion_rate,
        ),
        status_breakdown=status_breakdown,
        assignee_breakdown=assignee_breakdown,
    )
    return {"code": 0, "message": "ok", "data": data.model_dump()}
