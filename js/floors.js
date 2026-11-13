/* 階・場所ごとの内訳（前のKAKUの「階・場所ごとの内訳」を移したもの）。
 * 部屋ごとに「階・場所」（lv：1F・2F・外構など）を付けると、その単位で数え直して金額を分ける。
 *  - 部屋から数える行（床・壁・天井・巾木など）は、その階の部屋だけで数え直す（ロスの切り上げも階ごと）
 *  - 図面の壁の解体・カッター・照明・配線は、その階の範囲にある物だけで作り直す
 *  - 図面の器具から入れた行は、その階の器具の数で分ける（明細の数を直していたら、その割合で）
 *  - 階の付いていない部屋、手で入れた行、配管とその継手、どの階にも入らない物は「共通」
 * 階ごとに切り上げ直すので、合計は見積もり全体と少しずれることがある（画面と書類に出す）。 */
import { totals } from './calc.js';
import { syncDemoLines } from './project.js';

export const floorsOf = p => { const o = []; (p.rooms || []).forEach(r => { const f = String(r.lv || '').trim(); if (f && !o.includes(f)) o.push(f); }); return o; };

function roomBox(p, r) {
  const plan = p.drawing && p.drawing.plan; if (!plan || r.src !== 'plan') return null;
  let b = null;
  (r.faces || []).forEach(i => { const f = plan.faces.find(z => z.i === i); if (!f) return; f.poly.forEach(q => { b = b ? [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[0]), Math.max(b[3], q[1])] : [q[0], q[1], q[0], q[1]]; }); });
  return b;
}
const inB = (x, y, b) => b && x >= b[0] - 0.3 && x <= b[2] + 0.3 && y >= b[1] - 0.3 && y <= b[3] + 0.3;

/* 図面から 1F・2F… と付ける：部屋の箱が横に重ならず1m以上離れている所で分け、図面の見出し（「3階平面図」など）が
 * まとまりごとに1つずつ見つかればその名前、見つからなければ左から 1F・2F… */
export function autoFloors(p) {
  const R = p.rooms.map(r => { const b = roomBox(p, r); return b ? { r, b, cx: (b[0] + b[2]) / 2 } : null; }).filter(Boolean).sort((a, b) => a.cx - b.cx);
  if (!R.length) return null;
  const groups = [[R[0]]];
  for (let i = 1; i < R.length; i++) { const g = groups[groups.length - 1], maxR = Math.max(...g.map(x => x.b[2])); if (R[i].b[0] - maxR > 1) groups.push([R[i]]); else g.push(R[i]); }
  let names = groups.map((_, k) => (k + 1) + 'F'), fromTitle = false;
  const T = (p.drawing.plan.titles || []);
  if (T.length) {
    const lab = t => { const m = String(t).match(/(B|地下)?\s*([0-9]+|[一二三四五六七八九十]+|R|PH)\s*(階|FL|F)/); if (!m) return null; let n = m[2]; const K = '一二三四五六七八九十'.indexOf(n); if (K >= 0) n = String(K + 1); if (n === 'PH') return 'PH'; if (n === 'R') return 'RF'; return (m[1] ? 'B' : '') + n + 'F'; };
    const got = groups.map(g => {
      const x0 = Math.min(...g.map(x => x.b[0])), x1 = Math.max(...g.map(x => x.b[2])), y0 = Math.min(...g.map(x => x.b[1])), y1 = Math.max(...g.map(x => x.b[3])), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const c = T.map(t => ({ l: lab(t.t), x: t.x, y: t.y })).filter(t => t.l && t.x >= x0 - 1 && t.x <= x1 + 1);
      if (!c.length) return null; c.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)); return c[0].l;
    });
    const seen = {};
    if (got.every(l => { if (!l || seen[l]) return false; seen[l] = 1; return true; })) { names = got; fromTitle = true; }
  }
  groups.forEach((g, k) => g.forEach(x => { x.r.lv = names[k]; }));
  return { names, fromTitle };
}

const clone = o => JSON.parse(JSON.stringify(o));
const isRoomLine = l => l.basis && l.basis.measure && !['manual', 'link'].includes(l.basis.measure);

