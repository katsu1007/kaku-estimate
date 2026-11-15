"""新しい読み取り（js/reader2）の記録と採点。使い方（リポジトリの一番上で、サーバーを立ててから）:
  python3 tests/reader2/run.py <記録を置くフォルダ> [--fixtures] [図面…]
 - 実図面（.real/ の5枚。お客さんの図面なのでリポジトリには入れない）と、--fixtures なら正解付きの試し図面（KAKU_TESTS）を読み、
   今の読み取りの区画と、新しい読み取りの印（除外・保留）を <フォルダ>/<名前>.json に記録する
 - 前の記録 <フォルダ>/<名前>.base.json があれば比べて、変わった所を出す（--update で今の記録を基準にする）
 - 正解 <フォルダ>/<名前>.answer.json（かつか会社の人が確かめた物だけ）があれば、js/reader2/score.js で採点する"""
import os,sys,json,glob
from playwright.sync_api import sync_playwright
OUT=sys.argv[1];os.makedirs(OUT,exist_ok=True)
URL=os.environ.get('KAKU_URL','http://localhost:8765/');H0=os.environ.get('KAKU_TESTS','../gaisan/kaku-tests')
args=[a for a in sys.argv[2:] if not a.startswith('--')];UPD='--update' in sys.argv
REAL=[('1_factory','.real/factory.dxf'),('2_school','.real/school.dxf'),('3_0530','.real/0530.jww'),('4_toilet_plan','.real/toilet_plan.jww'),('5_toilet','.real/toilet.jww')]
items=[(os.path.splitext(os.path.basename(a))[0],a) for a in args] if args else [x for x in REAL if os.path.exists(x[1])]
if '--fixtures' in sys.argv: items+=[('fx_'+os.path.relpath(f,H0+'/fixtures').replace('/','_').replace('.answer.json',''),f.replace('.answer.json','.dxf')) for f in sorted(glob.glob(H0+'/fixtures/*/*.answer.json'))]
bad=0
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    for tag,path in items:
        pg=b.new_page(viewport={'width':1300,'height':1000});errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(URL);pg.wait_for_timeout(800)
        pg.evaluate("async()=>{const a=await import('./js/app.js');a.state.settings.noticeSeen=1;a.state.settings.introSeen=1}")
        pid=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.newProject({name:'t'});await a.flush();return p.id}")
        pg.goto(URL+f'#/p/{pid}/2');pg.wait_for_timeout(300);pg.set_input_files('#dwgFile',path)
        ok=False
        for i in range(240):
            pg.wait_for_timeout(1000)
            if pg.locator('.modal [data-later]').count(): pg.click('.modal [data-later]')
            if pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.id==='%s');return !!(p.drawing&&p.drawing.plan&&p.drawing.fixtures)}"%pid): ok=True;break
        if not ok: print(tag,'読めませんでした');pg.close();continue
        r=pg.evaluate("""async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.id==='%s');const d=p.drawing,P=d.plan,A=d.analysis||null;
          return {faces:P.faces.map(f=>({i:f.i,no:f.no,name:f.name,area:f.area,peri:f.peri,poly:f.poly})),fixtures:(d.fixtures||[]).map(x=>({t:x.t,b:x.b})),doors:(d.doors||[]).length,analysis:A}}"""%pid)
        r['errs']=errs
        json.dump(r,open(f'{OUT}/{tag}.json','w'),ensure_ascii=False)
        A=r['analysis'] or {'stats':{},'regions':[],'marks':{}}
        F={str(f['i']):f for f in r['faces']}
        outA=sum(F[k]['area'] for k,m in A['marks'].items() if m['s']=='out' and k in F);holdA=sum(F[k]['area'] for k,m in A['marks'].items() if m['s']=='hold' and k in F)
        st=A['stats']
        line=f"{tag:<34} 区画{len(r['faces']):>4}  図枠{st.get('frames',0)} 表{st.get('tables',0)}  除外{st.get('out',0):>3}（{outA:7.1f}㎡） 保留{st.get('hold',0):>3}（{holdA:7.1f}㎡）"
        bp=f'{OUT}/{tag}.base.json'
        if os.path.exists(bp) and not UPD:
            B=json.load(open(bp));same=[(f['i'],f['area']) for f in B['faces']]==[(f['i'],f['area']) for f in r['faces']]
            m0={k:v['s'] for k,v in (B.get('analysis') or {'marks':{}})['marks'].items()};m1={k:v['s'] for k,v in A['marks'].items()}
            if not same: line+='  ★今の読み取りの区画が前と違う';bad+=1
            if m0!=m1: line+=f"  印が変わった {sorted(set(m0.items())^set(m1.items()))[:6]}"
        if UPD or not os.path.exists(bp): json.dump(r,open(bp,'w'),ensure_ascii=False)
        ap=f'{OUT}/{tag}.answer.json'
        if os.path.exists(ap):
            sc=pg.evaluate("async([r,ans])=>{const s=await import('./js/reader2/score.js');return s.score(r.faces,(r.analysis||{}).marks||{},ans)}",[r,json.load(open(ap))])
            line+='  採点 '+json.dumps({k:v for k,v in sc.items() if k!='detail'},ensure_ascii=False)
            if sc.get('roomOut',0)>0: bad+=1
        if errs: line+='  JSエラー '+errs[0][:80]
        print(line,flush=True);pg.close()
    b.close()
print('★入れてはいけない変化があります' if bad else '入れてはいけない変化はありません（今の読み取りの区画は同じ・本当の部屋の除外なし）')
sys.exit(1 if bad else 0)
