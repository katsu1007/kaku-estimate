/* 器具を図面に置く（前のKAKUの KP_*）：1個ずつ・部屋に並べる（列×行／間隔）・壁に沿って */
export const GROUPS = [['照明', ['e-dl100', 'e-dl100s', 'e-dl125', 'e-dl150', 'e-clight', 'e-ceil', 'e-light', 'e-bl', 'e-base', 'e-foot']],
  ['スイッチ・コンセント', ['e-sw1', 'e-swh', 'e-sw3', 'e-swpir', 'e-con', 'e-con2', 'e-cone', 'e-con200']],
  ['電源・電気機器', ['e-hwh', 'e-dryer', 'e-fan', 'e-fanc', 'e-panel', 'e-breaker', 'e-jb', 'e-ob']],
  ['弱電・防災', ['e-lanjack', 'e-tvjack', 'e-intercom', 'e-call', 'e-smoke', 'e-emg', 'e-exit']],
  ['衛生器具', ['fx-toilet', 'fx-washlet', 'fx-sen', 'q-ur', 'q-hw', 'q-sk', 'q-faucet', 'q-stop', 'q-drain']],
  ['空調・換気', ['fx-ac', 'fx-vent']],
  ['建築付属', ['fx-grab', 'fx-paper', 'fx-tk450', 'fx-tk600', 'fx-yuka']]];
/* 材料ごとの取付手間（前のKAKUと同じ対応） */
export const LABOR = {"e-bl":"w-eLight","e-base":"w-eLight","e-emg":"w-eLight","e-exit":"w-eLight","e-foot":"w-eDev","e-swpir":"w-eDev","e-con200":"w-eDev","e-call":"w-eDev","e-hwh":"w-eEquip","e-dryer":"w-eEquip","e-fanc":"w-eFan","q-ur":"w-pUr","q-wb":"w-pWb","q-hw":"w-pHw","q-sk":"w-pSk","fx-grab":"w-fxGrab","fx-paper":"w-fxAcc","fx-boothM":"w-booth","fx-boothF":"w-booth","fx-boothA":"w-booth","fx-boothS":"w-booth","fx-boothK":"w-booth","e-v16-2":"w-eWire","e-v16-3":"w-eWire","e-v20-2":"w-eWire","e-v20-3":"w-eWire","e-v26-2":"w-eWire","e-em16-2":"w-eWire","e-em20-2":"w-eWire","e-cv55-2":"w-eWire","e-cv55-3":"w-eWire","e-cv8-3":"w-eWire","e-cv14-3":"w-eWire","e-lan":"w-eWire","e-coax":"w-eWire","e-pf16":"w-eConduit","e-pf22":"w-eConduit","e-cd16":"w-eConduit","e-cd22":"w-eConduit","e-sw1":"w-eDev","e-swh":"w-eDev","e-sw3":"w-eDev","e-con":"w-eDev","e-con2":"w-eDev","e-cone":"w-eDev","e-ceil":"w-eDev","e-lanjack":"w-eDev","e-tvjack":"w-eDev","e-dl100":"w-eDL","e-dl100s":"w-eDL","e-dl125":"w-eDL","e-dl150":"w-eDL","e-clight":"e-light","e-fan":"w-eFan","e-jb":"w-eBox","e-ob":"w-eBox","e-panel":"w-ePanel","e-breaker":"w-eBreaker","e-intercom":"w-eIntercom","p-vp13":"w-pSupply","p-vp16":"w-pSupply","p-vp20":"w-pSupply","p-vp25":"w-pSupply","p-vp30":"w-pSupply","p-vp40":"w-pSupply","p-vp50":"w-pSupply","p-vp65":"w-pSupply","p-vp75":"w-pSupply","p-vp100":"w-pSupply","p-hivp13":"w-pSupply","p-hivp16":"w-pSupply","p-hivp20":"w-pSupply","p-hivp25":"w-pSupply","p-hivp30":"w-pSupply","p-hivp40":"w-pSupply","p-hivp50":"w-pSupply","p-htvp13":"w-pSupply","p-htvp16":"w-pSupply","p-htvp20":"w-pSupply","p-htvp25":"w-pSupply","p-htvp30":"w-pSupply","p-htvp40":"w-pSupply","p-px10":"w-pSupply","p-pb10":"w-pSupply","p-px13":"w-pSupply","p-pb13":"w-pSupply","p-px16":"w-pSupply","p-pb16":"w-pSupply","p-px20":"w-pSupply","p-pb20":"w-pSupply","p-vu40":"w-pDrain","p-vu50":"w-pDrain","p-vu65":"w-pDrain","p-vu75":"w-pDrain","p-vu100":"w-pDrain","p-vu125":"w-pDrain","p-vu150":"w-pDrain","p-hoon":"w-pHoon","q-stop":"w-pStop","q-masu":"w-pMasu","fx-door":"lb-door","fx-slide":"lb-door","fx-fold":"lb-door","fx-knob":"w-fxKnob","fx-stop":"w-fxKnob","fx-uchimado":"lb-window","fx-glass":"w-fxGlass","fx-curtain":"w-fxCurtain","fx-ub":"lb-ub","fx-kitchen":"q-kit","fx-toilet":"q-wc","fx-washlet":"w-fxWashlet","fx-sen":"q-sink","fx-kyuto":"q-heater","fx-ac":"lb-ac","fx-tk450":"w-fxTenken","fx-tk600":"w-fxTenken","fx-yuka":"w-fxYuka","fx-vent":"w-fxVent","fx-tatamiO":"w-fxTatami","fx-tatamiN":"w-fxTatami","in-frp":"lb-wp","in-bsheet":"lb-wp","t-hsoft":"w-haba","t-hmdf":"w-haba","t-hsolid":"w-haba","t-mmdf":"w-mawari","t-msolid":"w-mawari","pt-ep":"w-fPaint","pt-op":"w-fPaint","pt-sop":"w-fPaint","pt-cl":"w-fPaint","pt-rust":"w-fPaint","in-gw100":"lb-insul","in-gwh105":"lb-insul","in-gw50":"lb-insul","in-sty20":"lb-insul","in-sty30":"lb-insul","in-sty50":"lb-insul","in-sty100":"lb-insul","in-sha":"lb-insul","in-kyu":"lb-insul","k-ft":"w-mikiri","k-fstep":"w-mikiri","k-fhe":"w-mikiri","k-fcoa":"w-mikiri","k-fcos":"w-mikiri","k-aco":"w-mikiri","k-ajc":"w-mikiri","k-ajh":"w-mikiri","k-aang":"w-mikiri","k-cdeg":"w-mikiri","k-cdegt":"w-mikiri","k-cin":"w-mikiri","k-wall":"w-mikiri","k-chair":"w-mikiri","k-ceil":"w-mikiri","k-kp":"w-mikiri","k-frame":"w-mikiri","k-stair":"w-mikiri"};
export const COLORS = ['#e65c32', '#3d6fb6', '#2f7d6d', '#b5852b', '#8a4fb0', '#c2416b', '#4f8a2f', '#5b6470'];

