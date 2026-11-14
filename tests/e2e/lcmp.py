from playwright.sync_api import sync_playwright
import json
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
    pg.set_input_files('#dwgFile',REAL_TOILET);pg.wait_for_selector('#dwgFaces button',state='attached',timeout=60000);pg.wait_for_timeout(3000)
    r=pg.evaluate("""async()=>{const a=await import('./js/app.js');const L=await import('./js/lighting.js');const g=await import('./js/legacy.js');const dr=await import('./js/drawing.js');
      const W=[...document.querySelectorAll('iframe')].map(f=>f.contentWindow).find(w=>{try{return typeof w.KF_faceLights==='function'}catch(e){return false}});if(!W)return 'no reader';const p=a.state.projects[0];const plan=p.drawing.plan;const ch=dr.planCH(plan)||2.4;const out=[];
      for(const use of ['', 'toilet','office']){
      for(const f of plan.faces){const P=f.poly;const area=L.areaOf(P);
        const nw=L.autoLights(P,{ch,use,lm:800});
        let old=null;try{const need=nw.need;let pp=use?2:L.pitchFor(ch,2);let o=W.KF_faceLights({poly:P,area,i:f.i},pp)||[];if(use){while(o.length<need&&pp>0.9+1e-6){pp=Math.max(0.9,pp*0.92);o=W.KF_faceLights({poly:P,area,i:f.i},pp)||[]}}old=o.map(q=>[+q[0].toFixed(3),+q[1].toFixed(3)])}catch(e){old=String(e).slice(0,80)}
        out.push({use,i:f.i,area:+area.toFixed(2),nw:nw.pts.length,old:Array.isArray(old)?old.length:old,same:Array.isArray(old)&&old.length===nw.pts.length&&old.every(q=>nw.pts.some(z=>Math.hypot(z[0]-q[0],z[1]-q[1])<0.06))});}}
      return {ch,out}}""")
    print('ch',r['ch'])
    for use in ['','toilet','office']:
        rows=[x for x in r['out'] if x['use']==use]
        print(f"use={use or 'なし'}: 台数一致 {sum(x['nw']==x['old'] for x in rows)}/{len(rows)}  位置まで一致 {sum(x['same'] for x in rows)}/{len(rows)}  新合計{sum(x['nw'] for x in rows)} 旧合計{sum(x['old'] for x in rows if isinstance(x['old'],int))}")
        for x in rows:
            if not x['same']: print('  ',x)
    print(errs or 'no errors')
    b.close()
