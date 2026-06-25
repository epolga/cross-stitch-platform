'use client';

import { useEffect, useRef } from 'react';
import type { PatternPalette } from '@/lib/pattern-converter';

const ML = 30; // left margin for row numbers
const MT = 18; // top margin for column numbers

export type DrawMode = 'point' | 'line' | 'rect' | 'ellipse';
export type SelectionRect = { r0: number; c0: number; r1: number; c1: number };

function expandCells(cells: [number, number][], width: number): [number, number][] {
  if (width <= 1) return cells;
  // halfLow + halfHigh = width - 1, giving exactly `width` cells in each axis
  const halfLow  = Math.floor((width - 1) / 2);
  const halfHigh = width - 1 - halfLow;
  const seen = new Set<string>();
  const result: [number, number][] = [];
  for (const [r, c] of cells) {
    for (let dr = -halfLow; dr <= halfHigh; dr++) {
      for (let dc = -halfLow; dc <= halfHigh; dc++) {
        const k = `${r + dr},${c + dc}`;
        if (!seen.has(k)) { seen.add(k); result.push([r + dr, c + dc]); }
      }
    }
  }
  return result;
}

interface Props {
  grid: number[][];
  palette: PatternPalette[];
  mode: 'color' | 'symbol' | 'both' | 'simulation';
  cellSize?: number;
  editable?: boolean;
  activeTool?: 'pencil' | 'fill' | 'erase-fill' | 'select';
  drawMode?: DrawMode;
  activeColorIndex?: number;
  penWidth?: number;
  blinkColorIndex?: number | null;
  selection?: SelectionRect | null;
  onPaint?: (row: number, col: number) => void;
  onFill?: (row: number, col: number) => void;
  onStrokeStart?: () => void;
  onStrokeEnd?: () => void;
  onShapePaint?: (cells: [number, number][]) => void;
  onRightClick?: (row: number, col: number) => void;
  onSelectionChange?: (sel: SelectionRect | null) => void;
}

// ── Shape algorithms ────────────────────────────────────────────

function bresenhamLine(r0: number, c0: number, r1: number, c1: number): [number, number][] {
  const cells: [number, number][] = [];
  const dr = Math.abs(r1 - r0), dc = Math.abs(c1 - c0);
  const sr = r0 < r1 ? 1 : -1, sc = c0 < c1 ? 1 : -1;
  let err = dr - dc, r = r0, c = c0;
  while (true) {
    cells.push([r, c]);
    if (r === r1 && c === c1) break;
    const e2 = 2 * err;
    if (e2 > -dc) { err -= dc; r += sr; }
    if (e2 < dr)  { err += dr; c += sc; }
  }
  return cells;
}

function rectCells(r0: number, c0: number, r1: number, c1: number): [number, number][] {
  const rMin = Math.min(r0, r1), rMax = Math.max(r0, r1);
  const cMin = Math.min(c0, c1), cMax = Math.max(c0, c1);
  const cells: [number, number][] = [];
  for (let c = cMin; c <= cMax; c++) { cells.push([rMin, c]); if (rMin !== rMax) cells.push([rMax, c]); }
  for (let r = rMin + 1; r < rMax; r++) { cells.push([r, cMin]); if (cMin !== cMax) cells.push([r, cMax]); }
  return cells;
}

