/* 器具とドア・開口の読み取り。
 * 前のKAKU（old/）の読み取りの部分を、画面に出さずに裏で動かして結果だけもらう。
 * 読み取りの精度を変えないため、前のKAKUのコードには手を入れない（テスト図面22枚と実図面で同じ結果になることを確かめてある）。
 * 前のKAKUの保存場所には、作業用の案件と図面を残さない（読み終わったら消す）。 */

let readerPromise = null;
function getReader() {
  if (readerPromise) return readerPromise;
  readerPromise = new Promise((resolve, reject) => {
    const f = document.createElement('iframe');
    f.title = '器具の読み取り'; f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:absolute;left:-9999px;top:0;width:1200px;height:800px;border:0;visibility:hidden';
    f.src = './old/?reader=1';
    document.body.appendChild(f);
    let n = 0;
    const t = setInterval(() => {
      try {
        const W = f.contentWindow;
        const ef = W && W.document && W.document.getElementById('engineFrame');
        if (ef && ef.contentWindow && ef.contentWindow.KakuEngine && typeof W.runDrawingImport === 'function') { clearInterval(t); resolve(W); return; }
      } catch (e) { clearInterval(t); readerPromise = null; reject(new Error('器具の読み取りの部品を開けませんでした：' + e.message)); return; }
      if (++n > 300) { clearInterval(t); readerPromise = null; reject(new Error('器具の読み取りの部品が起動しませんでした')); }
    }, 100);
  });
  return readerPromise;
}

const wait = (fn, ms) => new Promise(res => { const t0 = Date.now(); const t = setInterval(() => { let v; try { v = fn(); } catch (e) { v = null; } if (v || Date.now() - t0 > ms) { clearInterval(t); res(v); } }, 100); });

/* JWW・DXF を読んで、図面（区画）・器具・ドア・開口を返す。
 * 前のKAKUの変数（KAKU_plan・current・data など）は let で宣言されていて window から見えないので、
 * 前のKAKUの中で式を評価して読み書きする（W.eval） */
export async function readWithFixtures(file) {
  const W = await getReader();
  const G = code => W.eval(code);
  const before = G('data.map(p=>p.id)');
  G('newProject()');
  const tmpId = G('current&&current.id');
  try {
    const tab = W.document.querySelector('.tab[data-tab=drawing]'); if (tab) tab.click();
    const dt = new W.DataTransfer();
    dt.items.add(new W.File([await file.arrayBuffer()], file.name, { type: file.type || 'application/octet-stream' }));
    W.document.getElementById('file').files = dt.files;
    G('KAKU_plan=null;KAKU_fix=null;runDrawingImport()');
    const ok = await wait(() => G('KAKU_plan'), 90000);
    if (!ok) throw new Error('図面を読めませんでした（時間切れ）');
    await wait(() => G('KAKU_fix'), 8000);
    const R = G(`(()=>{const P=KAKU_plan,F=KAKU_fix,q=v=>Math.round(v*1000)/1000;
      const plan={segs:P.segs.map(s=>s.map(q)),dsegs:(P.dsegs||[]).map(s=>s.map(q)),
        faces:P.faces.map(f=>({i:f.i,name:f.name||'',area:f.area,peri:f.peri,ch:f.ch||0,poly:f.poly.map(p=>[q(p[0]),q(p[1])])})),titles:(P.titles||[]).slice(0,40)};
      let fixtures=[],open={};
      if(F&&F.fx){fixtures=F.fx.map(x=>{let o=null;try{o=KF_OUT[x.t]?KF_outPt(x):null}catch(e){}return{t:x.t,b:KF_gbox(x.b).map(q),back:KF_gback(x.back)||'',out:o?o.map(q):null}});
        const O=(typeof KX_openScan==='function'&&KX_openScan())||{};
        Object.keys(O).forEach(k=>{open[k]=O[k].map(r=>({ty:r.ty,len:Math.round(r.len*100)/100,a:r.a.map(q),b:r.b.map(q),n:r.n.map(q)}))})}
      return JSON.stringify({plan,fixtures,open,doors:F&&F.doors?F.doors.length:0,doorList:(F&&F.doors||[]).filter(d=>d&&d.c).map(d=>({c:d.c.map(q),m:(d.m||d.c).map(q),r:+d.r||0.8})),fixG:F&&F.g||'',fixGd:F&&F.gd||''})})()`);
    return JSON.parse(R);
  } finally {
    /* 作業用の案件と、その図面の保存を消す（前のKAKUの案件一覧に残さない） */
    try {
      if (tmpId != null && !before.includes(tmpId)) {
        W.__kxTmp = tmpId;
        G(`data=data.filter(p=>p.id!==window.__kxTmp);if(!data.length)data=[blank()];current=null;save();
          localStorage.removeItem('kaku-plan-'+window.__kxTmp);localStorage.removeItem('kaku-fix-'+window.__kxTmp)`);
      }
    } catch (e) { console.warn('作業用の案件を消せませんでした', e); }
  }
}

