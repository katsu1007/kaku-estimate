/* 入れ忘れのチェック（画面に触らない計算だけ。tests/workcheck.test.mjs でテスト）。
 * calc.js の check() は「計算が合っているか」を見る。こちらは「工事の入れ忘れ・確かめ忘れ」を見る。
 * 金額は変えない。出すのは「確かめてください」の一覧だけ。
 * 戻り値：[{ key, level: 'warn'|'tip', msg, step, roomId?, lineId? }]
 *   warn＝入れ忘れの可能性が高い ／ tip＝工事の内容によっては要らない（画面で「この案件では要らない」にできる）
 *   key は project.checksOff[key] で消した物を覚えるための名前 */
import { DEFAULTS, isRoomBased, lineQty } from './calc.js';

const FIX = {
  toilet: ['便器', ['便器', 'トイレ']], urinal: ['小便器', ['小便器']], counter: ['洗面カウンター', ['洗面']], sink: ['手洗器・流し', ['手洗', '流し']],
  slop: ['SK（掃除流し）', ['SK', '掃除流し']], bath: ['浴槽', ['ユニットバス', '浴']], kitchen: ['キッチン', ['キッチン']]
};
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const has = (lines, re) => lines.some(l => re.test(`${l.name || ''} ${l.spec || ''}`));

