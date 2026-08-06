import json

from app.main import handler


def _api_gateway_event(method: str, path: str, body: str | None = None) -> dict:
    return {
        "version": "2.0",
        "routeKey": f"{method} {path}",
        "rawPath": path,
        "rawQueryString": "",
        "headers": {"content-type": "application/json"},
        "requestContext": {
            "http": {
                "method": method,
                "path": path,
                "protocol": "HTTP/1.1",
                "sourceIp": "127.0.0.1",
            },
            "domainName": "example.com",
            "stage": "$default",
            "requestId": "test-request-id",
        },
        "body": body,
        "isBase64Encoded": False,
    }


def test_handler_serves_health_via_simulated_api_gateway_event():
    event = _api_gateway_event("GET", "/health")
    response = handler(event, {})
    assert response["statusCode"] == 200
    assert json.loads(response["body"]) == {"status": "ok"}


def test_handler_serves_evaluate_via_simulated_api_gateway_event():
    payload = json.dumps({"retrieved_ids": [1, 2, 3, 4, 5], "relevant_ids": [2, 4], "k": 5})
    event = _api_gateway_event("POST", "/evaluate", body=payload)
    response = handler(event, {})
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["precision_at_k"] == 2 / 5
    assert body["recall_at_k"] == 1.0
    assert body["mrr"] == 1 / 2
