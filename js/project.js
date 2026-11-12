/* 案件の画面：① 現場 → ② 部屋 → ③ 工事 → ④ 確認 → ⑤ 書類 */
import { state, registerView, setTop, go, touch, opts, findProject, masterItems, categories, removeProject, restoreProject, newProject, flush } from './app.js';
import { roomGeom, lineQty, netQty, totals, check, MEASURES, KINDS, isRoomBased, hatsuCalc, hatsuItem, cutItem, ZANDO_F, wallGroup } from './calc.js';
import { SYS, MANY, sysOptions, rebuild, PIPE_LOSS } from './piping.js';
import { importDrawing, groupGeom, planCH, orderFaces as orderFacesOf } from './drawing.js';
import { readWithFixtures, oldFaceLights, roomOpenRuns, FIX_NAMES, FIX_ITEMS, FIX_WORDS } from './legacy.js';
import { planView, roomColor } from './planview.js';
import { USES, DEF_LM, needCount, pitchFor, luxOf, wirePlan, cableQty, pip } from './lighting.js';
import { uid } from './store.js';
import { open3D, applyWin3d } from './view3d.js';
import { openSketch } from './sketchui.js';
import { toPlan as sketchPlan, geomOf } from './sketch.js';
import { jww as jwwBytes, dxf as dxfBytes } from './cad.js';
import { icon, esc, yen, fmt, pct, toast, modal, ask, matchItem, showError, share, $, $$ } from './ui.js';
import { STATUS } from './home.js';
import { docsStep } from './docs.js';

const STEPS = [
  { n: 1, t: '現場', s: 'お客様と現場', lead: 'お客様の名前と現場の住所を入れてください。見積書にそのまま載ります。' },
  { n: 2, t: '部屋', s: '寸法を入れる', lead: '図面がある時は「図面を選ぶ」で読み込んで、区画をタップして部屋にしてください。図面が無い時は「部屋を足す」で幅と奥行（m）を入れてください。床・壁・天井の面積が自動で出ます。' },
  { n: 3, t: '工事', s: '品目を選ぶ', lead: '「一覧から選ぶ」で工事の品目を選んでください。床・壁・天井の品目は、部屋の寸法から数量が自動で入ります（材料はロス込み）。' },
  { n: 4, t: '確認', s: '検算と金額', lead: '計算をもう一度別の方法で確かめ、間違いやすい所を出します。赤い所を直してから書類を作ってください。' },
  { n: 5, t: '書類', s: '見積書を出す', lead: '見積書・請求書・内訳書を作ります。見積書を出すたびに「第○版」として記録が残り、前の版と比べられます。' }
];
const lastFocus = {};

function stepDone(p, n) {
  const o = opts();
  if (n === 1) return !!(p.name && p.customer);
  if (n === 2) return p.rooms.length > 0 && p.rooms.every(r => roomGeom(r, o).floor > 0);
  if (n === 3) return p.lines.length > 0;
  if (n === 4) return p.lines.length > 0 && !check(p, o).some(c => c.level === 'error');
  if (n === 5) return (p.history || []).length > 0;
  return false;
}

registerView('project', async (el, route) => {
  const p = findProject(route.id);
  if (!p) { el.innerHTML = `<div class="empty"><b>案件が見つかりません</b><a class="btn" href="#/projects">案件の一覧へ</a></div>`; setTop('案件'); return; }
  p.rooms = p.rooms || []; p.lines = p.lines || []; p.history = p.history || [];
  const step = Math.min(5, Math.max(1, route.step));
  setTop(p.name || '名前のない案件', `<button class="iconbtn" id="dupBtn" title="この案件を複製">${icon('copy')}</button>`);
  $('#dupBtn').onclick = () => duplicate(p);

  el.innerHTML = `
    <div class="phead">
      <button class="iconbtn" onclick="location.hash='#/projects'" aria-label="案件の一覧へ">${icon('back')}</button>
      <div class="t"><h2 data-out="pname">${esc(p.name || '名前のない案件')}</h2><div class="meta" data-out="pmeta"></div></div>
      <div class="grand"><div class="k">合計（税込）</div><div class="v money" data-out="grand"></div><div class="small muted" data-out="gross"></div></div>
    </div>
    <nav class="steps" id="steps"></nav>
    <div class="lead">${icon('info')}<span>${STEPS[step - 1].lead}</span></div>
    <div id="stepBody"></div>
    <div class="nextbar" id="nextbar"></div>`;

  const body = $('#stepBody');
  const ctx = { p, step, body, refresh: () => refresh(p, step) };
  if (step === 1) stepInfo(ctx);
  if (step === 2) stepRooms(ctx);
  if (step === 3) stepLines(ctx);
  if (step === 4) stepCheck(ctx);
  if (step === 5) docsStep(ctx);

  const nb = $('#nextbar');
  const prev = step > 1 ? `<a class="btn" href="#/p/${encodeURIComponent(p.id)}/${step - 1}">${icon('back')}戻る</a>` : '';
  const next = step < 5 ? `<a class="btn primary big" href="#/p/${encodeURIComponent(p.id)}/${step + 1}">次へ：${STEPS[step].t}${icon('next')}</a>` : '';
  nb.innerHTML = `${prev}<span class="spacer"></span>${next}`;
  refresh(p, step);
  if (lastFocus.id) {
    const t = document.querySelector(`[data-line="${lastFocus.id}"],[data-room="${lastFocus.id}"]`);
    if (t) { t.scrollIntoView({ block: 'center' }); t.style.boxShadow = '0 0 0 3px var(--accent)'; setTimeout(() => { t.style.boxShadow = ''; }, 2200); }
    lastFocus.id = null;
  }
});

function refresh(p, step) {
  const o = opts();
  const t = totals(p, o);
  const set = (k, v) => $$(`[data-out="${k}"]`).forEach(e => { e.innerHTML = v; });
  set('pname', esc(p.name || '名前のない案件'));
  const [lab, cls] = STATUS[p.status] || STATUS.draft;
  set('pmeta', `<span class="pill ${cls}">${lab}</span> ${esc(p.customer || 'お客様 未入力')}${p.address ? '・' + esc(p.address) : ''}${p.number ? '・No.' + esc(p.number) : ''}`);
  set('grand', yen(t.grand));
  set('gross', t.net > 0 ? `粗利 ${yen(t.gross)}（${pct(t.grossPct)}）` : '');
  const errs = check(p, o).filter(c => c.level === 'error').length;
  $('#steps').innerHTML = STEPS.map(s => {
    const done = stepDone(p, s.n);
    const err = s.n === 4 && p.lines.length && errs;
    return `<a class="step ${s.n === step ? 'on' : ''} ${done ? 'done' : ''} ${err ? 'err' : ''}" href="#/p/${encodeURIComponent(p.id)}/${s.n}">
      <span class="n">${done ? icon('check') : err ? '!' : s.n}</span><span><b>${s.t}</b><small>${err ? `要確認 ${errs}` : s.s}</small></span></a>`;
  }).join('');
  $$('.step .n svg').forEach(s => { s.style.width = '16px'; s.style.height = '16px'; });
  /* 部屋のチップ */
  p.rooms.forEach(r => {
    const g = roomGeom(r, o);
    set('room:' + r.id, (g.openAuto ? `<span class="chip" style="border-color:var(--info)">図面のドア ${g.openAuto.doors}・開口 ${g.openAuto.gaps} <b>−${fmt(g.openAuto.area)}</b>㎡</span>` : '') + `<span class="chip">床 <b>${fmt(g.floor)}</b>㎡</span><span class="chip">壁 <b>${fmt(g.wall)}</b>㎡</span><span class="chip">天井 <b>${fmt(g.ceil)}</b>㎡</span><span class="chip">周り <b>${fmt(g.perim)}</b>m</span><span class="chip">巾木 <b>${fmt(g.base)}</b>m</span><span class="chip">天井高 <b>${fmt(g.h)}</b>m</span>`);
  });
  /* 明細の金額 */
  p.lines.forEach((l, i) => {
    const q = t.lines[i].qty;
    set('amt:' + l.id, `<b>${yen(t.lines[i].amount)}</b><small>${fmt(q, 3)} ${esc(l.unit || '')} × ${yen(l.price)}</small>`);
    if (l.basis && l.basis.measure === 'link') {
      const par = p.lines.find(x => x.id === l.basis.line);
      set('qinfo:' + l.id, par ? `${esc(l.why || '')}：${esc(par.name)} ${esc(par.spec || '')} の長さ ${fmt(netQty(par, p.rooms, o, p.lines), 3)}m → ${fmt(q, 3)}${esc(l.unit || '')}` : '元の配管の行がありません');
      set('qty:' + l.id, fmt(q, 3));
      return;
    }
    if (l.applyLoss && !isRoomBased(l)) {
      const loss = l.loss === '' || l.loss == null ? o.loss : Number(l.loss);
      set('qinfo:' + l.id, l.fromDemo ? `図面で入れた ${fmt(l.qty, 3)}${esc(l.unit || '')} ＋ ロス${fmt(loss, 1)}%${l.sheet > 0 ? `（${fmt(l.sheet, 3)}㎡/枚で枚数に切り上げ ${Math.round(q / l.sheet)}枚）` : ''} → ${fmt(q, 3)}`
        : Number(l.qty) > 0 ? `長さ ${fmt(l.qty, 3)}m ＋ ロス${fmt(loss, 1)}% → ${fmt(q, 3)}m` : '長さ（m）を入れてください');
    }
    const auto = isRoomBased(l);
    if (auto) {
      const net = netQty(l, p.rooms, o, p.lines);
      const loss = l.loss === '' || l.loss == null ? o.loss : Number(l.loss);
      const info = !p.rooms.length ? '部屋がまだありません。②部屋で寸法を入れると数量が入ります。'
        : l.kind === 'labor' ? `${MEASURES[l.basis.measure].label}：${fmt(net, 3)}${MEASURES[l.basis.measure].unit}（手間なので正味のまま）`
          : `${MEASURES[l.basis.measure].label} 正味 ${fmt(net, 3)}${MEASURES[l.basis.measure].unit} ＋ ロス${fmt(loss, 1)}%${l.sheet > 0 ? `（${fmt(l.sheet, 3)}㎡/枚で枚数に切り上げ ${Math.round(q / l.sheet)}枚）` : ''} → ${fmt(q, 3)}`;
      const g = l.basis.measure === 'wall' ? wallGroup(l.cat) : null, ids = l.basis.rooms === 'all' || !Array.isArray(l.basis.rooms) ? null : new Set(l.basis.rooms);
      const off = g ? p.rooms.filter(r => (!ids || ids.has(r.id)) && r.wallOff && r.wallOff[g] > 0).reduce((t, r) => t + r.wallOff[g], 0) : 0;
      set('qinfo:' + l.id, info + (off > 0 ? `（図面で壁ごとに入れた ${fmt(off, 3)}㎡ を引いています）` : ''));
      set('qty:' + l.id, fmt(q, 3));
    }
  });
  set('subtotal', yen(t.subtotal));
  set('linecount', String(p.lines.length));
}

/* ---------- ① 現場 ---------- */
function stepInfo({ p, body, refresh }) {
  const f = (k, label, ph = '', hint = '', type = 'text') => `<label class="f">${label}${hint ? `<span class="hint">${hint}</span>` : ''}<input class="in" data-k="${k}" type="${type}" value="${esc(p[k] ?? '')}" placeholder="${esc(ph)}"></label>`;
  body.innerHTML = `
    <div class="card"><div class="grid g2">
      ${f('name', '案件名（工事の名前）', '例：○○ビル 3階 事務所改修')}
      ${f('customer', 'お客様の名前', '例：株式会社○○', '見積書には「様」が付きます')}
      ${f('address', '現場の住所', '例：瀬戸市○○町1-2-3')}
      ${f('person', 'お客様の担当者', '例：○○ 様')}
      ${f('tel', 'お客様の電話', '', '', 'tel')}
      <label class="f">状態<select class="in" data-k="status">${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${(p.status || 'draft') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <details class="more" style="margin-top:12px"><summary>見積書の番号・有効期限・備考</summary>
      <div class="grid g2" style="margin-top:12px">
        ${f('number', '見積番号')}
        ${f('expiry', '有効期限', '発行日より30日')}
        <label class="f" style="grid-column:1/-1">備考（見積書に載ります）<textarea class="in" data-k="note" placeholder="例：駐車場代は別途とさせていただきます。">${esc(p.note || '')}</textarea></label>
        <label class="f" style="grid-column:1/-1">社内メモ（見積書には載りません）<textarea class="in" data-k="memo">${esc(p.memo || '')}</textarea></label>
      </div>
    </details></div>
    <div class="row" style="margin-top:14px"><span class="spacer"></span><button class="btn ghost danger" id="delP">${icon('trash')}この案件を消す</button></div>`;
  body.addEventListener('input', e => {
    const k = e.target.dataset.k; if (!k) return;
    p[k] = e.target.value; touch(p); refresh();
    if (k === 'name') { const h = document.querySelector('.top h1'); if (h) h.textContent = p.name || '名前のない案件'; }
  });
  body.addEventListener('change', e => { if (e.target.dataset.k === 'status') { p.status = e.target.value; touch(p); refresh(); } });
  $('#delP').onclick = async () => {
    if (!(await ask('案件を消しますか？', `「${p.name || '名前のない案件'}」を消します。`, { ok: '消す', danger: true }))) return;
    const copy = JSON.parse(JSON.stringify(p));
    await removeProject(p);
    go('#/projects');
    toast('案件を消しました', { action: '元に戻す', onAction: async () => { await restoreProject(copy); go('#/p/' + encodeURIComponent(copy.id) + '/1'); } });
  };
  if (!p.name) setTimeout(() => { const i = body.querySelector('[data-k="name"]'); if (i && matchMedia('(min-width:900px)').matches) i.focus(); }, 50);
}

