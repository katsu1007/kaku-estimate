from playwright.sync_api import sync_playwright
import json
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../gaisan/kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1100,'height':800},accept_downloads=True)
    pg=ctx.new_page()
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pid=pg.evaluate('location.hash').split('/')[2]
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(400)
    pg.click('[data-act=sketch]');pg.wait_for_timeout(300)
    # ① 四角
    pg.fill('#skName','洋室');pg.fill('#skW','3640');pg.fill('#skH','2730');pg.click('[data-a=rect]');pg.wait_for_timeout(200)
    # ② L字：→4000 ↑2000 ←2000 ↑1000 ←2000 ↓3000
    pg.fill('#skName','LDK');pg.click('[data-a=draft]');pg.wait_for_timeout(100)
    for d,l in [(1,4000),(0,2000),(3,2000),(0,1000),(3,2000),(2,3000)]:
        pg.click(f'[data-dir="{d}"]');pg.fill('#skLen',str(l));pg.click('[data-a=edge]');pg.wait_for_timeout(80)
    # ③ 写真：角を4つタップ → 寸法
    pg.fill('#skName','写真の部屋')
    pg.set_input_files('#skPhoto','tests/e2e/fixtures/plan.jpg');pg.wait_for_timeout(900);pg.click('[data-a=scaleCancel]');pg.click('[data-a=tapPhoto]');pg.wait_for_timeout(200)
    P=lambda x,y: pg.evaluate(f"(()=>{{const s=document.querySelector('#skSvg');const pt=s.createSVGPoint();pt.x={x};pt.y={y};const q=pt.matrixTransform(s.getScreenCTM());return [q.x,q.y]}})()")
    # 写真の座標 → 図の座標：s=10/800 → (100,100)=(1.25,1.25)…
    for px,py in [(100,400),(100,100),(600,100),(600,400)]:
        x,y=P(px*10/800,py*10/800);pg.mouse.click(x,y);pg.wait_for_timeout(80)
    pg.click('[data-a=tapDone]');pg.wait_for_timeout(200)
    for l in [3000,5000,3000,5000]:
        pg.fill('#skFix',str(l));pg.click('[data-a=fix]');pg.wait_for_timeout(120)
    pg.screenshot(path='tests/e2e/shots/sk.png')
    sk=pg.evaluate("async()=>{const a=await import('./js/app.js');const s=await import('./js/sketch.js');const p=a.state.projects[0];return p.sketch.rooms.map(r=>[r.name,+s.area(r.v).toFixed(4),+s.peri(r.v).toFixed(4),r.bad||'',r.c.filter(c=>!c.ok).length])}")
    print('sketch',sk, pg.evaluate("async()=>{const s=await import('./js/sketch.js');const a=await import('./js/app.js');return s.shapeProblems(a.state.projects[0].sketch.rooms)}"))
    pg.click('[data-a=apply]');pg.wait_for_timeout(500)
    if pg.locator('.modal [data-ok]').count(): pg.click('.modal [data-ok]');pg.wait_for_timeout(400)
    r=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects[0];return {rooms:p.rooms.map(r=>[r.name,r.area,r.perim,r.src]),faces:p.drawing.plan.faces.length}}")
    print('rooms',r)
    pg.screenshot(path='tests/e2e/shots/sk2.png')
    # 書き出し（JWW）
    pg.click('[data-act=cadOut]');pg.wait_for_timeout(200)
    with pg.expect_download() as dl: pg.click('.modal [data-fmt=jww]')
    path='tests/e2e/out/dl/out.jww';dl.value.save_as(path)
    with pg.expect_download() as dl2:
        pg.click('[data-act=cadOut]');pg.wait_for_timeout(200);pg.click('.modal [data-fmt=dxf]')
    dl2.value.save_as('tests/e2e/out/dl/out.dxf')
    # 読み直す
    pg.goto('http://localhost:8765/#/');pg.wait_for_timeout(300);pg.click('#aDwg');pg.wait_for_timeout(400)
    pg.set_input_files('#dwgFile',path);pg.wait_for_selector('#dwgFaces button',state='attached',timeout=60000);pg.wait_for_timeout(2500)
    f=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.drawing&&!x.drawing.sketch);return p.drawing.plan.faces.map(f=>[+f.area.toFixed(3),+f.peri.toFixed(3)]).sort((a,b)=>a[0]-b[0])}")
    print('reimport jww',f)
    print(errs or 'no errors')
    b.close()
