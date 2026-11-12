/* ホームと案件一覧 */
import { state, registerView, setTop, go, newProject, opts, render } from './app.js';
import { totals, check } from './calc.js';
import { icon, esc, yen, pct, when, $ } from './ui.js';
import { showIntro, showNotice } from './pages.js';

export const STATUS = { draft: ['見積中', 'acc'], sent: ['提出済', 'info'], won: ['受注', 'ok'], lost: ['失注', ''] };

function summary(p) {
  const t = totals(p, opts());
  const c = check(p, opts());
  return { t, errors: c.filter(x => x.level === 'error').length, warns: c.filter(x => x.level === 'warn').length };
}

function rowsHtml(list) {
  if (!list.length) return '';
  return list.map(p => {
    const s = summary(p);
    const [lab, cls] = STATUS[p.status] || STATUS.draft;
    const g = Math.max(0, Math.min(100, s.t.grossPct));
    return `<tr class="click" data-open="${esc(p.id)}">
      <td class="pname"><b>${esc(p.name || '名前のない案件')}</b><small>${esc(p.customer || 'お客様 未入力')}${p.address ? '・' + esc(p.address) : ''}</small></td>
      <td class="r money"><b>${yen(s.t.grand)}</b><small class="show-m small muted">${s.t.net > 0 ? '粗利 ' + pct(s.t.grossPct) : ''}</small></td>
      <td class="hide-m"><div class="row" style="gap:8px;flex-wrap:nowrap"><div class="bar" style="width:70px"><i style="width:${g}%;${s.t.grossPct < 15 ? 'background:var(--warn)' : ''}"></i></div><span class="small num">${s.t.net > 0 ? pct(s.t.grossPct) : '—'}</span></div></td>
      <td><span class="pill ${cls}">${lab}</span>${s.errors ? ` <span class="pill bad" title="確認が必要な所">要確認 ${s.errors}</span>` : ''}</td>
      <td class="hide-m small muted">${when(p.updatedAt)}</td>
    </tr>`;
  }).join('');
}
const table = list => `<div class="tablewrap"><table class="list cards">
  <thead><tr><th>案件・お客様</th><th class="r">金額（税込）</th><th class="hide-m">粗利率</th><th>状態</th><th class="hide-m">更新</th></tr></thead>
  <tbody>${rowsHtml(list)}</tbody></table></div>`;

function bindOpen(el) {
  el.querySelectorAll('[data-open]').forEach(tr => tr.onclick = () => go('#/p/' + encodeURIComponent(tr.dataset.open) + '/1'));
}

async function create() {
  const p = newProject();
  go('#/p/' + encodeURIComponent(p.id) + '/1');
}

