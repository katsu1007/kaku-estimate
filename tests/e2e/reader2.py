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
    fx=pg.evaluate(J+"return [p.drawing.fixtures.filter(x=>x.t!=='other').length,p.drawing.fixtures.filter(x=>x.r2).length,(p.drawing.analysis.equip||[]).length]}")
    ok('入れると、表題欄の中の「器具」（会社のマーク）を器具の数から外す・表の設備機器が出る', fx[0]==0 and fx[1]==1 and fx[2]>=5 and '表の設備機器' in pg.inner_text('body'))
    # 器具を1つ足して「器具を明細に入れる」→ 図面の表の品番が本体の行に入る
    pg.evaluate(J+"p.drawing.fixtures.push({t:'toilet',b:[-5,3,-4.5,3.8],back:'N',added:true});a.touch(p)}");pg.wait_for_timeout(600);pg.reload();pg.wait_for_timeout(1500)
    pg.click('[data-act=fixLines]');pg.wait_for_timeout(500)
    ok('明細に入れる画面に、図面の品番が出る', '図面の品番 CS232B+SH232BA(TOTO)' in pg.inner_text('.modal'))
    pg.click('#fxGo');pg.wait_for_timeout(700)
    ok('本体の行に品番が入る（取付の手間の行には入れない）', pg.evaluate(J+"const L=p.lines.filter(l=>l.fromFix==='toilet');return L.length===2&&L.find(l=>l.kind!=='labor').code==='CS232B+SH232BA(TOTO)'&&!L.find(l=>l.kind==='labor').code}"))
    pg.click('[data-act=selRest]');pg.wait_for_timeout(400);n2=pg.evaluate("document.querySelectorAll('svg.pv .faces polygon[fill-opacity=\"0.45\"]').length")
    ok('「全部選ぶ」に、印の付いた区画は入らない', n2==st[3]-st[1]-st[2]);pg.click('[data-act=selClear]');pg.wait_for_timeout(300)
    pg.wait_for_timeout(700);pg.reload();pg.wait_for_timeout(1500)
    ok('読み込み直しても切り替えと印が残る', pg.evaluate(J+"return p.drawing.reader==='v2'&&Object.keys(p.drawing.analysis.marks).length===%d}"%(st[1]+st[2])) and pg.locator('svg.pv polygon[fill="#8a93a0"]').count()==st[1])
    pg.uncheck('[data-reader2]');pg.wait_for_timeout(800)
    ok('外すと今まで通りに戻る（器具の数も）', pg.locator('svg.pv polygon[fill="#8a93a0"]').count()==0 and pg.evaluate(J+"return !p.drawing.reader&&p.drawing.fixtures.filter(x=>x.t!=='other').length===2&&!p.drawing.fixtures.some(x=>x.r2)}"))
    print(errs or 'no errors');b.close()
