/* 案件全体の「元に戻す」「やり直す」（画面に触らない。tests/undo.test.mjs でテスト）。
 * 保存のたびに、変わる前の案件の中身を控えておく。部屋・仕上げ・明細・図面に置いた物のどれを変えても戻せる。
 *   ・図面の線（drawing.plan）と下に敷いた写真（sketch.img）は大きいので写さず、同じ物を指しておく（読み込んだ後は書き換えない物）
 *   ・出した見積書の記録（history）は戻さない（出した事実は消さない）
 *   ・控えはアプリを開いている間だけ（閉じると消える）。案件ごとに MAX 回、全部で BYTES 文字まで */
export const MAX = 40;
export const BYTES = 24e6;
const S = new Map();   // 案件の id → { base, undo: [], redo: [] }
let total = 0;

function pack(p) {
  const d = p.drawing, sk = p.sketch;
  const light = { ...p, history: undefined, updatedAt: undefined, dataVersion: undefined,
    drawing: d ? { ...d, plan: undefined } : d, sketch: sk ? { ...sk, img: undefined } : sk };
  return { json: JSON.stringify(light), plan: d ? d.plan : undefined, img: sk ? sk.img : undefined };
}
function unpack(p, e) {
  const o = JSON.parse(e.json), keep = { history: p.history, updatedAt: p.updatedAt, dataVersion: p.dataVersion };
  Object.keys(p).forEach(k => { delete p[k]; });
  Object.assign(p, o);
  if (p.drawing && e.plan !== undefined) p.drawing.plan = e.plan;
  if (p.sketch && e.img !== undefined) p.sketch.img = e.img;
  Object.keys(keep).forEach(k => { if (keep[k] !== undefined) p[k] = keep[k]; });
}
const same = (a, b) => a.json === b.json && a.plan === b.plan && a.img === b.img;
const push = (list, e) => { list.push(e); total += e.json.length; };
const drop = list => { const e = list.shift(); if (e) total -= e.json.length; };
function trim(st) {
  while (st.undo.length > MAX) drop(st.undo);
  /* 全体が大きくなりすぎたら、古い控えから捨てる（今の案件を最後に） */
  for (const x of [...S.values()].filter(v => v !== st).concat(st)) { while (total > BYTES && x.undo.length > (x === st ? 1 : 0)) drop(x.undo); }
}

/* 案件を開いた時に呼ぶ：今の中身を「変わる前」として覚える */
export function track(p) {
  if (!p || !p.id) return;
  if (!S.has(p.id)) S.set(p.id, { base: pack(p), undo: [], redo: [] });
}
/* 保存の時に呼ぶ：前に覚えた中身と違っていたら、前の中身を控えに積む。積んだら true */
export function commit(p) {
  if (!p || !p.id) return false;
  const st = S.get(p.id);
  if (!st) { track(p); return false; }
  const cur = pack(p);
  if (same(st.base, cur)) return false;
  push(st.undo, st.base);
  st.redo.forEach(e => { total -= e.json.length; }); st.redo = [];
  st.base = cur;
  trim(st);
  return true;
}
export const canUndo = id => { const st = S.get(id); return !!st && st.undo.length > 0; };
export const canRedo = id => { const st = S.get(id); return !!st && st.redo.length > 0; };
export const counts = id => { const st = S.get(id); return st ? { undo: st.undo.length, redo: st.redo.length } : { undo: 0, redo: 0 }; };

function step(p, from, to) {
  const st = S.get(p && p.id);
  if (!st) return false;
  commit(p);                       // まだ控えていない変更があれば先に控える
  const e = st[from].pop();
  if (!e) return false;
  total -= e.json.length;
  push(st[to], st.base);
  unpack(p, e);
  st.base = e;
  return true;
}
/* 1つ前に戻す／戻したのをやり直す。案件の中身をその場で入れ替える（同じ物を見ている画面がそのまま使えるように） */
export const undo = p => step(p, 'undo', 'redo');
export function redo(p) {
  const st = S.get(p && p.id);
  if (!st || !st.redo.length) return false;
  if (!same(st.base, pack(p))) return false;   // 戻した後で何か変えたら、やり直しはできない（commit が redo を消す）
  return step(p, 'redo', 'undo');
}
export function forget(id) { const st = S.get(id); if (!st) return; [...st.undo, ...st.redo].forEach(e => { total -= e.json.length; }); S.delete(id); }
export const size = () => total;
