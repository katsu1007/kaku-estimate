from playwright.sync_api import sync_playwright
import json
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1100,'height':1400})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.check('#nt_ok');pg.click('#nt_go');pg.wait_for_timeout(300);pg.click('#i_go');pg.wait_for_timeout(300)
    pid=pg.evaluate('location.hash').split('/')[2]
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300)
    pg.set_input_files('#dwgFile',REAL_TOILET);pg.wait_for_selector('#dwgFaces button',state='attached',timeout=60000);pg.wait_for_timeout(3000)
    pg.click('[data-act=selRest]');pg.wait_for_timeout(200);pg.click('[data-act=mkEach]');pg.wait_for_timeout(500)
    pg.click('[data-act=fixLines]');pg.wait_for_timeout(500)
    btn=pg.locator('.modal button.primary').last; btn.click();pg.wait_for_timeout(400)
    pg.click('[data-mode=light]');pg.wait_for_timeout(200);pg.select_option('#lUse','toilet');pg.click('[data-act=lAuto]');pg.wait_for_timeout(2500)
    # 床の長尺シート：全部の部屋
    pg.evaluate("""async()=>{const a=await import('./js/app.js');const p=a.state.projects[0];const m=a.masterItems().find(i=>/長尺/.test(i.name));
      p.lines.push({id:'lf',itemId:m.id,name:m.name,spec:m.spec||'',unit:m.unit,kind:m.kind,price:m.price,cost:'',loss:'',sheet:0,qty:0,basis:{measure:'floor',rooms:'all'}});a.touch(p)}""")
    pg.goto(f'http://localhost:8765/#/p/{pid}/5');pg.wait_for_timeout(800)
    pg.click('[data-act=floorAuto]');pg.wait_for_timeout(800)
    r=pg.evaluate("""async()=>{const a=await import('./js/app.js');const f=await import('./js/floors.js');const c=await import('./js/calc.js');const p=a.state.projects[0];const res=f.floorBreakdown(p,a.opts());const t=c.totals(p,a.opts());
      const by=name=>{const o={};res.parts.forEach(x=>{const r=x.rows.find(r=>r.l.name===name);o[x.name]=r?r.qty:0});return o};
      const tot=name=>{const i=p.lines.findIndex(l=>l.name===name);return i<0?null:t.lines[i].qty};
      const names=[...new Set(p.lines.map(l=>l.name))];
      return {lv:[...new Set(p.rooms.map(r=>r.lv))],titles:(p.drawing.plan.titles||[]).map(t=>t.t).slice(0,10),parts:res.parts.map(x=>[x.name,x.rows.length,x.sub]),sum:res.sum,total:res.total,
        chk:names.map(n=>[n,tot(n),by(n)])}}""")
    print(json.dumps(r,ensure_ascii=False,indent=0)[:3500])
    pg.evaluate("document.querySelector('[data-act=floorAuto]').scrollIntoView({block:'center'})");pg.wait_for_timeout(200);pg.screenshot(path='tests/e2e/shots/fl.png',full_page=False)
    print(errs or 'no errors')
    b.close()
