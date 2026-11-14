from playwright.sync_api import sync_playwright
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../gaisan/kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_page()
    pg.goto('http://localhost:8765/old/');pg.wait_for_function('()=>(document.getElementById("engineFrame").contentWindow||{}).KakuEngine',timeout=30000)
    pg.click('.headline .btn.orange');pg.wait_for_timeout(300);pg.click('.tab[data-tab=drawing]')
    pg.set_input_files('#file',REAL_TOILET);pg.wait_for_timeout(200);pg.evaluate('KAKU_plan=null;KAKU_fix=null;runDrawingImport()')
    pg.wait_for_function('()=>KAKU_plan&&KAKU_fix',timeout=60000);pg.wait_for_timeout(500)
    # 3F 右下：x -29.0〜-27.2、y -4.2〜-0.5 にある線（レイヤー別）と、1F・2Fの縦長カウンターの所の線
    r=pg.evaluate("""async()=>{const f=document.getElementById('file').files[0];const R=await KE_parseJWW(await f.arrayBuffer(),{blocks:true});const fac=KE_scaleUnits(R);
      const box=(x0,x1,y0,y1)=>{const o={};R.ents.forEach(e=>{const pts=e.k==='line'?[e.a,e.b]:(e.pts||[]);if(!pts.length)return;const ok=pts.some(p=>p[0]/1000>=x0&&p[0]/1000<=x1&&p[1]/1000>=y0&&p[1]/1000<=y1);if(!ok)return;const k=(e.ly||'')+' / '+e.k;o[k]=(o[k]||0)+1});return o};
      const det=(x0,x1,y0,y1,ly)=>R.ents.filter(e=>(e.ly||'')===ly&&(e.k==='line'?[e.a,e.b]:(e.pts||[])).some(p=>p[0]/1000>=x0&&p[0]/1000<=x1&&p[1]/1000>=y0&&p[1]/1000<=y1)).slice(0,12).map(e=>e.k==='line'?[e.a,e.b].map(p=>p.map(v=>Math.round(v)/1000)):e.k);
      const o3=box(-29.2,-27.0,-4.2,-0.4);const lys=Object.keys(o3);return {f3:o3, f2:box(-35.6,-33.8,-1.3,0.9), lines:lys.map(k=>[k,det(-29.2,-27.0,-4.2,-0.4,k.split(' / ')[0])])}}""")
    print(r)
    b.close()
