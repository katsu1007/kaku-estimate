/* 照明の自動配置と配線（画面に触らない計算だけ。tests/lighting.test.mjs でテスト）
 * 決まり（かつが決めたこと・前のKAKUと同じ）：
 *   ・壁から600mm空けて、残りを均等に割る。位置は50mm単位
 *   ・細い通路（短い辺が1.5m未満）は真ん中に一列
 *   ・L字・欠き込みの部屋は四角に分けて並べる。部屋の外や壁ぎわ30cm未満には置かない
 *   ・間隔は2.0mから。天井が2.4mより高い時は0.3mごとに1割詰める（プランC）
 *   ・部屋の用途を選んだ時は光束法：必要台数 N = 照度 × 面積 ÷（1台の lm × 照明率 × 保守率0.8）。足りるまで間隔を詰める（0.9mまで） */

export const USES = [
  ['', 'なし（間隔だけで並べる）', 0, 0],
  ['office', '事務室', 750, 0.75], ['meeting', '会議室・応接室', 500, 0.75], ['drafting', '設計室・製図室', 1500, 0.75],
  ['shop', '店舗（売場）', 500, 0.85], ['restaurant', '飲食店（客席）', 300, 0.75], ['kitchen-biz', '厨房・調理室', 500, 0.85],
  ['living', '居間・リビング', 200, 0.75], ['dining', 'ダイニング・キッチン', 300, 0.75], ['bedroom', '寝室・和室', 150, 0.4],
  ['study', '書斎・子供部屋', 500, 0.75], ['bath', '浴室・洗面所・脱衣所', 300, 0.75],
  ['toilet', 'トイレ', 200, 0], ['corridor', '廊下・階段・玄関', 100, 0], ['storage', '倉庫・物置', 100, 0]
];
export const DEF_LM = { 'e-dl100': 800, 'e-dl100s': 650, 'e-dl125': 1200, 'e-dl150': 1600, 'e-clight': 4000, 'e-light': 800, 'e-bl': 2000, 'e-base': 5200 };
const UT = [[0.6, 0.40], [0.8, 0.48], [1, 0.54], [1.25, 0.60], [1.5, 0.64], [2, 0.70], [2.5, 0.74], [3, 0.77], [4, 0.80], [5, 0.82]];
export const MF = 0.8;
export const EDGE = 0.6, GRID = 0.05, WALL_MIN = 0.3, NARROW = 1.5;

export function util(K) {
  if (K <= UT[0][0]) return UT[0][1] * Math.max(0.5, K / UT[0][0]);
  for (let i = 1; i < UT.length; i++) if (K <= UT[i][0]) { const a = UT[i - 1], b = UT[i]; return a[1] + (b[1] - a[1]) * (K - a[0]) / (b[0] - a[0]); }
  return UT[UT.length - 1][1];
}
const perimOf = P => P.reduce((s, a, i) => { const b = P[(i + 1) % P.length]; return s + Math.hypot(b[0] - a[0], b[1] - a[1]); }, 0);
export const areaOf = P => Math.abs(P.reduce((s, a, i) => { const b = P[(i + 1) % P.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;

/* 光束法の必要台数（用途なしは 0） */
export function needCount(poly, ch, use, lm) {
  const u = USES.find(x => x[0] === use);
  if (!u || !u[2] || !(lm > 0)) return 0;
  const A = areaOf(poly), Hm = Math.max(0.5, ch - u[3]), K = 2 * A / (Hm * perimOf(poly));
  return Math.max(1, Math.ceil(u[2] * A / (lm * util(K) * MF) - 1e-9));
}

export function pip(x, y, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
export function edgeDist(x, y, P) { let d = Infinity; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)) : 0; d = Math.min(d, Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y)); } return d; }

/* 前のKAKUと同じ：2.4mを超えたら0.3mごと（端数は切り上げ）に1割詰める。詰めるのは元の間隔の7割まで */
export const pitchFor = (ch, base = 2) => base * Math.max(0.7, Math.pow(0.9, ch > 2.4 + 1e-6 ? Math.ceil((ch - 2.4) / 0.3 - 1e-9) : 0));

/* 部屋1つの照明の点。use を選んだ時は光束法の台数に届くまで間隔を詰める */
/* 照度の目安（置いた台数から） */
export function luxOf(P, ch, use, lm, n) {
  const u = USES.find(x => x[0] === use); if (!u || !u[2]) return 0;
  const A = areaOf(P), Hm = Math.max(0.5, ch - u[3]), K = 2 * A / (Hm * perimOf(P));
  return n * lm * util(K) * MF / A;
}

/* 配線：スイッチ→照明をつなぐ（近い順に一筆書き）。長さは図面の上の長さ×1.1（たるみ）＋天井までの立ち上がり（天井高−1.2m） */
/* ==== 配線（前のKAKUの KW_calc をそのまま移したもの） ====
 * 区画ごと：スイッチが無ければ入口のそば（ドアの取っ手側・壁の線が無い開口の横。部屋の外側＝広い方へ出る入口を優先）に置く。
 * スイッチ→照明：近い順に縦横でたどった長さ＋立ち下がり（天井高−1.2m）＋照明1台ごとに0.2m。
 * 分電盤→部屋：縦横の長さ＋（天井高−1.5m）。1枚の図面に階を横に並べてある時は、横に1m以上離れた所で分けて、同じまとまりの分電盤だけ使う。
 * ケーブルの数量は 余り（既定10%）を足して切り上げ */
const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0, q = [a[0] + dx * t, a[1] + dy * t]; return { d: Math.hypot(p[0] - q[0], p[1] - q[1]), q, t }; };
const polyD = (p, poly) => { if (pip(p[0], p[1], poly)) return 0; let d = 1e9; for (let k = 0; k < poly.length; k++) d = Math.min(d, segD(p, poly[k], poly[(k + 1) % poly.length]).d); return d; };
export const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