/* 品目を分類ごとに。分類に無い電気器具は「その他の電気」に */
export function groupsOf(items) {
  const M = new Map(items.map(i => [i.id, i])), used = new Set();
  const out = GROUPS.map(([g, ids]) => [g, ids.filter(id => M.has(id)).map(id => { used.add(id); return M.get(id); })]).filter(g => g[1].length);
  const rest = items.filter(i => i.cat === 'elec' && !used.has(i.id));
  if (rest.length) out.push(['その他の電気', rest]);
  return out;
}

export function axis(lo, hi, how, n, gap, edge) {
  const W = hi - lo; if (!(W > 0)) return [];
  if (how === 'grid') { n = Math.max(1, Math.min(60, Math.round(+n || 1))); return Array.from({ length: n }, (_, i) => lo + (i + 0.5) * W / n); }
  const g = (+gap || 0) / 1000; if (!(g > 0.05)) return [];
  const e = edge === '' || edge == null ? g / 2 : (+edge || 0) / 1000, use = W - 2 * e;
  const k = use < 0 ? 1 : Math.min(60, Math.floor(use / g + 1e-6) + 1), span = (k - 1) * g, st = lo + (W - span) / 2;
  return Array.from({ length: k }, (_, i) => st + i * g);
}
const pip = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if (((P[i][1] > y) !== (P[j][1] > y)) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
const r3 = v => Math.round(v * 1000) / 1000;
/* 選んだ区画をまとめた範囲に均一に並べる（区画の外に出る点は捨てる） */
export function areaPts(polys, o) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  polys.forEach(P => P.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }));
  if (!isFinite(x0)) return [];
  const xs = axis(x0, x1, o.how, o.cols, o.gap, o.edge), ys = axis(y0, y1, o.how, o.rows, o.gap, o.edge), out = [];
  ys.forEach(y => xs.forEach(x => { if (polys.some(P => pip(x, y, P))) out.push([r3(x), r3(y)]); }));
  return out;
}
/* 選んだ線に沿って並べる（個数で／間隔で） */
export function linePts(segs, o) {
  const out = [];
  segs.forEach(s => {
    const L = Math.hypot(s[2] - s[0], s[3] - s[1]); if (!(L > 0)) return;
    const n = Math.max(1, Math.min(60, Math.round(+o.n || 1)));
    const ts = o.how === 'grid' ? Array.from({ length: n }, (_, i) => (i + 0.5) / n) : axis(0, L, 'gap', 0, o.gap, o.edge).map(v => v / L);
    ts.forEach(t => out.push([r3(s[0] + (s[2] - s[0]) * t), r3(s[1] + (s[3] - s[1]) * t)]));
  });
  return out;
}
/* 置いた物の位置（1個ずつ＝p、並べた物＝pts） */
export const placePts = x => x.where === 'pt' ? (x.p ? [x.p] : []) : (x.pts || []);
export function placeCounts(places) {
  const c = {}; (places || []).forEach(x => { const n = placePts(x).length; if (x.item && n) c[x.item] = (c[x.item] || 0) + n; }); return c;
}
/* 記号の文字（短く） */
export function symText(id, name) {
  const k = { 'e-hwh': '湯', 'e-dryer': 'HD', 'e-fan': '換', 'e-fanc': '換', 'e-panel': '盤', 'e-breaker': 'B', 'e-jb': 'J', 'e-ob': 'OB', 'e-lanjack': 'LAN', 'e-tvjack': 'TV', 'e-intercom': 'IH', 'e-call': '呼', 'e-smoke': '感', 'e-emg': '非', 'e-exit': '誘', 'e-con200': '200', 'e-swpir': '人', 'e-sw3': 'S3', 'e-swh': 'SH', 'fx-ac': 'AC', 'fx-vent': '換', 'fx-grab': '手', 'fx-paper': '紙', 'fx-toilet': '便', 'fx-washlet': 'W', 'q-ur': '小', 'q-hw': '手洗', 'q-sk': 'SK', 'q-faucet': '水', 'fx-yuka': '点' }[id];
  if (k) return k;
  if (/^e-dl|^e-light|^e-ceil|^e-clight|^e-bl|^e-base|^e-foot/.test(id)) return '灯';
  if (/^e-sw/.test(id)) return 'S';
  if (/^e-con/.test(id)) return 'C';
  return (name || id).replace(/[（(].*$/, '').slice(0, 2);
}
