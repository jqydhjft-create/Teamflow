from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    get_current_user,
    get_user_by_identity,
    verify_password,
    hash_password,
)
from app.models.user import User
from app.schemas.user import AuthData, UserCreate, UserLogin, UserResponse


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register")
def register(user_in: UserCreate, db: Session = Depends(get_db)) -> dict[str, object]:
    existing_user = db.scalar(
        select(User).where(or_(User.username == user_in.username, User.email == user_in.email))
    )
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email already exists",
        )

    user = User(
        username=user_in.username,
        email=user_in.email,
        password_hash=hash_password(user_in.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    data = AuthData(user=UserResponse.model_validate(user), token=create_access_token(user.id))
    return {"code": 0, "message": "ok", "data": data.model_dump()}


@router.post("/login")
def login(credentials: UserLogin, db: Session = Depends(get_db)) -> dict[str, object]:
    user = get_user_by_identity(db, credentials.username_or_email)
    if user is None or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username/email or password",
        )

    data = AuthData(user=UserResponse.model_validate(user), token=create_access_token(user.id))
    return {"code": 0, "message": "ok", "data": data.model_dump()}


@router.post("/logout")
def logout() -> dict[str, object]:
    return {
        "code": 0,
        "message": "ok",
        "data": {"message": "Logout placeholder. Token revocation is not implemented yet."},
    }


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)) -> dict[str, object]:
    return {
        "code": 0,
        "data": UserResponse.model_validate(current_user).model_dump(),
    }


@router.get("/protected")
def protected_example(current_user: User = Depends(get_current_user)) -> dict[str, object]:
    return {
        "code": 0,
        "message": "鉴权通过",
        "data": {"user_id": str(current_user.id)},
    }
