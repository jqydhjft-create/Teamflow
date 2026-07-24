from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.activity_log import ActivityLog
from app.models.comment import Comment
from app.models.project import Project, ProjectMember
from app.models.task import Task
from app.models.user import User
from app.schemas.comment import CommentCreate, CommentListResponse, CommentResponse
from app.schemas.task import (
    TaskBatchOrderResponse,
    TaskBatchOrderUpdate,
    TaskDeleteResponse,
    TaskResponse,
    TaskUpdate,
)


router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def require_task_member(db: Session, task_id: int, user_id: int) -> Task:
    task = db.scalar(select(Task).where(Task.id == task_id))
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    membership = db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == task.project_id,
            ProjectMember.user_id == user_id,
        )
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return task


@router.put("/{task_id}")
def update_task(
    task_id: int,
    payload: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    task = require_task_member(db, task_id, current_user.id)
    task.title = payload.title
    task.description = payload.description
    task.status = payload.status
    task.priority = payload.priority
    task.assignee_id = payload.assignee_id
    db.add(
        ActivityLog(
            project_id=task.project_id,
            user_id=current_user.id,
            action="task_updated",
            target_type="task",
            target_id=task.id,
        )
    )
    db.commit()
    db.refresh(task)
    comment_count = db.scalar(
        select(func.count(Comment.id)).where(Comment.task_id == task.id)
    ) or 0
    data = TaskResponse.model_validate(task).model_copy(update={"comment_count": comment_count})
    return {"code": 0, "message": "ok", "data": data.model_dump()}


@router.get("/{task_id}")
def get_task_detail(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    task = require_task_member(db, task_id, current_user.id)
    comment_count = db.scalar(
        select(func.count(Comment.id)).where(Comment.task_id == task.id)
    ) or 0
    data = TaskResponse.model_validate(task).model_copy(update={"comment_count": comment_count})
    return {"code": 0, "message": "ok", "data": data.model_dump()}


@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    task = require_task_member(db, task_id, current_user.id)
    db.delete(task)
    db.commit()
    return {"code": 0, "message": "ok", "data": TaskDeleteResponse(deleted=True).model_dump()}


@router.patch("/batch-order")
def batch_update_task_order(
    payload: TaskBatchOrderUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    updated = 0
    for item in payload.items:
        task = require_task_member(db, item.task_id, current_user.id)
        task.status = item.status
        task.sort_order = item.sort_order
        updated += 1

    db.commit()
    return {
        "code": 0,
        "message": "ok",
        "data": TaskBatchOrderResponse(updated=updated).model_dump(),
    }


@router.post("/{task_id}/comments")
def create_comment(
    task_id: int,
    payload: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    task = require_task_member(db, task_id, current_user.id)
    comment = Comment(task_id=task.id, user_id=current_user.id, content=payload.content)
    db.add(comment)
    db.flush()
    db.add(
        ActivityLog(
            project_id=task.project_id,
            user_id=current_user.id,
            action="comment_created",
            target_type="comment",
            target_id=comment.id,
        )
    )
    db.commit()
    db.refresh(comment)
    return {
        "code": 0,
        "message": "ok",
        "data": CommentResponse(
            id=comment.id,
            task_id=comment.task_id,
            user_id=comment.user_id,
            username=current_user.username,
            content=comment.content,
            created_at=comment.created_at,
        ).model_dump(),
    }


@router.get("/{task_id}/comments")
def list_comments(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    task = require_task_member(db, task_id, current_user.id)
    rows = db.execute(
        select(Comment, User.username)
        .join(User, User.id == Comment.user_id)
        .where(Comment.task_id == task.id)
        .order_by(Comment.id.asc())
    ).all()
    items = [
        CommentResponse(
            id=comment.id,
            task_id=comment.task_id,
            user_id=comment.user_id,
            username=username,
            content=comment.content,
            created_at=comment.created_at,
        )
        for comment, username in rows
    ]
    return {"code": 0, "message": "ok", "data": CommentListResponse(items=items).model_dump()}


@router.delete("/{task_id}/comments/{comment_id}")
def delete_comment(
    task_id: int,
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    task = require_task_member(db, task_id, current_user.id)
    comment = db.scalar(
        select(Comment).where(
            Comment.id == comment_id,
            Comment.task_id == task.id,
        )
    )
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

    project = db.scalar(select(Project).where(Project.id == task.project_id))
    is_owner = project is not None and project.owner_id == current_user.id
    if comment.user_id != current_user.id and not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    db.delete(comment)
    db.commit()
    return {"code": 0, "message": "ok", "data": TaskDeleteResponse(deleted=True).model_dump()}
