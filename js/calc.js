/* 計算（画面に触らない純粋な関数だけ）。
 * 数量・金額・原価・検算はすべてここで計算し、tests/calc.test.mjs でテストする。
 * 決まり（今のKAKU・概算くんと同じ）：
 *   ・壁の面積 ＝ 周長 × 天井高 − 窓 − ドア（ドア1か所 1.6㎡、寸法の無い窓1か所 1.6㎡）
 *   ・巾木 ＝ 周長 − ドアの幅（1か所 0.8m）
 *   ・材料はロス込み（ピッタリにしない）。板物は枚数に切り上げ、ほかは0.1単位で切り上げ。手間は正味
 */

export const DEFAULTS = Object.freeze({
  ceilH: 2.4,      // 天井高の標準（m）
  doorArea: 1.6,   // ドア1か所の面積（㎡）
  doorW: 0.8,      // ドアの幅（m）
  winArea: 1.6,    // 寸法を入れていない窓1か所の面積（㎡）
  loss: 10,        // 材料のロス率（%）
  taxRate: 10,     // 消費税（%）
  matRate: 60,     // 材料の掛け率（定価の%）
  laborRate: 70    // 手間の原価率（%）
});

export const MEASURES = Object.freeze({
  floor: { label: '床の面積', unit: '㎡' },
  ceil: { label: '天井の面積', unit: '㎡' },
  wall: { label: '壁の面積', unit: '㎡' },
  perim: { label: '周りの長さ', unit: 'm' },
  base: { label: '巾木の長さ', unit: 'm' },
  count: { label: '部屋の数', unit: '室' },
  manual: { label: '数量を手で入れる', unit: '' },
  link: { label: '配管の長さから', unit: '' }
});

const num = (v, d = 0) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : Number(v);
  return Number.isFinite(n) ? n : d;
};
/* 浮動小数のずれを消してから切り上げ（1.1*3 が 3.3000000000000003 になって 3.4 にならないように） */
export const ceilTo = (v, step) => {
  if (!(v > 0)) return 0;
  const k = v / step;
  return round3(Math.ceil(Math.round(k * 1e6) / 1e6) * step);
};
export const round3 = v => Math.round(v * 1000) / 1000;

/* 部屋1つの数量。room.w・room.d は m、room.h は天井高 m（空なら標準）。
 * shape 'free' の時は area（㎡）と perim（m）を直接使う（L字など） */
export function roomGeom(room, opt = DEFAULTS) {
  const o = { ...DEFAULTS, ...opt };
  const qty = Math.max(0, Math.round(num(room.qty, 1)));
  const h = num(room.h) > 0 ? num(room.h) : o.ceilH;
  let area, perim;
  if (room.shape === 'free') {
    area = Math.max(0, num(room.area));
    perim = Math.max(0, num(room.perim));
  } else {
    const w = Math.max(0, num(room.w)), d = Math.max(0, num(room.d));
    area = w * d;
    perim = w > 0 && d > 0 ? 2 * (w + d) : 0;
  }
  const doors = Math.max(0, Math.round(num(room.doors)));
  const wins = Array.isArray(room.windows) ? room.windows : [];
  const winSized = wins.reduce((s, x) => s + Math.max(0, num(x.w)) / 1000 * Math.max(0, num(x.h)) / 1000 * Math.max(0, Math.round(num(x.n, 1))), 0);
  const winCount = Math.max(0, Math.round(num(room.winCount)));
  const openings = doors * o.doorArea + winSized + winCount * o.winArea;
  const wall1 = Math.max(0, perim * h - openings);
  const base1 = Math.max(0, perim - doors * o.doorW);
  return {
    qty, h,
    floor: round3(area * qty),
    ceil: round3(area * qty),
    perim: round3(perim * qty),
    wall: round3(wall1 * qty),
    base: round3(base1 * qty),
    count: qty,
    openings: round3(openings * qty)
  };
}

/* 部屋から数える行か（手入力・配管から数える行は違う） */
export const isRoomBased = l => !!(l.basis && l.basis.measure && l.basis.measure !== 'manual' && l.basis.measure !== 'link');

