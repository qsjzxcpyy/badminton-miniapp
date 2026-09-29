from app.scheduler import SchedPlayer, is_valid_level_combo, team_splits


def P(i, level):
    return SchedPlayer(id=i, name=f"P{i}", level=level)


def test_level_hard_constraints():
    assert not is_valid_level_combo(["H", "H", "M", "L"])
    assert not is_valid_level_combo(["H", "M", "M", "M"])
    assert not is_valid_level_combo(["M", "L", "L", "L"])
    assert is_valid_level_combo(["H", "H", "M", "M"])
    assert is_valid_level_combo(["H", "H", "H", "M"])
    assert is_valid_level_combo(["M", "M", "M", "L"])
    assert is_valid_level_combo(["L", "L", "L", "L"])


def test_two_high_two_mid_split_one_high_each():
    four = [P(1, "H"), P(2, "H"), P(3, "M"), P(4, "M")]
    splits = team_splits(four)
    assert splits
    assert all(sorted(sum(p.level == "H" for p in team) for team in split) == [1, 1] for split in splits)


def test_three_high_one_mid_split_two_high_against_high_mid():
    four = [P(1, "H"), P(2, "H"), P(3, "H"), P(4, "M")]
    assert all(sorted(sum(p.level == "H" for p in team) for team in split) == [1, 2] for split in team_splits(four))


def test_same_level_has_three_unique_splits():
    four = [P(1, "M"), P(2, "M"), P(3, "M"), P(4, "M")]
    assert len(team_splits(four)) == 3
