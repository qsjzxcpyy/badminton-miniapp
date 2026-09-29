import json
import os
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("BADMINTON_BASE_URL", "http://127.0.0.1:5174")


def open_match():
    playwright = sync_playwright().start()
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 390, "height": 844})
    context.add_init_script("localStorage.clear()")
    page = context.new_page()
    page.goto(BASE_URL, wait_until="networkidle")
    page.locator("#invite").fill("260920")
    page.locator(".entry-form button").click()
    page.wait_for_timeout(150)
    return playwright, browser, context, page


def test_extend_appends_rounds():
    playwright, browser, context, page = open_match()
    page.locator(".icon-button").click()
    page.locator(".extension-button").first.click()
    page.locator(".text-button").click()
    page.locator(".bottom-nav button").nth(1).click()
    assert page.locator(".schedule-row").count() == 20
    context.close()
    browser.close()
    playwright.stop()


def test_exit_keeps_normal_ranking_row():
    playwright, browser, context, page = open_match()
    page.locator(".icon-button").click()
    page.locator(".player-status-select").first.select_option("withdrawn")
    page.locator(".text-button").click()
    page.locator(".bottom-nav button").nth(2).click()
    assert page.locator(".ranking-row").count() == 8
    assert page.locator(".ranking-row .rank-name strong").first.is_visible()
    context.close()
    browser.close()
    playwright.stop()


def test_reschedule_excludes_withdrawn_player_from_future_rounds():
    playwright, browser, context, page = open_match()
    page.locator(".icon-button").click()
    page.locator(".player-status-select").first.select_option("withdrawn")
    page.locator(".admin-panel .primary-button").first.click()
    page.locator(".text-button").click()
    page.locator(".bottom-nav button").nth(1).click()
    assert page.locator(".schedule-row").count() == 15
    context.close()
    browser.close()
    playwright.stop()


def test_creator_creates_match_without_password():
    playwright = sync_playwright().start()
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 390, "height": 844})
    context.add_init_script("localStorage.clear()")
    page = context.new_page()
    page.goto(BASE_URL, wait_until="networkidle")
    page.locator(".create-match-entry").click()
    page.locator("#create-match-name").fill("Saturday night")
    page.locator("#create-invite-code").fill("654321")
    page.locator("#create-match-submit").click()
    assert page.locator(".admin-page").count() == 1
    assert page.locator(".admin-lock").count() == 0
    assert page.locator(".admin-badge").count() == 1
    context.close()
    browser.close()
    playwright.stop()


def test_guest_does_not_see_admin_entry():
    playwright = sync_playwright().start()
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 390, "height": 844})
    context.add_init_script("if (!sessionStorage.getItem('badminton-test-started')) { localStorage.clear(); sessionStorage.setItem('badminton-test-started', '1') }")
    page = context.new_page()
    page.goto(BASE_URL, wait_until="networkidle")
    page.locator(".create-match-entry").click()
    page.locator("#create-match-name").fill("Saturday night")
    page.locator("#create-invite-code").fill("654321")
    page.locator("#create-match-submit").click()
    page.wait_for_timeout(200)
    page.evaluate("localStorage.setItem('badminton-demo-user-id', 'guest-user')")
    page.reload(wait_until="networkidle")
    page.locator("#invite").fill("654321")
    page.locator(".entry-form button").click()
    assert page.locator(".icon-button").count() == 0
    assert page.locator(".bottom-nav button").count() == 3
    context.close()
    browser.close()
    playwright.stop()


