from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=20)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=50)


class UserLogin(BaseModel):
    username_or_email: str = Field(..., min_length=2, max_length=255)
    password: str = Field(..., min_length=6, max_length=50)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: EmailStr
    created_at: datetime


class AuthData(BaseModel):
    user: UserResponse
    token: str
