from playwright.sync_api import sync_playwright
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../gaisan/kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1100,'height':900})
    ctx.add_init_script("const P=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,k){if(v&&v.kind==='directory')v='（試験では保存しない）';return P.call(this,v,k)};window.showDirectoryPicker=async()=>{const r=await navigator.storage.getDirectory();return r.getDirectoryHandle('KAKU共有',{create:true})};")
    pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(1000);pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects[0];p.name='パソコンの案件';a.touch(p);await a.flush()}")
    pg.goto('http://localhost:8765/#/settings');pg.wait_for_timeout(600)
    print('表示:',pg.inner_text('#syName'))
    pg.click('#syPick');pg.wait_for_timeout(800);print('選んだ後:',pg.inner_text('#syName'))
    pg.click('#syNow');pg.wait_for_timeout(1500);print('揃える:',[t.inner_text() for t in pg.locator('.toast').all()])
    pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects[0];p.customer='自動で書く';a.touch(p);await a.flush()}");pg.wait_for_timeout(3500)
    print(pg.evaluate("async()=>{const d=await (await navigator.storage.getDirectory()).getDirectoryHandle('KAKU共有');const o=[];for await (const [n,h] of d.entries()){const f=await h.getFile();o.push([n,f.size,n.endsWith('.json')?JSON.parse(await f.text()).project?.customer:''])}return o}"))
    print(errs or 'no errors')
    b.close()
