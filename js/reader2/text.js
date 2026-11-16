/* 新しい読み取り・段階2：文字を整える・つなぐ・分ける（画面に触らない。tests/reader2.test.mjs でテスト）。
 *   ・1文字ずつ別々に描かれた文字（「事」「務」「室」が等間隔に並ぶ）を、1つの言葉に戻す。横書きも縦書きも
 *   ・「\U+XXXX」と書かれた文字を元の字に戻す、全角の英数字を半角にする
 *   ・文字を種類に分ける：部屋名／天井高／表題欄／品番／器具の名前／寸法の数字／その他
 *   ・表の中の「器具の名前」と、同じ行の「品番」を組にする（設備機器の表）
 * 元の文字は壊さない（つないだ結果は新しい文字として返し、いくつの文字からつないだかを残す）。
 * 寸法の数字どうしはつながない（寸法線の上の別々の数字なので、つなぐと意味のない数字になる）。
 * 入力の文字は {t, x, y}（m）。今の読み取りからは文字の大きさ・向きが来ないので、並びの間隔だけで判断する */
import { ROOMISH_RE } from './frame.js';

const TITLE_RE = /工事名|図面名|図\s*番|縮\s*尺|SCALE|DATE|承\s*認|設\s*計|製\s*図|検\s*図|作\s*成|TITLE/i;
const CH_RE = /CH\s*[=＝:：]?\s*[≒≈]?\s*\d/i;
/* 品番らしい文字：英字と数字が続く（CS232B、UFH507CR、TCF6624 など）。メーカー名が括弧で付く物も */
export const MODEL_RE = /[A-Z]{1,}[0-9]{2,}|[0-9]{2,}[A-Z]{1,}|[（(](TOTO|LIXIL|INAX|パナソニック|Panasonic|三菱|コマニー|サンゲツ|東リ)[）)]/;
export const ITEM_RE = /大便器|小便器|紙巻器|洗面|手洗|化粧鏡|水栓|温水器|ウォシュレット|ｳｫｼｭﾚｯﾄ|便座|ディスペンサー|ﾃﾞｨｽﾍﾟﾝｻｰ|ハンドドライヤー|ﾊﾝﾄﾞ|ﾄﾞﾗｲﾔｰ|照明器具|換気扇|SK|ＳＫ|流し|浴槽|キッチン|手すり|手摺|小物入|ブース/;
const DIM_RE = /^[\d,]{2,7}(\.\d+)?$/;

export const normalizeText = s => String(s ?? '')
  .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  .replace(/[　\s]+/g, ' ').trim();

export function classify(t) {
  const n = String(t || '');
  if (CH_RE.test(n)) return 'ch';
  if (TITLE_RE.test(n)) return 'title';
  if (DIM_RE.test(n.replace(/\s/g, ''))) return 'dim';
  if (MODEL_RE.test(n)) return 'model';
  if (ITEM_RE.test(n)) return 'item';
  if (n.length <= 16 && ROOMISH_RE.test(n)) return 'room';
  return 'other';
}

/* 1〜2文字の文字が、同じ高さ（または同じ横位置）で等間隔に並んでいれば、1つの言葉につなぐ。
 * 間隔は 5cm〜1.2m、並びの中で間隔のばらつきが 30% 以内。数字だけの並びはつながない。
 * 戻り：{ texts:[{t,x,y,from?}], joined:つないでできた言葉の数, parts:つながれた元の文字の数 } */
export function joinTexts(input = []) {
  const T = input.filter(t => t && String(t.t || '').trim()).map((t, k) => ({ t: normalizeText(t.t), x: +t.x, y: +t.y, k })).filter(t => t.t);
  const short = T.filter(t => t.t.length <= 2), used = new Set(), out = [];
  const chain = (axis, sign) => {                       // axis 0＝横書き（x が増える）、1＝縦書き（y が減る）
    const pos = t => axis ? t.y * sign : t.x, line = t => axis ? t.x : t.y;
    const S = short.filter(t => !used.has(t.k)).sort((a, b) => line(a) - line(b) || pos(a) - pos(b));
    const by = new Map();
    S.forEach(t => { const key = Math.round(line(t) / 0.08); for (const kk of [key, key - 1, key + 1]) { if (by.has(kk)) { by.get(kk).push(t); return; } } by.set(key, [t]); });
    by.forEach(row => {
      row.sort((a, b) => pos(a) - pos(b));
      let run = [];
      const flush = () => {
        if (run.length >= 2) {
          const s = run.map(t => t.t).join('');
          /* 数字だけの並び（寸法）と、同じ2文字のくり返し（「4L」「4L」…のような並んだ札）はつながない */
          if (!/^[\d,.\s]+$/.test(s) && !(run[0].t.length >= 2 && run.every(t => t.t === run[0].t))) { run.forEach(t => used.add(t.k)); out.push({ t: s, x: Math.round(run.reduce((a, t) => a + t.x, 0) / run.length * 1000) / 1000, y: Math.round(run.reduce((a, t) => a + t.y, 0) / run.length * 1000) / 1000, from: run.length }); }
        }
        run = [];
      };
      row.forEach(t => {
        if (!run.length) { run = [t]; return; }
        const gap = pos(t) - pos(run[run.length - 1]), p0 = run.length >= 2 ? pos(run[1]) - pos(run[0]) : gap;
        if (gap >= 0.05 && gap <= 1.2 && Math.abs(gap - p0) <= p0 * 0.3 && Math.abs(line(t) - line(run[0])) <= 0.1) run.push(t);
        else { flush(); run = [t]; }
      });
      flush();
    });
  };
  chain(0, 1); chain(1, -1);
  const rest = T.filter(t => !used.has(t.k)).map(t => ({ t: t.t, x: t.x, y: t.y }));
  return { texts: [...rest, ...out], joined: out.length, parts: used.size };
}

