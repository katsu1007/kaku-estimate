/* 起動・画面の切り替え・保存のまとめ役 */
import * as store from './store.js';
import { DEFAULTS } from './calc.js';
import { BUILTIN_ITEMS, CATEGORIES } from './master-data.js';
import { icon, esc, toast, showError, $ } from './ui.js';

export const APP_VERSION = '2.0.0';
export const APP_DATE = '2026-11-12';

export const state = {
  projects: [],
  settings: {},
  company: {},
  priceOverrides: {},
  customItems: [],
  route: { name: 'home' }
};

const SETTINGS0 = { theme: 'dark', ...DEFAULTS, overheadPct: 0, profitPct: 0, greeting: '' };

/* 計算に渡す設定（掛け率・ロス率など） */
export const opts = () => ({ ...DEFAULTS, ...pick(state.settings, Object.keys(DEFAULTS)) });
const pick = (o, ks) => Object.fromEntries(ks.filter(k => o[k] !== '' && o[k] != null).map(k => [k, Number(o[k])]));

/* 単価マスター（最初からある品目＋自分で足した品目、単価の変更を反映） */
export function masterItems() {
  return [
    ...BUILTIN_ITEMS.map(i => (state.priceOverrides[i.id] != null ? { ...i, price: Number(state.priceOverrides[i.id]), changed: true } : i)),
    ...state.customItems.map(i => ({ ...i, custom: true }))
  ];
}
export const categories = () => [...CATEGORIES, ...(state.customItems.length ? [['custom', '自分で足した品目']] : [])];

/* ---------- 保存（打っている間はまとめて、0.4秒止まったら保存） ---------- */
const pending = new Map();
let saveTimer = null;
export function touch(p) {
  p.updatedAt = Date.now();
  pending.set(p.id, p);
  setSave('busy');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
}
export async function flush() {
  clearTimeout(saveTimer);
  const list = [...pending.values()];
  pending.clear();
  try {
    for (const p of list) await store.putProject(p);
    setSave('ok');
  } catch (e) {
    list.forEach(p => pending.set(p.id, p));
    setSave('bad', e.message);
    toast(e.message, { bad: true });
  }
}
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

function setSave(kind, msg) {
  const el = document.getElementById('savestate');
  if (!el) return;
  el.className = 'savestate ' + (kind === 'ok' ? '' : kind);
  const d = new Date();
  el.innerHTML = `<i></i>${kind === 'busy' ? '保存しています' : kind === 'bad' ? '保存できませんでした' : `保存しました ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`}`;
  if (msg) el.title = msg;
}

export async function saveSettings() {
  try { await store.setKV('settings', state.settings); }
  catch (e) { toast(e.message, { bad: true }); }
}
export async function saveKV(key, val) {
  try { await store.setKV(key, val); }
  catch (e) { toast(e.message, { bad: true }); throw e; }
}

export function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme === 'light' ? 'light' : 'dark';
  try { localStorage.setItem('kaku2-theme', document.documentElement.dataset.theme); } catch (e) { /* 表示の記憶だけなので、できなくても動く */ }
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = state.settings.theme === 'light' ? '#f3f4f6' : '#0c1016';
}

