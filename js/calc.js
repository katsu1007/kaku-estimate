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
  laborRate: 70,   // 手間の原価率（%）
  waste: 0.05      // 解体の廃材の量（解体1㎡あたりの m³。品目の名前に「厚○」がある物はその厚み）
});

export const MEASURES = Object.freeze({
  floor: { label: '床の面積', unit: '㎡' },
  ceil: { label: '天井の面積', unit: '㎡' },
  wall: { label: '壁の面積', unit: '㎡' },
  perim: { label: '周りの長さ', unit: 'm' },
  base: { label: '巾木の長さ', unit: 'm' },
  count: { label: '部屋の数', unit: '室' },
  manual: { label: '数量を手で入れる', unit: '' },
  link: { label: '配管の長さから', unit: '' },
  waste: { label: '解体の量から（廃材）', unit: 'm³' }
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
    /* 寸法を足す・引く（前のKAKUと同じ）：足す＝出っ張り（周り＋奥行×2）、引く＝角を欠く（周りそのまま）、
     * 壁際の柱・へこみ（周り＋奥行×2）、部屋の中の柱（周り＋柱の周り）。50以上の数字は mm として m に直す */
    if (perim > 0) (room.parts || []).forEach(x => {
      const m = v => { v = num(v); return v >= 50 ? v / 1000 : v; }, pw = Math.max(0, m(x.w)), ph = Math.max(0, m(x.h));
      if (num(x.s, 1) < 0) { area -= pw * ph; perim += x.k === 'col' ? 2 * (pw + ph) : x.k === 'wall' ? 2 * ph : 0; }
      else { area += pw * ph; perim += 2 * ph; }
    });
    area = Math.max(0, area);
  }
  const doors = Math.max(0, Math.round(num(room.doors)));
  const wins = Array.isArray(room.windows) ? room.windows : [];
  const winSized = wins.reduce((s, x) => s + Math.max(0, num(x.w)) / 1000 * Math.max(0, num(x.h)) / 1000 * Math.max(0, Math.round(num(x.n, 1))), 0);
  const winCount = Math.max(0, Math.round(num(room.winCount)));
  /* 図面で見つけたドア・開口（openRuns）がある部屋は、それを引いて、手で入れたドアの数は使わない（二重に引かないため）
   * ドア：幅×高さ（2.0m、天井が低い時は天井高−5cm）／扉の無い開口：幅×天井高。巾木は開口の幅ぶん短く */
  const runs = !room.openOff && Array.isArray(room.openRuns) && room.openRuns.length ? room.openRuns : null;
  const dh = Math.min(2, h - 0.05);
  const runA = runs ? runs.reduce((s, r) => s + Math.max(0, num(r.len)) * (r.ty === 'd' ? dh : h), 0) : 0;
  const runW = runs ? runs.reduce((s, r) => s + Math.max(0, num(r.len)), 0) : 0;
  /* 窓：寸法を入れた窓がある部屋は、その面積だけ引いて「窓（か所）」の数は使わない（前のKAKUと同じ。両方引くと引きすぎる） */
  const openings = (runs ? runA : doors * o.doorArea) + (winSized > 0 ? winSized : winCount * o.winArea);
  const wall1 = Math.max(0, perim * h - openings);
  const base1 = Math.max(0, perim - (runs ? runW : doors * o.doorW));
  return {
    qty, h,
    floor: round3(area * qty),
    ceil: round3(area * qty),
    perim: round3(perim * qty),
    wall: round3(wall1 * qty),
    base: round3(base1 * qty),
    count: qty,
    openings: round3(openings * qty),
    openAuto: runs ? { area: round3(runA * qty), width: round3(runW * qty), doors: runs.filter(r => r.ty === 'd').length * qty, gaps: runs.filter(r => r.ty !== 'd').length * qty } : null
  };
}

/* 部屋から数える行か（手入力・配管から数える行は違う） */
export const isRoomBased = l => !!(l.basis && l.basis.measure && l.basis.measure !== 'manual' && l.basis.measure !== 'link' && l.basis.measure !== 'waste');

