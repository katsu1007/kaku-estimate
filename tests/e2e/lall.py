from playwright.sync_api import sync_playwright
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../gaisan/kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pid=pg.evaluate('location.hash').split('/')[2]
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300)
    pg.set_input_files('#dwgFile',REAL_TOILET);pg.wait_for_selector('#dwgFaces button',state='attached',timeout=60000);pg.wait_for_timeout(3000)
    pg.click('[data-mode=light]');pg.wait_for_timeout(200);pg.click('[data-act=lMakeAll]');pg.wait_for_timeout(600)
    print('仕上げの画面:',pg.locator('.modal').count());pg.click('.modal [data-later]');pg.wait_for_timeout(300)
    print('今のモード:',pg.evaluate("document.querySelector('#dwgMode .on')?.textContent"))
    print('道具:',pg.evaluate("[...document.querySelectorAll('#lTool button')].map(b=>{const r=b.getBoundingClientRect();return [b.textContent,r.left>=0&&r.right<=innerWidth]})"))
    pg.click('[data-act=lAuto]');pg.wait_for_timeout(3000);pg.click('[data-act=oAuto]');pg.wait_for_timeout(400)
    print(pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects[0];return [p.rooms.length,p.drawing.lights.length,p.drawing.outlets.length]}"))
    pg.evaluate("document.querySelector('#dwgMode').scrollIntoView({block:'start'})");pg.evaluate("window.scrollBy(0,-80)");pg.wait_for_timeout(200);pg.screenshot(path='tests/e2e/shots/lall.png',full_page=False)
    print(errs or 'no errors');b.close()
