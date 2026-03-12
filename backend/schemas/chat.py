from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from backend.schemas.recommendation import RecommendationOut

MAX_CHAT_MESSAGE_LENGTH = 2000
SESSION_TITLE_MAX_LENGTH = 50


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_CHAT_MESSAGE_LENGTH)


class ChatSessionUpdateIn(BaseModel):
    title: str = Field(min_length=1, max_length=SESSION_TITLE_MAX_LENGTH)


class ChatMessageOut(BaseModel):
    message_id: int
    session_id: int
    role: str
    content: str | RecommendationOut
    created_at: datetime


class ChatSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str | None
    created_at: datetime
    updated_at: datetime


class ChatSessionDetailOut(ChatSessionOut):
    messages: list[ChatMessageOut]
