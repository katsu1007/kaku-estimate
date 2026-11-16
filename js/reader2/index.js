/* 新しい読み取りのまとめ役（画面に触らない）。段階1（図枠・表・表題欄）と段階2（文字）を順に回して、結果を1つにする。
 * 今の読み取りの結果（区画・器具）は書き換えない。返すのは「印」と「提案」だけ：
 *   regions・marks・stats：段階1（frame.js）
 *   names { 区画の i: 名前 }：名前の無い区画の中に、部屋らしい文字が直にあれば、その名前の提案（つないだ文字も使う）
 *   fxOut [{ k: 器具の番号, why }]：表題欄・表の中にある「器具」（会社のマークや表の線の見間違い）
 *   equip [{ name, model }]：表の中の、器具の名前と品番の組
 *   text { total, joined, parts, kinds }：文字の数、つないだ数、種類ごとの数 */
import { analyze as analyzeFrame } from './frame.js';
import { joinTexts, classify, equipment } from './text.js';

export const VER = 2;
const pip = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

export function analyzeAll({ segs = [], faces = [], texts = [], fixtures = [], doors = [] } = {}) {
  const J = joinTexts(texts);
  const A = analyzeFrame({ segs, faces, texts: J.texts, fixtures, doors });
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
  return { ...A, ver: VER, names, fxOut, equip, text: { total: texts.length, after: J.texts.length, joined: J.joined, parts: J.parts, kinds } };
}