/* 配管から数える行（継手・支持金具・保温・手間）：元の配管の長さ（正味）× 1mあたりの数。
 * ceil の時は個数なので切り上げ。元の行が無い時は 0（検算でエラーにする） */
function linkQty(line, rooms, opt, lines) {
  const b = line.basis;
  const parent = (lines || []).find(x => x.id === b.line);
  if (!parent || parent === line || (parent.basis && parent.basis.measure)) return 0; // 元は手で長さを入れた配管の行だけ
  const v = round3(netQty(parent, rooms, opt, lines) * Math.max(0, num(b.rate)));
  return b.ceil ? Math.ceil(v - 1e-9) : v;
}

/* 明細1行の正味の数量（ロス前）。basis が無い・manual の時は手で入れた数量 */
export function netQty(line, rooms, opt, lines) {
  const b = line.basis;
  if (b && b.measure === 'link') return linkQty(line, rooms, opt, lines);
  if (!b || !b.measure || b.measure === 'manual') return Math.max(0, num(line.qty));
  const ids = b.rooms === 'all' || !Array.isArray(b.rooms) ? null : new Set(b.rooms);
  return round3((rooms || []).filter(r => !ids || ids.has(r.id)).reduce((s, r) => s + (roomGeom(r, opt)[b.measure] || 0), 0));
}

/* ロス込みの数量。手間（kind が labor）と手入力の行は正味のまま。
 * ただし applyLoss の付いた手入力の行（配管の長さ）はロスを足す。配管から数える行（継手など）は足さない */
export function lineQty(line, rooms, opt = DEFAULTS, lines) {
  const o = { ...DEFAULTS, ...opt };
  const q = netQty(line, rooms, o, lines);
  const auto = isRoomBased(line) || (line.applyLoss && !(line.basis && line.basis.measure === 'link'));
  if (!auto || line.kind === 'labor' || !(q > 0)) return q;
  const loss = line.loss === '' || line.loss == null ? o.loss : Math.max(0, num(line.loss));
  const sheet = num(line.sheet);
  if (sheet > 0) return round3(Math.ceil(q * (1 + loss / 100) / sheet - 1e-9) * sheet);
  return round3(ceilTo(q * (1 + loss / 100), 0.1));
}

export const lineAmount = (line, rooms, opt, lines) => Math.round(lineQty(line, rooms, opt, lines) * Math.max(0, num(line.price)));

/* 原価：材料＝定価×掛け率、手間＝単価×原価率、外注・その他＝入れた原価（無ければ見積単価のまま） */
export function lineCost(line, rooms, opt = DEFAULTS, lines) {
  const o = { ...DEFAULTS, ...opt };
  const q = lineQty(line, rooms, o, lines);
  const price = Math.max(0, num(line.price));
  if (line.cost !== '' && line.cost != null && line.kind !== 'mat' && line.kind !== 'labor') return Math.round(q * num(line.cost));
  if (line.kind === 'mat') return Math.round(q * price * num(o.matRate) / 100);
  if (line.kind === 'labor') return Math.round(q * price * num(o.laborRate) / 100);
  return Math.round(q * price);
}

export const KINDS = Object.freeze({ mat: '材料', labor: '手間', sub: '外注', other: 'その他' });

