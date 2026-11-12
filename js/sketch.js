/* 寸法で間取りを作る（前のKAKUの「寸法で間取りを作る」の計算部分を移したもの）。
 * 部屋 = { id, name, v:[[x,y]…] 角（m）, c:[{a,b,l,ok,diag}] 寸法（a番とb番の角の長さ。ok=入れた寸法、false=大まかな長さ）, rough, photo, dirs }
 * 角は自由（直角にそろえない）。入れた寸法に合うように角を動かす（solve）。 */
export const DIRS = [['↑', 0, 1], ['→', 1, 0], ['↓', 0, -1], ['←', -1, 0]];
export const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const area = P => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };
export const peri = P => { let s = 0; for (let i = 0; i < P.length; i++) s += dist(P[i], P[(i + 1) % P.length]); return s; };
export const mm = v => Math.round(v * 1000).toLocaleString('ja-JP');
const rid = () => 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function walk(st, edges) { const P = [st.slice()]; edges.forEach(e => { const a = P[P.length - 1], D = DIRS[e.d]; P.push([a[0] + D[1] * e.l, a[1] + D[2] * e.l]); }); return P; }
export const isEdge = (r, a, b) => { const n = r.v.length; return b === (a + 1) % n || a === (b + 1) % n; };
export function edgeC(r, i) {
  const n = r.v.length, j = (i + 1) % n;
  const c = r.c.find(c => (c.a === i && c.b === j) || (c.a === j && c.b === i));
  if (c) return c;
  const c2 = { a: i, b: j, l: dist(r.v[i], r.v[j]), ok: false }; r.c.push(c2); return c2;
}

export function makeRoom(name, V, okMask) {
  const r = { id: rid(), name, v: V.map(p => [Math.round(p[0] * 10000) / 10000, Math.round(p[1] * 10000) / 10000]), c: [] };
  for (let i = 0; i < V.length; i++) r.c.push({ a: i, b: (i + 1) % V.length, l: dist(V[i], V[(i + 1) % V.length]), ok: !!(okMask && okMask[i]) });
  return area(r.v) < 0.01 ? null : r;
}
/* 長方形：左下の角から上・右。対角線も入れて直角のまま保つ */
export function rectRoom(name, st, W, H) {
  const r = makeRoom(name, [st, [st[0], st[1] + H], [st[0] + W, st[1] + H], [st[0] + W, st[1]]], [1, 1, 1, 1]);
  if (r) r.c.push({ a: 0, b: 2, l: Math.hypot(W, H), ok: true, diag: true });
  return r;
}
/* 次の部屋を置く所：最後の部屋の右下 */
export function nextStart(rooms) {
  if (!rooms.length) return [0, 0];
  const P = rooms[rooms.length - 1].v;
  return [Math.max(...P.map(p => p[0])), Math.min(...P.map(p => p[1]))];
}

/* 寸法に合うように角を動かす（入れた寸法は強く、まだの辺は今の長さを弱く保つ）。1つ目の角と1本目の辺の向きは動かさない */
export function solve(r) {
  const V = r.v, n = V.length; if (n < 3) return r;
  r.c.forEach(c => { if (!c.ok) c.l = dist(V[c.a], V[c.b]); });
  const p0 = V[0].slice(), ang0 = Math.atan2(V[1][1] - V[0][1], V[1][0] - V[0][0]);
  for (let it = 0; it < 600; it++) {
    r.c.forEach(c => { const a = V[c.a], b = V[c.b], d = dist(a, b) || 1e-9, k = c.ok ? 1 : 0.05, diff = (d - c.l) / d * 0.5 * k, dx = (b[0] - a[0]) * diff, dy = (b[1] - a[1]) * diff; a[0] += dx; a[1] += dy; b[0] -= dx; b[1] -= dy; });
    const ang = Math.atan2(V[1][1] - V[0][1], V[1][0] - V[0][0]), rot = ang0 - ang, cs = Math.cos(rot), sn = Math.sin(rot), o = V[0].slice();
    V.forEach(p => { const x = p[0] - o[0], y = p[1] - o[1]; p[0] = p0[0] + x * cs - y * sn; p[1] = p0[1] + x * sn + y * cs; });
  }
  V.forEach(p => { p[0] = Math.round(p[0] * 10000) / 10000; p[1] = Math.round(p[1] * 10000) / 10000; });
  const bad = []; r.c.forEach(c => { if (!c.ok) return; const d = dist(V[c.a], V[c.b]); if (Math.abs(d - c.l) > 0.003) bad.push(mm(c.l) + ' が ' + mm(d)); });
  r.bad = bad.length ? bad.join('・') + ' にしかなりません' : '';
  return r;
}

