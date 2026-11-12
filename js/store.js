/* 保存（IndexedDB）。失敗は必ず呼び出し元に投げる（黙って捨てない）。
 * projects：案件 1件1レコード ／ kv：設定・会社情報・単価マスターの変更など */
const DB_NAME = 'kaku';
const DB_VER = 1;
export const DATA_VERSION = 1;
const OLD_KEY = 'kaku-estimate-v1';

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) { reject(new Error('この端末では保存の機能（IndexedDB）が使えません。')); return; }
    const rq = indexedDB.open(DB_NAME, DB_VER);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(new Error('保存場所を開けませんでした：' + (rq.error && rq.error.message)));
    rq.onblocked = () => reject(new Error('別のタブでKAKUが開いています。ほかのタブを閉じてください。'));
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then(r => { result = r; }, reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(new Error(quotaMsg(t.error)));
    t.onabort = () => reject(new Error(quotaMsg(t.error)));
  }));
}
const quotaMsg = e => e && e.name === 'QuotaExceededError'
  ? '端末の保存容量がいっぱいです。バックアップを書き出してから、使わない案件や写真を消してください。'
  : '保存できませんでした：' + (e && e.message || '原因不明');
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const listProjects = () => tx('projects', 'readonly', s => req(s.getAll()));
export const getProject = id => tx('projects', 'readonly', s => req(s.get(id)));
export const putProject = p => tx('projects', 'readwrite', s => req(s.put({ ...p, dataVersion: DATA_VERSION })));
export const deleteProject = id => tx('projects', 'readwrite', s => req(s.delete(id)));
export const getKV = (k, d) => tx('kv', 'readonly', s => req(s.get(k))).then(v => v === undefined ? d : v);
export const setKV = (k, v) => tx('kv', 'readwrite', s => req(s.put(v, k)));

/* ブラウザに勝手に消されないように申請する（結果は設定画面に出す） */
export async function persist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted();
      return already || await navigator.storage.persist();
    }
  } catch (e) { /* 申請できない端末：設定画面に「申請できない」と出すため false を返す */ }
  return false;
}

export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* 今までのKAKU（localStorage）の案件を読み替える。元のデータは消さない（前の画面でも使えるように） */
export function convertOld(list) {
  if (!Array.isArray(list)) return [];
  const n = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
  return list.map(p => {
    const rooms = (p.rooms || []).map(r => {
      const free = !!(r.plan || n(r.area) > 0);
      return {
        id: uid('r'), name: r.name || '部屋',
        shape: free ? 'free' : 'rect',
        w: free ? '' : n(r.w), d: free ? '' : n(r.h),
        area: free ? n(r.area) : '', perim: free ? n(r.peri) : '',
        h: n(r.ch) > 0 ? n(r.ch) : '', qty: Math.max(1, Math.round(n(r.qty) || 1)),
        doors: Math.max(0, Math.round(n(r.door))), winCount: Math.max(0, Math.round(n(r.win))), windows: []
      };
    });
    const lines = (p.items || []).map(it => ({
      id: uid('l'), name: it.desc || '', spec: '', unit: it.unit || '式', kind: 'other',
      qty: n(it.qty), price: n(it.price), cost: '', loss: '', sheet: 0, basis: null, cat: ''
    }));
    const now = Date.now();
    return {
      id: 'old-' + p.id, name: p.name || '名称未設定',
      customer: p.customer || '', address: p.address || '', person: p.person || '',
      number: p.number || '', expiry: p.expiry || '発行日より30日',
      overheadPct: n(p.overhead), profitPct: n(p.profit), discount: 0, taxRate: '',
      status: 'draft', rooms, lines, history: [], memo: '前のKAKUから引き継いだ案件です。図面から選んだ工事は前の画面で確かめてください。',
      createdAt: typeof p.id === 'number' ? p.id : now, updatedAt: now, migrated: true
    };
  });
}

/* 前のKAKU（localStorage）の案件をもう一度取り込む。同じ案件は上書き（id が old-○○ で同じになる） */
export async function reimportOld() {
  let raw = null;
  try { raw = localStorage.getItem(OLD_KEY); } catch (e) { throw new Error('前のKAKUのデータを読めませんでした：' + e.message); }
  if (!raw) return 0;
  const list = convertOld(JSON.parse(raw));
  for (const p of list) await putProject(p);
  return list.length;
}

export async function migrateOnce() {
  if (await getKV('migratedOld', false)) return 0;
  let raw = null;
  try { raw = localStorage.getItem(OLD_KEY); } catch (e) { raw = null; }
  let list = [];
  if (raw) {
    try { list = convertOld(JSON.parse(raw)); }
    catch (e) { throw new Error('前のKAKUのデータを読めませんでした：' + e.message); }
  }
  /* 前のKAKUの見本（新規案件・養生清掃・既存仕上げ撤去の初期値のまま）は引き継がない */
  list = list.filter(p => !(p.name === '新規案件' && !p.customer && p.lines.length === 2 && p.lines[0].name === '養生・清掃' && p.lines[0].price === 12000));
  for (const p of list) await putProject(p);
  await setKV('migratedOld', true);
  return list.length;
}

/* まるごとバックアップ */
export async function exportAll() {
  const projects = await listProjects();
  const kv = {};
  await tx('kv', 'readonly', s => new Promise((res, rej) => {
    const c = s.openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { kv[cur.key] = cur.value; cur.continue(); } else res(); };
    c.onerror = () => rej(c.error);
  }));
  return { app: 'KAKU', dataVersion: DATA_VERSION, exportedAt: new Date().toISOString(), projects, kv };
}

export async function importAll(obj, mode = 'merge') {
  /* 前のKAKUの「まるごとバックアップ」（kind:'backup'、data に localStorage の中身） */
  if (obj && obj.app === 'KAKU' && obj.kind === 'backup' && obj.data) {
    let arr;
    try { arr = JSON.parse(obj.data['kaku-estimate-v1'] || '[]'); }
    catch (e) { throw new Error('前のKAKUのバックアップの中身を読めませんでした。'); }
    return importOldArray(arr);
  }
  if (!obj || obj.app !== 'KAKU' || !Array.isArray(obj.projects)) {
    if (Array.isArray(obj)) return importOldArray(obj);
    throw new Error('KAKUのバックアップファイルではありません。');
  }
  if (mode === 'replace') { for (const p of await listProjects()) await deleteProject(p.id); }
  for (const p of obj.projects) await putProject(p);
  for (const [k, v] of Object.entries(obj.kv || {})) if (k !== 'migratedOld') await setKV(k, v);
  return obj.projects.length;
}
async function importOldArray(arr) {
  const list = convertOld(arr);
  for (const p of list) await putProject(p);
  return list.length;
}
