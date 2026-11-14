from playwright.sync_api import sync_playwright
import json
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../gaisan/kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1100,'height':1300})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pid=pg.evaluate('location.hash').split('/')[2]
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300)
    pg.click('[data-act=sketch]');pg.wait_for_timeout(300)
    pg.fill('#skName','洋室');pg.fill('#skW','4000');pg.fill('#skH','3000');pg.click('[data-a=rect]');pg.wait_for_timeout(200)
    pg.click('[data-a=apply]');pg.wait_for_timeout(600)
    if pg.locator('.modal [data-later]').count(): pg.click('.modal [data-later]');pg.wait_for_timeout(200)
    pg.click('[data-mode=place]');pg.wait_for_timeout(200)
    P=lambda x,y: pg.evaluate(f"(()=>{{const s=document.querySelector('svg.pv');const pt=s.createSVGPoint();pt.x={x};pt.y={-y};const q=pt.matrixTransform(s.getScreenCTM());return [q.x,q.y]}})()")
    pg.evaluate("document.querySelector('svg.pv').scrollIntoView({block:'center'})");pg.wait_for_timeout(200)
    pg.select_option('#pItem','e-hwh')
    pg.mouse.click(*P(1,1));pg.wait_for_timeout(200)
    pg.mouse.click(*P(3,2));pg.wait_for_timeout(200)
    pg.mouse.click(*P(3,2));pg.wait_for_timeout(200)  # select
    print(pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.drawing);return JSON.stringify(p.drawing.places)}"), P(3,2))
    pg.screenshot(path='tests/e2e/shots/pdbg.png')
    pg.click('[data-act=pRot]');pg.wait_for_timeout(200)
    # drag the selected one
    pg.evaluate("document.querySelector('svg.pv').scrollIntoView({block:'center'})");pg.wait_for_timeout(200)
    a=P(3,2);c=P(3.5,2.5);pg.mouse.move(*a);pg.mouse.down();pg.mouse.move(a[0]+5,a[1]+5);pg.mouse.move(*c,steps=5);pg.mouse.up();pg.wait_for_timeout(300)
    print('after drag',a,c,pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.drawing);return JSON.stringify(p.drawing.places)}"))
    pg.click('[data-pwhere=area]');pg.wait_for_timeout(200);pg.select_option('#pItem','e-smoke')
    pg.evaluate("document.querySelector('svg.pv').scrollIntoView({block:'center'})");pg.wait_for_timeout(200)
    pg.mouse.click(*P(2,1.5));pg.wait_for_timeout(200)
    print('bar:',pg.inner_text('[data-act=pAdd]'))
    pg.click('[data-act=pAdd]');pg.wait_for_timeout(300)
    pg.click('[data-pwhere=line]');pg.wait_for_timeout(200);pg.select_option('#pItem','e-con');pg.wait_for_timeout(100)
    pg.evaluate("document.querySelector('svg.pv').scrollIntoView({block:'center'})");pg.wait_for_timeout(200)
    pg.mouse.click(*P(2,0));pg.wait_for_timeout(200)
    pg.fill('#pN','3');pg.dispatch_event('#pN','change');pg.wait_for_timeout(200)
    pg.click('[data-act=pAdd]');pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('svg.pv').scrollIntoView({block:'center'})");pg.screenshot(path='tests/e2e/shots/place.png')
    r=pg.evaluate("""async()=>{const a=await import('./js/app.js');const c=await import('./js/calc.js');const p=a.state.projects.find(x=>x.drawing);
      return {places:p.drawing.places.map(x=>[x.item,x.where,x.p||x.pts.length,x.rot||0]),lines:p.lines.filter(l=>/^pl/.test(l.fromDemo||'')).map(l=>[l.name,l.qty])}}""")
    print(json.dumps(r,ensure_ascii=False))
    pg.set_viewport_size({'width':390,'height':844});pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('#dwgMode').scrollIntoView({block:'start'})");pg.screenshot(path='tests/e2e/shots/place_m.png')
    print(errs or 'no errors');b.close()