/* 寸法を入れる。大まかに描いた部屋で最初の寸法なら、その寸法で部屋全体（写真なら写真の縮尺も）を合わせる。
 * 戻り値：次にまだ寸法を入れていない辺の番号（なければ -1） */
export function fixEdge(sk, r, ci, nl) {
  const c = r.c[ci], cur0 = dist(r.v[c.a], r.v[c.b]);
  if (r.rough && !r.c.some(x => x.ok) && cur0 > 0) {
    const k = nl / cur0, o = r.v[0].slice();
    if (r.photo && !sk.sOk) { sk.s *= k; sk.sOk = true; sk.rooms.forEach(q => { if (q.photo && q.rough) q.v.forEach(p => { p[0] *= k; p[1] *= k; }); }); }
    else r.v.forEach(p => { p[0] = o[0] + (p[0] - o[0]) * k; p[1] = o[1] + (p[1] - o[1]) * k; });
  }
  c.l = nl; c.ok = true; solve(r);
  const n = r.v.length, i0 = isEdge(r, c.a, c.b) ? (c.b === (c.a + 1) % n ? c.a : c.b) : -1;
  for (let k2 = 1; k2 <= n; k2++) { const i = ((i0 + k2) % n + n) % n, e = edgeC(r, i); if (!e.ok) return r.c.indexOf(e); }
  return -1;
}

/* ほぼ縦・横（15°以内）の辺を縦・横にそろえ、入れた寸法の長さで描き直す */
export function square(r) {
  let V = r.v; const n = V.length, E2 = [];
  for (let i = 0; i < n; i++) {
    const a = V[i], b = V[(i + 1) % n], dd = r.dirs && r.dirs[i], dx = dd ? dd[0] : b[0] - a[0], dy = dd ? dd[1] : b[1] - a[1], c = edgeC(r, i), L = c.ok ? c.l : dist(a, b);
    const t = Math.abs(dx) < Math.abs(dy) * 0.27 ? 'v' : Math.abs(dy) < Math.abs(dx) * 0.27 ? 'h' : '';
    const cx0 = b[0] - a[0], cy0 = b[1] - a[1];
    E2.push(t === 'h' ? { x: Math.sign(dx) * L, y: 0, ok: c.ok, t } : t === 'v' ? { x: 0, y: Math.sign(dy) * L, ok: c.ok, t } : { x: cx0 / Math.hypot(cx0, cy0) * L, y: cy0 / Math.hypot(cx0, cy0) * L, ok: c.ok, t: '' });
  }
  let sx = 0, sy = 0; E2.forEach(e => { sx += e.x; sy += e.y; });
  [['h', 'x', sx], ['v', 'y', sy]].forEach(z => { if (Math.abs(z[2]) < 1e-6) return; let c2 = E2.filter(e => e.t === z[0] && !e.ok); if (!c2.length) c2 = E2.filter(e => e.t === z[0]); if (!c2.length) return; c2[c2.length - 1][z[1]] -= z[2]; });
  let p = V[0].slice(); const NV = [p.slice()];
  for (let k = 0; k < n - 1; k++) { p = [p[0] + E2[k].x, p[1] + E2[k].y]; NV.push(p.slice()); }
  if (area(NV) < 0.01) return false;
  r.v = NV; V = r.v; r.c.forEach(c => { if (!c.ok) c.l = dist(V[c.a], V[c.b]); }); solve(r);
  return true;
}

