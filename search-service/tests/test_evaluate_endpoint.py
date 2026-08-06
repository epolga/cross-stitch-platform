from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_evaluate_computes_metrics():
    response = client.post(
        "/evaluate",
        json={"retrieved_ids": [1, 2, 3, 4, 5], "relevant_ids": [2, 4], "k": 5},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["precision_at_k"] == 2 / 5
    assert body["recall_at_k"] == 1.0
    assert body["mrr"] == 1 / 2


def test_evaluate_uses_default_k_when_omitted():
    response = client.post(
        "/evaluate",
        json={"retrieved_ids": [1, 2, 3], "relevant_ids": [1]},
    )
    assert response.status_code == 200
    assert response.json()["mrr"] == 1.0


def test_evaluate_rejects_missing_required_field():
    response = client.post("/evaluate", json={"retrieved_ids": [1, 2, 3]})
    assert response.status_code == 422
