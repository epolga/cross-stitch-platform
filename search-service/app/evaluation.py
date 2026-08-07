"""Turns raw SearchQueries + SearchEngagement rows into retrieval-quality
metrics via app.metrics's precision_at_k/recall_at_k/reciprocal_rank.

Deliberately has zero I/O — everything here is a pure function of plain
data. The DynamoDB-reading side (boto3, real AWS credentials, real table
scans) lives in scripts/evaluate_recent_searches.py instead. That split
means this module's logic is fully unit-testable with synthetic fixture
data (see tests/test_evaluation.py) without needing real accumulated
traffic or even a network connection — the C#/.NET analogue is keeping
business logic in a plain class, separate from a repository/DbContext
that does the actual data access.
"""

from dataclasses import dataclass

from app.metrics import precision_at_k, recall_at_k, reciprocal_rank


@dataclass(frozen=True)
class SearchQueryRecord:
    """One search event with the design IDs actually shown, ranked best
    first — mirrors a `SearchQueries` row once `retrievedIds` has been
    attached (see docs/integration/dynamodb-schema.md §4.14). Rows without
    `retrievedIds` yet (no search hand-off, or the update hasn't landed)
    aren't evaluable and should be filtered out before reaching this
    module.
    """

    search_id: str
    retrieved_ids: list[int]


@dataclass(frozen=True)
class EngagementRecord:
    """One (search, design) relevance signal — a `SearchEngagement` row
    (dynamodb-schema.md §4.17). `weight` (click=1, download=2) is carried
    through but not yet consumed: evaluate_all treats any engagement as
    binary relevance, matching metrics.py's plain-set `relevant_ids`.
    Weighted precision/recall is real future work, not done here.
    """

    search_id: str
    design_id: int
    weight: int


@dataclass(frozen=True)
class SearchEvaluation:
    search_id: str
    precision_at_k: float
    recall_at_k: float
    mrr: float
    relevant_count: int


@dataclass(frozen=True)
class AggregateEvaluation:
    case_count: int
    mean_precision_at_k: float
    mean_recall_at_k: float
    mean_mrr: float


def group_relevant_ids(engagements: list[EngagementRecord]) -> dict[str, set[int]]:
    grouped: dict[str, set[int]] = {}
    for e in engagements:
        grouped.setdefault(e.search_id, set()).add(e.design_id)
    return grouped


def evaluate_search(
    query: SearchQueryRecord,
    relevant_ids: set[int],
    k: int = 5,
) -> SearchEvaluation:
    return SearchEvaluation(
        search_id=query.search_id,
        precision_at_k=precision_at_k(query.retrieved_ids, relevant_ids, k),
        recall_at_k=recall_at_k(query.retrieved_ids, relevant_ids, k),
        mrr=reciprocal_rank(query.retrieved_ids, relevant_ids),
        relevant_count=len(relevant_ids),
    )


def evaluate_all(
    queries: list[SearchQueryRecord],
    engagements: list[EngagementRecord],
    k: int = 5,
) -> tuple[list[SearchEvaluation], AggregateEvaluation]:
    """Evaluates every query that has at least one engagement signal.

    Queries with zero engagement are skipped rather than scored with an
    empty relevant_ids set — recall_at_k treats "no known-relevant IDs" as
    0.0 (see metrics.py), so including them would just average in noise
    ("nobody clicked" is not the same claim as "the results were bad") —
    not real signal about retrieval quality. Once real volume makes
    "nobody ever engaged with this search" itself a meaningful, high-
    confidence data point, this default is worth revisiting.
    """
    grouped = group_relevant_ids(engagements)
    cases: list[SearchEvaluation] = []
    for q in queries:
        relevant = grouped.get(q.search_id)
        if not relevant:
            continue
        cases.append(evaluate_search(q, relevant, k))

    if not cases:
        return cases, AggregateEvaluation(0, 0.0, 0.0, 0.0)

    n = len(cases)
    aggregate = AggregateEvaluation(
        case_count=n,
        mean_precision_at_k=sum(c.precision_at_k for c in cases) / n,
        mean_recall_at_k=sum(c.recall_at_k for c in cases) / n,
        mean_mrr=sum(c.mrr for c in cases) / n,
    )
    return cases, aggregate
