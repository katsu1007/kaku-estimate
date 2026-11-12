/* 画面の共通部品：アイコン・数字の表示・知らせ・確認の窓 */

const P = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  folder: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2l2 2.2h8.8A1.5 1.5 0 0 1 21 9.7v8.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
  tag: '<path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1.4 1.4 0 0 1 0 2l-7.1 7.1a1.4 1.4 0 0 1-2 0z"/><circle cx="8" cy="8" r="1.6"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M4.2 7.5l2.3 1.3M17.5 15.2l2.3 1.3M4.2 16.5l2.3-1.3M17.5 8.8l2.3-1.3"/><circle cx="12" cy="12" r="7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
  checkc: '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.7 2.7L16.2 9.5"/>',
  alert: '<path d="M12 3.5 21.5 20h-19z"/><path d="M12 10v4.5M12 17.4v.1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
  down: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  up: '<path d="M12 16V5M7 9.5l5-5 5 5M5 20h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  room: '<rect x="3.5" y="4.5" width="17" height="15" rx="1"/><path d="M3.5 12h7v7.5M14 4.5v5"/>',
  list: '<path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12"/><circle cx="4.5" cy="6.5" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="17.5" r="1"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.7 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.8 7.5-9.5V6z"/><path d="m8.8 12 2.3 2.3 4.2-4.3"/>',
  print: '<path d="M7 8V3.5h10V8M7 17H4.5v-7.5a1.5 1.5 0 0 1 1.5-1.5h12a1.5 1.5 0 0 1 1.5 1.5V17H17"/><path d="M7 14h10v6.5H7z"/>',
  grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.5h17M3.5 15h17M9.5 9.5v11M15 9.5v11"/>',
  layers: '<path d="m12 3.5 9 4.8-9 4.8-9-4.8z"/><path d="m3 12.2 9 4.8 9-4.8M3 16l9 4.8 9-4.8"/>',
  cube: '<path d="m12 2.8 8.5 4.8v9.2L12 21.6l-8.5-4.8V7.6z"/><path d="m3.5 7.6 8.5 4.8 8.5-4.8M12 12.4v9.2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.6M12 16.8v.1"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5M12 8v4.5l3 2"/>',
  compare: '<path d="M7 4v16M17 4v16M3.5 8H7M17 8h3.5M3.5 16H7M17 16h3.5M10 12h4"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  excel: '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="m8.5 8.5 7 7M15.5 8.5l-7 7"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1-3.6 4-5.5 7.5-5.5s6.5 1.9 7.5 5.5"/>'
};
export const icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const yen = n => '¥' + Math.round(Number(n) || 0).toLocaleString('ja-JP');
export const fmt = (n, d = 2) => (Number(n) || 0).toLocaleString('ja-JP', { maximumFractionDigits: d });
export const pct = n => (Number(n) || 0).toFixed(1) + '%';
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function when(t) {
  if (!t) return '';
  const d = new Date(t), now = new Date();
  const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return '今日 ' + hm;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return '昨日 ' + hm;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
export const today = () => { const d = new Date(); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; };

let toastTimer = null;
export function toast(msg, opt = {}) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.className = 'toast' + (opt.bad ? ' bad' : '');
  t.innerHTML = `<span>${esc(msg)}</span>` + (opt.action ? `<button type="button">${esc(opt.action)}</button>` : '');
  t.hidden = false;
  if (opt.action) t.querySelector('button').onclick = () => { t.hidden = true; opt.onAction && opt.onAction(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, opt.ms || (opt.action ? 6000 : opt.bad ? 7000 : 2600));
}

/* 画面の上に赤い帯でエラーを出す（黙って失敗しない） */
export function showError(msg) {
  let b = document.getElementById('errbar');
  if (!b) { b = document.createElement('div'); b.id = 'errbar'; b.className = 'errbar'; document.body.appendChild(b); }
  b.innerHTML = `${icon('alert')}<span>${esc(msg)}</span><button type="button">閉じる</button>`;
  b.querySelector('button').onclick = () => b.remove();
}

export function modal({ title, body, foot = '', wide = false, onClose, closable = true }) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}" ${wide ? 'style="width:min(980px,100%)"' : ''}>
    <div class="mh"><h3>${esc(title)}</h3>${closable ? `<button class="iconbtn" data-close aria-label="閉じる">${icon('x')}</button>` : ''}</div>
    <div class="mb">${body}</div>${foot ? `<div class="mf">${foot}</div>` : ''}</div>`;
  const close = () => { bg.remove(); document.removeEventListener('keydown', key); onClose && onClose(); };
  const key = e => { if (e.key === 'Escape' && closable) close(); };
  bg.addEventListener('click', e => { if ((e.target === bg && closable) || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', key);
  document.body.appendChild(bg);
  return { el: bg, close };
}

export function ask(title, text, { ok = 'はい', cancel = 'やめる', danger = false } = {}) {
  return new Promise(res => {
    const m = modal({
      title, body: `<p style="margin:0;white-space:pre-wrap">${esc(text)}</p>`,
      foot: `<button class="btn" data-no>${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button>`,
      onClose: () => res(false)
    });
    m.el.querySelector('[data-no]').onclick = () => { m.close(); };
    m.el.querySelector('[data-ok]').onclick = () => { res(true); m.el.remove(); };
  });
}

export function download(blob, name) {
  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.share) { share(blob, name); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
/* iPhone ではファイルを「共有」から保存できるようにする（できなければダウンロード） */
export async function share(blob, name) {
  /* iPhoneアプリの中：アプリの共有メニューに渡す（ブラウザのダウンロードはアプリでは動かないため） */
  const H = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.share;
  if (H) {
    const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
    H.postMessage({ name, b64 });
    return;
  }
  try {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad/.test(navigator.userAgent)) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  download(blob, name);
}

/* 品目の検索：空白で区切った言葉が全部入っている物（例「HIVP 20」）。全角・半角の違いは無視 */
const norm = t => String(t || '').normalize('NFKC').toLowerCase();
export function matchItem(it, q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm(it.name + ' ' + (it.spec || ''));
  /* 数字は数字として一致（「50」で「150」や「50.5」を出さない） */
  return words.every(w => /^\d+(\.\d+)?$/.test(w)
    ? new RegExp('(^|[^\\d.])' + w.replace('.', '\\.') + '(?![\\d.])').test(hay)
    : hay.includes(w));
}
