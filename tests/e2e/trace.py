from playwright.sync_api import sync_playwright
import json,sys
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1100,'height':900})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pid=pg.evaluate('location.hash').split('/')[2]
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300)
    pg.set_input_files('#dwgFile',sys.argv[1]);
    if sys.argv[1].endswith('.pdf'):
        pg.wait_for_selector('.modal [data-ok]',timeout=60000);print('ask:',pg.inner_text('.modal')[:80].replace('\n',' '));pg.click('.modal [data-ok]')
    pg.wait_for_selector('.sksheet',timeout=20000);pg.wait_for_selector('[data-a=scaleCancel]',timeout=20000);pg.wait_for_timeout(500)
    st=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.id==='%s');return {s:p.sketch.s,w:p.sketch.img.w,h:p.sketch.img.h}}"%pid)
    print(st)
    k=st['w']/1000  # original px -> rendered px
    def S(ix,iy):  # original image px -> screen
        x=ix*k*st['s'];y=iy*k*st['s']
        return pg.evaluate(f"(()=>{{const s=document.querySelector('#skSvg');const pt=s.createSVGPoint();pt.x={x};pt.y={y};const q=pt.matrixTransform(s.getScreenCTM());return [q.x,q.y]}})()")
    # zoom in once via button to test zoom, then click
    pg.click('.skview [data-z=in]');pg.wait_for_timeout(200)
    pg.mouse.click(*S(200,200));pg.wait_for_timeout(150);pg.mouse.click(*S(600,200));pg.wait_for_timeout(150)
    pg.fill('#skScale','4000');pg.click('[data-a=scaleSet]');pg.wait_for_timeout(300)
    for q in [(200,200),(600,203),(600,500),(201,500)]: pg.mouse.click(*S(*q));pg.wait_for_timeout(120)
    pg.mouse.click(*S(200,200));pg.wait_for_timeout(300)
    # second room, test pan first
    a=S(700,650);pg.mouse.move(*a);pg.mouse.down();pg.mouse.move(a[0]-30,a[1]-20,steps=5);pg.mouse.up();pg.wait_for_timeout(200)
    pg.click('[data-a=tapPhoto]');pg.wait_for_timeout(200)
    for q in [(600,200),(800,200),(800,500),(600,500)]: pg.mouse.click(*S(*q));pg.wait_for_timeout(120)
    pg.click('[data-a=tapDone]');pg.wait_for_timeout(300)
    pg.click('[data-a=meas]');pg.wait_for_timeout(100);pg.mouse.click(*S(200,500));pg.mouse.click(*S(800,500));pg.wait_for_timeout(200)
    print('meas:',pg.inner_text('.skpanel .skbox b:nth-of-type(2)') if pg.locator('.skpanel .skbox b').count()>1 else pg.inner_text('.skpanel'))
    pg.screenshot(path='tests/e2e/shots/trace1.png')
    pg.click('[data-a=measDone]');pg.wait_for_timeout(100)
    pg.click('[data-a=apply]');pg.wait_for_timeout(600)
    if pg.locator('.modal [data-ok]').count(): print('ask2:',pg.inner_text('.modal')[:60]);pg.click('.modal [data-ok]');pg.wait_for_timeout(500)
    r=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.id==='%s');return {name:p.drawing.fileName,bg:p.drawing.bg,rooms:p.rooms.map(r=>[r.name,r.area,r.perim])}}"%pid)
    print(json.dumps(r,ensure_ascii=False))
    if pg.locator('.modal [data-later]').count(): pg.click('.modal [data-later]')
    pg.evaluate("document.querySelector('svg.pv').scrollIntoView({block:'center'})");pg.wait_for_timeout(300);pg.screenshot(path='tests/e2e/shots/trace2.png')
    print(errs or 'no errors');b.close()
