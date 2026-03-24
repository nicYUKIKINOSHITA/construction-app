/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ParsedEstimate {
  projectName: string;
  deadline: string;
  items: { name: string }[];
  rawText: string;
}

// 金属工事の製品キーワード（部位＋製品名の辞書）
const PRODUCT_KEYWORDS = [
  'アルミ笠木', 'ｱﾙﾐ笠木', '笠木',
  'アルミパネル', 'ｱﾙﾐﾊﾟﾈﾙ', 'カットパネル', 'ｶｯﾄﾊﾟﾈﾙ',
  'アルミルーバー', 'ｱﾙﾐﾙｰﾊﾞｰ', 'ルーバー', 'ﾙｰﾊﾞｰ',
  '幕板', '鼻先幕板',
  '歩廊庇', '庇', 'ひさし',
  '目隠し壁', '目隠しパネル',
  'アルミハニカムパネル', 'ｱﾙﾐﾊﾆｶﾑﾊﾟﾈﾙ', 'ハニカムパネル',
  'コーナー加算', 'ｺｰﾅｰ加算',
  'ECP頂部',
];

const LOCATION_KEYWORDS = [
  'パラペット上端', 'ﾊﾟﾗﾍﾟｯﾄ上端',
  'テラス先端', 'ﾃﾗｽ先端',
  '屋外機置場', '屋外機械置場',
  '来場者入口前', '入口前',
  '小ホール', '小ﾎｰﾙ',
  'リブつきECP', 'ﾘﾌﾞつきECP',
];

