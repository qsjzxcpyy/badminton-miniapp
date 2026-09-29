from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(headless=True)
    page=b.new_page(viewport={"width":390,"height":844})
    page.goto("http://127.0.0.1:5174", wait_until="domcontentloaded")
    page.locator("#invite").fill("260920")
    page.locator(".entry-form button").click()
    page.wait_for_timeout(200)
    print(page.locator(".bottom-nav").evaluate("(e)=>JSON.stringify(e.getBoundingClientRect().toJSON())"), flush=True)
    b.close()
