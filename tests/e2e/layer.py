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
    rid=pg.evaluate("async()=>{const a=await import('./js/app.js');return a.state.projects[0].rooms[0].id}")
    pg.evaluate(f"document.querySelector('[data-room=\"{rid}\"] [data-act=roomFin]').click()");pg.wait_for_timeout(300)
    ids=pg.evaluate("[...document.querySelectorAll('[data-slot=wD] option')].map(o=>o.value).filter(Boolean)")
    pg.select_option('[data-slot=wD]',ids[0]);pg.select_option('[data-slot=wD2]',ids[1]);pg.click('.modal [data-ok]');pg.wait_for_timeout(300)
    pg.click('[data-mode=wall]');pg.wait_for_timeout(200)
    P=lambda x,y: pg.evaluate(f"(()=>{{const s=document.querySelector('svg.pv');const pt=s.createSVGPoint();pt.x={x};pt.y={-y};const q=pt.matrixTransform(s.getScreenCTM());return [q.x,q.y]}})()")
    pg.evaluate("document.querySelector('svg.pv').scrollIntoView({block:'center'})");pg.wait_for_timeout(200)
    pg.mouse.click(*P(2,0));pg.wait_for_timeout(200)
    pg.select_option('#wItem',ids[0]);pg.select_option('#wMore',pg.evaluate("[...document.querySelectorAll('#wMore option')].map(o=>o.value).filter(Boolean)").__getitem__(1) if False else ids[1]);pg.select_option('#wFin','');pg.select_option('#wBase','')
    pg.click('[data-act=wallAdd]');pg.wait_for_timeout(300)
    r=pg.evaluate("""async()=>{const a=await import('./js/app.js');const c=await import('./js/calc.js');const p=a.state.projects[0];const t=c.totals(p,a.opts());
      return {off:p.rooms[0].wallOff,lines:p.lines.map((l,i)=>[l.name,l.layer||1,l.fromDemo||'部屋',t.lines[i].qty])}}""")
    print(json.dumps(r,ensure_ascii=False))
    print(errs or 'no errors');b.close()