/* 解体の廃材（前のKAKUと同じ決まり）：解体した面積 ×（品目の名前の「厚○」mm、無ければ 1㎡あたり 0.05m³）。
 * 廃材の種類は解体の品目で決まる：コンクリート・ブロック・RC・モルタル・ALC＝ガラ、タイル・塗り壁・レンガ＝がれき混合、
 * ボード＝石膏ボード、フローリング・板・下地合板・根太・畳＝木くず、ほか＝混載 */
export function wasteKind(id) {
  const s = String(id || '');
  if (/-(co|cb|rc|mo)\d|alc|w-dF-co/.test(s)) return 'w-gara';
  if (/tile|nuri|lath|brick/.test(s)) return 'w-wGaraMix';
  if (/board|gyp/.test(s)) return 'w-wGyp';
  if (/-fl$|wood|-base$|joist|tatami/.test(s)) return 'w-wWood';
  return 'w-waste';
}
export const WASTE_ORDER = ['w-waste', 'w-gara', 'w-wGaraMix', 'w-wGyp', 'w-wWood'];
/* 廃材のもとになる行：床・壁・天井の解体（㎡）。カッター・はつりは自分でガラの行を作るので入れない */
export const isDemoArea = l => !!l && /^demo[FWC]$/.test(l.cat || '') && (l.unit || '').replace('m2', '㎡') === '㎡' && !(l.fromDemo && /^h\|/.test(l.fromDemo)) && !(l.basis && l.basis.measure === 'waste');
export const wasteThick = (l, opt = DEFAULTS) => { const m = String(l.name || '').match(/厚(\d+)/); return m ? +m[1] / 1000 : Math.max(0, num({ ...DEFAULTS, ...opt }.waste, 0.05)); };
/* 廃材の行の内訳 [{ id, name, area, t, v }] と合計（m³、0.01 単位） */
export function wasteRows(line, rooms, opt, lines) {
  const kind = (line.basis && line.basis.kind) || 'w-waste';
  return (lines || []).filter(l => l !== line && isDemoArea(l) && wasteKind(l.itemId) === kind).map(l => {
    const area = netQty(l, rooms, opt, lines), t = wasteThick(l, opt);
    return { id: l.id, name: l.name || '', area, t, v: area * t };
  }).filter(x => x.area > 0);
}
/* 解体の行があるのに廃材の行が無い種類の、足す行（id は呼ぶ側で付ける）。
 * 同じ処分の品目を手で入れてある種類と、前に自分で消した種類（project.noWaste）は足さない */
export function missingWaste(project, items) {
  const lines = project.lines || [], off = project.noWaste || {};
  const kinds = new Set(lines.filter(isDemoArea).map(l => wasteKind(l.itemId)));
  return WASTE_ORDER.filter(k => kinds.has(k) && !off[k] && !lines.some(l => l.itemId === k || (l.basis && l.basis.measure === 'waste' && (l.basis.kind || 'w-waste') === k))).map(k => {
    const it = (items || []).find(i => i.id === k);
    return it ? { itemId: it.id, name: it.name, spec: it.spec || '', unit: it.unit, kind: it.kind || 'labor', cat: it.cat, price: it.price || '', cost: '', loss: '', sheet: 0, qty: '', basis: { measure: 'waste', kind: k } } : null;
  }).filter(Boolean);
}
const wasteQty = (line, rooms, opt, lines) => Math.round(wasteRows(line, rooms, opt, lines).reduce((s, x) => s + x.v, 0) * 100 + 1e-9) / 100;

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
/* 壁の行の種類：図面で壁ごとに入れた解体・下地・仕上げを、部屋の壁から引く時に使う */
export const wallGroup = cat => ({ demoW: 'demo', board: 'base', wall: 'fin', paint: 'fin' })[cat] || null;

