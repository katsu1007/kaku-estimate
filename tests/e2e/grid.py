from playwright.sync_api import sync_playwright
import sys
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../gaisan/kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1000,'height':1200});errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    for f in sys.argv[1:]:
        pid=pg.evaluate("async()=>{const a=await import('./js/app.js');return a.newProject().id}")
        pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(400)
        pg.set_input_files('#dwgFile',f);pg.wait_for_selector('#dwgFaces button',state='attached',timeout=60000);pg.wait_for_timeout(1500)
        n=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.id==='%s');return (p.drawing.plan.gsegs||[]).length}"%pid)
        print(f.split('/')[-1],n,pg.locator('[data-z=grid]').count())
        if n:
            pg.click('[data-z=grid]');pg.wait_for_timeout(200);print('出した:',pg.evaluate("document.querySelector('.pv-grid').getAttribute('display')"));pg.evaluate("document.querySelector('svg.pv').scrollIntoView({block:'center'})");pg.screenshot(path='tests/e2e/shots/grid.png');break
    print(errs or 'no errors');b.close()
