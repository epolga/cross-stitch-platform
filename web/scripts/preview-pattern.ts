// Throwaway visual-inspection helper: renders a pattern JSON (as produced by
// extract-catalog-pattern.ts) to a PNG using the same color/symbol data the
// editor would show, so a reconstructed catalog PDF can be sanity-checked
// without opening the real editor UI.
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'fs';
import { drawSymbol } from '../src/lib/symbol-renderer';

async function main() {
  const file = process.argv[2];
  const outPrefix = process.argv[3] || 'preview';
  const cellSize = parseInt(process.argv[4] || '6', 10);
  if (!file) {
    console.error('Usage: npx tsx scripts/preview-pattern.ts <patternJson> [outPrefix] [cellSize]');
    process.exit(2);
  }
  const pattern = JSON.parse(require('fs').readFileSync(file, 'utf8'));
  const { grid, palette, width, height } = pattern;
  console.log(`Pattern: ${width}x${height}, ${palette.length} colors`);

  // Color view
  {
    const canvas = createCanvas(width * cellSize, height * cellSize);
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = '#f5f0eb';
    ctx.fillRect(0, 0, width * cellSize, height * cellSize);
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const ci = grid[r][c];
        if (ci < 0 || ci >= palette.length) continue;
        const p = palette[ci];
        ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
        ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
      }
    }
    writeFileSync(`${outPrefix}-color.png`, canvas.toBuffer('image/png'));
  }

  // Symbol (black and white) view
  {
    const canvas = createCanvas(width * cellSize, height * cellSize);
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width * cellSize, height * cellSize);
    ctx.font = `${Math.max(cellSize - 2, 6)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const ci = grid[r][c];
        if (ci < 0 || ci >= palette.length) continue;
        const p = palette[ci];
        drawSymbol(ctx, p.symbol, c * cellSize + cellSize / 2, r * cellSize + cellSize / 2, cellSize, '#000000');
      }
    }
    writeFileSync(`${outPrefix}-symbol.png`, canvas.toBuffer('image/png'));
  }

  console.log(`Wrote ${outPrefix}-color.png and ${outPrefix}-symbol.png`);
}

main().catch(err => { console.error(err); process.exit(1); });
