"""Pulls recent SearchQueries + SearchEngagement rows from DynamoDB and
runs them through app.evaluation to report real retrieval-quality metrics.

This is the thin, unit-untested half of Track 1 Step 3's evaluation
pipeline — all it does is fetch rows and hand them to app.evaluation's
pure functions (which ARE unit-tested, see tests/test_evaluation.py).
Deliberately kept this small: I/O code is hard to unit-test without a
real or mocked DynamoDB, so the goal is to have as little of it as
possible, not to test this file itself.

Usage:
    .venv\\Scripts\\python.exe -m pip install -r requirements-dev.txt   # once
    .venv\\Scripts\\python.exe scripts/evaluate_recent_searches.py [--days 7] [--k 5]

Needs real AWS credentials (same account/region as the web app) and
read access to the SearchQueries/SearchEngagement tables. Read-only —
never writes anything.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Lets this run as `python scripts/evaluate_recent_searches.py` (not
# `python -m scripts.evaluate_recent_searches`) while still importing the
# `app` package that lives one directory up.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import boto3  # noqa: E402  (import after sys.path fix, see above)
from botocore.exceptions import ClientError  # noqa: E402

from app.evaluation import EngagementRecord, SearchQueryRecord, evaluate_all  # noqa: E402

REGION = os.environ.get("AWS_REGION", "us-east-1")
SEARCH_QUERIES_TABLE = os.environ.get("DDB_SEARCH_QUERIES_TABLE", "SearchQueries")
SEARCH_ENGAGEMENT_TABLE = os.environ.get("DDB_SEARCH_ENGAGEMENT_TABLE", "SearchEngagement")


def _scan_all(dynamodb, table_name: str, scan_kwargs: dict) -> list[dict]:
    """Paginated Scan that treats a missing table as "no data yet"
    instead of crashing. Both target tables can legitimately not exist
    yet: SearchEngagement self-provisions on the first real click/
    download (see dynamodb-schema.md §4.17), so until that happens this
    is the expected state, not an error.
    """
    table = dynamodb.Table(table_name)
    items: list[dict] = []
    kwargs = dict(scan_kwargs)
    try:
        while True:
            resp = table.scan(**kwargs)
            items.extend(resp.get("Items", []))
            if "LastEvaluatedKey" not in resp:
                break
            kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            raise
        print(f"({table_name} doesn't exist yet — no data written there so far)")
    return items


def fetch_search_queries(dynamodb, since_date: str) -> list[SearchQueryRecord]:
    """Rows with retrievedIds already attached (see dynamodb-schema.md
    §4.14 — rows from a search that never became a click/download
    hand-off, or whose page.tsx update hasn't landed yet, don't have this
    field and aren't evaluable).

    A full table Scan (rather than a Query) is fine here: this is an
    occasional admin/reporting script, not a hot request path, and
    SearchQueries' partition key (date) doesn't let a Query span an
    arbitrary day range without knowing every date up front anyway.
    """
    items = _scan_all(dynamodb, SEARCH_QUERIES_TABLE, {
        "FilterExpression": "#date >= :since AND attribute_exists(retrievedIds)",
        "ExpressionAttributeNames": {"#date": "date"},
        "ExpressionAttributeValues": {":since": since_date},
    })
    return [
        SearchQueryRecord(
            search_id=f"{item['date']}|{item['ts']}",
            retrieved_ids=json.loads(item["retrievedIds"]),
        )
        for item in items
    ]


def fetch_engagements(dynamodb) -> list[EngagementRecord]:
    items = _scan_all(dynamodb, SEARCH_ENGAGEMENT_TABLE, {})
    return [
        EngagementRecord(
            search_id=item["searchId"],
            design_id=int(item["designId"]),
            weight=int(item.get("weight", 1)),
        )
        for item in items
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=7, help="How many days back to evaluate")
    parser.add_argument("--k", type=int, default=5, help="Cutoff for precision@k/recall@k")
    args = parser.parse_args()

    since = (datetime.now(timezone.utc) - timedelta(days=args.days)).strftime("%Y-%m-%d")
    dynamodb = boto3.resource("dynamodb", region_name=REGION)

    queries = fetch_search_queries(dynamodb, since)
    engagements = fetch_engagements(dynamodb)
    cases, aggregate = evaluate_all(queries, engagements, k=args.k)

    print(f"Searches with retrievedIds since {since}: {len(queries)}")
    print(f"Searches with at least one engagement signal: {aggregate.case_count}")
    if aggregate.case_count == 0:
        print("Not enough data yet — need both a retrievedIds-logged search "
              "and at least one click/download on the same searchId.")
        return

    print(f"Mean precision@{args.k}: {aggregate.mean_precision_at_k:.3f}")
    print(f"Mean recall@{args.k}:    {aggregate.mean_recall_at_k:.3f}")
    print(f"Mean MRR:                {aggregate.mean_mrr:.3f}")


if __name__ == "__main__":
    main()
