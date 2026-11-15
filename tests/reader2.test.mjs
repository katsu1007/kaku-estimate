/* 新しい読み取り（段階1：図枠・表）と採点のテスト。実行：node tests/reader2.test.mjs
 * 手で作った小さい図形で、「見つける」「見つけない」「決めきれない時は保留」を確かめる。実図面の確かめは tests/reader2/run.py */
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../js/reader2/frame.js';
import { score } from '../js/reader2/score.js';

const rect = (x0, y0, x1, y1) => [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
const face = (i, x0, y0, x1, y1, area) => ({ i, no: i + 1, poly: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], area: area ?? (x1 - x0) * (y1 - y0) });
/* A3（420×297）を 1/100 で描いた図枠＝42m×29.7m。右下に表題欄の文字 */
const title = [{ t: '工事名称', x: 36, y: 1 }, { t: '図面名称', x: 36, y: 2 }, { t: 'SCALE', x: 40, y: 1 }, { t: 'DATE', x: 40, y: 2 }];
const sheet = () => ({ segs: rect(0, 0, 42, 29.7), texts: [...title], fixtures: [], doors: [],
  faces: [face(0, 0, 0, 42, 29.7, 1247), face(1, 5, 10, 9, 13), face(2, 9, 10, 13, 13), face(3, 13, 10, 17, 13)] });

test('図枠：表題欄の文字と用紙の比がそろえば、枠の内側そのものの区画を除外にする。中の部屋には印を付けない', () => {
  const A = analyze(sheet());
  assert.equal(A.stats.frames, 1);
  assert.equal(A.marks[0].s, 'out'); assert.equal(A.marks[0].type, 'frame');
  assert.match(A.marks[0].why, /表題欄の文字/);
  assert.deepEqual(Object.keys(A.marks), ['0']);
});

test('図枠の内側に、囲まれていない部屋の名前が直にあれば、除外にせず保留にする', () => {
  const d = sheet(); d.texts.push({ t: '事務室', x: 25, y: 20 });          // どの小さい区画にも入っていない所の部屋名
  const A = analyze(d);
  assert.equal(A.marks[0].s, 'hold'); assert.match(A.marks[0].why, /事務室/);
});

test('根拠が足りない大きい長方形（表題欄の文字も、並んだ枠も無い）は図枠と見ない', () => {
  const d = sheet(); d.texts = [];
  const A = analyze(d);
  assert.equal(A.stats.frames, 0); assert.deepEqual(A.marks, {});
});

test('大きい四角い部屋（体育館など）は、表題欄の文字が無いので図枠と見ない', () => {
  const A = analyze({ segs: rect(0, 0, 42, 29.7), texts: [{ t: '体育館', x: 20, y: 15 }], faces: [face(0, 0, 0, 42, 29.7)], fixtures: [], doors: [] });
  assert.deepEqual(A.marks, {});
});

test('表：罫線が6本以上そろい、図枠の辺に付いた表は強い根拠。中の文字が「洗面器」でも表の項目と見て除外。建物の部屋には触らない', () => {
  const d = sheet();
  for (let k = 0; k <= 9; k++) d.segs.push([34, 10 + k * 2, 42, 10 + k * 2]);          // 横の罫線10本（幅8m。右の辺が図枠に付く。上の端は y=28）
  d.segs.push([34, 10, 34, 28], [42, 10, 42, 28]);
  d.faces.push(face(10, 34, 10, 42, 12), face(11, 34, 12, 42, 14), face(12, 34, 14, 42, 16), face(13, 34, 28.2, 42, 29.5));
  d.texts.push({ t: '洗面器', x: 38, y: 13 });
  const A = analyze(d);
  assert.equal(A.stats.tables, 1);
  assert.equal(A.marks[10].s, 'out'); assert.equal(A.marks[12].s, 'out');
  assert.equal(A.marks[11].s, 'out'); assert.match(A.marks[11].why, /洗面器.*表の項目/);
  assert.equal(A.marks[13].s, 'out');                                                // 表の上の見出しの段（図枠の辺まで広げる）
  assert.equal(A.marks[1], undefined);
});

