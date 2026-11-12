/* 配管のセット：配管の行（長さ）から、継手・支持金具・保温材・配管の手間を子の行として付ける。
 * 決まりは水道概算（suido/）と同じ：
 *   継手の数 ＝ 長さ × 1mあたりの目安 × 継手の多さ（少ない0.6・ふつう1・多い1.5）を切り上げ
 *   支持金具 ＝ 長さ × 0.8個/m（給水・給湯）、0.6個/m（排水・通気・雨水）を切り上げ
 *   保温材   ＝ 長さ（給水・給湯で「保温する」の時だけ。管より太い一番近い太さ）
 *   配管の手間 ＝ 長さ
 *   配管そのものはロス5%込み */
import { uid } from './store.js';

export const SYS = { w: '給水', h: '給湯', d: '排水', v: '通気', r: '雨水' };
export const MANY = [['0.6', '少ない（まっすぐ）'], ['1', 'ふつう'], ['1.5', '多い（曲がりが多い）']];
export const FAM = {
  ts: [['el', 'エルボ', 0.4], ['te', 'チーズ', 0.15], ['so', 'ソケット', 0.25]],
  ht: [['el', 'エルボ', 0.4], ['te', 'チーズ', 0.15], ['so', 'ソケット', 0.25]],
  flex: [['el', 'エルボ', 0.15], ['te', 'チーズ', 0.08], ['so', 'ソケット', 0.08]],
  sgp: [['el', 'エルボ', 0.4], ['te', 'チーズ', 0.15], ['so', 'ソケット', 0.25]],
  sus: [['el', 'エルボ', 0.35], ['te', 'チーズ', 0.15], ['so', 'ソケット', 0.2]],
  pe: [['el', 'エルボ', 0.05], ['te', 'チーズ', 0.03], ['so', 'ソケット', 0.05]],
  dv: [['el', '大曲がりエルボ', 0.2], ['e45', '45°エルボ', 0.15], ['y', '45°Y', 0.12], ['so', 'ソケット', 0.25]],
  fdp: [['el', '大曲がりエルボ', 0.2], ['e45', '45°エルボ', 0.15], ['y', '45°Y', 0.12], ['so', 'ソケット', 0.25]]
};
const HOON_D = [10, 13, 16, 20, 25, 30, 40, 50];
export const SUP = { w: 0.8, h: 0.8, d: 0.6, v: 0.6, r: 0.6 };
export const PIPE_LOSS = 5;

/* その管で選べる系統（管の use：'w' 'wh' 'dvr' など） */
export const sysOptions = pipe => [...(pipe && pipe.use || 'w')].filter(k => SYS[k]);

/* 子の行を作る。items は単価マスター、keepPrice は前に付けた子の行の単価（品目ごと）を引き継ぐため */
export function buildChildren(pipeLine, items, keepPrice = {}) {
  const P = pipeLine.pipe, set = pipeLine.pipeSet || {};
  if (!P) return [];
  const sys = set.sys || sysOptions(P)[0];
  const many = Number(set.many) || 1;
  const find = id => items.find(i => i.id === id);
  const out = [];
  const add = (id, rate, ceil, why) => {
    const it = find(id);
    if (!it) return;
    out.push({
      id: uid('l'), itemId: it.id, name: it.name, spec: it.spec || '', unit: it.unit, kind: it.kind, cat: it.cat,
      price: keepPrice[it.id] != null ? keepPrice[it.id] : (it.price || ''), cost: '', loss: '', sheet: 0, qty: '',
      basis: { measure: 'link', line: pipeLine.id, rate: Math.round(rate * 1000) / 1000, ceil }, parent: pipeLine.id, sys, why
    });
  };
  (FAM[P.fam] || []).forEach(([jk, jn, r]) => add(`s-j-${P.k}${P.d}-${jk}`, r * many, true, `${jn} ${r}個/m${many !== 1 ? ` × ${many}` : ''}`));
  add(sys === 'w' || sys === 'h' ? 's-s-w' : 's-s-d', SUP[sys], true, `支持金具 ${SUP[sys]}個/m`);
  if (set.hoon && (sys === 'w' || sys === 'h')) {
    const hd = HOON_D.find(h => h >= P.d) || HOON_D[HOON_D.length - 1];
    add(`s-h-${hd}`, 1, false, '保温材 管の長さと同じ');
  }
  add(`s-l-p${sys}`, 1, false, '配管の手間 管の長さと同じ');
  return out;
}

/* 配管の行の子の行を付け直す（系統・継手の多さ・保温を変えた時）。単価を変えていた子の行は単価を引き継ぐ */
export function rebuild(project, pipeLine, items) {
  const old = project.lines.filter(l => l.parent === pipeLine.id);
  const keep = {};
  old.forEach(l => { if (l.itemId) keep[l.itemId] = l.price; });
  project.lines = project.lines.filter(l => l.parent !== pipeLine.id);
  const at = project.lines.indexOf(pipeLine) + 1;
  const kids = buildChildren(pipeLine, items, keep);
  project.lines.splice(at, 0, ...kids);
  return kids.length;
}
