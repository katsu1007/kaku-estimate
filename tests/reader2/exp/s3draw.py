import sys,json,math
sys.path.insert(0,__import__('os').path.dirname(__import__('os').path.abspath(__file__)))
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from matplotlib import font_manager
D=__import__('os').environ.get('R2_EXP', '/tmp/r2exp') + '/'
FP=font_manager.FontProperties(fname='/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf')
tag=sys.argv[1];off=set(int(x) for x in sys.argv[2].split(',')) if len(sys.argv)>2 and sys.argv[2] else set()
r=json.load(open(D+tag+'.json'));res=json.load(open(D+tag+'_new.json'));old=r['faces'];new=res['faces'];S=r['raw']['segs'];G=r['raw']['groups']
xs=[q[0] for f in old+new for q in f['poly']];ys=[q[1] for f in old+new for q in f['poly']]
x0,x1,y0,y1=min(xs)-0.5,max(xs)+0.5,min(ys)-0.5,max(ys)+0.5
W=x1-x0;H=y1-y0;fig,axs=plt.subplots(2,1,figsize=(16,16*2*H/W+1.2))
for ax,faces,title,mask in ((axs[0],old,'今までの読み取り：区画 %d（合計 %.0f㎡）'%(len(old),sum(f['area'] for f in old)),set()),(axs[1],new,'線の役割で選び直した後：区画 %d（合計 %.0f㎡）'%(len(new),sum(f['area'] for f in new)),off)):
    for s in S:
        if s[4]<0 or not G[s[4]]['on'] or s[4] in mask: continue
        if math.hypot(s[2]-s[0],s[3]-s[1])<0.04: continue
        if not(x0<=s[0]<=x1 and y0<=s[1]<=y1): continue
        ax.plot([s[0],s[2]],[s[1],s[3]],color='#444',lw=0.4)
    for k,fc in enumerate(sorted(faces,key=lambda f:-f['area'])):
        ax.add_patch(Polygon(fc['poly'],closed=True,facecolor=plt.cm.tab20(k%20),alpha=0.5,edgecolor='none'))
        cx=sum(q[0] for q in fc['poly'])/len(fc['poly']);cy=sum(q[1] for q in fc['poly'])/len(fc['poly'])
        ax.text(cx,cy,(fc.get('name') or '')+('\n' if fc.get('name') else '')+'%.1f'%fc['area'],fontsize=7,ha='center',va='center',fontproperties=FP)
    ax.set_xlim(x0,x1);ax.set_ylim(y0,y1);ax.set_aspect('equal');ax.set_title(title,fontproperties=FP,fontsize=15);ax.axis('off')
plt.tight_layout();plt.savefig(D+tag+'_cmp.png',dpi=100);print('saved')
