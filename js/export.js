/* 書き出し：CSV・Excel（.xlsx）。Excel は外部ライブラリを使わず、無圧縮のZIPで作る */
import { totals, KINDS, roomGeom } from './calc.js';

const enc = new TextEncoder();

/* ---------- CRC32 と 無圧縮ZIP ---------- */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_T[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

export function zipStore(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const csize = central.reduce((s, a) => s + a.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, csize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}

/* ---------- Excel ---------- */
const xe = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

function sheetXml(rows, widths) {
  const cols = widths ? '<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' : '';
  const body = rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => {
    const ref = colName(ci) + (ri + 1);
    if (v && typeof v === 'object' && 'f' in v) return `<c r="${ref}" s="${v.s || 0}"><f>${xe(v.f)}</f></c>`;
    const style = v && typeof v === 'object' ? v.s || 0 : 0;
    const val = v && typeof v === 'object' ? v.v : v;
    if (typeof val === 'number' && Number.isFinite(val)) return `<c r="${ref}" s="${style}"><v>${val}</v></c>`;
    if (val === '' || val == null) return '';
    return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xe(val)}</t></is></c>`;
  }).join('') + '</row>').join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${body}</sheetData></worksheet>`;
}

export function xlsx(sheets) {
  const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xe(s.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  /* s=0 普通 ／ s=1 太字 ／ s=2 3桁区切りの数 ／ s=3 小数2桁 */
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.0##"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Yu Gothic"/></font><font><b/><sz val="11"/><name val="Yu Gothic"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf/><xf fontId="1" applyFont="1"/><xf numFmtId="3" applyNumberFormat="1"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>`;
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const root = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const files = [
    { name: '[Content_Types].xml', data: ct }, { name: '_rels/.rels', data: root },
    { name: 'xl/workbook.xml', data: wb }, { name: 'xl/_rels/workbook.xml.rels', data: rels }, { name: 'xl/styles.xml', data: styles },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows, s.widths) }))
  ];
  const blob = zipStore(files);
  return new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* 案件 → Excel。金額の列は Excel の式（数量×単価）にして、Excel 側でも検算できるようにする */
export function projectXlsx(p, opt) {
  const t = totals(p, opt);
  const B = s => ({ v: s, s: 1 });
  const rows = [[B('見積明細'), '', '', '', '', '', ''], ['件名', p.name], ['お客様', p.customer], ['現場', p.address], [],
    [B('工事項目'), B('規格・仕様'), B('数量'), B('単位'), B('単価'), B('金額'), B('区分')]];
  const first = rows.length + 1;
  (p.lines || []).forEach((l, i) => {
    const r = rows.length + 1;
    rows.push([l.name || '', l.spec || '', { v: t.lines[i].qty, s: 3 }, l.unit || '', { v: Number(l.price) || 0, s: 2 }, { f: `ROUND(C${r}*E${r},0)`, s: 2 }, KINDS[l.kind] || '']);
  });
  const last = rows.length;
  rows.push([]);
  const sr = rows.length + 1;
  rows.push([B('小計'), '', '', '', '', { f: `SUM(F${first}:F${last})`, s: 2 }]);
  rows.push(['諸経費', `${Number(p.overheadPct) || 0}%`, '', '', '', { v: t.overhead, s: 2 }]);
  rows.push(['利益', `${Number(p.profitPct) || 0}%`, '', '', '', { v: t.profit, s: 2 }]);
  if (t.discount) rows.push(['値引き', '', '', '', '', { v: -t.discount, s: 2 }]);
  rows.push([B('税抜合計'), '', '', '', '', { v: t.net, s: 2 }]);
  rows.push(['消費税', `${t.taxRate}%`, '', '', '', { v: t.tax, s: 2 }]);
  rows.push([B('合計（税込）'), '', '', '', '', { v: t.grand, s: 2 }]);
  rows.push([], ['※ 小計は Excel の式です。アプリの小計 ' + t.subtotal.toLocaleString('ja-JP') + ' 円と同じになるか確かめられます。']);
  const roomRows = [[B('部屋'), B('床㎡'), B('天井㎡'), B('壁㎡'), B('周長m'), B('巾木m'), B('天井高m'), B('数')]];
  (p.rooms || []).forEach(r => { const g = roomGeom(r, opt); roomRows.push([r.name, { v: g.floor, s: 3 }, { v: g.ceil, s: 3 }, { v: g.wall, s: 3 }, { v: g.perim, s: 3 }, { v: g.base, s: 3 }, { v: g.h, s: 3 }, g.qty]); });
  void sr;
  return xlsx([{ name: '見積明細', rows, widths: [28, 22, 10, 7, 12, 14, 8] }, { name: '部屋', rows: roomRows, widths: [20, 10, 10, 10, 10, 10, 10, 6] }]);
}

export function projectCsv(p, opt) {
  const t = totals(p, opt);
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [['工事項目', '規格・仕様', '数量', '単位', '単価', '金額', '区分']];
  (p.lines || []).forEach((l, i) => rows.push([l.name, l.spec, t.lines[i].qty, l.unit, l.price, t.lines[i].amount, KINDS[l.kind] || '']));
  rows.push([], ['小計', '', '', '', '', t.subtotal], ['諸経費', '', '', '', '', t.overhead], ['利益', '', '', '', '', t.profit]);
  if (t.discount) rows.push(['値引き', '', '', '', '', -t.discount]);
  rows.push(['消費税', '', '', '', '', t.tax], ['合計（税込）', '', '', '', '', t.grand]);
  return new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
}
