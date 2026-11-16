/* 新しい読み取り・段階3：線のまとまり（レイヤー＋色＋線種）ごとに役割を見分ける（画面に触らない）。
 * 線1本ずつではなく、まとまりごとに決める。今の読み取りは、まとまりごとの「使う・使わない」を元から持っているので、
 * 中身は変えずに選び方だけを変えて、区画探しをもう一度回す（回すのは legacy.js）。
 * 壁と決めるのではなく、「壁ではなさそうな物」だけを外す。決め手が無いまとまりは今まで通り使う。
 *   segs   [[x1, y1, x2, y2, まとまりの番号], …]（m）
 *   groups [{ on }]（今の読み取りが使っているか）
 *   texts  [{ t, x, y }]
 *   regions 段階1で見つけた図枠・表・表題欄 [{ type, box }] */
export const ROLE = { tiny: '細かい線（器具・曲線）', dim: '寸法の線', sheet: '表・図枠の線' };

export function groupStats({ segs = [], groups = [], texts = [], regions = [] } = {}) {
  const regs = regions.filter(r => r.type === 'table' || r.type === 'title').map(r => r.box), frames = regions.filter(r => r.type === 'frame').map(r => r.box);
  /* 寸法の数字（2〜7桁の数字だけの文字）を 0.5m のマスに入れて、線の真ん中の近く（35cm以内）にあるか見る */
  const grid = new Map(), key = (a, b) => a + ',' + b;
  texts.forEach(t => { if (!/^[\d,]{2,7}$/.test(String(t.t || ''))) return; const k = key(Math.round(t.x / 0.5), Math.round(t.y / 0.5)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(t); });
  const numNear = (x, y) => { const gx = Math.round(x / 0.5), gy = Math.round(y / 0.5); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const a = grid.get(key(gx + dx, gy + dy)); if (a && a.some(t => Math.abs(t.x - x) <= 0.35 && Math.abs(t.y - y) <= 0.35)) return true; } return false; };
  const near = (a, b) => Math.abs(a - b) < 0.03;
  const S = groups.map((g, gi) => ({ gi, on: !!(g && g.on), n: 0, tot: 0, short: 0, reg: 0, dim: 0 }));
  segs.forEach(s => {
    const o = S[s[4]]; if (!o) return;
    const l = Math.hypot(s[2] - s[0], s[3] - s[1]), mx = (s[0] + s[2]) / 2, my = (s[1] + s[3]) / 2;
    o.n++; o.tot += l; if (l < 0.15) o.short++;
    if (regs.some(b => mx >= b[0] - 0.05 && mx <= b[2] + 0.05 && my >= b[1] - 0.05 && my <= b[3] + 0.05)) o.reg += l;
    else if (frames.some(b => (near(s[0], b[0]) && near(s[2], b[0])) || (near(s[0], b[2]) && near(s[2], b[2])) || (near(s[1], b[1]) && near(s[3], b[1])) || (near(s[1], b[3]) && near(s[3], b[3])))) o.reg += l;
    if (l >= 0.3 && numNear(mx, my)) o.dim += l;
  });
  return S.filter(o => o.n).map(o => ({ gi: o.gi, on: o.on, n: o.n, tot: o.tot, mean: o.tot / o.n, short: o.short / o.n, sheet: o.tot ? o.reg / o.tot : 0, dim: o.tot ? o.dim / o.tot : 0 }));
}

/* 役割：今使っているまとまりのうち、壁ではなさそうな物だけ返す { まとまりの番号: 役割 } */
export function roleOf(o) {
  if (!o.on) return null;
  if (o.mean < 0.03 || (o.short >= 0.97 && o.n >= 200)) return 'tiny';
  if (o.dim >= 0.45) return 'dim';
  if (o.sheet >= 0.6) return 'sheet';
  return null;
}
export function groupRoles(input) {
  const st = groupStats(input), off = {};
  st.forEach(o => { const r = roleOf(o); if (r) off[o.gi] = r; });
  /* 全部外れる時は何もしない（壁が残らないと区画が作れない） */
  if (!st.some(o => o.on && !off[o.gi])) return { off: {}, stats: st };
  return { off, stats: st };
}
