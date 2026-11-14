from playwright.sync_api import sync_playwright
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../gaisan/kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_page()
    pg.goto('http://localhost:8765/old/');pg.wait_for_function('()=>(document.getElementById("engineFrame").contentWindow||{}).KakuEngine',timeout=30000)
    pg.click('.headline .btn.orange');pg.wait_for_timeout(300);pg.click('.tab[data-tab=drawing]')
    pg.set_input_files('#file',REAL_TOILET);pg.wait_for_timeout(200);pg.evaluate('KAKU_plan=null;KAKU_fix=null;runDrawingImport()')
    pg.wait_for_function('()=>KAKU_plan&&KAKU_fix',timeout=60000);pg.wait_for_timeout(500)
    print(pg.evaluate("KAKU_fix.fx.filter(x=>x.t==='toilet').slice(0,3).map(x=>({b:x.b,w:+(x.b[2]-x.b[0]).toFixed(2),h:+(x.b[3]-x.b[1]).toFixed(2)}))"))
    print(pg.evaluate("Object.keys(KAKU_fix.fx[0])"))
    b.close()
