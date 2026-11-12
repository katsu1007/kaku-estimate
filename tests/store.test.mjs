/* 前のKAKUのデータの読み替えのテスト（実際の前のKAKUの保存形式：rooms の h は奥行、ch は天井高、plan の部屋は area・peri） */
import test from 'node:test';
import assert from 'node:assert/strict';
import { convertOld } from '../js/store.js';
import { roomGeom } from '../js/calc.js';

test('前のKAKUの案件を読み替える', () => {
  const [p] = convertOld([{ id: 1731000000000, name: '○○ビル', customer: '株式会社テスト', overhead: 5, profit: 3,
    rooms: [{ name: '事務室', w: 6, h: 4, qty: 1, ch: 2.7, door: 1, win: 2 }, { name: '倉庫', plan: true, area: 12.5, peri: 14.6, ch: 2.5, qty: 1 }],
    items: [{ desc: 'クロス張替', qty: 60, unit: '㎡', price: 1100 }] }]);
  assert.equal(p.id, 'old-1731000000000');
  assert.equal(p.overheadPct, 5);
  assert.equal(p.profitPct, 3);
  const [a, b] = p.rooms;
  assert.equal(roomGeom(a).floor, 24);               // 6×4
  assert.equal(roomGeom(a).wall, 20 * 2.7 - 1.6 * 3); // 周長20×2.7 − ドア1 − 窓2
  assert.equal(b.shape, 'free');
  assert.equal(roomGeom(b).floor, 12.5);
  assert.equal(p.lines[0].name, 'クロス張替');
  assert.equal(p.lines[0].qty * p.lines[0].price, 66000);
});

test('壊れたデータは空で返す', () => {
  assert.deepEqual(convertOld(null), []);
});