def test_scheduler_balances_six_seven_eight_players():
    cases = [
        (["H", "H", "M", "M", "M", "M"], 0, 2),
        (["H", "H", "M", "M", "M", "M", "M"], 1, 1),
        (["H", "H", "M", "M", "M", "L", "L", "L"], 1, 0),
        (["H", "H", "M", "M", "M", "M", "L", "L"], 1, 2),
        (["H", "H", "M", "M", "X", "X", "L", "L"], 1, 1),
        (["H", "H", "M", "M", "M", "X", "L", "L"], 1, 1),
    ]
    for levels, expected_spread, expected_max_overlap in cases:
        playwright = sync_playwright().start()
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 390, "height": 844})
        players = [{"id": index + 1, "name": f"P{index + 1}", "level": level, "status": "active"} for index, level in enumerate(levels)]
        data = {"match": {"id": "verify", "name": "Verify", "inviteCode": "260920", "creatorId": "wx-demo-creator"}, "players": players, "rounds": []}
        context.add_init_script(f"localStorage.setItem('badminton-demo', {json.dumps(json.dumps(data))}); localStorage.setItem('badminton-demo-user-id', 'wx-demo-creator')")
        page = context.new_page()
        page.goto(BASE_URL, wait_until="networkidle")
        page.locator("#invite").fill("260920")
        page.locator(".entry-form button").click()
        page.locator(".icon-button").click()
        page.locator(".admin-panel .primary-button").first.click()
        result = page.evaluate("() => { const proxy = document.querySelector('.app-shell').__vueParentComponent.proxy; return { players: proxy.players, rounds: proxy.rounds } }")
        assert len(result["rounds"]) == 15
        counts = {player["id"]: 0 for player in result["players"]}
        levels_by_id = {player["id"]: player["level"] for player in result["players"]}
        max_overlap = 0
        for index, round in enumerate(result["rounds"]):
            ids = [round[key] for key in ("p1", "p2", "p3", "p4")]
            assert len(set(ids)) == 4
            group_levels = [levels_by_id[player_id] for player_id in ids]
            assert not ({"H", "L"} <= set(group_levels))
            assert not ("H" in group_levels and "X" in group_levels)
            assert not (group_levels.count("H") == 1 and group_levels.count("M") == 3)
            assert group_levels.count("H") in (0, 2)
            for player_id in ids:
                counts[player_id] += 1
            if index:
                previous_ids = [result["rounds"][index - 1][key] for key in ("p1", "p2", "p3", "p4")]
                max_overlap = max(max_overlap, len(set(ids).intersection(previous_ids)))
        values = list(counts.values())
        context.close()
        browser.close()
        playwright.stop()
        assert max(values) - min(values) == expected_spread
        assert max_overlap <= expected_max_overlap



def test_scheduler_refreshes_high_level_partners():
    levels = ["H", "H", "M", "M", "M", "M", "L", "L"]
    playwright = sync_playwright().start()
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 390, "height": 844})
    players = [{"id": index + 1, "name": f"P{index + 1}", "level": level, "status": "active"} for index, level in enumerate(levels)]
    data = {"match": {"id": "verify", "name": "Verify", "inviteCode": "260920", "creatorId": "wx-demo-creator"}, "players": players, "rounds": []}
    context.add_init_script(f"localStorage.setItem('badminton-demo', {json.dumps(json.dumps(data))}); localStorage.setItem('badminton-demo-user-id', 'wx-demo-creator')")
    page = context.new_page()
    page.goto(BASE_URL, wait_until="networkidle")
    page.locator("#invite").fill("260920")
    page.locator(".entry-form button").click()
    page.locator(".icon-button").click()
    page.locator(".admin-panel .primary-button").first.click()
    rounds = page.evaluate("() => { const proxy = document.querySelector('.app-shell').__vueParentComponent.proxy; return proxy.rounds }")
    for high_id in (1, 2):
        partners = set()
        for round in rounds:
            ids = {round["p1"], round["p2"], round["p3"], round["p4"]}
            if high_id in ids:
                partners.update(ids.intersection({3, 4, 5, 6}))
        assert len(partners) >= 3
    quartet_counts = {}
    for round in rounds:
        quartet = tuple(sorted(round[key] for key in ("p1", "p2", "p3", "p4")))
        quartet_counts[quartet] = quartet_counts.get(quartet, 0) + 1
    assert max(quartet_counts.values()) <= 3
    context.close()
    browser.close()
    playwright.stop()
def test_scheduler_uses_high_low_fallback_only_when_needed():
    cases = [
        (["H", "M", "M", "L"], True),
        (["H", "H", "M", "M", "L", "L"], False),
    ]
    for levels, expects_fallback in cases:
        playwright = sync_playwright().start()
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 390, "height": 844})
        players = [{"id": index + 1, "name": f"P{index + 1}", "level": level, "status": "active"} for index, level in enumerate(levels)]
        data = {"match": {"id": "verify", "name": "Verify", "inviteCode": "260920", "creatorId": "wx-demo-creator"}, "players": players, "rounds": []}
        context.add_init_script(f"localStorage.setItem('badminton-demo', {json.dumps(json.dumps(data))}); localStorage.setItem('badminton-demo-user-id', 'wx-demo-creator')")
        page = context.new_page()
        page.goto(BASE_URL, wait_until="networkidle")
        page.locator("#invite").fill("260920")
        page.locator(".entry-form button").click()
        page.locator(".icon-button").click()
        page.locator(".admin-panel .primary-button").first.click()
        rounds = page.evaluate("() => document.querySelector('.app-shell').__vueParentComponent.proxy.rounds")
        level_by_id = {player["id"]: player["level"] for player in players}
        fallback_rounds = []
        for round in rounds:
            group_levels = [level_by_id[round[key]] for key in ("p1", "p2", "p3", "p4")]
            has_fallback = group_levels.count("H") == 1 and group_levels.count("M") == 2 and group_levels.count("L") == 1
            fallback_rounds.append(has_fallback)
        assert any(fallback_rounds) is expects_fallback
        if not expects_fallback:
            assert not any(fallback_rounds)
        context.close()
        browser.close()
        playwright.stop()

