/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ParsedEstimate {
  projectName: string;
  deadline: string;
  items: { name: string }[];
  rawText: string;
}

// 金属工事の製品キーワード
const PRODUCT_KEYWORDS = [
  'アルミ笠木', 'ｱﾙﾐ笠木', '笠木',
  'アルミパネル', 'ｱﾙﾐﾊﾟﾈﾙ', 'カットパネル', 'ｶｯﾄﾊﾟﾈﾙ',
  'アルミルーバー', 'ｱﾙﾐﾙｰﾊﾞｰ', 'ルーバー', 'ﾙｰﾊﾞｰ',
  '幕板', '鼻先幕板',
  '歩廊庇', '庇', 'ひさし',
  '目隠し壁', '目隠しパネル', '目隠し',
  'アルミハニカムパネル', 'ｱﾙﾐﾊﾆｶﾑﾊﾟﾈﾙ', 'ハニカムパネル',
  'コーナー加算', 'ｺｰﾅｰ加算',
  'ECP頂部',
  '天井ルーバー', '天井直付ルーバー',
  '手摺', '手すり',
  'ストリンガー', 'ｽﾄﾘﾝｶﾞｰ',
  'ブラケット', 'ﾌﾞﾗｹｯﾄ',
];

const LOCATION_KEYWORDS = [
  'パラペット上端', 'ﾊﾟﾗﾍﾟｯﾄ上端',
  'テラス先端', 'ﾃﾗｽ先端',
  '屋外機置場', '屋外機械置場',
  '来場者入口前', '入口前',
  '小ホール', '小ﾎｰﾙ',
  'リブつきECP', 'ﾘﾌﾞつきECP',
  'バルコニー', 'ﾊﾞﾙｺﾆｰ',
  '屋外階段', '屋上目隠し', '屋上',
  '下り壁', '外壁',
  'メインエントランス', 'エントランス',
  '西面', '東面', '南面', '北面',
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

/** テキストから製品名を抽出 */
function extractProductName(rawDesc: string): string {
  const desc = rawDesc.replace(/\s+/g, ' ').trim();

  // コーナー加算
  if (/コーナー加算|ｺｰﾅｰ加算/.test(desc)) {
    const m = desc.match(/(笠木)?(?:コーナー加算|ｺｰﾅｰ加算)\s*([\w+×]+\s*(?:直角|鋭角|鈍角)?)/);
    if (m) return `笠木コーナー加算 ${(m[2] || '').trim()}`;
    return desc;
  }

  // 製品キーワード
  let product = '';
  for (const kw of PRODUCT_KEYWORDS) {
    if (desc.includes(kw)) { product = kw; break; }
  }

  // 部位キーワード
  let location = '';
  for (const kw of LOCATION_KEYWORDS) {
    if (desc.includes(kw)) { location = kw; break; }
  }

  // 寸法
  const sizeMatch = desc.match(/[WwHh□]\d{2,4}(?:\s*[×xX]\s*[WwHhDdLl□]?\d{2,4})*/);
  const size = sizeMatch ? sizeMatch[0] : '';

  if (product || location) {
    return [location, product, size].filter(Boolean).join(' ');
  }

  // フォールバック
  let cleaned = desc
    .replace(/^本体\s*/, '')
    .replace(/\s*裏面.*$/, '')
    .replace(/\s*t\d+(\.\d+)?\s*/, ' ')
    .replace(/\s*B-FUE\s*/, ' ')
    .replace(/\s*焼付塗装\s*/, ' ')
    .replace(/\s*下地金物共\s*/, '')
    .replace(/\s*溶融亜鉛メッキ.*$/, '')
    .replace(/\s*下地.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length > 40) cleaned = cleaned.substring(0, 40) + '…';
  return cleaned || desc.substring(0, 30);
}

export async function parsePdf(file: File): Promise<ParsedEstimate> {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;

  // Step 1: Flatten ALL text
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
  // Pattern 1: 前田建設形式 "工事名 xxx工事"
  const pnM = text.match(
    /工\s*事\s*名[：:\s]*(.+?)(?=\s*(?:見\s*積\s*有効|工\s*期|納\s*期|見\s*積\s*件\s*名|御見積|合\s*計|摘\s*要|番\s*号|PJ|（株）|\(株\)|【|御中|株式会社\s*ニック|株式会社\s*グロ))/,
  );
  if (pnM) {
    let raw = pnM[1].replace(/\s+/g, ' ').trim();
    const kojiEnd = raw.match(/^(.+?工事(?:\s*\([^)]*\))?)/);
    if (kojiEnd) raw = kojiEnd[1];
    projectName = raw;
  }

  // Step 3: Deadline
  let deadline = '';
  // 工期の日付パターン
  const dates = [...text.matchAll(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)];
  if (dates.length >= 2) {
    // 2つ以上あれば最後（工期終了日）
    const d = dates[dates.length - 1];
    deadline = `${d[1]}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}`;
  }
  // 令和形式も対応
  if (!deadline) {
    const reiwaM = text.match(/令和\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (reiwaM) {
      const year = 2018 + parseInt(reiwaM[1]);
      deadline = `${year}-${reiwaM[2].padStart(2, '0')}-${reiwaM[3].padStart(2, '0')}`;
    }
  }

  // Step 4: Find items — 複数のパターンに対応

  const UNITS = 'ｍ|m|式|か所|箇所|ヶ所|ケ所|ヶ所|本|枚|台|セット|組|個|面|kg|ｋｇ|㎡|㎥|t|ｔ';

  interface Match {
    qty: string;
    unit: string;
    unitPrice: number;
    index: number;
    endIndex: number;
  }

  const matches: Match[] = [];

  // Pattern A: 前田建設形式 "5.700 ｍ 50,000.00 285,000"
  const reA = new RegExp(
    `(\\d+[.,]\\d{1,3})\\s*(${UNITS})\\s+([\\d,]+[.,]\\d{2})\\s+([\\d,]+(?:,\\d{3})*)`,
    'g',
  );
  let m;
  while ((m = reA.exec(text)) !== null) {
    matches.push({
      qty: m[1].replace(',', '.'),
      unit: m[2],
      unitPrice: parseFloat(m[3].replace(/,/g, '')),
      index: m.index,
      endIndex: m.index + m[0].length,
    });
  }

  // Pattern B: ニック形式 "54.0㎡51,8502,808,000" (スペースなし)
  const reB = new RegExp(
    `(\\d+\\.\\d)(${UNITS})(\\d[\\d,]+)(\\d{3},\\d{3})`,
    'g',
  );
  while ((m = reB.exec(text)) !== null) {
    // Avoid double-matching with Pattern A
    const alreadyMatched = matches.some(
      (existing) => Math.abs(existing.index - m!.index) < 10
    );
    if (alreadyMatched) continue;

    matches.push({
      qty: m[1],
      unit: m[2],
      unitPrice: parseFloat(m[3].replace(/,/g, '')),
      index: m.index,
      endIndex: m.index + m[0].length,
    });
  }

  // Pattern C: ニック明細形式 "208.8 ㎡ 55,100 11,504,880" or "208.8\n㎡\n55,100\n11,504,880"
  const reC = new RegExp(
    `(\\d+\\.?\\d*)\\s*(${UNITS})\\s*(\\d[\\d,]+)\\s+(\\d[\\d,]+)`,
    'g',
  );
  while ((m = reC.exec(text)) !== null) {
    const alreadyMatched = matches.some(
      (existing) => Math.abs(existing.index - m!.index) < 10
    );
    if (alreadyMatched) continue;

    const unitPrice = parseFloat(m[3].replace(/,/g, ''));
    const amount = parseFloat(m[4].replace(/,/g, ''));
    // Validate: amount should roughly equal qty * unitPrice
    const qty = parseFloat(m[1]);
    if (qty > 0 && unitPrice > 0 && amount > unitPrice) {
      const expectedAmount = qty * unitPrice;
      const ratio = amount / expectedAmount;
      if (ratio > 0.9 && ratio < 1.1) {
        matches.push({
          qty: m[1],
          unit: m[2],
          unitPrice,
          index: m.index,
          endIndex: m.index + m[0].length,
        });
      }
    }
  }

  // Sort matches by position in text
  matches.sort((a, b) => a.index - b.index);

  // Step 5: Extract item names
  const items: { name: string }[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < matches.length; i++) {
    const curr = matches[i];

    // Skip category headers
    if (curr.unit === '式' && curr.unitPrice >= 1_000_000) continue;

    const nearbyText = text.substring(Math.max(0, curr.index - 80), curr.index);
    if (/端数調整|合\s*計|小\s*計|法定福利費/.test(nearbyText.slice(-30))) continue;

    // Get description between previous match and current
    const prevEnd = i > 0 ? matches[i - 1].endIndex : 0;
    let rawDesc = text.substring(prevEnd, curr.index).trim();

    // Remove headers/noise
    rawDesc = rawDesc
      .replace(/見\s*積\s*明\s*細\s*書/g, '')
      .replace(/見\s*積\s*書\s*番\s*号[：:\s]*\S+/g, '')
      .replace(/見\s*積\s*件\s*名[：:\s]*[^\d]*/g, '')
      .replace(/番号\s*部\s*位.+?摘\s*要/g, '')
      .replace(/名称\s*仕様[^金]*金\s*額/g, '')
      .replace(/名称\s*規[^金]*金\s*額[^考]*考/g, '')
      .replace(/小計/g, '')
      .replace(/\d{8,}/g, '')
      .replace(/金属工事（[^）]*）/g, '')
      .replace(/歩廊庇・目隠し壁（[^）]*）/g, '')
      .replace(/※[^\n]{0,100}/g, '')
      .replace(/工事名[：:\s]*[^\n]*/g, '')
      .replace(/（株）ニック/g, '')
      .replace(/御見積[^\n]*/g, '')
      .replace(/株式会社[^\n]*/g, '')
      .replace(/アルミルーバー工事/g, '')
      .replace(/金属工事[^\n]*/g, '')
      .replace(/ルーバー工事\([^)]*\)/g, '')
      .replace(/NET[^\n]*/g, '')
      .replace(/@\d+\s*/g, '')
      .trim();

    if (!rawDesc || rawDesc.length < 2) continue;

    const productName = extractProductName(rawDesc);

    if (!productName || productName.length < 2) continue;
    if (/端数調整|小計|合計|法定福利|備考/.test(productName)) continue;

    const display = `${productName}（${curr.qty}${curr.unit}）`;
    if (!seen.has(display)) {
      seen.add(display);
      items.push({ name: display });
    }
  }

  // Fallback: project name from filename
  if (!projectName) {
    projectName = file.name
      .replace(/\.pdf$/i, '')
      .replace(/^E\d+_/, '')
      .replace(/^\d+_?/, '')
      .replace(/_/g, ' ')
      .replace(/\s*（株）\s*ニック.*$/, '')
      .replace(/\s*\(株\)\s*ニック.*$/, '')
      .trim();
  }

  return { projectName, deadline, items, rawText: text };
}