/* ---------- ② 部屋 ---------- */
function roomCard(r, i) {
  const free = r.shape === 'free';
  const num = (k, label, unit, hint = '', step = '0.01') => `<label class="f">${label}${hint ? `<span class="hint">${hint}</span>` : ''}<div class="unitwrap"><input class="in num" inputmode="decimal" type="number" step="${step}" min="0" data-rk="${k}" value="${esc(r[k] ?? '')}"><span>${unit}</span></div></label>`;
  return `<div class="roomc" data-room="${r.id}">
    <div class="head"><span class="pill" ${r.src === 'plan' ? `style="background:${roomColor(r.color)};color:#111"` : ''}>${i + 1}</span>${r.src === 'plan' ? `<span class="pill info" title="図面の区画 ${(r.faces || []).length} つから作った部屋">図面</span>` : ''}<input class="in" data-rk="name" value="${esc(r.name)}" aria-label="部屋の名前" style="flex:1">
      <button class="iconbtn" data-act="dupRoom" title="同じ部屋をもう1つ">${icon('copy')}</button>
      <button class="iconbtn" data-act="delRoom" title="この部屋を消す">${icon('trash')}</button></div>
    <div class="row" style="margin-bottom:10px"><span class="small muted">形</span><div class="seg"><button data-shape="rect" class="${free ? '' : 'on'}">四角（幅×奥行）</button><button data-shape="free" class="${free ? 'on' : ''}">面積で入れる（L字など）</button></div></div>
    <div class="rfields">
      ${free ? num('area', '床の面積', '㎡') + num('perim', '周りの長さ', 'm') : num('w', '幅', 'm', '例 3.64') + num('d', '奥行', 'm')}
      ${num('h', '天井高', 'm', `空なら ${opts().ceilH}m`)}
      ${num('qty', '同じ部屋の数', '室', '', '1')}
      ${num('doors', 'ドア', 'か所', '1か所 1.6㎡', '1')}
      ${num('winCount', '窓（数だけ）', 'か所', '1か所 1.6㎡', '1')}
    </div>
    <details class="more" ${(r.windows || []).length ? 'open' : ''}><summary>窓を寸法で入れる（mm）</summary>
      <div class="wins">${(r.windows || []).map((w, wi) => `<div class="winrow">
        <label class="f">幅<div class="unitwrap"><input class="in num" type="number" inputmode="numeric" data-wk="w" data-wi="${wi}" value="${esc(w.w)}"><span>mm</span></div></label>
        <label class="f">高さ<div class="unitwrap"><input class="in num" type="number" inputmode="numeric" data-wk="h" data-wi="${wi}" value="${esc(w.h)}"><span>mm</span></div></label>
        <label class="f">枚数<input class="in num" type="number" inputmode="numeric" data-wk="n" data-wi="${wi}" value="${esc(w.n)}"></label>
        <button class="iconbtn" data-act="delWin" data-wi="${wi}" aria-label="この窓を消す">${icon('x')}</button></div>`).join('')}
        <div><button class="btn sm" data-act="addWin">${icon('plus')}窓を足す</button></div></div>
    </details>
    ${(r.openRuns || []).length ? `<label class="row small muted" style="gap:8px;margin-top:10px"><input type="checkbox" data-open-toggle ${r.openOff ? '' : 'checked'} style="width:20px;height:20px">図面で見つけたドア・開口を壁の面積から引く（引く時は、上の「ドア」の数は使いません）</label>` : ''}
    <div class="chips" data-out="room:${r.id}"></div>
  </div>`;
}

function drawingCard(p) {
  const d = p.drawing;
  if (!d || !d.plan) return `<div class="card" style="margin-bottom:14px"><div class="row"><div style="flex:1;min-width:220px"><h2>図面から部屋を作る</h2>
      <div class="sub" style="margin:0">JWW・DXF・PDF の図面を読み込むと、部屋の区画が自動で見つかります。区画をタップして部屋にしてください。</div></div>
      <label class="btn primary" style="cursor:pointer">${icon('up')}図面を選ぶ<input type="file" id="dwgFile" accept=".jww,.jwc,.dxf,.pdf,application/pdf" hidden></label>
      <button class="btn" data-act="sketch">${icon('grid')}寸法で間取りを作る</button></div>
      <div class="small muted" style="margin-top:6px">図面ファイルが無い時は「寸法で間取りを作る」：四角の寸法・向きと長さ・写真や手描きの図の角をタップして、間取りを作れます。</div>
      <div class="small muted" id="dwgStatus" style="margin-top:8px"></div></div>`;
  return `<div class="card" style="margin-bottom:14px">
    <div class="row" style="margin-bottom:10px"><div style="flex:1;min-width:200px"><h2>${icon('layers').replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-3px"')} ${esc(d.fileName || '図面')}</h2>
      <div class="sub" style="margin:0">区画 ${d.plan.faces.length} 個${planCH(d.plan) ? `・図面の天井高 ${planCH(d.plan)}m` : ''}。区画をタップして選び、下のボタンで部屋にしてください。</div></div>
      ${d.fixtures ? `<button class="btn sm primary" data-act="open3d">${icon('cube')}3Dで見る</button>` : ''}
      ${d.sketch ? `<button class="btn sm" data-act="sketch">${icon('grid')}間取りを直す</button>` : ''}
      <button class="btn sm" data-act="cadOut">${icon('down')}JWW・DXF</button>
      <label class="btn sm" style="cursor:pointer">${icon('up')}読み直す<input type="file" id="dwgFile" accept=".jww,.jwc,.dxf,.pdf,application/pdf" hidden></label>
      <button class="btn sm ghost danger" data-act="dwgClear">${icon('trash')}図面を消す</button></div>
    <div class="seg" id="dwgMode" style="margin-bottom:8px"><button data-mode="room">部屋を作る</button><button data-mode="fix">器具を直す</button><button data-mode="wall">壁の解体・仕上げ</button><button data-mode="cut">カッター</button><button data-mode="light">照明・配線</button><button data-mode="meas">測る</button></div>
    <div id="dwgView"></div>
    <div class="addbar" style="margin-top:10px" id="dwgBar"></div>
    <div id="dwgDemo"></div>
    <div id="dwgFix">${fixSummary(d)}</div>
    <details class="more"><summary>区画の一覧から選ぶ（図面で押しにくい小さい区画など）</summary><div class="facelist" id="dwgFaces"></div></details>
    <div class="small muted" id="dwgStatus" style="margin-top:6px"></div></div>`;
}

function fixSummary(d) {
  const fx = d.fixtures || [];
  if (!fx.length) return d.fixtures ? '<div class="small muted" style="margin-top:8px">器具は見つかりませんでした。</div>' : '';
  const c = {}; fx.forEach(x => { c[x.t] = (c[x.t] || 0) + 1; });
  return `<div class="row" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line)"><b class="small">図面の器具</b>
    ${Object.entries(c).map(([t, n]) => `<span class="pill ${t === 'unknown' ? 'warn' : t === 'other' ? '' : 'info'}">${esc(FIX_NAMES[t] || t)} ${n}</span>`).join('')}
    <span class="spacer"></span><button class="btn sm primary" data-act="fixLines">${icon('list')}器具を明細に入れる</button></div>`;
}

function fixLinesDialog(p, after) {
  const fx = (p.drawing && p.drawing.fixtures) || [];
  const c = {}; fx.forEach(x => { c[x.t] = (c[x.t] || 0) + 1; });
  const items = masterItems();
  const types = Object.keys(c).filter(t => FIX_ITEMS[t]);
  const opts2 = (t, kind, def) => {
    const words = FIX_WORDS[t] || [];
    const list = items.filter(i => words.some(w => i.name.includes(w)) && (kind === 'labor' ? i.kind === 'labor' : i.kind !== 'labor'));
    return `<option value="">入れない</option>` + list.map(i => `<option value="${esc(i.id)}" ${i.id === def ? 'selected' : ''}>${esc(i.name)}${i.spec ? ' ' + esc(i.spec) : ''}（${yen(i.price)}）</option>`).join('');
  };
  const skip = (c.unknown || 0) + (c.other || 0);
  const m = modal({
    title: '図面の器具を明細に入れる', wide: true,
    body: `<p class="small muted" style="margin-top:0">種類ごとに、入れる品目と数を確かめてください。前に入れた器具の行は入れ直します。${skip ? `「判定保留」「器具ではない」の ${skip} 個は入れません。` : ''}</p>
      <div class="grid" style="gap:10px">${types.map(t => `<div class="card" style="padding:12px" data-ft="${t}"><div class="row" style="margin-bottom:8px"><b>${esc(FIX_NAMES[t])}</b><span class="pill info">図面で ${c[t]} 個</span></div>
        <div class="grid g3"><label class="f">本体<select class="in" data-k="body">${opts2(t, 'mat', FIX_ITEMS[t][0])}</select></label>
        <label class="f">取付の手間<select class="in" data-k="labor">${opts2(t, 'labor', FIX_ITEMS[t][1])}</select></label>
        <label class="f">数<input class="in num" type="number" inputmode="numeric" data-k="n" value="${c[t]}"></label></div></div>`).join('') || '<p class="muted">明細に入れられる器具がありません。</p>'}</div>`,
    foot: `<button class="btn" data-close>やめる</button><button class="btn primary" id="fxGo">明細に入れる</button>`
  });
  $('#fxGo', m.el).onclick = () => {
    let added = 0;
    $$('[data-ft]', m.el).forEach(row => {
      const t = row.dataset.ft, n = Number($('[data-k=n]', row).value) || 0;
      p.lines = p.lines.filter(l => l.fromFix !== t);
      if (!(n > 0)) return;
      ['body', 'labor'].forEach(k => {
        const id = $(`[data-k=${k}]`, row).value; const it = id && items.find(i => i.id === id); if (!it) return;
        p.lines.push({ id: uid('l'), itemId: it.id, name: it.name, spec: it.spec || '', unit: it.unit, kind: it.kind, price: it.price || '', cost: '', loss: '', sheet: 0, cat: it.cat, qty: n, basis: null, fromFix: t });
        added++;
      });
    });
    touch(p); m.close(); after && after();
    toast(added ? `器具の行を ${added} 行入れました（③工事で確かめてください）` : '入れる行がありませんでした');
  };
}

/* 一番近い線（壁の解体で線をタップした時） */
function nearestSeg(plan, x, y, tol) {
  let best = -1, bd = tol;
  plan.segs.forEach((s, i) => {
    const dx = s[2] - s[0], dy = s[3] - s[1], L2 = dx * dx + dy * dy; if (!L2) return;
    const t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (y - s[1]) * dy) / L2));
    const d = Math.hypot(s[0] + t * dx - x, s[1] + t * dy - y);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
const segLen = s => Math.hypot(s[2] - s[0], s[3] - s[1]);

/* 選んだ壁がどの部屋の壁か：壁の上に点を並べ、部屋の形の辺から6cm以内に来る点が多い順（半分以上の部屋だけ）。
 * 寸法で作った間取りの間仕切りのように両側の部屋に当たる時は、両方を候補にして先頭を選んでおく */
export function wallRooms(p, w) {
  const d = p.drawing, plan = d.plan; if (!plan) return [];
  const runs = w.pts && w.pts.length > 1 ? w.pts.slice(1).map((q, i) => [w.pts[i][0], w.pts[i][1], q[0], q[1]]) : (w.segs || []).map(i => plan.segs[i]).filter(Boolean);
  const pts = []; runs.forEach(s => { const L = segLen(s), n = Math.max(2, Math.ceil(L / 0.25)); for (let k = 0; k <= n; k++) { const t = (k + 0.5) / (n + 1); pts.push([s[0] + (s[2] - s[0]) * t, s[1] + (s[3] - s[1]) * t]); } });
  if (!pts.length) return [];
  const edgeD = (q, P) => { let m = 1e9; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)) : 0; m = Math.min(m, Math.hypot(a[0] + t * dx - q[0], a[1] + t * dy - q[1])); } return m; };
  return p.rooms.filter(r => r.src === 'plan').map(r => {
    const F = (r.faces || []).map(i => plan.faces.find(f => f.i === i)).filter(Boolean);
    const hit = pts.filter(q => F.some(f => edgeD(q, f.poly) < 0.06)).length;
    return { r, k: hit / pts.length };
  }).filter(x => x.k >= 0.5).sort((a, b) => b.k - a.k).map(x => x.r);
}
const r3 = v => Math.round(v * 1000) / 1000;

