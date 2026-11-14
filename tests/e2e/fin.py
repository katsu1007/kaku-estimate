from playwright.sync_api import sync_playwright
import json
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../gaisan/kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2,has_touch=True,is_mobile=True)
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pid=pg.evaluate('location.hash').split('/')[2]
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300)
    pg.set_input_files('#dwgFile',REAL_TOILET);pg.wait_for_selector('#dwgFaces button',state='attached',timeout=60000);pg.wait_for_timeout(3000)
    fb=lambda k: pg.evaluate(f"document.querySelectorAll('#dwgFaces button')[{k}].click()")
    pg.evaluate("document.querySelector('#dwgFaces').closest('details')&&(document.querySelector('#dwgFaces').closest('details').open=true)")
    fb(0);fb(1);pg.wait_for_timeout(200)
    print(pg.inner_text('#dwgBar')[:80].replace('\n',' '))
    pg.click('[data-act=mkOne]');pg.wait_for_timeout(500)
    pg.screenshot(path='tests/e2e/shots/fin1.png')
    pg.select_option('[data-slot=fF]','fl-cf') if pg.locator('[data-slot=fF] option[value=fl-cf]').count() else pg.select_option('[data-slot=fF]',index=1)
    pg.select_option('[data-slot=wF]','wl-cloth');pg.select_option('[data-slot=cF]',index=1);pg.select_option('[data-slot=bF]',index=1);pg.select_option('[data-slot=wD]','w-dW-cloth')
    pg.click('.modal [data-ok]');pg.wait_for_timeout(400)
    fb(2);pg.wait_for_timeout(200);pg.click('[data-act=mkOne]');pg.wait_for_timeout(500)
    pg.click('.modal [data-same]');pg.click('.modal [data-ok]');pg.wait_for_timeout(400)
    r2=pg.evaluate("async()=>{const a=await import('./js/app.js');return a.state.projects[0].rooms.map(r=>r.id)}")
    # 2つ目の部屋の壁だけタイルに
    pg.evaluate(f"document.querySelector('[data-room=\"{r2[1]}\"] [data-act=roomFin]').click()");pg.wait_for_timeout(300)
    pg.select_option('[data-slot=wF]','wl-tile');pg.click('.modal [data-ok]');pg.wait_for_timeout(400)
    r=pg.evaluate("""async()=>{const a=await import('./js/app.js');const c=await import('./js/calc.js');const p=a.state.projects[0];const t=c.totals(p,a.opts());
      const G=p.rooms.map(r=>({n:r.name,id:r.id,g:c.roomGeom(r,a.opts())}));
      return {rooms:G.map(x=>[x.n,x.id,+x.g.floor.toFixed(3),+x.g.wall.toFixed(3),+x.g.base.toFixed(3)]),lines:p.lines.map((l,i)=>[l.name,l.basis&&l.basis.measure,JSON.stringify(l.basis&&l.basis.rooms),t.lines[i].qty])}}""")
    print(json.dumps(r,ensure_ascii=False,indent=0))
    pg.evaluate(f"document.querySelector('[data-room=\"{r2[1]}\"]').scrollIntoView({{block:'start'}})");pg.wait_for_timeout(200);pg.screenshot(path='tests/e2e/shots/fin2.png')
    print(errs or 'no errors')
    b.close()
