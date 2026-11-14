from playwright.sync_api import sync_playwright
import json
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_page(viewport={'width':1100,'height':800})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pid=pg.evaluate('location.hash').split('/')[2]
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300)
    pg.set_input_files('#dwgFile',REAL_TOILET);pg.wait_for_selector('#dwgFaces button',state='attached',timeout=60000);pg.wait_for_timeout(3000)
    pg.click('[data-act=selRest]');pg.wait_for_timeout(200);pg.click('[data-act=mkEach]');pg.wait_for_timeout(500)
    pg.click('[data-mode=light]');pg.wait_for_timeout(200);pg.select_option('#lUse','toilet');pg.click('[data-act=lAuto]');pg.wait_for_timeout(2500)
    pg.click('[data-ltool=panel]');box=pg.locator('svg.pv').bounding_box();pg.mouse.click(box['x']+box['width']*0.5,box['y']+box['height']*0.95);pg.wait_for_timeout(300)
    pg.click('[data-act=open3d]');pg.wait_for_timeout(9000)
    fr=[f for f in pg.frames if 'view3d' in f.url][0]
    info=fr.evaluate("()=>({eng:KAKU_3Dengine(),parts:KAKU_3Dparts().length,types:Object.entries(KAKU_3Dparts().reduce((a,p)=>(a[p.type]=(a[p.type]||0)+1,a),{})),oldList:localStorage.getItem('kaku-estimate-v1')})")
    print(info)
    pg.screenshot(path='tests/e2e/shots/3d.png')
    fr.click('#k3d .k3close');pg.wait_for_timeout(300)
    print('layer left:',len([f for f in pg.frames if 'view3d' in f.url]))
    print(errs or 'no errors')
    b.close()
