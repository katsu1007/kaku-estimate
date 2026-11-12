/* 図面の表示：線・区画を SVG で描く。指で動かす・2本指で拡大・ホイールで拡大。区画をタップすると onTap(区画番号) */
const COLORS = ['#ff8a3d', '#3ccf8e', '#5ab7ff', '#f3c04f', '#c084fc', '#ff6b9a', '#8bd450', '#9aa7b8'];
export const roomColor = n => COLORS[(n || 0) % COLORS.length];

export function planView(box, plan, opt = {}) {
  const xs = [], ys = [];
  plan.segs.forEach(s => { xs.push(s[0], s[2]); ys.push(s[1], s[3]); });
  plan.faces.forEach(f => f.poly.forEach(p => { xs.push(p[0]); ys.push(p[1]); }));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = Math.max(1, maxX - minX), H = Math.max(1, maxY - minY), pad = Math.max(W, H) * 0.04;
  const base = [minX - pad, -maxY - pad, W + pad * 2, H + pad * 2];   // y は上向きなので反転して描く
  let vb = base.slice();
  const lw = Math.max(W, H) / 900;
  const pathOf = S => S.map(s => `M${s[0]} ${-s[1]}L${s[2]} ${-s[3]}`).join('');
  const fs = Math.max(W, H) / 60;
  box.innerHTML = `<div class="pv-wrap"><svg class="pv" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <g class="faces"></g>
      <path d="${pathOf(plan.dsegs || [])}" fill="none" stroke="var(--faint)" stroke-width="${lw}" stroke-dasharray="${lw * 4} ${lw * 3}"/>
      <path d="${pathOf(plan.segs)}" fill="none" stroke="var(--text)" stroke-width="${lw}" stroke-linecap="round" opacity=".85"/>
      <g class="fixes">${(opt.fixtures || []).filter(x => x.t !== 'other').map(x => `<rect x="${x.b[0]}" y="${-x.b[3]}" width="${x.b[2] - x.b[0]}" height="${x.b[3] - x.b[1]}" fill="none" stroke="${x.t === 'unknown' ? 'var(--warn)' : 'var(--info)'}" stroke-width="${lw * 1.6}" pointer-events="none"/>`).join('')}</g>
      <g class="labels" font-size="${fs}" text-anchor="middle"></g></svg>
    <div class="pv-tools"><button class="iconbtn" data-z="in" aria-label="拡大">＋</button><button class="iconbtn" data-z="out" aria-label="縮小">－</button><button class="iconbtn" data-z="fit" aria-label="全体を表示">⤢</button></div></div>`;
  const svg = box.querySelector('svg');
  const set = () => svg.setAttribute('viewBox', vb.join(' '));
  set();
  /* 図面の縦横の比に合わせて高さを決める（横長の図面で下が空かないように） */
  const fitH = () => { const w = box.clientWidth || 600; svg.style.height = Math.round(Math.max(240, Math.min(window.innerHeight * 0.62, 560, w * base[3] / base[2]))) + 'px'; };
  fitH();
  window.addEventListener('resize', fitH);

  function paint() {
    const sel = opt.selected ? opt.selected() : new Set();
    const owner = opt.owner ? opt.owner() : new Map();
    svg.querySelector('.faces').innerHTML = plan.faces.map(f => {
      const o = owner.get(f.i), s = sel.has(f.i);
      const fill = s ? 'var(--accent)' : o != null ? roomColor(o) : 'transparent';
      const op = s ? 0.45 : o != null ? 0.22 : 0;
      return `<polygon data-i="${f.i}" points="${f.poly.map(p => p[0] + ',' + -p[1]).join(' ')}" fill="${fill}" fill-opacity="${op}" stroke="${s ? 'var(--accent)' : 'none'}" stroke-width="${lw * 2.5}" style="cursor:pointer"/>`;
    }).join('');
    svg.querySelector('.labels').innerHTML = plan.faces.map(f => {
      const o = owner.get(f.i), s = sel.has(f.i);
      return `<text x="${f.cx}" y="${-f.cy}" fill="${s ? 'var(--accent)' : o != null ? roomColor(o) : 'var(--muted)'}" font-weight="700" pointer-events="none">${f.no}<tspan x="${f.cx}" dy="1.15em" font-weight="400" font-size="${fs * 0.8}">${(Math.round(f.area * 100) / 100)}㎡</tspan></text>`;
    }).join('');
  }
  paint();

  /* ---- 指・マウスの操作 ---- */
  const pts = new Map();
  let moved = false, startDist = 0, startVb = null, startMid = null;
  const toUser = (cx, cy) => { const r = svg.getBoundingClientRect(); const s = Math.max(vb[2] / r.width, vb[3] / r.height); const ox = (r.width * s - vb[2]) / 2, oy = (r.height * s - vb[3]) / 2; return [vb[0] - ox + (cx - r.left) * s, vb[1] - oy + (cy - r.top) * s, s]; };
  const zoomAt = (cx, cy, k) => {
    const [ux, uy] = toUser(cx, cy);
    const nw = Math.min(base[2] * 1.5, Math.max(base[2] / 60, vb[2] / k)), f = nw / vb[2];
    vb = [ux - (ux - vb[0]) * f, uy - (uy - vb[1]) * f, vb[2] * f, vb[3] * f]; set();
  };
  svg.addEventListener('pointerdown', e => { svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = false;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; startDist = Math.hypot(a[0] - b[0], a[1] - b[1]); startVb = vb.slice(); startMid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; } });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) {
      const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
      if (Math.abs(dx) + Math.abs(dy) > 0) { if (Math.hypot(dx, dy) > 1) moved = true; const s = toUser(0, 0)[2]; vb[0] -= dx * s; vb[1] -= dy * s; set(); }
    } else if (pts.size === 2) {
      moved = true;
      const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      vb = startVb.slice(); set(); zoomAt(startMid[0], startMid[1], d / startDist);
    }
  });
  const up = e => {
    const was = pts.size; pts.delete(e.pointerId);
    if (was === 1 && !moved && e.type === 'pointerup') {
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const pg = t && t.closest && t.closest('polygon[data-i]');
      if (pg && opt.onTap) opt.onTap(+pg.dataset.i);
    }
  };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
  box.querySelector('.pv-tools').addEventListener('click', e => {
    const z = e.target.closest('[data-z]'); if (!z) return;
    const r = svg.getBoundingClientRect();
    if (z.dataset.z === 'fit') { vb = base.slice(); set(); } else zoomAt(r.left + r.width / 2, r.top + r.height / 2, z.dataset.z === 'in' ? 1.4 : 1 / 1.4);
  });
  return { paint };
}
