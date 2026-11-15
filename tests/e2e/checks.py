# 入れ忘れのチェック・数量の根拠と確認済みの印・案件全体の「元に戻す」（スマホの幅）
from playwright.sync_api import sync_playwright
import os
os.makedirs('tests/e2e/shots', exist_ok=True)
U='http://localhost:8765/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(U);pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pid=pg.evaluate('location.hash').split('/')[2]
    step=lambda n:(pg.evaluate(f"location.hash='#/p/{pid}/{n}'"),pg.wait_for_timeout(500))
    P="(await import('./js/app.js')).state.projects[0]"
    ok=lambda name,c:print(('OK  ' if c else 'NG  ')+name)
    # ② 部屋を2つ（天井高は入れない）
    step(2)
    for w,d in ((4,3),(2,2)):
        pg.click('#addRoom');pg.wait_for_timeout(250)
        pg.locator('.roomc [data-rk=w]').last.fill(str(w));pg.locator('.roomc [data-rk=d]').last.fill(str(d));pg.wait_for_timeout(200)
    ok('部屋の札に「標準のまま・未入力」', pg.locator('.roomc').first.inner_text().count('標準のまま')==1)
    pg.wait_for_timeout(600)
    # ③ 一覧から選ぶ：壁のクロス（材料）と壁解体
    step(3)
    pg.click('[data-act=pick]');pg.wait_for_timeout(400)
    for q in ('クロス剥がし','量産品'):
        pg.fill('#pq',q);pg.wait_for_timeout(300)
        pg.locator('.modal [data-id]').first.click();pg.wait_for_timeout(200)
    pg.keyboard.press('Escape');pg.wait_for_timeout(200)
    if pg.locator('.modal-bg').count(): pg.locator('.modal [data-close]').first.click();pg.wait_for_timeout(200)
    print('行：',pg.evaluate(f"async()=>{P}.lines.map(l=>[l.name,l.cat,l.kind,l.basis&&l.basis.measure])"))
    # 品番・色：仕上げの材料の行だけ欄が出る。打つと見積書と Excel に載る
    ok('品番の欄は仕上げ材だけ', pg.locator('[data-lk=code]').count()==1)
    pg.fill('[data-lk=code]','SP-2801');pg.wait_for_timeout(700)
    r=pg.evaluate(f"async()=>{{const p={P};const a=await import('./js/app.js');const d=await import('./js/docs.js');const x=await import('./js/export.js');return [p.lines.find(l=>l.cat==='wall').code,d.estimateHtml(p,1,'2026年1月1日').includes('品番 SP-2801'),(await x.projectCsv(p,a.opts()).text()).includes('品番 SP-2801')]}}")
    ok('品番が保存され、見積書とCSVに載る', r==['SP-2801',True,True])
    # メーカーのサイトを開くボタン：品番を打つと品番のページに変わる（サンゲツの行）
    hrefs=pg.evaluate("[...document.querySelectorAll('.basisrow a.btn')].map(a=>[a.textContent.trim(),a.href,a.target])")
    ok('サンゲツの品番のページへのボタン', hrefs==[['サンゲツで品番を見る','https://www.sangetsu.co.jp/product/detail/SP2801/','_blank']])
    pg.fill('[data-lk=code]','');pg.wait_for_timeout(300)
    ok('品番が無い時はカタログ', pg.evaluate("document.querySelector('.basisrow a.btn').href")=='https://www.sangetsu.co.jp/digital_book/wall.html')
    pg.fill('[data-lk=code]','SP-2801');pg.wait_for_timeout(700)
    # 東リのシリーズが一覧から選べる
    pg.click('[data-act=pick]');pg.wait_for_timeout(400);pg.fill('#pq','ホスピリューム');pg.wait_for_timeout(300)
    ok('東リのシリーズが一覧に出る', '東リ 定価 4,200円/㎡' in pg.inner_text('.modal'))
    pg.locator('.modal [data-close]').first.click();pg.wait_for_timeout(300)
    # 根拠を開く
    pg.locator('[data-act=basis]').last.click();pg.wait_for_timeout(300)
    t=pg.inner_text('.modal');print(t[:400].replace('\n',' / '))
    ok('根拠に部屋ごとの内訳', '部屋 01' in t and '部屋 02' in t and '正味の合計（2 部屋）' in t)
    pg.screenshot(path='tests/e2e/shots/checks_basis.png')
    pg.click('#bsOk');pg.wait_for_timeout(300)
    ok('確認済みの印が付く', pg.locator('.linec').last.inner_text().count('確認済み')>=1)
    # ④ 入れ忘れ
    pg.wait_for_timeout(600);step(4)
    t=pg.inner_text('#workChk');print(t.replace('\n',' / ')[:600])
    ok('お客様の名前', 'お客様の名前が入っていません' in t)
    ok('天井高', '天井高が入っていません。標準の 2.4m' in t)
    ok('解体を入れると廃材処分の行が付く（壁 46.4㎡×0.05=2.32m³）', pg.evaluate(f"async()=>{{const p={P};const a=await import('./js/app.js');const c=await import('./js/calc.js');const w=p.lines.find(l=>l.basis&&l.basis.measure==='waste');return !!w&&c.lineQty(w,p.rooms,a.opts(),p.lines)===2.32}}") and '廃材の処分の行がありません' not in t)
    s=' '.join(pg.inner_text('#okSum').split());ok('確認済み 1／2', '確認済み 1 ／ 3 行' in s)
    pg.evaluate("document.querySelector('#workChk').scrollIntoView()");pg.screenshot(path='tests/e2e/shots/checks_work.png')
    small=pg.evaluate("[...document.querySelectorAll('#workChk button')].filter(b=>b.getBoundingClientRect().height<44).length")
    ok('ボタンの高さ44px以上', small==0)
    n0=pg.locator('#workChk .checks .chk').count()
    pg.locator('#workChk [data-woff=yojo]').click();pg.wait_for_timeout(300)
    ok('「要らない」で外れる', pg.locator('#workChk > .checks .chk').count()==n0-1 and '「要らない」にした物（1）' in pg.inner_text('#workChk'))
    pg.locator('#workChk details summary').click();pg.locator('#workChk [data-won=yojo]').click();pg.wait_for_timeout(300)
    ok('「戻す」で戻る', pg.locator('#workChk > .checks .chk').count()==n0)
    # 「見る」で部屋へ飛ぶ
    pg.locator('#workChk .chk:has-text("天井高") [data-wgo]').click();pg.wait_for_timeout(500)
    ok('「見る」で②部屋へ', pg.evaluate('location.hash').endswith('/2'))
    # 部屋の寸法を変える → 確認の後で変わりました
    pg.locator('.roomc [data-rk=w]').first.fill('5');pg.wait_for_timeout(700)
    step(4)
    ok('確認の後で変わった行が出る', '確認の後で変わった 1 行' in pg.inner_text('#okSum'))
    # 案件全体の元に戻す：部屋を消す → 戻す → やり直す
    step(2)
    pg.locator('.roomc [data-act=delRoom]').first.click();pg.wait_for_timeout(700)
    ok('部屋を消した', pg.locator('.roomc').count()==1)
    ok('戻すボタンが押せる', not pg.locator('#undoBtn').is_disabled())
    pg.click('#undoBtn');pg.wait_for_timeout(700)
    ok('戻すと部屋が2つ', pg.locator('.roomc').count()==2 and pg.locator('.roomc [data-rk=w]').first.input_value()=='5')
    pg.click('#undoBtn');pg.wait_for_timeout(700)
    ok('もう1つ戻すと幅が4', pg.locator('.roomc [data-rk=w]').first.input_value()=='4')
    pg.click('#redoBtn');pg.wait_for_timeout(700);pg.click('#redoBtn');pg.wait_for_timeout(700)
    ok('やり直すと部屋が1つ', pg.locator('.roomc').count()==1)
    pg.click('#undoBtn');pg.wait_for_timeout(700)
    # 廃材の行を自分で消すと入れ直さない。④のチェックに出て、ボタンで入れられる
    step(3);pg.locator('.linec:has(input[value="廃材処分"]) [data-act=delLine]').click();pg.wait_for_timeout(700)
    step(4);t=pg.inner_text('#workChk')
    ok('消すと「処分の行がありません」と出る', '廃材の処分の行がありません' in t)
    pg.click('[data-wfix=waste]');pg.wait_for_timeout(600)
    ok('ボタンで入れ直せる', pg.evaluate(f"async()=>{{const p={P};return p.lines.filter(l=>l.basis&&l.basis.measure==='waste').length}}")==1 and '廃材の処分の行がありません' not in pg.inner_text('#workChk'))
    step(2)
    # 現場調査のチェックリスト：部屋・天井高の「要実測」・気になっている所が載る。金額は載せない
    h=pg.evaluate(f"async()=>{{const p={P};const d=await import('./js/docs.js');return d.surveyHtml(p)}}")
    ok('現場調査の紙に部屋と要実測が載る', '現場調査チェックリスト' in h and '部屋 01' in h and '標準のまま・要実測' in h and '天井高が入っていません' in h and '諸経費' not in h)
    ok('現場調査の紙に金額は載せない', '¥' not in h and '円' not in h)
    step(5);ok('書類にボタンがある', pg.locator('[data-doc=survey]').count()==1)
    step(2)
    # 読み込み直しても保存されている
    pg.reload();pg.wait_for_timeout(900)
    ok('読み込み直しても部屋2つ・印も残る', pg.evaluate(f"async()=>{{const p={P};return p.rooms.length===2&&!!p.lines.find(l=>l.cat==='wall').ok}}"))
    ok('読み込み直すと戻すは空', pg.locator('#undoBtn').is_disabled())
    pg.screenshot(path='tests/e2e/shots/checks_top.png')
    print(errs or 'no errors');b.close()
