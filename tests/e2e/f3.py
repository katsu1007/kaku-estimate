from playwright.sync_api import sync_playwright
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../gaisan/kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':900,'height':1000},device_scale_factor=2)
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pid=pg.evaluate('location.hash').split('/')[2]
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300)
    pg.set_input_files('#dwgFile',REAL_TOILET);pg.wait_for_selector('#dwgFaces button',state='attached',timeout=60000);pg.wait_for_timeout(400)
    # 3Fだけを表示：viewBox を 3F の範囲に
    pg.evaluate("""()=>{const s=document.querySelector('svg.pv');s.setAttribute('viewBox',[-32.3,-5.6,5.6,11.2].join(' '));s.style.height='900px';
      const t=document.createElementNS('http://www.w3.org/2000/svg','text');t.setAttribute('x',-31.05);t.setAttribute('y',1.43+0.55);t.setAttribute('font-size','0.3');t.setAttribute('fill','#ff6b6b');t.setAttribute('font-weight','800');t.setAttribute('text-anchor','middle');t.textContent='← 見つけた洗面カウンター（1150×500）';s.appendChild(t)}""")
    pg.evaluate("document.querySelector('#dwgView').scrollIntoView({block:'start'})");pg.wait_for_timeout(300)
    el=pg.query_selector('svg.pv');el.screenshot(path='tests/e2e/shots/f3.png')
    b.close()
