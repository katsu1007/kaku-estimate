from playwright.sync_api import sync_playwright
import json,sys
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../gaisan/kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
MODE=sys.argv[1]  # idb / mem
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':390,'height':844})
    seed={'app':'KAKU','projects':[{'id':'pX','name':'アプリに残っていた案件','rooms':[],'lines':[],'updatedAt':1}],'kv':{'settings':{'noticeSeen':True,'introSeen':True}}}
    init="window.__sent=[];window.webkit={messageHandlers:{kakuDB:{postMessage:s=>window.__sent.push(['db',s.length,JSON.parse(s).projects.map(p=>p.name)])},share:{postMessage:o=>window.__sent.push(['share',o.name,o.b64.length])},pdf:{postMessage:o=>window.__sent.push(['pdf',o.name,o.html.length])}}};window.__kakuDB="+json.dumps(seed)+";"
    if MODE=='mem': init+="Object.defineProperty(window,'indexedDB',{get(){throw new Error('no idb')},configurable:true});"
    ctx.add_init_script(init)
    pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(1500)
    print('home:',[t for t in pg.inner_text('body').split('\n') if 'アプリ' in t][:3])
    print('mem?',pg.evaluate("async()=>{const s=await import('./js/store.js');return s.usingMemory()}"))
    pg.goto('http://localhost:8765/#/p/pX/1');pg.wait_for_timeout(500)
    pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.id==='pX');p.name='書き換えた';a.touch(p);a.flush&&a.flush()}");pg.wait_for_timeout(2500)
    pg.goto('http://localhost:8765/#/p/pX/5');pg.wait_for_timeout(600)
    pg.evaluate("async()=>{const d=await import('./js/docs.js');await d.printDoc('<div class=doc><h1>御見積書</h1><p>テスト</p></div>')}")
    pg.evaluate("async()=>{const u=await import('./js/ui.js');await u.share(new Blob(['abc']),'テスト.csv')}");pg.wait_for_timeout(300)
    print(json.dumps(pg.evaluate("window.__sent"),ensure_ascii=False))
    print(errs or 'no errors')
    b.close()
