import { NextRequest, NextResponse } from 'next/server';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');

export const dynamic = 'force-dynamic';

interface ParsedItem {
  name: string;
  spec: string;
  quantity: string;
  unit: string;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('pdf') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const data = await pdfParse(buffer);
    const text: string = data.text;

    // Extract project name from 見積件名 or 工事名
    let projectName = '';
    const kenNameMatch = text.match(/見\s*積\s*件\s*名[：:\s]+(.+)/);
    const kojiNameMatch = text.match(/工\s*事\s*名[：:\s]+(.+)/);

    if (kojiNameMatch) {
      projectName = kojiNameMatch[1].trim().split(/\s{2,}/)[0].trim();
    }
    if (kenNameMatch) {
      const kenName = kenNameMatch[1].trim().split(/\s{2,}/)[0].trim();
      if (projectName) {
        projectName = `${projectName} ${kenName}`;
      } else {
        projectName = kenName;
      }
    }

    // Parse line items from the estimate
    const items: ParsedItem[] = [];
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match lines with quantity, unit, and unit price pattern
      // e.g., "5.700 ｍ 50,000.00" or "1.000 式 14,000,000.00" or "1.000 か所 8,200,000.00"
      const qtyMatch = line.match(
        /(\d+\.\d+)\s+(ｍ|m|式|か所|箇所|本|枚|台|セット|組|個|面|set)\s+([\d,]+\.\d+)/
      );

      if (qtyMatch) {
        const quantity = qtyMatch[1];
        const unit = qtyMatch[2];

        // Look backwards for the item name (部位/名称)
        // The name is usually in the preceding lines
        let name = '';
        let spec = '';

        // Extract name from the part before the quantity in the same line
        const beforeQty = line.substring(0, line.indexOf(qtyMatch[0])).trim();

        if (beforeQty) {
          name = beforeQty;
        } else {
          // Look at previous lines for the name
          for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
            const prevLine = lines[j].trim();
            // Skip header rows and empty-like lines
            if (
              prevLine.includes('番号') ||
              prevLine.includes('部　位') ||
              prevLine.includes('見積') ||
              prevLine.includes('仕　　') ||
              !prevLine
            ) {
              continue;
            }
            // This is likely the item name or spec
            if (!name) {
              name = prevLine;
            } else if (!spec) {
              spec = prevLine;
              // Swap if spec looks more like a name
              if (spec.includes('本体') || spec.includes('歩廊') || spec.includes('目隠し')) {
                [name, spec] = [spec, name];
              }
              break;
            }
          }
        }

        // Skip 端数調整 and 小計/合計 rows
        if (
          name.includes('端数調整') ||
          name.includes('小計') ||
          name.includes('合計') ||
          name === ''
        ) {
          continue;
        }

        // Clean up name
        name = name
          .replace(/^(本体\s+)/, '本体 ')
          .replace(/\s+/g, ' ')
          .trim();

        // Skip if this is a category header (式 with very large amounts usually)
        if (unit === '式' && !name.includes('コーナー')) {
          // Keep 式 items only if they look like real items, skip category totals
          const price = parseFloat(qtyMatch[3].replace(/,/g, ''));
          if (price >= 1000000 && name.match(/金属工事|歩廊庇/)) {
            continue; // Skip category-level entries
          }
        }

        // Avoid duplicates
        const isDuplicate = items.some((item) => item.name === name && item.quantity === quantity);
        if (!isDuplicate && name) {
          items.push({ name, spec, quantity, unit });
        }
      }
    }

    return NextResponse.json({
      projectName: projectName || '（PDFから取得できませんでした）',
      items,
      rawText: text, // for debugging
    });
  } catch (err) {
    console.error('PDF parse error:', err);
    return NextResponse.json({ error: 'Failed to parse PDF' }, { status: 500 });
  }
}
