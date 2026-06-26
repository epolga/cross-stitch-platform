import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { PatternPalette } from '@/lib/pattern-converter';
import { isPUA } from '@/lib/symbol-renderer';

// PUA symbols are canvas-drawn; Helvetica can't render them — use entry number as fallback.
function pdfSymbol(sym: string, index: number): string {
  return isPUA(sym) ? String(index + 1) : sym;
}

export const dynamic = 'force-dynamic';

const CELL = 12;      // pt per cell on color page
const CELL_SYM = 14; // pt per cell on symbol page
const MARGIN = 36;

function hexColor(r: number, g: number, b: number) {
  return rgb(r / 255, g / 255, b / 255);
}

export async function POST(request: NextRequest) {
  try {
    const { grid, palette } = await request.json() as {
      grid: number[][];
      palette: PatternPalette[];
    };

    if (!grid?.length || !palette?.length) {
      return NextResponse.json({ error: 'Invalid pattern data' }, { status: 400 });
    }

    const rows = grid.length;
    const cols = grid[0].length;

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // ── Page 1: Colored grid ─────────────────────────────────────────────────
    const colorPageW = MARGIN * 2 + cols * CELL;
    const colorPageH = MARGIN * 2 + rows * CELL + 20;
    const p1 = pdf.addPage([colorPageW, colorPageH]);

    p1.drawText('Cross-Stitch Pattern — Color Preview', {
      x: MARGIN, y: colorPageH - 20, size: 10, font: fontBold,
    });

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const ci = grid[y][x];
        const c = palette[ci];
        const px = MARGIN + x * CELL;
        const py = colorPageH - MARGIN - 20 - (y + 1) * CELL;
        p1.drawRectangle({
          x: px, y: py, width: CELL, height: CELL,
          color: hexColor(c.r, c.g, c.b),
          borderColor: rgb(0.8, 0.8, 0.8),
          borderWidth: 0.3,
        });
      }
    }

    // ── Page 2: Symbol grid ──────────────────────────────────────────────────
    const symPageW = MARGIN * 2 + cols * CELL_SYM;
    const symPageH = MARGIN * 2 + rows * CELL_SYM + 20;
    const p2 = pdf.addPage([symPageW, symPageH]);

    p2.drawText('Cross-Stitch Pattern — Symbol Grid (for B&W printing)', {
      x: MARGIN, y: symPageH - 20, size: 10, font: fontBold,
    });

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const ci = grid[y][x];
        const c = palette[ci];
        const px = MARGIN + x * CELL_SYM;
        const py = symPageH - MARGIN - 20 - (y + 1) * CELL_SYM;
        p2.drawRectangle({
          x: px, y: py, width: CELL_SYM, height: CELL_SYM,
          borderColor: rgb(0.6, 0.6, 0.6),
          borderWidth: 0.3,
        });
        p2.drawText(pdfSymbol(c.symbol, ci), {
          x: px + 3, y: py + 3, size: 7, font,
          color: rgb(0, 0, 0),
        });
      }
    }

    // ── Page 3: Color key ────────────────────────────────────────────────────
    const KEY_ROW = 18;
    const keyPageH = MARGIN * 2 + 30 + palette.length * KEY_ROW;
    const p3 = pdf.addPage([400, Math.max(keyPageH, 200)]);
    const p3H = p3.getHeight();

    p3.drawText('Color Key', { x: MARGIN, y: p3H - 25, size: 12, font: fontBold });
    p3.drawText('Symbol', { x: MARGIN, y: p3H - 45, size: 8, font: fontBold });
    p3.drawText('DMC #', { x: MARGIN + 50, y: p3H - 45, size: 8, font: fontBold });
    p3.drawText('Color name', { x: MARGIN + 100, y: p3H - 45, size: 8, font: fontBold });
    p3.drawText('Stitches', { x: MARGIN + 260, y: p3H - 45, size: 8, font: fontBold });

    for (let i = 0; i < palette.length; i++) {
      const c = palette[i];
      const y = p3H - 60 - i * KEY_ROW;
      // Color swatch
      p3.drawRectangle({
        x: MARGIN - 16, y: y + 1, width: 12, height: 12,
        color: hexColor(c.r, c.g, c.b),
        borderColor: rgb(0.5, 0.5, 0.5),
        borderWidth: 0.5,
      });
      p3.drawText(pdfSymbol(c.symbol, i), { x: MARGIN, y: y + 3, size: 9, font });
      p3.drawText(c.number, { x: MARGIN + 50, y: y + 3, size: 8, font });
      p3.drawText(c.name.slice(0, 30), { x: MARGIN + 100, y: y + 3, size: 8, font });
      p3.drawText(String(c.stitchCount), { x: MARGIN + 260, y: y + 3, size: 8, font });
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
