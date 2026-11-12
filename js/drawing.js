/* 図面の読み込み（JWW・DXF・PDF）。
 * 読み取りの中身は前のKAKUと同じ計算エンジン（js/kaku-engine.html、概算くん）をそのまま使う。
 * 読み取りの精度を変えないため、エンジンには手を入れない。ここでは読み取った区画を新しいKAKUの部屋にするだけ。 */

let enginePromise = null;
export function getEngine() {
  if (enginePromise) return enginePromise;
  enginePromise = new Promise((resolve, reject) => {
    const f = document.createElement('iframe');
    f.title = '図面の読み取り'; f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    fetch('./js/kaku-engine.html').then(r => {
      if (!r.ok) throw new Error('図面の読み取りの部品を読み込めませんでした（' + r.status + '）');
      return r.text();
    }).then(html => {
      f.onload = () => {
        let n = 0;
        const t = setInterval(() => {
          const e = f.contentWindow && f.contentWindow.KakuEngine;
          if (e) { clearInterval(t); resolve(e); }
          else if (++n > 150) { clearInterval(t); reject(new Error('図面の読み取りの部品が起動しませんでした')); }
        }, 100);
      };
      f.srcdoc = html;
    }).catch(e => { enginePromise = null; reject(e); });
  });
  return enginePromise;
}

const q3 = v => Math.round(v * 1000) / 1000;

/* ファイルを読んで、保存できる形の図面（m単位）を返す */
export async function importDrawing(files) {
  const eng = await getEngine();
  const res = await eng.importFiles(files);
  const P = eng.plan();
  if (!P || !P.faces || !P.faces.length) {
    return { plan: null, message: (res && res.message) || '部屋の区画が見つかりませんでした' };
  }
  const plan = {
    segs: P.segs.map(s => s.map(q3)),
    dsegs: (P.dsegs || []).map(s => s.map(q3)),
    faces: P.faces.map(f => ({ i: f.i, name: f.name || '', area: f.area, peri: f.peri, ch: f.ch || 0, poly: f.poly.map(p => [q3(p[0]), q3(p[1])]) })),
    titles: (P.titles || []).slice(0, 40),
    unit: P.unit || '', scale: P.scale || ''
  };
  orderFaces(plan); plan.order = 2;
  return { plan, message: (res && res.message) || '読み込みました' };
}

/* 区画の番号（前のKAKUの KAKU_orderFaces と同じ）：横に離れた建物ごとにまとめ、その中で上の段から左→右の順 */
export function orderFaces(P) {
  const F = P.faces;
  F.forEach(f => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; f.poly.forEach(([x, y]) => { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }); f.bb = [a, b, c, d]; });
  const groups = []; let cur = null, end = -Infinity;
  [...F].sort((p, q) => p.bb[0] - q.bb[0]).forEach(f => { if (!cur || f.bb[0] > end + 0.05) { cur = []; groups.push(cur); end = f.bb[2]; } else end = Math.max(end, f.bb[2]); cur.push(f); });
  const order = [];
  groups.forEach(g => { g.sort((p, q) => q.bb[3] - p.bb[3]); const rows = []; g.forEach(f => { const r = rows.find(r => Math.abs(r.top - f.bb[3]) < 0.3); if (r) r.f.push(f); else rows.push({ top: f.bb[3], f: [f] }); }); rows.forEach(r => { r.f.sort((p, q) => p.bb[0] - q.bb[0]); order.push(...r.f); }); });
  order.forEach((f, k) => { f.no = k + 1; let x = 0, y = 0; f.poly.forEach(p => { x += p[0]; y += p[1]; }); f.cx = q3(x / f.poly.length); f.cy = q3(y / f.poly.length); delete f.bb; });
  P.faces = order;
}

/* 図面に書いてある天井高（面積の一番広い天井高） */
export function planCH(plan) {
  if (!plan || !plan.faces) return 0;
  const n = {};
  plan.faces.forEach(f => { const v = +f.ch || 0; if (v > 0) n[v] = (n[v] || 0) + Math.max(+f.area || 0, 0.01); });
  let best = 0, bn = 0;
  Object.keys(n).forEach(k => { const v = +k; if (n[k] > bn || (n[k] === bn && v > best)) { best = v; bn = n[k]; } });
  return best;
}

/* いくつかの区画を1部屋にまとめた時の面積と周長（前のKAKUの KAKU_groupGeom と同じ計算：
 * 面積は合計、周長は外まわり＝各区画の周長の合計 − 向かい合って接している辺の長さ×2） */
export function groupGeom(faces) {
  const r2 = v => Math.round((+v || 0) * 100) / 100;
  let area = 0, peri = 0;
  faces.forEach(f => { area += f.area; peri += f.peri; });
  const ccw = P => { let a = 0; for (let k = 0; k < P.length; k++) { const p = P[k], q = P[(k + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a < 0 ? P.slice().reverse() : P; };
  const E = faces.map(f => { const P = ccw(f.poly); return P.map((p, k) => [p, P[(k + 1) % P.length]]); });
  let shared = 0;
  for (let a = 0; a < E.length; a++) for (let b = a + 1; b < E.length; b++) E[a].forEach(([p, q]) => E[b].forEach(([u, v]) => {
    const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy); if (L < 1e-6) return;
    const ex = dx / L, ey = dy / L; const ux = v[0] - u[0], uy = v[1] - u[1], L2 = Math.hypot(ux, uy); if (L2 < 1e-6) return;
    if (Math.abs(ex * uy / L2 - ey * ux / L2) > 0.02) return; if (ex * ux + ey * uy >= 0) return;
    if (ex * (u[1] - p[1]) - ey * (u[0] - p[0]) > 0.005) return; const dist = Math.abs((u[0] - p[0]) * ey - (u[1] - p[1]) * ex); if (dist > 0.04) return;
    const t1 = (u[0] - p[0]) * ex + (u[1] - p[1]) * ey, t2 = (v[0] - p[0]) * ex + (v[1] - p[1]) * ey;
    const ov = Math.min(L, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2)); if (ov > 0) shared += ov;
  }));
  return { area: r2(area), perim: r2(Math.max(0, peri - 2 * shared)) };
}
