/* 単価マスター・設定・使い方・初めての案内・見本の案件 */
import { state, registerView, setTop, go, saveSettings, saveKV, masterItems, categories, newProject, applyTheme, reload, render, APP_VERSION, APP_DATE, opts, flush } from './app.js';
import { MEASURES, KINDS, DEFAULTS } from './calc.js';
import * as store from './store.js';
import * as sync from './sync.js';
import { BUILTIN_ITEMS } from './master-data.js';
import { icon, esc, yen, toast, modal, ask, share, matchItem, $ } from './ui.js';

/* ---------- 単価マスター ---------- */
registerView('master', async el => {
  setTop('単価マスター');
  let cat = state.masterCat || 'all', q = '', onlyChanged = false;
  el.innerHTML = `
    <div class="lead">${icon('info')}<span>見積もりで「一覧から選ぶ」に出る品目と単価です。単価を変えると、<b>これから足す行</b>に使われます（今までの案件の金額は変わりません）。材料の単価は定価で入れて、仕入れは「設定」の掛け率で合わせます。</span></div>
    <div class="row" style="margin-bottom:12px">
      <div class="unitwrap" style="flex:1;min-width:220px"><input class="in" id="mq" type="search" placeholder="品目で探す（例：HIVP 20、エルボ 50）" enterkeyhint="search"><span>${icon('search')}</span></div>
      <label class="row small muted" style="gap:6px"><input type="checkbox" id="mc" style="width:20px;height:20px">変えた単価だけ</label>
      <button class="btn primary" id="madd">${icon('plus')}品目を足す</button>
      <button class="btn" id="mexp">${icon('down')}CSVで書き出す</button>
      <label class="btn" style="cursor:pointer">${icon('up')}CSVで取り込む<input type="file" id="mimp" accept=".csv,text/csv" hidden></label>
    </div>
    <div class="catchips" id="mcat"></div>
    <div class="card" style="padding:6px 8px"><div class="tablewrap"><table class="list"><thead><tr><th>品目・規格</th><th class="hide-m">区分・数え方</th><th>単位</th><th class="r">単価（円）</th><th></th></tr></thead><tbody id="mbody"></tbody></table></div></div>`;
  const draw = () => {
    $('#mcat').innerHTML = [['all', 'すべて'], ...categories()].map(([k, n]) => `<button data-c="${k}" class="${cat === k ? 'on' : ''}">${esc(n)}</button>`).join('');
    const qq = q.trim().toLowerCase();
    const list = masterItems().filter(i => (cat === 'all' || (i.custom ? 'custom' : i.cat) === cat) && (!onlyChanged || i.changed || i.custom) && matchItem(i, qq));
    $('#mbody').innerHTML = list.slice(0, 400).map(i => `<tr data-id="${esc(i.id)}">
      <td><b>${esc(i.name)}</b><div class="small muted">${esc(i.spec || '')}</div></td>
      <td class="hide-m small muted">${KINDS[i.kind] || ''}・${MEASURES[i.measure] ? MEASURES[i.measure].label : ''}</td>
      <td>${esc(i.unit)}</td>
      <td class="r"><input class="in num" style="width:120px;min-height:40px;${i.changed ? 'border-color:var(--accent)' : ''}" type="number" inputmode="numeric" data-price value="${esc(i.price)}"></td>
      <td class="r">${i.changed ? `<button class="btn sm ghost" data-reset title="最初の単価 ${yen((BUILTIN_ITEMS.find(b => b.id === i.id) || {}).price)} に戻す">戻す</button>` : ''}${i.custom ? `<button class="iconbtn" data-delc title="この品目を消す">${icon('trash')}</button>` : ''}</td></tr>`).join('') +
      (list.length > 400 ? `<tr><td colspan="5" class="muted small">ほか ${list.length - 400} 件。名前で探すと絞れます。</td></tr>` : '') +
      (!list.length ? `<tr><td colspan="5" class="empty">見つかりません</td></tr>` : '');
  };
  el.addEventListener('click', async e => {
    const c = e.target.closest('[data-c]'); if (c) { cat = state.masterCat = c.dataset.c; draw(); return; }
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const id = tr.dataset.id;
    if (e.target.closest('[data-reset]')) { delete state.priceOverrides[id]; await saveKV('priceOverrides', state.priceOverrides); draw(); toast('最初の単価に戻しました'); }
    if (e.target.closest('[data-delc]')) {
      if (!(await ask('品目を消しますか？', '自分で足した品目を消します。今までの案件の行は消えません。', { ok: '消す', danger: true }))) return;
      state.customItems = state.customItems.filter(x => x.id !== id); await saveKV('customItems', state.customItems); draw();
    }
  });
  el.addEventListener('change', async e => {
    if (!e.target.matches('[data-price]')) return;
    const id = e.target.closest('tr').dataset.id, v = e.target.value === '' ? 0 : Number(e.target.value);
    const cu = state.customItems.find(x => x.id === id);
    if (cu) { cu.price = v; await saveKV('customItems', state.customItems); }
    else {
      const b = BUILTIN_ITEMS.find(x => x.id === id);
      if (b && b.price === v) delete state.priceOverrides[id]; else state.priceOverrides[id] = v;
      await saveKV('priceOverrides', state.priceOverrides);
    }
    toast('単価を変えました'); draw();
  });
  $('#mq').oninput = e => { q = e.target.value; draw(); };
  $('#mc').onchange = e => { onlyChanged = e.target.checked; draw(); };
  $('#madd').onclick = () => addItemDialog(draw);
  $('#mexp').onclick = async () => {
    const qv = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [['id', '品目', '規格', '単位', '単価', '区分', '数え方'], ...masterItems().map(i => [i.id, i.name, i.spec, i.unit, i.price, KINDS[i.kind] || '', MEASURES[i.measure] ? MEASURES[i.measure].label : ''])];
    await share(new Blob(['﻿' + rows.map(r => r.map(qv).join(',')).join('\r\n')], { type: 'text/csv' }), 'KAKU_単価マスター.csv');
  };
  $('#mimp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const n = await importMasterCsv(await f.text()); toast(`${n} 件の単価を取り込みました`); draw(); }
    catch (err) { toast(err.message, { bad: true }); }
    e.target.value = '';
  };
  draw();
});

