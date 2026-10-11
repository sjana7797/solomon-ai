from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class AIPromptRequest(BaseModel):
    chat_id: UUID = Field(..., description="Client-generated chat id.")
    user_message_id: UUID = Field(
        ..., description="Id of the last user message (the one being answered)."
    )
    assistant_message_id: UUID = Field(
        ..., description="Client-generated id for the reply being streamed."
    )
    title: str = Field(..., min_length=1, max_length=200)
    model: str = Field(..., description="A model_name from infra/litellm/config.yaml.")
    messages: list[ChatMessage] = Field(
        ..., min_length=1, description="Conversation so far, oldest first."
    )
    thinking: bool = Field(
        False,
        description="Deep thinking: high reasoning effort, with reasoning streamed back.",
    )
    web_search: bool = Field(
        False,
        description="Search the web and answer from the results (RAG) with citations.",
    )
    image: bool = Field(
        False, description="Generate an image from the message (local Ollama image model)."
    )
    document_ids: list[UUID] = Field(
        default_factory=list,
        max_length=20,
        description="Uploaded documents (owned by the caller) to answer from, with citations.",
    )
    temperature: float = Field(0.7, description="Sampling temperature for the model.")
    max_tokens: int | None = Field(
        None, description="Maximum number of tokens to generate in the response."
    )

    @model_validator(mode="after")
    def _ends_with_user_turn(self):
        if self.messages[-1].role != "user":
            raise ValueError("The last message must be from the user.")
        return self
