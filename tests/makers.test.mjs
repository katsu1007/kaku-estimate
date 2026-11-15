/* メーカーのサイトへのリンクのテスト。実行：node tests/makers.test.mjs
 * 場所の形は実際にメーカーのサイトで開けた物（js/makers.js の頭に書いた品番）に合わせてある */
import test from 'node:test';
import assert from 'node:assert/strict';
import { codeOf, makerOf, makerLinks } from '../js/makers.js';

test('品番の欄から品番だけ取り出す', () => {
  assert.equal(codeOf('SP-2801 白'), 'SP-2801');
  assert.equal(codeOf(' re55001'), 'RE55001');
  assert.equal(codeOf('ＴＳ２４０１'), 'TS2401');
  assert.equal(codeOf('CM-12241（グレー）'), 'CM-12241');
  assert.equal(codeOf('白っぽいやつ'), '');
  assert.equal(codeOf(''), '');
});

test('メーカーを名前・規格・単価マスターの品目から見分ける', () => {
  assert.equal(makerOf({ name: 'ビニールクロス', spec: 'サンゲツ リザーブ' }), 'sangetsu');
  assert.equal(makerOf({ name: '長尺シート（東リ ホスピリュームNW）' }), 'toli');
  assert.equal(makerOf({ name: '長尺シート' }, { spec: '東リ 定価' }), 'toli');
  assert.equal(makerOf({ name: '長尺シート' }), '');
});

test('サンゲツ：品番があれば品番のページ（ハイフンは取る）、無ければカタログ', () => {
  const l = { name: 'ビニールクロス', spec: 'サンゲツ リザーブ', cat: 'wall', code: 'RE55001' };
  assert.deepEqual(makerLinks(l), [{ label: 'サンゲツで品番を見る', url: 'https://www.sangetsu.co.jp/product/detail/RE55001/' }]);
  assert.equal(makerLinks({ ...l, cat: 'floor', code: 'CM-12241 グレー' })[0].url, 'https://www.sangetsu.co.jp/product/detail/CM12241/');
  assert.deepEqual(makerLinks({ ...l, code: '' }), [{ label: 'サンゲツのカタログ', url: 'https://www.sangetsu.co.jp/digital_book/wall.html' }]);
});

test('東リ：床の品番は品番のページ、品番が無ければシリーズのページ、壁の品番は商品検索', () => {
  const it = { spec: '東リ 定価', url: 'https://www.toli.co.jp/product/search/floor_product/235' };
  const l = { name: '長尺シート（東リ ホスピリュームNW）', cat: 'floor', code: 'TS2401' };
  assert.equal(makerLinks(l, it)[0].url, 'https://www.toli.co.jp/product/search/floor_number/TS2401');
  assert.deepEqual(makerLinks({ ...l, code: '' }, it), [{ label: '東リでこのシリーズを見る', url: it.url }]);
  assert.equal(makerLinks({ name: '壁紙 東リ', cat: 'wall', code: 'VS1001' })[0].url, 'https://www.toli.co.jp/product/search/wall_result');
  assert.equal(makerLinks({ name: '壁紙 東リ', cat: 'wall' })[0].url, 'https://www.toli.co.jp/digital_catalog/?tab=wall');
});

test('メーカーが分からない行は両方を出す', () => {
  const r = makerLinks({ name: '長尺シート', cat: 'floor' });
  assert.deepEqual(r.map(x => x.label), ['サンゲツのカタログ', '東リのカタログ']);
  assert.ok(r.every(x => /^https:\/\/www\.(sangetsu|toli)\.co\.jp\//.test(x.url)));
});
