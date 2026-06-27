import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { PDFPage, PDFFont, PDFImage } from 'pdf-lib';
import type { PatternPalette } from '@/lib/pattern-converter';
import { renderSymbolToPng } from '@/lib/server-symbol-renderer';

export const dynamic = 'force-dynamic';

// A4 portrait
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 36;

// Chart page layout
const CHART_CELL = 10;   // pt per stitch cell
const LABEL_LEFT = 24;   // row-number gutter
const LABEL_TOP = 14;    // col-number gutter
const HEADER_H = 20;     // section info header
const FOOTER_H = 14;     // page number footer

const CHART_W = PAGE_W - MARGIN * 2 - LABEL_LEFT;
const CHART_H = PAGE_H - MARGIN * 2 - HEADER_H - LABEL_TOP - FOOTER_H;
const COLS_PER = Math.floor(CHART_W / CHART_CELL);
const ROWS_PER = Math.floor(CHART_H / CHART_CELL);

// Color key layout
const KEY_ROW_H = 18;          // row height
const KEY_HDR_BLOCK = 66;      // title + column headers + divider
const KEY_ROWS_PER_PAGE = Math.floor((PAGE_H - MARGIN * 2 - KEY_HDR_BLOCK) / KEY_ROW_H);
const SWATCH_W = 12;
const SWATCH_H = KEY_ROW_H - 4;

// Key column X positions — each wide enough for its header text at 7pt bold
const KX_COLOR = MARGIN;           // "Color" ~22pt wide
const KX_SYM   = MARGIN + 34;     // "Symbol" ~25pt wide
const KX_CATNO = MARGIN + 74;     // "Cat No." ~27pt; values right-aligned +50
const KX_BRAND = MARGIN + 130;    // "Brand" / "D.M.C."
const KX_TYPE  = MARGIN + 195;    // "Type" / "Stranded Cotton" ~53pt
const KX_ST    = MARGIN + 340;    // "Stitches"; values right-aligned +48
const KX_SK    = MARGIN + 400;    // "Skeins"; values right-aligned +40

const NAVY = rgb(0.04, 0.10, 0.30);

function col(r: number, g: number, b: number) { return rgb(r / 255, g / 255, b / 255); }

function centerText(page: PDFPage, text: string, y: number, size: number, font: PDFFont, color = rgb(0, 0, 0)) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (PAGE_W - w) / 2, y, size, font, color });
}

