from types import SimpleNamespace

from app.ranking import calculate_ranking


def test_ranking_assigns_net_score_to_each_team_member():
    players = [SimpleNamespace(id=i, name=name) for i, name in enumerate(["A", "B", "C", "D"], start=1)]
    rounds = [SimpleNamespace(status="completed", score1=15, score2=7, p1=1, p2=2, p3=3, p4=4)]
    ranking = calculate_ranking(players, rounds)
    assert [row.player_id for row in ranking] == [1, 2, 3, 4]
    assert ranking[0].net_score == 8
    assert ranking[2].net_score == -8
    assert ranking[0].wins == 1
    assert ranking[2].wins == 0


def test_ranking_ignores_pending_and_keeps_name_order_for_ties():
    players = [SimpleNamespace(id=i, name=name) for i, name in enumerate(["B", "A", "C", "D"], start=1)]
    rounds = [
        SimpleNamespace(status="completed", score1=10, score2=10, p1=1, p2=2, p3=3, p4=4),
        SimpleNamespace(status="pending", score1=30, score2=0, p1=1, p2=2, p3=3, p4=4),
    ]
    ranking = calculate_ranking(players, rounds)
    assert [row.name for row in ranking] == ["A", "B", "C", "D"]
    assert all(row.net_score == 0 and row.games == 1 for row in ranking)
