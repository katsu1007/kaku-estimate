/* 入れ忘れのチェックのテスト。実行：node tests/workcheck.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { workChecks, openChecks } from '../js/workcheck.js';
import { totals } from '../js/calc.js';

const keys = p => openChecks(p).map(x => x.key);
const base = () => ({
  name: '事務所の改修', customer: '山田様', overheadPct: 10, profitPct: 0,
  rooms: [{ id: 'r1', name: '事務室', w: 4, d: 3, h: 2.5, qty: 1 }],
  lines: [
    { id: 'l1', name: 'クロス', cat: 'wall', kind: 'mat', price: 1000, basis: { measure: 'wall', rooms: 'all' } },
    { id: 'l2', name: 'クロス貼り手間', cat: 'work', kind: 'labor', price: 900, basis: { measure: 'wall', rooms: 'all' } },
    { id: 'l3', name: '養生', cat: 'work', kind: 'labor', price: 500, qty: 1 }
  ]
});

test('そろっている案件は何も出ない', () => { assert.deepEqual(keys(base()), []); });

test('宛名・案件名が無い', () => {
  const p = base(); p.customer = ' '; p.name = '';
  assert.deepEqual(keys(p), ['customer', 'pname']);
});

test('天井高が空で壁の行がある → 注意。壁の行が無ければ目安', () => {
  const p = base(); p.rooms[0].h = '';
  const c = openChecks(p).find(x => x.key === 'ceilH');
  assert.equal(c.level, 'warn'); assert.equal(c.roomId, 'r1'); assert.match(c.msg, /2\.4m/);
  p.lines = p.lines.filter(l => l.id === 'l3');
  assert.equal(openChecks(p).find(x => x.key === 'ceilH').level, 'tip');
});

test('標準の天井高を設定で変えていたら、その高さを出す', () => {
  const p = base(); p.rooms[0].h = '';
  assert.match(workChecks(p, { ceilH: 2.7 }).find(x => x.key === 'ceilH').msg, /2\.7m/);
});

test('どの行にも入っていない部屋（全部の部屋の行があれば出ない）', () => {
  const p = base(); p.rooms.push({ id: 'r2', name: '倉庫', w: 2, d: 2, h: 2.4 });
  assert.ok(!keys(p).includes('roomUnused'));
  p.lines[0].basis.rooms = ['r1']; p.lines[1].basis.rooms = ['r1'];
  const c = openChecks(p).find(x => x.key === 'roomUnused');
  assert.equal(c.roomId, 'r2'); assert.match(c.msg, /倉庫/);
});

test('図面の器具：行が無い・数が合わない・判定保留', () => {
  const p = base();
  p.drawing = { fixtures: [{ t: 'toilet' }, { t: 'toilet' }, { t: 'urinal' }, { t: 'unknown' }, { t: 'other' }] };
  assert.deepEqual(keys(p).filter(k => /^fx/.test(k)), ['fxUnknown', 'fx:toilet', 'fx:urinal']);
  p.lines.push({ id: 'f1', name: '洋風便器', kind: 'mat', price: 50000, qty: 1, fromFix: 'toilet' }, { id: 'f2', name: '便器 取付', kind: 'labor', price: 9000, qty: 1, fromFix: 'toilet' });
  const k = keys(p).filter(x => /^fx/.test(x));
  assert.deepEqual(k, ['fxUnknown', 'fxN:toilet', 'fx:urinal', 'fxPipe']);
  p.lines.find(l => l.id === 'f1').qty = 2;
  assert.ok(!keys(p).includes('fxN:toilet'));
});

test('小便器の行だけでは、便器の行があるとは見ない', () => {
  const p = base();
  p.drawing = { fixtures: [{ t: 'toilet' }, { t: 'urinal' }] };
  p.lines.push({ id: 'u1', name: '小便器', kind: 'mat', price: 40000, qty: 1 });
  const k = keys(p);
  assert.ok(k.includes('fx:toilet')); assert.ok(!k.includes('fx:urinal'));
});

test('解体があるのに処分が無い／養生が無い／手間が無い', () => {
  const p = base();
  p.lines.push({ id: 'd1', name: '壁解体', cat: 'demoW', kind: 'labor', price: 1500, basis: { measure: 'wall', rooms: 'all' } });
  assert.ok(keys(p).includes('waste'));
  p.lines.push({ id: 'd2', name: '廃材処分', cat: 'work', kind: 'labor', price: 47000, qty: 1 });
  assert.ok(!keys(p).includes('waste'));
  const q = base(); q.lines = [q.lines[0]];
  assert.deepEqual(keys(q), ['yojo', 'noLabor', 'lab:wall']);
});

test('照明があるのに分電盤が無い（図面に分電盤を置けば出ない）', () => {
  const p = base();
  p.drawing = { lights: [{ room: 'r1', item: 'e-dl100' }], outlets: [] };
  assert.deepEqual(keys(p), ['panel', 'lightUse']);
  p.drawing.panel = [1, 1]; p.rooms[0].lightUse = 'office';
  assert.deepEqual(keys(p), []);
});

test('名前のある区画が部屋になっていない', () => {
  const p = base();
  p.rooms[0] = { id: 'r1', name: '事務室', shape: 'free', area: 12, perim: 14, h: 2.5, src: 'plan', faces: [0] };
  p.drawing = { plan: { faces: [{ i: 0, name: '事務室' }, { i: 1, name: '倉庫' }, { i: 2, name: '' }] } };
  const c = openChecks(p).find(x => x.key === 'faceRest');
  assert.match(c.msg, /1 個/); assert.match(c.msg, /倉庫/);
});

test('「この案件では要らない」にした物は出ない。金額は変わらない', () => {
  const p = base(); p.overheadPct = 0;
  assert.deepEqual(keys(p), ['overhead']);
  const before = totals(p).grand;
  p.checksOff = { overhead: true };
  assert.deepEqual(keys(p), []);
  assert.equal(workChecks(p).find(x => x.key === 'overhead').off, true);
  assert.equal(totals(p).grand, before);
});

test('品番・色：1行でも入れていたら、入っていない仕上げ材を知らせる', () => {
  const p = base();
  p.lines.push({ id: 'l9', name: '長尺シート', cat: 'floor', kind: 'mat', price: 3000, basis: { measure: 'floor', rooms: 'all' } }, { id: 'l10', name: '長尺シート貼り手間', cat: 'work', kind: 'labor', price: 1800, basis: { measure: 'floor', rooms: 'all' } });
  assert.ok(!keys(p).includes('noCode'));
  p.lines[0].code = 'SP-2801';
  const c = openChecks(p).find(x => x.key === 'noCode');
  assert.equal(c.lineId, 'l9'); assert.match(c.msg, /1 行/);
  p.lines.find(l => l.id === 'l9').code = 'FS3001';
  assert.ok(!keys(p).includes('noCode'));
});

test('空の案件でも落ちない', () => {
  assert.deepEqual(workChecks({}).map(x => x.key), ['customer', 'pname']);
});
