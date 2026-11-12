/* 照明の自動配置のテスト（手計算の値） */
import test from 'node:test';
import assert from 'node:assert/strict';
import { needCount, util, pitchFor } from '../js/lighting.js';
/* 並べ方そのものは前のKAKUのコードを使う（js/legacy.js oldFaceLights）。実図面で前のKAKUと点の位置まで同じことを画面のテストで確かめる */

const rect = (w, d) => [[0, 0], [w, 0], [w, d], [0, d]];

test('天井が高いほど間隔を詰める（プランC）', () => {
  assert.equal(pitchFor(2.4), 2);
  assert.ok(Math.abs(pitchFor(2.7) - 1.8) < 1e-9);
  assert.ok(Math.abs(pitchFor(3.0) - 1.62) < 1e-9);
  // 前のKAKUと同じ：端数は切り上げ（2.5m → 1段詰める）、詰めるのは7割まで（5m → 2×0.7）
  assert.ok(Math.abs(pitchFor(2.5) - 1.8) < 1e-9);
  assert.ok(Math.abs(pitchFor(5.0) - 1.4) < 1e-9);
});

test('光束法：事務室 6×5、天井2.7、800lmのダウンライト', () => {
  // A=30、周長22、Hm=2.7−0.75=1.95、K=2×30÷(1.95×22)=1.3986 → 照明率 0.60+(0.64−0.60)×(0.1486/0.25)=0.6238
  // N = 750×30÷(800×0.6238×0.8) = 56.36 → 57台
  assert.equal(needCount(rect(6, 5), 2.7, 'office', 800), 57);
  assert.ok(Math.abs(util(1.3986) - 0.6238) < 0.001);
});

test('配線（前のKAKUと同じ計算）：4×3の部屋、入口が分からない時', async () => {
  const { wirePlan, autoSwitch, cableQty } = await import('../js/lighting.js');
  const poly = [[0, 0], [4, 0], [4, 3], [0, 3]];
  const plan = { faces: [{ i: 0, poly, area: 12 }], segs: [[0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 0, 3], [0, 3, 0, 0]] };
  // 壁が全部つながっている → いちばん長い壁（下）の端から0.3m、内側に0.07m
  assert.deepEqual(autoSwitch(plan.faces[0], plan.faces, plan.segs, []), [0.3, 0.07]);
  // 照明 (1,1.5),(3,1.5)：0.7+1.43=2.13、+2=4.13、+立ち下がり1.2、+0.2×2 → 5.73
  // 分電盤 (-1,0.07)→スイッチ：1.3＋(2.4−1.5)=2.2
  const W = wirePlan({ plan, lights: [{ key: 'a', l: [3, 1.5] }, { key: 'b', l: [1, 1.5] }], panels: [[-1, 0.07]] });
  assert.ok(Math.abs(W.lenL - 5.73) < 1e-9, W.lenL);
  assert.ok(Math.abs(W.lenH - 2.2) < 1e-9, W.lenH);
  assert.equal(W.sws.length, 1); assert.equal(W.autoSw, 1);
  assert.equal(cableQty(5.73), 7);   // 6.303 → 7
  assert.equal(cableQty(10), 11);    // 11.000000000000002 にならないように
});

test('配線：ドアがある時は取っ手側の横（軸から r+0.15m）', async () => {
  const { autoSwitch } = await import('../js/lighting.js');
  const poly = [[0, 0], [4, 0], [4, 3], [0, 3]], f = { i: 0, poly, area: 12 };
  const segs = [[0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 0, 3], [0, 3, 0, 0]];
  // ドアの軸 (2,0)、扉の先 (2.8,0)、幅0.8 → 2+0.8+0.15=2.95、内側へ0.07
  assert.deepEqual(autoSwitch(f, [f], segs, [{ c: [2, 0], m: [2.8, 0], r: 0.8 }]), [2.95, 0.07]);
});

test('トイレのブース：ブースにスイッチは付けず、ドアの外の部屋のスイッチにつなぐ', async () => {
  const { wirePlan, boothHosts } = await import('../js/lighting.js');
  const big = { i: 0, poly: [[0, 0], [4, 0], [4, 3], [0, 3]], area: 12 };
  const bo = { i: 1, poly: [[4, 0], [5, 0], [5, 1.2], [4, 1.2]], area: 1.2 };
  const plan = { faces: [big, bo], segs: [[0, 0, 5, 0], [5, 0, 5, 1.2], [5, 1.2, 4, 1.2], [4, 3, 0, 3], [0, 3, 0, 0], [4, 1.2, 4, 3], [4, 0, 4, 0.2]] };
  const fixtures = [{ t: 'toilet', b: [4.2, 0.2, 4.8, 0.8] }];
  const doors = [{ c: [4, 1.0], m: [4, 0.6], r: 0.4 }];
  assert.equal(boothHosts(plan.faces, fixtures, doors)[1].i, 0);
  const W = wirePlan({ plan, fixtures, doors, lights: [{ key: 'a', l: [2, 1.5] }, { key: 'b', l: [4.5, 0.6] }] });
  assert.equal(W.sws.length, 1); assert.equal(W.booths, 1);
  assert.equal(W.assign.a, W.assign.b);
  // 便器が無い小さい区画（物入れなど）はブースにしない
  assert.equal(Object.keys(boothHosts(plan.faces, [], doors)).length, 0);
  // つなぎ替え：置いたスイッチに直接つなぐ
  const W2 = wirePlan({ plan, fixtures, doors, lights: [{ key: 'a', l: [2, 1.5] }], switches: [{ key: 's1', l: [0.3, 2.9] }], link: { a: 's1' } });
  assert.equal(W2.assign.a, 's1'); assert.equal(W2.autoSw, 0);
});

test('コンセントの線：近い順に縦横の長さ＋1個ごとに（天井高−0.25）', async () => {
  const { wirePlan } = await import('../js/lighting.js');
  const plan = { faces: [{ i: 0, poly: [[0, 0], [4, 0], [4, 3], [0, 3]], area: 12 }], segs: [[0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 0, 3], [0, 3, 0, 0]] };
  // 照明なし：1個目から 2m ＋ 2個×2.15 = 6.3。分電盤 (−1,0.07)→1個目：1＋0.9＝… man=2 → 2＋(2.4−1.5)=2.9
  const W = wirePlan({ plan, outlets: [{ key: 'o1', l: [1, 0.07] }, { key: 'o2', l: [3, 0.07] }], panels: [[-1, 0.07]] });
  assert.ok(Math.abs(W.lenO - 6.3) < 1e-9, W.lenO); assert.equal(W.nO, 2);
  assert.ok(Math.abs(W.lenH - 2.9) < 1e-9, W.lenH);
});

test('つなぎ替え：後ろの区画の自動スイッチにもつなげる', async () => {
  const { wirePlan } = await import('../js/lighting.js');
  const A = { i: 0, poly: [[0, 0], [4, 0], [4, 3], [0, 3]], area: 12 }, B = { i: 1, poly: [[4, 0], [8, 0], [8, 3], [4, 3]], area: 12 };
  const plan = { faces: [A, B], segs: [[0, 0, 8, 0], [8, 0, 8, 3], [8, 3, 0, 3], [0, 3, 0, 0], [4, 0, 4, 3]] };
  const W = wirePlan({ plan, lights: [{ key: 'a', l: [2, 1.5] }, { key: 'b', l: [6, 1.5] }], link: { a: 'a:1' } });
  assert.equal(W.assign.a, 'a:1'); assert.equal(W.sws.length, 1);   // Aの照明もBのスイッチ → スイッチは1個
});
