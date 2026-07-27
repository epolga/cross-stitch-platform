import { createCanvas } from '@napi-rs/canvas';

// Ported from PatternCanvas.tsx's capturePreview() — the exact recipe the
// live editor uses to build the `previewImage` a real user's export sends
// to this same PDF route. This is the fallback used when there's no such
// capture (e.g. batch-regenerating catalog PDFs from the extractor, with no
// browser involved), so it needs to produce the same look, not an
// approximation: simulated Aida weave, a proper cross shape (not just two
// thin diagonals) with a drop shadow for a little relief, and small dark
// dots at every grid intersection for the fabric's punched holes.
type Ctx2D = CanvasRenderingContext2D;

function buildAidaTile(cellPx: number) {
  const c = createCanvas(cellPx, cellPx);
  const ctx = c.getContext('2d') as unknown as Ctx2D;

  ctx.fillStyle = '#EDE0C4';
  ctx.fillRect(0, 0, cellPx, cellPx);

  const half = cellPx / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  ctx.fillRect(0, 0, half, half);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(half, half, half, half);

  ctx.strokeStyle = 'rgba(100,75,40,0.14)';
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(half, 0); ctx.lineTo(half, cellPx); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, half); ctx.lineTo(cellPx, half); ctx.stroke();

  return c;
}

function buildCrossMask(cellPx: number) {
  const c = createCanvas(cellPx, cellPx);
  const ctx = c.getContext('2d') as unknown as Ctx2D;
  const lw = Math.max(2.5, cellPx * 0.32);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, cellPx); ctx.lineTo(cellPx, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(cellPx, cellPx); ctx.stroke();
  return c;
}

// Renders the fallback cover thumbnail as a single PNG. Resolution is
// picked from the stitch count alone (6-20px/cell, capped at ~1200px on
// the long side) — the same formula capturePreview() uses — independent
// of the final print box size; pdf-lib scales the result to fit, so a
// large design's texture naturally shrinks past the point of being
// visible instead of needing a separate cutoff to skip it.
export function renderCoverThumbnailPng(
  grid: number[][],
  palette: { r: number; g: number; b: number }[],
): Buffer {
  const rows = grid.length, cols = grid[0]?.length ?? 0;
  const cellPx = Math.max(6, Math.min(20, Math.floor(1200 / Math.max(rows, cols, 1))));
  const w = cols * cellPx, h = rows * cellPx;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d') as unknown as Ctx2D;

  // Aida background, tiled
  const pattern = ctx.createPattern(buildAidaTile(cellPx) as unknown as CanvasImageSource, 'repeat');
  ctx.fillStyle = pattern ? (pattern as unknown as string) : '#EDE0C4';
  ctx.fillRect(0, 0, w, h);

  // Per-color cross tile, shadow baked in once per color (not per cell)
  const shadowBlur = Math.max(1, cellPx * 0.15);
  const shadowOff = Math.max(0.5, cellPx * 0.08);
  const crossMask = buildCrossMask(cellPx);
  const colorCache = palette.map((p) => {
    const tmp = createCanvas(cellPx, cellPx);
    const tc = tmp.getContext('2d') as unknown as Ctx2D;
    tc.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
    tc.fillRect(0, 0, cellPx, cellPx);
    tc.globalCompositeOperation = 'destination-in';
    tc.drawImage(crossMask as unknown as CanvasImageSource, 0, 0);

    const out = createCanvas(cellPx, cellPx);
    const oc = out.getContext('2d') as unknown as Ctx2D;
    oc.save();
    oc.beginPath(); oc.rect(0, 0, cellPx, cellPx); oc.clip();
    oc.shadowColor = 'rgba(0,0,0,0.45)';
    oc.shadowBlur = shadowBlur;
    oc.shadowOffsetX = shadowOff;
    oc.shadowOffsetY = shadowOff;
    oc.drawImage(tmp as unknown as CanvasImageSource, 0, 0);
    oc.restore();
    return out;
  });

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ci = grid[r][c];
      const tile = colorCache[ci];
      if (ci >= 0 && tile) ctx.drawImage(tile as unknown as CanvasImageSource, c * cellPx, r * cellPx);
    }
  }

  // Fabric holes at every grid intersection — one repeating tile (dot at its
  // corner) instead of a moveTo+arc per intersection. A large design has
  // 75,000+ intersections; that many individual native-canvas calls was
  // slow enough to make the whole render hang in practice, whereas a tiled
  // fillRect is a single call regardless of design size.
  const hr = Math.max(0.5, cellPx * 0.11);
  const holeTile = createCanvas(cellPx, cellPx);
  const htx = holeTile.getContext('2d') as unknown as Ctx2D;
  htx.fillStyle = 'rgba(40,25,8,0.70)';
  htx.beginPath(); htx.arc(0, 0, hr, 0, Math.PI * 2); htx.fill();
  const holePattern = ctx.createPattern(holeTile as unknown as CanvasImageSource, 'repeat');
  if (holePattern) {
    ctx.fillStyle = holePattern as unknown as string;
    ctx.fillRect(0, 0, w, h);
  }

  return canvas.toBuffer('image/png');
}
