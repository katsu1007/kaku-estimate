/* 案件全体の「元に戻す」のテスト。実行：node tests/undo.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as U from '../js/undo.js';

let n = 0;
const proj = () => ({ id: 'p' + (++n), name: 'A', rooms: [{ id: 'r1', name: '事務室', w: 4, d: 3 }], lines: [], history: [{ v: 1 }], updatedAt: 1,
  drawing: { plan: { segs: [[0, 0, 1, 1]], faces: [] }, lights: [] }, sketch: { rooms: [], img: { src: 'data:xxx', w: 1, h: 1 } } });

test('変えて保存 → 戻す → やり直す', () => {
  const p = proj(); U.track(p);
  assert.equal(U.canUndo(p.id), false);
  p.rooms.push({ id: 'r2', name: '倉庫' }); p.updatedAt = 2;
  assert.equal(U.commit(p), true);
  p.rooms[0].name = '会議室'; p.lines.push({ id: 'l1', name: 'クロス' }); p.updatedAt = 3;
  U.commit(p);
  assert.deepEqual(U.counts(p.id), { undo: 2, redo: 0 });
  assert.equal(U.undo(p), true);
  assert.equal(p.rooms[0].name, '事務室'); assert.equal(p.rooms.length, 2); assert.equal(p.lines.length, 0);
  assert.equal(U.undo(p), true);
  assert.equal(p.rooms.length, 1);
  assert.equal(U.undo(p), false);
  assert.equal(U.redo(p), true); assert.equal(p.rooms.length, 2);
  assert.equal(U.redo(p), true); assert.equal(p.rooms[0].name, '会議室'); assert.equal(p.lines[0].name, 'クロス');
  assert.equal(U.redo(p), false);
});

test('中身が同じなら控えない（保存の時刻だけ変わった時）', () => {
  const p = proj(); U.track(p);
  p.updatedAt = 99;
  assert.equal(U.commit(p), false);
  assert.equal(U.canUndo(p.id), false);
});

test('同じ案件の入れ物のまま中身を入れ替える。図面の線と写真は同じ物、出した記録は戻さない', () => {
  const p = proj(), ref = p, plan = p.drawing.plan, img = p.sketch.img; U.track(p);
  p.drawing.lights.push({ x: 1, y: 1 }); p.history.push({ v: 2 }); p.updatedAt = 5;
  U.commit(p);
  U.undo(p);
  assert.equal(p, ref);
  assert.equal(p.drawing.lights.length, 0);
  assert.equal(p.drawing.plan, plan); assert.equal(p.sketch.img, img);
  assert.equal(p.history.length, 2);
  assert.equal(p.updatedAt, 5);
});

test('図面を消した・入れ替えたのも戻せる', () => {
  const p = proj(), plan = p.drawing.plan; U.track(p);
  p.drawing = null; U.commit(p);
  p.drawing = { plan: { segs: [], faces: [] } }; U.commit(p);
  U.undo(p); assert.equal(p.drawing, null);
  U.undo(p); assert.equal(p.drawing.plan, plan);
});

test('戻した後で別の変更をしたら、やり直しは消える', () => {
  const p = proj(); U.track(p);
  p.name = 'B'; U.commit(p);
  U.undo(p); assert.equal(p.name, 'A'); assert.equal(U.canRedo(p.id), true);
  p.name = 'C';
  assert.equal(U.redo(p), false);
  U.commit(p);
  assert.equal(U.canRedo(p.id), false); assert.equal(p.name, 'C');
  U.undo(p); assert.equal(p.name, 'A');
});

test('まだ保存していない変更があっても、戻すとその前に戻る', () => {
  const p = proj(); U.track(p);
  p.name = 'B';                       // commit していない
  assert.equal(U.undo(p), true); assert.equal(p.name, 'A');
  assert.equal(U.redo(p), true); assert.equal(p.name, 'B');
});

test('回数の上限（古い物から捨てる）', () => {
  const p = proj(); U.track(p);
  for (let i = 0; i < U.MAX + 15; i++) { p.name = 'N' + i; U.commit(p); }
  assert.equal(U.counts(p.id).undo, U.MAX);
  let k = 0; while (U.undo(p)) k++;
  assert.equal(k, U.MAX); assert.equal(p.name, 'N14');
});

test('開いていない案件は何もしない。忘れると控えの大きさが減る', () => {
  assert.equal(U.undo({ id: 'none' }), false);
  const p = proj(); U.track(p); p.name = 'Z'; U.commit(p);
  const s = U.size(); assert.ok(s > 0);
  U.forget(p.id); assert.ok(U.size() < s);
});
