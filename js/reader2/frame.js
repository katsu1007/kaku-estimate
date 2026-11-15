/* 新しい読み取り・段階1：図枠・表題欄・表を見つけて、その中の区画に印を付ける（画面に触らない。tests/reader2.test.mjs でテスト）。
 *
 * 今の読み取り（前のKAKUと共通）は変えない。今の読み取りが出した区画を受け取り、「部屋ではない根拠」がそろった区画にだけ印を付ける。
 *   印 s：'out'（部屋ではない：図枠・表）／'hold'（決めきれない。人が見て決める）。印の無い区画は今まで通り。
 * 決まり（かつの方針）：分からない物を勝手に決めない。根拠は必ず文章で残す。
 *   ・除外（out）は根拠が2つ以上そろった時だけ。1つだけなら保留（hold）
 *   ・区画に直に器具・ドア・部屋らしい名前がある時は、除外にしない（多くても保留）
 * 入力（単位 m）：segs [[x1,y1,x2,y2]…]（図面の線）、faces [{i,poly,area}]、texts [{t,x,y}]、fixtures [{b:[x0,y0,x1,y1]}]、doors [{c:[x,y]}]
 * 出力：{ ver, regions:[{type:'frame'|'table', box:[x0,y0,x1,y1], conf, why:[…]}], marks:{ [区画の i]: {s, type, why} }, stats } */
export const VER = 1;
const TITLE_RE = /工事名|工事件名|図面名|図面番号|図\s*番|縮\s*尺|SCALE|DATE|日\s*付|承\s*認|設\s*計|製\s*図|検\s*図|作\s*成|DWG|DRAWN|CHECKED|TITLE|図面名称|工事名称/i;
/* 部屋らしい名前（除外を止めるための安全側の判定。広めに取る） */
export const ROOMISH_RE = /室|便所|トイレ|WC|ＷＣ|廊下|ホール|ロビー|玄関|階段|倉庫|物入|厨房|食堂|事務|受付|更衣|ロッカー|浴|洗面|脱衣|機械|スペース|ブース|課$|店舗|売場|居間|台所|和室|洋室|LDK|ＬＤＫ|キッチン|リビング/;

const pip = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const boxOf = P => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; P.forEach(q => { if (q[0] < a) a = q[0]; if (q[0] > c) c = q[0]; if (q[1] < b) b = q[1]; if (q[1] > d) d = q[1]; }); return [a, b, c, d]; };
const inBox = (x, y, B, m = 0) => x >= B[0] - m && x <= B[2] + m && y >= B[1] - m && y <= B[3] + m;
const r3 = v => Math.round(v * 1000) / 1000;

/* 同じ高さ（同じ横位置）で重なる・つながる線をまとめて、長い線にする。axis 0＝横の線、1＝縦の線 */
function longSpans(segs, axis, minLen, tol = 0.01) {
  const by = new Map();
  segs.forEach(s => {
    const a = axis ? [s[1], s[0], s[3], s[2]] : s;            // 縦の線は x と y を入れ替えて横として扱う
    if (Math.abs(a[3] - a[1]) > tol || Math.abs(a[2] - a[0]) < 0.05) return;
    const k = Math.round(((a[1] + a[3]) / 2) / tol);
    let L = by.get(k); if (!L) by.set(k, L = []);
    L.push([Math.min(a[0], a[2]), Math.max(a[0], a[2])]);
  });
  const out = [];
  [...by.keys()].sort((p, q) => p - q).forEach(k => {
    const L = [...(by.get(k) || []), ...(by.get(k + 1) || [])].sort((p, q) => p[0] - q[0]);   // となりの段も合わせて見る（丸めの境目）
    let cur = null;
    L.forEach(v => { if (cur && v[0] <= cur[1] + 0.02) cur[1] = Math.max(cur[1], v[1]); else { if (cur && cur[1] - cur[0] >= minLen) out.push({ c: k * tol, a: cur[0], b: cur[1] }); cur = v.slice(); } });
    if (cur && cur[1] - cur[0] >= minLen) out.push({ c: k * tol, a: cur[0], b: cur[1] });
  });
  /* となりの段を合わせたので、同じ線が2回出る。近い物は1つにする */
  const uniq = [];
  out.sort((p, q) => p.c - q.c || p.a - q.a).forEach(s => { const o = uniq.find(u => Math.abs(u.c - s.c) <= tol * 1.5 && Math.abs(u.a - s.a) < 0.05 && Math.abs(u.b - s.b) < 0.05); if (!o) uniq.push(s); });
  return uniq;
}