/* 図面の壁の解体・カッターから、明細の行を作り直す（単価を変えていた行は単価を引き継ぐ） */
export function syncDemoLines(p) {
  const items = masterItems(), it = id => items.find(i => i.id === id);
  const old = new Map(p.lines.filter(l => l.fromDemo).map(l => [l.fromDemo, l]));
  p.lines = p.lines.filter(l => !l.fromDemo);
  const add = (key, id, qty, note, x = {}) => {
    const m = it(id); if (!m || !(qty > 0)) return;
    const o = old.get(key);
    p.lines.push({ id: o ? o.id : uid('l'), itemId: m.id, name: m.name, spec: [m.spec, note].filter(Boolean).join(' '), unit: m.unit, kind: m.kind, cat: m.cat, price: o ? o.price : (m.price || ''), cost: '', loss: o ? o.loss : '', sheet: m.sheet || 0, qty: r3(qty), basis: null, fromDemo: key, ...(x.loss ? { applyLoss: true } : {}) });
  };
  const d = p.drawing || {};
  /* 壁ごとに入れた分を、その部屋の壁の行（同じ種類）から引くための量 */
  p.rooms.forEach(r => { delete r.wallOff; });
  (d.walls || []).forEach(w => {
    const r = w.room && p.rooms.find(x => x.id === w.room); if (!r) return;
    const a = Math.max(0, w.len * w.h - (Number(w.open) || 0)), o = r.wallOff || (r.wallOff = {});
    if (w.itemId) o.demo = r3((o.demo || 0) + a);
    if (w.baseId) o.base = r3((o.base || 0) + a);
    if (w.finId) o.fin = r3((o.fin || 0) + a);
  });
  (d.walls || []).forEach(w => {
    const a = Math.max(0, w.len * w.h - (Number(w.open) || 0)), note = `長さ${r3(w.len)}m×高さ${r3(w.h)}m${Number(w.open) > 0 ? `−開口${r3(w.open)}㎡` : ''}${w.name ? '（' + w.name + '）' : ''}`;
    if (w.itemId) add('w|' + w.id, w.itemId, a, note);
    if (w.baseId) add('wb|' + w.id, w.baseId, a, note, { loss: true });
    if (w.finId) add('wf|' + w.id, w.finId, a, note, { loss: true });
  });
  const H = (d.hatsu || []).map(h => ({ h, c: hatsuCalc(h) })).filter(x => x.c.a > 0);
  if (H.length) {
    const cuts = {}, hz = {}, sum = { gara: 0, dig: 0, zando: 0, back: 0 };
    H.forEach(({ h, c }) => { if (c.cut > 0) cuts[cutItem(h.t)] = (cuts[cutItem(h.t)] || 0) + c.cut; hz[hatsuItem(h.t)] = (hz[hatsuItem(h.t)] || 0) + c.a; ['gara', 'dig', 'zando', 'back'].forEach(k => { sum[k] += c[k]; }); });
    if (Object.keys(cuts).length) add('h|base', 'w-cutBase', 1, 'カッター屋さんの出張・最低料金');
    Object.keys(cuts).sort().forEach(k => add('h|' + k, k, cuts[k], '切る所の周りの長さ'));
    Object.keys(hz).sort().forEach(k => add('h|' + k, k, hz[k], 'カッターの内側をはつる面積'));
    add('h|gara', 'w-gara', sum.gara, '幅×長さ×コンクリートの厚み');
    add('h|dig', 'w-kussaku', sum.dig, '幅×長さ×掘る深さ');
    add('h|zando', 'w-zando', sum.zando, `掘った量×${ZANDO_F}`);
    add('h|back', 'w-ume', sum.back, '掘った所を埋め戻す量');
  }
  /* 照明・スイッチ・配線・分電盤 */
  const L = d.lights || [], O = d.outlets || [];
  if (O.length) {
    const byO = {}; O.forEach(x => { byO[x.item] = (byO[x.item] || 0) + 1; });
    Object.keys(byO).sort().forEach(k => add('o|' + k, k, byO[k], '図面のコンセント'));
    add('o|on', 'w-eDev', O.length, 'コンセントの取付');
  }
  if (L.length || O.length) {
    const byItem = {}; L.forEach(x => { byItem[x.item] = (byItem[x.item] || 0) + 1; });
    Object.keys(byItem).sort().forEach(k => { add('l|' + k, k, byItem[k], '図面の照明'); add('l|on|' + k, /^e-dl/.test(k) ? 'w-eDL' : 'w-eLight', byItem[k], '図面の照明'); });
    const W = lightWires(p);
    if (W.sw) { add('l|sw', 'e-sw1', W.sw, W.booths ? `入口のそばに1つ（トイレのブース ${W.booths} か所は外の部屋のスイッチで点ける）` : '照明のある区画ごとに入口のそばに1つ'); add('l|swOn', 'w-eDev', W.sw, 'スイッチの取付'); }
    add('l|vvf16', 'e-v16-2', W.mL, `スイッチ→照明（縦横にたどった長さ＋立ち下がり＋1台0.2m、余り${W.extra}%）`);
    add('l|vvf20', 'e-v20-2', W.mH, `${O.length ? 'コンセントの線（近い順に縦横の長さ＋立ち下がり）' : ''}${O.length && d.panel ? '・' : ''}${d.panel ? '分電盤→各部屋（縦横の長さ＋立ち下がり）' : ''}、余り${W.extra}%`);
    if (d.panel) { add('l|panel', 'e-panel', 1, '図面で置いた分電盤'); add('l|panelOn', 'w-ePanel', 1, ''); }
    add('l|wire', 'w-eWire', W.mL + W.mH, 'ケーブルの合計');
  }
}

/* 配線：前のKAKUと同じ計算（js/lighting.js wirePlan）。区画ごとにスイッチを入口のそばに置き、縦横にたどった長さを出す */
export function lightWires(p) {
  const d = p.drawing || {}, ch0 = planCH(d.plan) || opts().ceilH;
  const chOf = fi => { const r = p.rooms.find(rr => rr.src === 'plan' && (rr.faces || []).includes(fi)); return (r && Number(r.h) > 0) ? Number(r.h) : ch0; };
  const W = wirePlan({ plan: d.plan || { faces: [] }, doors: d.doors || [], fixtures: d.fixtures || [], lights: (d.lights || []).map(x => ({ key: x.id, l: [x.x, x.y] })),
    outlets: (d.outlets || []).map(x => ({ key: x.id, l: [x.x, x.y] })), switches: (d.switches || []).map(x => ({ key: x.id, l: [x.x, x.y] })), link: d.link || {}, panels: d.panel ? [d.panel] : [], chOf });
  const extra = d.wireExtra ?? 10;
  return { ...W, sw: W.sws.length, mL: cableQty(W.lenL, extra), mH: cableQty(W.lenO + W.lenH, extra), extra };
}

/* 測る時のくっつき：線の端（近い順）→ 線の上 → そのまま（1mm単位） */
function snapPt(plan, x, y, tol) {
  let best = null, bd = tol;
  const segs = plan.segs;
  for (const s of segs) for (const q of [[s[0], s[1]], [s[2], s[3]]]) { const d = Math.hypot(q[0] - x, q[1] - y); if (d < bd) { bd = d; best = q; } }
  if (best) return [best[0], best[1]];
  bd = tol * 0.7;
  for (const s of segs) {
    const dx = s[2] - s[0], dy = s[3] - s[1], L2 = dx * dx + dy * dy; if (!L2) continue;
    const t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (y - s[1]) * dy) / L2));
    const px = s[0] + t * dx, py = s[1] + t * dy, d = Math.hypot(px - x, py - y);
    if (d < bd) { bd = d; best = [px, py]; }
  }
  if (best) return best;
  return [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];
}