registerView('home', async el => {
  setTop('ホーム');
  const ps = state.projects;
  const open = ps.filter(p => p.status === 'draft' || p.status === 'sent' || !p.status);
  const sums = ps.map(p => ({ p, ...summary(p) }));
  const openSum = sums.filter(x => open.includes(x.p)).reduce((s, x) => s + x.t.grand, 0);
  const withNet = sums.filter(x => x.t.net > 0);
  const avgGross = withNet.length ? withNet.reduce((s, x) => s + x.t.grossPct, 0) / withNet.length : 0;
  const errs = sums.reduce((s, x) => s + x.errors, 0);
  const thisMonth = ps.filter(p => new Date(p.createdAt).getMonth() === new Date().getMonth() && new Date(p.createdAt).getFullYear() === new Date().getFullYear()).length;
  const h = new Date().getHours();
  const hello = h < 10 ? 'おはようございます' : h < 18 ? 'こんにちは' : 'おつかれさまです';
  const last = ps[0];
  const feed = ps.flatMap(p => [
    { t: p.updatedAt, txt: `「${p.name || '名前のない案件'}」を更新`, id: p.id },
    ...(p.history || []).map(hh => ({ t: hh.at, txt: `「${p.name}」の見積書 第${hh.no}版を出しました（${yen(hh.grand)}）`, id: p.id }))
  ]).filter(x => x.t).sort((a, b) => b.t - a.t).slice(0, 7);

  el.innerHTML = `
    <div class="hello">
      <div style="flex:1;min-width:240px"><div class="eyebrow">KAKU ・ ${new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}</div>
        <h2>${hello}${state.company.person ? '、' + esc(state.company.person) + 'さん' : ''}</h2>
        <p>${ps.length ? `見積中・提出済の案件が ${open.length} 件あります。${errs ? `確認が必要な所が ${errs} か所あります。` : ''}` : '最初の案件を作ってみましょう。'}</p></div>
      <button class="btn primary big" id="newBtn">${icon('plus')}新しい見積もり</button>
    </div>
    <div class="eyebrow">何をしますか？</div>
    <div class="actions">
      <button class="action" id="aNew"><div class="ic">${icon('plus')}</div><b>見積もりを作る</b><span>現場の情報と部屋の寸法を入れると、数量が自動で出ます</span></button>
      <button class="action" id="aLast" ${last ? '' : 'disabled'}><div class="ic b">${icon('folder')}</div><b>続きから</b><span>${last ? esc(last.name || '名前のない案件') + ' を開く' : 'まだ案件がありません'}</span></button>
      <a class="action" href="./old/"><div class="ic y">${icon('layers')}</div><b>図面・照明・3D</b><span>図面の読み込み・照明の自動配置・3Dは前の画面で使えます</span></a>
      <a class="action" href="#/master"><div class="ic g">${icon('tag')}</div><b>単価を確かめる</b><span>品目と単価、掛け率を会社に合わせます</span></a>
    </div>
    <div class="kpis">
      <button class="kpi link" data-kpi="open"><div class="k">見積中・提出済の合計</div><div class="v money">${yen(openSum)}</div><div class="s">税込・${open.length} 件 ・ 一覧を見る ›</div></button>
      <button class="kpi link" data-kpi="all"><div class="k">案件</div><div class="v num">${ps.length}<span class="small muted"> 件</span></div><div class="s">今月 ${thisMonth} 件 ・ 一覧を見る ›</div></button>
      <button class="kpi link" data-kpi="gross"><div class="k">平均の粗利率</div><div class="v num" style="color:${avgGross < 15 && withNet.length ? 'var(--warn)' : 'var(--ok)'}">${withNet.length ? pct(avgGross) : '—'}</div><div class="s">粗利率の低い順に見る ›</div></button>
      <button class="kpi link" data-kpi="err"><div class="k">確認が必要な所</div><div class="v num" style="color:${errs ? 'var(--bad)' : 'var(--ok)'}">${errs}</div><div class="s">${errs ? `${sums.filter(x => x.errors).length} 件の案件 ・ 見る ›` : '問題ありません'}</div></button>
    </div>
    <div class="homegrid">
      <div class="card" style="padding:16px 8px 6px">
        <div class="row" style="padding:0 10px 6px"><div><h2>最近の案件</h2><div class="sub" style="margin:0">タップすると開きます</div></div><span class="spacer"></span><a class="btn sm" href="#/projects">すべて見る</a></div>
        ${ps.length ? table(ps.slice(0, 8)) : `<div class="empty"><b>まだ案件がありません</b>「新しい見積もり」から始めましょう。<br><br><button class="btn" id="sampleBtn">見本の案件で試してみる</button></div>`}
      </div>
      <div class="card">
        <h2>最近の動き</h2><div class="sub">更新と見積書の発行</div>
        <div class="feed">${feed.length ? feed.map(f => `<div><time>${when(f.t)}</time><span>${esc(f.txt)}</span></div>`).join('') : '<span class="muted small">まだありません</span>'}</div>
      </div>
    </div>`;
  $('#newBtn').onclick = create;
  $('#aNew').onclick = create;
  el.querySelectorAll('[data-kpi]').forEach(b => b.onclick = () => {
    const k = b.dataset.kpi;
    /* 確認が必要な案件が1件だけなら、その案件の「④確認」へ直接 */
    if (k === 'err') {
      const bad = sums.filter(x => x.errors);
      if (bad.length === 1) { go('#/p/' + encodeURIComponent(bad[0].p.id) + '/4'); return; }
    }
    state.listFilter = { q: '', status: k === 'open' ? 'open' : k === 'err' ? 'err' : 'all', sort: k === 'gross' ? 'gross' : 'new' };
    go('#/projects');
  });
  if (last) $('#aLast').onclick = () => go('#/p/' + encodeURIComponent(last.id) + '/1');
  const sb = $('#sampleBtn'); if (sb) sb.onclick = async () => { const { addSample } = await import('./pages.js'); addSample(); };
  bindOpen(el);
  if (!state.settings.noticeSeen) showNotice(() => { if (!state.settings.introSeen) showIntro(); });
  else if (!state.settings.introSeen) showIntro();
});

