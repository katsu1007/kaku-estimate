/* 3Dで見る。
 * 前のKAKUの3D（壁の組み立て・ドアの切り抜き・質感・タップで寸法と数量の根拠）をそのまま使う。
 * 新しい画面の案件（図面・部屋・器具・照明・分電盤）を前のKAKUの形に直して渡し、全画面の層に出す。
 * 前のKAKUの保存（案件一覧）には何も足さない。閉じたら層ごと消す。 */
import { opts } from './app.js';
import { planCH } from './drawing.js';

const LIGHT = /^e-(dl|clight|ceil|light|base|bl)/;
const DEMO = /解体|撤去|はがし|剥がし|斫り|はつり/;

/* 部屋ごとの仕上げ：その部屋に掛かっている明細の行（床・壁・天井の面積、巾木の長さ）から品目を拾う */
function finishes(p, r) {
  const o = {};
  (p.lines || []).forEach(l => {
    const b = l.basis; if (!b || !l.itemId || l.kind === 'labor') return;
    if (!(b.rooms === 'all' || (Array.isArray(b.rooms) && b.rooms.includes(r.id)))) return;
    const demo = DEMO.test(l.name || '');
    const k = { floor: demo ? 'dFloor' : 'floor', wall: demo ? 'dWall' : 'wallFin', ceil: demo ? 'dCeil' : 'ceilFin', base: 'haba' }[b.measure];
    if (k && !o[k]) o[k] = l.itemId;
  });
  return o;
}

export function toOld(p) {
  const d = p.drawing, plan = d.plan, ch0 = planCH(plan) || opts().ceilH;
  const P = { segs: plan.segs, dsegs: plan.dsegs || [], titles: plan.titles || [],
    faces: plan.faces.map((f, k) => ({ i: f.i, no: k + 1, name: f.name || '', area: f.area, peri: f.peri, ch: f.ch || 0, poly: f.poly })) };
  const rooms = p.rooms.filter(r => r.src === 'plan').map((r, k) => ({
    id: r.id, name: r.name, plan: true, faces: r.faces || [], ch: Number(r.h) > 0 ? Number(r.h) : ch0,
    color: Number.isFinite(r.color) ? r.color : k, area: Number(r.area) || 0, openW: 0, ...finishes(p, r)
  }));
  const places = (d.lights || []).map(x => ({ id: x.id, item: x.item, where: 'pt', p: [x.x, x.y], count: 1 }));
  if (d.panel) places.push({ id: 'panel', item: 'e-panel', where: 'pt', p: d.panel, count: 1 });
  const fix = { fx: (d.fixtures || []).map((x, k) => ({ id: 'f' + k, t: x.t, b: x.b, back: x.back || '' })), doors: (d.doors || []).map(x => ({ c: x.c, m: x.m, r: x.r })) };
  const cur = { id: '__k3d', name: p.name || '', rooms, places, win: {}, openAuto: true,
    wire: { on: (d.lights || []).length > 0, sw: 'e-sw1', cL: 'e-v16-2', cO: 'e-v20-2', extra: d.wireExtra ?? 10, out: false, link: {} } };
  return { plan: P, fix, cur };
}

let layer = null;
export async function open3D(p) {
  if (!p.drawing || !p.drawing.plan) throw new Error('先に図面を読み込んでください');
  close3D();
  const f = document.createElement('iframe');
  f.title = '3Dで見る';
  f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:10000;background:#1c1f1a';
  f.src = './old/?view3d=1';
  document.body.appendChild(f); layer = f;
  const W = await new Promise((res, rej) => {
    let n = 0;
    const t = setInterval(() => {
      try {
        const w = f.contentWindow;
        if (w && typeof w.KAKU_open3D === 'function' && w.eval('typeof KAKU_cat!=="undefined"&&!!KAKU_cat')) { clearInterval(t); res(w); return; }
      } catch (e) { /* 読み込み中 */ }
      if (++n > 300 || layer !== f) { clearInterval(t); rej(new Error('3Dの部品が起動しませんでした')); }
    }, 100);
  });
  const st = W.document.createElement('style');
  st.textContent = 'body>*:not(#k3d):not(script):not(style){visibility:hidden!important}';
  W.document.head.appendChild(st);
  try { W.document.documentElement.dataset.theme = document.documentElement.dataset.theme || 'dark'; } catch (e) { /* なくてよい */ }
  W.__k3 = toOld(p);
  W.eval('KAKU_plan=window.__k3.plan;KAKU_fix=window.__k3.fix;current=window.__k3.cur;KAKU_open3D()');
  await new Promise(r => setTimeout(r, 300));
  const btn = W.document.querySelector('#k3d .k3close');
  if (btn) { btn.textContent = '閉じる'; btn.onclick = e => { e.preventDefault(); close3D(); }; }
  return W;
}
export function close3D() { if (layer) { layer.remove(); layer = null; } }
