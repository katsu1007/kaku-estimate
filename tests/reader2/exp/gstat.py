# まとまり（レイヤー＋色＋線種）ごとの特徴を出す
import json,sys,math,collections,re
D=__import__('os').environ.get('R2_EXP', '/tmp/r2exp') + '/'
def stats(tag):
    r=json.load(open(D+tag+'.json'));R=r['raw'];S=R['segs'];G=R['groups'];A=r['analysis'] or {}
    regs=[q['box'] for q in A.get('regions',[]) if q['type'] in('table','title')]
    frames=[q['box'] for q in A.get('regions',[]) if q['type']=='frame']
    T=[t for t in R['texts'] if re.fullmatch(r'[\d,]{2,7}',t['t'])]
    tg=collections.defaultdict(list)
    for t in T: tg[(round(t['x']/0.5),round(t['y']/0.5))].append(t)
    def numnear(mx,my):
        gx,gy=round(mx/0.5),round(my/0.5)
        return any(abs(t['x']-mx)<=0.35 and abs(t['y']-my)<=0.35 for dx in(-1,0,1) for dy in(-1,0,1) for t in tg.get((gx+dx,gy+dy),[]))
    out=[]
    for gi,g in enumerate(G):
        L=[s for s in S if s[4]==gi]
        if not L: continue
        ln=[math.hypot(s[2]-s[0],s[3]-s[1]) for s in L];tot=sum(ln)
        ax=sum(l for s,l in zip(L,ln) if min(abs(s[2]-s[0]),abs(s[3]-s[1]))<=0.005)
        short=sum(1 for l in ln if l<0.15)
        inreg=sum(l for s,l in zip(L,ln) if any(b[0]-.05<=(s[0]+s[2])/2<=b[2]+.05 and b[1]-.05<=(s[1]+s[3])/2<=b[3]+.05 for b in regs))
        onfr=sum(l for s,l in zip(L,ln) if any((abs(s[0]-b[0])<.03 and abs(s[2]-b[0])<.03) or (abs(s[0]-b[2])<.03 and abs(s[2]-b[2])<.03) or (abs(s[1]-b[1])<.03 and abs(s[3]-b[1])<.03) or (abs(s[1]-b[3])<.03 and abs(s[3]-b[3])<.03) for b in frames))
        dim=sum(l for s,l in zip(L,ln) if l>=0.3 and numnear((s[0]+s[2])/2,(s[1]+s[3])/2))
        # 平行な2本線（同じまとまりの中で、0.06〜0.35m 離れて重なる縦横の線）
        H=collections.defaultdict(list);V=collections.defaultdict(list)
        for s,l in zip(L,ln):
            if l<0.3: continue
            if abs(s[3]-s[1])<=0.005: H[round(s[1]/0.4)].append((s[1],min(s[0],s[2]),max(s[0],s[2])))
            elif abs(s[2]-s[0])<=0.005: V[round(s[0]/0.4)].append((s[0],min(s[1],s[3]),max(s[1],s[3])))
        par=0
        for B in (H,V):
            for k,arr in B.items():
                cand=arr+B.get(k+1,[])
                for a in arr:
                    best=0
                    for b in cand:
                        d=abs(a[0]-b[0])
                        if 0.06<=d<=0.35:
                            ov=min(a[2],b[2])-max(a[1],b[1])
                            if ov>best: best=ov
                    par+=max(0,min(best,a[2]-a[1]))
        out.append(dict(gi=gi,layer=g['layer'],on=g['on'],n=len(L),tot=round(tot,1),mean=round(tot/len(L),2),ax=round(ax/tot,2),short=round(short/len(L),2),table=round(inreg/tot,2),frame=round(onfr/tot,2),dim=round(dim/tot,2),par=round(par/tot,2),hatch=sum(s[5] for s in L)))
    return r,out
if __name__=='__main__':
    for tag in sys.argv[1:]:
        r,out=stats(tag);print('#####',tag,'図枠',[q['type'] for q in (r['analysis'] or {}).get('regions',[])])
        print('  番号 レイヤー            使う  本数   長さm  平均m 縦横 短い  表の中 枠の上 寸法  2本線 ハッチ')
        for o in sorted(out,key=lambda o:-o['tot']): print('  %3d %-18s %-5s %6d %7.1f %5.2f %4.2f %4.2f  %4.2f  %4.2f  %4.2f  %4.2f %5d'%(o['gi'],o['layer'][:18],o['on'],o['n'],o['tot'],o['mean'],o['ax'],o['short'],o['table'],o['frame'],o['dim'],o['par'],o['hatch']))
