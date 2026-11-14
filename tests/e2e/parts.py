from playwright.sync_api import sync_playwright
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pid=pg.evaluate('location.hash').split('/')[2]
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300)
    pg.click('#addRoom');pg.wait_for_timeout(300)
    pg.fill('.roomc [data-rk=w]','4');pg.fill('.roomc [data-rk=d]','3');pg.wait_for_timeout(200)
    pg.click('.roomc [data-act=addPart]');pg.wait_for_timeout(200)
    pg.select_option('.roomc [data-pk=s]','-1');pg.fill('.roomc [data-pk=w]','1');pg.fill('.roomc [data-pk=h]','1');pg.wait_for_timeout(300)
    print(pg.evaluate("async()=>{const a=await import('./js/app.js');const c=await import('./js/calc.js');const r=a.state.projects[0].rooms[0];const g=c.roomGeom(r,a.opts());return [r.parts,g.floor,g.perim]}"))
    print([t for t in pg.inner_text('.roomc').split('\n') if '㎡' in t][:3])
    pg.evaluate("document.querySelector('.parts').scrollIntoView({block:'center'})");pg.screenshot(path='tests/e2e/shots/parts.png')
    print(errs or 'no errors');b.close()
