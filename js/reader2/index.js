/* 新しい読み取りのまとめ役（画面に触らない）。段階1（図枠・表・表題欄）と段階2（文字）を順に回して、結果を1つにする。
 * 今の読み取りの結果（区画・器具）は書き換えない。返すのは「印」と「提案」だけ：
 *   regions・marks・stats：段階1（frame.js）
 *   names { 区画の i: 名前 }：名前の無い区画の中に、部屋らしい文字が直にあれば、その名前の提案（つないだ文字も使う）
 *   fxOut [{ k: 器具の番号, why }]：表題欄・表の中にある「器具」（会社のマークや表の線の見間違い）
 *   equip [{ name, model }]：表の中の、器具の名前と品番の組
 *   title { project, sheet, scale, date }：表題欄から読めた工事の名前・図面の名前・縮尺・日付
 *   text { total, joined, parts, kinds }：文字の数、つないだ数、種類ごとの数 */
import { analyze as analyzeFrame } from './frame.js';
import { joinTexts, classify, equipment, titleInfo } from './text.js';

export const VER = 2;
const pip = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

/* 探し直した区画（段階3）だけに使う印：外壁の外をぐるっと回る輪と、細い帯。どちらも決めきれない物として「保留」にする（部屋にもできる）
 *   輪：ほかの区画2つ以上をすっぽり囲み、囲まれた区画のまとまりが、どの辺からも 25cm 以上内側にある（便所とブースのように壁に付いている物は輪ではない）
 *   帯：細い方が 35cm 以下で、長さがその4倍以上 */
export function shapeMarks(faces, marks = {}) {
  const B = faces.filter(f => f && f.poly && f.poly.length >= 3).map(f => { const xs = f.poly.map(q => q[0]), ys = f.poly.map(q => q[1]); return { f, b: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }; });
  const out = {};
  B.forEach(a => {
    if (marks[a.f.i]) return;
    const w = a.b[2] - a.b[0], h = a.b[3] - a.b[1], lo = Math.min(w, h), hi = Math.max(w, h);
    if (lo <= 0.35 && hi >= lo * 4) { out[a.f.i] = { s: 'hold', type: 'strip', why: '細い帯です（見出しの帯や壁の厚みかもしれません）' }; return; }
    const kids = B.filter(c => c !== a && c.b[0] >= a.b[0] - 0.02 && c.b[1] >= a.b[1] - 0.02 && c.b[2] <= a.b[2] + 0.02 && c.b[3] <= a.b[3] + 0.02 && (c.b[2] - c.b[0]) * (c.b[3] - c.b[1]) < w * h * 0.9);
    if (kids.length < 2) return;
    const u = [Math.min(...kids.map(c => c.b[0])), Math.min(...kids.map(c => c.b[1])), Math.max(...kids.map(c => c.b[2])), Math.max(...kids.map(c => c.b[3]))];
    const inset = Math.min(u[0] - a.b[0], u[1] - a.b[1], a.b[2] - u[2], a.b[3] - u[3]);
    if (inset >= 0.25 && (u[2] - u[0]) * (u[3] - u[1]) >= w * h * 0.4) out[a.f.i] = { s: 'hold', type: 'ring', why: 'ほかの区画をぐるっと囲んでいます（建物の外まわりかもしれません）' };
  });
  return out;
}

export function analyzeAll({ segs = [], faces = [], texts = [], fixtures = [], doors = [], shapes = false } = {}) {
  const J = joinTexts(texts);
  const A = analyzeFrame({ segs, faces, texts: J.texts, fixtures, doors });
  if (shapes) { const M = shapeMarks(faces, A.marks); Object.assign(A.marks, M); A.stats.hold += Object.keys(M).length; A.stats.shapes = Object.keys(M).length; }
  const kinds = {}; J.texts.forEach(t => { const k = classify(t.t); kinds[k] = (kinds[k] || 0) + 1; });
  /* 名前の提案：印の無い・名前の無い区画に、部屋らしい文字が直に（中の小さい区画に入らずに）1〜2種類あれば */
  const names = {}, rooms = J.texts.filter(t => classify(t.t) === 'room');
  const F = faces.filter(f => f && f.poly && f.poly.length >= 3);
  F.forEach(f => {
    if (f.name || A.marks[f.i]) return;
    const kids = F.filter(g => g !== f && g.area < f.area * 0.9 && pip(g.poly.reduce((s, q) => s + q[0], 0) / g.poly.length, g.poly.reduce((s, q) => s + q[1], 0) / g.poly.length, f.poly));
    const inside = [...new Set(rooms.filter(t => pip(t.x, t.y, f.poly) && !kids.some(k => pip(t.x, t.y, k.poly))).map(t => t.t))];
    if (inside.length >= 1 && inside.length <= 2) names[f.i] = inside.join('・');
  });
  /* 表題欄・表の中の「器具」は器具ではない（会社のマークを洗面台と拾っていた） */
  const boxes = A.regions.filter(r => r.type === 'title' || r.type === 'table');
  const fxOut = [];
  fixtures.forEach((x, k) => {
    if (!x || !x.b || x.t === 'other') return;
    const cx = (x.b[0] + x.b[2]) / 2, cy = (x.b[1] + x.b[3]) / 2, r = boxes.find(q => cx >= q.box[0] && cx <= q.box[2] && cy >= q.box[1] && cy <= q.box[3]);
    if (r) fxOut.push({ k, t: x.t, why: r.type === 'title' ? '表題欄の中にあります（会社のマークなどの見間違い）' : '表の中にあります（表の線や文字の見間違い）' });
  });
  const equip = equipment(J.texts, A.regions.filter(r => r.type === 'table').map(r => r.box)).slice(0, 40);
  const title = titleInfo(J.texts, A.regions.filter(r => r.type === 'title').map(r => r.box));
  return { ...A, ver: VER, names, fxOut, equip, title, text: { total: texts.length, after: J.texts.length, joined: J.joined, parts: J.parts, kinds } };
}
