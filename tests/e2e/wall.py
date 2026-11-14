from playwright.sync_api import sync_playwright
import json
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1100,'height':1300})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pid=pg.evaluate('location.hash').split('/')[2]
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(400)
    pg.click('[data-act=sketch]');pg.wait_for_timeout(300)
    pg.fill('#skName','洋室');pg.fill('#skW','4000');pg.fill('#skH','3000');pg.click('[data-a=rect]');pg.wait_for_timeout(200)
    pg.click('[data-a=apply]');pg.wait_for_timeout(600)
    pg.evaluate("""async()=>{const a=await import('./js/app.js');const p=a.state.projects[0];const m=a.masterItems().find(i=>i.id==='wl-cloth');
      p.lines.push({id:'lc',itemId:m.id,name:m.name,spec:'',unit:m.unit,kind:m.kind,cat:m.cat,price:m.price,cost:'',loss:'',sheet:0,qty:'',basis:{measure:'wall',rooms:'all'}});a.touch(p)}""")
    pg.click('[data-mode=wall]');pg.wait_for_timeout(200)
    P=lambda x,y: pg.evaluate(f"(()=>{{const s=document.querySelector('svg.pv');const pt=s.createSVGPoint();pt.x={x};pt.y={-y};const q=pt.matrixTransform(s.getScreenCTM());return [q.x,q.y]}})()")
    tap=lambda x,y:(lambda q:(pg.mouse.click(q[0],q[1]),pg.wait_for_timeout(120)))(P(x,y))
    pg.evaluate("document.querySelector('svg.pv').scrollIntoView({block:'center'})");pg.wait_for_timeout(200)
    # 線をタップ：上の辺（長さ4）
    tap(2.0,3.0);print([x for x in pg.inner_text('#dwgBar').split('\n') if '長さ' in x][:1])
    pg.select_option('#wItem','w-dW-cloth');pg.select_option('#wFin','wl-cloth');pg.select_option('#wBase','');pg.click('[data-act=wallAdd]');pg.wait_for_timeout(300)
    # ここからここまで：角を回る
    pg.click('[data-wway=range]');pg.wait_for_timeout(100)
    pg.evaluate("document.querySelector('svg.pv').scrollIntoView({block:'center'})");pg.wait_for_timeout(200)
    tap(0.03,0.02);tap(3.98,0.01);tap(4.02,1.5)
    print([x for x in pg.inner_text('#dwgBar').split('\n') if '長さ' in x][:1])
    pg.fill('#wOpen','1.5');pg.select_option('#wItem','');pg.select_option('#wBase',pg.evaluate("document.querySelector('#wBase option:nth-child(2)').value"));pg.select_option('#wFin','wl-cloth');pg.fill('#wName','南と東の壁');print('room guess',pg.evaluate("document.querySelector('#wRoom').selectedOptions[0].textContent"))
    pg.click('[data-act=wallAdd]');pg.wait_for_timeout(300)
    r=pg.evaluate("""async()=>{const a=await import('./js/app.js');const c=await import('./js/calc.js');const p=a.state.projects[0];const t=c.totals(p,a.opts());
      return {off:p.rooms.map(r=>[r.name,r.wallOff]),room:t.lines[p.lines.findIndex(l=>l.id==='lc')].qty,loss:a.opts().loss,walls:p.drawing.walls.map(w=>[w.len,w.h,w.open,w.itemId,w.baseId,w.finId,w.pts||w.segs]),lines:p.lines.filter(l=>l.fromDemo).map(l=>[l.fromDemo.split('|')[0],l.name,l.qty,t.lines[p.lines.indexOf(l)].qty,l.spec.slice(-40)])}}""")
    print(json.dumps(r,ensure_ascii=False))
    pg.evaluate("document.querySelector('svg.pv').scrollIntoView({block:'start'})");pg.wait_for_timeout(200);pg.screenshot(path='tests/e2e/shots/wall.png')
    pg.goto(pg.url.replace('/2','/3'));pg.wait_for_timeout(800)
    print([t for t in pg.inner_text('#view').split('\n') if '引いています' in t or '図面で入れた' in t][:4])
    print(errs or 'no errors')
    b.close()
