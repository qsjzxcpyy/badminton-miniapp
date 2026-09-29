from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from itertools import combinations
from typing import Iterable

LEVEL_SCORE = {"H": 3, "M": 2, "L": 1}


@dataclass(frozen=True)
class SchedPlayer:
    id: int
    name: str
    level: str


@dataclass(frozen=True)
class RoundDraft:
    seq: int
    p1: int
    p2: int
    p3: int
    p4: int
    is_shuffle: bool = False

    @property
    def ids(self) -> tuple[int, int, int, int]:
        return self.p1, self.p2, self.p3, self.p4


class NoLegalScheduleError(ValueError):
    pass


def is_valid_level_combo(levels: Iterable[str]) -> bool:
    levels = list(levels)
    if len(levels) != 4 or any(level not in LEVEL_SCORE for level in levels):
        return False
    values = [LEVEL_SCORE[level] for level in levels]
    if max(values) - min(values) > 1:
        return False
    counts = Counter(levels)
    if counts["H"] == 1 and counts["M"] == 3:
        return False
    if counts["M"] == 1 and counts["L"] == 3:
        return False
    return True


def _split_valid(left: tuple[SchedPlayer, ...], right: tuple[SchedPlayer, ...]) -> bool:
    left_counts = Counter(player.level for player in left)
    right_counts = Counter(player.level for player in right)
    return all(abs(left_counts[level] - right_counts[level]) <= 1 for level in LEVEL_SCORE)


def team_splits(players: list[SchedPlayer]) -> list[tuple[tuple[SchedPlayer, ...], tuple[SchedPlayer, ...]]]:
    if len(players) != 4 or len({player.id for player in players}) != 4:
        return []
    a, b, c, d = players
    raw = [((a, b), (c, d)), ((a, c), (b, d)), ((a, d), (b, c))]
    return [split for split in raw if _split_valid(*split)]


def _candidate_score(
    candidate: tuple[SchedPlayer, ...],
    play_count: dict[int, int],
    last_round: set[int],
    partner_count: dict[tuple[int, int], int],
    opponent_count: dict[tuple[int, int], int],
) -> tuple:
    ids = {player.id for player in candidate}
    count_after = [play_count[player.id] + 1 if player.id in ids else play_count[player.id] for player in candidate]
    consecutive = len(ids & last_round)
    repeat_partner = 0
    repeat_opponent = 0
    for first, second in combinations(sorted(ids), 2):
        key = (first, second)
        repeat_partner += partner_count.get(key, 0)
        repeat_opponent += opponent_count.get(key, 0)
    return (
        max(count_after) - min(count_after),
        sum(play_count[player.id] for player in candidate),
        consecutive,
        repeat_partner,
        repeat_opponent,
        tuple(sorted(ids)),
    )


def _ordered_splits(
    candidate: tuple[SchedPlayer, ...],
    partner_count: dict[tuple[int, int], int],
    opponent_count: dict[tuple[int, int], int],
) -> list[tuple[tuple[SchedPlayer, ...], tuple[SchedPlayer, ...]]]:
    def score(split):
        left, right = split
        left_levels = sum(LEVEL_SCORE[player.level] for player in left)
        right_levels = sum(LEVEL_SCORE[player.level] for player in right)
        partner_repeats = sum(partner_count.get(tuple(sorted((a.id, b.id))), 0) for a, b in (left, right))
        opponent_repeats = sum(opponent_count.get(tuple(sorted((a.id, b.id))), 0) for a in left for b in right)
        return (abs(left_levels - right_levels), partner_repeats, opponent_repeats, tuple(player.id for player in left))
    return sorted(team_splits(list(candidate)), key=score)


def generate_schedule(
    players: list[SchedPlayer],
    total_minutes: int = 180,
    minutes_per_round: int = 12,
) -> list[RoundDraft]:
    if len(players) < 4:
        raise NoLegalScheduleError("至少需要 4 名球员")
    if total_minutes <= 0 or minutes_per_round <= 0:
        raise ValueError("比赛时长和每局时长必须大于 0")
    total_rounds = max(1, (total_minutes + minutes_per_round - 1) // minutes_per_round)
    by_id = {player.id: player for player in players}
    play_count = {player.id: 0 for player in players}
    last_round: set[int] = set()
    partner_count: dict[tuple[int, int], int] = {}
    opponent_count: dict[tuple[int, int], int] = {}
    drafts: list[RoundDraft] = []

    for seq in range(1, total_rounds + 1):
        candidates = []
        for combo in combinations(players, 4):
            levels = [player.level for player in combo]
            if not is_valid_level_combo(levels):
                continue
            high_ids = {player.id for player in combo if player.level == "H"}
            last_high_ids = {player_id for player_id in last_round if by_id[player_id].level == "H"}
            total_highs = sum(player.level == "H" for player in players)
            if total_highs == 2 and len(last_high_ids) == 2 and len(high_ids) not in (0, 2):
                continue
            candidates.append(combo)
        if not candidates:
            raise NoLegalScheduleError(f"第 {seq} 局没有满足等级硬约束的四人组合")
        candidate = min(candidates, key=lambda item: _candidate_score(item, play_count, last_round, partner_count, opponent_count))
        splits = _ordered_splits(candidate, partner_count, opponent_count)
        if not splits:
            raise NoLegalScheduleError(f"第 {seq} 局无法平衡分队")
        left, right = splits[0]
        draft = RoundDraft(seq=seq, p1=left[0].id, p2=left[1].id, p3=right[0].id, p4=right[1].id)
        drafts.append(draft)
        selected = set(draft.ids)
        for player_id in selected:
            play_count[player_id] += 1
        for team in (left, right):
            key = tuple(sorted(player.id for player in team))
            partner_count[key] = partner_count.get(key, 0) + 1
        for player_left in left:
            for player_right in right:
                key = tuple(sorted((player_left.id, player_right.id)))
                opponent_count[key] = opponent_count.get(key, 0) + 1
        last_round = selected
    return drafts