export function workChecks(project, opt = DEFAULTS) {
  const o = { ...DEFAULTS, ...opt };
  const p = project, rooms = p.rooms || [], lines = p.lines || [], d = p.drawing || {};
  const out = [];
  const add = (key, level, msg, ref = {}) => out.push({ key, level, msg, ...ref });
  const names = (list, n = 3) => list.slice(0, n).map(r => `「${r.name || '名前なし'}」`).join('') + (list.length > n ? ` ほか${list.length - n}部屋` : '');

  /* ① 現場 */
  if (!String(p.customer || '').trim()) add('customer', 'warn', 'お客様の名前が入っていません。見積書の宛名になります。', { step: 1 });
  if (!String(p.name || '').trim()) add('pname', 'warn', '案件の名前（工事名）が入っていません。', { step: 1 });

  /* ② 部屋：天井高を入れていない部屋は標準の高さで壁を計算している */
  const usesH = lines.some(l => isRoomBased(l) && l.basis.measure === 'wall');
  const noH = rooms.filter(r => !(num(r.h) > 0));
  if (noH.length && usesH) add('ceilH', 'warn', `${names(noH)}は天井高が入っていません。標準の ${o.ceilH}m で壁の面積を計算しています。現場の高さを確かめてください。`, { step: 2, roomId: noH[0].id });
  else if (noH.length) add('ceilH', 'tip', `${names(noH)}は天井高が入っていません（標準の ${o.ceilH}m として扱います）。`, { step: 2, roomId: noH[0].id });

  /* 部屋から数える行があるのに、どの行にも入っていない部屋 */
  const based = lines.filter(isRoomBased);
  if (based.length && !based.some(l => l.basis.rooms === 'all' || !Array.isArray(l.basis.rooms))) {
    const used = new Set(based.flatMap(l => l.basis.rooms));
    const un = rooms.filter(r => !used.has(r.id));
    if (un.length) add('roomUnused', 'warn', `${names(un)}は、どの工事の行にも入っていません。工事をしない部屋なら、このままで構いません。`, { step: 2, roomId: un[0].id });
  }
  /* 図面：名前の付いた区画が部屋になっていない */
  if (d.plan && Array.isArray(d.plan.faces)) {
    const own = new Set(rooms.flatMap(r => (r.src === 'plan' && r.faces) || []));
    const rest = d.plan.faces.filter(f => f.name && !own.has(f.i));
    if (rooms.length && rest.length) add('faceRest', 'tip', `図面に名前のある区画が ${rest.length} 個、まだ部屋になっていません（${rest.slice(0, 3).map(f => f.name).join('・')}${rest.length > 3 ? ' など' : ''}）。`, { step: 2 });
  }

  /* 図面の器具 */
  const fx = d.fixtures || [], cnt = {};
  fx.forEach(x => { cnt[x.t] = (cnt[x.t] || 0) + 1; });
  if (cnt.unknown) add('fxUnknown', 'warn', `図面に「判定保留」の器具が ${cnt.unknown} 個あります。図面で種類を決めてください。`, { step: 2 });
  Object.keys(FIX).forEach(t => {
    if (!cnt[t]) return;
    const [label, words] = FIX[t];
    const mine = lines.filter(l => l.fromFix === t || words.some(w => (l.name || '').includes(w)) && !(t === 'toilet' && (l.name || '').includes('小便器')));
    if (!mine.length) { add('fx:' + t, 'warn', `図面に${label}が ${cnt[t]} 個ありますが、見積もりに${label}の行がありません。「器具を明細に入れる」で入れられます。`, { step: 2 }); return; }
    const tagged = lines.filter(l => l.fromFix === t && l.kind !== 'labor');
    if (tagged.length) {
      const q = tagged.reduce((s, l) => s + lineQty(l, rooms, o, lines), 0);
      if (q !== cnt[t]) add('fxN:' + t, 'warn', `${label}は図面で ${cnt[t]} 個ですが、見積もりの本体は ${q} 個です。`, { step: 3, lineId: tagged[0].id });
    }
  });
  if (cnt.toilet || cnt.urinal || cnt.counter || cnt.sink || cnt.slop || cnt.bath || cnt.kitchen) {
    if (lines.some(l => l.fromFix) && !lines.some(l => l.pipe || /^(pipe|spipe)$/.test(l.cat || ''))) add('fxPipe', 'tip', '設備の器具が入っていますが、給排水の配管の行がありません。配管もやり替える工事なら入れてください。', { step: 3 });
  }

  /* 照明・コンセント */
  const L = d.lights || [], O = d.outlets || [];
  if ((L.length || O.length) && !d.panel && !has(lines, /分電盤|ブレーカー/)) add('panel', 'tip', `図面に照明 ${L.length} 台・コンセント ${O.length} 個を置いていますが、分電盤・ブレーカーの行がありません。回路を足す工事なら入れてください。`, { step: 2 });
  const noUse = rooms.filter(r => L.some(x => x.room === r.id) && !r.lightUse);
  if (noUse.length) add('lightUse', 'tip', `${names(noUse)}は照明を置いていますが、部屋の用途を選んでいません。用途を選ぶと明るさ（lx）の目安が出ます。`, { step: 2, roomId: noUse[0].id });

  /* ③ 工事 */
  if (lines.length) {
    const demo = lines.filter(l => /^demo/.test(l.cat || '') || /解体|撤去|はつり/.test(l.name || ''));
    if (demo.length && !has(lines, /処分|産廃|廃材|ガラ/)) add('waste', 'warn', `解体・撤去の行が ${demo.length} 行ありますが、廃材の処分の行がありません。`, { step: 3 });
    const fin = lines.filter(l => /^(floor|wall|ceil|paint|board)$/.test(l.cat || ''));
    if (fin.length && !has(lines, /養生/)) add('yojo', 'tip', '仕上げの工事がありますが、養生の行がありません。', { step: 3 });
    if (lines.some(l => l.kind === 'mat') && !lines.some(l => l.kind === 'labor' || l.kind === 'sub')) add('noLabor', 'warn', '材料の行だけで、手間（工事費）の行が1つもありません。', { step: 3 });
    /* 仕上げの材料があるのに、同じ所（床・壁・天井）の手間の行が無い */
    [['floor', '床仕上げ', /床|フロア|シート|カーペット|タイル/], ['wall', '壁仕上げ', /壁|クロス/], ['ceil', '天井仕上げ', /天井|クロス/]].forEach(([c, label, re]) => {
      if (!lines.some(l => l.cat === c && l.kind === 'mat')) return;
      const work = lines.some(l => l.kind !== 'mat' && !/^demo/.test(l.cat || '') && !/解体|撤去/.test(l.name || '') && (l.cat === c || (l.basis && l.basis.measure === c) || re.test(l.name || '')));
      if (!work) add('lab:' + c, 'tip', `${label}の材料がありますが、張る手間の行が見当たりません。材工の単価なら、このままで構いません。`, { step: 3 });
    });
    if (!(num(p.overheadPct) > 0) && !(num(p.profitPct) > 0) && !has(lines, /諸経費|現場管理|運搬|経費/)) add('overhead', 'tip', '諸経費・利益が 0% で、経費の行もありません。', { step: 4 });
  }
  const off = p.checksOff || {};
  return out.map(x => ({ ...x, off: !!off[x.key] }));
}

/* 画面に出す分（「この案件では要らない」にした物を除く） */
export const openChecks = (project, opt) => workChecks(project, opt).filter(x => !x.off);
