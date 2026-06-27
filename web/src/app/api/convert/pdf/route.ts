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
const KEY_ROW = 16;
const KEY_ENTRIES_PER_COL = Math.floor((PAGE_H - MARGIN * 2 - 40) / KEY_ROW);
const KEY_ENTRIES_PER_PAGE = KEY_ENTRIES_PER_COL * 2;

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

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // Rasterize every unique symbol once
    const uniqueSymbols = [...new Set(palette.map(c => c.symbol))];
    const symbolImages = new Map<string, PDFImage>();
    for (const sym of uniqueSymbols) {
      symbolImages.set(sym, await pdf.embedPng(renderSymbolToPng(sym)));
    }

    // Pre-compute tiling dimensions so we know page numbers before adding pages
    const pageCols = Math.ceil(cols / COLS_PER);
    const pageRows = Math.ceil(rows / ROWS_PER);
    const totalChartPages = pageCols * pageRows;
    const keyPagesCount = Math.ceil(palette.length / KEY_ENTRIES_PER_PAGE);

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
      const stitchLine = `${cols} × ${rows} stitches · ${palette.length} colors`;
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
    for (let pageIdx = 0; pageIdx < keyPagesCount; pageIdx++) {
      const p = pdf.addPage([PAGE_W, PAGE_H]);
      p.drawText('Color Key', { x: MARGIN, y: PAGE_H - MARGIN - 16, size: 12, font: fontBold });

      const colHeaders = (cx: number, labelY: number) => {
        p.drawText('Sym', { x: cx, y: labelY, size: 7, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
        p.drawText('DMC #', { x: cx + 20, y: labelY, size: 7, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
        p.drawText('Color Name', { x: cx + 58, y: labelY, size: 7, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
        p.drawText('Sts', { x: cx + 175, y: labelY, size: 7, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      };

      const COL2_X = MARGIN + (PAGE_W - MARGIN * 2) / 2 + 4;
      colHeaders(MARGIN, PAGE_H - MARGIN - 32);
      colHeaders(COL2_X, PAGE_H - MARGIN - 32);

      // Divider line
      p.drawLine({
        start: { x: MARGIN, y: PAGE_H - MARGIN - 35 },
        end: { x: PAGE_W - MARGIN, y: PAGE_H - MARGIN - 35 },
        thickness: 0.4, color: rgb(0.75, 0.75, 0.75),
      });
      p.drawLine({
        start: { x: (PAGE_W) / 2, y: PAGE_H - MARGIN - 35 },
        end: { x: (PAGE_W) / 2, y: MARGIN },
        thickness: 0.4, color: rgb(0.85, 0.85, 0.85),
      });

      const baseIdx = pageIdx * KEY_ENTRIES_PER_PAGE;

      for (let slot = 0; slot < KEY_ENTRIES_PER_PAGE; slot++) {
        const i = baseIdx + slot;
        if (i >= palette.length) break;

        const isRight = slot >= KEY_ENTRIES_PER_COL;
        const row = slot % KEY_ENTRIES_PER_COL;
        const cx = isRight ? COL2_X : MARGIN;
        const ey = PAGE_H - MARGIN - 48 - row * KEY_ROW;

        const c = palette[i];
        // Swatch
        p.drawRectangle({
          x: cx - 14, y: ey, width: 12, height: 12,
          color: col(c.r, c.g, c.b),
          borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 0.4,
        });
        // Symbol
        const img = symbolImages.get(c.symbol);
        if (img) p.drawImage(img, { x: cx, y: ey, width: 12, height: 12 });
        // Text
        p.drawText(c.number, { x: cx + 20, y: ey + 2, size: 7, font });
        p.drawText(c.name.slice(0, 24), { x: cx + 58, y: ey + 2, size: 7, font });
        p.drawText(String(c.stitchCount), { x: cx + 175, y: ey + 2, size: 7, font });
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
        `Pattern size: ${cols} × ${rows} stitches · ${palette.length} colors`,
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
