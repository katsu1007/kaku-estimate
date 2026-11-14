/* この図面の電気を数える（前のKAKUの KE_*）。
 * 電気屋さんが書き込んだ図面（JWW・DXF）から、レイヤーの役割を決めて、器具を形・部品ごとに数え、配線の長さを出す。
 * 数え方は前のKAKUのコードをそのまま裏で動かす（精度を変えないため）。画面と見積もりへの入れ方だけ新しくした。 */
import { getReader } from './legacy.js';
import { masterItems } from './app.js';
import { icon, esc, toast } from './ui.js';
import { LABOR } from './place.js';

const ROLES = [['arch', '建築（壁など）'], ['dev', '電気の器具'], ['wire', '配線'], ['both', '器具と配線が同じ'], ['old', '撤去・既存（数えない）'], ['furn', '家具・機器（数えない）'], ['frame', '図枠・表題'], ['off', '使わない']];

/* 図面を読んで数える。前に直したレイヤーの役割（この案件・この端末）も使う */
async function readElec(file, saved) {
  const W = await getReader();
  const G = c => W.eval(c);
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!/^(dxf|jww|jwc)$/.test(ext)) throw new Error('電気を数えられるのは JWW・DXF だけです');
  const buf = await file.arrayBuffer();
  let R;
  if (ext === 'dxf') { let s; try { s = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { s = new TextDecoder('shift_jis').decode(buf); } R = W.KE_parseDXF(s); }
  else R = await W.KE_parseJWW(buf);
  W.KE_scaleUnits(R);
  W.__keR = R; W.__keName = file.name;
  G('KE={name:__keName,ents:__keR.ents,ltab:__keR.ltab||{}};KE.layers=KE_classify(KE.ents,KE.ltab);');
  /* 前のKAKUの KE_memApply と同じ（この端末で直した役割）。この案件で前に決めた役割があれば、それを優先 */
  const m = W.KE_mem(); let n = 0;
  const L = G('KE.layers');
  Object.entries(L).forEach(([k, o]) => { o.auto = o.role; if (m.roles[k] && m.roles[k] !== o.role) { o.role = m.roles[k]; o.why = '前に直した内容'; n++; } });
  if (saved && saved.file === file.name && saved.roles) Object.keys(saved.roles).forEach(k => { if (L[k]) L[k].role = saved.roles[k]; });
  G('delete window.__keR;KE_analyze()');
  return { W, G, memUsed: n };
}

