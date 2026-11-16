# 段階3の実験：まとまりの役割を決めて「使わない」にし、今の区画探しをもう一度回す。結果を絵にする
import sys,json,math
sys.path.insert(0,__import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from gstat import stats
from playwright.sync_api import sync_playwright
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from matplotlib import font_manager
D=__import__('os').environ.get('R2_EXP', '/tmp/r2exp') + '/'
FP=font_manager.FontProperties(fname='/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf')
def role(o):
    if not o['on']: return None
    if o['mean']<0.03 or (o['short']>=0.97 and o['n']>=200): return '細かい線（器具・曲線）'
    if o['dim']>=0.45: return '寸法の線'
    if o['table']+o['frame']>=0.6: return '表・図枠の線'
    return None
tag,f=sys.argv[1],sys.argv[2]
r,st=stats(tag);off={o['gi']:role(o) for o in st if role(o)}
print('使わないにするまとまり',[(gi,w,[o for o in st if o['gi']==gi][0]['n']) for gi,w in off.items()])
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_page(viewport={'width':1300,'height':1000})
    pg.goto('http://localhost:8765/');pg.wait_for_timeout(800)
    pg.evaluate("async()=>{const a=await import('./js/app.js');a.state.settings.noticeSeen=1;a.state.settings.introSeen=1}")
    pid=pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.newProject({name:'t'});await a.flush();return p.id}")
    pg.goto(f'http://localhost:8765/#/p/{pid}/2');pg.wait_for_timeout(300);pg.set_input_files('#dwgFile',f)
    for i in range(240):
        pg.wait_for_timeout(1000)
        if pg.locator('.modal [data-later]').count(): pg.click('.modal [data-later]')
        if pg.evaluate("async()=>{const a=await import('./js/app.js');const p=a.state.projects.find(x=>x.id==='%s');return !!(p.drawing&&p.drawing.plan&&p.drawing.fixtures)}"%pid): break
    res=pg.evaluate("""async(off)=>{const all=[];const walk=w=>{try{all.push(w);[...w.document.querySelectorAll('iframe')].forEach(f=>walk(f.contentWindow))}catch(e){}};walk(window);
      const W=all.find(w=>{try{return w!==window&&w.KakuEngine&&w.eval('typeof RG!=="undefined"&&RG&&RG.segs&&RG.segs.length>0')}catch(e){return false}});
      W.__off=off;const t=performance.now();
      const out=JSON.parse(W.eval(`(()=>{const keep=RG.groups.map(g=>g.on);window.__off.forEach(i=>{RG.groups[i].on=false});rgCompute();const P=KakuEngine.plan();const r={used:RG.used,faces:P?P.faces.map(f=>({i:f.i,name:f.name||'',area:f.area,peri:f.peri,poly:f.poly})):[]};RG.groups.forEach((g,i)=>{g.on=keep[i]});rgCompute();return JSON.stringify(r)})()`));
      out.ms=Math.round(performance.now()-t);return out}""",list(off.keys()))
    b.close()
json.dump(res,open(D+tag+'_new.json','w'),ensure_ascii=False)
old=r['faces'];new=res['faces']
print('区画 前',len(old),'合計 %.1f㎡'%sum(x['area'] for x in old),'→ 後',len(new),'合計 %.1f㎡'%sum(x['area'] for x in new),'| 使った線',res['used'],'| かかった時間',res['ms'],'ms')
print('後の区画の広さ',sorted([round(x['area'],1) for x in new],reverse=True)[:40])
print('名前',[x['name'] for x in new if x['name']])
S=r['raw']['segs'];fig,axs=plt.subplots(2,1,figsize=(15,21))
for ax,faces,title,mask in ((axs[0],old,'今までの読み取り：区画 %d'%len(old),None),(axs[1],new,'線の役割で選び直した後：区画 %d'%len(new),off)):
    for s in S[::1]:
        if mask is not None and s[4] in mask: continue
        if not r['raw']['groups'][s[4]]['on'] if s[4]>=0 else True: continue
        if math.hypot(s[2]-s[0],s[3]-s[1])<0.05: continue
        ax.plot([s[0],s[2]],[s[1],s[3]],color='#555',lw=0.35)
    for k,fc in enumerate(faces):
        ax.add_patch(Polygon(fc['poly'],closed=True,facecolor=plt.cm.tab20(k%20),alpha=0.45,edgecolor='none'))
        cx=sum(q[0] for q in fc['poly'])/len(fc['poly']);cy=sum(q[1] for q in fc['poly'])/len(fc['poly'])
        ax.text(cx,cy,'%.1f'%fc['area'],fontsize=6,ha='center',va='center',fontproperties=FP)
    ax.set_aspect('equal');ax.set_title(title,fontproperties=FP,fontsize=14);ax.axis('off')
plt.tight_layout();plt.savefig(D+tag+'_cmp.png',dpi=110);print('saved')