/* 案件全体の合計 */
export function totals(project, opt = DEFAULTS) {
  const o = { ...DEFAULTS, ...opt };
  const rooms = project.rooms || [];
  const all = project.lines || [];
  const lines = all.map(l => {
    const qty = lineQty(l, rooms, o, all);
    const amount = lineAmount(l, rooms, o, all);
    const cost = lineCost(l, rooms, o, all);
    return { id: l.id, qty, amount, cost, kind: l.kind || 'other' };
  });
  const subtotal = lines.reduce((s, x) => s + x.amount, 0);
  const overhead = Math.round(subtotal * Math.max(0, num(project.overheadPct)) / 100);
  const profit = Math.round(subtotal * Math.max(0, num(project.profitPct)) / 100);
  const discount = Math.max(0, Math.round(num(project.discount)));
  const net = Math.max(0, subtotal + overhead + profit - discount);
  const taxRate = project.taxRate === '' || project.taxRate == null ? o.taxRate : num(project.taxRate);
  const tax = Math.floor(net * taxRate / 100);
  const cost = lines.reduce((s, x) => s + x.cost, 0);
  const byKind = {};
  for (const k of Object.keys(KINDS)) byKind[k] = { amount: 0, cost: 0 };
  lines.forEach(x => { const k = byKind[x.kind] ? x.kind : 'other'; byKind[k].amount += x.amount; byKind[k].cost += x.cost; });
  const gross = net - cost;
  return { lines, subtotal, overhead, profit, discount, net, taxRate, tax, grand: net + tax, cost, gross, grossPct: net > 0 ? gross / net * 100 : 0, byKind };
}

/* 検算：別の計算の道筋でもう一度計算して、合わない所と怪しい所を出す。
 * level: 'error'（このままだと金額が間違う）／'warn'（確かめてほしい） */
export function check(project, opt = DEFAULTS) {
  const o = { ...DEFAULTS, ...opt };
  const out = [];
  const rooms = project.rooms || [];
  const roomIds = new Set(rooms.map(r => r.id));
  const add = (level, msg, ref) => out.push({ level, msg, ...ref });
  rooms.forEach(r => {
    const g = roomGeom(r, o);
    if (!(g.floor > 0)) add('warn', `「${r.name || '名前なし'}」の広さが0です。寸法を入れてください。`, { roomId: r.id });
    if (r.shape !== 'free' && (num(r.w) > 50 || num(r.d) > 50)) add('warn', `「${r.name}」の寸法が50mを超えています。mm で入れていないか確かめてください。`, { roomId: r.id });
    if (num(r.h) > 0 && (num(r.h) < 1.8 || num(r.h) > 6)) add('warn', `「${r.name}」の天井高 ${num(r.h)}m を確かめてください。`, { roomId: r.id });
    if (g.qty > 0 && g.wall === 0 && g.perim > 0) add('warn', `「${r.name}」は窓・ドアを引くと壁が0になります。`, { roomId: r.id });
  });
  const all = project.lines || [];
  all.forEach(l => {
    const name = l.name || '名前のない行';
    const q = lineQty(l, rooms, o, all);
    const price = num(l.price);
    if (!(price > 0)) add('error', `「${name}」の単価が入っていません。`, { lineId: l.id });
    const linkedToExisting = l.basis && l.basis.measure === 'link' && all.some(x => x.id === l.basis.line);
    if (!(q > 0) && !linkedToExisting) add('error', `「${name}」の${l.pipe ? '長さ' : '数量'}が0です。`, { lineId: l.id });
    if (num(l.price) < 0 || num(l.qty) < 0) add('error', `「${name}」にマイナスの数字があります。`, { lineId: l.id });
    const b = l.basis;
    if (b && b.measure === 'link' && !all.some(x => x.id === b.line)) add('error', `「${name}」の元の配管の行が消えています。この行も消すか、数量を手で入れてください。`, { lineId: l.id });
    if (isRoomBased(l)) {
      if (Array.isArray(b.rooms) && b.rooms.some(id => !roomIds.has(id))) add('error', `「${name}」が消した部屋を使っています。部屋を選び直してください。`, { lineId: l.id });
      if (b.rooms !== 'all' && Array.isArray(b.rooms) && !b.rooms.length) add('error', `「${name}」に使う部屋が選ばれていません。`, { lineId: l.id });
      const mu = MEASURES[b.measure] && MEASURES[b.measure].unit;
      const lu = (l.unit || '').replace('m2', '㎡');
      if (mu && lu && mu !== lu && !(l.sheet > 0)) add('warn', `「${name}」は${MEASURES[b.measure].label}（${mu}）で数えていますが、単位が「${l.unit}」です。`, { lineId: l.id });
    }
    if (l.loss !== '' && l.loss != null && (num(l.loss) < 0 || num(l.loss) > 30)) add('warn', `「${name}」のロス率 ${num(l.loss)}% を確かめてください。`, { lineId: l.id });
  });
  /* 別の道筋の計算：部屋ごと・行ごとに積み上げ直して、合計と比べる */
  const t = totals(project, o);
  let again = 0;
  const lossOf = l => l.loss === '' || l.loss == null ? o.loss : num(l.loss);
  all.forEach(l => {
    const auto = isRoomBased(l);
    let q = auto ? 0 : Math.max(0, num(l.qty));
    if (l.basis && l.basis.measure === 'link') {
      const par = all.find(x => x.id === l.basis.line);
      const len = par && !(par.basis && par.basis.measure) ? Math.max(0, num(par.qty)) : 0;
      q = len * num(l.basis.rate);
      q = l.basis.ceil ? Math.ceil(round3(q) - 1e-9) : q;
    } else if (!auto && l.applyLoss && l.kind !== 'labor' && q > 0) {
      q = ceilTo(round3(q) * (1 + lossOf(l) / 100), 0.1);
    }
    if (auto) {
      const sel = l.basis.rooms === 'all' || !Array.isArray(l.basis.rooms) ? rooms : rooms.filter(r => l.basis.rooms.includes(r.id));
      sel.forEach(r => { q += roomGeom(r, o)[l.basis.measure] || 0; });
      if (l.kind !== 'labor' && q > 0) {
        const loss = l.loss === '' || l.loss == null ? o.loss : num(l.loss);
        q = l.sheet > 0 ? Math.ceil(round3(q) * (1 + loss / 100) / l.sheet - 1e-9) * l.sheet : ceilTo(round3(q) * (1 + loss / 100), 0.1);
      }
    }
    again += Math.round(round3(q) * Math.max(0, num(l.price)));
  });
  if (again !== t.subtotal) add('error', `小計の計算が合いません（${t.subtotal.toLocaleString()}円／検算 ${again.toLocaleString()}円）。この案件を保存して開発者に知らせてください。`, {});
  if (num(project.overheadPct) > 50) add('warn', `諸経費 ${num(project.overheadPct)}% を確かめてください。`, {});
  if (num(project.profitPct) > 50) add('warn', `利益率 ${num(project.profitPct)}% を確かめてください。`, {});
  if (t.net > 0 && t.gross < 0) add('warn', '原価が見積金額を上回っています（赤字）。', {});
  if (!(project.lines || []).length) add('error', '見積もりの行がありません。', {});
  return out;
}