function ellipseCells(r0: number, c0: number, r1: number, c1: number): [number, number][] {
  const rMin = Math.min(r0, r1), rMax = Math.max(r0, r1);
  const cMin = Math.min(c0, c1), cMax = Math.max(c0, c1);
  const cy = (rMin + rMax) / 2, cx = (cMin + cMax) / 2;
  const a = (cMax - cMin) / 2, b = (rMax - rMin) / 2;
  if (a === 0 && b === 0) return [[rMin, cMin]];

  const seen = new Set<string>();
  const cells: [number, number][] = [];
  const add = (r: number, c: number) => {
    const k = `${r},${c}`;
    if (!seen.has(k)) { seen.add(k); cells.push([r, c]); }
  };

  // Scan rows: find column extent of ellipse at each row
  for (let r = rMin; r <= rMax; r++) {
    const dy = r - cy;
    const dx = a === 0 ? 0 : a * Math.sqrt(Math.max(0, 1 - (dy * dy) / (b * b || 1)));
    const cl = Math.round(cx - dx), cr = Math.round(cx + dx);
    if (r === rMin || r === rMax) { for (let c = cl; c <= cr; c++) add(r, c); }
    else { add(r, cl); add(r, cr); }
  }
  // Scan columns: fill in any gaps
  for (let c = cMin; c <= cMax; c++) {
    const dx = c - cx;
    const dy = b === 0 ? 0 : b * Math.sqrt(Math.max(0, 1 - (dx * dx) / (a * a || 1)));
    const rt = Math.round(cy - dy), rb = Math.round(cy + dy);
    if (c === cMin || c === cMax) { for (let r = rt; r <= rb; r++) add(r, c); }
    else { add(rt, c); add(rb, c); }
  }
  return cells;
}

function shapeCells(
  mode: DrawMode,
  r0: number, c0: number, r1: number, c1: number,
): [number, number][] {
  if (mode === 'line')    return bresenhamLine(r0, c0, r1, c1);
  if (mode === 'rect')    return rectCells(r0, c0, r1, c1);
  if (mode === 'ellipse') return ellipseCells(r0, c0, r1, c1);
  return [[r1, c1]]; // point
}

// ── Programmatic Aida cell texture ───────────────────────────────
function buildAidaCell(cs: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = cs; c.height = cs;
  const ctx = c.getContext('2d')!;

  // Base linen/cream color
  ctx.fillStyle = '#EDE0C4';
  ctx.fillRect(0, 0, cs, cs);

  // Subtle 2×2 thread-bundle shading (Aida weave)
  const half = cs / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  ctx.fillRect(0, 0, half, half);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(half, half, half, half);

  // Fine thread separator lines
  ctx.strokeStyle = 'rgba(100,75,40,0.14)';
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(half, 0); ctx.lineTo(half, cs); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, half); ctx.lineTo(cs, half); ctx.stroke();

  // Needle holes at 4 corners (shared between adjacent stitches)
  const hr = Math.max(0.8, cs * 0.13);
  ctx.fillStyle = 'rgba(50,30,10,0.38)';
  for (const [hx, hy] of [[0, 0], [cs, 0], [0, cs], [cs, cs]] as [number, number][]) {
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.fill();
  }

  return c;
}

// ── Component ────────────────────────────────────────────────────