function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
async function importMasterCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('CSVが空です。');
  const h = rows[0].map(x => x.trim());
  const ix = k => h.indexOf(k);
  if (ix('品目') < 0 || ix('単価') < 0) throw new Error('1行目に「品目」「単価」の見出しが必要です（書き出したCSVの形で）。');
  const kindOf = s => Object.keys(KINDS).find(k => KINDS[k] === s) || 'mat';
  const measOf = s => Object.keys(MEASURES).find(k => MEASURES[k].label === s) || 'manual';
  let n = 0;
  for (const r of rows.slice(1)) {
    const price = Number(String(r[ix('単価')] || '').replace(/[,¥円\s]/g, ''));
    if (!Number.isFinite(price)) continue;
    const id = ix('id') >= 0 ? (r[ix('id')] || '').trim() : '';
    const b = id && BUILTIN_ITEMS.find(x => x.id === id);
    if (b) { if (b.price !== price) state.priceOverrides[id] = price; else delete state.priceOverrides[id]; n++; continue; }
    const cu = id && state.customItems.find(x => x.id === id);
    const item = { id: cu ? cu.id : store.uid('c'), cat: 'custom', name: (r[ix('品目')] || '').trim(), spec: ix('規格') >= 0 ? r[ix('規格')] || '' : '', unit: ix('単位') >= 0 ? r[ix('単位')] || '式' : '式', price, kind: ix('区分') >= 0 ? kindOf(r[ix('区分')]) : 'mat', measure: ix('数え方') >= 0 ? measOf(r[ix('数え方')]) : 'manual', sheet: 0 };
    if (!item.name) continue;
    if (cu) Object.assign(cu, item); else state.customItems.push(item);
    n++;
  }
  await saveKV('priceOverrides', state.priceOverrides);
  await saveKV('customItems', state.customItems);
  return n;
}

