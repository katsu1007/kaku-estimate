/* 保存先フォルダ（会社の OneDrive・Googleドライブ・iCloud など）。
 *  - iPhoneアプリ：アプリにフォルダを選んでもらい、保存のたびに自動で書く（kakuFolder）
 *  - パソコンの Chrome・Edge：フォルダを選んでもらい、保存のたびに自動で書く（showDirectoryPicker）
 *  - Safari など：共有メニューで「ファイルに保存」、読む時は「ファイルから読み込む」
 * 案件1つにつき2つ：KAKUが読む「案件名_ID.kaku.json」と、人が見る「案件名_ID.xlsx」（iPhoneのファイルアプリでも開ける） */
import * as store from './store.js';
import { syncPlan, projectFile, COMPANY_FILE, companyPack, sig } from './syncplan.js';
import { projectXlsx } from './export.js';
import { ask, toast } from './ui.js';

const H = () => window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.kakuFolder;
export const mode = () => H() ? 'app' : ('showDirectoryPicker' in window && !window.__noFS ? 'fs' : 'share');

const b64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });

/* ---------- 保存場所ごとの読み書き ---------- */
let dirH = null;
async function fsDir(prompt) {
  const h = dirH || (dirH = await store.getKV('syncDir', null)); if (!h) return null;
  let p = await h.queryPermission({ mode: 'readwrite' });
  if (p !== 'granted' && prompt) p = await h.requestPermission({ mode: 'readwrite' });
  return p === 'granted' ? h : null;
}
export async function folderName() {
  if (mode() === 'app') { try { return await H().postMessage({ op: 'status' }); } catch (e) { return null; } }
  if (mode() === 'fs') { const h = dirH || (dirH = await store.getKV('syncDir', null)); return h ? h.name : null; }
  return null;
}
export async function pickFolder() {
  if (mode() === 'app') return H().postMessage({ op: 'pick' });
  const h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'kaku' });
  dirH = h; await store.setKV('syncDir', h); return h.name;
}
async function writeFile(name, data, prompt = false) {
  if (mode() === 'app') return H().postMessage(typeof data === 'string' ? { op: 'write', name, text: data } : { op: 'write', name, b64: await b64(data) });
  const d = await fsDir(prompt); if (!d) throw new Error('保存先のフォルダに書く許可がありません。設定の「フォルダと揃える」を押してください。');
  const fh = await d.getFileHandle(name, { create: true }), w = await fh.createWritable();
  await w.write(data); await w.close();
}
async function listFiles(prompt = true) {
  if (mode() === 'app') return (await H().postMessage({ op: 'list' })) || [];
  const d = await fsDir(prompt); if (!d) throw new Error('保存先のフォルダを読む許可がありませんでした。');
  const out = [];
  for await (const [name, fh] of d.entries()) if (fh.kind === 'file' && name.endsWith('.kaku.json')) out.push({ name, text: await (await fh.getFile()).text() });
  return out;
}

/* 何も入っていない案件（名前・お客様・部屋・明細が無い）はフォルダに書かない */
const empty = p => !p.name && !p.customer && !(p.rooms || []).length && !(p.lines || []).length && !p.drawing;
/* ---------- 前に揃えた時の記録 ---------- */
const getState = async () => ({ projects: {}, company: null, ...(await store.getKV('syncState', {})) });
const setState = s => store.setKV('syncState', s);
const kvAll = async () => ({ company: await store.getKV('company', {}), priceOverrides: await store.getKV('priceOverrides', {}), customItems: await store.getKV('customItems', []), settings: await store.getKV('settings', {}) });

const projectJson = p => JSON.stringify({ app: 'KAKU', kind: 'project', dataVersion: store.DATA_VERSION, savedAt: new Date().toISOString(), project: p });
const companyJson = pack => JSON.stringify({ app: 'KAKU', kind: 'company', dataVersion: store.DATA_VERSION, savedAt: new Date().toISOString(), ...pack });

async function writeProject(p, st, opt, prompt) {
  const file = (st.projects[p.id] && st.projects[p.id].file) || projectFile(p);
  await writeFile(file, projectJson(p), prompt);
  try { await writeFile(file.replace(/\.kaku\.json$/, '.xlsx'), projectXlsx(p, opt), prompt); } catch (e) { console.warn('見る用のExcelを書けませんでした', e); }
  st.projects[p.id] = { at: p.updatedAt || 0, file };
}

/* ---------- 保存のたびに自動で書く（フォルダを選んである時だけ） ---------- */
let autoT = null; const autoQ = new Map(); let autoOpt = null, warned = false;
export function autoSave(list, opt) {
  if (mode() === 'share' || !list.length) return;
  list.forEach(p => autoQ.set(p.id, p)); autoOpt = opt;
  clearTimeout(autoT);
  autoT = setTimeout(async () => {
    if (!(await folderName())) return;
    const st = await getState(), q = [...autoQ.values()]; autoQ.clear();
    if (!st.ready) return;   // この端末で1回「揃える」をするまでは自動で書かない（空の案件や設定でフォルダを上書きしないため）
    try { for (const p of q) if (!empty(p)) await writeProject(p, st, autoOpt, false); await setState(st); warned = false; }
    catch (e) { if (!warned) { warned = true; toast('保存先のフォルダに書けませんでした：' + (e.message || e), { bad: true, ms: 5000 }); } }
  }, 2500);
}
export async function autoCompany() {
  if (mode() === 'share' || !(await folderName())) return;
  if (!(await getState()).ready) return;
  try { const pack = companyPack(await kvAll()); await writeFile(COMPANY_FILE, companyJson(pack)); const st = await getState(); st.company = sig(pack); await setState(st); }
  catch (e) { /* 次に揃える時に書く */ }
}