export function autoSwitch(f, faces, segs, doors) {
  const poly = f.poly, cs = [];
  const beyond = (pt, n) => { const q1 = [pt[0] + n[0] * .3, pt[1] + n[1] * .3], q2 = [pt[0] - n[0] * .3, pt[1] - n[1] * .3], q = pip(q1[0], q1[1], poly) ? q2 : q1; let A = Infinity;
    faces.forEach(g => { if (g.i === f.i || !g.poly) return; if (pip(q[0], q[1], g.poly) && g.area < A) A = g.area; }); return A; };
  const edge = k => { const a = poly[k], b = poly[(k + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return { a, b, L, u: [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n: [-(b[1] - a[1]) / L, (b[0] - a[0]) / L] }; };
  const at = (e, t) => [e.a[0] + e.u[0] * t, e.a[1] + e.u[1] * t];
  (doors || []).forEach(d => { if (!d.c) return; let best = null;
    for (let k = 0; k < poly.length; k++) { const e = edge(k), sd = segD(d.c, e.a, e.b); if (sd.d < .3 && (!best || sd.d < best.sd.d)) best = { e, sd }; }
    if (!best) return; const e = best.e, L = e.L, m = d.m || d.c, sg = ((m[0] - d.c[0]) * e.u[0] + (m[1] - d.c[1]) * e.u[1]) >= 0 ? 1 : -1, r = +d.r || .8;
    let t = best.sd.t * L + sg * (r + .15); if (t < .1 || t > L - .1) t = best.sd.t * L - sg * .15; t = Math.max(.1, Math.min(L - .1, t));
    const mid = at(e, Math.max(0, Math.min(L, best.sd.t * L + sg * r / 2))); cs.push({ e, t, A: beyond(mid, e.n), door: 1 }); });
  for (let k = 0; k < poly.length; k++) { const e = edge(k); if (e.L < .6) continue; const iv = [];
    segs.forEach(q => { const p1 = [q[0], q[1]], p2 = [q[2], q[3]], d1 = (p1[0] - e.a[0]) * e.n[0] + (p1[1] - e.a[1]) * e.n[1], d2 = (p2[0] - e.a[0]) * e.n[0] + (p2[1] - e.a[1]) * e.n[1];
      if (Math.abs(d1) > .06 || Math.abs(d2) > .06) return; const t1 = (p1[0] - e.a[0]) * e.u[0] + (p1[1] - e.a[1]) * e.u[1], t2 = (p2[0] - e.a[0]) * e.u[0] + (p2[1] - e.a[1]) * e.u[1];
      const lo = Math.max(0, Math.min(t1, t2)), hi = Math.min(e.L, Math.max(t1, t2)); if (hi - lo > .01) iv.push([lo, hi]); });
    iv.sort((x, y) => x[0] - y[0]); let c = 0; const gaps = []; iv.forEach(v => { if (v[0] - c >= .6) gaps.push([c, v[0]]); c = Math.max(c, v[1]); }); if (e.L - c >= .6) gaps.push([c, e.L]);
    gaps.forEach(g => { const w = g[1] - g[0]; if (w > 3.6) return; if (g[0] < .05 && g[1] > e.L - .05) return;
      let t = g[0] >= .25 ? g[0] - .15 : g[1] + .15; if (t > e.L - .1) t = Math.max(.1, g[0] - .15); cs.push({ e, t, A: beyond(at(e, (g[0] + g[1]) / 2), e.n), door: 0 }); }); }
  let pt, e0;
  if (cs.length) { cs.sort((x, y) => (y.A - x.A) || (y.door - x.door)); e0 = cs[0].e; pt = at(e0, cs[0].t); }
  else { let bk = 0, bl = 0; for (let k = 0; k < poly.length; k++) { const l = edge(k).L; if (l > bl) { bl = l; bk = k; } } e0 = edge(bk); pt = at(e0, Math.min(.3, bl / 2)); }
  const p1 = [pt[0] + e0.n[0] * .07, pt[1] + e0.n[1] * .07], p2 = [pt[0] - e0.n[0] * .07, pt[1] - e0.n[1] * .07];
  return pip(p1[0], p1[1], poly) ? p1 : p2;
}
/* 2点を縦と横の線でつなぐ（曲がり角が部屋の中に入る方） */
export function leg(a, b, poly) { const dx = b[0] - a[0], dy = b[1] - a[1]; if (Math.abs(dx) < .03 || Math.abs(dy) < .03) return [b]; const e1 = [b[0], a[1]], e2 = [a[0], b[1]], i1 = pip(e1[0], e1[1], poly), i2 = pip(e2[0], e2[1], poly);
  return [i1 && !i2 ? e1 : i2 && !i1 ? e2 : (Math.abs(dx) >= Math.abs(dy) ? e1 : e2), b]; }
function chain(start, items) { const left = items.slice(), out = []; let cur = start; while (left.length) { let bi = 0, bd = 1e9; left.forEach((x, i) => { const d = man(cur, x.l); if (d < bd) { bd = d; bi = i; } }); const x = left.splice(bi, 1)[0]; out.push(x); cur = x.l; } return out; }

/* plan: {faces, segs}, lights: [{key, l:[x,y]}], switches: [{key, l}] 置いたスイッチ, panels: [[x,y]], chOf(faceI) */
export function wirePlan({ plan, doors = [], lights = [], switches = [], panels = [], chOf = () => 2.4 }) {
  const res = { paths: [], home: [], sws: [], lenL: 0, lenH: 0, circ: 0, autoSw: 0, far: 0, nL: lights.length };
  const faces = (plan.faces || []).filter(f => f.poly && (f.area || areaOf(f.poly)) >= .6).map(f => ({ ...f, area: f.area || areaOf(f.poly) }));
  const bx = f => { let a = 1e9, b = -1e9; f.poly.forEach(q => { a = Math.min(a, q[0]); b = Math.max(b, q[0]); }); return [a, b]; };
  const fgrp = {}; let gi = 0, mx = -1e9;
  faces.map(f => ({ f, b: bx(f) })).sort((a, b) => a.b[0] - b.b[0]).forEach(o => { if (o.b[0] - mx > 1 && mx > -1e8) gi++; fgrp[o.f.i] = gi; mx = Math.max(mx, o.b[1]); });
  const pg = l => { let f = null, bd = 1e9; faces.forEach(x => { const dd = polyD(l, x.poly); if (dd < bd) { bd = dd; f = x; } }); return f ? fgrp[f.i] : -1; };
  const pns = panels.map(l => ({ l, grp: pg(l) }));
  const owner = (l, tol) => { let b = null; faces.forEach(f => { const dd = polyD(l, f.poly); if (dd <= tol && (!b || dd < b.dd - 1e-6 || (Math.abs(dd - b.dd) < 1e-6 && f.area < b.f.area))) b = { f, dd }; }); return b && b.f; };
  const byFace = {}, order = [];
  lights.forEach(d => { const f = owner(d.l, .05); if (!f) return; if (!byFace[f.i]) { byFace[f.i] = { f, L: [] }; order.push(f.i); } byFace[f.i].L.push(d); });
  const used = {};
  order.forEach(fi => { const { f, L } = byFace[fi], ch = chOf(f.i); let head = null;
    let S = switches.filter(s => polyD(s.l, f.poly) <= .35);
    if (!S.length) S = [{ key: 'a:' + f.i, l: autoSwitch(f, faces, plan.segs || [], doors), auto: true }];
    const grp = {}, gk = [];
    L.forEach(d => { let s = null, bd = 1e9; S.forEach(x => { const dd = man(x.l, d.l); if (dd < bd) { bd = dd; s = x; } }); if (!grp[s.key]) { grp[s.key] = { s, L: [] }; gk.push(s.key); } grp[s.key].L.push(d); });
    gk.forEach(k => { const g = grp[k], s = g.s; if (!used[s.key]) { used[s.key] = 1; res.sws.push(s); if (s.auto) res.autoSw++; }
      const ord = chain(s.l, g.L), pts = [s.l]; let cur = s.l, len = 0;
      ord.forEach(d => { leg(cur, d.l, f.poly).forEach(q => pts.push(q)); len += man(cur, d.l); cur = d.l; });
      res.paths.push({ pts }); res.circ++; res.lenL += len + Math.max(0, ch - 1.2) + ord.length * .2; if (!head) head = s.l; });
    if (pns.length && head) { let pn = null, pd = 1e9; pns.forEach(d => { if (d.grp !== fgrp[f.i]) return; const dd = man(d.l, head); if (dd < pd) { pd = dd; pn = d; } });
      if (pn) { res.lenH += pd + Math.max(0, ch - 1.5); res.home.push({ pts: [pn.l].concat(leg(pn.l, head, f.poly)) }); } else res.far++; }
  });
  return res;
}
export const cableQty = (m, extra = 10) => Math.ceil(m * (1 + (+extra || 0) / 100) - 1e-9);
