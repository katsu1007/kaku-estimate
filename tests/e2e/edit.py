from playwright.sync_api import sync_playwright
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1100,'height':1500})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pid=pg.evaluate('location.hash').split('/')[2]
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300)
    pg.set_input_files('#dwgFile',REAL_TOILET);pg.wait_for_selector('#dwgFaces button',state='attached',timeout=60000);pg.wait_for_timeout(400)
    pg.evaluate("()=>{const s=document.querySelector('svg.pv');s.setAttribute('viewBox',[-32.3,-5.0,5.6,10.4].join(' '));s.style.height='900px'}")
    pg.evaluate("document.querySelector('#dwgView').scrollIntoView({block:'start'})");pg.wait_for_timeout(200)
    P=lambda x,y: pg.evaluate(f"(()=>{{const s=document.querySelector('svg.pv');const pt=s.createSVGPoint();pt.x={x};pt.y={-y};const m=s.getScreenCTM();const q=pt.matrixTransform(m);return [q.x,q.y]}})()")
    cnt=lambda: pg.evaluate("async()=>{const a=await import('./js/app.js');const f=a.state.projects[0].drawing.fixtures;const c={};f.forEach(x=>c[x.t]=(c[x.t]||0)+1);return c}")
    print('before',cnt())
    # 器具を直す: 3F右下のステンレス手洗いの所をタップ → 手洗器を足す
    pg.click('[data-mode=fix]');pg.wait_for_timeout(100)
    print('bar', pg.inner_text('#dwgBar')[:80])
    x,y=P(-27.74,-2.1);print('xy',x,y, pg.evaluate(f"(()=>{{const e=document.elementFromPoint({x},{y});return e&&(e.tagName+' '+(e.className&&e.className.baseVal||e.className))}})()"));pg.mouse.click(x,y);pg.wait_for_timeout(200)
    print('bar2', pg.inner_text('#dwgBar')[:80])
    pg.select_option('#fxNewT','sink');pg.select_option('#fxNewB','E');pg.click('[data-act=fxAdd]');pg.wait_for_timeout(200)
    print('after add',cnt())
    # 便器を1つタップして種類を変える → 小便器に、次に消す→元に戻す
    pg.wait_for_timeout(3000);x,y=P(-31.05,-1.43);print('cnt3',pg.evaluate("async()=>{const a=await import('./js/app.js');return a.state.projects[0].drawing.fixtures.filter(f=>f.t==='counter').map(f=>f.b)}"));print('hit',pg.evaluate(f'(()=>{{const e=document.elementFromPoint({x},{y});return e&&e.tagName}})()'));pg.mouse.click(x,y);pg.wait_for_timeout(200)
    print('bar3',pg.inner_text('#dwgBar')[:60].replace('\n',' '), pg.evaluate("document.querySelector('#dwgMode .on')&&document.querySelector('#dwgMode .on').textContent"))
    print('selected type', pg.eval_on_selector('[data-fx=t]','s=>s.value'))
    pg.select_option('[data-fx=t]','sink');pg.wait_for_timeout(200)
    print('after change',cnt())
    pg.screenshot(path='tests/e2e/shots/edit_fix.png')
    # 測る: 3F の外壁の端から端
    pg.click('[data-mode=meas]');pg.wait_for_timeout(100)
    x,y=P(-31.8,-4.0);pg.mouse.click(x,y);x,y=P(-27.25,-4.0);pg.mouse.click(x,y);pg.wait_for_timeout(200)
    print('measure', pg.inner_text('#dwgBar').split('\n')[:3])
    pg.screenshot(path='tests/e2e/shots/edit_meas.png')
    print(errs or 'no errors')
    b.close()
