from playwright.sync_api import sync_playwright
import json
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_page(viewport={'width':1100,'height':1500})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pid=pg.evaluate('location.hash').split('/')[2]
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300)
    pg.set_input_files('#dwgFile',REAL_TOILET);pg.wait_for_selector('#dwgFaces button',state='attached',timeout=60000);pg.wait_for_timeout(3000)
    pg.click('[data-act=selRest]');pg.wait_for_timeout(200);pg.click('[data-act=mkEach]');pg.wait_for_timeout(500)
    pg.click('[data-mode=light]');pg.wait_for_timeout(200);pg.select_option('#lUse','toilet');pg.click('[data-act=lAuto]');pg.wait_for_timeout(2500)
    pg.click('[data-act=oAuto]');pg.wait_for_timeout(300)
    pg.click('[data-ltool=panel]');box=pg.locator('svg.pv').bounding_box();pg.mouse.click(box['x']+box['width']*0.5,box['y']+box['height']*0.95);pg.wait_for_timeout(300)
    info=pg.evaluate("""async()=>{const a=await import('./js/app.js');const pr=await import('./js/project.js');const c=await import('./js/calc.js');const p=a.state.projects[0];const W=pr.lightWires(p);const t=c.totals(p,a.opts());
      return {outFromReader:p.drawing.fixtures.filter(x=>x.out).length,fx:p.drawing.fixtures.map(x=>x.t).reduce((o,t)=>(o[t]=(o[t]||0)+1,o),{}),outlets:p.drawing.outlets.length,sws:W.sws.length,booths:W.booths,lenL:W.lenL.toFixed(2),lenO:W.lenO.toFixed(2),lenH:W.lenH.toFixed(2),far:W.far,
        lines:p.lines.filter(l=>l.fromDemo).map(l=>[l.name,l.spec.slice(-40),t.lines[p.lines.indexOf(l)].qty])}}""")
    print(json.dumps(info,ensure_ascii=False,indent=0))
    pg.evaluate("document.querySelector('#dwgView').scrollIntoView({block:'start'})");pg.wait_for_timeout(300);pg.screenshot(path='tests/e2e/shots/l2.png')
    # つなぎ替え
    pg.click('[data-ltool=link]')
    lt=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects[0];return [p.drawing.lights[0].x,p.drawing.lights[0].y]}")
    P=lambda x,y: pg.evaluate(f"(()=>{{const s=document.querySelector('svg.pv');const pt=s.createSVGPoint();pt.x={x};pt.y={-y};const q=pt.matrixTransform(s.getScreenCTM());return [q.x,q.y]}})()")
    x,y=P(*lt);pg.evaluate(f"window.scrollBy(0,{y}-500)");pg.wait_for_timeout(200);x,y=P(*lt);pg.mouse.click(x,y);pg.wait_for_timeout(150);print(pg.inner_text('#dwgBar')[-120:])
    sw=pg.evaluate("async()=>{const a=await import('./js/app.js');const pr=await import('./js/project.js');const p=a.state.projects[0];const W=pr.lightWires(p);const mine=W.assign[p.drawing.lights[0].id];return W.sws.find(s=>s.key!==mine).l}")
    x,y=P(*sw);pg.evaluate(f"window.scrollBy(0,{y}-500)");pg.wait_for_timeout(200);x,y=P(*sw);pg.mouse.click(x,y);pg.wait_for_timeout(200)
    print('link',pg.evaluate("async()=>{const a=await import('./js/app.js');const pr=await import('./js/project.js');const p=a.state.projects[0];const W=pr.lightWires(p);return [p.drawing.link,W.assign[p.drawing.lights[0].id]]}"))
    # 3D
    pg.click('[data-act=open3d]');pg.wait_for_timeout(9000)
    fr=[f for f in pg.frames if 'view3d' in f.url][0]
    i3=fr.evaluate("()=>{const P=KAKU_3Dparts();const e=P.filter(p=>p.type==='elec');const c={};e.forEach(p=>{c[p.attr.item]=(c[p.attr.item]||0)+1});const r=KW_calc();return {elec:c,wire:{lenL:r.lenL.toFixed(2),lenO:r.lenO.toFixed(2),lenH:r.lenH.toFixed(2),sws:r.sws.length,auto:r.autoSw}}}")
    print('3D',i3)
    pg.screenshot(path='tests/e2e/shots/l2_3d.png')
    # 3Dで窓を足したことにして閉じる（区画1の左の壁の真ん中）
    w=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects[0];const f=p.drawing.plan.faces.find(f=>f.i===p.rooms[1].faces[0]);const P=f.poly;return [(P[0][0]+P[1][0])/2,(P[0][1]+P[1][1])/2,p.rooms[1].name]}")
    fr.evaluate(f"()=>{{current.win3d=[{{p:[{w[0]},{w[1]}],w:1.2,h:1.0,sill:0.9}}]}}")
    pg.screenshot(path='tests/e2e/shots/l2b.png');print('frames',[f.url for f in pg.frames]);fr.evaluate("setTimeout(()=>document.querySelector('#k3d .k3close').click(),10)");pg.wait_for_timeout(600)
    print('win',w[2],pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects[0];return p.rooms.filter(r=>(r.windows||[]).length).map(r=>[r.name,r.windows])}"))
    print(errs or 'no errors')
    b.close()
