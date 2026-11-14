import time,sys,json
from playwright.sync_api import sync_playwright
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../gaisan/kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
f=sys.argv[1];tag=sys.argv[2]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_page(viewport={'width':1300,'height':1000})
    logs=[];pg.on('pageerror',lambda e:logs.append('ERR '+str(e)))
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.evaluate("async()=>{const a=await import('./js/app.js');a.state.settings.noticeSeen=1;a.state.settings.introSeen=1}")
    pid=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.newProject({name:'t'});await a.flush();return p.id}")
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300)
    t=time.time();pg.set_input_files('#dwgFile',f)
    d=None
    for i in range(150):
        pg.wait_for_timeout(1000)
        if pg.locator('.modal [data-later]').count(): pg.click('.modal [data-later]')
        if pg.locator('.modal [data-ok]').count(): print('modal:',pg.inner_text('.modal')[:200].replace('\n',' '));pg.click('.modal [data-cancel], .modal [data-later]') if pg.locator('.modal [data-cancel], .modal [data-later]').count() else None;break
        d=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.id==='%s');const d=p.drawing;if(!d||!d.plan)return null;const c={};(d.fixtures||[]).forEach(x=>c[x.t]=(c[x.t]||0)+1);return {faces:d.plan.faces.length,area:Math.round(d.plan.faces.reduce((s,f)=>s+(f.area||0),0)),fix:c,doors:(d.doors||[]).length,gsegs:(d.plan.gsegs||[]).length,ch:d.plan.ch||null}}"%pid)
        if d: break
    st=pg.evaluate("(document.querySelector('#dwgStatus')||{}).textContent||''")
    print(tag,'time',round(time.time()-t,1),'status',st[:150]);print(json.dumps(d,ensure_ascii=False))
    pg.wait_for_timeout(500)
    if pg.locator('#nt_ok').count(): pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300)
    if pg.locator('svg.pv').count(): pg.evaluate("document.querySelector('svg.pv').scrollIntoView({block:'center'})");pg.wait_for_timeout(300);pg.screenshot(path=f'tests/e2e/shots/new_{tag}.png')
    # 電気を数える
    try:
        with pg.expect_file_chooser(timeout=5000) as fc: pg.click('[data-act=elec]')
        fc.value.set_files(f)
        pg.wait_for_selector('.kesheet .ketype, .kesheet .kebody',timeout=120000);pg.wait_for_timeout(500)
        tt=pg.evaluate("[...document.querySelectorAll('.kesheet .ketype')].map(x=>x.querySelector('b').textContent+' = '+x.querySelector('.kecount').textContent+' -> '+(x.querySelector('select').selectedOptions[0]||{}).textContent)")
        pg.select_option('#keCable', index=1) if pg.locator('#keCable option').count()>1 else None
        print('ELEC types',len(tt));print('\n'.join(tt[:25]))
        print('wire',pg.inner_text('.kesheet .card b')[:40] if pg.locator('.kesheet .card b').count() else '')
        print('layers',pg.evaluate("[...document.querySelectorAll('.kesheet select[data-ly]')].map(s=>s.dataset.ly+':'+s.value).join(' ')"))
        pg.screenshot(path=f'tests/e2e/shots/elec_{tag}.png')
        if pg.locator('.kesheet [data-hl]').count(): pg.click('.kesheet [data-hl]');pg.wait_for_timeout(300);print('hl on',pg.locator('.kesheet .kemk.hl').count())
        pg.click('.kesheet [data-a=apply]');pg.wait_for_timeout(500)
        r=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.id==='%s');return {elec:p.elec&&p.elec.summary,lines:p.lines.filter(l=>/^el/.test(l.fromDemo||'')).map(l=>[l.name,l.qty,l.unit])}}"%pid)
        print(json.dumps(r,ensure_ascii=False)); print('row:',pg.inner_text('[data-act=elecOff]') if pg.locator('[data-act=elecOff]').count() else 'no off btn')
        pg.click('[data-act=elecOff]');pg.wait_for_timeout(300)
        print('after off',pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.id==='%s');return [!!p.elec,p.lines.filter(l=>/^el/.test(l.fromDemo||'')).length]}"%pid))
    except Exception as e: print('elec fail',e)
    print('\n'.join(logs[:8]))
    b.close()