/* 表の中の、器具の名前と品番の組（同じ行で、名前の右にある一番近い品番）。boxes：表の場所 [[x0,y0,x1,y1]…] */
export function equipment(texts = [], boxes = []) {
  const inB = t => boxes.some(b => t.x >= b[0] && t.x <= b[2] && t.y >= b[1] && t.y <= b[3]);
  const T = texts.filter(inB), out = [];
  T.forEach(t => {
    if (classify(t.t) !== 'item') return;
    const m = T.filter(u => u !== t && MODEL_RE.test(u.t) && Math.abs(u.y - t.y) <= 0.3 && u.x > t.x && u.x - t.x <= 6).sort((a, b) => a.x - b.x)[0];
    if (m && !out.some(o => o.name === t.t && o.model === m.t)) out.push({ name: t.t, model: m.t });
  });
  return out;
}

/* 器具の種類ごとの品番（表の設備機器から）。水栓・便座などの付属品の行は、本体の品番にしない。見つからなければ '' */
const FIX_NAME = { toilet: /大便器/, urinal: /小便器/, counter: /洗面/, sink: /手洗/, slop: /^(SK|ＳＫ)|掃除/, bath: /浴槽|ユニットバス/, kitchen: /キッチン/ };
export function modelFor(type, equip = []) {
  const re = FIX_NAME[type]; if (!re) return '';
  const hit = equip.filter(e => e && re.test(e.name) && !/水栓|便座|ウォシュレット|ｳｫｼｭﾚｯﾄ|鏡/.test(e.name));
  /* 「洗面カウンター」のように長い名前の行を先に（「洗面」だけの行は見出しの一部のことがある） */
  hit.sort((a, b) => b.name.length - a.name.length);
  return hit.length ? String(hit[0].model || '').trim() : '';
}

/* 表題欄から、工事の名前・図面の名前・縮尺・日付を読む。boxes：表題欄の場所 [[x0,y0,x1,y1]…]（図面が何枚も並んでいれば何個も）。
 * 見出し（「工事名称」など）と同じ行で右にある一番近い文字、無ければすぐ下の文字を値にする。
 * 見出しの言葉が混ざった物・長すぎる物は、読み取りとして信用しない（間違った名前を出すより「読めなかった」にする）。
 * 戻り：{ project:[…], sheet:[…], scale:[…], date:[…] }（枠ごとに読めた値。同じ値は1つにまとめる） */
const TITLE_LABELS = { project: /^(工事名称|工事名|工事件名)$/, sheet: /^(図面名称|図面名)$/, scale: /^(SCALE|縮尺)$/i, date: /^(DATE|日付|作成日)$/i };
const ANY_LABEL = /工事名|図面名|図面番号|SCALE|縮尺|DATE|日付|承認|設計|製図|検図|作成|担当|No[.．]?$|^備考/i;
export function titleInfo(texts = [], boxes = []) {
  const out = { project: [], sheet: [], scale: [], date: [] };
  boxes.forEach(b => {
    const T = texts.filter(t => t.x >= b[0] && t.x <= b[2] && t.y >= b[1] && t.y <= b[3]).map(t => ({ ...t, s: String(t.t).replace(/\s+/g, '') }));
    const h = b[3] - b[1], w = b[2] - b[0];
    Object.entries(TITLE_LABELS).forEach(([k, re]) => {
      T.filter(t => re.test(t.s)).forEach(lab => {
        const ok = t => t !== lab && !ANY_LABEL.test(t.s) && t.s.length >= 2 && t.s.length <= 40;
        const right = T.filter(t => ok(t) && t.x > lab.x && t.x - lab.x <= w * 0.5 && Math.abs(t.y - lab.y) <= h * 0.12).sort((p, q) => p.x - q.x)[0];
        const below = right ? null : T.filter(t => ok(t) && lab.y - t.y > 0 && lab.y - t.y <= h * 0.35 && Math.abs(t.x - lab.x) <= w * 0.2).sort((p, q) => q.y - p.y)[0];
        const v = right || below; if (!v) return;
        const val = String(v.t).replace(/[\u3000\s]+/g, ' ').trim();
        /* 値として形が合わない物は読まない：縮尺は「1/50」の形、日付は数字と区切り、名前は日本語の字を含む物 */
        const fit = k === 'scale' ? /\d\s*[\/:：]\s*\d|NON|ノンスケール/i.test(val) : k === 'date' ? /\d{2,4}\s*[.\/年-]\s*\d{1,2}/.test(val) : /[\u3040-\u30ff\u4e00-\u9fff]/.test(val);
        if (fit && !out[k].includes(val)) out[k].push(val);
      });
    });
  });
  return out;
}
