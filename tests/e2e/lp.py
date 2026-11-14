from playwright.sync_api import sync_playwright
import json
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../gaisan/kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pg.evaluate("async()=>{const a=await import('./js/app.js');a.newProject({name:'消す案件'});a.newProject({name:'残す案件'});await a.flush()}")
    pg.goto('http://localhost:8765/#/projects');pg.wait_for_timeout(600)
    r=pg.locator('tr[data-open]',has_text='消す案件').bounding_box()
    pg.mouse.move(r['x']+50,r['y']+20);pg.mouse.down();pg.wait_for_timeout(700);pg.mouse.up();pg.wait_for_timeout(300)
    print('メニュー:',pg.inner_text('.modal').replace('\n',' / ') if pg.locator('.modal').count() else 'なし', ' 場所:',pg.evaluate('location.hash'))
    pg.screenshot(path='tests/e2e/shots/lp.png')
    pg.click('.modal [data-m=del]');pg.wait_for_timeout(500)
    print('削除後:',pg.evaluate("async()=>{const a=await import('./js/app.js');return a.state.projects.map(p=>p.name)}"), [t.inner_text() for t in pg.locator('.toast').all()])
    # 照明：区画のまま・ドラッグ
    pid=pg.evaluate("async()=>{const a=await import('./js/app.js');return a.state.projects.find(p=>p.name==='残す案件').id}")
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300)
    pg.set_input_files('#dwgFile',REAL_TOILET);pg.wait_for_selector('#dwgFaces button',state='attached',timeout=60000);pg.wait_for_timeout(3000)
    pg.click('[data-mode=light]');pg.wait_for_timeout(300)
    print('ボタン:',pg.inner_text('[data-act=lAuto]'))
    pg.click('[data-act=lAuto]');pg.wait_for_timeout(3500)
    print('並べた:',pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.id==='%s');return [p.rooms.length,p.drawing.lights.length,p.drawing.outlets.length,p.lines.filter(l=>l.fromDemo).map(l=>l.name+' '+l.qty).slice(0,6)]}"%pid))
    # 照明を縦になぞる（区画9の照明1つ）
    L=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.id==='%s');const f=p.drawing.plan.faces.find(f=>f.area>9);const ls=p.drawing.lights.filter(l=>l.face===f.i);return ls.map(l=>[l.x,l.y])}"%pid)
    print('区画の照明:',L)
    P=lambda x,y: pg.evaluate(f"(()=>{{const s=document.querySelector('svg.pv');const pt=s.createSVGPoint();pt.x={x};pt.y={-y};const q=pt.matrixTransform(s.getScreenCTM());return [q.x,q.y]}})()")
    pg.evaluate("document.querySelector('svg.pv').scrollIntoView({block:'center'})");pg.wait_for_timeout(200)
    x0,y0=P(*L[0]);x1,y1=P(L[0][0],L[0][1]-0.5)
    pg.mouse.move(x0,y0);pg.mouse.down();pg.mouse.move(x0,y0+3);pg.mouse.move((x0+x1)/2,(y0+y1)/2);pg.mouse.move(x1,y1);pg.mouse.up();pg.wait_for_timeout(300)
    L2=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.id==='%s');const f=p.drawing.plan.faces.find(f=>f.area>9);return p.drawing.lights.filter(l=>l.face===f.i).map(l=>[l.x,l.y])}"%pid)
    print('なぞった後:',L2, [t.inner_text() for t in pg.locator('.toast').all()][-1:])
    # 3D 幕
    pg.click('[data-act=open3d]');pg.wait_for_timeout(400)
    print('3D待ち:',pg.evaluate("[...document.body.children].filter(e=>e.textContent==='3Dを用意しています…').length"), pg.evaluate("[...document.querySelectorAll('iframe')].map(f=>f.style.visibility)"))
    pg.wait_for_timeout(9000)
    print('3D後:',pg.evaluate("[...document.body.children].filter(e=>e.textContent==='3Dを用意しています…').length"), pg.evaluate("[...document.querySelectorAll('iframe')].filter(f=>f.title==='3Dで見る').map(f=>f.style.visibility)"))
    print(errs or 'no errors');b.close()
