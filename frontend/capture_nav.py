from playwright.sync_api import sync_playwright
from pathlib import Path

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for name, viewport in [("nav-mobile.png", {"width": 390, "height": 844}), ("nav-desktop.png", {"width": 1440, "height": 900})]:
        page = browser.new_page(viewport=viewport, device_scale_factor=1)
        page.goto("http://127.0.0.1:5174", wait_until="networkidle")
        page.locator("#invite").fill("260920")
        page.locator(".entry-form button").click()
        page.wait_for_timeout(500)
        page.screenshot(path=name, full_page=False)
        nav = page.locator(".bottom-nav")
        print(name, "nav_count=", nav.count(), "rect=", nav.evaluate("(e)=>JSON.stringify(e.getBoundingClientRect().toJSON())"), "visibility=", nav.evaluate("(e)=>getComputedStyle(e).visibility"), "z=", nav.evaluate("(e)=>getComputedStyle(e).zIndex"), flush=True)
        page.close()
    browser.close()
