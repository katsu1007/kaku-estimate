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
    pg.click('[data-act=sketch]');pg.wait_for_timeout(300)
    pg.fill('#skName','洋室');pg.fill('#skW','4000');pg.fill('#skH','3000');pg.click('[data-a=rect]');pg.wait_for_timeout(200)
    pg.click('[data-a=apply]');pg.wait_for_timeout(600);
    if pg.locator('.modal [data-later]').count(): pg.click('.modal [data-later]')
    pg.click('[data-mode=meas]');pg.wait_for_timeout(200)
    pg.evaluate("document.querySelector('svg.pv').scrollIntoView({block:'center'})");pg.wait_for_timeout(200)
    P=lambda x,y: pg.evaluate(f"(()=>{{const s=document.querySelector('svg.pv');const pt=s.createSVGPoint();pt.x={x};pt.y={-y};const q=pt.matrixTransform(s.getScreenCTM());return [q.x,q.y]}})()")
    # 長押しで(0.03,0.04)付近 → 角(0,0)に吸い付く。指を動かして(3.97,0.05)で離す → 角(4,0)
    a=P(0.03,0.04);pg.mouse.move(*a);pg.mouse.down();pg.wait_for_timeout(600)
    print('虫めがね:',pg.evaluate("!document.querySelector('.pv-loupe').hidden"))
    pg.screenshot(path='tests/e2e/shots/loupe.png')
    pg.mouse.up();pg.wait_for_timeout(200)
    c=P(3.97,0.05);pg.mouse.move(*c);pg.mouse.down();pg.wait_for_timeout(600);pg.mouse.up();pg.wait_for_timeout(300)
    print('測った:',[x for x in pg.inner_text('#dwgBar').split('\n') if 'm' in x][:2])
    print(errs or 'no errors');b.close()
