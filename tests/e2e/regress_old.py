import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
"""KAKU 器具読み取りの回帰テスト。
使い方: python3 regress.py <KAKUの出力フォルダ(out)> [--update] [--jww 図面.jww]
 - fixtures/ 以下の全図面を読み、正解(.answer.json)と比べて図面ごとに点数を出す
 - baseline.json（前回までの点数）より1つでも下がったら REGRESSION と出して終了コード1
 - --update で今の点数を baseline に保存（下がった項目がある時は保存しない）
 - --jww: 社外秘の実図面はここに入れない。手元にある時だけ渡して、便器・背面・コンセント数を baseline と比べる"""
import os,sys,json,glob,http.server,threading,functools
from playwright.sync_api import sync_playwright
H0=KAKU_TESTS+''
OUT=os.path.abspath(sys.argv[1]);UPD='--update' in sys.argv
JWW=sys.argv[sys.argv.index('--jww')+1] if '--jww' in sys.argv else None
OPP={'N':'S','S':'N','E':'W','W':'E'}
class Hd(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Hd,directory=OUT));port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
def load(pg,path):
    pg.set_input_files('#file',path);pg.wait_for_timeout(200);pg.evaluate('KAKU_plan=null;KAKU_fix=null;runDrawingImport()')
    try:pg.wait_for_function('()=>KAKU_plan&&KAKU_fix',timeout=60000);return True
    except Exception:return False
def score(det,A):
    fx=A.get('fixtures',[]);used=set();h=t=bk=0
    for a in fx:
        ab=a.get('bbox') or a.get('bbox_mm');cx=(ab[0]+ab[2])/2;cy=(ab[1]+ab[3])/2
        m=[i for i,d in enumerate(det) if i not in used and d['b'][0]*1000-50<=cx<=d['b'][2]*1000+50 and d['b'][1]*1000-50<=cy<=d['b'][3]*1000+50]
        if not m:continue
        d=det[m[0]];used.add(m[0]);h+=1
        if d['t']==a['type'] or (a['type'] in('slop',) and d['t']=='sink'):t+=1
        if d.get('back')==a.get('back') or d.get('back') in ((a.get('back_alt') or [])+([a['back2']] if a.get('back2') else [])):bk+=1
    return {'n':len(fx),'hit':h,'type':t,'back':bk,'extra':len(det)-len(used)}
res={};errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_page();pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:{port}/kaku-estimate/old/');pg.wait_for_function('()=>(document.getElementById("engineFrame").contentWindow||{}).KakuEngine',timeout=30000)
    pg.click('.headline .btn.orange');pg.wait_for_timeout(300);pg.click('.tab[data-tab=drawing]')
    for af in sorted(glob.glob(H0+'/fixtures/*/*.answer.json')):
        key=os.path.relpath(af,H0+'/fixtures').replace('.answer.json','');A=json.load(open(af))
        if not load(pg,af.replace('.answer.json','.dxf')):res[key]={'n':len(A.get('fixtures',[])),'hit':0,'type':0,'back':0,'extra':0,'booth':0,'load':0};continue
        det=pg.evaluate("KAKU_fix.fx.map(x=>({t:x.t,b:KF_gbox(x.b),back:KF_gback(x.back)}))");r=score(det,A);r['load']=1;ok=0
        areas=pg.evaluate("KAKU_plan.faces.map(f=>f.area)");r['faces']=len(areas)
        if A.get('rooms'):
            used=set();hr=0
            for rm in A['rooms']:
                ar=rm.get('area') or rm.get('area_m2') or 0
                m=[i for i,v in enumerate(areas) if i not in used and ar and abs(v-ar)<=max(.3,ar*.15)]
                if m:used.add(m[0]);hr+=1
            r['room']=hr;r['rooms']=len(A['rooms'])
        for bt in A.get('empty_toilet_booths',[]):
            bb=bt.get('bbox') or bt.get('room_bbox');ds=bt.get('door_side') or bt.get('door')
            v=pg.evaluate(f"()=>{{const f=KAKU_plan.faces.find(f=>KAKU_pip({(bb[0]+bb[2])/2000},{(bb[1]+bb[3])/2000},f.poly));if(!f)return null;KAKU_sel.faces.clear();KAKU_sel.faces.add(f.i);KF_virtual();const v=KAKU_fix.fx.filter(x=>x.v).pop();return v&&v.back}}")
            ok+=v==OPP.get(ds)
        r['booth']=ok;r['booths']=len(A.get('empty_toilet_booths',[]));res[key]=r
    if JWW and load(pg,JWW):
        pg.evaluate("KAKU_setMode('elec');KF_setTool('fix');KF_auto()")
        res['__jww__']=pg.evaluate("()=>{const c={};KAKU_fix.fx.forEach(x=>{const k=x.t+':'+x.back;c[k]=(c[k]||0)+1});const o=current.places.find(p=>p.auto==='outlet');return {c,out:o?KF_pts(o).length:0}}")
    b.close()
srv.shutdown()
BF=H0+'/baseline.json';base=json.load(open(BF)) if os.path.exists(BF) else {}
bad=[]
for k,r in sorted(res.items()):
    if k=='__jww__':continue
    o=base.get(k)
    line=f"{k:40s} 器具{r['hit']}/{r['n']} 種類{r['type']} 背面{r['back']} 余計{r['extra']}"+(f" 空の個室{r['booth']}/{r['booths']}" if r.get('booths') else '')+(f" 部屋{r['room']}/{r['rooms']}" if r.get('rooms') else '')+f" 区画{r.get('faces','-')}"
    if o:
        for m in ('hit','type','back','booth','load','room'):
            if r.get(m,0)<o.get(m,0):bad.append(f"{k}: {m} {o.get(m)} -> {r.get(m)}")
        if r['extra']>o['extra']:bad.append(f"{k}: extra {o['extra']} -> {r['extra']}")
        if o.get('faces') is not None and r.get('faces')!=o.get('faces'):print(f"  要確認 {k}: 区画の数 {o.get('faces')} -> {r.get('faces')}")
    else:line+='  (新規)'
    print(line)
if '__jww__' in res:
    print('実図面',res['__jww__'])
    o=base.get('__jww__')
    if o and json.dumps(o,sort_keys=True)!=json.dumps(res['__jww__'],sort_keys=True):bad.append(f"実図面: {o} -> {res['__jww__']}")
T={m:sum(r.get(m,0) for k,r in res.items() if k!='__jww__') for m in('n','hit','type','back','extra','booth','booths')};print('合計',T)
if errs:print('JSエラー',errs[:3]);bad.append('JS errors')
if bad:print('REGRESSION');[print(' ',x) for x in bad];sys.exit(1)
print('前より下がった所はありません')
if UPD:
    for k,r in res.items():base[k]=r
    json.dump(base,open(BF,'w'),ensure_ascii=False,indent=1);print('baseline を更新しました')