/* ---------- 揃える（フォルダ、または選んだファイルの中身と） ---------- */
function parse(files) {
  const projects = [], fileOf = {}; let company = null;
  files.forEach(f => {
    let o; try { o = JSON.parse(f.text); } catch (e) { return; }
    if (!o || o.app !== 'KAKU') return;
    if (o.kind === 'project' && o.project && o.project.id) { const old = projects.find(x => x.id === o.project.id); if (!old || (o.project.updatedAt || 0) > (old.updatedAt || 0)) { if (old) projects.splice(projects.indexOf(old), 1); projects.push(o.project); fileOf[o.project.id] = f.name; } }
    if (o.kind === 'company') company = o;
  });
  return { projects, company, fileOf };
}
const when = t => t ? new Date(t).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/* files を渡すとそれと揃える（Safari の読み込み。書き戻しはしない）。渡さなければ保存先のフォルダと揃える */
export async function syncNow(local, opt, files = null) {
  const readOnly = !!files;
  const R = parse(files || await listFiles(true));
  const st = await getState(), base = st.projects;
  local = local.filter(p => !empty(p));
  const plan = syncPlan(local, R.projects, base);
  const L = new Map(local.map(p => [p.id, p])), Rm = new Map(R.projects.map(p => [p.id, p]));
  const res = { pulled: [], pushed: 0, kept: plan.skipDeleted.length, asked: 0 };
  for (const id of plan.ask) {
    const l = L.get(id), r = Rm.get(id); res.asked++;
    const takeRemote = await ask(`「${l.name || '案件'}」をどちらにしますか？`, `この端末とフォルダの両方で直されています。\nこの端末：${when(l.updatedAt)}\nフォルダ：${when(r.updatedAt)}`, { ok: 'フォルダの方にする', cancel: 'この端末の方にする' });
    (takeRemote ? plan.pull : plan.push).push(id);
  }
  for (const id of plan.pull) { const r = Rm.get(id); await store.putProject(r); res.pulled.push(r); st.projects[id] = { at: r.updatedAt || 0, file: R.fileOf[id] || (base[id] && base[id].file) || projectFile(r) }; }
  if (!readOnly) for (const id of plan.push) { await writeProject(L.get(id), st, opt, true); res.pushed++; }
  if (!readOnly) plan.same.forEach(id => { st.projects[id] = { at: L.get(id).updatedAt || 0, file: R.fileOf[id] || projectFile(L.get(id)) }; });
  /* 会社の設定（単価・会社情報・計算の決まり） */
  const lp = companyPack(await kvAll()), ls = sig(lp);
  if (R.company) {
    const rp = { company: R.company.company, priceOverrides: R.company.priceOverrides, customItems: R.company.customItems, settings: R.company.settings };
    const rs = sig(rp);
    const blank = !st.company && !(lp.company && lp.company.name) && !Object.keys(lp.priceOverrides || {}).length && !(lp.customItems || []).length;
    let take = rs !== ls && (blank || st.company === ls || (st.company !== rs && await ask('会社の設定（単価・会社情報）をどちらにしますか？', 'この端末とフォルダで違っています。', { ok: 'フォルダの方にする', cancel: 'この端末の方にする' })));
    if (take) {
      const cur = await store.getKV('settings', {});
      await store.setKV('company', rp.company || {}); await store.setKV('priceOverrides', rp.priceOverrides || {}); await store.setKV('customItems', rp.customItems || []);
      await store.setKV('settings', { ...(rp.settings || {}), theme: cur.theme, noticeSeen: cur.noticeSeen, introSeen: cur.introSeen, lastBackup: cur.lastBackup });
      st.company = rs; res.company = 'pull';
    } else if (!readOnly && rs !== ls) { await writeFile(COMPANY_FILE, companyJson(lp), true); st.company = ls; res.company = 'push'; }
    else st.company = rs === ls ? ls : st.company;
  } else if (!readOnly) { await writeFile(COMPANY_FILE, companyJson(lp), true); st.company = ls; res.company = 'push'; }
  if (!readOnly) st.ready = true;
  await setState(st);
  return res;
}

/* Safari など：共有メニューで、案件（KAKU用と見る用のExcel）と会社の設定を渡す */
export async function shareFiles(list, opt) {
  const files = [];
  for (const p of list.filter(p => !empty(p))) {
    const n = projectFile(p);
    files.push(new File([projectJson(p)], n, { type: 'application/json' }));
    files.push(new File([projectXlsx(p, opt)], n.replace(/\.kaku\.json$/, '.xlsx'), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  files.push(new File([companyJson(companyPack(await kvAll()))], COMPANY_FILE, { type: 'application/json' }));
  if (navigator.canShare && navigator.canShare({ files })) { await navigator.share({ files, title: 'KAKU' }); return files.length; }
  /* 共有できない時は1つずつダウンロード */
  for (const f of files) { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); await new Promise(r => setTimeout(r, 300)); }
  return files.length;
}
