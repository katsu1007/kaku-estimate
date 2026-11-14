from playwright.sync_api import sync_playwright
import json
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1100,'height':1500})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pid=pg.evaluate('location.hash').split('/')[2]
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300)
    pg.set_input_files('#dwgFile',REAL_TOILET);pg.wait_for_selector('#dwgFaces button',state='attached',timeout=60000);pg.wait_for_timeout(3000)
    pg.click('[data-act=selRest]');pg.wait_for_timeout(200)
    pg.click('[data-act=mkEach]');pg.wait_for_timeout(500)
    print('rooms',pg.evaluate("async()=>{const a=await import('./js/app.js');return a.state.projects[0].rooms.filter(r=>r.src==='plan').length}"))
    pg.click('[data-mode=light]');pg.wait_for_timeout(200)
    pg.select_option('#lUse','toilet') if pg.locator('#lUse option[value=toilet]').count() else None
    pg.click('[data-act=lAuto]');pg.wait_for_timeout(2500)
    d=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects[0];return p.drawing.plan.faces.length}")
    # place panel at some point
    pg.click('[data-ltool=panel]');pg.wait_for_timeout(100)
    box=pg.locator('svg.pv').bounding_box();pg.mouse.click(box['x']+box['width']*0.5,box['y']+box['height']*0.95);pg.wait_for_timeout(300)
    print(pg.inner_text('#dwgBar'))
    d=pg.evaluate("async()=>{const a=await import('./js/app.js');const c=await import('./js/calc.js');const p=a.state.projects[0];const t=c.totals(p,a.opts());return {doors:(p.drawing.doors||[]).length,n:p.drawing.lights.length,panel:p.drawing.panel,lines:p.lines.map((l,i)=>[l.name,l.spec,t.lines[i].qty,l.unit,l.note||'']).filter(x=>/照明|ダウン|スイッチ|VVF|分電|配線|取付/.test(x[0]))}}")
    print(json.dumps(d,ensure_ascii=False))
    pg.evaluate("document.querySelector('#dwgView').scrollIntoView({block:'start'})");pg.wait_for_timeout(300)
    pg.screenshot(path='tests/e2e/shots/light.png')
    print(errs or 'no errors')
    b.close()
