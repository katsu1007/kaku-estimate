from playwright.sync_api import sync_playwright
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pid=pg.evaluate('location.hash').split('/')[2]
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300)
    pg.set_input_files('#dwgFile',REAL_TOILET);pg.wait_for_selector('#dwgFaces button',state='attached',timeout=60000);pg.wait_for_timeout(3000)
    vis=pg.evaluate("[...document.querySelectorAll('#dwgMode button')].map(b=>{const r=b.getBoundingClientRect();return [b.textContent,r.left>=0&&r.right<=innerWidth]})")
    print(vis)
    pg.evaluate("document.querySelector('#dwgMode').scrollIntoView({block:'start'})");pg.evaluate("window.scrollBy(0,-80)");pg.wait_for_timeout(200)
    pg.screenshot(path='tests/e2e/shots/modes.png')
    pg.click('[data-mode=light]');pg.wait_for_timeout(300)
    print(pg.evaluate("[...document.querySelectorAll('#lTool button')].map(b=>{const r=b.getBoundingClientRect();return [b.textContent,r.left>=0&&r.right<=innerWidth]})"))
    pg.evaluate("document.querySelector('#dwgMode').scrollIntoView({block:'start'})");pg.evaluate("window.scrollBy(0,-80)");pg.wait_for_timeout(200)
    pg.screenshot(path='tests/e2e/shots/modes2.png')
    b.close()