/* 見積もりの比較（前に出した見積もり vs 今）。行は名前＋規格で突き合わせる */
export function compare(before, after, opt = DEFAULTS) {
  const key = l => `${l.name || ''}｜${l.spec || ''}`;
  const rowsOf = p => {
    const t = totals(p, opt), m = new Map();
    void lineQty;
    (p.lines || []).forEach((l, i) => {
      const k = key(l), r = m.get(k) || { name: l.name, spec: l.spec, unit: l.unit, qty: 0, amount: 0 };
      r.qty = round3(r.qty + t.lines[i].qty); r.amount += t.lines[i].amount; m.set(k, r);
    });
    return { t, m };
  };
  const A = rowsOf(before), B = rowsOf(after);
  const rows = [];
  new Set([...A.m.keys(), ...B.m.keys()]).forEach(k => {
    const a = A.m.get(k), b = B.m.get(k);
    const kind = !a ? 'added' : !b ? 'removed' : (a.amount !== b.amount || a.qty !== b.qty) ? 'changed' : 'same';
    if (kind !== 'same') rows.push({ kind, name: (b || a).name, spec: (b || a).spec, unit: (b || a).unit, qtyA: a ? a.qty : 0, qtyB: b ? b.qty : 0, amountA: a ? a.amount : 0, amountB: b ? b.amount : 0, diff: (b ? b.amount : 0) - (a ? a.amount : 0) });
  });
  rows.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
  return { before: A.t.grand, after: B.t.grand, diff: B.t.grand - A.t.grand, rows };
}
