from playwright.sync_api import sync_playwright
import json,sys
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../gaisan/kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page()
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    for fn in ['out.jww','out.dxf']:
        pg.goto('http://localhost:8765/#/');pg.wait_for_timeout(300);pg.click('#aDwg');pg.wait_for_timeout(400)
        pg.set_input_files('#dwgFile','tests/e2e/out/dl/'+fn);pg.wait_for_selector('#dwgFaces button',state='attached',timeout=60000);pg.wait_for_timeout(2500)
        f=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects[0];return {segs:p.drawing.plan.segs.length,faces:p.drawing.plan.faces.map(f=>[f.name,+f.area.toFixed(3),+f.peri.toFixed(3),f.poly.map(q=>q.map(v=>+v.toFixed(3)))])}}")
        print(fn,f['segs']);[print('  ',x) for x in f['faces']]
    b.close()