export async function POST(request: NextRequest) {
  try {
    const { grid, palette, title = 'Cross-Stitch Pattern' } = await request.json() as {
      grid: number[][];
      palette: PatternPalette[];
      title?: string;
    };

    if (!grid?.length || !palette?.length) {
      return NextResponse.json({ error: 'Invalid pattern data' }, { status: 400 });
    }

    const rows = grid.length;
    const cols = grid[0].length;

    // Only show colors that are actually placed in the pattern
    const usedPalette = palette.filter(c => c.stitchCount > 0);

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // Rasterize every unique symbol once (only for used colors)
    const uniqueSymbols = [...new Set(usedPalette.map(c => c.symbol))];
    const symbolImages = new Map<string, PDFImage>();
    for (const sym of uniqueSymbols) {
      symbolImages.set(sym, await pdf.embedPng(renderSymbolToPng(sym)));
    }

    // Pre-compute tiling dimensions so we know page numbers before adding pages
    const pageCols = Math.ceil(cols / COLS_PER);
    const pageRows = Math.ceil(rows / ROWS_PER);
    const totalChartPages = pageCols * pageRows;
    const keyPagesCount = Math.ceil(usedPalette.length / KEY_ROWS_PER_PAGE);

    // PDF page order: 1 cover · 2..1+keyPagesCount color key · 2+keyPagesCount page map · then chart pages
    const firstChartPageNum = 3 + keyPagesCount;

    // ── Page 1: Cover ──────────────────────────────────────────────────────────
    {
      const p = pdf.addPage([PAGE_W, PAGE_H]);

      // Title
      const titleSize = title.length > 30 ? 20 : title.length > 20 ? 24 : 28;
      centerText(p, title, PAGE_H - MARGIN - 44, titleSize, fontBold, rgb(0.05, 0.05, 0.05));
      centerText(p, 'cross-stitch.com', PAGE_H - MARGIN - 64, 11, font, rgb(0.45, 0.45, 0.45));

      // Stitch count line
      const stitchLine = `${cols} × ${rows} stitches · ${usedPalette.length} colors`;
      centerText(p, stitchLine, PAGE_H - MARGIN - 80, 9, font, rgb(0.55, 0.55, 0.55));

      // Color preview — draw scaled grid
      const maxW = PAGE_W - MARGIN * 2;
      const maxH = PAGE_H - MARGIN - 100;  // leave space for header text
      const scale = Math.min(maxW / cols, maxH / rows);
      const thumbW = cols * scale;
      const thumbH = rows * scale;
      const ox = (PAGE_W - thumbW) / 2;
      const oy = MARGIN;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const ci = grid[r][c];
          const pal = palette[ci];
          if (!pal) continue;
          p.drawRectangle({
            x: ox + c * scale,
            y: oy + (rows - r - 1) * scale,
            width: scale + 0.5,   // +0.5 prevents hairline gaps
            height: scale + 0.5,
            color: col(pal.r, pal.g, pal.b),
          });
        }
      }

      // Thin border around the thumbnail
      p.drawRectangle({
        x: ox, y: oy, width: thumbW, height: thumbH,
        borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5,
      });
    }

    // ── Pages 2-N: Color key ────────────────────────────────────────────────
    const KEY_ROW_START_Y = PAGE_H - MARGIN - KEY_HDR_BLOCK;

    for (let pageIdx = 0; pageIdx < keyPagesCount; pageIdx++) {
      const p = pdf.addPage([PAGE_W, PAGE_H]);

      // "Key" title — centered, large navy
      const keyTitleW = fontBold.widthOfTextAtSize('Key', 20);
      p.drawText('Key', {
        x: (PAGE_W - keyTitleW) / 2, y: PAGE_H - MARGIN - 22,
        size: 20, font: fontBold, color: NAVY,
      });
      if (keyPagesCount > 1) {
        const sub = `Page ${pageIdx + 1} of ${keyPagesCount}`;
        const subW = font.widthOfTextAtSize(sub, 7);
        p.drawText(sub, {
          x: (PAGE_W - subW) / 2, y: PAGE_H - MARGIN - 34,
          size: 7, font, color: rgb(0.5, 0.5, 0.5),
        });
      }

      // Column headers
      const hdrY = PAGE_H - MARGIN - 50;
      for (const [x, label] of [
        [KX_COLOR, 'Color'], [KX_SYM, 'Symbol'],
        [KX_CATNO, 'Cat No.'], [KX_BRAND, 'Brand'], [KX_TYPE, 'Type'],
        [KX_ST, 'Stitches'], [KX_SK, 'Skeins'],
      ] as [number, string][]) {
        p.drawText(label, { x, y: hdrY, size: 7, font: fontBold, color: NAVY });
      }

      // Divider below headers
      p.drawLine({
        start: { x: MARGIN, y: PAGE_H - MARGIN - 56 },
        end: { x: PAGE_W - MARGIN, y: PAGE_H - MARGIN - 56 },
        thickness: 0.4, color: rgb(0.72, 0.72, 0.72),
      });

      const baseIdx = pageIdx * KEY_ROWS_PER_PAGE;

      for (let slot = 0; slot < KEY_ROWS_PER_PAGE; slot++) {
        const i = baseIdx + slot;
        if (i >= usedPalette.length) break;

        const c = usedPalette[i];
        const rowBottom = KEY_ROW_START_Y - (slot + 1) * KEY_ROW_H;
        const swatchY   = rowBottom + 2;
        const textY     = rowBottom + KEY_ROW_H / 2 - 3;

        // Colour swatch
        p.drawRectangle({
          x: KX_COLOR, y: swatchY, width: SWATCH_W, height: SWATCH_H,
          color: col(c.r, c.g, c.b),
          borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 0.4,
        });

        // Symbol box (white with coloured border)
        p.drawRectangle({
          x: KX_SYM, y: swatchY, width: SWATCH_W, height: SWATCH_H,
          color: rgb(1, 1, 1),
          borderColor: col(c.r, c.g, c.b), borderWidth: 1,
        });
        const img = symbolImages.get(c.symbol);
        if (img) p.drawImage(img, { x: KX_SYM + 1, y: swatchY + 1, width: SWATCH_W - 2, height: SWATCH_H - 2 });

        // Cat No.
        p.drawText(c.number, { x: KX_CATNO, y: textY, size: 7, font, color: NAVY });

        // Brand
        p.drawText('D.M.C.', { x: KX_BRAND, y: textY, size: 7, font, color: NAVY });

        // Type
        p.drawText('Stranded Cotton', { x: KX_TYPE, y: textY, size: 7, font, color: NAVY });

        // Stitches
        p.drawText(String(c.stitchCount), { x: KX_ST, y: textY, size: 7, font, color: NAVY });

        // Skeins (approx 1800 stitches per DMC skein)
        const skeins = Math.max(0.1, Math.round(c.stitchCount / 1800 * 10) / 10);
        p.drawText(skeins.toFixed(1), { x: KX_SK, y: textY, size: 7, font, color: NAVY });
      }
    }

    // ── Page map ───────────────────────────────────────────────────────────────
    {
      const p = pdf.addPage([PAGE_W, PAGE_H]);
      p.drawText('Page Map', { x: MARGIN, y: PAGE_H - MARGIN - 16, size: 12, font: fontBold });
      p.drawText(
        `The chart is printed across ${totalChartPages} pages (${pageRows} row${pageRows !== 1 ? 's' : ''} × ${pageCols} column${pageCols !== 1 ? 's' : ''} of pages).`,
        { x: MARGIN, y: PAGE_H - MARGIN - 32, size: 9, font, color: rgb(0.35, 0.35, 0.35) },
      );
      p.drawText(
        `Pattern size: ${cols} × ${rows} stitches · ${usedPalette.length} colors`,
        { x: MARGIN, y: PAGE_H - MARGIN - 44, size: 9, font, color: rgb(0.35, 0.35, 0.35) },
      );

      const cellW = Math.min(140, (PAGE_W - MARGIN * 2) / pageCols);
      const cellH = Math.min(100, (PAGE_H * 0.55) / pageRows);
      const mapX = MARGIN;
      const mapY = PAGE_H - MARGIN - 70;

      for (let pr = 0; pr < pageRows; pr++) {
        for (let pc = 0; pc < pageCols; pc++) {
          const pageNum = firstChartPageNum + pr * pageCols + pc;
          const mx = mapX + pc * cellW;
          const my = mapY - pr * cellH;

          p.drawRectangle({
            x: mx, y: my - cellH, width: cellW, height: cellH,
            color: rgb(0.97, 0.97, 0.97),
            borderColor: rgb(0.4, 0.4, 0.4), borderWidth: 1,
          });

          const pageLabel = `Page ${pageNum}`;
          const plw = fontBold.widthOfTextAtSize(pageLabel, 10);
          p.drawText(pageLabel, {
            x: mx + (cellW - plw) / 2, y: my - cellH / 2,
            size: 10, font: fontBold,
          });

          const r0 = pr * ROWS_PER + 1;
          const r1 = Math.min((pr + 1) * ROWS_PER, rows);
          const c0 = pc * COLS_PER + 1;
          const c1 = Math.min((pc + 1) * COLS_PER, cols);
          const rangeLabel = `rows ${r0}–${r1} · cols ${c0}–${c1}`;
          const rlw = font.widthOfTextAtSize(rangeLabel, 7);
          p.drawText(rangeLabel, {
            x: mx + (cellW - rlw) / 2, y: my - cellH + 6,
            size: 7, font, color: rgb(0.45, 0.45, 0.45),
          });
        }
      }
    }

    // ── Chart pages ────────────────────────────────────────────────────────────
    for (let pr = 0; pr < pageRows; pr++) {
      for (let pc = 0; pc < pageCols; pc++) {
        const r0 = pr * ROWS_PER;
        const r1 = Math.min(r0 + ROWS_PER, rows);
        const c0 = pc * COLS_PER;
        const c1 = Math.min(c0 + COLS_PER, cols);
        const pageNum = firstChartPageNum + pr * pageCols + pc;

        const p = pdf.addPage([PAGE_W, PAGE_H]);

        // Header
        const headerText = `Rows ${r0 + 1}–${r1} · Cols ${c0 + 1}–${c1}`;
        p.drawText(headerText, {
          x: MARGIN, y: PAGE_H - MARGIN - 14,
          size: 8, font, color: rgb(0.4, 0.4, 0.4),
        });
        p.drawText(title, {
          x: PAGE_W - MARGIN - fontBold.widthOfTextAtSize(title, 8),
          y: PAGE_H - MARGIN - 14,
          size: 8, font: fontBold, color: rgb(0.3, 0.3, 0.3),
        });

        const gx = MARGIN + LABEL_LEFT;                        // grid left edge
        const gy = PAGE_H - MARGIN - HEADER_H - LABEL_TOP;    // grid top edge

        // Column number labels (every 10, 1-indexed)
        for (let c = c0; c < c1; c++) {
          if ((c + 1) % 10 === 0) {
            const label = String(c + 1);
            const lw = font.widthOfTextAtSize(label, 6);
            p.drawText(label, {
              x: gx + (c - c0) * CHART_CELL + (CHART_CELL - lw) / 2,
              y: gy + 2,
              size: 6, font, color: rgb(0.35, 0.35, 0.35),
            });
          }
        }

        // Row number labels (every 10, 1-indexed)
        for (let r = r0; r < r1; r++) {
          if ((r + 1) % 10 === 0) {
            const label = String(r + 1);
            const lw = font.widthOfTextAtSize(label, 6);
            p.drawText(label, {
              x: MARGIN + LABEL_LEFT - lw - 3,
              y: gy - (r - r0 + 1) * CHART_CELL + 2,
              size: 6, font, color: rgb(0.35, 0.35, 0.35),
            });
          }
        }

        // Cell contents (symbols)
        for (let r = r0; r < r1; r++) {
          for (let c = c0; c < c1; c++) {
            const ci = grid[r][c];
            const pal = palette[ci];
            if (!pal) continue;
            const cx = gx + (c - c0) * CHART_CELL;
            const cy = gy - (r - r0 + 1) * CHART_CELL;
            const img = symbolImages.get(pal.symbol);
            if (img) p.drawImage(img, { x: cx + 1, y: cy + 1, width: CHART_CELL - 2, height: CHART_CELL - 2 });
          }
        }

        // Thin cell grid lines
        const gridW = (c1 - c0) * CHART_CELL;
        const gridH = (r1 - r0) * CHART_CELL;
        const thinGray = rgb(0.78, 0.78, 0.78);
        const thickGray = rgb(0.4, 0.4, 0.4);

        // Vertical lines
        for (let c = c0; c <= c1; c++) {
          const lx = gx + (c - c0) * CHART_CELL;
          const isBold = (c - c0) % 10 === 0 || c === c1;
          p.drawLine({
            start: { x: lx, y: gy },
            end: { x: lx, y: gy - gridH },
            thickness: isBold ? 0.7 : 0.25,
            color: isBold ? thickGray : thinGray,
          });
        }

        // Horizontal lines
        for (let r = r0; r <= r1; r++) {
          const ly = gy - (r - r0) * CHART_CELL;
          const isBold = (r - r0) % 10 === 0 || r === r1;
          p.drawLine({
            start: { x: gx, y: ly },
            end: { x: gx + gridW, y: ly },
            thickness: isBold ? 0.7 : 0.25,
            color: isBold ? thickGray : thinGray,
          });
        }

        // Footer — page number
        const footer = `Page ${pageNum} of ${firstChartPageNum + totalChartPages - 1}`;
        const fw = font.widthOfTextAtSize(footer, 8);
        p.drawText(footer, {
          x: (PAGE_W - fw) / 2, y: MARGIN / 2 + 2,
          size: 8, font, color: rgb(0.5, 0.5, 0.5),
        });
      }
    }

    const bytes = await pdf.save();
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="cross-stitch-pattern.pdf"',
      },
    });
  } catch (e) {
    console.error('[convert/pdf] error:', e);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }
}
