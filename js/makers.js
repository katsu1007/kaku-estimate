/* メーカーのサイトへのリンク（画面に触らない。tests/makers.test.mjs でテスト）。
 * 仕上げ材の行から、メーカーの品番のページ・カタログを別の画面で開くための場所を作る。
 * メーカーのページの中身は読まない（開くだけ）。場所の形は 2026-11-15 に実際に開いて確かめた：
 *   サンゲツ：https://www.sangetsu.co.jp/product/detail/品番/ （品番のハイフンは取る。SP2501・RE55001・CM12241 で確認）
 *   東リ：床材は https://www.toli.co.jp/product/search/floor_number/品番 （TS2401 で確認）。壁紙・巾木の品番のページは未確認なので商品検索を開く
 * サンゲツは自分の画面の中にはめ込めない（X-Frame-Options）ので、必ず別の画面で開く */
const SG = 'https://www.sangetsu.co.jp', TL = 'https://www.toli.co.jp';
export const MAKERS = { sangetsu: 'サンゲツ', toli: '東リ' };

/* 品番の欄から品番だけを取り出す（「SP-2801 白」→ SP-2801）。品番らしくない時は '' */
export function codeOf(v) {
  const s = String(v || '').normalize('NFKC').trim().toUpperCase();
  const m = s.match(/^[A-Z]{1,5}-?\d{2,6}(?:-?[A-Z0-9]{1,4})?/);
  return m ? m[0] : '';
}
/* 行の名前・規格（と単価マスターの品目）からメーカーを見分ける。分からない時は '' */
export function makerOf(line, item) {
  const t = `${line.name || ''} ${line.spec || ''} ${(item && item.name) || ''} ${(item && item.spec) || ''}`;
  if (/東リ|TOLI/i.test(t)) return 'toli';
  if (/サンゲツ|SANGETSU/i.test(t)) return 'sangetsu';
  return '';
}
const kindOf = cat => cat === 'floor' ? 'floor' : cat === 'trim' ? 'base' : 'wall';

/* 開ける場所の一覧 [{ label, url }]。メーカーが分かる行はそのメーカーだけ、分からない行は両方 */
export function makerLinks(line, item) {
  const mk = makerOf(line, item), code = codeOf(line.code), k = kindOf(line.cat);
  const out = [];
  (mk ? [mk] : ['sangetsu', 'toli']).forEach(m => {
    if (m === 'sangetsu') {
      if (code) out.push({ label: 'サンゲツで品番を見る', url: `${SG}/product/detail/${code.replace(/-/g, '')}/` });
      else out.push({ label: 'サンゲツのカタログ', url: `${SG}/digital_book/${k === 'wall' ? 'wall' : k === 'floor' ? 'carpet' : 'other'}.html` });
    } else {
      if (code && k === 'floor') out.push({ label: '東リで品番を見る', url: `${TL}/product/search/floor_number/${code.replace(/-/g, '')}` });
      else if (!code && item && /^https:\/\/www\.toli\.co\.jp\//.test(item.url || '')) out.push({ label: '東リでこのシリーズを見る', url: item.url });
      else out.push({ label: code ? '東リの商品検索' : '東リのカタログ', url: code ? `${TL}/product/search/${k === 'floor' ? 'floor' : k === 'base' ? 'baseboard' : 'wall'}_result` : `${TL}/digital_catalog/?tab=${k === 'floor' ? 'floor' : k === 'base' ? 'baseboard' : 'wall'}` });
    }
  });
  return out;
}
