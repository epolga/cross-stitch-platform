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
    precision_at_k: float = Field(
        ..., description="Fraction of the top-k retrieved IDs that were relevant"
    )
    recall_at_k: float = Field(
        ..., description="Fraction of all relevant IDs that appeared in the top-k"
    )
    mrr: float = Field(
        ..., description="Reciprocal rank of the first relevant ID (0 if none found)"
    )
