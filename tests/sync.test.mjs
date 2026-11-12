/* 保存先フォルダと揃える時の決め方 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { syncPlan, projectFile, companyPlan, companyPack, sig } from '../js/syncplan.js';

const P = (id, updatedAt) => ({ id, updatedAt });

test('片方にしか無い案件は無い方へ写す。端末で消した案件はフォルダから戻さない', () => {
  const r = syncPlan([P('a', 5)], [P('b', 7), P('c', 3)], { c: { at: 3 } });
  assert.deepEqual(r.push, ['a']);       // 端末だけ → フォルダへ
  assert.deepEqual(r.pull, ['b']);       // フォルダだけ（前に揃えた記録なし）→ 端末へ
  assert.deepEqual(r.skipDeleted, ['c']); // 前に揃えたのに端末に無い＝端末で消した → 戻さない
});

test('片方だけ変わった時は変わった方、両方変わった時は聞く', () => {
  const base = { a: { at: 10 }, b: { at: 10 }, c: { at: 10 }, d: { at: 10 } };
  const r = syncPlan([P('a', 10), P('b', 20), P('c', 20), P('d', 10)], [P('a', 15), P('b', 10), P('c', 30), P('d', 10)], base);
  assert.deepEqual(r.pull, ['a']);   // フォルダだけ変わった
  assert.deepEqual(r.push, ['b']);   // 端末だけ変わった
  assert.deepEqual(r.ask, ['c']);    // 両方変わった
  assert.deepEqual(r.same, ['d']);
  // 前に揃えた記録が無くて違う時も聞く（どっちが新しいかだけでは決めない）
  assert.deepEqual(syncPlan([P('x', 1)], [P('x', 2)], {}).ask, ['x']);
});

test('ファイルの名前に使えない字は _ にする', () => {
  assert.equal(projectFile({ id: 'p1', name: 'A/B 様邸:改修' }), 'A_B 様邸_改修_p1.kaku.json');
  assert.equal(projectFile({ id: 'p2', name: '' }), '案件_p2.kaku.json');
});

test('会社の設定：端末ごとの物は入れない・並び順が違っても同じ印・3通りの決め方', () => {
  const k = companyPack({ company: { name: 'A' }, settings: { theme: 'light', loss: 10, noticeSeen: true } });
  assert.deepEqual(k.settings, { loss: 10 });
  assert.equal(sig({ a: 1, b: [1, { c: 2 }] }), sig({ b: [1, { c: 2 }], a: 1 }));
  assert.notEqual(sig({ a: 1 }), sig({ a: 2 }));
  assert.equal(companyPlan('x', null, null), 'push');
  assert.equal(companyPlan('x', 'x', 'y'), 'same');
  assert.equal(companyPlan('b', 'r', 'b'), 'pull');
  assert.equal(companyPlan('l', 'b', 'b'), 'push');
  assert.equal(companyPlan('l', 'r', 'b'), 'ask');
});
