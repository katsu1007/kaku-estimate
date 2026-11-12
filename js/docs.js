/* ⑤ 書類：見積書・請求書・内訳書（印刷してPDF保存）、Excel・CSV、見積もりの履歴と比較 */
import { state, touch, opts, go } from './app.js';
import { totals, check, compare, roomGeom, KINDS } from './calc.js';
import { projectXlsx, projectCsv } from './export.js';
import { floorsOf, autoFloors, floorBreakdown } from './floors.js';
import { icon, esc, yen, fmt, today, toast, modal, ask, share, $ } from './ui.js';

const fileBase = p => (p.name || '見積').replace(/[\\/:*?"<>|]/g, '_');

export function docsStep({ p, body, refresh }) {
  const draw = () => {
    const t = totals(p, opts());
    const errs = check(p, opts()).filter(c => c.level === 'error').length;
    const hist = [...(p.history || [])].reverse();
    body.innerHTML = `
      ${errs ? `<div class="chk error" style="margin-bottom:14px">${icon('alert')}<span style="flex:1">確認が必要な所が ${errs} か所あります。④確認で直してから書類を作ってください。</span><a class="btn sm" href="#/p/${encodeURIComponent(p.id)}/4">確認へ</a></div>` : ''}
      <div class="docbtns">
        <button class="docbtn" data-doc="estimate">${icon('doc')}<div><b>見積書を出す</b><span>印刷・PDFで保存。第${(p.history || []).length + 1}版として記録します</span></div></button>
        <button class="docbtn" data-doc="invoice">${icon('print')}<div><b>請求書</b><span>振込先は設定の会社情報から</span></div></button>
        <button class="docbtn" data-doc="breakdown">${icon('grid')}<div><b>内訳書</b><span>工事の種類ごと・部屋ごとの数量</span></div></button>
        <button class="docbtn" data-doc="xlsx">${icon('excel')}<div><b>Excel で書き出す</b><span>金額は Excel の式なので、Excel でも検算できます</span></div></button>
        <button class="docbtn" data-doc="csv">${icon('down')}<div><b>CSV で書き出す</b><span>ほかのソフトに取り込む時に</span></div></button>
        <a class="docbtn" href="#/settings">${icon('user')}<div><b>会社情報・振込先</b><span>${state.company.name ? esc(state.company.name) : 'まだ入っていません'}</span></div></a>
      </div>
      ${floorCard(p)}
      <div class="card" style="margin-top:14px"><h2>${icon('history').replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-3px"')} 見積もりの履歴</h2>
        <div class="sub">見積書を出すたびに、その時の内容を残します。前の版と今の金額を比べられます。</div>
        ${hist.length ? `<div class="tablewrap"><table class="list"><thead><tr><th>版</th><th>出した日</th><th class="r">合計（税込）</th><th class="r">今との差</th><th></th></tr></thead><tbody>
          ${hist.map(h => `<tr><td><b>第${h.no}版</b></td><td class="small">${new Date(h.at).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td class="r money">${yen(h.grand)}</td>
          <td class="r money" style="color:${t.grand - h.grand > 0 ? 'var(--warn)' : t.grand - h.grand < 0 ? 'var(--info)' : 'var(--muted)'}">${t.grand - h.grand === 0 ? '同じ' : (t.grand - h.grand > 0 ? '+' : '−') + yen(Math.abs(t.grand - h.grand)).slice(1) + '円'}</td>
          <td class="r"><button class="btn sm" data-cmp="${h.no}">${icon('compare')}比べる</button> <button class="btn sm ghost" data-reprint="${h.no}">${icon('print')}もう一度印刷</button></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted small" style="margin:0">まだ見積書を出していません。</p>'}
      </div>`;
    refresh();
  };
  body.addEventListener('change', e => {
    const i = e.target.closest('[data-lv]'); if (!i) return;
    const r = p.rooms.find(x => x.id === i.dataset.lv); if (!r) return;
    r.lv = i.value.trim(); touch(p); draw();
  });
  body.addEventListener('click', async e => {
    if (e.target.closest('[data-act=floorAuto]')) { const r = autoFloors(p); if (!r) { toast('図面から作った部屋がありません', { bad: true }); return; } touch(p); draw(); toast(`${r.names.length}つに分けました（${r.fromTitle ? '図面の見出しから' : '左から'} ${r.names.join('・')}）`, { ms: 4000 }); return; }
    if (e.target.closest('[data-act=floorPrint]')) { const res = floorBreakdown(p, opts()); if (res) printDoc(floorHtml(p, res)); return; }
    const d = e.target.closest('[data-doc]');
    if (d) {
      const k = d.dataset.doc;
      if (k === 'estimate') return issueEstimate(p, draw);
      if (k === 'invoice') return printDoc(invoiceHtml(p));
      if (k === 'breakdown') return printDoc(breakdownHtml(p));
      if (k === 'xlsx') { await share(projectXlsx(p, opts()), fileBase(p) + '.xlsx'); toast('Excel を書き出しました'); return; }
      if (k === 'csv') { await share(projectCsv(p, opts()), fileBase(p) + '.csv'); toast('CSV を書き出しました'); return; }
    }
    const c = e.target.closest('[data-cmp]');
    if (c) return showCompare(p, +c.dataset.cmp);
    const r = e.target.closest('[data-reprint]');
    if (r) { const h = p.history.find(x => x.no === +r.dataset.reprint); if (h) printDoc(estimateHtml({ ...p, ...h.data }, h.no, h.date, h.opt || opts())); }
  });
  draw();
}

async function issueEstimate(p, after) {
  const errs = check(p, opts()).filter(c => c.level === 'error');
  if (errs.length && !(await ask('確認が必要な所があります', `${errs.map(e => '・' + e.msg).slice(0, 5).join('\n')}${errs.length > 5 ? `\nほか ${errs.length - 5} 件` : ''}\n\nこのまま見積書を出しますか？`, { ok: 'このまま出す', cancel: '直しに行く' }))) {
    go('#/p/' + encodeURIComponent(p.id) + '/4'); return;
  }
  const t = totals(p, opts());
  const no = (p.history || []).length + 1;
  const date = today();
  const data = JSON.parse(JSON.stringify({ name: p.name, customer: p.customer, address: p.address, person: p.person, number: p.number, expiry: p.expiry, note: p.note, overheadPct: p.overheadPct, profitPct: p.profitPct, discount: p.discount, taxRate: p.taxRate, rooms: p.rooms, lines: p.lines }));
  p.history = [...(p.history || []), { no, at: Date.now(), date, grand: t.grand, net: t.net, data, opt: opts() }];
  p.issueDate = date;
  if (!p.status || p.status === 'draft') p.status = 'sent';
  touch(p);
  after();
  printDoc(estimateHtml(p, no, date));
  toast(`第${no}版として記録しました。状態を「提出済」にしました`);
}

/* ---------- 比較 ---------- */
function showCompare(p, no) {
  const h = p.history.find(x => x.no === no); if (!h) return;
  const r = compare({ ...h.data, rooms: h.data.rooms, lines: h.data.lines }, p, opts());
  const kindLab = { added: ['増えた', 'warn'], removed: ['なくなった', 'info'], changed: ['変わった', 'acc'] };
  modal({
    title: `第${no}版と今の見積もりを比べる`, wide: true,
    body: `<div class="grid g3" style="margin-bottom:14px">
        <div class="kpi"><div class="k">第${no}版（${esc(h.date || '')}）</div><div class="v money">${yen(r.before)}</div></div>
        <div class="kpi"><div class="k">今</div><div class="v money">${yen(r.after)}</div></div>
        <div class="kpi"><div class="k">差額</div><div class="v money" style="color:${r.diff > 0 ? 'var(--warn)' : r.diff < 0 ? 'var(--info)' : 'var(--muted)'}">${r.diff > 0 ? '+' : r.diff < 0 ? '−' : ''}${yen(Math.abs(r.diff))}</div></div></div>
      ${r.rows.length ? `<div class="tablewrap"><table class="list"><thead><tr><th>変化</th><th>工事項目</th><th class="r">数量（前→今）</th><th class="r">金額（前→今）</th><th class="r">差</th></tr></thead><tbody>
        ${r.rows.map(x => `<tr><td><span class="pill ${kindLab[x.kind][1]}">${kindLab[x.kind][0]}</span></td><td><b>${esc(x.name)}</b><div class="small muted">${esc(x.spec || '')}</div></td>
          <td class="r num small">${fmt(x.qtyA, 3)} → ${fmt(x.qtyB, 3)} ${esc(x.unit || '')}</td><td class="r num small">${yen(x.amountA)} → ${yen(x.amountB)}</td>
          <td class="r money"><b>${x.diff > 0 ? '+' : x.diff < 0 ? '−' : ''}${yen(Math.abs(x.diff))}</b></td></tr>`).join('')}</tbody></table></div>
        <p class="small muted">差の大きい順。合計の差には諸経費・利益・値引き・消費税の変化も入っています。</p>` : '<p class="muted">明細は同じです。</p>'}`
  });
}

/* ---------- 印刷 ---------- */
export function printDoc(html) {
  let root = document.getElementById('print');
  if (!root) { root = document.createElement('div'); root.id = 'print'; document.body.appendChild(root); }
  root.innerHTML = html;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { try { window.print(); } catch (e) { done(); toast('印刷できませんでした：' + e.message, { bad: true }); } }, 60);
  setTimeout(done, 60000);
}

function companyBlock() {
  const c = state.company || {};
  if (!c.name) return '<div class="co" style="color:#a00">（会社情報が未入力です：設定 → 会社情報）</div>';
  return `<div class="co"><b>${esc(c.name)}</b><br>${c.zip ? '〒' + esc(c.zip) + '<br>' : ''}${esc(c.address || '')}${c.tel ? '<br>TEL ' + esc(c.tel) : ''}${c.fax ? '　FAX ' + esc(c.fax) : ''}${c.email ? '<br>' + esc(c.email) : ''}${c.regNo ? '<br>登録番号 ' + esc(c.regNo) : ''}${c.person ? '<br>担当 ' + esc(c.person) : ''}</div>`;
}
function itemsTable(p, t) {
  return `<table class="items"><thead><tr><th style="width:4%">No</th><th>工事項目</th><th style="width:22%">規格・仕様</th><th style="width:10%">数量</th><th style="width:6%">単位</th><th style="width:12%">単価</th><th style="width:14%">金額</th></tr></thead><tbody>
    ${p.lines.map((l, i) => `<tr><td class="r">${i + 1}</td><td>${esc(l.name)}</td><td>${esc(l.spec || '')}</td><td class="r">${fmt(t.lines[i].qty, 3)}</td><td>${esc(l.unit || '')}</td><td class="r">${Math.round(l.price || 0).toLocaleString('ja-JP')}</td><td class="r">${t.lines[i].amount.toLocaleString('ja-JP')}</td></tr>`).join('')}
  </tbody></table>`;
}
function totTable(t) {
  return `<table class="tot">
    <tr><td>小計</td><td class="r">${yen(t.subtotal)}</td></tr>
    ${t.overhead ? `<tr><td>諸経費</td><td class="r">${yen(t.overhead)}</td></tr>` : ''}
    ${t.profit ? `<tr><td>一般管理費</td><td class="r">${yen(t.profit)}</td></tr>` : ''}
    ${t.discount ? `<tr><td>出精値引き</td><td class="r">−${yen(t.discount)}</td></tr>` : ''}
    <tr><td>税抜合計</td><td class="r">${yen(t.net)}</td></tr>
    <tr><td>消費税（${t.taxRate}%）</td><td class="r">${yen(t.tax)}</td></tr>
    <tr class="g"><td>合計</td><td class="r">${yen(t.grand)}</td></tr></table>`;
}
export function estimateHtml(p, no, date, opt = opts()) {
  const t = totals(p, opt);
  return `<div class="doc"><h1>御見積書</h1>
    <div class="dhead"><div style="flex:1"><div class="to">${esc(p.customer || '')}　様</div>
      <p style="margin:10px 0 0">下記のとおり御見積申し上げます。</p>
      <table class="meta" style="margin-top:8px"><tr><td>件名</td><td>${esc(p.name || '')}</td></tr><tr><td>現場</td><td>${esc(p.address || '')}</td></tr><tr><td>有効期限</td><td>${esc(p.expiry || '')}</td></tr></table></div>
      <div><table class="meta" style="margin-left:auto"><tr><td>見積番号</td><td>${esc(p.number || '')}${no ? '（第' + no + '版）' : ''}</td></tr><tr><td>発行日</td><td>${esc(date || today())}</td></tr></table>${companyBlock()}</div></div>
    <div class="amount"><span>御見積金額（税込）</span><b>${yen(t.grand)}</b></div>
    ${itemsTable(p, t)}${totTable(t)}
    <div class="note">備考：${esc(p.note || '')}</div></div>`;
}
function invoiceHtml(p) {
  const t = totals(p, opts()); const c = state.company || {};
  return `<div class="doc"><h1>御請求書</h1>
    <div class="dhead"><div style="flex:1"><div class="to">${esc(p.customer || '')}　様</div><p style="margin:10px 0 0">下記のとおり御請求申し上げます。</p>
      <table class="meta" style="margin-top:8px"><tr><td>件名</td><td>${esc(p.name || '')}</td></tr><tr><td>現場</td><td>${esc(p.address || '')}</td></tr></table></div>
      <div><table class="meta" style="margin-left:auto"><tr><td>請求番号</td><td>${esc(p.number || '')}</td></tr><tr><td>発行日</td><td>${today()}</td></tr></table>${companyBlock()}</div></div>
    <div class="amount"><span>御請求金額（税込）</span><b>${yen(t.grand)}</b></div>
    ${itemsTable(p, t)}${totTable(t)}
    <div class="bank"><b>お振込先</b>：${esc(c.bank || '（設定 → 会社情報で入れてください）')}${c.payNote ? '<br>' + esc(c.payNote) : ''}</div>
    <div class="note">備考：${esc(p.note || '')}</div></div>`;
}
function breakdownHtml(p) {
  const o = opts(); const t = totals(p, o);
  const groups = {};
  p.lines.forEach((l, i) => { const k = KINDS[l.kind] || 'その他'; (groups[k] = groups[k] || []).push([l, t.lines[i]]); });
  return `<div class="doc"><h1>内訳書</h1>
    <table class="meta"><tr><td>件名</td><td>${esc(p.name || '')}</td></tr><tr><td>お客様</td><td>${esc(p.customer || '')} 様</td></tr><tr><td>作成日</td><td>${today()}</td></tr></table>
    <h2>区分ごとの金額</h2><table class="items"><thead><tr><th>区分</th><th style="width:20%">行数</th><th style="width:25%">金額（税抜）</th></tr></thead><tbody>
      ${Object.entries(groups).map(([k, a]) => `<tr><td>${k}</td><td class="r">${a.length}</td><td class="r">${a.reduce((s, x) => s + x[1].amount, 0).toLocaleString('ja-JP')}</td></tr>`).join('')}
      <tr><td><b>小計</b></td><td></td><td class="r"><b>${t.subtotal.toLocaleString('ja-JP')}</b></td></tr></tbody></table>
    <h2>部屋ごとの数量</h2><table class="items"><thead><tr><th>部屋</th><th>床 ㎡</th><th>天井 ㎡</th><th>壁 ㎡</th><th>周長 m</th><th>巾木 m</th><th>天井高 m</th></tr></thead><tbody>
      ${p.rooms.map(r => { const g = roomGeom(r, o); return `<tr><td>${esc(r.name)}${g.qty > 1 ? ` ×${g.qty}` : ''}</td><td class="r">${fmt(g.floor)}</td><td class="r">${fmt(g.ceil)}</td><td class="r">${fmt(g.wall)}</td><td class="r">${fmt(g.perim)}</td><td class="r">${fmt(g.base)}</td><td class="r">${fmt(g.h)}</td></tr>`; }).join('')}
    </tbody></table>
    ${Object.entries(groups).map(([k, a]) => `<h2>${k}</h2><table class="items"><thead><tr><th>工事項目</th><th style="width:22%">規格・仕様</th><th style="width:12%">数量</th><th style="width:6%">単位</th><th style="width:12%">単価</th><th style="width:14%">金額</th></tr></thead><tbody>
      ${a.map(([l, x]) => `<tr><td>${esc(l.name)}</td><td>${esc(l.spec || '')}</td><td class="r">${fmt(x.qty, 3)}</td><td>${esc(l.unit || '')}</td><td class="r">${Math.round(l.price || 0).toLocaleString('ja-JP')}</td><td class="r">${x.amount.toLocaleString('ja-JP')}</td></tr>`).join('')}</tbody></table>`).join('')}
  </div>`;
}
void $;

/* ---------- 階・場所ごとの内訳 ---------- */
function floorCard(p) {
  const F = floorsOf(p), hasPlan = p.rooms.some(r => r.src === 'plan');
  let res = null; try { res = F.length ? floorBreakdown(p, opts()) : null; } catch (e) { console.error(e); }
  const q = v => (+v).toLocaleString('ja-JP', { maximumFractionDigits: 2 });
  return `<div class="card" style="margin-top:14px"><h2>${icon('layers').replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-3px"')} 階・場所ごとの内訳</h2>
    <div class="sub">部屋ごとに「階・場所」を入れると、その単位で数え直して金額を分けます（例：1F、2F、外構）。空欄の部屋と、手で入れた行・配管は「共通」になります。</div>
    <details ${F.length ? '' : 'open'}><summary class="small" style="cursor:pointer;padding:6px 0">部屋ごとの階・場所（${p.rooms.length} 部屋${F.length ? '：' + F.map(f => esc(f) + ' ' + p.rooms.filter(r => String(r.lv || '').trim() === f).length).join('・') : ''}）</summary>
      <div class="grid g4" style="margin-top:6px">${p.rooms.map(r => `<label class="f">${esc(r.name)}<input class="in" data-lv="${esc(r.id)}" value="${esc(r.lv || '')}" placeholder="例：1F" list="lvList" autocomplete="off"></label>`).join('')}</div>
      <datalist id="lvList">${[...new Set(['1F', '2F', '3F', '4F', 'B1F', '外構', ...F])].map(v => `<option value="${esc(v)}">`).join('')}</datalist></details>
    <div class="row" style="margin-top:8px">${hasPlan ? `<button class="btn sm" data-act="floorAuto">図面から 1F・2F… と付ける</button>` : ''}${res ? `<button class="btn sm primary" data-act="floorPrint">${icon('print')}階ごとの内訳書</button>` : ''}</div>
    ${res ? `<div class="tablewrap" style="margin-top:10px"><table class="list"><thead><tr><th>階・場所</th><th class="r">行数</th><th class="r">金額（税抜）</th></tr></thead><tbody>
      ${res.parts.map(x => `<tr><td><b>${esc(x.name)}</b></td><td class="r">${x.rows.length}</td><td class="r money">${yen(x.sub)}</td></tr>`).join('')}
      <tr><td>内訳の合計</td><td></td><td class="r money"><b>${yen(res.sum)}</b></td></tr></tbody></table></div>
      <div class="small muted" style="margin-top:6px">見積もり全体の小計 ${yen(res.total)}${Math.abs(res.sum - res.total) >= 1 ? `（差 ${yen(Math.abs(res.sum - res.total))}）。階ごとに数え直すので、ロスの切り上げや器具の数の振り分けで少し差が出ます。` : ''}</div>
      ${res.parts.map(x => `<details style="margin-top:6px"><summary class="small" style="cursor:pointer">${esc(x.name)} の明細（${x.rows.length} 行）</summary><div class="tablewrap"><table class="list"><tbody>
        ${x.rows.map(r => `<tr><td>${esc(r.l.name)}<div class="small muted">${esc(r.l.spec || '')}</div></td><td class="r">${q(r.qty)} ${esc(r.l.unit || '')}</td><td class="r money">${yen(r.amount)}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}` : ''}
  </div>`;
}
function floorHtml(p, res) {
  return `<div class="doc"><h1>内訳書（階・場所ごと）</h1>
    <table class="meta"><tr><td>件名</td><td>${esc(p.name || '')}</td></tr><tr><td>お客様</td><td>${esc(p.customer || '')} 様</td></tr><tr><td>作成日</td><td>${today()}</td></tr></table>
    <h2>階・場所ごとの金額</h2><table class="items"><thead><tr><th>階・場所</th><th style="width:30%">金額（税抜）</th></tr></thead><tbody>
      ${res.parts.map(x => `<tr><td>${esc(x.name)}</td><td class="r">${x.sub.toLocaleString('ja-JP')}</td></tr>`).join('')}
      <tr><td><b>合計</b></td><td class="r"><b>${res.sum.toLocaleString('ja-JP')}</b></td></tr></tbody></table>
    ${res.parts.map(x => `<h2>${esc(x.name)}　${yen(x.sub)}</h2><table class="items"><thead><tr><th>工事項目</th><th style="width:22%">規格・仕様</th><th style="width:12%">数量</th><th style="width:6%">単位</th><th style="width:12%">単価</th><th style="width:14%">金額</th></tr></thead><tbody>
      ${x.rows.map(r => `<tr><td>${esc(r.l.name)}</td><td>${esc(r.l.spec || '')}</td><td class="r">${fmt(r.qty, 3)}</td><td>${esc(r.l.unit || '')}</td><td class="r">${Math.round(r.l.price || 0).toLocaleString('ja-JP')}</td><td class="r">${r.amount.toLocaleString('ja-JP')}</td></tr>`).join('')}</tbody></table>`).join('')}
    ${Math.abs(res.sum - res.total) >= 1 ? `<div class="note">見積もり全体の小計 ${yen(res.total)}。階ごとに数え直すため、材料の切り上げなどで少し差が出ることがあります。</div>` : ''}
  </div>`;
}
