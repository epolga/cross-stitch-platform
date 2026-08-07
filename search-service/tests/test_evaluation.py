from app.evaluation import (
    EngagementRecord,
    SearchQueryRecord,
    evaluate_all,
    evaluate_search,
    group_relevant_ids,
)


def test_group_relevant_ids_collects_by_search_id():
    engagements = [
        EngagementRecord(search_id="s1", design_id=10, weight=1),
        EngagementRecord(search_id="s1", design_id=20, weight=2),
        EngagementRecord(search_id="s2", design_id=30, weight=1),
    ]
    grouped = group_relevant_ids(engagements)
    assert grouped == {"s1": {10, 20}, "s2": {30}}


def test_evaluate_search_scores_a_single_query():
    query = SearchQueryRecord(search_id="s1", retrieved_ids=[10, 11, 20, 12, 13])
    # A click on 20 (position 3) and a download on 10 (position 1) — both
    # count as relevant regardless of weight, per evaluate_all's docstring.
    result = evaluate_search(query, relevant_ids={10, 20}, k=5)
    assert result.search_id == "s1"
    assert result.precision_at_k == 2 / 5
    assert result.recall_at_k == 1.0
    assert result.mrr == 1.0  # first hit (10) is at rank 1
    assert result.relevant_count == 2


def test_evaluate_all_skips_queries_with_no_engagement():
    queries = [
        SearchQueryRecord(search_id="clicked", retrieved_ids=[1, 2, 3]),
        SearchQueryRecord(search_id="ignored", retrieved_ids=[4, 5, 6]),
    ]
    engagements = [EngagementRecord(search_id="clicked", design_id=2, weight=1)]

    cases, aggregate = evaluate_all(queries, engagements, k=3)

    assert [c.search_id for c in cases] == ["clicked"]
    assert aggregate.case_count == 1


def test_evaluate_all_averages_across_multiple_evaluable_searches():
    queries = [
        SearchQueryRecord(search_id="s1", retrieved_ids=[1, 2, 3]),
        SearchQueryRecord(search_id="s2", retrieved_ids=[4, 5, 6]),
    ]
    engagements = [
        # s1: hit at rank 1 -> precision 1/3, recall 1/1, mrr 1.0
        EngagementRecord(search_id="s1", design_id=1, weight=1),
        # s2: hit at rank 3 -> precision 1/3, recall 1/1, mrr 1/3
        EngagementRecord(search_id="s2", design_id=6, weight=2),
    ]

    cases, aggregate = evaluate_all(queries, engagements, k=3)

    assert aggregate.case_count == 2
    assert aggregate.mean_precision_at_k == 1 / 3
    assert aggregate.mean_recall_at_k == 1.0
    assert aggregate.mean_mrr == (1.0 + 1 / 3) / 2


def test_evaluate_all_returns_zeroed_aggregate_when_nothing_is_evaluable():
    queries = [SearchQueryRecord(search_id="s1", retrieved_ids=[1, 2, 3])]
    cases, aggregate = evaluate_all(queries, engagements=[], k=3)
    assert cases == []
    assert aggregate.case_count == 0
    assert aggregate.mean_precision_at_k == 0.0
