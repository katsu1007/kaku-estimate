# 新しい読み取り（試し）の切り替え：既定では何も変わらない／入れると図枠・表の区画に印が出る／全部選ぶから外れる／元に戻す／保存
# 実図面が要る（.real/toilet_plan.jww。お客さんの図面なのでリポジトリには入れない）。場所は KAKU_REAL_PLAN で変えられる
import os,sys,json
from playwright.sync_api import sync_playwright
F=os.environ.get('KAKU_REAL_PLAN','.real/toilet_plan.jww');os.makedirs('tests/e2e/shots',exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_page(viewport={'width':1400,'height':1000},device_scale_factor=2)
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    ok=lambda n,c:print(('OK  ' if c else 'NG  ')+n)
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.evaluate("async()=>{const a=await import('./js/app.js');a.state.settings.noticeSeen=1;a.state.settings.introSeen=1;a.state.settings.theme='light';a.applyTheme()}")
    pid=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.newProject({name:'t'});await a.flush();return p.id}")
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300);pg.set_input_files('#dwgFile',F)
    for i in range(240):
        pg.wait_for_timeout(1000)
        if pg.locator('.modal [data-later]').count(): pg.click('.modal [data-later]')
        if pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.id==='%s');return !!(p.drawing&&p.drawing.plan&&p.drawing.fixtures)}"%pid): break
    pg.wait_for_timeout(1000)
    for k in range(5):
        if not pg.locator('.modal-bg').count(): break
        if pg.locator('#nt_ok').count(): pg.check('#nt_ok');pg.click('#nt_go')
        else: pg.keyboard.press('Escape')
        pg.wait_for_timeout(300)
    J="async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.id==='%s');"%pid
    st=pg.evaluate(J+"return [p.drawing.reader||null,p.drawing.analysis.stats.out,p.drawing.analysis.stats.hold,p.drawing.plan.faces.length]}")
    print('読み込み後',st)
    ok('既定は今までの読み取り（印は出さない）', st[0] is None and pg.locator('svg.pv polygon[fill="#8a93a0"]').count()==0)
    pg.click('[data-act=selRest]');pg.wait_for_timeout(400);n_all=pg.evaluate("document.querySelectorAll('svg.pv .faces polygon[fill-opacity=\"0.45\"]').length")
    ok('既定の「全部選ぶ」は全部の区画', n_all==st[3]);pg.click('[data-act=selClear]');pg.wait_for_timeout(300)
    pg.check('[data-reader2]');pg.wait_for_timeout(800)
    grey=pg.locator('svg.pv polygon[fill="#8a93a0"]').count();dash=pg.locator('svg.pv polygon[stroke-dasharray]').count()
    ok('入れると、除外は灰色・保留は点線で出る', grey==st[1] and dash==st[2] and st[1]>0)
    pg.evaluate("document.querySelector('svg.pv').scrollIntoView({block:'center'})");pg.wait_for_timeout(400);pg.locator('svg.pv').screenshot(path='tests/e2e/shots/reader2.png')
    pg.click('[data-act=selRest]');pg.wait_for_timeout(400);n2=pg.evaluate("document.querySelectorAll('svg.pv .faces polygon[fill-opacity=\"0.45\"]').length")
    ok('「全部選ぶ」に、印の付いた区画は入らない', n2==st[3]-st[1]-st[2]);pg.click('[data-act=selClear]');pg.wait_for_timeout(300)
    pg.wait_for_timeout(700);pg.reload();pg.wait_for_timeout(1500)
    ok('読み込み直しても切り替えと印が残る', pg.evaluate(J+"return p.drawing.reader==='v2'&&Object.keys(p.drawing.analysis.marks).length===%d}"%(st[1]+st[2])) and pg.locator('svg.pv polygon[fill="#8a93a0"]').count()==st[1])
    pg.uncheck('[data-reader2]');pg.wait_for_timeout(800)
    ok('外すと今まで通りに戻る', pg.locator('svg.pv polygon[fill="#8a93a0"]').count()==0 and pg.evaluate(J+"return !p.drawing.reader}"))
    print(errs or 'no errors');b.close()