export const FIX_NAMES = { toilet: '便器', urinal: '小便器', counter: '洗面カウンター', sink: '手洗器・流し', slop: 'SK（掃除流し）', bath: '浴槽', kitchen: 'キッチン', unknown: '判定保留', other: '器具ではない' };
/* 器具の種類ごとの、明細に入れる品目の初め（本体・取付手間）。画面で変えられる */
export const FIX_ITEMS = {
  toilet: ['s-b-wc1', 's-l-wc-on'], urinal: ['s-b-ur', 's-l-ur-on'], counter: ['s-b-wb600', 's-l-wb-on'], sink: ['s-b-hw', 's-l-hw-on'],
  slop: ['s-b-sk', 's-l-sk-on'], bath: ['fx-ub', 's-l-ub-on'], kitchen: ['fx-kitchen', 's-l-ki-on']
};
export const FIX_WORDS = { toilet: ['便器', 'トイレ'], urinal: ['小便器'], counter: ['洗面'], sink: ['手洗', '流し'], slop: ['SK', '掃除流し'], bath: ['ユニットバス', '浴'], kitchen: ['キッチン'] };

/* 部屋（区画の組み合わせ）の、壁から引く開口。前のKAKUと同じ決め方：
 * 部屋の中の境目（となりの区画も同じ部屋）は数えない。ドアは幅×高さ（2.0m、天井が低い時は天井高−5cm）、扉の無い開口は幅×天井高 */
export function roomOpenRuns(faceIds, plan, open) {
  const pip = (x, y, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const out = [];
  faceIds.forEach(i => (open[i] || []).forEach(run => {
    const mx = (run.a[0] + run.b[0]) / 2, my = (run.a[1] + run.b[1]) / 2;
    const inner = [0.1, 0.2, 0.35].some(o => { const x = mx + run.n[0] * o, y = my + run.n[1] * o; return faceIds.some(j => { if (j === i) return false; const f = plan.faces.find(z => z.i === j); return f && pip(x, y, f.poly); }); });
    if (!inner) out.push({ ty: run.ty, len: run.len });
  }));
  return out;
}

/* 照明の自動配置：前のKAKUの並べ方（壁から60cm＋均等割り、細い所は器具の先との真ん中に一列、列そろえ、欠き込み・斜めの壁の手直し）を
 * そのまま使う。前のKAKUで何度も確かめてきた並び方を、作り直してずらさないため。
 * faces: [{i, poly}]、fixtures: 図面の器具（細い通路の真ん中を決めるのに使う）
 * pitchOf(face, pitch): 照度が足りない時に間隔を詰めるかどうかを決める（need を返す）。戻り値は面ごとの点 */
export async function oldFaceLights(faces, fixtures, { base = 2, need = () => 0 } = {}) {
  const W = await getReader();
  W.__kxFx = (fixtures || []).filter(x => x && x.b).map(x => ({ t: x.t, b: x.b.slice() }));
  const keep = W.eval('KAKU_fix');
  W.eval('KAKU_fix={fx:window.__kxFx}');
  try {
    return faces.map(f => {
      const area = Math.abs(f.poly.reduce((s, a, k) => { const b = f.poly[(k + 1) % f.poly.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
      const F = { i: f.i, poly: f.poly, area };
      const n0 = need(f);
      let pp = base, pts = W.KF_faceLights(F, pp) || [];
      while (pts.length < n0 && pp > 0.9 + 1e-6) { pp = Math.max(0.9, pp * 0.92); pts = W.KF_faceLights(F, pp) || []; }
      return { i: f.i, pitch: pp, need: n0, pts: pts.map(q => [Math.round(q[0] * 1000) / 1000, Math.round(q[1] * 1000) / 1000]) };
    });
  } finally { W.__kxTmpFix = keep; W.eval('KAKU_fix=window.__kxTmpFix'); }
}
