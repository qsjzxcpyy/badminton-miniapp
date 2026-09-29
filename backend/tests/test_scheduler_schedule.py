from app.scheduler import NoLegalScheduleError, SchedPlayer, generate_schedule, is_valid_level_combo


def P(i, level):
    return SchedPlayer(id=i, name=f"P{i}", level=level)


def test_eight_player_schedule_has_fifteen_rounds_and_valid_combos():
    players = [P(i, level) for i, level in enumerate(["H", "H", "M", "M", "M", "M", "L", "L"], start=1)]
    rounds = generate_schedule(players, total_minutes=180, minutes_per_round=12)
    assert len(rounds) == 15
    levels = {player.id: player.level for player in players}
    assert all(is_valid_level_combo([levels[player_id] for player_id in round_.ids]) for round_ in rounds)
    assert all(len(set(round_.ids)) == 4 for round_ in rounds)


def test_six_player_schedule_can_use_two_high_anchor_group():
    players = [P(i, level) for i, level in enumerate(["H", "H", "M", "M", "L", "L"], start=1)]
    rounds = generate_schedule(players, total_minutes=60, minutes_per_round=12)
    assert len(rounds) == 5
    assert all(len(set(round_.ids)) == 4 for round_ in rounds)


def test_no_legal_schedule_is_explicit():
    players = [P(i, level) for i, level in enumerate(["H", "M", "M", "M"], start=1)]
    try:
        generate_schedule(players, total_minutes=12, minutes_per_round=12)
    except NoLegalScheduleError as error:
        assert "硬约束" in str(error)
    else:
        raise AssertionError("expected NoLegalScheduleError")