test('表：図枠の辺に付いていない表（根拠が1つ少ない）は、部屋らしい言葉が直にある区画を保留にとどめる', () => {
  const d = sheet();
  for (let k = 0; k <= 8; k++) d.segs.push([24, 10 + k * 2, 32, 10 + k * 2]);
  d.segs.push([24, 10, 24, 26], [32, 10, 32, 26]);
  d.faces.push(face(10, 24, 10, 32, 12), face(11, 24, 12, 32, 14));
  d.texts.push({ t: '洗面器', x: 28, y: 13 });
  const A = analyze(d);
  assert.equal(A.marks[10].s, 'out');
  assert.equal(A.marks[11].s, 'hold'); assert.match(A.marks[11].why, /洗面器/);
});

test('同じ幅で並んでいても、器具やドアがある並び（トイレのブースなど）は表と見ない', () => {
  const d = sheet();
  for (let k = 0; k <= 8; k++) d.segs.push([34, 10 + k * 2, 42, 10 + k * 2]);
  d.segs.push([34, 10, 34, 26], [42, 10, 42, 26]);
  d.faces.push(face(10, 34, 10, 42, 12), face(11, 34, 12, 42, 14));
  d.fixtures.push({ b: [37, 10.5, 38, 11.5] }); d.doors.push({ c: [35, 13] });
  const A = analyze(d);
  assert.equal(A.stats.tables, 0); assert.equal(A.marks[10], undefined); assert.equal(A.marks[11], undefined);
  assert.equal(A.stats.notTable.length, 1);                                          // 表と見なかった理由を残す
});

test('表題欄：図枠の下の辺に付いた細い帯に、表題欄の文字が3種類以上あれば、その中の区画を除外にする（建物の部屋には触らない）', () => {
  const d = sheet();
  d.segs.push([0, 3, 42, 3]);                                                        // 帯の上の線（下の辺から 3m ＝ 枠の高さの 10%）
  d.faces.push(face(20, 30, 0.2, 42, 2.8), face(21, 0.5, 0.2, 10, 2.8));
  d.doors.push({ c: [5, 1.5] });                                                     // 会社のマークの曲線がドアと見られた、という想定
  const A = analyze(d);
  assert.equal(A.stats.titles, 1);
  assert.equal(A.marks[20].s, 'out'); assert.equal(A.marks[20].type, 'title');
  assert.equal(A.marks[21].s, 'out');
  assert.equal(A.marks[1], undefined); assert.equal(A.marks[2], undefined);
});

test('図枠が無い図面（壁の線だけ）では、何も印を付けない', () => {
  const A = analyze({ segs: [...rect(0, 0, 8, 6), [4, 0, 4, 6]], texts: [{ t: '事務室', x: 2, y: 3 }], faces: [face(0, 0, 0, 4, 6), face(1, 4, 0, 8, 6)], fixtures: [], doors: [] });
  assert.deepEqual(A.marks, {}); assert.equal(A.stats.frames, 0);
});

test('空の入力でも落ちない', () => {
  assert.deepEqual(analyze().marks, {}); assert.deepEqual(analyze({ faces: [] }).regions, []);
});

test('採点：正しく拾えた・拾えなかった・無いのに作られた・広さの誤差・本当の部屋の除外を分けて数える', () => {
  const faces = [face(0, 0, 0, 4, 3), face(1, 4, 0, 8, 3), face(2, 10, 0, 12, 2), face(3, 20, 0, 30, 5), face(4, 40, 0, 41, 1)];
  const ans = { rooms: [{ name: '事務室', pt: [2, 1.5], area: 12.5 }, { name: '倉庫', pt: [5, 1], area: 12 }, { name: '休憩室', pt: [7, 2] }, { name: '便所', pt: [100, 100] }, { name: '表の中にされた部屋', pt: [25, 2] }],
    notRooms: [{ pt: [11, 1], type: '家具' }], unknown: [{ pt: [40.5, 0.5] }] };
  const S = score(faces, { 3: { s: 'out' } }, ans);
  assert.equal(S.ok, 1);                 // 事務室
  assert.equal(S.missed, 3);             // 倉庫と休憩室が同じ区画（分かれていない）＋便所（どの区画にも無い）
  assert.equal(S.spurious, 1);           // 家具の区画
  assert.deepEqual(S.spuriousKinds, { 家具: 1 });
  assert.equal(S.roomOut, 1);            // 本当の部屋を除外にした（重大）
  assert.deepEqual(S.areaErr, [{ name: '事務室', pct: -4 }]);   // (12−12.5)÷12.5
  assert.equal(score(faces, { 2: { s: 'hold' } }, ans).spurious, 0);   // 保留は「作られた区画」に数えない
});