/* 形の確かめ：線が交わっている部屋・同じ点を2回通る部屋・ほかの部屋と重なっている部屋 */
export function shapeProblems(rooms) {
  const out = [], E = 1e-9, T = 0.01;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const cross = (a, b, c, d) => { const d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d); return ((d1 > E && d2 < -E) || (d1 < -E && d2 > E)) && ((d3 > E && d4 < -E) || (d3 < -E && d4 > E)); };
  const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  const inside = (p, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if (((a[1] > p[1]) !== (b[1] > p[1])) && (p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0])) c = !c; }
    if (!c) return false; for (let k = 0; k < P.length; k++) if (segD(p, P[k], P[(k + 1) % P.length]) < T) return false; return true; };
  const nm = r => '「' + (r.name || '部屋') + '」';
  const Ps = rooms.map(r => r.v);
  rooms.forEach((r, ri) => { const P = Ps[ri], n = P.length; let bad = false;
    for (let i = 0; i < n && !bad; i++) for (let j = i + 1; j < n && !bad; j++) { if (dist(P[i], P[j]) < 0.005) bad = true; if (j === i + 1 || (i === 0 && j === n - 1)) continue; if (cross(P[i], P[(i + 1) % n], P[j], P[(j + 1) % n])) bad = true; }
    if (bad) out.push(nm(r) + 'の形の線が交わっているか、同じ点を2回通っています。'); });
  const inner = P => { const o = []; for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length], L = dist(a, b); if (L < 0.05) continue; const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, nx = -(b[1] - a[1]) / L * 0.02, ny = (b[0] - a[0]) / L * 0.02;
    let q = [mx + nx, my + ny]; if (!inside(q, P)) q = [mx - nx, my - ny]; if (inside(q, P)) o.push(q); } return o; };
  for (let a = 0; a < Ps.length; a++) for (let b = a + 1; b < Ps.length; b++) {
    const A = Ps[a], B = Ps[b]; let hit = false;
    for (let i = 0; i < A.length && !hit; i++) for (let j = 0; j < B.length && !hit; j++) if (cross(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) hit = true;
    if (!hit) hit = A.some(p => inside(p, B)) || B.some(p => inside(p, A)) || inner(A).some(p => inside(p, B)) || inner(B).some(p => inside(p, A));
    if (hit) out.push(nm(rooms[a]) + 'と' + nm(rooms[b]) + 'が重なっています。');
  }
  return out;
}

/* 図面（区画）にする：部屋1つ＝区画1つ */
export function toPlan(rooms) {
  const segs = [], faces = [];
  rooms.forEach((r, i) => { const P = r.v;
    for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; segs.push([a[0], a[1], b[0], b[1]]); }
    faces.push({ i, sk: r.id, name: r.name, area: +area(P).toFixed(3), peri: +peri(P).toFixed(3), ch: 0, poly: P.map(p => p.slice()) }); });
  return { segs, dsegs: [], faces, titles: [], order: 2 };
}

/* 書き出す図形：壁の線・寸法・部屋の名前と面積（x,y は m、文字は中心、layer 0=壁 1=寸法 2=室名） */
export function geomOf(rooms) {
  const G = { lines: [], texts: [] };
  rooms.forEach(r => {
    const P = r.v; let cx = 0, cy = 0; P.forEach(p => { cx += p[0] / P.length; cy += p[1] / P.length; });
    for (let k = 0; k < P.length; k++) {
      const a = P[k], b = P[(k + 1) % P.length], L = dist(a, b); if (L < 1e-6) continue;
      G.lines.push([a[0], a[1], b[0], b[1], 0]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; let nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
      if ((mx + nx - cx) ** 2 + (my + ny - cy) ** 2 < (mx - nx - cx) ** 2 + (my - ny - cy) ** 2) { nx = -nx; ny = -ny; }
      let deg = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; if (deg > 90) deg -= 180; if (deg <= -90) deg += 180;
      G.texts.push({ s: String(Math.round(L * 1000)), x: mx - nx * 0.3, y: my - ny * 0.3, h: 3, deg, layer: 1 });
    }
    G.texts.push({ s: r.name, x: cx, y: cy + 0.18, h: 4.5, deg: 0, layer: 2 });
    G.texts.push({ s: area(P).toFixed(2) + '㎡', x: cx, y: cy - 0.22, h: 3, deg: 0, layer: 2 });
  });
  return G;
}
