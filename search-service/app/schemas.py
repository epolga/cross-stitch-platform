from pydantic import BaseModel, Field


class EvaluateRequest(BaseModel):
    retrieved_ids: list[int] = Field(
        ..., description="Design IDs returned by search, in ranked order (best first)"
    )
    relevant_ids: list[int] = Field(
        ..., description="Design IDs considered relevant for this query (ground truth)"
    )
    k: int = Field(5, gt=0, description="Cutoff for the @k metrics")


class EvaluateResponse(BaseModel):
    precision_at_k: float
    recall_at_k: float
    mrr: float
