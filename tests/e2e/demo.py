from playwright.sync_api import sync_playwright
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../gaisan/kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1100,'height':1500})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pid=pg.evaluate('location.hash').split('/')[2]
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300)
    pg.set_input_files('#dwgFile',REAL_TOILET);pg.wait_for_selector('#dwgFaces button',state='attached',timeout=60000);pg.wait_for_timeout(3000)
    pg.evaluate("()=>{const s=document.querySelector('svg.pv');s.setAttribute('viewBox',[-32.3,-5.0,5.6,10.4].join(' '));s.style.height='900px'}")
    pg.evaluate("document.querySelector('#dwgView').scrollIntoView({block:'start'})");pg.wait_for_timeout(200)
    P=lambda x,y: pg.evaluate(f"(()=>{{const s=document.querySelector('svg.pv');const pt=s.createSVGPoint();pt.x={x};pt.y={-y};const q=pt.matrixTransform(s.getScreenCTM());return [q.x,q.y]}})()")
    pg.click('[data-mode=wall]');pg.wait_for_timeout(100)
    # 区画28と区画29の間の壁（縦の線）あたりと、3F下の外壁あたりをタップ
    for xy in [(-29.6,-1.0),(-30.5,-4.0)]:
        x,y=P(*xy);pg.mouse.click(x,y);pg.wait_for_timeout(150)
    print('wall bar', pg.inner_text('#dwgBar').split('\n')[0])
    sel=pg.evaluate("async()=>{const a=await import('./js/app.js');return 0}")
    pg.fill('#wH','2.4');pg.click('[data-act=wallAdd]');pg.wait_for_timeout(300)
    pg.click('[data-mode=cut]');pg.wait_for_timeout(100)
    for xy in [(-31.5,-3.0),(-30.9,0.0)]:
        x,y=P(*xy);pg.mouse.click(x,y);pg.wait_for_timeout(200)
    pg.wait_for_timeout(300)
    d=pg.evaluate("async()=>{const a=await import('./js/app.js');const c=await import('./js/calc.js');const p=a.state.projects[0];const t=c.totals(p,a.opts());return {walls:p.drawing.walls,hatsu:p.drawing.hatsu,lines:p.lines.map((l,i)=>[l.name,l.spec,t.lines[i].qty,l.unit,t.lines[i].amount])}}")
    import json;print(json.dumps(d,ensure_ascii=False,indent=0)[:2500])
    pg.wait_for_timeout(3000)
    pg.evaluate("document.querySelector('#dwgView').scrollIntoView({block:'start'})")
    pg.screenshot(path='tests/e2e/shots/demo.png')
    print(errs or 'no errors')
    b.close()