// Load pdfjs from CDN
async function loadPdfJs(): Promise<any> {
  const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';
  if ((window as any).__pdfjsLib) return (window as any).__pdfjsLib;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${CDN}/pdf.min.js`;
    s.onload = () => {
      const lib = (window as any).pdfjsLib;
      lib.GlobalWorkerOptions.workerSrc = `${CDN}/pdf.worker.min.js`;
      (window as any).__pdfjsLib = lib;
      resolve(lib);
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/**
 * テキストから金属工事の製品名を抽出する
 * "本体 小ﾎｰﾙ他ﾊﾟﾗﾍﾟｯﾄ上端 W330 t2.0 B-FUEアルミ笠木 裏面ｸﾞﾗｲﾄ吹付共"
 * → "パラペット上端 アルミ笠木 W330"
 */
function extractProductName(rawDesc: string): string {
  const desc = rawDesc.replace(/\s+/g, ' ').trim();

  // 1. コーナー加算は特殊処理
  if (/コーナー加算|ｺｰﾅｰ加算/.test(desc)) {
    // "本体アルミ笠木コーナー加算 W330+W250 直角" → "笠木コーナー加算 W330+W250 直角"
    const m = desc.match(/(笠木)?(?:コーナー加算|ｺｰﾅｰ加算)\s*([\w+×]+\s*(?:直角|鋭角|鈍角)?)/);
    if (m) return `笠木コーナー加算 ${(m[2] || '').trim()}`;
    return desc;
  }

  // 2. 製品キーワードを探す
  let product = '';
  for (const kw of PRODUCT_KEYWORDS) {
    if (desc.includes(kw)) {
      product = kw;
      break;
    }
  }

  // 3. 部位（場所）を探す
  let location = '';
  for (const kw of LOCATION_KEYWORDS) {
    if (desc.includes(kw)) {
      location = kw;
      break;
    }
  }

  // 4. 寸法を探す（W330, W250, H280, W246×H50 など）
  const sizeMatch = desc.match(/[WwHh]\d{2,4}(?:\s*[×xX]\s*[WwHhDdLl]?\d{2,4})*/);
  const size = sizeMatch ? sizeMatch[0] : '';

  // 5. 組み立て
  if (product || location) {
    const parts = [location, product, size].filter(Boolean);
    return parts.join(' ');
  }

  // 6. フォールバック：キーワードが見つからない場合は元のテキストをクリーンアップ
  // 先頭の "本体" を除去、仕様詳細（t2.0, B-FUE, 裏面...）を除去
  let cleaned = desc
    .replace(/^本体\s*/, '')
    .replace(/\s*裏面.*$/, '')
    .replace(/\s*t\d+(\.\d+)?\s*/, ' ')
    .replace(/\s*B-FUE\s*/, ' ')
    .replace(/\s*焼付塗装\s*/, ' ')
    .replace(/\s*下地金物共\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 長すぎたら最初の30文字で切る
  if (cleaned.length > 40) cleaned = cleaned.substring(0, 40) + '…';

  return cleaned || desc.substring(0, 30);
}

export async function parsePdf(file: File): Promise<ParsedEstimate> {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;

  // Step 1: Flatten ALL text into one string
  const chunks: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const c = await page.getTextContent();
    for (const item of c.items) {
      if (item.str) chunks.push(item.str);
    }
  }
  const text = chunks.join(' ');

  // Step 2: Project name — 「工事名」から現場名（〜工事）だけ抽出
  let projectName = '';
  const pnM = text.match(
    /工\s*事\s*名[：:\s]*(.+?)(?=\s*(?:見\s*積\s*有効|工\s*期|納\s*期|見\s*積\s*件\s*名|御見積|合\s*計|摘\s*要|番\s*号|PJ|（株）|\(株\)|【))/,
  );
  if (pnM) {
    let raw = pnM[1].replace(/\s+/g, ' ').trim();
    // 「〜工事」で終わるところまでを現場名とする
    const kojiEnd = raw.match(/^(.+?工事)/);
    if (kojiEnd) raw = kojiEnd[1];
    projectName = raw;
  }

  // Step 3: Deadline — last YYYY年MM月DD日
  let deadline = '';
  const dates = [...text.matchAll(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)];
  if (dates.length > 0) {
    const d = dates[dates.length - 1];
    deadline = `${d[1]}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}`;
  }

  // Step 4: Find ALL qty+unit+price+amount matches and record their positions
  const UNITS = 'ｍ|m|式|か所|箇所|ヶ所|ケ所|本|枚|台|セット|組|個|面|kg|ｋｇ|㎡|㎥|t|ｔ';
  const re = new RegExp(
    `(\\d+[.,]\\d{1,3})\\s*(${UNITS})\\s+([\\d,]+[.,]\\d{2})\\s+([\\d,]+(?:,\\d{3})*)`,
    'g',
  );

  interface Match {
    qty: string;
    unit: string;
    unitPrice: number;
    amount: string;
    index: number;
    endIndex: number;
  }

  const matches: Match[] = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    matches.push({
      qty: m[1].replace(',', '.'),
      unit: m[2],
      unitPrice: parseFloat(m[3].replace(/,/g, '')),
      amount: m[4],
      index: m.index,
      endIndex: m.index + m[0].length,
    });
  }

  // Step 5: For each match, extract the description between previous match's end and current match's start
  const items: { name: string }[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < matches.length; i++) {
    const curr = matches[i];

    // Skip category headers (式 with price >= 1M)
    if (curr.unit === '式' && curr.unitPrice >= 1_000_000) continue;
    // Skip 端数調整
    const nearbyText = text.substring(Math.max(0, curr.index - 50), curr.index);
    if (/端数調整/.test(nearbyText)) continue;

    // Get description: text between previous match end and current match start
    const prevEnd = i > 0 ? matches[i - 1].endIndex : 0;
    let rawDesc = text.substring(prevEnd, curr.index).trim();

    // Remove page headers that repeat on each page
    rawDesc = rawDesc
      .replace(/見\s*積\s*明\s*細\s*書/g, '')
      .replace(/見\s*積\s*書\s*番\s*号[：:\s]*\S+/g, '')
      .replace(/見\s*積\s*件\s*名[：:\s]*[^\d]*/g, '')
      .replace(/番号\s*部\s*位.+?摘\s*要/g, '')
      .replace(/小計/g, '')
      .replace(/\d{8,}/g, '') // long numbers like 03738910
      .replace(/金属工事（[^）]*）/g, '')
      .replace(/歩廊庇・目隠し壁（[^）]*）/g, '')
      .replace(/※\S+/g, '')
      .trim();

    if (!rawDesc || rawDesc.length < 2) continue;

    // Extract meaningful product name using construction knowledge
    const productName = extractProductName(rawDesc);

    if (!productName || productName.length < 2) continue;
    if (/端数調整|小計|合計/.test(productName)) continue;

    const display = `${productName}（${curr.qty}${curr.unit}）`;
    if (!seen.has(display)) {
      seen.add(display);
      items.push({ name: display });
    }
  }

  // Fallback: project name from filename
  if (!projectName) {
    projectName = file.name.replace(/\.pdf$/i, '').replace(/^E\d+_/, '').replace(/_/g, ' ');
  }

  return { projectName, deadline, items, rawText: text };
}
