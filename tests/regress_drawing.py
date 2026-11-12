"""使い方: KAKU_TESTS=../gaisan/kaku-tests python3 tests/regress_drawing.py [実図面.jww]
新しいKAKUの「②部屋 → 図面を選ぶ」で全部のテスト図面を読み、区画の数と部屋の面積を、正解と前のKAKUの点数（baseline.json）と比べる"""
import os,sys,json,glob
from playwright.sync_api import sync_playwright
H0=os.environ.get('KAKU_TESTS','../gaisan/kaku-tests')  # 非公開の gaisan リポジトリの kaku-tests（図面と正解はここには入れない）
URL=os.environ.get('KAKU_URL','http://localhost:8765/')  # 新しいKAKUを置いたローカルのサーバー
base=json.load(open(H0+'/baseline.json'))
JWW=sys.argv[1] if len(sys.argv)>1 else None
errs=[];res={}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1280,'height':900});pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('x','1')")
    pg.goto(URL);pg.wait_for_timeout(800)
    pg.evaluate("async()=>{const a=await import('./js/app.js');a.state.settings.noticeSeen=1;a.state.settings.introSeen=1;await a.saveSettings()}")
    files=sorted(glob.glob(H0+'/fixtures/*/*.answer.json'))
    items=[(os.path.relpath(f,H0+'/fixtures').replace('.answer.json',''),f.replace('.answer.json','.dxf'),json.load(open(f))) for f in files]
    if JWW: items.append(('__jww__',JWW,{}))
    for key,path,A in items:
        pid=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.newProject({name:'test'});await a.flush();return p.id}")
        pg.goto(URL+f'#/p/{pid}/2');pg.wait_for_timeout(300)
        pg.set_input_files('#dwgFile',path)
        try: pg.wait_for_function("()=>document.querySelector('#dwgFaces button')||/読み込めません|見つかりません/.test((document.querySelector('#dwgStatus')||{}).textContent||'')",timeout=90000)
        except Exception as e: res[key]={'faces':0,'err':'timeout'};continue
        areas=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.id==='"+pid+"');return p.drawing?p.drawing.plan.faces.map(f=>f.area):[]}")
        r={'faces':len(areas)}
        if A.get('rooms'):
            used=set();hr=0
            for rm in A['rooms']:
                ar=rm.get('area') or rm.get('area_m2') or 0
                m=[i for i,v in enumerate(areas) if i not in used and ar and abs(v-ar)<=max(.3,ar*.15)]
                if m:used.add(m[0]);hr+=1
            r['room']=hr;r['rooms']=len(A['rooms'])
        res[key]=r
    # 部屋にする操作（1つ目の図面で：区画を2つ選んで1部屋）
    b.close()
bad=[]
for k,r in res.items():
    o=base.get(k,{})
    if k=='__jww__':
        print(f"{k:40s} 区画{r['faces']}");continue
    line=f"{k:40s} 区画{r['faces']}（前 {o.get('faces')}）"+(f" 部屋{r['room']}/{r['rooms']}（前 {o.get('room')}）" if 'room' in r else '')
    if r['faces']!=o.get('faces'):bad.append(k+' 区画の数が違う');line+='  ← 違う'
    if 'room' in r and r['room']<o.get('room',0):bad.append(k+' 部屋が減った');line+='  ← 減った'
    print(line)
print('JSエラー',errs[:3] if errs else 'なし')
print('REGRESSION' if bad else '前のKAKUと全部同じ', bad)
