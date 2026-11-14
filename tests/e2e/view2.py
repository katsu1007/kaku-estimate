from playwright.sync_api import sync_playwright
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../gaisan/kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    for name,vw,vh,mob in [('pc',1280,900,False),('ip',390,844,True)]:
        ctx=b.new_context(viewport={'width':vw,'height':vh},device_scale_factor=2,is_mobile=mob,has_touch=mob);pg=ctx.new_page()
        errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
        pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
        pid=pg.evaluate('location.hash').split('/')[2]
        pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300)
        pg.set_input_files('#dwgFile',REAL_TOILET);pg.wait_for_selector('#dwgFaces button',state='attached',timeout=60000);pg.wait_for_timeout(400)
        pg.evaluate("document.querySelector('#dwgView').scrollIntoView({block:'center'})")
        for _ in range(2 if mob else 1): pg.click('[data-z=in]');pg.wait_for_timeout(100)
        pg.wait_for_timeout(300);pg.screenshot(path=f'tests/e2e/shots/v2_{name}.png')
        print(name, pg.evaluate("[...document.querySelectorAll('#dwgFaces button')].slice(0,6).map(b=>b.textContent)"), errs or 'no errors')
        ctx.close()
    b.close()
