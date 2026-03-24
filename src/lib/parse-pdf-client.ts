/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ParsedEstimate {
  projectName: string;
  deadline: string; // 工期の終了日 yyyy-mm-dd
  items: { name: string }[];
  rawText: string; // デバッグ用
}

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

export async function parsePdf(file: File): Promise<ParsedEstimate> {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;

  // Step 1: Flatten ALL text into one string — no position/row logic
  const chunks: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const c = await page.getTextContent();
    for (const item of c.items) {
      if (item.str) chunks.push(item.str);
    }
  }
  const text = chunks.join(' ');

  // Step 2: Project name — grab text after 工事名, stop at next label
  let projectName = '';
  const pnM = text.match(
    /工\s*事\s*名[：:\s]*(.+?)(?=\s*(?:工\s*期|納\s*期|見\s*積\s*件\s*名|御見積|合\s*計|摘\s*要|番\s*号|PJ))/,
  );
  if (pnM) projectName = pnM[1].replace(/\s+/g, ' ').trim();

  // Append 見積件名 if found
  const knM = text.match(
    /見\s*積\s*件\s*名[：:\s]*(.+?)(?=\s*(?:工\s*期|納\s*期|御見積|合\s*計|摘\s*要|番\s*号|PJ|数\s*量))/,
  );
  if (knM) {
    const kn = knM[1].replace(/\s+/g, ' ').trim();
    projectName = projectName ? `${projectName} ${kn}` : kn;
  }

  // Step 3: Deadline — last YYYY年MM月DD日 (end of 工期)
  let deadline = '';
  const dates = [...text.matchAll(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)];
  if (dates.length > 0) {
    const d = dates[dates.length - 1];
    deadline = `${d[1]}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}`;
  }

  // Step 4: Find items by qty+unit+unitPrice+amount pattern in flat text
  const UNITS = 'ｍ|m|式|か所|箇所|ヶ所|ケ所|本|枚|台|セット|組|個|面|kg|ｋｇ|㎡|㎥|t|ｔ';
  const re = new RegExp(
    `(\\d+[.,]\\d{1,3})\\s*(${UNITS})\\s+([\\d,]+[.,]\\d{2})\\s+([\\d,]+)`,
    'g',
  );
  const items: { name: string }[] = [];
  const seen = new Set<string>();
  let m;

  while ((m = re.exec(text)) !== null) {
    const qty = m[1].replace(',', '.');
    const unit = m[2];
    const unitPrice = parseFloat(m[3].replace(/,/g, ''));
    if (unit === '式' && unitPrice >= 1_000_000) continue;

    // Look backwards up to 300 chars for the item name
    const before = text.substring(Math.max(0, m.index - 300), m.index);
    // Split on 3+ spaces or row-number boundaries, take last meaningful chunk
    const parts = before.split(/\s{3,}|\d{1,3}\s{2,}(?=\S{2})/).filter(Boolean);
    let name = (parts[parts.length - 1] || '').replace(/\s+/g, ' ').trim();
    name = name.replace(/^\d+\s+/, ''); // strip leading row number

    if (!name || name.length < 2) continue;
    if (/端数調整|小計|合計/.test(name)) continue;

    const display = `${name}（${qty}${unit}）`;
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
