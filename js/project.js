/* 案件の画面：① 現場 → ② 部屋 → ③ 工事 → ④ 確認 → ⑤ 書類 */
import { state, registerView, setTop, go, touch, opts, findProject, masterItems, categories, removeProject, restoreProject, newProject, flush } from './app.js';
import { roomGeom, lineQty, netQty, totals, check, MEASURES, KINDS, isRoomBased } from './calc.js';
import { SYS, MANY, sysOptions, rebuild, PIPE_LOSS } from './piping.js';
import { importDrawing, groupGeom, planCH } from './drawing.js';
import { planView, roomColor } from './planview.js';
import { uid } from './store.js';
import { icon, esc, yen, fmt, pct, toast, modal, ask, matchItem, $, $$ } from './ui.js';
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
    set('room:' + r.id, `<span class="chip">床 <b>${fmt(g.floor)}</b>㎡</span><span class="chip">壁 <b>${fmt(g.wall)}</b>㎡</span><span class="chip">天井 <b>${fmt(g.ceil)}</b>㎡</span><span class="chip">周り <b>${fmt(g.perim)}</b>m</span><span class="chip">巾木 <b>${fmt(g.base)}</b>m</span><span class="chip">天井高 <b>${fmt(g.h)}</b>m</span>`);
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
      set('qinfo:' + l.id, Number(l.qty) > 0 ? `長さ ${fmt(l.qty, 3)}m ＋ ロス${fmt(loss, 1)}% → ${fmt(q, 3)}m` : '長さ（m）を入れてください');
    }
    const auto = isRoomBased(l);
    if (auto) {
      const net = netQty(l, p.rooms, o, p.lines);
      const loss = l.loss === '' || l.loss == null ? o.loss : Number(l.loss);
      const info = !p.rooms.length ? '部屋がまだありません。②部屋で寸法を入れると数量が入ります。'
        : l.kind === 'labor' ? `${MEASURES[l.basis.measure].label}：${fmt(net, 3)}${MEASURES[l.basis.measure].unit}（手間なので正味のまま）`
          : `${MEASURES[l.basis.measure].label} 正味 ${fmt(net, 3)}${MEASURES[l.basis.measure].unit} ＋ ロス${fmt(loss, 1)}%${l.sheet > 0 ? `（${fmt(l.sheet, 3)}㎡/枚で枚数に切り上げ ${Math.round(q / l.sheet)}枚）` : ''} → ${fmt(q, 3)}`;
      set('qinfo:' + l.id, info);
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
    <div class="chips" data-out="room:${r.id}"></div>
  </div>`;
}

function drawingCard(p) {
  const d = p.drawing;
  if (!d || !d.plan) return `<div class="card" style="margin-bottom:14px"><div class="row"><div style="flex:1;min-width:220px"><h2>図面から部屋を作る</h2>
      <div class="sub" style="margin:0">JWW・DXF・PDF の図面を読み込むと、部屋の区画が自動で見つかります。区画をタップして部屋にしてください。</div></div>
      <label class="btn primary" style="cursor:pointer">${icon('up')}図面を選ぶ<input type="file" id="dwgFile" accept=".jww,.jwc,.dxf,.pdf,application/pdf" hidden></label></div>
      <div class="small muted" id="dwgStatus" style="margin-top:8px"></div></div>`;
  return `<div class="card" style="margin-bottom:14px">
    <div class="row" style="margin-bottom:10px"><div style="flex:1;min-width:200px"><h2>${icon('layers').replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-3px"')} ${esc(d.fileName || '図面')}</h2>
      <div class="sub" style="margin:0">区画 ${d.plan.faces.length} 個${planCH(d.plan) ? `・図面の天井高 ${planCH(d.plan)}m` : ''}。区画をタップして選び、下のボタンで部屋にしてください。</div></div>
      <label class="btn sm" style="cursor:pointer">${icon('up')}読み直す<input type="file" id="dwgFile" accept=".jww,.jwc,.dxf,.pdf,application/pdf" hidden></label>
      <button class="btn sm ghost danger" data-act="dwgClear">${icon('trash')}図面を消す</button></div>
    <div id="dwgView"></div>
    <div class="addbar" style="margin-top:10px" id="dwgBar"></div>
    <details class="more"><summary>区画の一覧から選ぶ（図面で押しにくい小さい区画など）</summary><div class="facelist" id="dwgFaces"></div></details>
    <div class="small muted" id="dwgStatus" style="margin-top:6px"></div></div>`;
}

function stepRooms(ctx) {
  const { p, body, refresh } = ctx;
  const sel = new Set();
  let view = null;
  const owner = () => { const m = new Map(); p.rooms.forEach(r => (r.faces || []).forEach(i => m.set(i, r.color))); return m; };
  const paintSel = () => {
    if (!p.drawing || !p.drawing.plan) return;
    if (view) view.paint();
    const own = owner();
    const fl = body.querySelector('#dwgFaces');
    if (fl) fl.innerHTML = [...p.drawing.plan.faces].sort((a, b) => a.no - b.no).map(f => `<button data-face="${f.i}" class="${sel.has(f.i) ? 'on' : ''} ${own.has(f.i) && !sel.has(f.i) ? 'used' : ''}">${f.no}${f.name ? ' ' + esc(f.name) : ''} ${Math.round(f.area * 100) / 100}㎡</button>`).join('');
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
      p.rooms.push({ id: uid('r'), name: names.join('・') || `区画 ${F.map(f => f.no).join('・')}`, shape: 'free', area: geo.area, perim: geo.perim,
        h: chs.length ? Math.max(...chs) : (defCH || ''), qty: 1, doors: 0, winCount: 0, windows: [], faces: g, src: 'plan', color: nextColor() });
    });
    const n = groups.length;
    sel.clear(); touch(p); draw();
    toast(`${n} 部屋を作りました`);
  };
  const draw = () => {
    body.innerHTML = drawingCard(p) + `<div class="rooms">${p.rooms.map(roomCard).join('') || `<div class="card empty"><b>まだ部屋がありません</b>下のボタンで部屋を足してください。</div>`}</div>
      <div class="addbar" style="margin-top:12px"><button class="btn primary" id="addRoom">${icon('plus')}部屋を足す</button>
      </div>`;
    view = null;
    if (p.drawing && p.drawing.plan) {
      view = planView(body.querySelector('#dwgView'), p.drawing.plan, {
        selected: () => sel, owner,
        onTap: i => { if (sel.has(i)) sel.delete(i); else sel.add(i); paintSel(); }
      });
      paintSel();
    }
    const fi = body.querySelector('#dwgFile');
    if (fi) fi.onchange = async e => {
      const files = [...e.target.files]; if (!files.length) return;
      if (p.drawing && p.rooms.some(r => r.src === 'plan') && !(await ask('図面を読み直しますか？', '今の図面から作った部屋は残りますが、図面とのつながりは外れます。', { ok: '読み直す' }))) { e.target.value = ''; return; }
      const st = body.querySelector('#dwgStatus'); if (st) st.textContent = '図面を読み込んでいます…（大きい図面は少し時間がかかります）';
      try {
        const res = await importDrawing(files);
        if (!res.plan) { if (st) st.textContent = res.message; toast(res.message, { bad: true }); return; }
        p.rooms.forEach(r => { if (r.src === 'plan') { r.src = 'plan-old'; delete r.faces; } });
        p.drawing = { fileName: files.map(f => f.name).join('、'), at: Date.now(), plan: res.plan };
        sel.clear(); touch(p); draw();
        toast(`区画を ${res.plan.faces.length} 個見つけました`);
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
  body.addEventListener('click', async e => {
    const fb = e.target.closest('[data-face]');
    if (fb) { const i = +fb.dataset.face; if (sel.has(i)) sel.delete(i); else sel.add(i); paintSel(); return; }
    const da = e.target.closest('[data-act]');
    if (da && !da.closest('[data-room]')) {
      const a = da.dataset.act;
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
