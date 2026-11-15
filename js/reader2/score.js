/* 新しい読み取りの採点（画面に触らない。tests/reader2.test.mjs でテスト）。
 * 正解は、人が確かめた物だけ（こちらで作って採点しない）。形：
 *   { rooms:[{name, pt:[x,y], area?}], notRooms:[{pt:[x,y], type}], unknown:[{pt:[x,y]}] }   座標は図面の m
 * 5つに分けて数える：正しく拾えた部屋／拾えなかった部屋／存在しないのに作られた区画／広さの誤差／（原因は detail に種類を残す）
 * 印が「除外」「保留」の区画は「確定」ではないので、部屋として数えない。本当の部屋を除外にしていたら roomOut（重大。1つでもあれば入れない） */
const pip = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
export function score(faces, marks = {}, answer = {}) {
  const rooms = answer.rooms || [], notRooms = answer.notRooms || [], unknown = answer.unknown || [];
  const st = f => (marks[f.i] || marks[String(f.i)] || {}).s || 'ok';
  /* 点を含む区画のうち一番小さい物（大きい区画の中に小さい区画がある時、点は小さい方の物） */
  const at = pt => faces.filter(f => pip(pt[0], pt[1], f.poly)).sort((a, b) => a.area - b.area)[0] || null;
  const detail = [], hit = new Map();
  rooms.forEach(r => { const f = at(r.pt); if (f) { if (!hit.has(f.i)) hit.set(f.i, []); hit.get(f.i).push(r); } r._f = f; });
  let ok = 0, missed = 0, roomOut = 0, roomHold = 0; const areaErr = [];
  rooms.forEach(r => {
    const f = r._f;
    if (!f) { missed++; detail.push({ kind: 'missed', name: r.name, why: 'どの区画にも入っていない' }); return; }
    if (st(f) === 'out') { roomOut++; detail.push({ kind: 'roomOut', name: r.name, face: f.no }); return; }
    if (st(f) === 'hold') { roomHold++; detail.push({ kind: 'roomHold', name: r.name, face: f.no }); return; }
    if (hit.get(f.i).length > 1) { missed++; detail.push({ kind: 'missed', name: r.name, face: f.no, why: 'ほかの部屋と同じ区画に入っている（分かれていない）' }); return; }
    ok++;
    if (r.area > 0) areaErr.push({ name: r.name, pct: Math.round((f.area - r.area) / r.area * 1000) / 10 });
  });
  const unk = new Set(unknown.map(u => { const f = at(u.pt); return f ? f.i : null; }));
  let spurious = 0, hold = 0, out = 0; const kinds = {};
  faces.forEach(f => {
    const s = st(f); if (s === 'out') { out++; return; } if (s === 'hold') { hold++; return; }
    if (hit.has(f.i) || unk.has(f.i)) return;
    spurious++;
    const n = notRooms.find(q => { const g = at(q.pt); return g && g.i === f.i; });
    const k = n ? n.type : '種類は未確認'; kinds[k] = (kinds[k] || 0) + 1;
  });
  rooms.forEach(r => { delete r._f; });
  return { rooms: rooms.length, ok, missed, spurious, roomOut, roomHold, out, hold, spuriousKinds: kinds, areaErr, detail };
}
