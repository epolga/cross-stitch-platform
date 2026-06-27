import type { PatternPalette } from './pattern-converter';

export function generatePatternThumbnail(
  grid: number[][],
  palette: PatternPalette[],
  maxW = 240,
  maxH = 160,
): string {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (!rows || !cols) return '';

  const cellSize = Math.max(1, Math.min(Math.floor(maxW / cols), Math.floor(maxH / rows)));
  const w = cols * cellSize;
  const h = rows * cellSize;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#f5f0eb';
  ctx.fillRect(0, 0, w, h);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ci = grid[r][c];
      if (ci < 0 || ci >= palette.length) continue;
      const { r: pr, g: pg, b: pb } = palette[ci];
      ctx.fillStyle = `rgb(${pr},${pg},${pb})`;
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
    }
  }

  return canvas.toDataURL('image/jpeg', 0.65);
}
