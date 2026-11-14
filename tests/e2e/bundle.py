from playwright.sync_api import sync_playwright
import json
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../gaisan/kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'])
    ctx=b.new_context(viewport={'width':390,'height':844})
    ctx.add_init_script("window.__sent=[];window.webkit={messageHandlers:{kakuDB:{postMessage:s=>window.__sent.push(['db',s.length])},share:{postMessage:o=>window.__sent.push(['share',o.name])},pdf:{postMessage:o=>window.__sent.push(['pdf',o.name])}}};window.__kakuDB=null;")
    pg=ctx.new_page();errs=[];bad=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('response',lambda r: bad.append(r.url) if r.status>=400 else None)
    pg.goto('http://localhost:8799/');pg.wait_for_timeout(1000)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pid=pg.evaluate('location.hash').split('/')[2]
    pg.goto(f'http://localhost:8799/#/p/{pid}/2');pg.wait_for_timeout(300)
    pg.set_input_files('#dwgFile',REAL_TOILET);pg.wait_for_selector('#dwgFaces button',state='attached',timeout=60000);pg.wait_for_timeout(3000)
    print('faces',pg.evaluate("async()=>{const a=await import('./js/app.js');return a.state.projects[0].drawing.plan.faces.length}"))
    pg.click('[data-act=open3d]');pg.wait_for_timeout(9000)
    fr=[f for f in pg.frames if 'view3d' in f.url]
    print('3D', fr[0].evaluate("KAKU_3Dparts().length") if fr else 'なし')
    print('404など',bad[:5]);print('sent',pg.evaluate("window.__sent.map(x=>x[0])"));print(errs or 'no errors')
    b.close()