def test_scheduler_freshness_for_two_high_three_middle_one_x_two_low():
    playwright = sync_playwright().start()
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 390, "height": 844})
    levels = ["H", "H", "M", "M", "M", "X", "L", "L"]
    players = [{"id": index + 1, "name": f"P{index + 1}", "level": level, "status": "active"} for index, level in enumerate(levels)]
    data = {"match": {"id": "verify", "name": "Verify", "inviteCode": "260920", "creatorId": "wx-demo-creator"}, "players": players, "rounds": []}
    context.add_init_script(f"localStorage.setItem('badminton-demo', {json.dumps(json.dumps(data))}); localStorage.setItem('badminton-demo-user-id', 'wx-demo-creator')")
    page = context.new_page()
    page.goto(BASE_URL, wait_until="networkidle")
    page.locator("#invite").fill("260920")
    page.locator(".entry-form button").click()
    page.locator(".icon-button").click()
    signatures = set()
    for generation in range(5):
        if generation:
            page.evaluate("() => { const proxy = document.querySelector('.app-shell').__vueParentComponent.proxy; proxy.rounds = []; proxy.generateSchedule(false) }")
        page.locator(".admin-panel .primary-button").first.click() if generation == 0 else None
        result = page.evaluate("() => { const proxy = document.querySelector('.app-shell').__vueParentComponent.proxy; return { players: proxy.players, rounds: proxy.rounds } }")
        counts = {player["id"]: 0 for player in result["players"]}
        levels_by_id = {player["id"]: player["level"] for player in result["players"]}
        quartet_counts = {}
        high_partners = {1: set(), 2: set()}
        low_partners = {7: set(), 8: set()}
        for round in result["rounds"]:
            ids = [round[key] for key in ("p1", "p2", "p3", "p4")]
            for player_id in ids:
                counts[player_id] += 1
            quartet = tuple(sorted(ids))
            quartet_counts[quartet] = quartet_counts.get(quartet, 0) + 1
            for high_id in (1, 2):
                if high_id in ids:
                    high_partners[high_id].update(set(ids).intersection({3, 4, 5}))
            for low_id in (7, 8):
                if low_id in ids:
                    low_partners[low_id].update(set(ids).intersection({3, 4, 5}))
            group_levels = [levels_by_id[player_id] for player_id in ids]
            assert group_levels.count("H") in (0, 2)
            assert not ("H" in group_levels and ("X" in group_levels or "L" in group_levels))
        assert max(counts.values()) - min(counts.values()) <= 1
        assert all(partners == {3, 4, 5} for partners in high_partners.values())
        assert all(partners == {3, 4, 5} for partners in low_partners.values())
        assert len(quartet_counts) >= 6
        assert max(quartet_counts.values()) <= 3
        signatures.add(tuple(tuple(round[key] for key in ("p1", "p2", "p3", "p4")) for round in result["rounds"]))
    assert len(signatures) >= 2
    context.close()
    browser.close()
    playwright.stop()
if __name__ == "__main__":
    test_extend_appends_rounds()
    test_exit_keeps_normal_ranking_row()
    test_reschedule_excludes_withdrawn_player_from_future_rounds()
    test_creator_creates_match_without_password()
    test_guest_does_not_see_admin_entry()
    test_scheduler_balances_six_seven_eight_players()
    test_scheduler_refreshes_high_level_partners()
    test_scheduler_uses_high_low_fallback_only_when_needed()
    test_scheduler_freshness_for_two_high_three_middle_one_x_two_low()
    print("ALL_MATCH_TESTS_PASS")
