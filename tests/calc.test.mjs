/* 計算のテスト。実行：node --test tests/
 * 期待値は関数の出力を写したものではなく、手計算した数字。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { roomGeom, lineQty, totals, check, compare, ceilTo } from '../js/calc.js';

const room = { id: 'r1', name: '事務室', w: 4, d: 3, h: 2.4, qty: 1, doors: 1, winCount: 1 };

test('部屋：床・周長・壁・巾木（手計算）', () => {
  const g = roomGeom(room);
  assert.equal(g.floor, 12);            // 4×3
  assert.equal(g.perim, 14);            // 2×(4+3)
  assert.equal(g.wall, 30.4);           // 14×2.4 − ドア1.6 − 窓1.6
  assert.equal(g.base, 13.2);           // 14 − 0.8
});

test('部屋：天井高が空なら標準2.4m、同じ部屋が2つなら倍', () => {
  const g = roomGeom({ w: 2, d: 2, qty: 2 });
  assert.equal(g.wall, 38.4);           // 8×2.4×2
  assert.equal(g.floor, 8);
});

test('部屋：窓を寸法で入れる（1690×1800を2枚）', () => {
  const g = roomGeom({ w: 4, d: 3, h: 2.5, windows: [{ w: 1690, h: 1800, n: 2 }] });
  // 35 − 1.69×1.8×2 = 35 − 6.084 = 28.916
  assert.equal(g.wall, 28.916);
});

test('部屋：自由な形（L字）は面積と周長を直接', () => {
  const g = roomGeom({ shape: 'free', area: 20.5, perim: 19, h: 2.5 });
  assert.equal(g.floor, 20.5);
  assert.equal(g.wall, 47.5);
});

test('数量：材料はロス10%で0.1切り上げ、手間は正味', () => {
  const mat = { kind: 'mat', basis: { measure: 'wall', rooms: 'all' }, price: 1000 };
  const lab = { kind: 'labor', basis: { measure: 'wall', rooms: 'all' }, price: 1000 };
  assert.equal(lineQty(mat, [room]), 33.5);   // 30.4×1.1=33.44 → 33.5
  assert.equal(lineQty(lab, [room]), 30.4);
});

test('数量：板物は枚数に切り上げ（1.656㎡/枚）', () => {
  const b = { kind: 'mat', sheet: 1.656, basis: { measure: 'wall', rooms: 'all' }, price: 500 };
  // 33.44 ÷ 1.656 = 20.19… → 21枚 → 34.776㎡
  assert.equal(lineQty(b, [room]), 34.776);
});

test('数量：浮動小数のずれで余分に切り上げない', () => {
  assert.equal(ceilTo(3 * 1.1, 0.1), 3.3);
});

test('数量：部屋を選ぶと、その部屋だけ数える', () => {
  const r2 = { id: 'r2', w: 2, d: 2, h: 2.4 };
  const l = { kind: 'labor', basis: { measure: 'floor', rooms: ['r2'] }, price: 1 };
  assert.equal(lineQty(l, [room, r2]), 4);
});

test('合計：諸経費・利益・値引き・消費税（切り捨て）', () => {
  const p = {
    rooms: [], overheadPct: 10, profitPct: 5, discount: 1000,
    lines: [{ id: 'a', kind: 'other', qty: 3, price: 3333 }, { id: 'b', kind: 'other', qty: 1, price: 1 }]
  };
  const t = totals(p);
  assert.equal(t.subtotal, 10000);      // 9999 + 1
  assert.equal(t.overhead, 1000);
  assert.equal(t.profit, 500);
  assert.equal(t.net, 10500);           // 10000+1000+500−1000
  assert.equal(t.tax, 1050);
  assert.equal(t.grand, 11550);
});

test('原価：材料は定価×掛け率、手間は×原価率、外注は入れた原価', () => {
  const p = {
    rooms: [],
    lines: [
      { id: 'm', kind: 'mat', qty: 10, price: 1000 },
      { id: 'l', kind: 'labor', qty: 10, price: 1000 },
      { id: 's', kind: 'sub', qty: 1, price: 50000, cost: 40000 }
    ]
  };
  const t = totals(p, { matRate: 60, laborRate: 70 });
  assert.equal(t.cost, 6000 + 7000 + 40000);
  assert.equal(t.gross, 70000 - 53000);
});

test('検算：単価なし・数量0・消した部屋を使っている行を見つける', () => {
  const p = {
    rooms: [room],
    lines: [
      { id: 'x', name: '単価なし', kind: 'other', qty: 1, price: 0 },
      { id: 'y', name: '数量なし', kind: 'other', qty: 0, price: 100 },
      { id: 'z', name: '消した部屋', kind: 'labor', price: 100, basis: { measure: 'floor', rooms: ['gone'] } }
    ]
  };
  const c = check(p);
  assert.ok(c.some(m => m.lineId === 'x' && m.level === 'error'));
  assert.ok(c.some(m => m.lineId === 'y' && m.level === 'error'));
  assert.ok(c.some(m => m.lineId === 'z' && /消した部屋/.test(m.msg)));
});

test('検算：問題のない案件はエラー0件、小計の検算も一致', () => {
  const p = {
    rooms: [room],
    lines: [
      { id: 'a', name: 'クロス', unit: '㎡', kind: 'mat', price: 1200, basis: { measure: 'wall', rooms: 'all' } },
      { id: 'b', name: '床CF', unit: '㎡', kind: 'mat', price: 3000, basis: { measure: 'floor', rooms: ['r1'] } },
      { id: 'c', name: '養生', unit: '式', kind: 'other', qty: 1, price: 12000 }
    ]
  };
  assert.deepEqual(check(p).filter(m => m.level === 'error'), []);
});

test('比較：増えた・減った・変わった行と差額', () => {
  const a = { rooms: [], lines: [{ id: '1', name: 'A', qty: 1, price: 100 }, { id: '2', name: 'B', qty: 1, price: 50 }] };
  const b = { rooms: [], lines: [{ id: '1', name: 'A', qty: 2, price: 100 }, { id: '3', name: 'C', qty: 1, price: 30 }] };
  const r = compare(a, b);
  assert.equal(r.diff, Math.floor(230 * 1.1) - Math.floor(150 * 1.1)); // 253 − 165
  assert.deepEqual(r.rows.map(x => x.kind).sort(), ['added', 'changed', 'removed']);
});

test('品目の検索：名前と太さを空白で区切って探せる', async () => {
  const { matchItem } = await import('../js/ui.js');
  const it = { name: 'HIVP管（耐衝撃性塩ビ管）', spec: '呼び径 20' };
  assert.ok(matchItem(it, 'HIVP 20'));
  assert.ok(matchItem(it, 'ｈｉｖｐ　２０'));   // 全角
  assert.ok(!matchItem(it, 'HIVP 25'));
  assert.ok(!matchItem({ name: 'VP管', spec: '呼び径 150' }, 'VP 50'));  // 50 で 150 を出さない
  assert.ok(matchItem({ name: '石膏ボード', spec: '12.5mm 910×1820' }, '石膏 12.5'));
  assert.ok(!matchItem({ name: '石膏ボード', spec: '12.5mm 910×1820' }, '石膏 2.5'));
});

test('給排水の品目：管は呼び径ごとにあり、単価は水道概算と同じ', async () => {
  const { BUILTIN_ITEMS } = await import('../js/master-data.js');
  const hivp = BUILTIN_ITEMS.filter(i => i.name.startsWith('HIVP管'));
  assert.deepEqual(hivp.map(i => i.spec), ['呼び径 13', '呼び径 16', '呼び径 20', '呼び径 25', '呼び径 30', '呼び径 40', '呼び径 50']);
  assert.equal(hivp.find(i => i.spec === '呼び径 13').price, 325);   // 水道概算 p-hivp13
  assert.equal(new Set(BUILTIN_ITEMS.map(i => i.id)).size, BUILTIN_ITEMS.length); // id の重なりなし
});

test('配管のセット：継手・支持金具・保温・手間（水道概算と同じ決まり、手計算）', async () => {
  const { buildChildren } = await import('../js/piping.js');
  const { BUILTIN_ITEMS } = await import('../js/master-data.js');
  const pipe = { id: 'p1', itemId: 's-p-hivp20', name: 'HIVP管', unit: 'm', kind: 'mat', qty: 12, price: 540, applyLoss: true, loss: 5, basis: null,
    pipe: { k: 'hivp', fam: 'ts', use: 'w', d: 20 }, pipeSet: { sys: 'w', many: 1, hoon: true } };
  const kids = buildChildren(pipe, BUILTIN_ITEMS);
  const lines = [pipe, ...kids];
  const q = id => lineQty(lines.find(l => l.itemId === id), [], undefined, lines);
  assert.equal(lineQty(pipe, [], undefined, lines), 12.6); // 12m ＋ ロス5%
  assert.equal(q('s-j-hivp20-el'), 5);    // 12×0.4=4.8 → 5
  assert.equal(q('s-j-hivp20-te'), 2);    // 12×0.15=1.8 → 2
  assert.equal(q('s-j-hivp20-so'), 3);    // 12×0.25=3
  assert.equal(q('s-s-w'), 10);           // 12×0.8=9.6 → 10
  assert.equal(q('s-h-20'), 12);          // 保温 20
  assert.equal(q('s-l-pw'), 12);          // 給水配管の手間
  // 長さを変えると子の行もついてくる
  pipe.qty = 20;
  assert.equal(q('s-j-hivp20-el'), 8);    // 20×0.4
  // 検算の別の道筋とも合う
  assert.deepEqual(check({ rooms: [], lines }).filter(c => /計算が合いません/.test(c.msg)), []);
});

test('配管のセット：排水・継手多めは数が増え、保温は付かない', async () => {
  const { buildChildren } = await import('../js/piping.js');
  const { BUILTIN_ITEMS } = await import('../js/master-data.js');
  const pipe = { id: 'p2', qty: 10, kind: 'mat', basis: null, pipe: { k: 'vp', fam: 'dv', use: 'dvr', d: 50 }, pipeSet: { sys: 'd', many: 1.5, hoon: true } };
  const kids = buildChildren(pipe, BUILTIN_ITEMS);
  const lines = [pipe, ...kids];
  const q = id => { const l = lines.find(x => x.itemId === id); return l ? lineQty(l, [], undefined, lines) : null; };
  assert.equal(q('s-j-vp50-el'), 3);      // 10×0.2×1.5=3
  assert.equal(q('s-j-vp50-y'), 2);       // 10×0.12×1.5=1.8 → 2
  assert.equal(q('s-s-d'), 6);            // 10×0.6
  assert.equal(q('s-h-50'), null);        // 排水は保温なし
  assert.equal(q('s-l-pd'), 10);
});

test('配管のセット：元の配管の行を消すと検算でエラー', () => {
  const kid = { id: 'k', name: 'エルボ', qty: '', price: 100, kind: 'mat', basis: { measure: 'link', line: 'gone', rate: 0.4, ceil: true } };
  assert.ok(check({ rooms: [], lines: [kid] }).some(c => /元の配管/.test(c.msg)));
});

test('図面で見つけたドア・開口を壁から引く（前のKAKUと同じ決め方、手計算）', () => {
  // 4×3、天井2.4、ドア幅0.8（高さ2.0）と扉の無い開口1.2（×天井高2.4）。手で入れたドア1か所は使わない
  const r = { w: 4, d: 3, h: 2.4, doors: 1, openRuns: [{ ty: 'd', len: 0.8 }, { ty: 'g', len: 1.2 }] };
  const g = roomGeom(r);
  assert.equal(g.wall, 33.6 - 1.6 - 2.88);  // 14×2.4 − 0.8×2.0 − 1.2×2.4 = 29.12
  assert.equal(g.base, 14 - 2);             // 開口の幅 0.8+1.2 ぶん短く
  // 天井が低い（1.9m）時は、ドアの高さは天井高−5cm
  assert.equal(roomGeom({ w: 2, d: 2, h: 1.9, openRuns: [{ ty: 'd', len: 1 }] }).wall, Math.round((8 * 1.9 - 1.85) * 1000) / 1000);
  // 「引かない」にした部屋は、手で入れたドアの数に戻る
  assert.equal(roomGeom({ ...r, openOff: true }).wall, 33.6 - 1.6);
});

test('土間のカッター・はつり（概算くんと同じ計算、手計算）', async () => {
  const { hatsuCalc, hatsuItem, cutItem } = await import('../js/calc.js');
  const c = hatsuCalc({ w: 0.6, l: 3, t: 120, d: 300 });
  assert.equal(c.a, 1.8);          // 0.6×3
  assert.equal(c.cut, 7.2);        // 2×(0.6+3)
  assert.equal(c.gara, 0.216);     // 1.8×0.12
  assert.equal(c.dig, 0.54);       // 1.8×0.3
  assert.equal(c.zando, 0.675);    // 0.54×1.25
  assert.equal(c.back, 0.54);
  assert.equal(hatsuItem(120), 'w-dF-co120');
  assert.equal(hatsuItem(110), 'w-dF-co120');  // 厚みは上の段に切り上げ
  assert.equal(cutItem(120), 'w-cut150');
  assert.equal(hatsuCalc({ w: 1, l: 1, t: 100, d: 0, cut: false, back: false }).cut, 0);
});

test('壁ごとに入れた分は、その部屋の同じ種類の壁の行から引く', async () => {
  const { netQty, roomGeom, wallGroup } = await import('../js/calc.js');
  // 4×3、天井2.4：壁 14×2.4 = 33.6㎡。壁ごとに仕上げ 11.7㎡ を入れた
  const r = { id: 'a', shape: 'rect', w: 4, d: 3, h: 2.4, qty: 1, doors: 0, winCount: 0, windows: [], wallOff: { fin: 11.7 } };
  assert.ok(Math.abs(roomGeom(r).wall - 33.6) < 1e-9);
  const L = cat => ({ cat, basis: { measure: 'wall', rooms: 'all' } });
  assert.equal(netQty(L('wall'), [r]), 21.9);     // クロス：33.6−11.7
  assert.equal(netQty(L('board'), [r]), 33.6);    // 下地は入れていないので引かない
  assert.equal(netQty(L('demoW'), [r]), 33.6);
  assert.equal(netQty({ cat: 'wall', basis: { measure: 'floor', rooms: 'all' } }, [r]), 12);   // 床は関係ない
  assert.equal(wallGroup('paint'), 'fin'); assert.equal(wallGroup('floor'), null);
  r.wallOff.fin = 50; assert.equal(netQty(L('wall'), [r]), 0);   // 部屋の壁より多い時は0
});