/* 長い横線2本と縦線2本でできた長方形（図枠の候補） */
function rectangles(segs, minLen) {
  const H = longSpans(segs, 0, minLen), V = longSpans(segs, 1, minLen), tol = 0.05, out = [];
  for (let i = 0; i < H.length; i++) for (let j = i + 1; j < H.length; j++) {
    const h1 = H[i], h2 = H[j];
    if (h2.c - h1.c < minLen || Math.abs(h1.a - h2.a) > tol || Math.abs(h1.b - h2.b) > tol) continue;
    const left = V.find(v => Math.abs(v.c - h1.a) <= tol && v.a <= h1.c + tol && v.b >= h2.c - tol);
    const right = V.find(v => Math.abs(v.c - h1.b) <= tol && v.a <= h1.c + tol && v.b >= h2.c - tol);
    if (left && right) out.push([r3(h1.a), r3(h1.c), r3(h1.b), r3(h2.c)]);
  }
  return out;
}

export function analyze({ segs = [], faces = [], texts = [], fixtures = [], doors = [] } = {}) {
  const regions = [], marks = {};
  const F = faces.filter(f => f && f.poly && f.poly.length >= 3).map(f => { const box = boxOf(f.poly); return { f, box, bw: box[2] - box[0], bh: box[3] - box[1], cx: f.poly.reduce((s, q) => s + q[0], 0) / f.poly.length, cy: f.poly.reduce((s, q) => s + q[1], 0) / f.poly.length }; });
  /* 今の読み取りの区画は、広さ（area）が「中に含めた機器や小さい囲みも足した広さ」、形（poly）が「一番大きいつながりの外まわり」。
   * なので広さが形より大きいことがある。四角かどうかは形で見て、広さと形がほぼ同じ区画だけを「単純な四角」とする */
  const shoelace = P => Math.abs(P.reduce((s, q, k) => { const n = P[(k + 1) % P.length]; return s + q[0] * n[1] - n[0] * q[1]; }, 0)) / 2;
  F.forEach(a => { a.pa = shoelace(a.f.poly); a.area = Number(a.f.area) > 0 ? Number(a.f.area) : a.pa; a.rect = a.bw > 0 && a.bh > 0 && Math.abs(a.area - a.pa) <= Math.max(0.03, a.pa * 0.06) ? a.pa / (a.bw * a.bh) : 0; });
  if (!F.length) return { ver: VER, regions, marks, stats: { faces: 0, frames: 0, tables: 0, out: 0, hold: 0 } };
  /* 区画の中の区画（子）。区画に「直に」ある文字・器具・ドア＝その区画の中で、どの子にも入っていない物 */
  F.forEach(a => { a.kids = F.filter(b => b !== a && b.area < a.area * 0.9 && inBox(b.cx, b.cy, a.box) && pip(b.cx, b.cy, a.f.poly)); });
  const direct = (a, x, y) => inBox(x, y, a.box) && pip(x, y, a.f.poly) && !a.kids.some(k => inBox(x, y, k.box) && pip(x, y, k.f.poly));
  const T = texts.filter(t => t && String(t.t || '').trim()).map(t => ({ t: String(t.t).normalize('NFKC').trim(), x: +t.x, y: +t.y }));
  const FX = fixtures.filter(x => x && x.b).map(x => [(x.b[0] + x.b[2]) / 2, (x.b[1] + x.b[3]) / 2]);
  const DR = doors.filter(d => d && d.c).map(d => d.c);
  F.forEach(a => {
    a.txt = T.filter(t => direct(a, t.x, t.y));
    a.roomish = a.txt.filter(t => t.t.length <= 16 && ROOMISH_RE.test(t.t));
    a.fx = FX.filter(q => direct(a, q[0], q[1])).length;
    a.dr = DR.filter(q => inBox(q[0], q[1], a.box, 0.3) && !a.kids.some(k => inBox(q[0], q[1], k.box, 0.05))).length;
  });

  /* ---- 図枠：長い線でできた長方形に、根拠を数える ---- */
  const all = boxOf(F.flatMap(a => [[a.box[0], a.box[1]], [a.box[2], a.box[3]]]));
  const minLen = Math.max(3, Math.min(all[2] - all[0], all[3] - all[1]) * 0.25);
  const R = rectangles(segs, minLen).map(box => ({ box, w: box[2] - box[0], h: box[3] - box[1] }));
  R.forEach(r => {
    r.why = []; r.score = 0;
    const tin = T.filter(t => inBox(t.x, t.y, r.box) && TITLE_RE.test(t.t));
    const kinds = new Set(tin.map(t => (t.t.match(TITLE_RE) || [''])[0].replace(/\s/g, '').toUpperCase()));
    if (kinds.size >= 2) { r.score += 2; r.title = true; r.why.push(`表題欄の文字が中にある（${[...kinds].slice(0, 4).join('・')}）`); }
    const ratio = Math.max(r.w, r.h) / Math.min(r.w, r.h);
    if (ratio >= 1.36 && ratio <= 1.5) { r.score += 1; r.why.push(`縦横の比が用紙に近い（1:${ratio.toFixed(2)}）`); }
    const twin = R.some(o => o !== r && Math.abs(o.w - r.w) <= r.w * 0.01 && Math.abs(o.h - r.h) <= r.h * 0.01 && (o.box[0] > r.box[2] - 0.01 || o.box[2] < r.box[0] + 0.01 || o.box[1] > r.box[3] - 0.01 || o.box[3] < r.box[1] + 0.01));
    if (twin) { r.score += 1; r.twin = true; r.why.push('同じ大きさの枠が並んでいる'); }
    const inside = F.filter(a => inBox(a.cx, a.cy, r.box)).length;
    if (inside >= 3) { r.score += 1; r.why.push(`中に区画が ${inside} 個ある`); }
    r.inside = inside;
  });
  /* 根拠が3点以上で、表題欄の文字か並んだ枠のどちらかがある物だけ「図枠」。中に入れ子の枠（二重の枠）は外側だけ残す */
  let frames = R.filter(r => r.score >= 3 && (r.title || r.twin));
  /* 図枠の中の長方形（表の罫線・図の区切り）は図枠ではない。大きい順に見て、もう決まった図枠の中にある物は外す */
  const within = (r, o) => o.box[0] <= r.box[0] + 0.02 && o.box[1] <= r.box[1] + 0.02 && o.box[2] >= r.box[2] - 0.02 && o.box[3] >= r.box[3] - 0.02;
  const acc = [];
  frames.sort((p, q) => q.w * q.h - p.w * p.h).forEach(r => { if (!acc.some(o => within(r, o))) acc.push(r); });
  frames = acc;
  frames.forEach(r => regions.push({ type: 'frame', box: r.box, conf: r.score, why: r.why }));

  /* ---- 図枠の内側そのものの区画（建物をまるごと含む大きい区画） ---- */
  const mark = (a, s, type, why) => { const cur = marks[a.f.i]; if (cur && cur.s === 'out') return; marks[a.f.i] = { s, type, why }; };
  const stop = a => a.fx || a.dr || a.roomish.length;   // 除外を止める物が直にあるか
  const stopWhy = a => [a.roomish.length ? `部屋らしい名前（${[...new Set(a.roomish.map(t => t.t))].slice(0, 3).join('・')}）` : '', a.fx ? `器具 ${a.fx} 個` : '', a.dr ? `ドア ${a.dr} か所` : ''].filter(Boolean).join('・');
  frames.forEach(r => {
    F.forEach(a => {
      /* 図枠の内側そのもの：枠の中にあって、広さが枠の半分以上（広さは中の建物なども含めた外まわりの広さ） */
      const fit = inBox(a.cx, a.cy, r.box) && a.area >= r.w * r.h * 0.5 && a.area <= r.w * r.h * 1.03;
      if (!fit) return;
      if (stop(a)) mark(a, 'hold', 'frame', `図枠の内側の大部分を占める区画です（${r.why[0] || ''}）。ただし、囲まれていない所に ${stopWhy(a)} が直にあるので、除外にはしていません`);
      else mark(a, 'out', 'frame', `図枠の内側そのものです（${r.why.join('／')}）`);
    });
  });

  /* ---- 表（罫線）：図枠の中で、同じ幅の長方形が3段以上重なっている所（横の罫線が同じ幅で何本も引いてある） ---- */
  const tries = [];   // 表と見なかった罫線の並びと、その理由（確かめる用）
  const clean = box => !FX.some(q => inBox(q[0], q[1], box)) && !DR.some(q => inBox(q[0], q[1], box, 0.1)) && !T.some(t => inBox(t.x, t.y, box) && t.t.length <= 16 && ROOMISH_RE.test(t.t));
  frames.forEach(fr => {
    const inner = R.filter(r => r !== fr && within(r, fr) && r.w * r.h < fr.w * fr.h * 0.5);
    [[0, 2, 1, 3], [1, 3, 0, 2]].forEach(([a0, a1, b0, b1]) => {          // 横に同じ幅で縦に重なる／縦に同じ高さで横に並ぶ
      const used = new Set();
      inner.forEach(r => {
        if (used.has(r)) return;
        const g = inner.filter(o => Math.abs(o.box[a0] - r.box[a0]) <= 0.05 && Math.abs(o.box[a1] - r.box[a1]) <= 0.05);
        if (g.length < 3) return;
        g.forEach(o => used.add(o));
        const box = [Math.min(...g.map(o => o.box[0])), Math.min(...g.map(o => o.box[1])), Math.max(...g.map(o => o.box[2])), Math.max(...g.map(o => o.box[3]))];
        const lines = new Set(g.flatMap(o => [Math.round(o.box[b0] * 20), Math.round(o.box[b1] * 20)])).size;
        /* 罫線が6本以上そろっていれば、それだけで表の強い根拠（部屋が同じ幅で何段も重なることは無い）。この時は、中の文字が「洗面器・ブース」のような
         * 部屋らしい言葉でも表の中の項目と見る。ただし器具・ドアがある所は表にしない。区画ごとの安全の決まり（部屋らしい名前が直にある区画は保留）は下でそのまま効く */
        const many = lines >= 6, hard = !FX.some(q => inBox(q[0], q[1], box)) && !DR.some(q => inBox(q[0], q[1], box, 0.1));
        const why = [`同じ幅の罫線が ${lines} 本そろって引いてある`]; let score = many ? 2 : 1;
        if (many && hard) { score += 1; why.push('中に器具・ドアが無い'); }
        else if (clean(box)) { score += 1; why.push('中に器具・ドア・部屋らしい名前が無い'); }
        else { tries.push({ box: box.map(r3), lines, stop: [FX.filter(q => inBox(q[0], q[1], box)).length + ' 器具', DR.filter(q => inBox(q[0], q[1], box, 0.1)).length + ' ドア', [...new Set(T.filter(t => inBox(t.x, t.y, box) && t.t.length <= 16 && ROOMISH_RE.test(t.t)).map(t => t.t))].slice(0, 4).join('・')] }); return; }   // 部屋の並び（器具・ドア・部屋名がある）は表と見ない
        const edge = Math.abs(box[0] - fr.box[0]) <= fr.w * 0.03 || Math.abs(box[2] - fr.box[2]) <= fr.w * 0.03 || Math.abs(box[1] - fr.box[1]) <= fr.h * 0.03 || Math.abs(box[3] - fr.box[3]) <= fr.h * 0.03;
        if (edge) { score += 1; why.push('図枠の辺に付いている'); }
        if (T.filter(t => inBox(t.x, t.y, box) && TITLE_RE.test(t.t)).length >= 2) { score += 1; why.push('表題欄の文字がある'); }
        if (regions.some(q => q.type.startsWith('table') && q.box[0] <= box[0] + 0.05 && q.box[1] <= box[1] + 0.05 && q.box[2] >= box[2] - 0.05 && q.box[3] >= box[3] - 0.05)) return;
        const ok = score >= 3;
        regions.push({ type: ok ? 'table' : 'table?', box: box.map(r3), conf: score, why });
        F.forEach(a => {
          if (!inBox(a.cx, a.cy, box) || a.box[0] < box[0] - 0.1 || a.box[2] > box[2] + 0.1 || a.box[1] < box[1] - 0.1 || a.box[3] > box[3] + 0.1) return;
          if (stop(a)) { if (ok) mark(a, 'hold', 'table', `表（罫線）の中にありますが、${stopWhy(a)} が直にあるので、除外にはしていません（${why[0]}）`); return; }
          if (ok) mark(a, 'out', 'table', `表（罫線）の中の区画です（${why.join('／')}）`);
          else mark(a, 'hold', 'table', `表（罫線）の中かもしれません（${why.join('／')}）。根拠が足りないので、除外にはしていません`);
        });
      });
    });
  });

  /* ---- 表：四角い区画がすき間なく並んだかたまり ---- */
  const rects = F.filter(a => a.rect >= 0.97 && !marks[a.f.i]);
  const adj = (a, b) => {
    const e = 0.03, ov = (p0, p1, q0, q1) => Math.min(p1, q1) - Math.max(p0, q0);
    const sideX = Math.abs(a.box[2] - b.box[0]) <= e || Math.abs(b.box[2] - a.box[0]) <= e, sideY = Math.abs(a.box[3] - b.box[1]) <= e || Math.abs(b.box[3] - a.box[1]) <= e;
    if (sideX && ov(a.box[1], a.box[3], b.box[1], b.box[3]) >= Math.min(a.bh, b.bh) * 0.8) return true;
    if (sideY && ov(a.box[0], a.box[2], b.box[0], b.box[2]) >= Math.min(a.bw, b.bw) * 0.8) return true;
    return false;
  };
  const seen = new Set();
  rects.forEach(s => {
    if (seen.has(s)) return;
    const g = [s]; seen.add(s);
    for (let k = 0; k < g.length; k++) rects.forEach(b => { if (!seen.has(b) && adj(g[k], b)) { seen.add(b); g.push(b); } });
    if (g.length < 4) return;
    const box = boxOf(g.flatMap(a => [[a.box[0], a.box[1]], [a.box[2], a.box[3]]])), gw = box[2] - box[0], gh = box[3] - box[1];
    const fill = g.reduce((t, a) => t + a.area, 0) / (gw * gh);
    if (fill < 0.85) return;                                           // すき間なく並んでいない（格子ではない）
    const why = [`四角い区画が ${g.length} 個、すき間なく並んでいる`]; let score = 1;
    const dirty = g.filter(stop);
    if (!dirty.length) { score += 1; why.push('中に器具・ドア・部屋らしい名前が無い'); }
    const fr = frames.find(r => inBox((box[0] + box[2]) / 2, (box[1] + box[3]) / 2, r.box));
    const edge = fr && (Math.abs(box[0] - fr.box[0]) <= fr.w * 0.03 || Math.abs(box[2] - fr.box[2]) <= fr.w * 0.03 || Math.abs(box[1] - fr.box[1]) <= fr.h * 0.03 || Math.abs(box[3] - fr.box[3]) <= fr.h * 0.03);
    if (edge) { score += 1; why.push('図枠の辺に付いている'); }
    const tk = T.filter(t => inBox(t.x, t.y, box) && TITLE_RE.test(t.t)).length;
    if (tk >= 2) { score += 1; why.push('表題欄の文字がある'); }
    if (dirty.length) return;                                          // 器具・ドア・部屋名がある並び（トイレのブースや部屋の並び）は表と見ない
    if (score >= 3) { regions.push({ type: 'table', box: box.map(r3), conf: score, why }); g.forEach(a => mark(a, 'out', 'table', `表のマスです（${why.join('／')}）`)); }
    else if (g.length >= 6) { regions.push({ type: 'table?', box: box.map(r3), conf: score, why }); g.forEach(a => mark(a, 'hold', 'table', `表のマスかもしれません（${why.join('／')}）。図枠との位置などの根拠が足りないので、除外にはしていません`)); }
  });

  const vals = Object.values(marks);
  return { ver: VER, regions, marks, stats: { faces: F.length, frames: frames.length, tables: regions.filter(r => r.type === 'table').length, out: vals.filter(m => m.s === 'out').length, hold: vals.filter(m => m.s === 'hold').length, candidates: R.length, notTable: tries.slice(0, 8) } };
}
