from playwright.sync_api import sync_playwright
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../gaisan/kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True);pg=ctx.new_page()
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pid=pg.evaluate('location.hash').split('/')[2]
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300)
    pg.set_input_files('#dwgFile',REAL_TOILET);pg.wait_for_selector('#dwgFaces button',state='attached',timeout=60000);pg.wait_for_timeout(300)
    oldn=pg.evaluate("()=>JSON.parse(localStorage.getItem('kaku-estimate-v1')||'[]').length")
    keys=pg.evaluate("Object.keys(localStorage).filter(k=>/kaku-(plan|fix)-/.test(k))")
    # select faces 25,13 (big rooms) by list and make one room each
    pg.click('#dwgFaces >> xpath=.. >> summary')
    for no in ['13 ','25 ']:
        pg.click(f'#dwgFaces button:text-matches("^{no}")')
    pg.click('[data-act=mkEach]');pg.wait_for_timeout(500)
    rooms=pg.evaluate("async()=>{const a=await import('./js/app.js');const c=await import('./js/calc.js');const p=a.state.projects[0];return p.rooms.map(r=>{const g=c.roomGeom(r,a.opts());return [r.name,r.area,r.perim,JSON.stringify(r.openRuns),g.wall,g.base]})}")
    for r in rooms: print(r)
    pg.evaluate("document.querySelector('#dwgView').scrollIntoView({block:'start'})");pg.evaluate("window.scrollBy(0,-70)")
    pg.screenshot(path='tests/e2e/shots/fx_plan.png')
    pg.click('[data-act=fixLines]');pg.wait_for_timeout(300)
    pg.screenshot(path='tests/e2e/shots/fx_dialog.png')
    pg.click('#fxGo');pg.wait_for_timeout(300)
    lines=pg.evaluate("async()=>{const a=await import('./js/app.js');return a.state.projects[0].lines.map(l=>l.name+' x'+l.qty)}")
    print('old projects',oldn,'leftover keys',keys,'lines',lines,errs or 'no errors')
    b.close()
