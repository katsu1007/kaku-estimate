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