export async function openElec(p, { onApply }) {
  const pickFile = () => new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.jww,.jwc,.dxf'; i.onchange = () => res(i.files[0] || null); i.click(); });
  const file = await pickFile(); if (!file) return;
  toast('電気の図面を読んでいます…');
  let X;
  try { X = await readElec(file, p.elec); } catch (e) { toast('読み込めませんでした：' + e.message, { bad: true }); return; }
  const { W, G } = X;
  const items = masterItems().filter(i => ['elec', 'fix', 'labor', 'plumb'].includes(i.cat));
  const wires = masterItems().filter(i => i.cat === 'wire');
  const prev = p.elec && p.elec.file === file.name ? p.elec : null;
  const mem = W.KE_mem();
  const st = { map: {}, cable: prev ? prev.cable : 'e-v16-2', extra: prev && prev.extra != null ? prev.extra : 10, hl: undefined };

  const root = document.createElement('div');
  root.className = 'sksheet kesheet';
  document.body.appendChild(root); document.documentElement.style.overflow = 'hidden';
  const close = () => { root.remove(); document.documentElement.style.overflow = ''; G('KE=null'); };

  const types = () => G('KE.res.types.map((t,k)=>({k,key:t.key,desc:KE_describe(t),count:t.count,legend:t.legend,icon:KE_icon(t.sample),guess:KE_guessItem(t)}))');
  const choice = t => st.map[t.key] !== undefined ? st.map[t.key] : prev && prev.map && prev.map[t.key] !== undefined ? prev.map[t.key] : mem.maps[t.key] !== undefined ? mem.maps[t.key] : (t.guess || '');
  function paint() {
    const T = types(), R = G('({w:KE.res.wiresM,by:KE.res.byLy})'), L = G('KE.layers');
    T.forEach(t => { if (st.map[t.key] === undefined) st.map[t.key] = choice(t); });
    const opt = sel => `<option value="">見積もりに入れない</option>` + items.map(i => `<option value="${esc(i.id)}" ${i.id === sel ? 'selected' : ''}>${esc(i.name)}${i.spec ? ' ' + esc(i.spec) : ''}</option>`).join('');
    const total = T.reduce((s, t) => s + (st.map[t.key] ? t.count : 0), 0);
    root.innerHTML = `<div class="skhead"><b>この図面の電気を数える</b><span class="small muted">${esc(file.name)}</span><span class="spacer"></span><button class="btn sm ghost" data-a="close">閉じる</button></div>
      <div class="kebody">
        <div class="kemain"><div class="keplan">${G(`KE_planSVG(${st.hl === undefined ? '' : st.hl})`)}</div>
          <p class="small muted">丸の色は器具の種類。点線の丸は凡例・建物の外・撤去なので数えていません。青い線が配線です。</p></div>
        <div class="keside">
          <p class="small muted">レイヤーの役割を自動で決めています。違う時は直してください（直すと数え直します）。直した内容はこの端末で覚えて、次の図面から自動で使います。${X.memUsed ? `（今回 ${X.memUsed} 個のレイヤーに前に直した内容を使いました）` : ''}</p>
          <details class="card" style="padding:10px"><summary class="small"><b>レイヤー（${Object.keys(L).length}）</b></summary>
            <div style="display:grid;gap:6px;margin-top:8px">${Object.entries(L).map(([n, o]) => `<div class="row small" style="gap:6px"><span style="flex:1;min-width:120px;word-break:break-all"><b>${esc(n)}</b> <span class="muted">${o.stat.n}個${o.stat.ins ? '・部品' + o.stat.ins : ''}${o.why ? '・' + esc(o.why) : ''}</span></span><select class="in" data-ly="${esc(n)}" style="width:auto;min-height:36px">${ROLES.map(([k, t]) => `<option value="${k}" ${o.role === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`).join('')}
            <button class="btn sm ghost" data-a="memClear">覚えた内容を消す</button></div></details>
          <b class="small">器具（同じ形・同じ部品ごと）</b>
          <div style="display:grid;gap:8px">${T.map(t => `<div class="ketype"><button class="keshow ${st.hl === t.k ? 'on' : ''}" data-hl="${t.k}" aria-label="図で見る">${t.icon}</button>
            <div style="min-width:0"><b class="small">${esc(t.desc)}</b><div class="small muted">${t.count}個${t.legend ? `（凡例・建物の外・撤去の ${t.legend} 個は数えていません）` : ''}</div>
            <select class="in" data-key="${esc(t.key)}" style="min-height:36px;margin-top:4px">${opt(st.map[t.key])}</select></div><b class="kecount">${t.count}</b></div>`).join('') || '<p class="small muted">電気の器具が見つかりませんでした。レイヤーの役割を確かめてください。</p>'}</div>
          <b class="small">配線</b>
          <div class="card" style="padding:10px;display:grid;gap:6px"><b>${R.w.toFixed(2)} m</b><span class="small muted">${Object.entries(R.by).map(([n, v]) => esc(n) + ' ' + (v / 1000).toFixed(2) + 'm').join('　') || '配線のレイヤーがありません'}</span>
            <div class="row" style="gap:8px"><label class="f" style="flex:2">ケーブル<select class="in" id="keCable"><option value="">見積もりに入れない</option>${wires.map(i => `<option value="${esc(i.id)}" ${i.id === st.cable ? 'selected' : ''}>${esc(i.name)} ${esc(i.spec || '')}</option>`).join('')}</select></label>
            <label class="f" style="flex:1">余り<div class="unitwrap"><input class="in num" id="keExtra" type="number" inputmode="numeric" min="0" value="${st.extra}"><span>%</span></div></label></div></div>
          <button class="btn primary" data-a="apply">${icon('check')}この内容で見積もりに入れる（器具 ${total} 個）</button>
          <p class="small muted">図面から自動で数えた目安です。部品の名前や記号の描き方で外れることがあるので、図と数を見比べてから入れてください。入れた後は③工事で数量を直せます。もう一度入れると前の分と入れ替わります。取付の手間も一緒に入ります。</p>
        </div></div>`;
  }
  root.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.ly) { const L = G('KE.layers'); L[t.dataset.ly].role = t.value; G('KE_analyze()'); paint(); return; }
    if (t.dataset.key !== undefined) { st.map[t.dataset.key] = t.value; paint(); return; }
    if (t.id === 'keCable') st.cable = t.value;
    if (t.id === 'keExtra') st.extra = Math.max(0, Number(t.value) || 0);
  });
  root.addEventListener('click', e => {
    const h = e.target.closest('[data-hl]');
    if (h) { const k = +h.dataset.hl; st.hl = st.hl === k ? undefined : k; paint(); return; }
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'close') { close(); return; }
    if (a === 'memClear') { try { localStorage.removeItem('kaku-elec-mem'); } catch (e2) { /* 消せなくても続ける */ } toast('覚えた内容を消しました'); return; }
    if (a === 'apply') {
      const T = types(), R = G('KE.res.wiresM'), L = G('KE.layers');
      const counts = {}; T.forEach(t => { const id = st.map[t.key]; if (id && t.count) counts[id] = (counts[id] || 0) + t.count; });
      const roles = {}, learn = {}; Object.entries(L).forEach(([n, o]) => { roles[n] = o.role; if (o.role !== o.auto) learn[n] = o.role; });
      W.KE_memSave(learn, st.map);
      const n = Object.values(counts).reduce((s, v) => s + v, 0);
      p.elec = { file: file.name, roles, map: { ...st.map }, cable: st.cable, extra: st.extra, counts, wiresM: Math.round(R * 100) / 100, summary: `器具 ${n}個・配線 ${R.toFixed(1)}m` };
      onApply && onApply(); close(); toast(`電気の器具 ${n} 個と配線を見積もりに入れました`);
    }
  });
  paint();
}

/* 見積もりの行（syncDemoLines から呼ぶ） */
export function elecLines(p, add, it) {
  const E = p.elec; if (!E || !E.counts) return;
  Object.keys(E.counts).sort().forEach(k => { add('el|' + k, k, E.counts[k], '電気の図面から数えた数'); const lb = LABOR[k], m = lb && it(lb); if (m && m.kind === 'labor') add('el|on|' + k, lb, E.counts[k], '電気の図面から数えた物の取付'); });
  if (E.cable && E.wiresM > 0) { const q = Math.round(E.wiresM * (1 + (E.extra || 0) / 100) * 10) / 10; add('el|cable', E.cable, q, `電気の図面の配線の長さ（余り${E.extra || 0}%）`); add('el|wire', 'w-eWire', q, '電気の図面の配線'); }
}