export default function PatternCanvas({
  grid, palette, mode, cellSize = 12,
  editable, activeTool, drawMode = 'point',
  activeColorIndex = 0, penWidth = 1, blinkColorIndex = null, selection = null,
  onPaint, onFill, onStrokeStart, onStrokeEnd, onShapePaint, onRightClick, onSelectionChange,
}: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const drawing     = useRef(false);
  const startCell   = useRef<[number, number] | null>(null);
  const previewRef  = useRef<[number, number][]>([]);

  // Simulation mode assets
  const crossMaskRef    = useRef<HTMLCanvasElement | null>(null);
  const simReadyRef     = useRef(false);
  const aidaCellCache   = useRef<{ cs: number; canvas: HTMLCanvasElement } | null>(null);
  const aidaLayerRef    = useRef<HTMLCanvasElement | null>(null); // persistent Aida background
  const crossLayerRef   = useRef<HTMLCanvasElement | null>(null); // persistent cross layer (incremental)
  const prevGridRef     = useRef<number[][] | null>(null);        // last rendered grid for diff
  const prevPaletteRef  = useRef<PatternPalette[] | null>(null);
  const isSimStrokeRef   = useRef(false); // true during sim pencil stroke → suppress draw()
  const strokeCellsRef   = useRef<Set<string>>(new Set()); // accumulated cells (sim stroke)
  const lastStrokePosRef = useRef<[number, number] | null>(null);

  // Keep latest props in refs so draw() can always read current values
  const gridRef        = useRef(grid);
  const paletteRef     = useRef(palette);
  const modeRef        = useRef(mode);
  const cellSizeRef    = useRef(cellSize);
  const activeColRef   = useRef(activeColorIndex);
  const penWidthRef    = useRef(penWidth);
  const blinkColorRef  = useRef(blinkColorIndex);
  const blinkOnRef     = useRef(false);
  const selRef         = useRef<SelectionRect | null>(null);
  gridRef.current      = grid;
  paletteRef.current   = palette;
  modeRef.current      = mode;
  cellSizeRef.current  = cellSize;
  activeColRef.current = activeColorIndex;
  penWidthRef.current  = penWidth;
  blinkColorRef.current = blinkColorIndex;
  selRef.current        = selection;

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g  = gridRef.current;
    const pal = paletteRef.current;
    const vm  = modeRef.current;
    const cs  = cellSizeRef.current;
    if (!g.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rows = g.length, cols = g[0].length;
    canvas.width  = cols * cs + ML;
    canvas.height = rows * cs + MT;

    // Margin backgrounds
    ctx.fillStyle = '#ddd';
    ctx.fillRect(0, 0, ML, canvas.height);
    ctx.fillRect(0, 0, canvas.width, MT);

    if (vm === 'simulation') {
      // ── Simulation mode ────────────────────────────────────────
      if (!simReadyRef.current || !crossMaskRef.current) {
        ctx.fillStyle = '#EDE0C4';
        ctx.fillRect(ML, MT, cols * cs, rows * cs);
      } else {
        const w = cols * cs, h = rows * cs;

        // ── Aida layer: rebuild only when dimensions or cs change ──
        if (!aidaLayerRef.current || aidaLayerRef.current.width !== w || aidaLayerRef.current.height !== h) {
          if (!aidaCellCache.current || aidaCellCache.current.cs !== cs)
            aidaCellCache.current = { cs, canvas: buildAidaCell(cs) };
          const al = document.createElement('canvas');
          al.width = w; al.height = h;
          const alCtx = al.getContext('2d')!;
          const pat = alCtx.createPattern(aidaCellCache.current.canvas, 'repeat');
          if (pat) { alCtx.fillStyle = pat; alCtx.fillRect(0, 0, w, h); }
          aidaLayerRef.current = al;
          prevGridRef.current = null; // force full cross-layer rebuild
        }

        // ── Cross layer: persistent canvas, updated incrementally ──
        if (!crossLayerRef.current || crossLayerRef.current.width !== w || crossLayerRef.current.height !== h) {
          const cl = document.createElement('canvas');
          cl.width = w; cl.height = h;
          crossLayerRef.current = cl;
          prevGridRef.current = null;
        }

        const clCtx = crossLayerRef.current.getContext('2d')!;
        const mask = crossMaskRef.current;
        const prevG = prevGridRef.current;
        const paletteChanged = prevPaletteRef.current !== pal;
        prevPaletteRef.current = pal;

        // Reusable cell canvas for cross shape (colored, masked)
        const cell = document.createElement('canvas');
        cell.width = cs; cell.height = cs;
        const cellCtx = cell.getContext('2d')!;
        const shadowBlur = Math.max(1, cs * 0.15);
        const shadowOff  = Math.max(0.5, cs * 0.08);

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const ci = g[r][c];
            const prevCi = prevG ? (prevG[r]?.[c] ?? -1) : undefined;
            if (!paletteChanged && prevCi === ci) continue; // nothing changed here

            clCtx.clearRect(c * cs, r * cs, cs, cs);

            if (ci >= 0 && pal[ci]) {
              const col = pal[ci];
              cellCtx.clearRect(0, 0, cs, cs);
              cellCtx.globalCompositeOperation = 'source-over';
              cellCtx.fillStyle = `rgb(${col.r},${col.g},${col.b})`;
              cellCtx.fillRect(0, 0, cs, cs);
              cellCtx.globalCompositeOperation = 'destination-in';
              cellCtx.drawImage(mask, 0, 0, cs, cs);

              // Shadow clipped to cell bounds — no bleed into neighbours
              clCtx.save();
              clCtx.beginPath();
              clCtx.rect(c * cs, r * cs, cs, cs);
              clCtx.clip();
              clCtx.shadowColor = 'rgba(0,0,0,0.45)';
              clCtx.shadowBlur = shadowBlur;
              clCtx.shadowOffsetX = shadowOff;
              clCtx.shadowOffsetY = shadowOff;
              clCtx.drawImage(cell, c * cs, r * cs);
              clCtx.restore();
            }
          }
        }

        prevGridRef.current = g;

        // Composite Aida + crosses onto main canvas
        ctx.drawImage(aidaLayerRef.current, ML, MT);
        ctx.drawImage(crossLayerRef.current, ML, MT);
      }
    } else {
      // ── Color / Symbol / Both modes ─────────────────────────────
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const ci = g[r][c];
          const color = ci === -1 ? null : pal[ci];
          const px = c * cs + ML, py = r * cs + MT;

          if (!color) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(px, py, cs, cs);
            ctx.strokeStyle = 'rgba(0,0,0,0.13)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(px, py, cs, cs);
            continue;
          }

          ctx.fillStyle = (vm === 'color' || vm === 'both')
            ? `rgb(${color.r},${color.g},${color.b})` : '#fff';
          ctx.fillRect(px, py, cs, cs);
          ctx.strokeStyle = 'rgba(0,0,0,0.13)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(px, py, cs, cs);

          if (vm === 'symbol' || vm === 'both') {
            const br = color.r + color.g + color.b;
            ctx.fillStyle = vm === 'both' ? (br > 382 ? '#000' : '#fff') : '#000';
            ctx.font = `bold ${Math.max(cs - 4, 6)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(color.symbol, px + cs / 2, py + cs / 2);
          }
        }
      }

      // Bold grid lines every 10
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      for (let r = 0; r <= rows; r += 10) {
        const y = r * cs + MT;
        ctx.beginPath(); ctx.moveTo(ML, y); ctx.lineTo(ML + cols * cs, y); ctx.stroke();
      }
      for (let c = 0; c <= cols; c += 10) {
        const x = c * cs + ML;
        ctx.beginPath(); ctx.moveTo(x, MT); ctx.lineTo(x, MT + rows * cs); ctx.stroke();
      }
    }

    // Row numbers every 5
    ctx.fillStyle = '#666';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let r = 4; r < rows; r += 5)
      ctx.fillText(String(r + 1), ML - 3, r * cs + MT + cs / 2);

    // Column numbers every 5
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (let c = 4; c < cols; c += 5)
      ctx.fillText(String(c + 1), c * cs + ML + cs / 2, MT - 2);

    // Blink overlay for right-click highlight
    const bci = blinkColorRef.current;
    if (bci !== null && blinkOnRef.current) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#fff';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (g[r][c] === bci) {
            const px = c * cs + ML, py = r * cs + MT;
            ctx.fillRect(px, py, cs, cs);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // Selection overlay (dashed rect + tint)
    const sel = selRef.current;
    if (sel) {
      const rMin = Math.min(sel.r0, sel.r1), rMax = Math.max(sel.r0, sel.r1);
      const cMin = Math.min(sel.c0, sel.c1), cMax = Math.max(sel.c0, sel.c1);
      const x = cMin * cs + ML, y = rMin * cs + MT;
      const w = (cMax - cMin + 1) * cs, h = (rMax - rMin + 1) * cs;
      ctx.fillStyle = 'rgba(59,130,246,0.15)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
      ctx.setLineDash([]);
    }

    // Preview cells (ghost overlay for shape drawing)
    const preview = previewRef.current;
    if (preview.length > 0) {
      const aci = activeColRef.current;
      const ac = aci === -1 ? null : pal[aci];
      ctx.globalAlpha = 0.55;
      for (const [r, c] of preview) {
        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
        const px = c * cs + ML, py = r * cs + MT;
        ctx.fillStyle = ac ? `rgb(${ac.r},${ac.g},${ac.b})` : '#fff';
        ctx.fillRect(px, py, cs, cs);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#e11d48';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
        ctx.globalAlpha = 0.55;
      }
      ctx.globalAlpha = 1;
    }
  }

  // Load cross mask once on mount; Aida background is generated programmatically
  useEffect(() => {
    const crosses = document.createElement('img');
    crosses.onload = () => {
      const CROSS = 16;
      const mc = document.createElement('canvas');
      mc.width = CROSS; mc.height = CROSS;
      const mctx = mc.getContext('2d')!;
      mctx.drawImage(crosses, 0, 0, CROSS, CROSS, 0, 0, CROSS, CROSS);
      // Crosses.png encodes the cross shape in its alpha channel (all pixels are black).
      // Keep alpha as-is; set RGB to white so destination-in compositing uses the existing alpha.
      const id = mctx.getImageData(0, 0, CROSS, CROSS);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
        // d[i + 3] unchanged — existing alpha IS the cross mask
      }
      mctx.putImageData(id, 0, 0);
      crossMaskRef.current = mc;
      simReadyRef.current = true;
      draw();
    };
    crosses.src = '/simulation/Crosses.png';
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { draw(); }, [grid, palette, mode, cellSize]);

  useEffect(() => {
    if (blinkColorIndex == null) {
      blinkOnRef.current = false;
      draw();
      return;
    }
    blinkOnRef.current = true;
    draw();
    const id = setInterval(() => {
      blinkOnRef.current = !blinkOnRef.current;
      draw();
    }, 280);
    return () => clearInterval(id);
  }, [blinkColorIndex]);

  // Draw one line segment (or dot) showing the stroke path in simulation mode
  function directStrokeSegment(from: [number, number] | null, to: [number, number]) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cs = cellSizeRef.current;
    const toX = to[1] * cs + ML + cs / 2;
    const toY = to[0] * cs + MT + cs / 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(40,20,10,0.6)';
    ctx.lineWidth = Math.max(1.5, cs * 0.12);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (from) {
      ctx.moveTo(from[1] * cs + ML + cs / 2, from[0] * cs + MT + cs / 2);
      ctx.lineTo(toX, toY);
    } else {
      ctx.arc(toX, toY, Math.max(1, cs * 0.08), 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Paint cells directly onto the canvas (non-simulation pencil strokes)
  function directPaint(cells: [number, number][]) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cs = cellSizeRef.current;
    const pal = paletteRef.current;
    const aci = activeColRef.current;
    const col = aci >= 0 && pal[aci] ? pal[aci] : null;
    for (const [r, c] of cells) {
      ctx.fillStyle = col ? `rgb(${col.r},${col.g},${col.b})` : '#fff';
      ctx.fillRect(c * cs + ML, r * cs + MT, cs, cs);
    }
  }

  function cellAt(e: React.MouseEvent<HTMLCanvasElement>): [number, number] | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
    const cs = cellSizeRef.current;
    const col = Math.floor(((e.clientX - rect.left) * sx - ML) / cs);
    const row = Math.floor(((e.clientY - rect.top)  * sy - MT) / cs);
    const g = gridRef.current;
    const rows = g.length, cols = g[0]?.length ?? 0;
    if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
    return [row, col];
  }

  function onDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!editable || e.button !== 0) return;
    const cell = cellAt(e);
    if (!cell) return;
    if (activeTool === 'select') {
      drawing.current = true;
      startCell.current = cell;
      const sel = { r0: cell[0], c0: cell[1], r1: cell[0], c1: cell[1] };
      selRef.current = sel;
      draw();
      onSelectionChange?.(sel);
      return;
    }
    if (activeTool === 'fill' || activeTool === 'erase-fill') {
      onFill?.(cell[0], cell[1]);
    } else if (drawMode === 'point') {
      drawing.current = true;
      const painted = expandCells([cell], penWidthRef.current);
      if (modeRef.current === 'simulation') {
        isSimStrokeRef.current = true;
        strokeCellsRef.current = new Set(painted.map(([r, c]) => `${r},${c}`));
        lastStrokePosRef.current = cell;
        directStrokeSegment(null, cell);
      } else {
        onStrokeStart?.();
        directPaint(painted);
        for (const [r, c] of painted) onPaint?.(r, c);
      }
    } else {
      // Shape tool — record start, show preview
      drawing.current = true;
      startCell.current = cell;
      previewRef.current = expandCells([cell], penWidthRef.current);
      draw();
    }
  }

  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!editable || !drawing.current) return;
    const cell = cellAt(e);
    if (!cell) return;
    if (activeTool === 'select' && startCell.current) {
      const [r0, c0] = startCell.current;
      const sel = { r0, c0, r1: cell[0], c1: cell[1] };
      selRef.current = sel;
      draw();
      onSelectionChange?.(sel);
      return;
    }
    if (activeTool !== 'pencil') return;

    if (drawMode === 'point') {
      const painted = expandCells([cell], penWidthRef.current);
      if (modeRef.current === 'simulation') {
        for (const [r, c] of painted) strokeCellsRef.current.add(`${r},${c}`);
        directStrokeSegment(lastStrokePosRef.current, cell);
        lastStrokePosRef.current = cell;
      } else {
        directPaint(painted);
        for (const [r, c] of painted) onPaint?.(r, c);
      }
    } else if (startCell.current) {
      const [r0, c0] = startCell.current;
      previewRef.current = expandCells(shapeCells(drawMode, r0, c0, cell[0], cell[1]), penWidthRef.current);
      draw();
    }
  }

  function onUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;

    if (activeTool === 'select') {
      startCell.current = null;
      // plain click (no drag) → cancel selection
      const sel = selRef.current;
      if (sel && sel.r0 === sel.r1 && sel.c0 === sel.c1) {
        selRef.current = null;
        onSelectionChange?.(null);
      }
      draw();
      return;
    }
    if (activeTool === 'pencil' && drawMode !== 'point' && startCell.current) {
      const cell = cellAt(e);
      const [r0, c0] = startCell.current;
      const [r1, c1] = cell ?? [r0, c0];
      const cells = expandCells(shapeCells(drawMode, r0, c0, r1, c1), penWidthRef.current);
      previewRef.current = [];
      startCell.current = null;
      onShapePaint?.(cells);
    } else if (drawMode === 'point') {
      previewRef.current = [];
      if (isSimStrokeRef.current) {
        isSimStrokeRef.current = false;
        const cells = Array.from(strokeCellsRef.current).map(k => {
          const [r, c] = k.split(',').map(Number);
          return [r, c] as [number, number];
        });
        strokeCellsRef.current = new Set();
        lastStrokePosRef.current = null;
        onShapePaint?.(cells); // one React update → useEffect → full simulation draw
      } else {
        onStrokeEnd?.();
      }
    } else {
      previewRef.current = [];
      draw();
    }
  }

  function onLeave() {
    if (!drawing.current) return;
    if (activeTool === 'select') {
      drawing.current = false;
      startCell.current = null;
      return;
    }
    // Cancel shape preview on leave; stroke continues if mouse re-enters
    if (drawMode !== 'point') {
      drawing.current = false;
      previewRef.current = [];
      startCell.current = null;
      draw();
    } else {
      drawing.current = false;
      if (isSimStrokeRef.current) {
        isSimStrokeRef.current = false;
        const cells = Array.from(strokeCellsRef.current).map(k => {
          const [r, c] = k.split(',').map(Number);
          return [r, c] as [number, number];
        });
        strokeCellsRef.current = new Set();
        lastStrokePosRef.current = null;
        onShapePaint?.(cells);
      } else {
        onStrokeEnd?.();
      }
    }
  }

  function onContext(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const cell = cellAt(e);
    if (cell) onRightClick?.(cell[0], cell[1]);
  }

  const cursor = !editable ? 'default'
    : (activeTool === 'fill' || activeTool === 'erase-fill') ? 'cell'
    : 'crosshair';

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', imageRendering: 'pixelated', cursor }}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={onLeave}
      onContextMenu={onContext}
    />
  );
}
