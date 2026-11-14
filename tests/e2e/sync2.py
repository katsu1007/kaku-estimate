from playwright.sync_api import sync_playwright
import json,base64
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../gaisan/kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
FOLDER={}
def op(js):
    o=json.loads(js)
    if o['op']=='status': return json.dumps('KAKU共有')
    if o['op']=='pick': return json.dumps('KAKU共有')
    if o['op']=='list': return json.dumps([{'name':k,'text':v} for k,v in FOLDER.items() if k.endswith('.kaku.json')])
    if o['op']=='write':
        FOLDER[o['name']]=o.get('text') if 'text' in o else ('B64:'+str(len(base64.b64decode(o['b64']))))
        return json.dumps(True)
INIT="window.webkit={messageHandlers:{kakuFolder:{postMessage:o=>window.folderOp(JSON.stringify(o)).then(r=>JSON.parse(r))}}};"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    def device(name):
        ctx=b.new_context(viewport={'width':1100,'height':900});ctx.expose_function('folderOp',op);ctx.add_init_script(INIT)
        pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)));pg.errs=errs
        pg.goto('http://localhost:8765/');pg.wait_for_timeout(1000);pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
        return pg
    def syncbtn(pg):
        pg.goto('http://localhost:8765/#/settings');pg.wait_for_timeout(600);pg.click('#syNow');pg.wait_for_timeout(1500)
    A=device('A')
    A.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects[0];p.name='A邸 改修';a.touch(p);await a.flush();a.state.company.name='水野工務店';await a.saveKV('company',a.state.company)}")
    A.wait_for_timeout(3500)
    print('揃える前の自動:',sorted(FOLDER.keys()))
    syncbtn(A)
    A.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects[0];p.address='瀬戸市';a.touch(p);await a.flush()}");A.wait_for_timeout(3500)
    print('揃えた後の自動:',sorted(FOLDER.keys()));print('A 揃える:',A.inner_text('.toast') if A.locator('.toast').count() else '')
    B=device('B')
    syncbtn(B);print('B toast:',[t.inner_text() for t in B.locator('.toast').all()]);print('B st',B.evaluate("async()=>{const s=await import('./js/store.js');return [await s.getKV('syncState',null), (await s.listProjects()).map(p=>p.name)]}"))
    print('B:',B.evaluate("async()=>{const a=await import('./js/app.js');return {projects:a.state.projects.map(p=>p.name),company:a.state.company.name}}"))
    # 両方で直す
    B.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.name==='A邸 改修');p.customer='Bで入れた';a.touch(p);await a.flush()}");B.wait_for_timeout(3500)
    A.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.name==='A邸 改修');p.customer='Aで入れた';a.touch(p)}")
    # Aの自動書き込みより先に揃える（両方変わった状態）
    A.goto('http://localhost:8765/#/settings');A.wait_for_timeout(500)
    A.evaluate("async()=>{const a=await import('./js/app.js');await a.flush()}")
    A.click('#syNow');A.wait_for_timeout(1000)
    print('聞かれた:',A.inner_text('.modal').replace('\n',' / ') if A.locator('.modal').count() else '聞かれなかった')
    if A.locator('.modal [data-ok]').count(): A.click('.modal [data-ok]');A.wait_for_timeout(1000)
    print('A 結果:',A.evaluate("async()=>{const a=await import('./js/app.js');return a.state.projects.map(p=>[p.name,p.customer])}"))
    print('ファイル:',{k:(v[:30] if v.startswith('B64') else len(v)) for k,v in FOLDER.items()})
    print(A.errs+B.errs or 'no errors')
    b.close()
