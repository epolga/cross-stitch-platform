from fastapi import FastAPI

from app.metrics import precision_at_k, recall_at_k, reciprocal_rank
from app.schemas import EvaluateRequest, EvaluateResponse

app = FastAPI(title="Cross-Stitch Search Service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/evaluate", response_model=EvaluateResponse)
def evaluate(req: EvaluateRequest) -> EvaluateResponse:
    relevant = set(req.relevant_ids)
    return EvaluateResponse(
        precision_at_k=precision_at_k(req.retrieved_ids, relevant, req.k),
        recall_at_k=recall_at_k(req.retrieved_ids, relevant, req.k),
        mrr=reciprocal_rank(req.retrieved_ids, relevant),
    )