/* ---------- 画面の切り替え（#/ … のハッシュで） ---------- */
export function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
function parse() {
  const h = location.hash.replace(/^#\/?/, '').split('/');
  if (h[0] === 'p' && h[1]) return { name: 'project', id: decodeURIComponent(h[1]), step: Number(h[2]) || 1 };
  if (h[0] === 'projects') return { name: 'projects' };
  if (h[0] === 'master') return { name: 'master' };
  if (h[0] === 'settings') return { name: 'settings' };
  if (h[0] === 'help') return { name: 'help' };
  return { name: 'home' };
}

const views = {};
export function registerView(name, fn) { views[name] = fn; }

const NAV = [
  ['home', '#/', 'home', 'ホーム'],
  ['projects', '#/projects', 'folder', '案件'],
  ['master', '#/master', 'tag', '単価マスター'],
  ['settings', '#/settings', 'gear', '設定']
];

function shell() {
  const r = state.route.name === 'project' ? 'projects' : state.route.name;
  $('#side').innerHTML = `
    <div class="brand"><div class="logo">K</div><div><b>KAKU</b><small>見積もりワークスペース</small></div></div>
    ${NAV.map(([k, h, ic, t]) => `<a class="nav ${r === k ? 'on' : ''}" href="${h}">${icon(ic)}${t}</a>`).join('')}
    <div class="sep"></div>
    <div class="lab">前のKAKU</div>
    <a class="nav" href="./old/" title="照明・器具・3Dは新しい画面の「図面」に移りました。前の画面は、前に作った案件を見る時だけ使います">${icon('layers')}前の画面（見るだけ）</a>
    <a class="nav ${r === 'help' ? 'on' : ''}" href="#/help">${icon('help')}使い方</a>
    <div class="foot">KAKU ${APP_VERSION}（${APP_DATE}）</div>`;
  $('#bottom').innerHTML = NAV.map(([k, h, ic, t]) => `<a class="${r === k ? 'on' : ''}" href="${h}">${icon(ic)}${t === '単価マスター' ? '単価' : t}</a>`).join('');
}

export function setTop(title, right = '') {
  $('#top').innerHTML = `<h1>${esc(title)}</h1><span id="savestate" class="savestate"><i></i>保存しました</span>${right}
    <button class="iconbtn" id="themeBtn" aria-label="明るさの切り替え" title="暗い表示／明るい表示">${icon(state.settings.theme === 'light' ? 'moon' : 'sun')}</button>`;
  $('#themeBtn').onclick = () => {
    state.settings.theme = state.settings.theme === 'light' ? 'dark' : 'light';
    applyTheme(); saveSettings(); setTop(title, right);
  };
}

export async function render() {
  state.route = parse();
  shell();
  const v = views[state.route.name] || views.home;
  const el = $('#view');
  try {
    await v(el, state.route);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="card"><h2>画面を表示できませんでした</h2><p class="muted">${esc(e.message)}</p><a class="btn" href="#/">ホームに戻る</a></div>`;
    showError('画面の表示でエラーが起きました：' + e.message);
  }
  if (!state.route.keepScroll) window.scrollTo(0, 0);
}

export function findProject(id) { return state.projects.find(p => p.id === id); }

export function newProject(extra = {}) {
  const now = Date.now();
  const p = {
    id: store.uid('p'), name: '', customer: '', address: '', person: '', tel: '',
    number: nextNumber(), expiry: '発行日より30日', issueDate: '',
    overheadPct: state.settings.overheadPct || 0, profitPct: state.settings.profitPct || 0, discount: 0, taxRate: '',
    status: 'draft', rooms: [], lines: [], history: [], memo: '', note: '',
    createdAt: now, updatedAt: now, ...extra
  };
  state.projects.unshift(p);
  touch(p);
  return p;
}
function nextNumber() {
  const d = new Date();
  const base = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const n = state.projects.filter(p => String(p.number || '').startsWith(base)).length + 1;
  return `${base}-${String(n).padStart(3, '0')}`;
}

export async function removeProject(p) {
  state.projects = state.projects.filter(x => x.id !== p.id);
  pending.delete(p.id);
  await store.deleteProject(p.id);
}
export async function restoreProject(p) {
  state.projects.unshift(p);
  await store.putProject(p);
}

export async function reload() {
  state.projects = (await store.listProjects()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  state.settings = { ...SETTINGS0, ...(await store.getKV('settings', {})) };
  state.company = await store.getKV('company', {});
  state.priceOverrides = await store.getKV('priceOverrides', {});
  state.customItems = await store.getKV('customItems', []);
}

export async function boot() {
  window.addEventListener('error', e => showError('エラーが起きました：' + (e.message || e.error)));
  window.addEventListener('unhandledrejection', e => showError('エラーが起きました：' + (e.reason && e.reason.message || e.reason)));
  try {
    const moved = await store.migrateOnce();
    await reload();
    applyTheme();
    if (moved) toast(`前のKAKUの案件を ${moved} 件引き継ぎました`);
    store.persist().then(ok => { state.persisted = ok; });
  } catch (e) {
    showError(e.message);
    state.settings = { ...SETTINGS0 };
    applyTheme();
  }
  window.addEventListener('hashchange', render);
  await render();
}
