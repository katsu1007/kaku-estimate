/* 寸法で間取りを作る画面（全画面）。
 * 3つの作り方：① 四角（幅×奥行） ② 向きと長さ（↑→↓← と mm） ③ 写真・手描きの図の角をタップ → 辺の寸法を順に入れる
 * 計算は js/sketch.js（前のKAKUと同じ）。できた間取りは「図面にする」で区画になり、照明・3D・内訳などがそのまま使える。 */
import { DIRS, dist, area, mm, walk, makeRoom, rectRoom, nextStart, fixEdge, square, shapeProblems, edgeC, isEdge } from './sketch.js';
import { icon, esc, toast, ask } from './ui.js';

const clone = o => JSON.parse(JSON.stringify(o));

/* PDF の1ページ目（など）を画像にする（前のKAKUの KT_fromFile と同じ：長い辺 2200px まで） */
export async function pdfImage(file, page = 1) {
  const base = new URL('../vendor/pdfjs/', import.meta.url).href;
  const lib = window.pdfjsLib || (window.pdfjsLib = await import(base + 'pdf.min.mjs'));
  lib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, cMapUrl: base + 'cmaps/', cMapPacked: true }).promise;
  const pg = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
  const v1 = pg.getViewport({ scale: 1 }), sc = Math.min(3, 2200 / Math.max(v1.width, v1.height)), vp = pg.getViewport({ scale: sc });
  const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
  await pg.render({ canvasContext: cx, viewport: vp }).promise;
  return { src: cv.toDataURL('image/jpeg', 0.8), w: cv.width, h: cv.height, pages: doc.numPages };
}
export async function fileImage(file, page) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return pdfImage(file, page);
  const src = await new Promise((res, rej) => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.onerror = () => rej(new Error('画像を開けませんでした')); rd.readAsDataURL(file); });
  const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('画像を開けませんでした')); i.src = src; });
  const M = 2200, k = Math.min(1, M / Math.max(im.width, im.height)), cv = document.createElement('canvas');
  cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
  const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height);
  return { src: cv.toDataURL('image/jpeg', 0.8), w: cv.width, h: cv.height };
}