registerView('projects', async el => {
  setTop('案件');
  const st = state.listFilter || (state.listFilter = { q: '', status: 'all', sort: 'new' });
  const draw = () => {
    const q = st.q.trim().toLowerCase();
    const stOk = p => st.status === 'all' ? true
      : st.status === 'open' ? ['draft', 'sent'].includes(p.status || 'draft')
        : st.status === 'err' ? check(p, opts()).some(c => c.level === 'error')
          : (p.status || 'draft') === st.status;
    let list = state.projects.filter(p => stOk(p) &&
      (!q || [p.name, p.customer, p.address, p.number].join(' ').toLowerCase().includes(q)));
    if (st.sort === 'old') list = [...list].sort((a, b) => a.updatedAt - b.updatedAt);
    if (st.sort === 'name') list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
    if (st.sort === 'amt') list = [...list].sort((a, b) => totals(b, opts()).grand - totals(a, opts()).grand);
    if (st.sort === 'gross') list = [...list].sort((a, b) => { const ta = totals(a, opts()), tb = totals(b, opts()); return (ta.net > 0 ? ta.grossPct : 999) - (tb.net > 0 ? tb.grossPct : 999); });
    $('#plist').innerHTML = (st.status !== 'all' || st.sort !== 'new' ? `<div class="row small muted" style="padding:6px 10px">${{ open: '見積中・提出済の案件', err: '確認が必要な所がある案件', draft: '見積中の案件', sent: '提出済の案件', won: '受注の案件', lost: '失注の案件' }[st.status] || 'すべての案件'}${st.sort === 'gross' ? '（粗利率が低い順）' : ''}：${list.length} 件<span class="spacer"></span><button class="btn sm ghost" id="clr">条件を外す</button></div>` : '') +
      (list.length ? table(list) : `<div class="empty"><b>${state.projects.length ? '当てはまる案件がありません' : 'まだ案件がありません'}</b></div>`);
    const c = $('#clr'); if (c) c.onclick = () => { st.status = 'all'; st.sort = 'new'; render(); };
    bindOpen($('#plist'));
  };
  el.innerHTML = `
    <div class="row" style="margin-bottom:14px">
      <div class="unitwrap" style="flex:1;min-width:220px"><input class="in" id="q" type="search" placeholder="案件名・お客様・住所・番号で探す" value="${esc(st.q)}" enterkeyhint="search"><span>${icon('search')}</span></div>
      <select class="in" id="fs" style="width:auto"><option value="all">すべての状態</option><option value="open" ${st.status === 'open' ? 'selected' : ''}>見積中・提出済</option>${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${st.status === k ? 'selected' : ''}>${l}</option>`).join('')}<option value="err" ${st.status === 'err' ? 'selected' : ''}>確認が必要な案件</option></select>
      <select class="in" id="so" style="width:auto"><option value="new">更新が新しい順</option><option value="old" ${st.sort === 'old' ? 'selected' : ''}>更新が古い順</option><option value="name" ${st.sort === 'name' ? 'selected' : ''}>案件名の順</option><option value="amt" ${st.sort === 'amt' ? 'selected' : ''}>金額が高い順</option><option value="gross" ${st.sort === 'gross' ? 'selected' : ''}>粗利率が低い順</option></select>
      <button class="btn primary" id="newBtn">${icon('plus')}新しい見積もり</button>
    </div>
    <div class="card" style="padding:8px" id="plist"></div>`;
  $('#q').oninput = e => { st.q = e.target.value; draw(); };
  $('#fs').onchange = e => { st.status = e.target.value; draw(); };
  $('#so').onchange = e => { st.sort = e.target.value; draw(); };
  $('#newBtn').onclick = create;
  draw();
});
