from playwright.sync_api import sync_playwright
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1100,'height':1300})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pid=pg.evaluate('location.hash').split('/')[2]
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300)
    pg.set_input_files('#dwgFile',REAL_TOILET);pg.wait_for_selector('#dwgFaces button',state='attached',timeout=60000);pg.wait_for_timeout(3000)
    fb=lambda k: pg.evaluate(f"document.querySelectorAll('#dwgFaces button')[{k}].click()")
    fb(0);fb(1);pg.click('[data-act=mkOne]');pg.wait_for_timeout(400);pg.click('.modal [data-later]');pg.wait_for_timeout(200)
    print('前:',pg.evaluate("async()=>{const a=await import('./js/app.js');return a.state.projects[0].rooms.map(r=>[r.name,r.faces,r.area])}"))
    fb(1);pg.wait_for_timeout(200);pg.click('[data-act=unassign]');pg.wait_for_timeout(300)
    print('外した後:',pg.evaluate("async()=>{const a=await import('./js/app.js');return a.state.projects[0].rooms.map(r=>[r.name,r.faces,r.area])}"),[t.inner_text() for t in pg.locator('.toast').all()][-1:])
    # トイレにする：区画9（10.65㎡）
    pg.click('[data-mode=fix]');pg.wait_for_timeout(200)
    c=pg.evaluate("async()=>{const a=await import('./js/app.js');const f=a.state.projects[0].drawing.plan.faces.find(f=>f.no===9);let x=0,y=0;f.poly.forEach(q=>{x+=q[0]/f.poly.length;y+=q[1]/f.poly.length});return [x,y]}")
    P=pg.evaluate(f"(()=>{{const s=document.querySelector('svg.pv');const pt=s.createSVGPoint();pt.x={c[0]};pt.y={-c[1]};const q=pt.matrixTransform(s.getScreenCTM());return [q.x,q.y]}})()")
    pg.evaluate(f"window.scrollBy(0,{P[1]}-600)");pg.wait_for_timeout(200)
    P=pg.evaluate(f"(()=>{{const s=document.querySelector('svg.pv');const pt=s.createSVGPoint();pt.x={c[0]};pt.y={-c[1]};const q=pt.matrixTransform(s.getScreenCTM());return [q.x,q.y]}})()")
    pg.mouse.click(*P);pg.wait_for_timeout(300)
    n0=pg.evaluate("async()=>{const a=await import('./js/app.js');return a.state.projects[0].drawing.fixtures.length}")
    pg.click('[data-act=fxVirtual]');pg.wait_for_timeout(300)
    print('トイレにする:',n0,'→',pg.evaluate("async()=>{const a=await import('./js/app.js');const L=a.state.projects[0].drawing.fixtures;return [L.length,L[L.length-1]]}"),[t.inner_text() for t in pg.locator('.toast').all()][-1:])
    print(errs or 'no errors');b.close()