function stepRooms(ctx) {
  const { p, body, refresh } = ctx;
  const sel = new Set();
  let view = null;
  let mode = 'room', fsel = -1, addAt = null, cutA = null, ltool = 'light', linkSel = null;
  const lset = state.lightSet || (state.lightSet = { room: 'all', use: '', item: 'e-dl100', lm: 800 });
  const wsel = new Set(), wpts = []; let wway = 'seg';
  const meas = { pts: [], cont: false };
  const FIX_SIZE = { toilet: [0.46, 0.8], urinal: [0.4, 0.36], counter: [1.2, 0.5], sink: [0.45, 0.36], slop: [0.8, 0.52], bath: [1.6, 1.6], kitchen: [2.55, 0.65] };
  const BACKS = [['N', '上'], ['E', '右'], ['S', '下'], ['W', '左']];
  const fxList = () => (p.drawing && p.drawing.fixtures) || [];
  const owner = () => { const m = new Map(); p.rooms.forEach(r => (r.faces || []).forEach(i => m.set(i, r.color))); return m; };
  const demoOverlay = () => {
    const lw = view.lw, plan = p.drawing.plan, d = p.drawing;
    let h = '';
    (d.walls || []).forEach(w => (w.segs || []).forEach(i => { const s = plan.segs[i]; if (s) h += `<line x1="${s[0]}" y1="${-s[1]}" x2="${s[2]}" y2="${-s[3]}" stroke="#ff6b6b" stroke-width="${lw * 7}" stroke-linecap="round" opacity=".75"/>`; }));
    wsel.forEach(i => { const s = plan.segs[i]; if (s) h += `<line x1="${s[0]}" y1="${-s[1]}" x2="${s[2]}" y2="${-s[3]}" stroke="var(--accent)" stroke-width="${lw * 7}" stroke-linecap="round"/>`; });
    (d.walls || []).forEach(w => { if (w.pts && w.pts.length > 1) h += `<polyline points="${w.pts.map(q => `${q[0]},${-q[1]}`).join(' ')}" fill="none" stroke="${w.itemId ? '#ff6b6b' : '#5ab7ff'}" stroke-width="${lw * 7}" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>`; });
    if (mode === 'wall' && wpts.length) { h += `<polyline points="${wpts.map(q => `${q[0]},${-q[1]}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="${lw * 7}" stroke-linecap="round" stroke-linejoin="round"/>`; wpts.forEach(q => { h += `<circle cx="${q[0]}" cy="${-q[1]}" r="${lw * 6}" fill="var(--accent)"/>`; }); }
    (d.hatsu || []).forEach(x => { if (!x.rect) return; const [a, b, c, e] = x.rect; h += `<rect x="${a}" y="${-e}" width="${c - a}" height="${e - b}" fill="#ff8a3d" fill-opacity=".18" stroke="#ff8a3d" stroke-width="${lw * 3}" stroke-dasharray="${lw * 6} ${lw * 4}"/>`; });
    if (cutA) h += `<circle cx="${cutA[0]}" cy="${-cutA[1]}" r="${lw * 6}" fill="var(--accent)"/>`;
    if ((d.lights || []).length || d.panel || (d.outlets || []).length || (d.switches || []).length) {
      const W = lightWires(p);
      const pd = pts => 'M' + pts.map(q => `${q[0]} ${-q[1]}`).join('L');
      W.paths.forEach(w => { h += `<path d="${pd(w.pts)}" fill="none" stroke="#f3c04f" stroke-width="${lw * 1.6}" stroke-dasharray="${lw * 5} ${lw * 3}" opacity=".8"/>`; });
      W.home.forEach(w => { h += `<path d="${pd(w.pts)}" fill="none" stroke="#c084fc" stroke-width="${lw * 1.6}" stroke-dasharray="${lw * 5} ${lw * 3}" opacity=".8"/>`; });
      const swAll = [...W.sws, ...(d.switches || []).filter(x => !W.sws.some(s0 => s0.key === x.id)).map(x => ({ key: x.id, l: [x.x, x.y] }))];
      swAll.forEach(s0 => { const q = s0.l, mine = !s0.auto; h += `<rect x="${q[0] - lw * 7}" y="${-q[1] - lw * 7}" width="${lw * 14}" height="${lw * 14}" fill="${mine ? '#5ab7ff' : '#f3c04f'}"/><text x="${q[0]}" y="${-q[1]}" font-size="${lw * 10}" text-anchor="middle" dominant-baseline="central" fill="#111" font-weight="800">S</text>`; });
      (d.lights || []).forEach(x => { const on = linkSel === x.id; h += `<circle cx="${x.x}" cy="${-x.y}" r="${lw * (on ? 13 : 9)}" fill="#f3c04f" fill-opacity=".35" stroke="${on ? 'var(--accent)' : '#f3c04f'}" stroke-width="${lw * (on ? 3.5 : 2.2)}"/><circle cx="${x.x}" cy="${-x.y}" r="${lw * 3}" fill="#f3c04f"/>`; });
      (d.outlets || []).forEach(x => { h += `<circle cx="${x.x}" cy="${-x.y}" r="${lw * 7}" fill="#3ccf8e" fill-opacity=".3" stroke="#3ccf8e" stroke-width="${lw * 2}"/><line x1="${x.x - lw * 2.5}" y1="${-x.y - lw * 3}" x2="${x.x - lw * 2.5}" y2="${-x.y + lw * 3}" stroke="#3ccf8e" stroke-width="${lw * 1.6}"/><line x1="${x.x + lw * 2.5}" y1="${-x.y - lw * 3}" x2="${x.x + lw * 2.5}" y2="${-x.y + lw * 3}" stroke="#3ccf8e" stroke-width="${lw * 1.6}"/>`; });
      if (d.panel) h += `<rect x="${d.panel[0] - lw * 12}" y="${-d.panel[1] - lw * 8}" width="${lw * 24}" height="${lw * 16}" fill="#c084fc"/><text x="${d.panel[0]}" y="${-d.panel[1]}" font-size="${lw * 9}" text-anchor="middle" dominant-baseline="central" fill="#111" font-weight="800">分電盤</text>`;
    }
    return h;
  };
  const measOverlay = () => {
    if (!view) return '';
    const lw = view.lw, P = meas.pts;
    if (!P.length) return '';
    let h = `<polyline points="${P.map(q => q[0] + ',' + -q[1]).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="${lw * 3}"/>`;
    P.forEach(q => { h += `<circle cx="${q[0]}" cy="${-q[1]}" r="${lw * 5}" fill="var(--accent)"/>`; });
    if (P.length > 1) { const a = P[P.length - 2], b = P[P.length - 1]; h += `<text x="${(a[0] + b[0]) / 2}" y="${-(a[1] + b[1]) / 2}" font-size="${lw * 18}" fill="var(--accent)" stroke="var(--bg)" stroke-width="${lw * 4}" paint-order="stroke" text-anchor="middle" font-weight="800">${Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(3)}m</text>`; }
    if (addAt) h += `<circle cx="${addAt[0]}" cy="${-addAt[1]}" r="${lw * 6}" fill="none" stroke="var(--accent)" stroke-width="${lw * 3}"/>`;
    return h;
  };
  const wallRoomSel = (id, cur, guess = []) => { const pr = p.rooms.filter(r => r.src === 'plan'), ids = new Set(guess.map(r => r.id)), order = [...guess, ...pr.filter(r => !ids.has(r.id))];
    return `<select class="in" ${id ? `id="${id}"` : 'data-wk="room"'} style="min-height:40px"><option value="">部屋の壁から引かない</option>${order.map(r => `<option value="${esc(r.id)}" ${r.id === cur ? 'selected' : ''}>${esc(r.name)}${ids.has(r.id) ? '（図で当たった部屋）' : ''}</option>`).join('')}</select>`; };
  const demoList = () => {
    const d = p.drawing; if (!d) return '';
    const W = d.walls || [], H = d.hatsu || [];
    if (!W.length && !H.length) return '';
    const it = id => masterItems().find(i => i.id === id);
    return `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line);display:grid;gap:8px">
      ${W.map(w => `<div class="card" style="padding:10px" data-wall="${w.id}"><div class="row small">
        ${w.itemId ? `<span class="pill bad">解体 ${esc((it(w.itemId) || {}).name || '')}</span>` : ''}${w.baseId ? `<span class="pill info">下地 ${esc((it(w.baseId) || {}).name || '')}</span>` : ''}${w.finId ? `<span class="pill acc">仕上げ ${esc((it(w.finId) || {}).name || '')}</span>` : ''}${w.name ? `<b>${esc(w.name)}</b>` : ''}
        <span class="spacer"></span><button class="iconbtn" data-act="wallDel" aria-label="この壁を消す">${icon('trash')}</button></div>
        <div class="row small" style="margin-top:6px"><span>長さ ${r3(w.len)}m × 高さ</span><div class="unitwrap" style="width:120px"><input class="in num" data-wk="h" type="number" inputmode="decimal" step="0.01" value="${w.h}" style="min-height:36px"><span>m</span></div>
        <span>− 開口</span><div class="unitwrap" style="width:120px"><input class="in num" data-wk="open" type="number" inputmode="decimal" step="0.01" value="${w.open || 0}" style="min-height:36px"><span>㎡</span></div><b>＝ ${r3(Math.max(0, w.len * w.h - (Number(w.open) || 0)))}㎡</b></div>
        <div class="row small" style="margin-top:6px"><span class="muted">部屋の壁から引く</span><div style="min-width:220px">${wallRoomSel('', w.room || '', wallRooms(p, w))}</div></div></div>`).join('')}
      ${H.map(h => { const c = hatsuCalc(h); return `<div class="card" style="padding:10px" data-hatsu="${h.id}"><div class="row small"><span class="pill acc">カッター</span><b>幅 ${r3(h.w)}m × 長さ ${r3(h.l)}m</b>
        <label class="row muted" style="gap:4px">厚み<div class="unitwrap" style="width:130px"><input class="in num" data-hk="t" type="number" inputmode="numeric" value="${h.t}" style="min-height:36px"><span>mm</span></div></label>
        <label class="row muted" style="gap:4px">掘る深さ<div class="unitwrap" style="width:130px"><input class="in num" data-hk="d" type="number" inputmode="numeric" value="${h.d}" style="min-height:36px"><span>mm</span></div></label>
        <label class="row muted" style="gap:4px"><input type="checkbox" data-hk="cut" ${h.cut !== false ? 'checked' : ''} style="width:18px;height:18px">カッター</label>
        <label class="row muted" style="gap:4px"><input type="checkbox" data-hk="back" ${h.back !== false ? 'checked' : ''} style="width:18px;height:18px">埋め戻し</label>
        <span class="spacer"></span><button class="iconbtn" data-act="hatsuDel" aria-label="このカッターを消す">${icon('trash')}</button></div>
        <div class="chips">${`<span class="chip">はつり <b>${c.a}</b>㎡</span>` + (c.cut ? `<span class="chip">カッター <b>${c.cut}</b>m</span>` : '') + `<span class="chip">ガラ <b>${c.gara}</b>m³</span>` + (c.dig ? `<span class="chip">掘削 <b>${c.dig}</b>m³</span><span class="chip">残土 <b>${c.zando}</b>m³</span>` : '') + (c.back ? `<span class="chip">埋め戻し <b>${c.back}</b>m³</span>` : '')}</div></div>`; }).join('')}
      <div class="small muted">ここで入れた分は、③工事の明細に自動で入ります（変えると明細も変わります）。</div></div>`;
  };
  const paintSel = () => {
    if (!p.drawing || !p.drawing.plan) return;
    $$('#dwgMode button', body).forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    if (view) { view.paint(); view.overlay(demoOverlay() + (mode === 'meas' || addAt ? measOverlay() : '')); }
    const demoBox = body.querySelector('#dwgDemo'); if (demoBox) demoBox.innerHTML = demoList();
    const fxBox = body.querySelector('#dwgFix'); if (fxBox) fxBox.innerHTML = fixSummary(p.drawing);
    if (mode !== 'room') {
      const bar = body.querySelector('#dwgBar');
      if (mode === 'wall') {
        const len = wway === 'seg' ? [...wsel].reduce((a, i) => a + segLen(p.drawing.plan.segs[i]), 0) : wpts.reduce((a, q, i) => i ? a + Math.hypot(q[0] - wpts[i - 1][0], q[1] - wpts[i - 1][1]) : 0, 0);
        const dh = planCH(p.drawing.plan) || opts().ceilH, M = masterItems(), ls = state.wallSet || (state.wallSet = { demo: 'w-dW-cloth', base: '', fin: '' });
        const sel = (id, list, cur, none) => `<select class="in" id="${id}" style="min-height:40px">${none ? `<option value="">${none}</option>` : ''}${list.map(i => `<option value="${esc(i.id)}" ${i.id === cur ? 'selected' : ''}>${esc(i.name)}${i.spec ? ' ' + esc(i.spec) : ''}（${yen(i.price)}/${esc(i.unit)}）</option>`).join('')}</select>`;
        const has = wway === 'seg' ? wsel.size > 0 : wpts.length > 1;
        bar.innerHTML = `<div class="seg" style="width:100%">${[['seg', '線をタップ'], ['range', 'ここからここまで']].map(t => `<button data-wway="${t[0]}" class="${wway === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div>
          <div class="small" style="width:100%">${wway === 'seg' ? '解体・仕上げをする壁の線をタップして選んでください（何本でも）。' : '壁の始まりと終わりをタップしてください。角を回る時は角もタップ（測るのと同じく、線の端・線の上にくっつきます）。'}
            ${has ? `<b>選んだ長さ ${len.toFixed(3)} m</b>` : ''}</div>
          ${has ? `<div class="grid g4" style="width:100%;align-items:end">
            <label class="f">高さ<div class="unitwrap"><input class="in num" id="wH" type="number" inputmode="decimal" step="0.01" value="${dh}"><span>m</span></div></label>
            <label class="f">引く開口<span class="hint">窓・ドアなど</span><div class="unitwrap"><input class="in num" id="wOpen" type="number" inputmode="decimal" step="0.01" value="0"><span>㎡</span></div></label>
            <label class="f" style="grid-column:span 2">どの部屋の壁か<span class="hint">③工事のその部屋の壁から、同じ種類の分を引きます</span>${wallRoomSel('wRoom', wallRooms(p, wway === 'seg' ? { segs: [...wsel] } : { pts: wpts }).map(r => r.id)[0] || '', wallRooms(p, wway === 'seg' ? { segs: [...wsel] } : { pts: wpts }))}</label>
            <label class="f" style="grid-column:span 4">メモ（どの壁か）<input class="in" id="wName" placeholder="例：LDK 北の壁"></label></div>
          <div class="grid g3" style="width:100%">
            <label class="f">解体${sel('wItem', M.filter(i => i.cat === 'demoW'), ls.demo, '解体しない')}</label>
            <label class="f">下地${sel('wBase', M.filter(i => i.cat === 'board'), ls.base, '下地なし')}</label>
            <label class="f">仕上げ${sel('wFin', M.filter(i => i.cat === 'wall' || i.cat === 'paint'), ls.fin, '仕上げなし')}</label></div>
          <button class="btn sm primary" data-act="wallAdd">${icon('plus')}この壁を明細に入れる</button><button class="btn sm ghost" data-act="wallClear">選び直す</button>
          <div class="small muted" style="width:100%">面積＝長さ×高さ−開口。下地・仕上げはロス込みで入ります。③工事でその部屋の壁全体に入れている解体・下地・仕上げの行からは、ここで入れた分を自動で引きます。</div>` : ''}`;
        return;
      }
      if (mode === 'light') {
        const pr = p.rooms.filter(r => r.src === 'plan');
        const lightItems = masterItems().filter(i => /^e-(dl|clight|bl|base)/.test(i.id));
        const W = lightWires(p), n = (p.drawing.lights || []).length;
        const res = pr.map(r => { const k = (p.drawing.lights || []).filter(x => x.room === r.id).length; if (!k) return ''; const u = r.lightUse || ''; const F = (r.faces || []).map(i => p.drawing.plan.faces.find(f => f.i === i)).filter(Boolean); const lx = u && F[0] ? Math.round(luxOf(F[0].poly, Number(r.h) || planCH(p.drawing.plan) || opts().ceilH, u, r.lightLm || 800, k) / 10) * 10 : 0; const tgt = (USES.find(x => x[0] === u) || [])[2]; return `<span class="pill ${lx && tgt && lx < tgt * 0.95 ? 'warn' : 'info'}">${esc(r.name)} ${k}台${lx ? `・約${lx}lx（目標${tgt}）` : ''}</span>`; }).join('');
        bar.innerHTML = !pr.length ? `<span class="small muted">先に「部屋を作る」で部屋を作ってください。照明は部屋ごとに並べます。</span>` : `
          <div class="grid g4" style="width:100%;align-items:end">
            <label class="f">部屋<select class="in" id="lRoom"><option value="all">部屋にした所 全部</option>${pr.map(r => `<option value="${esc(r.id)}" ${lset.room === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
            <label class="f">部屋の用途<select class="in" id="lUse">${USES.map(u => `<option value="${u[0]}" ${lset.use === u[0] ? 'selected' : ''}>${u[1]}${u[2] ? `（${u[2]}lx）` : ''}</option>`).join('')}</select></label>
            <label class="f">照明器具<select class="in" id="lItem">${lightItems.map(i => `<option value="${esc(i.id)}" ${lset.item === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select></label>
            <label class="f">1台の明るさ<span class="hint">カタログの器具光束</span><div class="unitwrap"><input class="in num" id="lLm" type="number" inputmode="numeric" value="${lset.lm}"><span>lm</span></div></label></div>
          <button class="btn sm primary" data-act="lAuto">${icon('spark')}照明を自動で並べる</button>
          ${(p.drawing.fixtures || []).some(x => x.out || ((x.t === 'toilet' || x.t === 'counter') && x.back)) ? `<button class="btn sm" data-act="oAuto">コンセントを器具に合わせて置く</button>` : ''}
          ${n ? `<button class="btn sm ghost danger" data-act="lClear">照明を全部消す</button>` : ''}${(p.drawing.outlets || []).length ? `<button class="btn sm ghost danger" data-act="oClear">コンセントを全部消す</button>` : ''}
          <div class="seg" style="width:100%" id="lTool">${[['light', '照明'], ['sw', 'スイッチ'], ['out', 'コンセント'], ['panel', '分電盤'], ['link', 'つなぎ替え']].map(t => `<button data-ltool="${t[0]}" class="${ltool === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div>
          <div class="small" style="width:100%">${{ light: '何も無い所をタップで照明を足す・照明をタップで消す', sw: 'タップでスイッチを置く（その区画は置いたスイッチにつなぐ）・置いたスイッチ（青）をタップで消す', out: 'タップでコンセントを置く・コンセントをタップで消す', panel: 'タップした所に分電盤を置く（もう一度で動かす）', link: linkSel ? 'つなぐスイッチをタップしてください' : '照明をタップしてから、つなぎたいスイッチをタップ' }[ltool]}${ltool === 'out' ? `　<select class="in" id="oItem" style="display:inline-block;width:auto;min-height:34px">${masterItems().filter(i => /^e-con/.test(i.id)).map(i => `<option value="${esc(i.id)}" ${(lset.out || 'e-cone') === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select>` : ''}${ltool === 'link' && Object.keys(p.drawing.link || {}).length ? `　<button class="btn sm ghost" data-act="linkClear">つなぎ替え ${Object.keys(p.drawing.link).length} 件を元に戻す</button>` : ''}</div>
          <div class="small muted" style="width:100%">照明 ${n} 台・スイッチ ${W.sw} 個（黄＝自動・青＝置いた物）・コンセント ${(p.drawing.outlets || []).length} 個・ケーブル ${W.mL + W.mH} m（余り${W.extra}%込み）。スイッチは入口のそばに自動で置きます${W.booths ? `。トイレのブース ${W.booths} か所は、外の部屋のスイッチで点けます` : ''}。${W.far ? `<b>分電盤から離れた所（別の階の図など）の ${W.far} 区画は、分電盤からの線を入れていません。</b>` : ''}</div>
          ${res ? (n && (p.drawing.lights || []).length && res.split('<span').length > 7 ? `<details style="width:100%"><summary class="small">部屋ごとの台数と明るさを見る${res.includes('pill warn') ? '（目標に届かない部屋あり）' : ''}</summary><div class="row" style="margin-top:6px">${res}</div></details>` : `<div class="row" style="width:100%">${res}</div>`) : ''}`;
        return;
      }
      if (mode === 'cut') {
        bar.innerHTML = `<span class="small muted">${cutA ? 'もう1つの角をタップしてください。' : 'カッターで切る範囲の、四角の角を2か所タップしてください。'}</span>${cutA ? '<button class="btn sm ghost" data-act="cutCancel">やめる</button>' : ''}`;
        return;
      }
      if (mode === 'meas') {
        const P = meas.pts; let last = 0, total = 0;
        for (let k = 1; k < P.length; k++) { const d = Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]); total += d; last = d; }
        bar.innerHTML = `<span class="small muted">${P.length ? '' : '測りたい所を2点タップしてください。線の端や線の上にくっつきます。'}</span>
          ${P.length > 1 ? `<span class="pill acc" style="font-size:15px">長さ ${last.toFixed(3)} m</span>${meas.cont && P.length > 2 ? `<span class="pill info" style="font-size:15px">合計 ${total.toFixed(3)} m</span>` : ''}` : ''}
          <span class="spacer"></span><label class="row small muted" style="gap:6px"><input type="checkbox" data-meas-cont ${meas.cont ? 'checked' : ''} style="width:20px;height:20px">続けて測る（合計を出す）</label>
          <button class="btn sm" data-act="measClear">やり直す</button>`;
      } else {
        const fx = fxList();
        const x = fx[fsel];
        const types = Object.entries(FIX_NAMES);
        bar.innerHTML = x ? `<b class="small">選んだ器具</b>
            <select class="in" data-fx="t" style="width:auto;min-height:40px">${types.map(([k, n]) => `<option value="${k}" ${x.t === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
            <label class="row small muted" style="gap:6px">壁側<select class="in" data-fx="back" style="width:auto;min-height:40px"><option value="">—</option>${BACKS.map(([k, n]) => `<option value="${k}" ${x.back === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <button class="btn sm danger" data-act="fxDel">${icon('trash')}消す</button><button class="btn sm ghost" data-act="fxDone">選ぶのをやめる</button>`
          : addAt ? `<b class="small">ここに器具を足す</b>
            <select class="in" id="fxNewT" style="width:auto;min-height:40px">${types.filter(([k]) => FIX_SIZE[k]).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
            <label class="row small muted" style="gap:6px">壁側<select class="in" id="fxNewB" style="width:auto;min-height:40px">${BACKS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label>
            <button class="btn sm primary" data-act="fxAdd">${icon('plus')}足す</button><button class="btn sm ghost" data-act="fxDone">やめる</button>`
          : `<span class="small muted">器具をタップすると、種類を変えたり消したりできます。何も無い所をタップすると、そこに器具を足せます。</span>`;
      }
      return;
    }
    const own = owner();
    const fl = body.querySelector('#dwgFaces');
    if (fl) fl.innerHTML = [...p.drawing.plan.faces].sort((a, b) => a.no - b.no).map(f => `<button data-face="${f.i}" class="${sel.has(f.i) ? 'on' : ''} ${own.has(f.i) && !sel.has(f.i) ? 'used' : ''}">区画${f.no}${f.name ? ' ' + esc(f.name) : ''} ${Math.round(f.area * 100) / 100}㎡</button>`).join('');
    const bar = body.querySelector('#dwgBar');
    if (bar) bar.innerHTML = sel.size
      ? `<button class="btn primary" data-act="mkOne">${icon('plus')}選んだ ${sel.size} 区画を1部屋にする</button>${sel.size > 1 ? `<button class="btn" data-act="mkEach">1区画ずつ部屋にする</button>` : ''}<button class="btn ghost" data-act="selClear">選ぶのをやめる</button>`
      : `<span class="small muted">区画をタップすると選べます。</span><span class="spacer"></span><button class="btn sm" data-act="selRest">まだ部屋にしていない区画を全部選ぶ</button>`;
  };
  const makeRooms = each => {
    const plan = p.drawing.plan;
    const ids = [...sel];
    /* 選んだ区画が別の部屋に入っていたら、その部屋から外す */
    p.rooms.forEach(r => {
      if (!r.faces) return;
      const keep = r.faces.filter(i => !sel.has(i));
      if (keep.length !== r.faces.length) {
        r.faces = keep;
        if (keep.length) { const g = groupGeom(keep.map(i => plan.faces.find(f => f.i === i)).filter(Boolean)); r.area = g.area; r.perim = g.perim; }
      }
    });
    p.rooms = p.rooms.filter(r => !(r.src === 'plan' && r.faces && !r.faces.length));
    const used = new Set(p.rooms.map(r => r.color));
    const nextColor = () => { for (let c = 0; c < 99; c++) if (!used.has(c)) { used.add(c); return c; } return 0; };
    const byNo = (a, b) => plan.faces.find(f => f.i === a).no - plan.faces.find(f => f.i === b).no;
    const groups = each ? ids.sort(byNo).map(i => [i]) : [ids.sort(byNo)];
    const defCH = planCH(plan);
    groups.forEach(g => {
      const F = g.map(i => plan.faces.find(f => f.i === i)).filter(Boolean);
      const geo = groupGeom(F);
      const names = [...new Set(F.map(f => f.name).filter(Boolean))];
      const chs = F.map(f => +f.ch || 0).filter(v => v > 0);
      const runs = p.drawing.open ? roomOpenRuns(g, plan, p.drawing.open) : [];
      p.rooms.push({ id: uid('r'), name: names.join('・') || `区画 ${F.map(f => f.no).join('・')}`, shape: 'free', area: geo.area, perim: geo.perim,
        h: chs.length ? Math.max(...chs) : (defCH || ''), qty: 1, doors: 0, winCount: 0, windows: [], faces: g, src: 'plan', color: nextColor(), openRuns: runs });
    });
    /* 区画を外した部屋の開口も決め直す */
    if (p.drawing.open) p.rooms.forEach(r => { if (r.src === 'plan' && r.faces) r.openRuns = roomOpenRuns(r.faces, plan, p.drawing.open); });
    const n = groups.length;
    const made = p.rooms.slice(-n);
    const od = made.reduce((s, r) => s + (r.openRuns || []).filter(x => x.ty === 'd').length, 0), og = made.reduce((s, r) => s + (r.openRuns || []).filter(x => x.ty !== 'd').length, 0);
    sel.clear(); touch(p); draw();
    toast(od + og ? `${n} 部屋を作りました。図面のドア ${od} か所・開口 ${og} か所を壁の面積から引きました` : `${n} 部屋を作りました`, { ms: 5000 });
  };
  const draw = () => {
    body.innerHTML = drawingCard(p) + `<div class="rooms">${p.rooms.map(roomCard).join('') || `<div class="card empty"><b>まだ部屋がありません</b>下のボタンで部屋を足してください。</div>`}</div>
      <div class="addbar" style="margin-top:12px"><button class="btn primary" id="addRoom">${icon('plus')}部屋を足す</button>
      </div>`;
    view = null;
    /* 前の版で読み込んだ図面は、区画の番号を前のKAKUと同じ付け方に直す（部屋とのつながりは区画の i なので変わらない） */
    if (p.drawing && p.drawing.plan && p.drawing.plan.order !== 2) { orderFacesOf(p.drawing.plan); p.drawing.plan.order = 2; touch(p); }
    if (p.drawing && p.drawing.plan) {
      view = planView(body.querySelector('#dwgView'), p.drawing.plan, {
        selected: () => sel, owner, fixtures: fxList, fixSel: () => (mode === 'fix' ? fsel : -1), mode: () => mode, fixG: p.drawing.fixG || '', fixGd: p.drawing.fixGd || '',
        onTap: i => { if (sel.has(i)) sel.delete(i); else sel.add(i); paintSel(); },
        onPoint: (x, y, sc) => {
          if (mode === 'fix') {
            const k = fxList().findIndex(f => x >= f.b[0] - 0.03 && x <= f.b[2] + 0.03 && y >= f.b[1] - 0.03 && y <= f.b[3] + 0.03);
            if (k >= 0) { fsel = fsel === k ? -1 : k; addAt = null; } else { fsel = -1; addAt = [x, y]; }
            paintSel(); return;
          }
          if (mode === 'light') {
            const d = p.drawing; d.lights = d.lights || []; d.switches = d.switches || []; d.outlets = d.outlets || []; d.link = d.link || {};
            const tol = Math.max(0.2, sc * 14), near = list => list.findIndex(q => Math.hypot(q.x - x, q.y - y) < tol);
            const redo = () => { syncDemoLines(p); touch(p); paintSel(); };
            const undoT = (msg, fn) => toast(msg, { action: '元に戻す', onAction: () => { fn(); redo(); } });
            if (ltool === 'panel') { const was = d.panel; d.panel = [r3(x), r3(y)]; redo(); undoT('分電盤を置きました', () => { d.panel = was; }); return; }
            if (ltool === 'link') {
              if (!linkSel) { const k = near(d.lights); if (k < 0) { toast('照明をタップしてください', { bad: true }); return; } linkSel = d.lights[k].id; paintSel(); return; }
              const W = lightWires(p), all = [...W.sws, ...d.switches.map(q => ({ key: q.id, l: [q.x, q.y] }))];
              let best = null, bd = tol; all.forEach(s0 => { const dd = Math.hypot(s0.l[0] - x, s0.l[1] - y); if (dd < bd) { bd = dd; best = s0; } });
              if (!best) { linkSel = null; paintSel(); toast('スイッチをタップしてください。やめました'); return; }
              const id = linkSel, was = d.link[id]; d.link[id] = best.key; linkSel = null; redo(); undoT('つなぎ替えました', () => { if (was) d.link[id] = was; else delete d.link[id]; }); return;
            }
            if (ltool === 'sw') {
              const k = near(d.switches);
              if (k >= 0) { const was = d.switches.splice(k, 1)[0]; Object.keys(d.link).forEach(q => { if (d.link[q] === was.id) delete d.link[q]; }); redo(); undoT('スイッチを消しました', () => d.switches.push(was)); return; }
              d.switches.push({ id: uid('S'), x: r3(x), y: r3(y) }); redo(); return;
            }
            if (ltool === 'out') {
              const k = near(d.outlets);
              if (k >= 0) { const was = d.outlets.splice(k, 1)[0]; redo(); undoT('コンセントを消しました', () => d.outlets.push(was)); return; }
              d.outlets.push({ id: uid('O'), x: r3(x), y: r3(y), item: lset.out || 'e-cone' }); redo(); return;
            }
            const k = near(d.lights);
            if (k >= 0) { const was = d.lights.splice(k, 1)[0]; delete d.link[was.id]; redo(); undoT('照明を消しました', () => d.lights.push(was)); return; }
            const r = p.rooms.find(rr => rr.src === 'plan' && (rr.faces || []).some(i => { const f = d.plan.faces.find(z => z.i === i); return f && pip(x, y, f.poly); }));
            if (!r) { toast('部屋にした区画の中をタップしてください', { bad: true }); return; }
            d.lights.push({ id: uid('L'), x: Math.round(x * 20) / 20, y: Math.round(y * 20) / 20, item: lset.item, room: r.id });
            redo(); return;
          }
          if (mode === 'wall' && wway === 'range') { wpts.push(snapPt(p.drawing.plan, x, y, sc * 16)); paintSel(); return; }
          if (mode === 'wall') {
            const i = nearestSeg(p.drawing.plan, x, y, sc * 18);
            if (i >= 0) { if (wsel.has(i)) wsel.delete(i); else wsel.add(i); paintSel(); }
            return;
          }
          if (mode === 'cut') {
            const q = snapPt(p.drawing.plan, x, y, sc * 14);
            if (!cutA) { cutA = q; paintSel(); return; }
            const rect = [Math.min(cutA[0], q[0]), Math.min(cutA[1], q[1]), Math.max(cutA[0], q[0]), Math.max(cutA[1], q[1])].map(r3);
            cutA = null;
            if (rect[2] - rect[0] < 0.05 || rect[3] - rect[1] < 0.05) { toast('範囲が小さすぎます。もう一度、四角の角を2か所タップしてください', { bad: true }); paintSel(); return; }
            p.drawing.hatsu = p.drawing.hatsu || [];
            p.drawing.hatsu.push({ id: uid('h'), rect, w: r3(rect[2] - rect[0]), l: r3(rect[3] - rect[1]), t: 100, d: 300, cut: true, back: true });
            syncDemoLines(p); touch(p); paintSel(); toast('カッターの範囲を明細に入れました（厚みと深さを確かめてください）', { ms: 4000 });
            return;
          }
          if (mode === 'meas') {
            const q = snapPt(p.drawing.plan, x, y, sc * 16);
            if (!meas.cont && meas.pts.length >= 2) meas.pts = [];
            meas.pts.push(q); paintSel();
          }
        }
      });
      paintSel();
    }
    const fi = body.querySelector('#dwgFile');
    if (fi) fi.onchange = async e => {
      const files = [...e.target.files]; if (!files.length) return;
      if (p.drawing && p.rooms.some(r => r.src === 'plan') && !(await ask('図面を読み直しますか？', '今の図面から作った部屋は残りますが、図面とのつながりは外れます。', { ok: '読み直す' }))) { e.target.value = ''; return; }
      const st = body.querySelector('#dwgStatus'); if (st) st.textContent = '図面を読み込んでいます…（大きい図面は少し時間がかかります）';
      try {
        const cad = files.find(f => /\.(jww|jwc|dxf)$/i.test(f.name));
        let res;
        if (cad) {
          res = await readWithFixtures(cad);
          orderFacesOf(res.plan); res.plan.order = 2;
        } else res = await importDrawing(files);
        if (!res.plan || !res.plan.faces.length) { const msg = res.message || '部屋の区画が見つかりませんでした'; if (st) st.textContent = msg; toast(msg, { bad: true }); return; }
        p.rooms.forEach(r => { if (r.src === 'plan') { r.src = 'plan-old'; delete r.faces; } });
        p.drawing = { fileName: (cad ? [cad] : files).map(f => f.name).join('、'), at: Date.now(), plan: res.plan, fixtures: cad ? res.fixtures : null, open: cad ? res.open : null, doors: cad ? (res.doorList || []) : [], fixG: cad ? res.fixG : '', fixGd: cad ? res.fixGd : '' };
        sel.clear(); touch(p); draw();
        toast(`区画を ${res.plan.faces.length} 個${cad ? `、器具を ${res.fixtures.filter(x => x.t !== 'other').length} 個` : ''}見つけました`);
      } catch (err) {
        if (st) st.textContent = '読み込めませんでした：' + err.message;
        toast('図面を読み込めませんでした：' + err.message, { bad: true });
      }
    };
    $('#addRoom').onclick = () => {
      p.rooms.push({ id: uid('r'), name: `部屋 ${String(p.rooms.length + 1).padStart(2, '0')}`, shape: 'rect', w: '', d: '', h: '', qty: 1, doors: 0, winCount: 0, windows: [] });
      touch(p); draw(); refresh();
      const last = body.querySelector('.roomc:last-child [data-rk="w"]'); if (last) last.focus();
    };
    refresh();
  };
  body.addEventListener('input', e => {
    const card = e.target.closest('[data-room]'); if (!card) return;
    const r = p.rooms.find(x => x.id === card.dataset.room); if (!r) return;
    if (e.target.dataset.rk) r[e.target.dataset.rk] = e.target.dataset.rk === 'name' ? e.target.value : e.target.value === '' ? '' : Number(e.target.value);
    if (e.target.dataset.wk) { const w = r.windows[+e.target.dataset.wi]; w[e.target.dataset.wk] = e.target.value === '' ? '' : Number(e.target.value); }
    touch(p); refresh();
  });
  body.addEventListener('change', e => {
    if (e.target.matches('[data-meas-cont]')) { meas.cont = e.target.checked; meas.pts = []; paintSel(); return; }
    if (e.target.id === 'oItem') { lset.out = e.target.value; return; }
    if (e.target.id === 'lItem') { lset.item = e.target.value; lset.lm = DEF_LM[lset.item] || 800; const i = $('#lLm', body); if (i) i.value = lset.lm; return; }
    const wr = e.target.closest('[data-wall]'), hr = e.target.closest('[data-hatsu]');
    if (wr && e.target.dataset.wk) { const w = (p.drawing.walls || []).find(x => x.id === wr.dataset.wall); if (w) { const k = e.target.dataset.wk; if (k === 'room') w.room = e.target.value; else w[k === 'open' ? 'open' : 'h'] = Math.max(0, Number(e.target.value) || 0); syncDemoLines(p); touch(p); paintSel(); } return; }
    if (hr && e.target.dataset.hk) { const h = (p.drawing.hatsu || []).find(x => x.id === hr.dataset.hatsu); if (h) { const k = e.target.dataset.hk; h[k] = e.target.type === 'checkbox' ? e.target.checked : Math.max(0, Number(e.target.value) || 0); syncDemoLines(p); touch(p); paintSel(); } return; }
    const k = e.target.dataset.fx;
    if (k && fsel >= 0) { const x = fxList()[fsel]; if (!x) return; x[k] = e.target.value; x.edited = true; if (k === 'back' || k === 't') x.out = null; touch(p); paintSel(); }
  });
  body.addEventListener('click', async e => {
    const mb = e.target.closest('[data-mode]');
    const ww = e.target.closest('[data-wway]');
    if (ww) { wway = ww.dataset.wway; wsel.clear(); wpts.length = 0; paintSel(); return; }
    const lt = e.target.closest('[data-ltool]');
    if (lt) { ltool = lt.dataset.ltool; linkSel = null; paintSel(); return; }
    if (mb) { mode = mb.dataset.mode; fsel = -1; addAt = null; cutA = null; linkSel = null; wsel.clear(); wpts.length = 0; if (mode !== 'meas') meas.pts = []; paintSel(); return; }
    const fb = e.target.closest('[data-face]');
    if (fb) { const i = +fb.dataset.face; if (sel.has(i)) sel.delete(i); else sel.add(i); paintSel(); return; }
    const da = e.target.closest('[data-act]');
    if (da && !da.closest('[data-room]')) {
      const a = da.dataset.act;
      if (a === 'fixLines') return fixLinesDialog(p, () => {});
      if (a === 'measClear') { meas.pts = []; paintSel(); return; }
      if (a === 'wallClear') { wsel.clear(); wpts.length = 0; paintSel(); return; }
      if (a === 'sketch') {
        openSketch(p, { onSave: () => touch(p), onApply: async sk => {
          const had = p.rooms.some(r => r.src === 'plan');
          if (had && !(await ask('間取りを入れ替えますか？', '今の図面と、図面から作った部屋を、この間取りに入れ替えます。手で足した部屋はそのままです。', { ok: '入れ替える' }))) return false;
          const keep = p.drawing && p.drawing.sketch ? p.drawing : null;
          const plan = sketchPlan(sk.rooms); orderFacesOf(plan); plan.order = 2;
          p.drawing = { fileName: '寸法で作った間取り', at: Date.now(), plan, fixtures: [], open: {}, doors: [], fixG: '', fixGd: '', sketch: true,
            lights: [], walls: [], hatsu: [], panel: null, wireExtra: keep ? keep.wireExtra : undefined };
          const old = new Map(p.rooms.filter(r => r.src === 'plan' && r.sk).map(r => [r.sk, r]));
          p.rooms = p.rooms.filter(r => r.src !== 'plan');
          plan.faces.slice().sort((a, b) => a.no - b.no).forEach((f, k) => {
            const o = old.get(f.sk);
            p.rooms.push({ ...(o || { id: uid('r'), qty: 1, doors: 0, winCount: 0, windows: [], h: '' }), name: f.name || `区画 ${f.no}`, shape: 'free', area: f.area, perim: f.peri, faces: [f.i], src: 'plan', sk: f.sk, color: o ? o.color : k, openRuns: [] });
          });
          syncDemoLines(p); touch(p); draw(); toast(`${plan.faces.length} 部屋の間取りを図面にしました`);
          return true;
        } });
        return;
      }
      if (a === 'cadOut') { cadExport(p); return; }
      if (a === 'open3d') { flush(); toast('3Dを用意しています…'); open3D(p, { onClose: wins => {
        if (!wins || JSON.stringify(wins) === JSON.stringify(p.drawing.win3d || [])) return;
        const n = applyWin3d(p, wins); touch(p); draw(); if (wins.length) toast(`3Dの窓 ${wins.length} か所を、面している部屋の窓に入れました（${n} 部屋）`, { ms: 4000 });
      } }).catch(e => showError(e)); return; }
      if (a === 'linkClear') { const was = p.drawing.link; p.drawing.link = {}; syncDemoLines(p); touch(p); paintSel(); toast('つなぎ替えを元に戻しました', { action: '取り消す', onAction: () => { p.drawing.link = was; syncDemoLines(p); touch(p); paintSel(); } }); return; }
      if (a === 'oClear') { const was = p.drawing.outlets; p.drawing.outlets = []; syncDemoLines(p); touch(p); paintSel(); toast('コンセントを全部消しました', { action: '元に戻す', onAction: () => { p.drawing.outlets = was; syncDemoLines(p); touch(p); paintSel(); } }); return; }
      if (a === 'oAuto') {
        const d = p.drawing, item = lset.out || 'e-cone';
        const pts = (d.fixtures || []).map(x => x.out || outFallback(x)).filter(Boolean);
        d.outlets = (d.outlets || []).filter(o => !o.auto).concat(pts.map(q => ({ id: uid('O'), x: q[0], y: q[1], item, auto: true })));
        syncDemoLines(p); touch(p); paintSel(); toast(`コンセントを ${pts.length} 個置きました（便器の横・洗面カウンターの背面）`); return;
      }
      if (a === 'lClear') { const before = p.drawing.lights; p.drawing.lights = []; syncDemoLines(p); touch(p); paintSel(); toast('照明を全部消しました', { action: '元に戻す', onAction: () => { p.drawing.lights = before; syncDemoLines(p); touch(p); paintSel(); } }); return; }
      if (a === 'lAuto') {
        lset.room = $('#lRoom', body).value; lset.use = $('#lUse', body).value; lset.item = $('#lItem', body).value; lset.lm = Number($('#lLm', body).value) || DEF_LM[lset.item] || 800;
        const d = p.drawing, targets = p.rooms.filter(r => r.src === 'plan' && (lset.room === 'all' || r.id === lset.room));
        d.lights = (d.lights || []).filter(x => !targets.some(r => r.id === x.room));
        let n = 0;
        (async () => {
          toast('照明を並べています…');
          for (const r of targets) {
            r.lightUse = lset.use; r.lightLm = lset.lm;
            const ch = Number(r.h) || planCH(d.plan) || opts().ceilH;
            const faces = (r.faces || []).map(i => d.plan.faces.find(z => z.i === i)).filter(Boolean);
            const res = await oldFaceLights(faces, d.fixtures, { base: lset.use ? 2 : pitchFor(ch, 2), need: f => lset.use ? needCount(f.poly, ch, lset.use, lset.lm) : 0 });
            res.forEach(o => o.pts.forEach(q => { d.lights.push({ id: uid('L'), x: q[0], y: q[1], item: lset.item, room: r.id, auto: true }); n++; }));
          }
          syncDemoLines(p); touch(p); paintSel(); toast(`照明を ${n} 台並べました。スイッチと配線も明細に入れました`, { ms: 4000 });
        })().catch(e => showError(e));
        return;
      }
      if (a === 'cutCancel') { cutA = null; paintSel(); return; }
      if (a === 'wallAdd') {
        const segs = wway === 'seg' ? [...wsel] : null, pts = wway === 'range' ? wpts.map(q => [r3(q[0]), r3(q[1])]) : null;
        const len = segs ? segs.reduce((s2, i) => s2 + segLen(p.drawing.plan.segs[i]), 0) : pts.reduce((s2, q, i) => i ? s2 + Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0, 0);
        if (!(len > 0)) return;
        const h = Number($('#wH', body).value) || opts().ceilH, open = Math.max(0, Number($('#wOpen', body).value) || 0);
        const itemId = $('#wItem', body).value, baseId = $('#wBase', body).value, finId = $('#wFin', body).value, name = $('#wName', body).value.trim(), room = $('#wRoom', body).value;
        if (!itemId && !baseId && !finId) { toast('解体・下地・仕上げのどれかを選んでください', { bad: true }); return; }
        state.wallSet = { demo: itemId, base: baseId, fin: finId };
        p.drawing.walls = p.drawing.walls || [];
        p.drawing.walls.push({ id: uid('w'), ...(segs ? { segs } : { pts }), len: r3(len), h, open, itemId, baseId, finId, name, room });
        wsel.clear(); wpts.length = 0; syncDemoLines(p); touch(p); paintSel();
        const rn = room && p.rooms.find(x => x.id === room);
        toast(`壁を明細に入れました（${r3(len)}m × ${h}m${open ? ` − ${open}㎡` : ''}）${rn ? `。「${rn.name}」の壁の行から同じ分を引きます` : ''}`, { ms: 4000 });
        return;
      }
      if (a === 'wallDel' || a === 'hatsuDel') {
        const key = a === 'wallDel' ? 'walls' : 'hatsu', el = da.closest(a === 'wallDel' ? '[data-wall]' : '[data-hatsu]');
        const id = el && (el.dataset.wall || el.dataset.hatsu);
        const before = [...(p.drawing[key] || [])];
        p.drawing[key] = before.filter(x => x.id !== id); syncDemoLines(p); touch(p); paintSel();
        toast('消しました', { action: '元に戻す', onAction: () => { p.drawing[key] = before; syncDemoLines(p); touch(p); paintSel(); } });
        return;
      }
      if (a === 'fxDone') { fsel = -1; addAt = null; paintSel(); return; }
      if (a === 'fxDel') {
        const fx = fxList(), x = fx[fsel]; if (!x) return;
        fx.splice(fsel, 1); fsel = -1; touch(p); paintSel();
        toast(`${FIX_NAMES[x.t] || '器具'}を消しました`, { action: '元に戻す', onAction: () => { fxList().push(x); touch(p); paintSel(); } });
        return;
      }
      if (a === 'fxAdd' && addAt) {
        const t = $('#fxNewT', body).value, bk = $('#fxNewB', body).value;
        let [w, h] = FIX_SIZE[t] || [0.5, 0.5]; if (bk === 'E' || bk === 'W') [w, h] = [h, w];
        const q3 = v => Math.round(v * 1000) / 1000;
        if (!p.drawing.fixtures) p.drawing.fixtures = [];
        p.drawing.fixtures.push({ t, b: [q3(addAt[0] - w / 2), q3(addAt[1] - h / 2), q3(addAt[0] + w / 2), q3(addAt[1] + h / 2)], back: bk, added: true });
        addAt = null; fsel = -1; touch(p); paintSel(); toast(`${FIX_NAMES[t]}を足しました`);
        return;
      }
      if (a === 'mkOne') return makeRooms(false);
      if (a === 'mkEach') return makeRooms(true);
      if (a === 'selClear') { sel.clear(); paintSel(); return; }
      if (a === 'selRest') { const own = owner(); p.drawing.plan.faces.forEach(f => { if (!own.has(f.i)) sel.add(f.i); }); paintSel(); return; }
      if (a === 'dwgClear') {
        if (!(await ask('図面を消しますか？', '図面から作った部屋は残ります（図面とのつながりだけ外れます）。', { ok: '消す', danger: true }))) return;
        const old = p.drawing; p.drawing = null; p.rooms.forEach(r => { if (r.src === 'plan') r.src = 'plan-old'; });
        touch(p); draw(); toast('図面を消しました', { action: '元に戻す', onAction: () => { p.drawing = old; p.rooms.forEach(r => { if (r.src === 'plan-old' && r.faces) r.src = 'plan'; }); touch(p); draw(); } });
        return;
      }
    }
    const card = e.target.closest('[data-room]'); if (!card) return;
    const r = p.rooms.find(x => x.id === card.dataset.room); if (!r) return;
    if (e.target.matches('[data-open-toggle]')) { r.openOff = !e.target.checked; touch(p); refresh(); return; }
    const sh = e.target.closest('[data-shape]');
    if (sh) {
      r.shape = sh.dataset.shape;
      if (r.shape === 'free' && !(r.area > 0) && r.w > 0 && r.d > 0) { r.area = Math.round(r.w * r.d * 1000) / 1000; r.perim = Math.round(2 * (r.w + r.d) * 1000) / 1000; }
      touch(p); draw(); return;
    }
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'addWin') { r.windows = r.windows || []; r.windows.push({ w: 1690, h: 1800, n: 1 }); }
    if (a.dataset.act === 'delWin') r.windows.splice(+a.dataset.wi, 1);
    if (a.dataset.act === 'dupRoom') { const c = JSON.parse(JSON.stringify(r)); c.id = uid('r'); c.name = r.name + '（コピー）'; p.rooms.splice(p.rooms.indexOf(r) + 1, 0, c); }
    if (a.dataset.act === 'delRoom') {
      const used = p.lines.filter(l => l.basis && Array.isArray(l.basis.rooms) && l.basis.rooms.includes(r.id));
      const idx = p.rooms.indexOf(r);
      p.rooms.splice(idx, 1);
      used.forEach(l => { l.basis.rooms = l.basis.rooms.filter(id => id !== r.id); });
      touch(p); draw();
      toast(`「${r.name}」を消しました`, { action: '元に戻す', onAction: () => { p.rooms.splice(idx, 0, r); used.forEach(l => l.basis.rooms.push(r.id)); touch(p); draw(); } });
      return;
    }
    touch(p); draw();
  });
  draw();
}

/* ---------- ③ 工事 ---------- */
function roomSel(l, rooms) {
  const b = l.basis || {};
  const v = b.rooms === 'all' || !Array.isArray(b.rooms) ? 'all' : b.rooms.length === 1 ? b.rooms[0] : 'multi';
  return `<select class="in" data-lk="rooms"><option value="all" ${v === 'all' ? 'selected' : ''}>全部の部屋</option>
    ${rooms.map(r => `<option value="${esc(r.id)}" ${v === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
    <option value="multi" ${v === 'multi' ? 'selected' : ''}>${v === 'multi' ? `${b.rooms.length}部屋を選択中…` : '部屋をいくつか選ぶ…'}</option></select>`;
}
function pipePanel(l, lines) {
  const set = l.pipeSet || {};
  const opts2 = sysOptions(l.pipe);
  const sys = set.sys || opts2[0];
  const kids = lines.filter(x => x.parent === l.id).length;
  return `<div class="pipeset" style="grid-column:1/-1">
    <div class="row"><span class="small muted">系統</span><div class="seg">${opts2.map(k => `<button data-sys="${k}" class="${sys === k ? 'on' : ''}">${SYS[k]}</button>`).join('')}</div>
    <label class="row small muted" style="gap:6px">継手の多さ<select class="in" data-pk="many" style="width:auto;min-height:38px">${MANY.map(([v, n]) => `<option value="${v}" ${String(set.many || 1) === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    ${sys === 'w' || sys === 'h' ? `<label class="row small muted" style="gap:6px"><input type="checkbox" data-pk="hoon" ${set.hoon ? 'checked' : ''} style="width:20px;height:20px">保温する</label>` : ''}
    <span class="spacer"></span>
    <button class="btn sm ${kids ? '' : 'primary'}" data-act="pipeKids">${icon('plus')}${kids ? `継手などを付け直す（今 ${kids} 行）` : '継手・支持金具・手間を付ける'}</button></div>
  </div>`;
}
function lineCard(l, rooms, lines = []) {
  const link = l.basis && l.basis.measure === 'link';
  const auto = isRoomBased(l) || link;
  const catName = (categories().find(c => c[0] === l.cat) || [])[1] || '';
  return `<div class="linec ${l.parent ? 'child' : ''} ${l.pipe ? 'pipe' : ''}" data-line="${l.id}">
    <div class="name"><span class="cat">${l.sys || (l.pipeSet && l.pipeSet.sys) ? `<span class="pill info" style="padding:1px 7px">${SYS[l.sys || l.pipeSet.sys]}</span> ` : ''}${l.parent ? '↳ 配管に付く行・' : ''}${esc(catName)}${catName ? '・' : ''}${KINDS[l.kind] || 'その他'}</span>
      <input class="in" data-lk="name" value="${esc(l.name)}" placeholder="工事項目" aria-label="工事項目">
      <input class="in" data-lk="spec" value="${esc(l.spec || '')}" placeholder="規格・仕様（なくても可）" aria-label="規格・仕様" style="min-height:40px;font-size:14px"></div>
    <label class="f">数え方<select class="in" data-lk="measure">${Object.entries(MEASURES).filter(([k]) => k !== 'link' || link).map(([k, m]) => `<option value="${k}" ${(auto ? l.basis.measure : 'manual') === k ? 'selected' : ''}>${k === 'manual' && l.pipe ? '長さを手で入れる' : m.label}</option>`).join('')}</select>
      ${auto && !link ? roomSel(l, rooms) : ''}</label>
    <label class="f">${l.pipe ? '長さ（m）・単位' : '数量・単位'}<div class="qtybox">
      ${auto ? `<div class="in num" style="display:flex;align-items:center;justify-content:flex-end;background:var(--panel2)" data-out="qty:${l.id}"></div>` : `<input class="in num" type="number" inputmode="decimal" step="any" min="0" data-lk="qty" value="${esc(l.qty)}">`}
      <input class="in" data-lk="unit" value="${esc(l.unit || '')}" style="width:62px;padding:10px 6px;text-align:center" aria-label="単位"></div></label>
    <label class="f">単価（円）<input class="in num" type="number" inputmode="numeric" step="any" min="0" data-lk="price" value="${esc(l.price)}"></label>
    <div class="amt" data-out="amt:${l.id}"></div>
    <button class="iconbtn del" data-act="delLine" title="この行を消す" aria-label="この行を消す">${icon('trash')}</button>
    ${auto || l.applyLoss ? `<div class="qtyinfo" data-out="qinfo:${l.id}"></div>` : ''}
    ${l.pipe ? pipePanel(l, lines) : ''}
    <details class="more" style="grid-column:1/-1"><summary>くわしく（区分・ロス率・原価・コピー）</summary>
      <div class="opts" style="margin-top:10px">
        <label class="f">区分<select class="in" data-lk="kind">${Object.entries(KINDS).map(([k, n]) => `<option value="${k}" ${(l.kind || 'other') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="f">ロス率<span class="hint">空なら ${opts().loss}%（材料だけ）</span><div class="unitwrap"><input class="in num" type="number" inputmode="decimal" data-lk="loss" value="${esc(l.loss ?? '')}"><span>%</span></div></label>
        <label class="f">原価（1単位）<span class="hint">外注・その他だけ</span><input class="in num" type="number" inputmode="numeric" data-lk="cost" value="${esc(l.cost ?? '')}"></label>
        <div class="f" style="justify-content:flex-end"><button class="btn sm" data-act="dupLine">${icon('copy')}この行をコピー</button></div>
      </div></details>
  </div>`;
}

function stepLines(ctx) {
  const { p, body, refresh } = ctx;
  const draw = () => {
    body.innerHTML = `
      <div class="addbar" style="margin-bottom:12px"><button class="btn primary" data-act="pick">${icon('list')}一覧から選ぶ</button><button class="btn" data-act="free">${icon('plus')}自由に入れる</button>
        <span class="spacer"></span><span class="pill">行 <b data-out="linecount"></b></span><span class="pill acc">小計 <b data-out="subtotal"></b></span></div>
      <div class="lines">${p.lines.map(l => lineCard(l, p.rooms, p.lines)).join('') || `<div class="card empty"><b>まだ工事の品目がありません</b>「一覧から選ぶ」で、床・壁・天井の仕上げや解体などを選んでください。</div>`}</div>
      ${p.lines.length > 3 ? `<div class="addbar" style="margin-top:12px"><button class="btn primary" data-act="pick">${icon('list')}一覧から選ぶ</button><button class="btn" data-act="free">${icon('plus')}自由に入れる</button></div>` : ''}`;
    refresh();
  };
  ctx.redraw = draw;
  body.addEventListener('input', e => {
    const card = e.target.closest('[data-line]'); if (!card) return;
    const l = p.lines.find(x => x.id === card.dataset.line); const k = e.target.dataset.lk; if (!l || !k) return;
    if (k === 'measure' || k === 'rooms' || k === 'kind') return;
    l[k] = ['qty', 'price', 'loss', 'cost'].includes(k) ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
    touch(p); refresh();
  });
  body.addEventListener('change', async e => {
    const card = e.target.closest('[data-line]'); if (!card) return;
    const l = p.lines.find(x => x.id === card.dataset.line); const k = e.target.dataset.lk; if (!l) return;
    if (k === 'measure') {
      const m = e.target.value;
      if (m === 'manual') { l.qty = lineQty(l, p.rooms, opts(), p.lines) || l.qty || 1; l.basis = null; delete l.parent; }
      else l.basis = { measure: m, rooms: l.basis && l.basis.rooms ? l.basis.rooms : 'all' };
      touch(p); draw(); return;
    }
    if (k === 'rooms') {
      const v = e.target.value;
      if (v === 'multi') { await pickRooms(p, l); draw(); return; }
      l.basis.rooms = v === 'all' ? 'all' : [v];
      touch(p); refresh(); return;
    }
    if (k === 'kind') { l.kind = e.target.value; touch(p); draw(); return; }
    const pk = e.target.dataset.pk;
    if (pk && l.pipe) {
      l.pipeSet = { ...(l.pipeSet || {}), [pk]: pk === 'hoon' ? e.target.checked : Number(e.target.value) };
      if (p.lines.some(x => x.parent === l.id)) rebuild(p, l, masterItems());
      touch(p); draw();
    }
  });
  body.addEventListener('click', e => {
    const sb = e.target.closest('[data-sys]');
    if (sb) {
      const l = p.lines.find(x => x.id === sb.closest('[data-line]').dataset.line);
      if (l && l.pipe) {
        l.pipeSet = { ...(l.pipeSet || {}), sys: sb.dataset.sys };
        if (p.lines.some(x => x.parent === l.id)) rebuild(p, l, masterItems());
        touch(p); draw();
      }
      return;
    }
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'pick') return openPicker(p, draw);
    if (a.dataset.act === 'free') {
      p.lines.push({ id: uid('l'), name: '', spec: '', unit: '式', kind: 'other', qty: 1, price: '', cost: '', loss: '', sheet: 0, basis: null, cat: '' });
      touch(p); draw();
      const ins = body.querySelectorAll('[data-lk="name"]'); ins[ins.length - 1].focus();
      return;
    }
    const card = a.closest('[data-line]'); if (!card) return;
    const l = p.lines.find(x => x.id === card.dataset.line); if (!l) return;
    const idx = p.lines.indexOf(l);
    if (a.dataset.act === 'delLine') {
      const before = [...p.lines];
      const kids = p.lines.filter(x => x.parent === l.id);
      p.lines = p.lines.filter(x => x !== l && x.parent !== l.id);
      touch(p); draw();
      toast(kids.length ? `「${l.name}」と付いていた ${kids.length} 行を消しました` : `「${l.name || '行'}」を消しました`, { action: '元に戻す', onAction: () => { p.lines = before; touch(p); draw(); } });
    }
    if (a.dataset.act === 'pipeKids') {
      const n = rebuild(p, l, masterItems());
      touch(p); draw(); toast(`継手・支持金具・手間など ${n} 行を付けました`);
    }
    if (a.dataset.act === 'dupLine') { const c = JSON.parse(JSON.stringify(l)); c.id = uid('l'); p.lines.splice(idx + 1, 0, c); touch(p); draw(); toast('行をコピーしました'); }
  });
  draw();
}

function pickRooms(p, l) {
  return new Promise(res => {
    const cur = new Set(Array.isArray(l.basis.rooms) ? l.basis.rooms : p.rooms.map(r => r.id));
    const m = modal({
      title: '使う部屋を選ぶ',
      body: `<p class="muted small" style="margin-top:0">「${esc(l.name)}」の数量に入れる部屋にチェックを付けてください。</p>` + p.rooms.map(r => `<label class="pick" style="cursor:pointer"><input type="checkbox" value="${esc(r.id)}" ${cur.has(r.id) ? 'checked' : ''} style="width:22px;height:22px"><span class="nm">${esc(r.name)}<small>床 ${fmt(roomGeom(r, opts()).floor)}㎡</small></span></label>`).join(''),
      foot: `<button class="btn primary" data-ok>決める</button>`,
      onClose: res
    });
    m.el.querySelector('[data-ok]').onclick = () => {
      const ids = $$('input[type=checkbox]', m.el).filter(c => c.checked).map(c => c.value);
      l.basis.rooms = ids.length === p.rooms.length ? 'all' : ids;
      touch(p); m.close();
    };
  });
}

export function openPicker(p, after) {
  const items = masterItems();
  const cats = categories();
  let cat = state.pickCat || 'all', q = '', added = 0;
  const m = modal({
    title: '工事の品目を選ぶ', wide: true,
    body: `<div class="unitwrap"><input class="in" id="pq" type="search" placeholder="品目で探す（例：クロス、石膏ボード 12.5、HIVP 20）" enterkeyhint="search"><span>${icon('search')}</span></div>
      <div class="catchips" id="pc"></div><div class="small muted" id="pn" style="margin:2px 0 6px"></div><div class="picklist" id="pl"></div>`,
    foot: `<span class="small muted" id="padded" style="margin-right:auto"></span><button class="btn primary" data-close>終わる</button>`,
    onClose: () => { after(); if (added) toast(`${added} 件の品目を足しました`); }
  });
  const draw = () => {
    $('#pc', m.el).innerHTML = [['all', 'すべて'], ...cats].map(([k, n]) => `<button data-c="${k}" class="${cat === k ? 'on' : ''}">${esc(n)}</button>`).join('');
    const qq = q.trim().toLowerCase();
    const list = items.filter(i => (cat === 'all' || (i.custom ? 'custom' : i.cat) === cat) && matchItem(i, qq)).slice(0, 300);
    const have = new Set(p.lines.map(l => l.itemId));
    $('#pn', m.el).textContent = `${list.length} 件${cat === 'all' && !qq ? '（種類を選ぶか、名前で探すと絞れます）' : ''}`;
    $('#pl', m.el).innerHTML = list.map(i => `<button class="pick ${have.has(i.id) ? 'added' : ''}" data-id="${esc(i.id)}">
      <span class="nm">${esc(i.name)}<small>${esc(i.spec || '')}${i.measure !== 'manual' ? `・${MEASURES[i.measure].label}から自動` : ''}${i.changed ? '・単価変更あり' : ''}</small></span>
      <span class="pr">${i.price ? yen(i.price) : '単価なし'}/${esc(i.unit)}</span>${have.has(i.id) ? `<span class="pill ok">追加済</span>` : `<span class="pill acc">${icon('plus').replace('<svg', '<svg style="width:14px;height:14px"')}足す</span>`}</button>`).join('') || '<div class="empty">見つかりません。「自由に入れる」で自分で入れられます。</div>';
  };
  m.el.addEventListener('click', e => {
    const c = e.target.closest('[data-c]'); if (c) { cat = state.pickCat = c.dataset.c; draw(); return; }
    const b = e.target.closest('.pick'); if (!b) return;
    const it = items.find(i => i.id === b.dataset.id); if (!it) return;
    const auto = it.measure && it.measure !== 'manual';
    const line = { id: uid('l'), itemId: it.id, name: it.name, spec: it.spec || '', unit: it.unit, kind: it.kind || 'mat', price: it.price || '', cost: '', loss: '', sheet: it.sheet || 0, cat: it.custom ? 'custom' : it.cat, qty: auto ? '' : 1, basis: auto ? { measure: it.measure, rooms: 'all' } : null };
    if (it.pipe) {
      const sys = sysOptions(it.pipe)[0];
      Object.assign(line, { pipe: { ...it.pipe }, applyLoss: true, loss: PIPE_LOSS, qty: '', pipeSet: { sys, many: 1, hoon: sys === 'h' } });
    }
    p.lines.push(line);
    added++; touch(p);
    $('#padded', m.el).textContent = `${added} 件 足しました`;
    draw();
  });
  $('#pq', m.el).oninput = e => { q = e.target.value; draw(); };
  draw();
}

/* ---------- ④ 確認 ---------- */
function stepCheck({ p, body, refresh }) {
  const o = opts();
  const draw = () => {
    const c = check(p, o), t = totals(p, o);
    const errs = c.filter(x => x.level === 'error'), warns = c.filter(x => x.level === 'warn');
    const mx = Math.max(1, ...Object.values(t.byKind).map(k => k.amount));
    const inp = (k, unit, w = 120) => `<div class="unitwrap" style="width:${w}px;display:inline-block"><input class="in num" style="min-height:40px" type="number" inputmode="decimal" data-k="${k}" value="${esc(p[k] ?? '')}" ${k === 'taxRate' ? `placeholder="${o.taxRate}"` : ''}><span>${unit}</span></div>`;
    body.innerHTML = `
      ${errs.length || warns.length ? '' : `<div class="okbig" style="margin-bottom:14px">${icon('shield')}<div><b style="font-size:17px">検算OK</b><div class="small muted">別の計算方法でも小計 ${yen(t.subtotal)} で一致しました。単価や数量の抜けもありません。</div></div></div>`}
      ${errs.length || warns.length ? `<div class="card" style="margin-bottom:14px"><h2>確認が必要な所</h2><div class="sub">赤：このままだと金額が間違います ／ 黄：念のため確かめてください</div>
        <div class="checks">${[...errs, ...warns].map(x => `<div class="chk ${x.level}">${icon(x.level === 'error' ? 'alert' : 'info')}<span style="flex:1">${esc(x.msg)}</span>${x.lineId || x.roomId ? `<button class="btn sm" data-fix="${esc(x.lineId || x.roomId)}" data-step="${x.lineId ? 3 : 2}">直す</button>` : ''}</div>`).join('')}</div></div>` : ''}
      <div class="grid g2">
        <div class="card"><h2>金額</h2><div class="sub">諸経費と利益は小計に対する割合です</div>
          <table class="sum">
            <tr><td>小計（${p.lines.length} 行）</td><td>${yen(t.subtotal)}</td></tr>
            <tr><td>諸経費 ${inp('overheadPct', '%')}</td><td>${yen(t.overhead)}</td></tr>
            <tr><td>利益 ${inp('profitPct', '%')}</td><td>${yen(t.profit)}</td></tr>
            <tr><td>値引き ${inp('discount', '円', 140)}</td><td>${t.discount ? '−' + yen(t.discount) : yen(0)}</td></tr>
            <tr><td>税抜の合計</td><td>${yen(t.net)}</td></tr>
            <tr><td>消費税 ${inp('taxRate', '%', 120)}</td><td>${yen(t.tax)}</td></tr>
            <tr class="tot"><td>合計（税込）</td><td>${yen(t.grand)}</td></tr>
          </table></div>
        <div class="card"><h2>原価と粗利</h2><div class="sub">材料は定価×${o.matRate}%、手間は単価×${o.laborRate}%で計算（設定で変えられます）。見積書の金額は変わりません。</div>
          <div class="kindbars">${Object.entries(KINDS).map(([k, n]) => { const b = t.byKind[k]; return b.amount ? `<div class="kb"><span>${n}</span><div class="track" title="青：原価 ／ 緑：粗利"><i class="c" style="width:${b.cost / mx * 100}%"></i><i class="g" style="width:${Math.max(0, b.amount - b.cost) / mx * 100}%"></i></div><span class="num r" style="text-align:right">${yen(b.amount)}</span></div>` : ''; }).join('') || '<span class="muted small">まだ明細がありません</span>'}</div>
          <table class="sum" style="margin-top:12px">
            <tr><td>原価の合計</td><td>${yen(t.cost)}</td></tr>
            <tr><td>粗利（税抜の合計 − 原価）</td><td style="color:${t.gross < 0 ? 'var(--bad)' : 'var(--ok)'}">${yen(t.gross)}</td></tr>
            <tr><td>粗利率</td><td>${t.net > 0 ? pct(t.grossPct) : '—'}</td></tr>
          </table></div>
      </div>
      <p class="small muted" style="margin-top:12px">${icon('info').replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px"')} この金額は概算です。検算は計算の間違いや入れ忘れを見つけるためのもので、現場に合っているかまでは確かめられません。見積書を出す前に、数量と単価をご自身で確かめてください。</p>`;
    refresh();
  };
  body.addEventListener('change', e => {
    const k = e.target.dataset.k; if (!k) return;
    p[k] = e.target.value === '' ? '' : Number(e.target.value); touch(p); draw();
  });
  body.addEventListener('click', e => {
    const f = e.target.closest('[data-fix]'); if (!f) return;
    lastFocus.id = f.dataset.fix;
    go('#/p/' + encodeURIComponent(p.id) + '/' + f.dataset.step);
  });
  draw();
}

async function duplicate(p) {
  await flush();
  const { id, number, ...rest } = JSON.parse(JSON.stringify(p));
  void id; void number;
  const n = newProject({ ...rest, name: (p.name || '案件') + '（コピー）', history: [], status: 'draft', issueDate: '', createdAt: Date.now() });
  go('#/p/' + encodeURIComponent(n.id) + '/1');
  toast('案件を複製しました');
}

/* 図面を JWW・DXF で書き出す。寸法で作った間取りは寸法と部屋名・面積も、読み込んだ図面は壁の線と部屋名・面積 */
async function cadExport(p) {
  const d = p.drawing; if (!d || !d.plan) return;
  let G;
  if (d.sketch && p.sketch && p.sketch.rooms.length) G = geomOf(p.sketch.rooms);
  else {
    G = { lines: d.plan.segs.map(s => [s[0], s[1], s[2], s[3], 0]), texts: [] };
    p.rooms.filter(r => r.src === 'plan').forEach(r => {
      const F = (r.faces || []).map(i => d.plan.faces.find(f => f.i === i)).filter(Boolean); if (!F.length) return;
      const P = F[0].poly; let cx = 0, cy = 0; P.forEach(q => { cx += q[0] / P.length; cy += q[1] / P.length; });
      G.texts.push({ s: r.name, x: cx, y: cy + 0.18, h: 4.5, deg: 0, layer: 2 }, { s: (Number(r.area) || 0).toFixed(2) + '㎡', x: cx, y: cy - 0.22, h: 3, deg: 0, layer: 2 });
    });
  }
  const base = (p.name || '間取り').replace(/[\\/:*?"<>|]/g, '_');
  const ch = await new Promise(res => {
    const m = modal({ title: 'JWW・DXF で書き出す', body: `<p class="small muted" style="margin:0">壁の線・寸法・部屋の名前と面積を書き出します（文字は Shift_JIS）。JWW は縮尺 1/50 です。</p>`,
      foot: `<button class="btn" data-fmt="dxf">DXF</button><button class="btn primary" data-fmt="jww">JWW</button>`, onClose: () => res('') });
    m.el.querySelectorAll('[data-fmt]').forEach(b => { b.onclick = () => { res(b.dataset.fmt); m.el.remove(); }; });
  });
  if (!ch) return;
  const u8 = ch === 'jww' ? jwwBytes(G, 50) : dxfBytes(G);
  await share(new Blob([u8], { type: ch === 'jww' ? 'application/octet-stream' : 'application/dxf' }), base + '.' + ch);
  toast(`${ch.toUpperCase()} を書き出しました`);
}

/* 前の読み取りでコンセントの位置が無い器具（前に読んだ図面・自分で足した器具）：背面の壁に沿って
 * 便器は真ん中から33cm横、洗面カウンターは端から20cm、壁から7cm（前のKAKUと同じ寸法。横は右・上の側） */
function outFallback(x) {
  if (!x.b || !x.back || !(x.t === 'toilet' || x.t === 'counter')) return null;
  const S = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] }[x.back]; if (!S) return null;
  const b = x.b, hor = !!S[1], wall = hor ? (S[1] > 0 ? b[3] : b[1]) : (S[0] > 0 ? b[2] : b[0]);
  const t = x.t === 'toilet' ? (hor ? (b[0] + b[2]) / 2 : (b[1] + b[3]) / 2) + 0.33 : (hor ? b[2] : b[3]) - 0.2;
  const r = v => Math.round(v * 1000) / 1000;
  return hor ? [r(t), r(wall - S[1] * 0.07)] : [r(wall - S[0] * 0.07), r(t)];
}
