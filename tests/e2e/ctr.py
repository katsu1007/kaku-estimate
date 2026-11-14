from playwright.sync_api import sync_playwright
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_page()
    pg.goto('http://localhost:8765/old/');pg.wait_for_function('()=>(document.getElementById("engineFrame").contentWindow||{}).KakuEngine',timeout=30000)
    pg.click('.headline .btn.orange');pg.wait_for_timeout(300);pg.click('.tab[data-tab=drawing]')
    pg.set_input_files('#file',REAL_TOILET);pg.wait_for_timeout(200);pg.evaluate('KAKU_plan=null;KAKU_fix=null;runDrawingImport()')
    pg.wait_for_function('()=>KAKU_plan&&KAKU_fix',timeout=60000);pg.wait_for_timeout(500)
    print(pg.evaluate("KAKU_fix.fx.filter(x=>x.t==='counter'||x.t==='slop').map(x=>{const g=KF_gbox(x.b);return {t:x.t,x:+((g[0]+g[2])/2).toFixed(2),y:+((g[1]+g[3])/2).toFixed(2),w:+(g[2]-g[0]).toFixed(2),h:+(g[3]-g[1]).toFixed(2),bowls:x.bw}})"))
    print(pg.evaluate("(KAKU_plan.titles||[]).map(t=>[t.t,t.x,t.y])"))
    print(pg.evaluate("(()=>{let a=1e9,b=-1e9,c=1e9,d=-1e9;KAKU_plan.segs.forEach(s=>{a=Math.min(a,s[0],s[2]);b=Math.max(b,s[0],s[2]);c=Math.min(c,s[1],s[3]);d=Math.max(d,s[1],s[3])});return [a,b,c,d]})()"))
    b.close()