export function netQty(line, rooms, opt, lines) {
  const b = line.basis;
  if (b && b.measure === 'link') return linkQty(line, rooms, opt, lines);
  if (b && b.measure === 'waste') return wasteQty(line, rooms, opt, lines);
  if (!b || !b.measure || b.measure === 'manual') return Math.max(0, num(line.qty));
  const ids = b.rooms === 'all' || !Array.isArray(b.rooms) ? null : new Set(b.rooms);
  const g0 = b.measure === 'wall' ? wallGroup(line.cat) : null, g = g0 && (line.layer || 1) > 1 ? g0 + line.layer : g0;   // 下の層の解体は demo2, demo3…
  return round3((rooms || []).filter(r => !ids || ids.has(r.id)).reduce((s, r) => {
    let v = roomGeom(r, opt)[b.measure] || 0;
    /* 図面で壁ごとに同じ種類（解体・下地・仕上げ）を入れた分は、その部屋の壁から引く（二重にしない） */
    if (g && r.wallOff && r.wallOff[g] > 0) v = Math.max(0, v - r.wallOff[g]);
    return s + v;
  }, 0));
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

/* 行の数量の根拠（どの部屋から何㎡か）。画面の「根拠」と検算に使う。数量は lineQty と同じ決まりで出す。
 *   type: 'room'（部屋から数える）／'link'（配管の長さから）／'manual'（手で入れた数）
 *   rows: 部屋ごと { id, name, raw（部屋の数量）, off（図面で壁ごとに入れて引いた分）, v（この行に入る分） }
 *   net: 正味の合計、lossPct: 足したロス率（足さない時は null）、sheet: 1枚の大きさ（枚数に切り上げる時）、qty: 見積もりの数量 */
export function lineBasis(line, rooms, opt = DEFAULTS, lines) {
  const o = { ...DEFAULTS, ...opt }, b = line.basis;
  const net = netQty(line, rooms, o, lines), qty = lineQty(line, rooms, o, lines);
  const link = !!(b && b.measure === 'link');
  const lossOn = (isRoomBased(line) || (line.applyLoss && !link)) && line.kind !== 'labor' && net > 0;
  const out = { type: link ? 'link' : b && b.measure === 'waste' ? 'waste' : isRoomBased(line) ? 'room' : 'manual', rows: [], net, qty,
    lossPct: lossOn ? (line.loss === '' || line.loss == null ? o.loss : Math.max(0, num(line.loss))) : null,
    sheet: lossOn && num(line.sheet) > 0 ? num(line.sheet) : 0 };
  if (out.type === 'link') {
    const par = (lines || []).find(x => x.id === b.line);
    out.parent = par ? { id: par.id, name: par.name || '', len: netQty(par, rooms, o, lines) } : null;
    out.rate = Math.max(0, num(b.rate));
  }
  if (out.type === 'waste') out.waste = wasteRows(line, rooms, o, lines).map(x => ({ ...x, area: round3(x.area), v: round3(x.v) }));
  if (out.type === 'room') {
    out.measure = b.measure; out.unit = MEASURES[b.measure] ? MEASURES[b.measure].unit : '';
    const ids = b.rooms === 'all' || !Array.isArray(b.rooms) ? null : new Set(b.rooms);
    const g0 = b.measure === 'wall' ? wallGroup(line.cat) : null, g = g0 && (line.layer || 1) > 1 ? g0 + line.layer : g0;
    (rooms || []).filter(r => !ids || ids.has(r.id)).forEach(r => {
      const raw = roomGeom(r, o)[b.measure] || 0;
      const off = g && r.wallOff && r.wallOff[g] > 0 ? Math.min(raw, r.wallOff[g]) : 0;
      out.rows.push({ id: r.id, name: r.name || '', raw: round3(raw), off: round3(off), v: round3(raw - off) });
    });
  }
  return out;
}

/* 「確認済み」の印：付けた時の数量と単価を覚えておき、後で変わったら「変わりました」にする。
 * 戻り値 'ok'（確認済みのまま）／'changed'（確認の後で数量か単価が変わった）／''（まだ確認していない） */
export function okState(line, rooms, opt = DEFAULTS, lines) {
  const k = line.ok;
  if (!k) return '';
  return k.qty === lineQty(line, rooms, opt, lines) && k.price === Math.max(0, num(line.price)) ? 'ok' : 'changed';
}
export const okMark = (line, rooms, opt = DEFAULTS, lines) => ({ qty: lineQty(line, rooms, opt, lines), price: Math.max(0, num(line.price)), at: Date.now() });

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

/* 品番・色を入れられる行（仕上げの材料）。値段はシリーズ（品目）で決まり、品番は書類に載せるだけ */
export const hasCode = l => !!l.code || (l.kind === 'mat' && ['floor', 'wall', 'ceil', 'trim'].includes(l.cat));
/* 書類・Excel に出す規格：規格の後ろに品番・色を付ける */
export const specOf = l => [String(l.spec || '').trim(), String(l.code || '').trim() ? '品番 ' + String(l.code).trim() : ''].filter(Boolean).join('　');

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
    const isWaste = !!(l.basis && l.basis.measure === 'waste');
    if (!(q > 0) && isWaste) add('warn', `「${name}」は解体の量から数える行ですが、もとになる解体の行がありません。要らなければ消してください。`, { lineId: l.id });
    else if (!(q > 0) && !linkedToExisting) add('error', `「${name}」の${l.pipe ? '長さ' : '数量'}が0です。`, { lineId: l.id });
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
    if (l.basis && l.basis.measure === 'waste') {
      /* 別の道筋：解体の行ごとに部屋の数量を足し直して、厚みを掛ける */
      const kind = l.basis.kind || 'w-waste'; let v = 0;
      all.forEach(x => {
        if (x === l || !isDemoArea(x) || wasteKind(x.itemId) !== kind) return;
        let a = 0;
        if (isRoomBased(x)) { const sel = x.basis.rooms === 'all' || !Array.isArray(x.basis.rooms) ? rooms : rooms.filter(r => x.basis.rooms.includes(r.id)); const g0 = x.basis.measure === 'wall' ? wallGroup(x.cat) : null, g = g0 && (x.layer || 1) > 1 ? g0 + x.layer : g0; sel.forEach(r => { let w = roomGeom(r, o)[x.basis.measure] || 0; if (g && r.wallOff && r.wallOff[g] > 0) w = Math.max(0, w - r.wallOff[g]); a += w; }); a = round3(a); }
        else a = Math.max(0, num(x.qty));
        const m = String(x.name || '').match(/厚(\d+)/);
        v += a * (m ? +m[1] / 1000 : o.waste);
      });
      q = Math.round(v * 100 + 1e-9) / 100;
    } else if (l.basis && l.basis.measure === 'link') {
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

/* 土間のカッター・はつり（前のKAKU・概算くんと同じ計算）。w・l は m、t（コンクリートの厚み）・d（掘る深さ）は mm
 *   カッター＝周りの長さ 2×(幅+長さ)、はつり＝幅×長さ、ガラ＝面積×厚み、掘削＝面積×深さ、残土＝掘削×1.25（ほぐし率）、埋め戻し＝掘削と同じ */
export const ZANDO_F = 1.25;
export const HATSU_T = [60, 80, 100, 120, 150, 180, 200, 250, 300];
export const hatsuItem = t => 'w-dF-co' + (HATSU_T.find(x => x >= (+t || 0)) || 300);
export const cutItem = t => (+t || 0) <= 100 ? 'w-cut100' : (+t || 0) <= 150 ? 'w-cut150' : (+t || 0) <= 200 ? 'w-cut200' : 'w-cut250';
export function hatsuCalc(h) {
  const w = Math.max(0, num(h.w)), l = Math.max(0, num(h.l)), a = w * l, t = Math.max(0, num(h.t)) / 1000, d = Math.max(0, num(h.d)) / 1000;
  return { a: round3(a), cut: h.cut !== false && a > 0 ? round3(2 * (w + l)) : 0, gara: round3(a * t), dig: round3(a * d), zando: round3(a * d * ZANDO_F), back: h.back !== false ? round3(a * d) : 0 };
}
