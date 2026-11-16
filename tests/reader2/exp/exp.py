# 段階3の実験用：図面を読んだ後、読み取りの部品の中の線（まとまりの番号つき）・文字・まとまりを取り出す
import sys,json
from playwright.sync_api import sync_playwright
D=__import__('os').environ.get('R2_EXP', '/tmp/r2exp') + '/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    for a in sys.argv[1:]:
        tag,f=a.split('=')
        pg=b.new_page(viewport={'width':1300,'height':1000})
        pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
        pg.evaluate("async()=>{const a=await import('./js/app.js');a.state.settings.noticeSeen=1;a.state.settings.introSeen=1}")
        pid=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.newProject({name:'t'});await a.flush();return p.id}")
        pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300);pg.set_input_files('#dwgFile',f)
        for i in range(240):
            pg.wait_for_timeout(1000)
            if pg.locator('.modal [data-later]').count(): pg.click('.modal [data-later]')
            if pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.id==='%s');return !!(p.drawing&&p.drawing.plan&&p.drawing.fixtures)}"%pid): break
        r=pg.evaluate("""async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.id==='%s');
          const all=[];const walk=w=>{try{all.push(w);[...w.document.querySelectorAll('iframe')].forEach(f=>walk(f.contentWindow))}catch(e){}};walk(window);
          const W=all.find(w=>{try{return w!==window&&w.KakuEngine&&w.eval('typeof RG!=="undefined"&&RG&&RG.segs&&RG.segs.length>0')}catch(e){return false}});
          const raw=JSON.parse(W.eval(`(()=>{const M=rgM(),keys=RG.groups.map(g=>g.key),ix=new Map(keys.map((k,i)=>[k,i]));const q=v=>Math.round(v*1000)/1000;
            return JSON.stringify({groups:RG.groups.map(g=>({key:g.key,layer:g.layer,on:!!g.on})),hatch:RG.hatch?RG.hatch.size:0,
              segs:RG.segs.map((s,i)=>{const a=KAKU_rerot([s[1]*M,s[2]*M],M),b=KAKU_rerot([s[3]*M,s[4]*M],M);return [q(a[0]),q(a[1]),q(b[0]),q(b[1]),ix.get(gkey(s))??-1,RG.hatch&&RG.hatch.has(i)?1:0]}),
              arcs:(RG.arcs||[]).map(c=>{const o=KAKU_rerot([c.cx*M,c.cy*M],M);return [q(o[0]),q(o[1]),q((c.r||0)*M)]}),
              texts:(RG.texts||[]).map(t=>{const o=KAKU_rerot([t.x*M,t.y*M],M);return {t:String(t.t||'').trim(),x:q(o[0]),y:q(o[1])}})})})()`));
          return {raw,analysis:p.drawing.analysis,faces:p.drawing.plan.faces.map(f=>({i:f.i,no:f.no,area:f.area,poly:f.poly})),doors:(p.drawing.doors||[]).map(d=>d.c),fixtures:(p.drawing.fixtures||[]).map(x=>({t:x.t,b:x.b}))}}"""%pid)
        json.dump(r,open(D+tag+'.json','w'),ensure_ascii=False);print(tag,len(r['raw']['segs']),'線',len(r['raw']['groups']),'まとまり',len(r['raw']['arcs']),'円弧',flush=True);pg.close()
    b.close()
