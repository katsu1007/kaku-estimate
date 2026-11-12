/* 保存先フォルダ（会社の OneDrive など）と揃える時の決め方。画面や保存場所に触らない計算だけ。
 * 案件ごとに「前に揃えた時の更新日時」（base）を覚えておき、この端末（local）とフォルダ（remote）のどちらが変わったかで決める。
 *  - 片方にしか無い：無い方へ写す（ただし前に揃えたことがあって端末に無い＝端末で消した案件は、フォルダから戻さない）
 *  - 同じ：何もしない
 *  - 片方だけ変わった：変わった方に合わせる
 *  - 両方変わった（または前に揃えた記録が無くて違う）：聞く */
export function syncPlan(local, remote, base) {
  const L = new Map(local.map(p => [p.id, p])), R = new Map(remote.map(p => [p.id, p]));
  const ids = [...new Set([...L.keys(), ...R.keys()])];
  const out = { push: [], pull: [], ask: [], same: [], skipDeleted: [] };
  ids.forEach(id => {
    const l = L.get(id), r = R.get(id), b = base[id] && base[id].at;
    if (l && !r) { out.push.push(id); return; }
    if (!l && r) { if (b != null) out.skipDeleted.push(id); else out.pull.push(id); return; }
    const lu = l.updatedAt || 0, ru = r.updatedAt || 0;
    if (lu === ru) { out.same.push(id); return; }
    if (b != null && lu === b) { out.pull.push(id); return; }
    if (b != null && ru === b) { out.push.push(id); return; }
    out.ask.push(id);
  });
  return out;
}

/* ファイルの名前：最初に書いた時の名前をずっと使う（案件名を変えても同じファイルに書く） */
export const safeName = s => String(s || '案件').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 40) || '案件';
export const projectFile = p => `${safeName(p.name)}_${p.id}.kaku.json`;
export const COMPANY_FILE = '_KAKU_会社の設定.kaku.json';

/* 会社で同じにする設定（端末ごとの物：表示の明るさ・案内を見たか・前回のバックアップ日は入れない） */
const LOCAL_ONLY = ['theme', 'noticeSeen', 'introSeen', 'lastBackup'];
export function companyPack(kv) {
  const settings = { ...(kv.settings || {}) }; LOCAL_ONLY.forEach(k => delete settings[k]);
  return { company: kv.company || {}, priceOverrides: kv.priceOverrides || {}, customItems: kv.customItems || [], settings };
}
/* 中身が同じか比べるための短い印（並び順に左右されないように、キーを並べ替えて文字にする） */
export function sig(o) {
  const st = v => Array.isArray(v) ? '[' + v.map(st).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + st(v[k])).join(',') + '}' : JSON.stringify(v);
  const s = st(o); let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + ':' + s.length;
}
/* 会社の設定の決め方（中身の印で比べる） */
export function companyPlan(localSig, remoteSig, baseSig) {
  if (!remoteSig) return 'push';
  if (localSig === remoteSig) return 'same';
  if (baseSig && localSig === baseSig) return 'pull';
  if (baseSig && remoteSig === baseSig) return 'push';
  return 'ask';
}
