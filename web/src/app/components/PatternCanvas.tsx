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
  mode: 'color' | 'symbol' | 'both';
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

    // Cells
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
      onStrokeStart?.();
      for (const [r, c] of expandCells([cell], penWidthRef.current)) onPaint?.(r, c);
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
      for (const [r, c] of expandCells([cell], penWidthRef.current)) onPaint?.(r, c);
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
      onStrokeEnd?.();
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
      onStrokeEnd?.();
      drawing.current = false;
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
