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

test('前のKAKUで入れていなかったドア・窓：手で作った部屋は1か所ずつ、図面の部屋は0（前のKAKUと同じ）', () => {
  const [p] = convertOld([{ id: 1, rooms: [{ name: 'A', w: 4, h: 3, ch: 2.4 }, { name: 'B', w: 4, h: 3, ch: 2.4, door: 0, win: 0 }, { name: 'C', plan: true, area: 12, peri: 14, ch: 2.4 }] }]);
  assert.equal(roomGeom(p.rooms[0]).wall, 30.4);   // 14×2.4 − 1.6 − 1.6
  assert.equal(roomGeom(p.rooms[0]).base, 13.2);   // 14 − 0.8
  assert.equal(roomGeom(p.rooms[1]).wall, 33.6);   // 0 と入れてあれば引かない
  assert.equal(roomGeom(p.rooms[2]).wall, 33.6);   // 図面の部屋は 0
});

test('寸法を入れた窓・3Dで足した窓・図面のドアと開口・L字を落とさない', () => {
  const [p] = convertOld([{ id: 2, rooms: [
    { name: '窓', w: 4, h: 3, ch: 2.5, door: 0, win: 2, wins: [{ w: 1690, h: 1800, n: 2 }], win3A: 1.5 },
    { name: '図面', plan: true, area: 13, peri: 14.4, ch: 2.4, door: 0, win: 0, openA: 4.42, openL: [['d', 0.85, 1.7], ['g', 1.2, 2.88]] },
    { name: 'L字', w: 4, h: 3, ch: 2.4, door: 0, win: 0, parts: [{ s: -1, w: 1, h: 1 }] }] }]);
  // 35 − 1.69×1.8×2 − 1.5 = 35 − 6.084 − 1.5 = 27.416（窓2か所の 3.2㎡ は使わない）
  assert.equal(roomGeom(p.rooms[0]).wall, 27.416);
  // 14.4×2.4 − (0.85×2.0 + 1.2×2.4) = 34.56 − 4.58 = 29.98、巾木 14.4 − 2.05
  assert.equal(roomGeom(p.rooms[1]).wall, 29.98);
  assert.equal(roomGeom(p.rooms[1]).base, 12.35);
  assert.equal(roomGeom(p.rooms[2]).floor, 11);    // 12 − 1×1
  assert.equal(roomGeom(p.rooms[2]).perim, 14);    // 角を欠いても周りは同じ
});

test('前のKAKUで「開口を引かない」にしていた案件は、移しても引かない', () => {
  const [p] = convertOld([{ id: 3, openAuto: false, rooms: [{ name: '図面', plan: true, area: 13, peri: 14.4, ch: 2.4, openA: 1.7, openL: [['d', 0.85, 1.7]] }] }]);
  assert.equal(roomGeom(p.rooms[0]).wall, 34.56);
});
