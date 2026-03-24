/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ParsedEstimate {
  projectName: string;
  deadline: string; // 工期の終了日 yyyy-mm-dd
  items: { name: string }[];
  rawText: string; // デバッグ用
}

// Load pdfjs from CDN
async function loadPdfJs(): Promise<any> {
  const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';

  if ((window as any).__pdfjsLib) {
    return (window as any).__pdfjsLib;
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${PDFJS_CDN}/pdf.min.js`;
    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`;
      (window as any).__pdfjsLib = lib;
      resolve(lib);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Group text items by Y position to reconstruct lines
function extractLines(items: any[]): string[] {
  if (!items.length) return [];

  // Group by Y coordinate (with tolerance)
  const rows: Map<number, { x: number; str: string }[]> = new Map();
  for (const item of items) {
    if (!item.str || item.str.trim() === '') continue;
    const y = Math.round(item.transform[5]); // Y position
    const x = item.transform[4]; // X position

    // Find closest Y within tolerance of 3
    let foundY = y;
    for (const key of rows.keys()) {
      if (Math.abs(key - y) < 3) {
        foundY = key;
        break;
      }
    }

    if (!rows.has(foundY)) rows.set(foundY, []);
    rows.get(foundY)!.push({ x, str: item.str });
  }

  // Sort by Y descending (PDF coordinates are bottom-up)
  const sortedRows = [...rows.entries()].sort((a, b) => b[0] - a[0]);

  // Sort each row by X and join
  return sortedRows.map(([, cells]) => {
    cells.sort((a, b) => a.x - b.x);
    return cells.map((c) => c.str).join(' ');
  });
}

export async function parsePdf(file: File): Promise<ParsedEstimate> {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const allLines: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const lines = extractLines(content.items);
    allLines.push(...lines);
  }

  const fullText = allLines.join('\n');

  // === Extract project name ===
  let projectName = '';
  for (const line of allLines) {
    // 工事名の行
    if (line.includes('工') && line.includes('事') && line.includes('名')) {
      const after = line.replace(/.*工\s*事\s*名\s*/, '').trim();
      if (after) {
        projectName = after.split(/\s{3,}/)[0].trim();
      }
    }
    // 見積件名の行
    if (line.includes('見') && line.includes('積') && line.includes('件') && line.includes('名') && !line.includes('見積書番号')) {
      const after = line.replace(/.*見\s*積\s*件\s*名\s*/, '').trim();
      if (after) {
        const kenName = after.split(/\s{3,}/)[0].trim();
        projectName = projectName ? `${projectName} ${kenName}` : kenName;
      }
    }
  }

  // === Extract deadline from 工期 ===
  let deadline = '';
  for (const line of allLines) {
    // 工期・納期 の行から終了日を取得
    const dateMatch = line.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g);
    if (dateMatch && dateMatch.length >= 2) {
      // 2番目の日付が終了日
      const endMatch = dateMatch[dateMatch.length - 1].match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
      if (endMatch) {
        deadline = `${endMatch[1]}-${endMatch[2].padStart(2, '0')}-${endMatch[3].padStart(2, '0')}`;
      }
    }
  }

  // === Extract line items from 明細 ===
  const items: { name: string }[] = [];

  for (const line of allLines) {
    // 数量+単位+単価のパターンを探す
    const qtyPattern = /(\d+\.\d{3})\s+(ｍ|m|式|か所|箇所|本|枚|台|セット|組|個|面)\s+([\d,]+\.\d{2})/;
    const qtyMatch = line.match(qtyPattern);

    if (!qtyMatch) continue;

    const qty = qtyMatch[1];
    const unit = qtyMatch[2];
    const price = parseFloat(qtyMatch[3].replace(/,/g, ''));

    // 数量の前のテキストが品名
    const beforeQty = line.substring(0, line.indexOf(qtyMatch[0])).trim();

    // Skip: 端数調整, カテゴリヘッダ（大金額の式）, 空行
    if (!beforeQty) continue;
    if (beforeQty.includes('端数調整')) continue;
    if (beforeQty.includes('小計') || beforeQty.includes('合計')) continue;

    // カテゴリヘッダ（金属工事、歩廊庇等の大分類）をスキップ
    if (unit === '式' && price >= 1000000) continue;

    // Clean up name
    let name = beforeQty
      .replace(/^\d+\s*/, '') // 先頭の番号削除
      .replace(/\s+/g, ' ')
      .trim();

    if (!name || name.length < 2) continue;

    const displayName = `${name}（${qty}${unit}）`;

    if (!items.some((i) => i.name === displayName)) {
      items.push({ name: displayName });
    }
  }

  // Fallback: ファイル名から案件名
  if (!projectName) {
    projectName = file.name
      .replace(/\.pdf$/i, '')
      .replace(/^E\d+_/, '')
      .replace(/_/g, ' ');
  }

  return { projectName, deadline, items, rawText: fullText };
}
