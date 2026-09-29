from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:5174"


def open_match(page):
    page.goto(BASE_URL, wait_until="networkidle")
    page.locator("#invite").fill("260920")
    page.locator(".entry-form button").click()


def test_next_match_uses_vs():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 390, "height": 844})
        open_match(page)
        assert page.locator(".next-players b").inner_text() == "VS"
        browser.close()


def test_admin_exit_returns_to_player_match():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 390, "height": 844})
        open_match(page)
        page.locator(".icon-button").click()
        page.locator('input[placeholder="输入管理员密码"]').fill("8888")
        page.locator(".admin-lock .primary-button").click()
        page.locator(".text-button").click()
        assert page.locator(".court-card").is_visible()
        browser.close()


if __name__ == "__main__":
    errors = []
    for test in (test_next_match_uses_vs, test_admin_exit_returns_to_player_match):
        try:
            test()
            print(test.__name__ + ": PASS")
        except Exception as error:
            errors.append(test.__name__)
            print(test.__name__ + ": FAIL (" + type(error).__name__ + ")")
    if errors:
        raise SystemExit("failed: " + ", ".join(errors))
