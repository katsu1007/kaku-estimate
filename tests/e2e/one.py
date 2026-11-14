import time,sys
from playwright.sync_api import sync_playwright
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_page()
    logs=[];pg.on('pageerror',lambda e:logs.append('ERR '+str(e)));pg.on('console',lambda m:logs.append(m.type+' '+m.text) if m.type in('error','warning') else None)
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.evaluate("async()=>{const a=await import('./js/app.js');a.state.settings.noticeSeen=1;a.state.settings.introSeen=1}")
    pid=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.newProject({name:'t'});await a.flush();return p.id}")
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300)
    t=time.time();pg.set_input_files('#dwgFile',sys.argv[1])
    for i in range(60):
        pg.wait_for_timeout(1000)
        st=pg.evaluate("(document.querySelector('#dwgStatus')||{}).textContent||''")
        if pg.query_selector('#dwgFaces button'):break
    print('time',round(time.time()-t,1),'status',st[:120],'faces',len(pg.query_selector_all('#dwgFaces button')))
    print('\n'.join(logs[:8]))
    b.close()
