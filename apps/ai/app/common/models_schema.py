from pydantic import BaseModel, ConfigDict


class LiteLLMModel(BaseModel):
    id: str
    object: str
    created: int
    owned_by: str
    mode: str

    model_config = ConfigDict(extra="allow")


class LiteLLMModelsResponse(BaseModel):
    object: str
    data: list[LiteLLMModel]

    model_config = ConfigDict(extra="allow")
