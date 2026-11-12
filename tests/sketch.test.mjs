/* 寸法で間取りを作る（手計算の値） */
import test from 'node:test';
import assert from 'node:assert/strict';
import { walk, makeRoom, rectRoom, area, peri, fixEdge, square, shapeProblems, toPlan, nextStart, solve } from '../js/sketch.js';
import { dxf, jww, sjis } from '../js/cad.js';

const near = (a, b, e = 1e-3) => assert.ok(Math.abs(a - b) < e, `${a} ≠ ${b}`);

test('長方形 3640×2730：9.9372㎡、周り12.74m', () => {
  const r = rectRoom('洋室', [0, 0], 3.64, 2.73);
  near(area(r.v), 9.9372, 1e-6); near(peri(r.v), 12.74, 1e-6);
  assert.deepEqual(nextStart([r]), [3.64, 0]);   // 次の部屋は右下から
});

test('向きと長さ：L字（→4 ↑2 ←2 ↑1 ←2 ↓3）＝ 4×2＋2×1 ＝ 10㎡', () => {
  const P = walk([0, 0], [{ d: 1, l: 4 }, { d: 0, l: 2 }, { d: 3, l: 2 }, { d: 0, l: 1 }, { d: 3, l: 2 }, { d: 2, l: 3 }]);
  assert.deepEqual(P[P.length - 1], [0, 0]);   // 閉じている
  P.pop();
  const r = makeRoom('L', P, P.map(() => 1));
  near(area(r.v), 10, 1e-9); near(peri(r.v), 14, 1e-9);
});

test('大まかに描いた部屋：最初の寸法で全体の大きさを合わせる', () => {
  const sk = { rooms: [], s: 0.01, sOk: false };
  const r = makeRoom('写真', [[0, 0], [0, 1], [2, 1], [2, 0]], null); r.rough = true; sk.rooms.push(r);
  const nx = fixEdge(sk, r, 0, 3);    // 縦の辺 1 → 3m：全体を3倍 → 3×6
  near(area(r.v), 18, 0.01);
  assert.equal(nx, 1);                // 次は2本目の辺
  let k = fixEdge(sk, r, nx, 5);      // 横 5m（まだの辺は弱く保つので、全部入れるまでは合わないことがある）
  k = fixEdge(sk, r, k, 3); k = fixEdge(sk, r, k, 5);   // 全部の辺を入れると 3×5
  assert.equal(k, -1); assert.equal(r.bad, '');
  near(area(r.v), 15, 0.01);
});

test('写真から取った部屋：最初の寸法で写真の縮尺も合わせる', () => {
  const sk = { rooms: [], s: 0.01, sOk: false };
  const r = makeRoom('写真', [[0, 0], [0, 1], [2, 1], [2, 0]], null); r.rough = true; r.photo = true; sk.rooms.push(r);
  fixEdge(sk, r, 0, 2);
  near(sk.s, 0.02, 1e-9); assert.equal(sk.sOk, true);
});

test('縦横にそろえる：少し傾いた四角 → 入れた寸法の長方形', () => {
  const r = makeRoom('A', [[0, 0], [0.05, 2], [3.02, 2.04], [2.98, -0.03]], [1, 1, 1, 1]);
  r.c.forEach(c => { c.l = [2, 3, 2, 3][c.a]; });
  assert.ok(square(r));
  near(area(r.v), 6, 0.01);
  near(r.v[1][0] - r.v[0][0], 0, 1e-6);   // 1本目は真っすぐ上
});

test('形の確かめ：重なりと線の交わり', () => {
  const a = rectRoom('A', [0, 0], 3, 3), b = rectRoom('B', [2, 2], 3, 3), c = rectRoom('C', [3, 0], 2, 2);
  assert.equal(shapeProblems([a, c]).length, 0);           // 辺で接しているだけは重なりではない
  assert.match(shapeProblems([a, b])[0], /重なっています/);
  const bow = makeRoom('X', [[0, 0], [3, 3], [3, 0], [0, 2]], null);
  assert.match(shapeProblems([bow])[0], /交わって/);
});

test('図面にする：部屋1つ＝区画1つ', () => {
  const P = toPlan([rectRoom('A', [0, 0], 3, 2), rectRoom('B', [3, 0], 2, 2)]);
  assert.equal(P.faces.length, 2); assert.equal(P.segs.length, 8);
  near(P.faces[0].area, 6, 1e-9); near(P.faces[1].peri, 8, 1e-9);
});

test('書き出し：DXF は Shift_JIS、JWW は JwwData. で始まる', () => {
  const G = { lines: [[0, 0, 3, 0, 0]], texts: [{ s: '洋室', x: 1, y: 1, h: 4.5, deg: 0, layer: 2 }] };
  const d = dxf(G), t = new TextDecoder('shift_jis').decode(d);
  assert.match(t, /AC1009/); assert.match(t, /洋室/); assert.match(t, /\r\nLINE\r\n/);
  assert.deepEqual(sjis('洋'), [0x97, 0x6D]);
  assert.equal(new TextDecoder().decode(jww(G, 50).slice(0, 8)), 'JwwData.');
});
