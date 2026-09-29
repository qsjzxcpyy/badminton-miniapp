from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(headless=True)
    page=b.new_page(viewport={"width":390,"height":844})
    page.goto("http://127.0.0.1:5174", wait_until="networkidle")
    page.locator("#invite").fill("260920")
    page.locator(".entry-form button").click()
    page.wait_for_timeout(300)
    page.screenshot(path="nav-mobile-fixed.png", full_page=False)
    print("nav_buttons=", page.locator(".bottom-nav > button").count(), flush=True)
    print("labels=", page.locator(".bottom-nav").inner_text(), flush=True)
    b.close()


