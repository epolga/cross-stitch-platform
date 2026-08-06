from app.metrics import precision_at_k, recall_at_k, reciprocal_rank


def test_precision_at_k_counts_hits_in_top_k():
    retrieved = [1, 2, 3, 4, 5]
    relevant = {2, 4, 99}
    assert precision_at_k(retrieved, relevant, k=5) == 2 / 5


def test_precision_at_k_only_looks_at_top_k():
    retrieved = [1, 2, 3, 4, 5]
    relevant = {5}
    assert precision_at_k(retrieved, relevant, k=3) == 0.0


def test_recall_at_k_divides_by_total_relevant():
    retrieved = [1, 2, 3]
    relevant = {2, 99, 100, 101}
    assert recall_at_k(retrieved, relevant, k=3) == 1 / 4


def test_recall_at_k_empty_relevant_set_is_zero_not_divide_by_zero():
    assert recall_at_k([1, 2, 3], set(), k=3) == 0.0


def test_reciprocal_rank_of_first_hit():
    retrieved = [1, 2, 3, 4]
    relevant = {3}
    assert reciprocal_rank(retrieved, relevant) == 1 / 3


def test_reciprocal_rank_no_hit_is_zero():
    assert reciprocal_rank([1, 2, 3], {99}) == 0.0