export function openSketch(p, { onApply, onSave, file }) {
  const sk = clone(p.sketch || { rooms: [], draft: null, s: null, sOk: false, img: null });
  const E = { dir: 1, sel: null, tap: null, sc: null, meas: null };
  if (sk.ortho === undefined) sk.ortho = true;
  let UV = null, lastVB = null, noClick = 0;
  const undo = [];
  const snap = () => { undo.push(clone({ rooms: sk.rooms, draft: sk.draft, s: sk.s, sOk: sk.sOk })); if (undo.length > 40) undo.shift(); };
  const save = () => { p.sketch = clone(sk); onSave && onSave(); };

  const root = document.createElement('div');
  root.className = 'sksheet';
  root.innerHTML = `<div class="skhead"><b>間取りを作る（寸法・なぞって拾う）</b><span class="spacer"></span><button class="btn sm ghost" data-a="close">閉じる</button></div>
    <div class="skbody"><div class="skview"><svg id="skSvg" xmlns="http://www.w3.org/2000/svg"></svg><div class="pv-tools"><button class="iconbtn" data-z="in" aria-label="拡大">＋</button><button class="iconbtn" data-z="out" aria-label="縮小">－</button><button class="iconbtn" data-z="fit" aria-label="全体を表示">⤢</button></div></div><div class="skpanel" id="skPanel"></div></div>
    <input type="file" id="skPhoto" accept="image/*,.pdf,application/pdf" hidden>`;
  document.body.appendChild(root);
  document.documentElement.style.overflow = 'hidden';
  const $ = s => root.querySelector(s), svg = $('#skSvg'), panel = $('#skPanel');
  const close = () => { root.remove(); document.documentElement.style.overflow = ''; };

  const nameOr = () => ((($('#skName') || {}).value ?? E.name) || '').trim() || ('部屋' + (sk.rooms.length + 1));
  const draftPts = () => sk.draft ? walk(sk.draft.start, sk.draft.edges) : [];
  const toUser = ev => { const m = svg.getScreenCTM(); if (!m) return null; const q = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse()); return [q.x, -q.y]; };
  let vbFix = null;

  function paint() {
    let all = []; sk.rooms.forEach(r => { all = all.concat(r.v); }); all = all.concat(draftPts());
    const photo = sk.img && sk.s;
    if (photo && (E.tap || !all.length)) all.push([0, 0], [sk.img.w * sk.s, -sk.img.h * sk.s]);
    if (E.tap) all = all.concat(E.tap.pts);
    if ((E.sc || E.meas) && photo) all.push([0, 0], [sk.img.w * sk.s, -sk.img.h * sk.s]);
    if (E.tap && !photo) all = all.concat([[0, 0], [10, -8]]);
    if (!all.length) all = [[0, 0], [3.64, 2.73]];
    const xs = all.map(q => q[0]), ys = all.map(q => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = Math.max(x1 - x0, 1.8), h = Math.max(y1 - y0, 1.8), m = Math.max(w, h) * 0.12 + 0.4;
    let VB = [x0 - m, -(y1 + m), w + 2 * m, h + 2 * m];
    if (E.tap || E.sc || E.meas) { vbFix = vbFix || VB; VB = vbFix; } else vbFix = null;
    if (UV) VB = UV;
    lastVB = VB;
    const fs = Math.max(VB[2], VB[3]) / 34, lw = Math.max(VB[2], VB[3]) / 400;
    svg.setAttribute('viewBox', VB.join(' '));
    let s = '';
    if (photo) s += `<image href="${sk.img.src}" x="0" y="0" width="${sk.img.w * sk.s}" height="${sk.img.h * sk.s}" opacity="${E.tap || E.sc || E.meas ? 0.9 : 0.45}" preserveAspectRatio="none"/>`;
    sk.rooms.forEach((r, ri) => {
      const P = r.v; let cx = 0, cy = 0; P.forEach(q => { cx += q[0] / P.length; cy += q[1] / P.length; });
      s += `<polygon points="${P.map(q => `${q[0]},${-q[1]}`).join(' ')}" fill="${r.bad ? 'rgba(239,95,95,.14)' : 'rgba(255,138,61,.10)'}" stroke="var(--text)" stroke-width="${lw * 2.2}"/>`;
      r.c.forEach((c, ci) => {
        const a = P[c.a], b = P[c.b], L = dist(a, b); if (L < 1e-6) return;
        const edge = isEdge(r, c.a, c.b); let mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        if (edge) { let nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L; if ((mx + nx - cx) ** 2 + (my + ny - cy) ** 2 < (mx - nx - cx) ** 2 + (my - ny - cy) ** 2) { nx = -nx; ny = -ny; } mx += nx * fs * 0.9; my += ny * fs * 0.9; }
        else { s += `<line x1="${a[0]}" y1="${-a[1]}" x2="${b[0]}" y2="${-b[1]}" stroke="var(--muted)" stroke-width="${lw}" stroke-dasharray="${lw * 6} ${lw * 4}"/>`; mx = a[0] + (b[0] - a[0]) * 0.25; my = a[1] + (b[1] - a[1]) * 0.25; }
        const on = E.sel && E.sel.r === ri && E.sel.c === ci;
        s += `<text x="${mx}" y="${-my}" font-size="${fs}" text-anchor="middle" dominant-baseline="central" data-r="${ri}" data-c="${ci}" class="skdim${c.ok ? '' : ' tmp'}${on ? ' sel' : ''}">${c.ok ? '' : '約'}${mm(c.ok ? c.l : L)}</text>`;
      });
      s += `<text x="${cx}" y="${-cy}" font-size="${fs * 1.1}" text-anchor="middle" dominant-baseline="central" font-weight="800" fill="var(--text)">${esc(r.name)}</text>`;
      s += `<text x="${cx}" y="${-cy + fs * 1.3}" font-size="${fs * 0.85}" text-anchor="middle" dominant-baseline="central" fill="var(--muted)">${area(P).toFixed(2)}㎡</text>`;
    });
    const dp = draftPts();
    if (dp.length) { s += `<polyline points="${dp.map(q => `${q[0]},${-q[1]}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="${lw * 3}"/>`; const e = dp[dp.length - 1]; s += `<circle cx="${e[0]}" cy="${-e[1]}" r="${fs * 0.3}" fill="var(--accent)"/>`; }
    if (E.tap) { const T = E.tap.pts; if (T.length) s += `<polyline points="${T.concat(T.length > 2 ? [T[0]] : []).map(q => `${q[0]},${-q[1]}`).join(' ')}" fill="rgba(255,138,61,.15)" stroke="var(--accent)" stroke-width="${lw * 3}"/>`; T.forEach((q, i) => { s += `<circle cx="${q[0]}" cy="${-q[1]}" r="${fs * 0.35}" fill="var(--accent)"/><text x="${q[0]}" y="${-q[1] - fs * 0.8}" font-size="${fs * 0.8}" text-anchor="middle" fill="var(--accent)" font-weight="800">${i + 1}</text>`; }); }
    const two = (P, col, lab) => { let h = ''; P.forEach(q => { h += `<circle cx="${q[0]}" cy="${-q[1]}" r="${fs * 0.3}" fill="${col}"/>`; }); if (P.length === 2) { h += `<line x1="${P[0][0]}" y1="${-P[0][1]}" x2="${P[1][0]}" y2="${-P[1][1]}" stroke="${col}" stroke-width="${lw * 3}"/>`; if (lab) h += `<text x="${(P[0][0] + P[1][0]) / 2}" y="${-(P[0][1] + P[1][1]) / 2 - fs * 0.5}" font-size="${fs}" text-anchor="middle" fill="${col}" stroke="var(--bg)" stroke-width="${lw * 3}" paint-order="stroke" font-weight="800">${lab}</text>`; } return h; };
    if (E.sc) s += two(E.sc, '#5ab7ff');
    if (E.meas) s += two(E.meas, '#3ccf8e', E.meas.length === 2 ? mm(dist(E.meas[0], E.meas[1])) + ' mm' + (sk.img && !sk.sOk ? '（縮尺未設定）' : '') : '');
    svg.innerHTML = s;
  }
  /* 拡大・縮小・ずらす（ボタン・ホイール・2本指・1本指でなぞる） */
  const zoomAt = (cx, cy, k) => { const VB = (UV || lastVB).slice(), r = svg.getBoundingClientRect(); if (!r.width) return;
    const sc = Math.max(VB[2] / r.width, VB[3] / r.height), ox = VB[0] + (VB[2] - r.width * sc) / 2, oy = VB[1] + (VB[3] - r.height * sc) / 2;
    const ux = ox + (cx - r.left) * sc, uy = oy + (cy - r.top) * sc;
    UV = [ux - (ux - VB[0]) / k, uy - (uy - VB[1]) / k, VB[2] / k, VB[3] / k]; paint(); };
  root.querySelector('.skview .pv-tools').addEventListener('click', e => { const z = e.target.closest('[data-z]'); if (!z) return; e.stopPropagation(); const r = svg.getBoundingClientRect();
    if (z.dataset.z === 'fit') { UV = null; paint(); return; } zoomAt(r.left + r.width / 2, r.top + r.height / 2, z.dataset.z === 'in' ? 1.4 : 1 / 1.4); });
  svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
  const PT = new Map(); let pan = null, pinch = null;
  svg.addEventListener('pointerdown', e => { PT.set(e.pointerId, [e.clientX, e.clientY]);
    if (PT.size === 1) pan = { x: e.clientX, y: e.clientY, vb: (UV || lastVB).slice(), moved: false };
    if (PT.size === 2) { const [a, b] = [...PT.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), vb: (UV || lastVB).slice(), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; pan = null; } });
  svg.addEventListener('pointermove', e => { if (!PT.has(e.pointerId)) return; PT.set(e.pointerId, [e.clientX, e.clientY]);
    const r = svg.getBoundingClientRect();
    if (pinch && PT.size === 2) { const [a, b] = [...PT.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); UV = pinch.vb.slice(); zoomAt(pinch.m[0], pinch.m[1], d / pinch.d); noClick = Date.now() + 400; return; }
    if (pan && PT.size === 1) { const dx = e.clientX - pan.x, dy = e.clientY - pan.y; if (!pan.moved && Math.hypot(dx, dy) < 8) return; pan.moved = true;
      const sc = Math.max(pan.vb[2] / r.width, pan.vb[3] / r.height); UV = [pan.vb[0] - dx * sc, pan.vb[1] - dy * sc, pan.vb[2], pan.vb[3]]; paint(); } });
  const pUp = e => { PT.delete(e.pointerId); if (pan && pan.moved) noClick = Date.now() + 400; if (!PT.size) { pan = null; pinch = null; } };
  svg.addEventListener('pointerup', pUp); svg.addEventListener('pointercancel', pUp);

  function info() {
    const d = sk.draft, r = E.sel ? sk.rooms[E.sel.r] : null, c = r ? r.c[E.sel.c] : null;
    const prob = shapeProblems(sk.rooms), rough = sk.rooms.filter(x => x.rough);
    const left = sk.rooms.reduce((n, x) => n + x.v.filter((_, i) => !edgeC(x, i).ok).length, 0);
    let h = '';
    if (E.sc) {
      h = `<div class="skbox"><b>縮尺を合わせる</b><p class="small muted">長さが分かっている所（寸法線など）の両端を2か所タップして、その長さを入れてください。拡大（＋・2本指）すると正確に押せます。</p>
        ${E.sc.length === 2 ? `<div class="row"><div class="unitwrap" style="flex:1"><input class="in num big" id="skScale" type="number" inputmode="numeric" placeholder="例 3640"><span>mm</span></div><button class="btn primary" data-a="scaleSet">決定</button></div>` : `<b class="small">${E.sc.length ? 'もう1か所タップしてください' : '1か所目をタップしてください'}</b>`}
        <div class="row"><button class="btn ghost" data-a="scaleCancel">やめる</button></div></div>`;
    } else if (E.meas) {
      h = `<div class="skbox"><b>測る</b><p class="small muted">2か所タップすると、その間の長さが出ます。</p>${E.meas.length === 2 ? `<b style="font-size:20px">${mm(dist(E.meas[0], E.meas[1]))} mm</b>${sk.img && !sk.sOk ? '<span class="small" style="color:var(--warn)">縮尺を合わせていないので、目安です</span>' : ''}` : ''}
        <div class="row"><button class="btn ghost" data-a="measDone">終わる</button></div></div>`;
    } else if (E.tap) {
      h = `<div class="skbox"><b>${E.tap.photo ? '写真の上で' : ''}部屋の角を順番にタップ</b><p class="small muted">回りながら角をタップしてください（${E.tap.pts.length} か所）。形を取ったあと、辺の寸法を順に入れると正しい大きさになります。</p>
        <label class="row small" style="gap:6px"><input type="checkbox" id="skOrtho" ${sk.ortho ? 'checked' : ''} style="width:20px;height:20px">直角に合わせる（縦・横にまっすぐ吸い付く）</label>
        ${E.tap.photo && sk.sOk ? '<p class="small muted">縮尺を合わせてあるので、取った形がそのままの大きさになります。最初の点をタップすると閉じます。</p>' : ''}
        <div class="row"><button class="btn primary" data-a="tapDone" ${E.tap.pts.length < 3 ? 'disabled' : ''}>形を取る</button><button class="btn" data-a="back">1つ戻す</button><button class="btn ghost" data-a="tapCancel">やめる</button></div></div>`;
    } else if (r && c) {
      h = `<div class="skbox"><b>「${esc(r.name)}」の${isEdge(r, c.a, c.b) ? '辺' : '角どうし'}の長さ</b><p class="small muted">今は ${c.ok ? '' : '約'}${mm(c.ok ? c.l : dist(r.v[c.a], r.v[c.b]))} mm。測った長さを入れてください。${r.rough && !r.c.some(x => x.ok) ? '最初の寸法で、部屋全体' + (r.photo ? '（と写真）' : '') + 'の大きさを合わせます。' : ''}</p>
        <div class="row"><div class="unitwrap" style="flex:1"><input class="in num big" id="skFix" type="number" inputmode="numeric" placeholder="例 3640"><span>mm</span></div><button class="btn primary" data-a="fix">直す</button></div>
        <div class="row" style="margin-top:6px">${!isEdge(r, c.a, c.b) ? '<button class="btn sm ghost danger" data-a="delDiag">この寸法を消す</button>' : ''}${r.rough ? '<button class="btn sm" data-a="square">縦横にそろえる</button>' : ''}<button class="btn sm ghost" data-a="unsel">選ぶのをやめる</button><button class="btn sm ghost danger" data-a="delRoom">この部屋を消す</button></div>
        ${r.bad ? `<p class="small" style="color:var(--bad)">寸法が合っていません：${esc(r.bad)}</p>` : ''}</div>`;
    } else if (d) {
      h = `<div class="skbox"><b>「${esc(d.name)}」を向きと長さで描く</b><p class="small muted">向きを選んで長さを入れ「辺を足す」。最初の角に戻ると自動で部屋になります。</p>
        <div class="skdirs">${DIRS.map((x, i) => `<button class="${E.dir === i ? 'on' : ''}" data-dir="${i}">${x[0]}</button>`).join('')}</div>
        <div class="row" style="margin-top:6px"><div class="unitwrap" style="flex:1"><input class="in num big" id="skLen" type="number" inputmode="numeric" placeholder="例 3640"><span>mm</span></div><button class="btn primary" data-a="edge">辺を足す</button></div>
        <div class="row" style="margin-top:6px"><button class="btn" data-a="closeRoom" ${d.edges.length < 2 ? 'disabled' : ''}>閉じて部屋にする</button><button class="btn ghost" data-a="back">1つ戻す</button></div>
        <p class="small muted">${d.edges.map(e => DIRS[e.d][0] + mm(e.l)).join('　') || 'まだ辺がありません'}</p></div>`;
    } else {
      h = `<label class="f">次の部屋の名前<input class="in" id="skName" placeholder="部屋${sk.rooms.length + 1}" value="${esc(E.name || '')}"></label>
        <div class="skbox"><b>① 四角の部屋</b><div class="row"><div class="unitwrap" style="flex:1"><input class="in num" id="skW" type="number" inputmode="numeric" placeholder="幅"><span>mm</span></div><span>×</span><div class="unitwrap" style="flex:1"><input class="in num" id="skH" type="number" inputmode="numeric" placeholder="奥行"><span>mm</span></div><button class="btn primary" data-a="rect">足す</button></div></div>
        <div class="skbox"><b>② L字などは向きと長さで</b><div class="row"><button class="btn" data-a="draft">描き始める</button><span class="small muted">↑→↓← と長さ（mm）で1辺ずつ</span></div></div>
        <div class="skbox"><b>③ PDF・写真・手描きの図をなぞる</b><div class="row"><button class="btn" data-a="photo">${icon('up')}${sk.img ? '下に敷く図を替える' : 'PDF・写真を選ぶ'}</button>${sk.img ? '<button class="btn" data-a="tapPhoto">写真の上で角をタップ</button>' : ''}<button class="btn ghost" data-a="tap">写真なしで描く</button></div>
          ${sk.img ? `<div class="row"><button class="btn sm" data-a="scale">縮尺を合わせる${sk.sOk ? '（合わせてあります）' : ''}</button><button class="btn sm" data-a="meas">測る</button></div>` : ''}
          <p class="small muted">図面のPDF・写真・手描きの図を下に敷いて、角をタップして形を取ります（なぞって拾う）。先に「縮尺を合わせる」をすると、なぞった形がそのまま正しい大きさになります。合わせない時は、辺の寸法を入れて大きさを合わせます。</p></div>
        ${sk.rooms.length ? `<div class="skbox"><b>${sk.rooms.length} 部屋・${sk.rooms.reduce((s, x) => s + area(x.v), 0).toFixed(2)}㎡</b>
          <p class="small muted">図の寸法の数字をタップすると直せます。${left ? `<b style="color:var(--warn)">「約」の付いた寸法が ${left} 本あります。</b>` : ''}</p>
          ${rough.length ? '<button class="btn sm" data-a="square">ほぼ縦・横の辺をそろえる</button>' : ''}
          ${prob.length ? `<p class="small" style="color:var(--bad)">${prob.slice(0, 4).map(esc).join('<br>')}</p>` : ''}</div>` : ''}
        <div class="row skfoot"><button class="btn ghost" data-a="back" ${undo.length ? '' : 'disabled'}>1つ戻す</button><span class="spacer"></span><button class="btn primary" data-a="apply" ${sk.rooms.length ? '' : 'disabled'}>${icon('check')}図面にする</button></div>`;
    }
    panel.innerHTML = h;
    const f = panel.querySelector('#skFix, #skLen'); if (f) setTimeout(() => f.focus(), 30);
  }
  const redraw = () => { paint(); info(); };

  svg.addEventListener('click', ev => {
    if (Date.now() < noClick) return;
    const t = ev.target.closest('[data-c]');
    const upp = lastVB ? Math.max(lastVB[2] / (svg.getBoundingClientRect().width || 1), lastVB[3] / (svg.getBoundingClientRect().height || 1)) : 0.01;
    if (E.sc || E.meas) { const q = toUser(ev); if (!q) return; const L = E.sc || E.meas; if (L.length >= 2) L.length = 0; L.push(q); redraw(); return; }
    if (E.tap) { let q = toUser(ev); if (!q) return; const T = E.tap.pts;
      if (T.length >= 3 && dist(q, T[0]) < 22 * upp) { root.querySelector('[data-a=tapDone]').click(); return; }
      if (T.length && sk.ortho) { const a0 = T[T.length - 1], dx = q[0] - a0[0], dy = q[1] - a0[1]; if (Math.abs(dx) < Math.abs(dy) * 0.18) q = [a0[0], q[1]]; else if (Math.abs(dy) < Math.abs(dx) * 0.18) q = [q[0], a0[1]]; }
      if (T.length && dist(q, T[T.length - 1]) < 4 * upp) return;
      T.push([Math.round(q[0] * 1000) / 1000, Math.round(q[1] * 1000) / 1000]); redraw(); return; }
    if (t && !E.tap) { E.sel = { r: +t.dataset.r, c: +t.dataset.c }; redraw(); return; }
  });
  const num = id => { const v = Number((root.querySelector(id) || {}).value); return v > 0 ? v : 0; };
  root.addEventListener('input', e => { if (e.target.id === 'skName') E.name = e.target.value; });
  root.addEventListener('change', e => { if (e.target.id === 'skOrtho') { sk.ortho = e.target.checked; save(); } });
  root.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'skFix') root.querySelector('[data-a=fix]').click();
    if (e.target.id === 'skScale') root.querySelector('[data-a=scaleSet]').click();
    if (e.target.id === 'skLen') root.querySelector('[data-a=edge]').click();
    if (e.target.id === 'skH') root.querySelector('[data-a=rect]').click();
  });
  root.addEventListener('click', async e => {
    const dir = e.target.closest('[data-dir]');
    if (dir) { E.dir = +dir.dataset.dir; info(); return; }
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'close') { save(); close(); return; }
    if (a === 'rect') {
      const w = num('#skW'), h = num('#skH'); if (!w || !h) { toast('幅と奥行（mm）を入れてください', { bad: true }); return; }
      snap(); const r = rectRoom(nameOr(), nextStart(sk.rooms), w / 1000, h / 1000); if (!r) return;
      sk.rooms.push(r); E.name = ''; save(); redraw(); toast(`「${r.name}」を足しました（${area(r.v).toFixed(2)}㎡）`); return;
    }
    if (a === 'draft') { snap(); sk.draft = { name: nameOr(), start: nextStart(sk.rooms), edges: [] }; save(); redraw(); return; }
    if (a === 'edge') {
      const v = num('#skLen'); if (!v) { toast('長さ（mm）を入れてください', { bad: true }); return; }
      sk.draft.edges.push({ d: E.dir, l: v / 1000 }); E.dir = (E.dir + 1) % 4;
      const P = draftPts(); save();
      if (P.length > 3 && dist(P[P.length - 1], P[0]) < 1e-6) { finishDraft(); return; }
      redraw(); return;
    }
    if (a === 'closeRoom') { finishDraft(); return; }
    if (a === 'photo') { $('#skPhoto').click(); return; }
    if (a === 'tapPhoto' || a === 'tap') { E.tap = { name: nameOr(), pts: [], photo: a === 'tapPhoto' }; E.sel = null; redraw(); return; }
    if (a === 'tapCancel') { E.tap = null; redraw(); return; }
    if (a === 'scale') { E.sc = []; E.meas = null; E.tap = null; E.sel = null; redraw(); return; }
    if (a === 'scaleCancel') { E.sc = null; redraw(); return; }
    if (a === 'meas') { E.meas = []; E.sc = null; E.tap = null; E.sel = null; redraw(); return; }
    if (a === 'measDone') { E.meas = null; redraw(); return; }
    if (a === 'scaleSet') {
      const v = num('#skScale'); if (!v || E.sc.length !== 2) { toast('長さ（mm）を入れてください', { bad: true }); return; }
      const d0 = dist(E.sc[0], E.sc[1]); if (!(d0 > 0)) { toast('2か所が近すぎます', { bad: true }); return; }
      const k = (v / 1000) / d0; snap();
      sk.s *= k; sk.sOk = true;
      /* 写真の上で取った部屋も、同じ倍率で大きさを直す（写真の左上が原点） */
      sk.rooms.filter(r => r.photo && !r.c.some(c => c.ok)).forEach(r => { r.v = r.v.map(q => [Math.round(q[0] * k * 10000) / 10000, Math.round(q[1] * k * 10000) / 10000]); r.c.forEach(c => { c.l = dist(r.v[c.a], r.v[c.b]); }); });
      E.sc = null; UV = null; vbFix = null; save(); E.tap = { name: nameOr(), pts: [], photo: true }; redraw(); toast('縮尺を合わせました。部屋の角を順番にタップしてください', { ms: 4000 }); return;
    }
    if (a === 'tapDone') {
      const T = E.tap.pts; if (T.length < 3) return;
      const exact = E.tap.photo && sk.sOk;
      snap(); const r = makeRoom(E.tap.name, T, exact ? T.map(() => 1) : null); if (!r) { toast('部屋の形になっていません', { bad: true }); return; }
      r.photo = E.tap.photo; r.rough = !exact; r.dirs = T.map((q, i) => { const n = T[(i + 1) % T.length]; return [n[0] - q[0], n[1] - q[1]]; });
      sk.rooms.push(r); E.name = ''; E.tap = null; if (exact) { E.sel = null; save(); redraw(); toast(`「${r.name}」を部屋にしました（${area(r.v).toFixed(2)}㎡）`); return; } E.sel = { r: sk.rooms.length - 1, c: 0 }; save(); redraw(); toast('形を取りました。辺の寸法を順番に入れてください'); return;
    }
    if (a === 'fix') {
      const v = num('#skFix'); if (!v) { toast('長さ（mm）を入れてください', { bad: true }); return; }
      snap(); const r = sk.rooms[E.sel.r]; const nx = fixEdge(sk, r, E.sel.c, v / 1000);
      E.sel = nx >= 0 ? { r: E.sel.r, c: nx } : null; save(); redraw();
      if (nx < 0) toast(r.bad ? '寸法が合っていません：' + r.bad : `「${r.name}」の寸法を直しました（${area(r.v).toFixed(2)}㎡）`, { bad: !!r.bad });
      return;
    }
    if (a === 'delDiag') { snap(); const r = sk.rooms[E.sel.r]; r.c.splice(E.sel.c, 1); E.sel = null; save(); redraw(); return; }
    if (a === 'square') {
      snap(); const list = E.sel ? [sk.rooms[E.sel.r]] : sk.rooms.filter(x => x.rough);
      const ok = list.map(square).every(Boolean); save(); redraw(); toast(ok ? 'ほぼ縦・横の辺をそろえました' : 'そろえると形がつぶれる部屋は、そろえませんでした'); return;
    }
    if (a === 'unsel') { E.sel = null; redraw(); return; }
    if (a === 'delRoom') { snap(); sk.rooms.splice(E.sel.r, 1); E.sel = null; save(); redraw(); return; }
    if (a === 'back') {
      if (E.tap) { E.tap.pts.pop(); redraw(); return; }
      if (sk.draft && sk.draft.edges.length) { sk.draft.edges.pop(); E.dir = (E.dir + 3) % 4; save(); redraw(); return; }
      const u = undo.pop(); if (u) { Object.assign(sk, u); E.sel = null; save(); redraw(); }
      return;
    }
    if (a === 'apply') {
      const left = sk.rooms.reduce((n, x) => n + x.v.filter((_, i) => !edgeC(x, i).ok).length, 0);
      if (left && !(await ask('「約」の寸法が残っています', `大まかに描いた長さが ${left} 本あります。このまま図面にしますか？`, { ok: 'このまま図面にする' }))) return;
      const prob = shapeProblems(sk.rooms);
      if (prob.length && !(await ask('形に問題があります', prob.slice(0, 5).join('\n') + '\n\n面積や周りの長さが正しく出ません。このまま図面にしますか？', { ok: 'このまま図面にする' }))) return;
      if (!(await onApply(clone(sk)))) return;
      save(); close();
    }
  });
  function finishDraft() {
    const d = sk.draft; let P = draftPts();
    if (P.length < 3) { toast('辺を2つ以上入れてください', { bad: true }); return; }
    const closed = dist(P[P.length - 1], P[0]) < 1e-6; if (closed) P = P.slice(0, -1);
    const mask = d.edges.map(() => 1); if (!closed) mask.push(0);
    const r = makeRoom(d.name, P, mask); if (!r) { toast('部屋の形になっていません', { bad: true }); return; }
    sk.rooms.push(r); E.name = ''; sk.draft = null; save(); redraw(); toast(`「${r.name}」を足しました（${area(r.v).toFixed(2)}㎡）`);
  }
  const loadBg = async f => {
    toast('下に敷く図を用意しています…');
    try {
      const im = await fileImage(f);
      sk.img = { src: im.src, w: im.w, h: im.h };
      /* 新しい図にしたら縮尺は合わせ直し（目安で幅 10m） */
      sk.s = 10 / im.w; sk.sOk = false;
      UV = null; vbFix = null; save(); E.tap = null; E.sel = null; E.meas = null; E.sc = []; redraw();
      toast((im.pages > 1 ? `${im.pages} ページのうち1ページ目を敷きました。` : '') + '先に縮尺を合わせます。長さの分かっている所の両端をタップしてください', { ms: 5000 });
    } catch (err) { toast('読み込めませんでした：' + err.message, { bad: true }); }
  };
  $('#skPhoto').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) loadBg(f); });
  if (file) setTimeout(() => loadBg(file), 0);
  redraw();
  return { close };
}
