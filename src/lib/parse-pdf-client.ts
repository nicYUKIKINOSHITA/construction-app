export interface ParsedEstimate {
  projectName: string;
  items: { name: string }[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */

// Load pdfjs from CDN to avoid bundling issues
async function loadPdfJs(): Promise<any> {
  const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';

  // Check if already loaded
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

export async function parsePdf(file: File): Promise<ParsedEstimate> {
  const pdfjsLib = await loadPdfJs();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str || '')
      .join(' ');
    fullText += pageText + '\n';
  }

  // Extract project name
  let projectName = '';
  const kojiMatch = fullText.match(/工\s*事\s*名\s+(.+?)(?=\s{2,}|見積)/);
  const kenMatch = fullText.match(/見\s*積\s*件\s*名\s+(.+?)(?=\s{2,}|見積額)/);

  if (kojiMatch) {
    projectName = kojiMatch[1].replace(/\s+/g, ' ').trim();
  }
  if (kenMatch) {
    const kenName = kenMatch[1].replace(/\s+/g, ' ').trim();
    projectName = projectName ? `${projectName} ${kenName}` : kenName;
  }

  // Parse line items
  const items: { name: string }[] = [];

  // Match patterns: item name followed by quantity, unit, unit price
  const matches = fullText.matchAll(
    /([^\d\n]{2,}?)\s+(\d+\.\d{3})\s+(ｍ|m|式|か所|箇所|本|枚|台|セット|組|個|面)\s+([\d,]+\.\d{2})/g
  );

  for (const match of matches) {
    let name = match[1].trim();
    const qty = match[2];
    const unit = match[3];

    // Skip category totals, adjustments, subtotals
    if (
      name.includes('端数調整') ||
      name.includes('小計') ||
      name.includes('合計') ||
      name.match(/金属工事（/) ||
      name.match(/歩廊庇・/)
    ) {
      continue;
    }

    // Clean up
    name = name.replace(/\s+/g, ' ').trim();
    name = name.replace(/^[\d\s]+/, '').trim();

    if (!name || name.length < 2) continue;

    const displayName = `${name}（${qty}${unit}）`;

    if (!items.some((i) => i.name === displayName)) {
      items.push({ name: displayName });
    }
  }

  return {
    projectName: projectName || file.name.replace(/\.pdf$/i, ''),
    items,
  };
}
