/* 3Dで見る。
 * 前のKAKUの3D（壁の組み立て・ドアの切り抜き・質感・タップで寸法と数量の根拠）をそのまま使う。
 * 新しい画面の案件（図面・部屋・器具・照明・分電盤）を前のKAKUの形に直して渡し、全画面の層に出す。
 * 前のKAKUの保存（案件一覧）には何も足さない。閉じたら層ごと消す。 */
import { opts } from './app.js';
import { planCH } from './drawing.js';
import { lightWires } from './project.js';
import { pip } from './lighting.js';

const clone = o => JSON.parse(JSON.stringify(o));
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
  (d.outlets || []).forEach(x => places.push({ id: x.id, item: x.item || 'e-cone', where: 'pt', p: [x.x, x.y], count: 1 }));
  /* スイッチ：新しい画面で決めた位置（自動の物も）を置いた物として渡し、照明をそのスイッチにつなぐ（ブースの照明も外の部屋のスイッチへ） */
  const W = lightWires(p), link = {};
  W.sws.forEach(s0 => places.push({ id: 'sw_' + s0.key, item: 'e-sw1', where: 'pt', p: s0.l, count: 1 }));
  Object.entries(W.assign || {}).forEach(([lk, sk]) => { link[lk + ':0'] = 'sw_' + sk + ':0'; });
  const fix = { fx: (d.fixtures || []).map((x, k) => ({ id: 'f' + k, t: x.t, b: x.b, back: x.back || '' })), doors: (d.doors || []).map(x => ({ c: x.c, m: x.m, r: x.r })) };
  const cur = { id: '__k3d', name: p.name || '', rooms, places, win: {}, win3d: clone(d.win3d || []), openAuto: true,
    wire: { on: (d.lights || []).length > 0 || (d.outlets || []).length > 0, sw: 'e-sw1', cL: 'e-v16-2', cO: 'e-v20-2', extra: d.wireExtra ?? 10, out: (d.outlets || []).length > 0, link } };
  /* 配線の線と長さは新しい画面の計算（ブースは外の部屋のスイッチ、置いたスイッチ・つなぎ替え込み）をそのまま見せる */
  const wire = { paths: W.paths, home: W.home, sws: [], lights: [], lenL: W.lenL, lenO: W.lenO, lenH: W.lenH, circ: W.circ, autoSw: 0, nL: W.nL, nO: W.nO, panel: !!d.panel, far: W.far, noSw: 0 };
  return { plan: P, fix, cur, wire };
}

let layer = null;
/* 3Dで足した窓：面している部屋（窓の真ん中から30cm以内に辺がある区画）の「窓を寸法で入れる」に入れる。
 * 3Dから入れた窓は from3d が付いていて、3Dを閉じるたびに入れ直す（手で入れた窓はそのまま） */
export function applyWin3d(p, list) {
  const d = p.drawing; d.win3d = list;
  const plan = d.plan, near = (q, P) => P.some((a, i) => { const b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)) : 0; return Math.hypot(a[0] + t * dx - q[0], a[1] + t * dy - q[1]) < 0.3; });
  p.rooms.forEach(r => { if (Array.isArray(r.windows)) r.windows = r.windows.filter(w => !w.from3d); });
  let n = 0;
  list.forEach((w, wi) => {
    p.rooms.filter(r => r.src === 'plan').forEach(r => {
      const F = (r.faces || []).map(i => plan.faces.find(f => f.i === i)).filter(Boolean);
      if (!F.some(f => near(w.p, f.poly) || pip(w.p[0], w.p[1], f.poly))) return;
      r.windows = r.windows || []; r.windows.push({ w: Math.round(w.w * 1000), h: Math.round(w.h * 1000), n: 1, from3d: wi + 1 }); n++;
    });
  });
  return n;
}

export async function open3D(p, { onClose } = {}) {
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
  W.eval('KAKU_plan=window.__k3.plan;KAKU_fix=window.__k3.fix;current=window.__k3.cur;window.KW_calc=function(){return window.__k3.wire};KAKU_open3D()');
  await new Promise(r => setTimeout(r, 300));
  const btn = W.document.querySelector('#k3d .k3close');
  if (btn) { btn.textContent = '閉じる'; btn.onclick = e => { e.preventDefault(); let wins = null; try { wins = JSON.parse(W.eval('JSON.stringify(current.win3d||[])')); } catch (er) { /* 読めなければそのまま */ } close3D(); onClose && onClose(wins); }; }
  return W;
}
export function close3D() { if (layer) { layer.remove(); layer = null; } }
