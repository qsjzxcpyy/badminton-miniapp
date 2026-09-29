from dataclasses import dataclass
from typing import Iterable


@dataclass
class RankingRow:
    player_id: int
    name: str
    net_score: int = 0
    wins: int = 0
    games: int = 0


def calculate_ranking(players: Iterable, rounds: Iterable) -> list[RankingRow]:
    rows = {player.id: RankingRow(player_id=player.id, name=player.name) for player in players}
    for current in rounds:
        if getattr(current, "status", None) != "completed":
            continue
        score1 = getattr(current, "score1", None)
        score2 = getattr(current, "score2", None)
        if score1 is None or score2 is None:
            continue
        diff = int(score1) - int(score2)
        first_team = (current.p1, current.p2)
        second_team = (current.p3, current.p4)
        for player_id in first_team:
            if player_id in rows:
                rows[player_id].net_score += diff
                rows[player_id].games += 1
                if diff > 0:
                    rows[player_id].wins += 1
        for player_id in second_team:
            if player_id in rows:
                rows[player_id].net_score -= diff
                rows[player_id].games += 1
                if diff < 0:
                    rows[player_id].wins += 1
    return sorted(rows.values(), key=lambda row: (-row.net_score, row.games, row.name))