export function floorBreakdown(p, o) {
  const F = floorsOf(p); if (!F.length) return null;
  const d = p.drawing || {}, plan = d.plan;
  const boxes = {};
  F.forEach(f => p.rooms.filter(r => String(r.lv || '').trim() === f).forEach(r => { const b = roomBox(p, r); if (!b) return; const B = boxes[f]; boxes[f] = B ? [Math.min(B[0], b[0]), Math.min(B[1], b[1]), Math.max(B[2], b[2]), Math.max(B[3], b[3])] : b; }));
  const floorAt = (x, y) => F.find(f => inB(x, y, boxes[f])) || null;
  const wallAt = w => { if (w.pts && w.pts.length) { const x = w.pts.reduce((t, q) => t + q[0], 0) / w.pts.length, y = w.pts.reduce((t, q) => t + q[1], 0) / w.pts.length; return floorAt(x, y); } const S = (w.segs || []).map(i => plan && plan.segs[i]).filter(Boolean); if (!S.length) return null; const x = S.reduce((s, q) => s + q[0] + q[2], 0) / (2 * S.length), y = S.reduce((s, q) => s + q[1] + q[3], 0) / (2 * S.length); return floorAt(x, y); };
  const hatsuAt = h => floorAt((h.rect[0] + h.rect[2]) / 2, (h.rect[1] + h.rect[3]) / 2);
  const fxAt = x => floorAt((x.b[0] + x.b[2]) / 2, (x.b[1] + x.b[3]) / 2);
  /* 器具の数（種類ごと・階ごと） */
  const fxc = {}; [...F, null].forEach(f => { fxc[f] = {}; });
  (d.fixtures || []).forEach(x => { const f = fxAt(x); fxc[f][x.t] = (fxc[f][x.t] || 0) + 1; });
  const fixAll = t => [...F, null].reduce((s, f) => s + (fxc[f][t] || 0), 0);

  const build = f => {
    const tp = clone(p), mine = r => (String(r.lv || '').trim() || null) === f;
    tp.rooms = p.rooms.filter(mine);
    const ids = new Set(tp.rooms.map(r => r.id));
    const kept = [];
    p.lines.forEach(l => {
      if (l.fromDemo) { kept.push(clone(l)); return; }   // 下でその階の物だけで作り直す（単価は引き継ぐ）
      if (isRoomLine(l)) {
        const rs = l.basis.rooms === 'all' || !Array.isArray(l.basis.rooms) ? null : l.basis.rooms.filter(id => ids.has(id));
        if (rs && !rs.length) return;
        kept.push({ ...clone(l), basis: { ...l.basis, rooms: rs || 'all' } });
        return;
      }
      if (l.fromFix) {
        const all = fixAll(l.fromFix), n = fxc[f][l.fromFix] || 0;
        if (!all || !n) return;
        /* 階ごとに四捨五入、残りは「共通」に（合計が明細とそろうように） */
        if (f !== null) { const q = Math.round(Number(l.qty || 0) * n / all); if (q > 0) kept.push({ ...clone(l), qty: q }); }
        return;
      }
      if (f === null) kept.push(clone(l));   // 手で入れた行・配管と継手は共通
    });
    if (f === null) {
      /* 器具の行の残り：明細の数 − 各階に分けた数 */
      p.lines.filter(l => l.fromFix).forEach(l => { const all = fixAll(l.fromFix); if (!all) return; const given = F.reduce((s, g) => s + Math.round(Number(l.qty || 0) * (fxc[g][l.fromFix] || 0) / all), 0); const q = Number(l.qty || 0) - given; if (q > 0) kept.push({ ...clone(l), qty: q }); });
    }
    tp.lines = kept;
    if (tp.drawing) {
      tp.drawing.walls = (d.walls || []).filter(w => wallAt(w) === f).map(clone);
      tp.drawing.hatsu = (d.hatsu || []).filter(h => hatsuAt(h) === f).map(clone);
      tp.drawing.lights = (d.lights || []).filter(x => floorAt(x.x, x.y) === f).map(clone);
      tp.drawing.outlets = (d.outlets || []).filter(x => floorAt(x.x, x.y) === f).map(clone);
      tp.drawing.switches = (d.switches || []).filter(x => floorAt(x.x, x.y) === f).map(clone);
      tp.drawing.places = (d.places || []).map(x => { const c = clone(x); if (c.where === 'pt') return c.p && floorAt(c.p[0], c.p[1]) === f ? c : null; c.pts = (c.pts || []).filter(q => floorAt(q[0], q[1]) === f); return c.pts.length ? c : null; }).filter(Boolean);
      if (d.panel && floorAt(d.panel[0], d.panel[1]) !== f) tp.drawing.panel = null;
      syncDemoLines(tp);
    }
    const t = totals(tp, o);
    const rows = tp.lines.map((l, i) => ({ l, qty: t.lines[i].qty, amount: t.lines[i].amount })).filter(x => x.qty > 0);
    return { name: f === null ? '共通' : f, rows, sub: rows.reduce((s, x) => s + x.amount, 0) };
  };
  const parts = F.map(build);
  const common = build(null);
  if (common.rows.length) parts.push(common);
  const total = totals(p, o).subtotal;
  return { parts, sum: parts.reduce((s, x) => s + x.sub, 0), total };
}