function addItemDialog(after) {
  const m = modal({
    title: '品目を足す',
    body: `<div class="grid g2">
      <label class="f">品目の名前<input class="in" id="n_name" placeholder="例：ダウンライト φ100"></label>
      <label class="f">規格・品番<input class="in" id="n_spec" placeholder="例：パナソニック XND1010"></label>
      <label class="f">単位<input class="in" id="n_unit" value="個"></label>
      <label class="f">単価（円）<span class="hint">材料は定価（税抜）</span><input class="in num" id="n_price" type="number" inputmode="numeric"></label>
      <label class="f">区分<select class="in" id="n_kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label class="f">数え方<select class="in" id="n_meas">${Object.entries(MEASURES).map(([k, v]) => `<option value="${k}" ${k === 'manual' ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label></div>`,
    foot: `<button class="btn" data-close>やめる</button><button class="btn primary" id="n_ok">足す</button>`
  });
  $('#n_ok', m.el).onclick = async () => {
    const name = $('#n_name', m.el).value.trim();
    if (!name) { toast('品目の名前を入れてください', { bad: true }); return; }
    state.customItems.push({ id: store.uid('c'), cat: 'custom', name, spec: $('#n_spec', m.el).value.trim(), unit: $('#n_unit', m.el).value.trim() || '式', price: Number($('#n_price', m.el).value) || 0, kind: $('#n_kind', m.el).value, measure: $('#n_meas', m.el).value, sheet: 0 });
    await saveKV('customItems', state.customItems);
    m.close(); after(); toast('品目を足しました');
  };
}

/* ---------- 設定 ---------- */
registerView('settings', async el => {
  setTop('設定');
  const s = state.settings, c = state.company;
  const cf = (k, l, ph = '') => `<label class="f">${l}<input class="in" data-c="${k}" value="${esc(c[k] || '')}" placeholder="${esc(ph)}"></label>`;
  const sf = (k, l, unit, hint = '') => `<label class="f">${l}${hint ? `<span class="hint">${hint}</span>` : ''}<div class="unitwrap"><input class="in num" type="number" inputmode="decimal" step="any" data-s="${k}" value="${esc(s[k] ?? '')}" placeholder="${esc(DEFAULTS[k] ?? '')}"><span>${unit}</span></div></label>`;
  el.innerHTML = `
    <div class="grid" style="gap:14px">
    <div class="card"><h2>表示</h2><div class="sub">外で画面が見にくい時は「明るい」にしてください。</div>
      <div class="seg"><button data-theme-set="dark" class="${s.theme !== 'light' ? 'on' : ''}">${icon('moon').replace('<svg', '<svg style="width:16px;height:16px;vertical-align:-3px"')} 暗い</button><button data-theme-set="light" class="${s.theme === 'light' ? 'on' : ''}">${icon('sun').replace('<svg', '<svg style="width:16px;height:16px;vertical-align:-3px"')} 明るい</button></div></div>
    <div class="card"><h2>会社情報・振込先</h2><div class="sub">見積書・請求書に載ります。空欄の項目は載りません。</div>
      <div class="grid g2">${cf('name', '会社名')}${cf('person', 'あなたの名前（担当者）')}${cf('zip', '郵便番号')}${cf('address', '住所')}${cf('tel', '電話')}${cf('fax', 'FAX')}${cf('email', 'メール')}${cf('regNo', '適格請求書の登録番号', 'T1234567890123')}
      <label class="f" style="grid-column:1/-1">振込先<input class="in" data-c="bank" value="${esc(c.bank || '')}" placeholder="例：瀬戸信用金庫 ○○支店 普通 1234567 カ）○○"></label>
      <label class="f" style="grid-column:1/-1">請求書の一言<input class="in" data-c="payNote" value="${esc(c.payNote || '')}" placeholder="例：恐れ入りますが振込手数料はご負担ください。"></label></div></div>
    <div class="card"><h2>計算の決まり</h2><div class="sub">空欄なら薄い字の数字を使います。変えると全部の案件の数量・金額が変わります。</div>
      <div class="grid g4">${sf('matRate', '材料の掛け率', '%', '定価の何%で仕入れるか')}${sf('laborRate', '手間の原価率', '%', '手間の単価の何%が原価か')}${sf('loss', '材料のロス率', '%')}${sf('taxRate', '消費税', '%')}
      ${sf('ceilH', '天井高の標準', 'm')}${sf('doorArea', 'ドア1か所の面積', '㎡')}${sf('doorW', 'ドアの幅', 'm', '巾木から引く')}${sf('winArea', '窓1か所の面積', '㎡', '寸法を入れない時')}
      ${sf('overheadPct', '新しい案件の諸経費', '%')}${sf('profitPct', '新しい案件の利益', '%')}</div></div>
    <div class="card"><h2>バックアップ</h2><div class="sub">案件・単価・設定をまとめて1つのファイルにします。機種変更の時や、念のため週に1回くらい書き出してください。${s.lastBackup ? `前回：${new Date(s.lastBackup).toLocaleDateString('ja-JP')}` : 'まだ書き出していません。'}</div>
      <div class="row"><button class="btn primary" id="bexp">${icon('down')}バックアップを書き出す</button>
      <label class="btn" style="cursor:pointer">${icon('up')}バックアップから戻す<input type="file" id="bimp" accept=".json,application/json" hidden></label></div>
      <p class="small muted" style="margin-bottom:0">前のKAKUで書き出したバックアップも読み込めます。保存の状態：${state.persisted ? '<span class="pill ok">端末に消されにくい保存</span>' : '<span class="pill warn">ブラウザが容量不足の時に消すことがあります。バックアップを取ってください</span>'}</p></div>
    <div class="card" id="syncCard"><h2>保存先フォルダ（会社の OneDrive・Googleドライブなど）</h2>${syncCardHtml()}</div>
    <div class="card"><h2>そのほか</h2>
      <div class="row"><button class="btn" id="intro">${icon('help')}最初の案内をもう一度見る</button><button class="btn" id="sample">${icon('spark')}見本の案件を入れる</button><a class="btn" href="./old/">${icon('layers')}前のKAKUを開く</a><button class="btn" id="reold">${icon('up')}前のKAKUの案件を取り込み直す</button></div>
      <p class="small muted">前のKAKU（図面・照明・3D）で作ったり直したりした案件を、こちらに取り込みます。前のKAKUから来た案件は上書きされます。</p>
      <p class="small muted" style="margin-bottom:0">KAKU ${APP_VERSION}（${APP_DATE}）</p></div>
    </div>`;
  el.addEventListener('click', e => {
    const t = e.target.closest('[data-theme-set]');
    if (t) { s.theme = t.dataset.themeSet; applyTheme(); saveSettings(); render(); }
  });
  el.addEventListener('change', async e => {
    if (e.target.dataset.c) { c[e.target.dataset.c] = e.target.value.trim(); await saveKV('company', c); toast('会社情報を保存しました'); }
    if (e.target.dataset.s) {
      const k = e.target.dataset.s, v = e.target.value;
      if (v === '') delete s[k]; else s[k] = Number(v);
      await saveSettings(); toast('保存しました');
    }
  });
  $('#bexp').onclick = async () => {
    try {
      const data = await store.exportAll();
      const d = new Date();
      await share(new Blob([JSON.stringify(data)], { type: 'application/json' }), `KAKU_バックアップ_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`);
      s.lastBackup = Date.now(); await saveSettings();
      toast(`${data.projects.length} 件の案件を書き出しました`);
    } catch (err) { toast(err.message, { bad: true }); }
  };
  $('#bimp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      const mode = obj && Array.isArray(obj.projects) && state.projects.length && await ask('今の案件をどうしますか？', '「足す」：今の案件は残して、バックアップの案件を足します（同じ案件は上書き）。\n「入れ替える」：今の案件を全部消して、バックアップの中身にします。', { ok: '入れ替える', cancel: '足す', danger: true }) ? 'replace' : 'merge';
      const n = await store.importAll(obj, mode);
      await reload(); applyTheme();
      toast(`${n} 件の案件を読み込みました`);
      render();
    } catch (err) { toast(err.message.startsWith('Unexpected') ? 'ファイルを読めませんでした。KAKUのバックアップか確かめてください。' : err.message, { bad: true }); }
    e.target.value = '';
  };
  $('#reold').onclick = async () => {
    if (!(await ask('取り込み直しますか？', '前のKAKUから来た案件は、前のKAKUの内容で上書きされます（こちらで直した所は戻ります）。', { ok: '取り込む' }))) return;
    try { const n = await store.reimportOld(); await reload(); toast(`${n} 件の案件を取り込みました`); }
    catch (err) { toast(err.message, { bad: true }); }
  };
  bindSync(el, render);
  $('#intro').onclick = showIntro;
  $('#sample').onclick = addSample;
});

/* ---------- 使い方 ---------- */
registerView('help', async el => {
  setTop('使い方');
  el.innerHTML = `<div class="grid" style="gap:14px;max-width:860px">
    <div class="card"><h2>見積もりの流れ</h2><div class="sub">案件を開くと、上に ①〜⑤ の順番が出ます。左から順に進めれば見積書までできます。</div>
      <div class="intro">
        <div class="st"><span class="n">1</span><div><b>現場</b><span>お客様の名前と現場の住所を入れます。</span></div></div>
        <div class="st"><span class="n">2</span><div><b>部屋</b><span>部屋ごとに幅と奥行（m）、天井高、ドアと窓の数を入れます。床・壁・天井の面積が自動で出ます。</span></div></div>
        <div class="st"><span class="n">3</span><div><b>工事</b><span>「一覧から選ぶ」で品目を選びます。床・壁・天井の品目は数量が自動で入ります。材料はロス込み、石膏ボードは枚数に切り上げます。</span></div></div>
        <div class="st"><span class="n">4</span><div><b>確認</b><span>別の方法で計算し直して、合わない所や単価の抜けを出します。諸経費・利益・値引きもここで入れます。</span></div></div>
        <div class="st"><span class="n">5</span><div><b>書類</b><span>見積書・請求書・内訳書を印刷やPDFで出します。Excel にも書き出せます。見積書を出すたびに版が残り、前の版と比べられます。</span></div></div>
      </div></div>
    <div class="card"><h2>はじめにお読みください</h2><div class="sub">最初に起動した時に出した注意書きです。</div>${NOTICE_HTML}</div>
    <div class="card"><h2>よくある質問</h2>
      <p><b>PDFにするには？</b><br><span class="muted">見積書を出すと印刷の画面が出ます。iPhone は印刷の画面で共有ボタン →「ファイルに保存」。パソコンは送信先を「PDFに保存」にしてください。</span></p>
      <p><b>図面を読み込むには？</b><br><span class="muted">案件の「②部屋」で「図面を選ぶ」を押して、JWW・DXF・PDFを選んでください。区画をタップして「1部屋にする」で部屋になります。図面の上の「器具を直す」「壁の解体」「カッター」「照明・配線」「測る」で拾い、「3Dで見る」で確かめられます。</span></p>
      <p><b>データはどこに保存されますか？</b><br><span class="muted">この端末の中です。別の端末とは共有されません。設定 → バックアップで書き出して、別の端末で「戻す」と移せます。</span></p>
      <p style="margin-bottom:0"><b>数量が思ったより多い</b><br><span class="muted">材料はロス率（最初は10%）を足して切り上げています。行の「くわしく」で行ごとに、設定で全体のロス率を変えられます。</span></p></div>
  </div>`;
});


/* ---------- はじめにお読みください（最初の1回。確認しないと進めない） ---------- */
export const NOTICE_HTML = `<ul style="margin:0;padding-left:1.2em;display:grid;gap:10px">
  <li><b>KAKU の数量と金額は概算です。</b>部屋の寸法・図面の読み取り・ロス率・単価の目安から計算しているため、実際の数量や金額と違うことがあります。</li>
  <li><b>見積書を出す前に、数量・単価・金額を必ずご自身で確かめてください。</b>「④確認」の検算は計算の間違いや入れ忘れを見つけるためのもので、現場に合っているかまでは確かめられません。</li>
  <li><b>単価は目安です。</b>仕入れ値・地域・時期によって変わります。「単価マスター」と「設定」の掛け率で、会社に合わせてください。</li>
  <li><b>最終的な見積もりの判断は、ご自身でお願いします。</b>KAKU の計算結果をそのまま使ったことで生じた損害について、責任を負いかねます。</li>
  <li>データはこの端末の中に保存されます。消えた時に備えて、ときどき「設定 → バックアップ」で書き出してください。</li>
</ul>`;
export function showNotice(after) {
  const m = modal({
    title: 'はじめにお読みください', closable: false,
    body: NOTICE_HTML + `<label class="row" style="margin-top:16px;gap:10px;font-weight:700;cursor:pointer"><input type="checkbox" id="nt_ok" style="width:24px;height:24px">内容を確認しました</label>`,
    foot: `<button class="btn primary" id="nt_go" disabled>使い始める</button>`
  });
  const cb = $('#nt_ok', m.el), go2 = $('#nt_go', m.el);
  cb.onchange = () => { go2.disabled = !cb.checked; };
  go2.onclick = () => { state.settings.noticeSeen = Date.now(); saveSettings(); m.close(); after && after(); };
}

/* ---------- 初めての案内 ---------- */
export function showIntro() {
  const m = modal({
    title: 'KAKU へようこそ',
    body: `<p style="margin-top:0">見積もりは <b>5つの順番</b> で進みます。案件を開くと画面の上に出るので、左から順に進めてください。</p>
      <div class="intro">
        <div class="st"><span class="n">1</span><div><b>現場とお客様を入れる</b><span>名前と住所だけでOK</span></div></div>
        <div class="st"><span class="n">2</span><div><b>部屋の寸法を入れる</b><span>床・壁・天井の面積が自動で出ます</span></div></div>
        <div class="st"><span class="n">3</span><div><b>工事を一覧から選ぶ</b><span>数量は部屋から自動。材料はロス込み</span></div></div>
        <div class="st"><span class="n">4</span><div><b>確認する</b><span>計算をもう一度確かめて、間違いを知らせます</span></div></div>
        <div class="st"><span class="n">5</span><div><b>見積書を出す</b><span>印刷・PDF・Excel</span></div></div>
      </div>
      <p class="small muted">前のKAKUの案件は引き継いであります。図面は「②部屋」で読み込めます。照明・器具・3Dも、図面の画面で使えます。</p>`,
    foot: `<button class="btn" id="i_sample">${icon('spark')}見本の案件で試す</button><button class="btn primary" id="i_go">自分の案件を始める</button>`,
    onClose: () => { if (!state.settings.introSeen) { state.settings.introSeen = true; saveSettings(); } }
  });
  $('#i_sample', m.el).onclick = () => { m.close(); addSample(); };
  $('#i_go', m.el).onclick = () => { m.close(); const p = newProject(); go('#/p/' + encodeURIComponent(p.id) + '/1'); };
}

/* 見本の案件（「見本」と分かる名前にする。品目と単価は単価マスターから） */
export function addSample() {
  const items = masterItems();
  const it = id => items.find(i => i.id === id);
  const rooms = [
    { id: store.uid('r'), name: '事務室', shape: 'rect', w: 7.2, d: 5.4, h: 2.6, qty: 1, doors: 1, winCount: 0, windows: [{ w: 1690, h: 1800, n: 2 }] },
    { id: store.uid('r'), name: '会議室', shape: 'rect', w: 3.6, d: 3.6, h: 2.6, qty: 1, doors: 1, winCount: 1, windows: [] },
    { id: store.uid('r'), name: '廊下（L字）', shape: 'free', area: 9.5, perim: 16.2, h: 2.4, qty: 1, doors: 2, winCount: 0, windows: [] }
  ];
  const L = (id, extra = {}) => {
    const i = it(id); if (!i) return null;
    const auto = i.measure && i.measure !== 'manual';
    return { id: store.uid('l'), itemId: i.id, name: i.name, spec: i.spec || '', unit: i.unit, kind: i.kind, price: i.price || '', cost: '', loss: '', sheet: i.sheet || 0, cat: i.cat, qty: auto ? '' : 1, basis: auto ? { measure: i.measure, rooms: 'all' } : null, ...extra };
  };
  const office = [rooms[0].id, rooms[1].id];
  const lines = [
    { id: store.uid('l'), name: '養生・清掃', spec: '', unit: '式', kind: 'other', qty: 1, price: 30000, cost: '', loss: '', sheet: 0, basis: null, cat: '' },
    L('w-dW-cloth'), L('w-dF-tc', { basis: { measure: 'floor', rooms: office } }),
    L('wl-cloth'), L('c-cloth'),
    L('f-tc', { basis: { measure: 'floor', rooms: office } }), L('f-ls', { basis: { measure: 'floor', rooms: [rooms[2].id] } }),
    L('t-hsoft'), L('w-haba'),
    L('e-dl100', { qty: 14 }), L('w-eDL', { qty: 14 }),
    L('w-waste', { qty: 1 })
  ].filter(Boolean);
  const p = newProject({ name: '見本：事務所の内装改修', customer: '見本商事株式会社', address: '愛知県瀬戸市（見本）', rooms, lines, overheadPct: 5, profitPct: 0, memo: '操作を試すための見本です。自由に変えたり消したりしてください。' });
  go('#/p/' + encodeURIComponent(p.id) + '/2');
  toast('見本の案件を入れました');
}
void opts;

/* ---------- 保存先フォルダ ---------- */
function syncCardHtml() {
  const m = sync.mode();
  if (m === 'share') return `<div class="sub">案件を、会社の OneDrive・Googleドライブ・iCloud などに置けます。案件1つにつき、KAKUが読む「.kaku.json」と、iPhoneでもそのまま開いて見られる「.xlsx」（明細）の2つです。</div>
    <div class="row"><button class="btn primary" id="syShare">${icon('down')}共有メニューで保存（全部の案件）</button>
    <label class="btn" style="cursor:pointer">${icon('up')}ファイルから読み込む<input type="file" id="syFiles" accept=".json,application/json" multiple hidden></label></div>
    <p class="small muted" style="margin-bottom:0">保存：共有メニューの「"ファイル"に保存」で、OneDrive などのフォルダを選んでください。読み込み：同じフォルダの「.kaku.json」を選んでください（まとめて選べます）。新しい方に合わせ、両方で直した案件だけ、どちらにするか聞きます。この画面（Safari）では自動で保存されません。iPhoneアプリかパソコンの Chrome・Edge なら、フォルダに自動で保存できます。</p>`;
  return `<div class="sub">フォルダを1回選ぶと、保存のたびにそこへ自動で書きます。案件1つにつき、KAKUが読む「.kaku.json」と、そのまま開いて見られる「.xlsx」（明細）の2つです。単価・会社情報も「_KAKU_会社の設定」に入れて、会社で同じ単価を使えます。</div>
    <div class="row" style="align-items:center"><span class="pill info" id="syName">確かめています…</span>
    <button class="btn" id="syPick">${icon('layers')}フォルダを選ぶ</button><button class="btn primary" id="syNow">${icon('up')}フォルダと揃える</button></div>
    <p class="small muted" style="margin-bottom:0">「フォルダと揃える」で、ほかの人や別の端末が書いた案件を読み込みます。新しい方に合わせ、両方で直した案件だけ、どちらにするか聞きます。この端末で消した案件は、フォルダから戻しません。${m === 'fs' ? 'パソコンでは OneDrive・Googleドライブのフォルダ（パソコンの中に同期されている所）を選んでください。' : 'iPhoneの「ファイル」に出てくる所（OneDrive・Googleドライブ・iCloud・Dropbox など）を選べます。'}</p>`;
}
function bindSync(el, render) {
  const nameEl = $('#syName');
  if (nameEl) sync.folderName().then(n => { nameEl.textContent = n ? `保存先：${n}` : 'まだ選んでいません'; nameEl.className = 'pill ' + (n ? 'ok' : 'warn'); });
  const after = async r => {
    await reload(); render();
    const msg = [`読み込み ${r.pulled.length} 件`, r.pushed != null && sync.mode() !== 'share' ? `書き出し ${r.pushed} 件` : '', r.company === 'pull' ? '会社の設定を読み込み' : '', r.kept ? `この端末で消した ${r.kept} 件は戻していません` : ''].filter(Boolean).join('・');
    toast(msg || '揃っています', { ms: 5000 });
  };
  const pick = $('#syPick'); if (pick) pick.onclick = async () => {
    try { const n = await sync.pickFolder(); if (n) { toast(`保存先を「${n}」にしました。続けて「フォルダと揃える」を押してください`, { ms: 5000 }); render(); } }
    catch (e) { if (e && e.name === 'AbortError') return; toast('フォルダを選べませんでした：' + (e.message || e), { bad: true }); }
  };
  const now = $('#syNow'); if (now) now.onclick = async () => {
    if (!(await sync.folderName())) { toast('先に「フォルダを選ぶ」で保存先を選んでください', { bad: true }); return; }
    try { await flush(); after(await sync.syncNow(state.projects, opts())); }
    catch (e) { toast('揃えられませんでした：' + (e.message || e), { bad: true, ms: 6000 }); }
  };
  const sh = $('#syShare'); if (sh) sh.onclick = async () => {
    try { await flush(); const n = await sync.shareFiles(state.projects, opts()); toast(`${n} 個のファイルを渡しました`); }
    catch (e) { if (e && e.name === 'AbortError') return; toast('保存できませんでした：' + (e.message || e), { bad: true }); }
  };
  const fi = $('#syFiles'); if (fi) fi.onchange = async e => {
    const files = await Promise.all([...e.target.files].map(async f => ({ name: f.name, text: await f.text() })));
    e.target.value = '';
    try { await flush(); after(await sync.syncNow(state.projects, opts(), files)); }
    catch (err) { toast('読み込めませんでした：' + (err.message || err), { bad: true }); }
  };
}
