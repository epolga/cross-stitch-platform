'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import type { PatternPalette } from '@/lib/pattern-converter';
import { drawSymbol } from '@/lib/symbol-renderer';

const ML = 30; // left margin for row numbers

// Custom needle cursor — silver needle, sharp tip bottom-left, thread from eye matches active color
function penCursor(threadColor: string) {
  return `url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">' +
    '<polygon points="24,1 30,7 1,31" fill="#D0D0D0" stroke="#555" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<line x1="25" y1="2" x2="2" y2="29" stroke="white" stroke-width="0.9" stroke-linecap="butt" opacity="0.85"/>' +
    '<ellipse cx="25" cy="5" rx="5.5" ry="2" transform="rotate(-45,25,5)" fill="#444"/>' +
    '<ellipse cx="25" cy="5" rx="2.8" ry="0.85" transform="rotate(-45,25,5)" fill="#E0E0E0"/>' +
    `<path d="M 26 2 Q 35 -4 33 8 Q 31 18 23 15" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M 26 2 Q 35 -4 33 8 Q 31 18 23 15" fill="none" stroke="${threadColor}" stroke-width="3" stroke-linecap="round"/>` +
    '</svg>'
  )}") 1 31, crosshair`;
}

// Custom eraser cursor — seam ripper: handle top-right, blade tip bottom-left (hotspot)
const ERASER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28">' +
  // Handle: teardrop in crimson, rotated -45°
  '<ellipse cx="22" cy="5" rx="5" ry="3" transform="rotate(-45 22 5)" fill="#be123c" stroke="#7f1d1d" stroke-width="1"/>' +
  // Collar / guard ring
  '<ellipse cx="17" cy="9" rx="2.2" ry="1.2" transform="rotate(-45 17 9)" fill="#64748b" stroke="#475569" stroke-width="0.8"/>' +
  // Shaft
  '<line x1="15.5" y1="10.5" x2="10" y2="16" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>' +
  // Ball prong (outer) — ends with safety ball
  '<path d="M10 16 Q7.5 20 7 25" stroke="#334155" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
  '<circle cx="7" cy="25" r="2" fill="#be123c" stroke="#7f1d1d" stroke-width="0.8"/>' +
  // Blade prong (inner) — sharp tip is the hotspot at (3,23)
  '<path d="M10 16 Q6 18.5 3 23" stroke="#cbd5e1" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
  '<circle cx="3" cy="23" r="0.9" fill="#f1f5f9"/>' +
  '</svg>'
)}") 3 23, cell`;

// Flood fill cursor — syringe: liquid color matches active fill color
function floodCursor(fillColor: string) {
  return `url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 28 28">' +
    '<g transform="rotate(-45 14 14)">' +
    '<line x1="3" y1="14" x2="7" y2="14" stroke="#94a3b8" stroke-width="1.2" stroke-linecap="butt"/>' +
    '<polygon points="0,14 4,13 4,15" fill="#cbd5e1"/>' +
    '<rect x="7" y="12" width="2" height="4" rx="0.5" fill="#64748b"/>' +
    '<rect x="9" y="11.5" width="11" height="5" rx="1" fill="#f8fafc" stroke="#94a3b8" stroke-width="0.8"/>' +
    `<rect x="10" y="12.5" width="6.5" height="3" rx="0.3" fill="${fillColor}"/>` +
    '<rect x="16.5" y="12" width="2" height="4" rx="0.5" fill="#9ca3af" stroke="#6b7280" stroke-width="0.5"/>' +
    '<rect x="19" y="9" width="2" height="2.5" rx="0.4" fill="#475569"/>' +
    '<rect x="19" y="16.5" width="2" height="2.5" rx="0.4" fill="#475569"/>' +
    '<line x1="18.5" y1="14" x2="23" y2="14" stroke="#475569" stroke-width="1.2" stroke-linecap="butt"/>' +
    '<rect x="23" y="10" width="2" height="8" rx="1" fill="#334155"/>' +
    '</g>' +
    '</svg>'
  )}") 7 41, cell`;
}

// Erase-fill cursor — seam ripper, larger than single-eraser version (48px vs 28px)
const ERASE_FILL_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 28 28">' +
  '<ellipse cx="22" cy="5" rx="5" ry="3" transform="rotate(-45 22 5)" fill="#7c3aed" stroke="#4c1d95" stroke-width="1"/>' +
  '<ellipse cx="17" cy="9" rx="2.2" ry="1.2" transform="rotate(-45 17 9)" fill="#64748b" stroke="#475569" stroke-width="0.8"/>' +
  '<line x1="15.5" y1="10.5" x2="10" y2="16" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>' +
  '<path d="M10 16 Q7.5 20 7 25" stroke="#334155" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
  '<circle cx="7" cy="25" r="2" fill="#7c3aed" stroke="#4c1d95" stroke-width="0.8"/>' +
  '<path d="M10 16 Q6 18.5 3 23" stroke="#cbd5e1" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
  '<circle cx="3" cy="23" r="0.9" fill="#f1f5f9"/>' +
  '</svg>'
)}") 5 39, cell`;
const MT = 18; // top margin for column numbers

export type DrawMode = 'point' | 'line' | 'rect' | 'rect-fill' | 'ellipse' | 'ellipse-fill';
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
  activeTool?: 'pencil' | 'fill' | 'erase-fill' | 'select' | 'mark';
  drawMode?: DrawMode;
  activeColorIndex?: number;
  penWidth?: number;
  blinkColorIndex?: number | null;
  hiddenColors?: Set<number>;
  selection?: SelectionRect | null;
  stitchedCells?: Set<string>;      // key `${row},${col}` — cells marked as stitched
  focusColorIndex?: number | null;  // spotlight this palette color, dim the rest
  onPaint?: (row: number, col: number) => void;
  onFill?: (row: number, col: number) => void;
  onStrokeStart?: () => void;
  onStrokeEnd?: () => void;
  onShapePaint?: (cells: [number, number][]) => void;
  onRightClick?: (row: number, col: number) => void;
  onSelectionChange?: (sel: SelectionRect | null) => void;
  onMarkCell?: (row: number, col: number, marked: boolean) => void;
  onMarkStrokeEnd?: () => void;
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

function rectFillCells(r0: number, c0: number, r1: number, c1: number): [number, number][] {
  const rMin = Math.min(r0, r1), rMax = Math.max(r0, r1);
  const cMin = Math.min(c0, c1), cMax = Math.max(c0, c1);
  const cells: [number, number][] = [];
  for (let r = rMin; r <= rMax; r++)
    for (let c = cMin; c <= cMax; c++)
      cells.push([r, c]);
  return cells;
}

function ellipseFillCells(r0: number, c0: number, r1: number, c1: number): [number, number][] {
  const rMin = Math.min(r0, r1), rMax = Math.max(r0, r1);
  const cMin = Math.min(c0, c1), cMax = Math.max(c0, c1);
  const cy = (rMin + rMax) / 2, cx = (cMin + cMax) / 2;
  const a = (cMax - cMin) / 2, b = (rMax - rMin) / 2;
  if (a === 0 && b === 0) return [[rMin, cMin]];
  const cells: [number, number][] = [];
  for (let r = rMin; r <= rMax; r++) {
    const dy = r - cy;
    const dx = b === 0 ? a : a * Math.sqrt(Math.max(0, 1 - (dy * dy) / (b * b)));
    const cl = Math.ceil(cx - dx), cr = Math.floor(cx + dx);
    for (let c = cl; c <= cr; c++) cells.push([r, c]);
  }
  return cells;
}

// Constrain r1/c1 so the bounding box is square (for Shift+rect/ellipse)
function constrainToSquare(r0: number, c0: number, r1: number, c1: number): [number, number] {
  const dr = r1 - r0, dc = c1 - c0;
  const side = Math.min(Math.abs(dr), Math.abs(dc));
  return [r0 + Math.sign(dr) * side, c0 + Math.sign(dc) * side];
}

// Same constraint, in raw pixel space — for the free-angle shape preview during drag
function constrainToSquarePx(x0: number, y0: number, x1: number, y1: number): [number, number] {
  const dx = x1 - x0, dy = y1 - y0;
  const side = Math.min(Math.abs(dx), Math.abs(dy));
  return [x0 + Math.sign(dx) * side, y0 + Math.sign(dy) * side];
}

function shapeCells(
  mode: DrawMode,
  r0: number, c0: number, r1: number, c1: number,
): [number, number][] {
  if (mode === 'line')         return bresenhamLine(r0, c0, r1, c1);
  if (mode === 'rect')         return rectCells(r0, c0, r1, c1);
  if (mode === 'rect-fill')    return rectFillCells(r0, c0, r1, c1);
  if (mode === 'ellipse')      return ellipseCells(r0, c0, r1, c1);
  if (mode === 'ellipse-fill') return ellipseFillCells(r0, c0, r1, c1);
  return [[r1, c1]]; // point
}

// ── Simple single-line cross, but tapered — thin at the corner holes, full
// width at the middle (same sine taper as the multi-strand simulation's
// individual strands, just one straight, un-bowed line per diagonal instead
// of 4 random ones). This is the current default cross rendering.
function buildTaperedSimpleCrossMask(ecs: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = ecs; c.height = ecs;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  const maxLw = Math.max(2, ecs * 0.42);

  function drawTaperedDiagonal(x0: number, y0: number, x1: number, y1: number) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len; // unit vector perpendicular to the diagonal
    const N = 16;
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const bx = x0 + dx * t, by = y0 + dy * t;
      const w = (maxLw / 2) * Math.sin(Math.PI * t);
      left.push([bx + nx * w, by + ny * w]);
      right.push([bx - nx * w, by - ny * w]);
    }
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (let i = 1; i <= N; i++) ctx.lineTo(left[i][0], left[i][1]);
    for (let i = N; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  drawTaperedDiagonal(0, ecs, ecs, 0);
  drawTaperedDiagonal(0, 0, ecs, ecs);
  return c;
}

function stampSimpleCross(
  ecs: number,
  col: { r: number; g: number; b: number },
  mask: HTMLCanvasElement,
  shadowBlur: number,
  shadowOff: number,
): HTMLCanvasElement {
  const tmp = document.createElement('canvas');
  tmp.width = ecs; tmp.height = ecs;
  const tc = tmp.getContext('2d')!;
  tc.fillStyle = `rgb(${col.r},${col.g},${col.b})`;
  tc.fillRect(0, 0, ecs, ecs);
  tc.globalCompositeOperation = 'destination-in';
  tc.drawImage(mask, 0, 0);

  const out = document.createElement('canvas');
  out.width = ecs; out.height = ecs;
  const oc = out.getContext('2d')!;
  oc.save();
  oc.beginPath(); oc.rect(0, 0, ecs, ecs); oc.clip();
  // Experimental (2026-08-10, Olga's ask): shadow alpha scaled by the
  // thread color's own perceived lightness, same idea already tried in
  // server-cover-thumbnail.ts — a flat dark shadow reads as thread depth
  // on saturated/dark colors but as grime on near-white ones. Same relative
  // proportion as that file's 0.45->0.12 change, applied to this file's
  // baseline 0.3 instead (0.3 -> ~0.08 at white).
  const lightness = (0.299 * col.r + 0.587 * col.g + 0.114 * col.b) / 255;
  const shadowAlpha = 0.3 - 0.22 * lightness;
  oc.shadowColor = `rgba(0,0,0,${shadowAlpha.toFixed(3)})`;
  oc.shadowBlur = shadowBlur * 1.3;
  oc.shadowOffsetX = shadowOff * 0.6;
  oc.shadowOffsetY = shadowOff * 0.6;
  oc.drawImage(tmp, 0, 0);
  oc.restore();
  return out;
}

// Fixed-hue accent (e.g. the site's own rose-red) reads fine on pale designs
// but blends into warm/neutral ones (beige, grey) — Olga's ask after seeing
// it fail on the Labrador/Elephant tests: derive the outline-dot color from
// each design's own palette instead, as its complementary hue, so it always
// contrasts with that specific design rather than matching or clashing by luck.
function computeContrastAccentColor(palette: { r: number; g: number; b: number; stitchCount: number }[]): string {
  let rSum = 0, gSum = 0, bSum = 0, wSum = 0;
  for (const p of palette) {
    const w = p.stitchCount || 1;
    rSum += p.r * w; gSum += p.g * w; bSum += p.b * w; wSum += w;
  }
  if (wSum === 0) return '190,18,60';
  const rn = rSum / wSum / 255, gn = gSum / wSum / 255, bn = bSum / wSum / 255;

  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case rn: h = 60 * (((gn - bn) / d) % 6); break;
      case gn: h = 60 * ((bn - rn) / d + 2); break;
      default: h = 60 * ((rn - gn) / d + 4); break;
    }
  }
  if (h < 0) h += 360;

  const accentHue = (h + 180) % 360;
  const accentS = 0.6;
  const accentL = 0.32; // dark enough to stay visible against the pale Aida cloth regardless of hue

  const c = (1 - Math.abs(2 * accentL - 1)) * accentS;
  const x = c * (1 - Math.abs(((accentHue / 60) % 2) - 1));
  const m = accentL - c / 2;
  let r2 = 0, g2 = 0, b2 = 0;
  if (accentHue < 60) { r2 = c; g2 = x; b2 = 0; }
  else if (accentHue < 120) { r2 = x; g2 = c; b2 = 0; }
  else if (accentHue < 180) { r2 = 0; g2 = c; b2 = x; }
  else if (accentHue < 240) { r2 = 0; g2 = x; b2 = c; }
  else if (accentHue < 300) { r2 = x; g2 = 0; b2 = c; }
  else { r2 = c; g2 = 0; b2 = x; }

  const R = Math.round((r2 + m) * 255);
  const G = Math.round((g2 + m) * 255);
  const B = Math.round((b2 + m) * 255);
  return `${R},${G},${B}`;
}

// ── Component ────────────────────────────────────────────────────

export type PatternCanvasHandle = {
  capturePreview: () => Promise<string | null>;
};

const PatternCanvas = forwardRef<PatternCanvasHandle, Props>(function PatternCanvas({
  grid, palette, mode, cellSize = 12,
  editable, activeTool, drawMode = 'point',
  activeColorIndex = 0, penWidth = 1, blinkColorIndex = null, hiddenColors, selection = null,
  stitchedCells, focusColorIndex = null,
  onPaint, onFill, onStrokeStart, onStrokeEnd, onShapePaint, onRightClick, onSelectionChange,
  onMarkCell, onMarkStrokeEnd,
}: Props, ref: React.Ref<PatternCanvasHandle>) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const drawing     = useRef(false);
  const startCell   = useRef<[number, number] | null>(null);
  const previewRef  = useRef<[number, number][]>([]);
  const rawShapeRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const lastPxRef   = useRef<[number, number] | null>(null); // last raw (unconstrained) cursor px during shape drag

  // Simulation mode assets
  const aidaImgRef      = useRef<HTMLImageElement | null>(null); // loaded /simulation/Canvas.png
  const aidaImgLoadRef  = useRef<Promise<HTMLImageElement | null> | null>(null); // resolves once load settles (success or failure), for capturePreview() to await
  const [aidaImgVersion, setAidaImgVersion] = useState(0); // bumped once the image loads, to trigger a redraw
  const aidaLayerRef    = useRef<HTMLCanvasElement | null>(null); // persistent Aida background
  const crossLayerRef   = useRef<HTMLCanvasElement | null>(null); // persistent cross layer (incremental)
  const prevGridRef     = useRef<number[][] | null>(null);        // last rendered grid for diff
  const prevPaletteRef  = useRef<PatternPalette[] | null>(null);
  const prevHiddenRef   = useRef<Set<number> | undefined>(undefined);
  const isSimStrokeRef   = useRef(false); // true during sim pencil stroke → suppress draw()
  const strokeCellsRef   = useRef<Set<string>>(new Set()); // accumulated cells (sim stroke)
  const lastStrokePosRef = useRef<[number, number] | null>(null);
  // Per-color pre-rendered cross canvases (shadow baked in) — rebuilt when palette or cs changes
  const colorCellCacheRef = useRef<HTMLCanvasElement[]>([]); // [colorIndex]
  const colorCacheKeyRef  = useRef<string>('');

  // Keep latest props in refs so draw() can always read current values
  const gridRef        = useRef(grid);
  const paletteRef     = useRef(palette);
  const modeRef        = useRef(mode);
  const cellSizeRef    = useRef(cellSize);
  const drawModeRef    = useRef(drawMode);
  const activeToolRef  = useRef(activeTool);
  const activeColRef   = useRef(activeColorIndex);
  const penWidthRef    = useRef(penWidth);
  const blinkColorRef  = useRef(blinkColorIndex);
  const blinkOnRef     = useRef(false);
  const selRef         = useRef<SelectionRect | null>(null);
  const marchingAntsRef = useRef(0);
  const lastCellRef    = useRef<[number, number] | null>(null); // last mouse cell during shape drag
  const hoverCellRef   = useRef<[number, number] | null>(null); // for eraser width > 1 preview
  const shiftRef       = useRef(false);
  const stitchedRef    = useRef(stitchedCells);
  const focusColorRef  = useRef(focusColorIndex);
  const markTargetRef  = useRef(false); // whether the in-progress mark drag is marking or unmarking
  const accentColorRef = useRef<string>('190,18,60');
  accentColorRef.current = computeContrastAccentColor(palette);
  gridRef.current      = grid;
  paletteRef.current   = palette;
  modeRef.current      = mode;
  cellSizeRef.current  = cellSize;
  drawModeRef.current  = drawMode;
  activeToolRef.current = activeTool;
  activeColRef.current = activeColorIndex;
  penWidthRef.current  = penWidth;
  blinkColorRef.current = blinkColorIndex;
  selRef.current        = selection;
  stitchedRef.current   = stitchedCells;
  focusColorRef.current = focusColorIndex;

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
    const dpr = window.devicePixelRatio || 1;
    const totalW = cols * cs + ML;
    const totalH = rows * cs + MT;
    canvas.width  = totalW * dpr;
    canvas.height = totalH * dpr;
    canvas.style.width  = `${totalW}px`;
    canvas.style.height = `${totalH}px`;
    ctx.scale(dpr, dpr);

    // Margin backgrounds (CSS pixel coordinates — ctx is DPR-scaled)
    ctx.fillStyle = '#ddd';
    ctx.fillRect(0, 0, ML, totalH);
    ctx.fillRect(0, 0, totalW, MT);

    if (vm === 'simulation') {
      // ── Simulation mode ────────────────────────────────────────
      {
        const w = cols * cs, h = rows * cs;

        // ── Aida layer: rebuild only when dimensions or cs change ──
        // (skipped until Canvas.png loads — draw() re-runs once it does, via aidaImgVersion)
        // Drawn cell-by-cell straight from the source image (not via a
        // separate rounded tile canvas + createPattern) — tiling through an
        // intermediate tile whose size must round to a whole pixel count
        // drifts out of sync with the per-cell grid over many repeats,
        // showing up as blocky misaligned squares at some zoom levels.
        if (aidaImgRef.current && (!aidaLayerRef.current || aidaLayerRef.current.width !== w * dpr || aidaLayerRef.current.height !== h * dpr)) {
          const al = document.createElement('canvas');
          al.width = w * dpr; al.height = h * dpr;
          const alCtx = al.getContext('2d')!;
          const ecs = cs * dpr;
          const img = aidaImgRef.current;
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              alCtx.drawImage(img, 0, 0, 16, 16, c * ecs, r * ecs, ecs, ecs);
            }
          }
          aidaLayerRef.current = al;
          prevGridRef.current = null; // force full cross-layer rebuild
        }

        // ── Cross layer: persistent canvas, updated incrementally ──
        if (!crossLayerRef.current || crossLayerRef.current.width !== w * dpr || crossLayerRef.current.height !== h * dpr) {
          const cl = document.createElement('canvas');
          cl.width = w * dpr; cl.height = h * dpr;
          crossLayerRef.current = cl;
          prevGridRef.current = null;
        }

        const clCtx = crossLayerRef.current.getContext('2d')!;
        const prevG = prevGridRef.current;
        const paletteChanged = prevPaletteRef.current !== pal;
        const hiddenChanged  = prevHiddenRef.current !== hiddenColors;
        prevPaletteRef.current = pal;
        prevHiddenRef.current  = hiddenColors;
        if (hiddenChanged) prevGridRef.current = null; // force full repaint when visibility changes

        const ecs = cs * dpr;
        const shadowBlur = Math.max(1, ecs * 0.15);
        const shadowOff  = Math.max(0.5, ecs * 0.08);

        // Per-color cache: pre-render each color's cross with shadow baked in
        // once. Hot loop then becomes a simple drawImage blit — no clip/shadow per cell.
        const cacheKey = `${ecs}|${pal.map(p => `${p.r},${p.g},${p.b}`).join('|')}`;
        if (colorCacheKeyRef.current !== cacheKey) {
          const simpleMask = buildTaperedSimpleCrossMask(ecs);
          colorCellCacheRef.current = pal.map(col => stampSimpleCross(ecs, col, simpleMask, shadowBlur, shadowOff));
          colorCacheKeyRef.current = cacheKey;
          prevGridRef.current = null; // force full repaint after cache rebuild
        }

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const ci = g[r][c];
            const isHidden = ci >= 0 && (hiddenColors?.has(ci) ?? false);
            const effectiveCi = isHidden ? -1 : ci;
            const prevRawCi = prevG ? (prevG[r]?.[c] ?? -1) : undefined;
            const prevEffective = prevRawCi === undefined ? undefined
              : (prevRawCi >= 0 && (hiddenColors?.has(prevRawCi) ?? false) ? -1 : prevRawCi);
            if (!paletteChanged && !hiddenChanged && prevEffective === effectiveCi) continue;

            clCtx.clearRect(c * ecs, r * ecs, ecs, ecs);
            const stamp = effectiveCi >= 0 ? colorCellCacheRef.current[effectiveCi] : undefined;
            if (stamp) {
              clCtx.drawImage(stamp, c * ecs, r * ecs);
            }
          }
        }

        prevGridRef.current = g;

        // Composite Aida + crosses onto main canvas (Aida layer is null for one
        // frame if Canvas.png hasn't finished loading yet — draw() re-runs once it has)
        if (aidaLayerRef.current) ctx.drawImage(aidaLayerRef.current, ML, MT, w, h);
        ctx.drawImage(crossLayerRef.current!, ML, MT, w, h);

        // Outline dots — 2026-08-10 (Olga's ask, after live comparison):
        // drawn only at intersections where NONE of the up to 4 surrounding
        // cells are stitched, i.e. on bare cloth just outside the design —
        // this reads as a highlight framing the shape rather than fabric
        // holes competing with the stitches themselves. Color comes from
        // computeContrastAccentColor() (complementary to the design's own
        // palette) instead of a fixed hue, since a fixed rose-red looked
        // right on pale designs (goose, ghost) but did nothing for a grey
        // or beige one.
        //
        // At low zoom the dots stay fully drawn (not faded to invisible —
        // Olga: "не точки должны гаснуть") but their color is blended
        // toward white as cs shrinks, so contrast against the cloth drops
        // instead of the dots vanishing. A first attempt faded opacity to
        // zero below ~6px, which she pointed out was the wrong fix — the
        // dots themselves shouldn't disappear, the hole *contrast* should.
        {
          const minContrast = 0.25;
          const contrastT = Math.max(0, Math.min(1, (cs - 6) / (14 - 6)));
          const contrastFactor = minContrast + (1 - minContrast) * contrastT;
          const [ar, ag, ab] = accentColorRef.current.split(',').map(Number);
          const br = Math.round(ar + (255 - ar) * (1 - contrastFactor));
          const bg = Math.round(ag + (255 - ag) * (1 - contrastFactor));
          const bb = Math.round(ab + (255 - ab) * (1 - contrastFactor));

          const isStitched = (rr: number, cc: number): boolean => {
            if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) return false;
            const ci = g[rr][cc];
            return ci >= 0 && !(hiddenColors?.has(ci) ?? false);
          };
          const hr = Math.max(0.5, cs * 0.11);
          ctx.fillStyle = `rgba(${br},${bg},${bb},0.75)`;
          ctx.beginPath();
          for (let r = 0; r <= rows; r++) {
            for (let c = 0; c <= cols; c++) {
              if (isStitched(r - 1, c - 1) || isStitched(r - 1, c) || isStitched(r, c - 1) || isStitched(r, c)) continue;
              const hx = c * cs + ML;
              const hy = r * cs + MT;
              ctx.moveTo(hx + hr, hy);
              ctx.arc(hx, hy, hr, 0, Math.PI * 2);
            }
          }
          ctx.fill();
        }
      }
    } else {
      // ── Color / Symbol / Both modes ─────────────────────────────
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const ci = g[r][c];
          const color = ci === -1 || (hiddenColors?.has(ci) ?? false) ? null : pal[ci];
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
            const symColor = vm === 'both' ? (br > 382 ? '#000' : '#fff') : '#000';
            ctx.font = `bold ${Math.max(cs - 4, 6)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            drawSymbol(ctx, color.symbol, px + cs / 2, py + cs / 2, cs, symColor);
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

    // Blink overlay — flash selected color's cells
    const bci = blinkColorRef.current;
    if (bci !== null && blinkOnRef.current) {
      // In simulation use lower alpha so threads stay partially visible through the flash
      ctx.globalAlpha = vm === 'simulation' ? 0.4 : 0.6;
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

    // Stitch-mode focus spotlight — dim every colored cell that isn't the
    // focused palette color, so it reads brighter by contrast.
    const focusIdx = focusColorRef.current;
    if (focusIdx != null) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#000';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const ci = g[r][c];
          if (ci >= 0 && ci !== focusIdx) {
            ctx.fillRect(c * cs + ML, r * cs + MT, cs, cs);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // Stitch-mode marked overlay — dim cells the user has marked as
    // physically stitched already, on top of any focus dimming.
    const stitched = stitchedRef.current;
    if (stitched && stitched.size > 0) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#fff';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (stitched.has(`${r},${c}`)) {
            ctx.fillRect(c * cs + ML, r * cs + MT, cs, cs);
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
      ctx.lineDashOffset = -marchingAntsRef.current;
      ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }

    // Pen / eraser width > 1: dashed border showing the affected area on hover
    const hc = hoverCellRef.current;
    if (hc && activeToolRef.current === 'pencil' && penWidthRef.current > 1) {
      const aci = activeColRef.current;
      const pw = penWidthRef.current;
      const halfLow = Math.floor((pw - 1) / 2);
      const cs = cellSizeRef.current;
      const x = (hc[1] - halfLow) * cs + ML;
      const y = (hc[0] - halfLow) * cs + MT;
      const sz = pw * cs;
      // Eraser: crimson border; pen: thread color border
      if (aci === -1) {
        ctx.strokeStyle = '#be123c';
      } else {
        const ac = pal[aci];
        ctx.strokeStyle = ac ? `rgb(${ac.r},${ac.g},${ac.b})` : '#334155';
      }
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x + 0.75, y + 0.75, sz - 1.5, sz - 1.5);
      ctx.setLineDash([]);
    }

    // Raw pixel-precise shape preview (during line/rect/ellipse drag) — follows the
    // actual cursor position instead of the grid-snapped staircase, snapping to
    // cells only once the mouse is released.
    const rawShape = rawShapeRef.current;
    if (rawShape) {
      const { x0, y0, x1, y1 } = rawShape;
      const dm = drawModeRef.current;
      ctx.save();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      if (dm === 'rect' || dm === 'rect-fill') {
        ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      } else if (dm === 'ellipse' || dm === 'ellipse-fill') {
        ctx.beginPath();
        ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.restore();
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

  useEffect(() => {
    const img = new Image();
    aidaImgLoadRef.current = new Promise((resolve) => {
      img.onload = () => { aidaImgRef.current = img; setAidaImgVersion(v => v + 1); resolve(img); };
      // On failure, resolve (not reject) with null so an awaiting capturePreview()
      // falls through to the flat-fill placeholder instead of hanging forever.
      img.onerror = () => resolve(null);
    });
    img.src = '/simulation/Canvas.png';
  }, []);

  useEffect(() => { draw(); }, [grid, palette, mode, cellSize, hiddenColors, stitchedCells, focusColorIndex, aidaImgVersion]);

  useEffect(() => {
    if (!selection) { marchingAntsRef.current = 0; return; }
    const id = setInterval(() => { marchingAntsRef.current = (marchingAntsRef.current + 1) % 7; draw(); }, 80);
    return () => clearInterval(id);
  }, [selection]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Live Shift key tracking — updates shape preview when Shift is pressed/released mid-drag
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Shift') return;
      shiftRef.current = e.type === 'keydown';
      const dm = drawModeRef.current;
      if (!drawing.current || !rawShapeRef.current || !lastPxRef.current) return;
      if (dm === 'point' || dm === 'line') return;
      const { x0, y0 } = rawShapeRef.current;
      const [rawPx, rawPy] = lastPxRef.current;
      let [x1, y1] = [rawPx, rawPy];
      if (shiftRef.current) [x1, y1] = constrainToSquarePx(x0, y0, rawPx, rawPy);
      rawShapeRef.current = { x0, y0, x1, y1 };
      draw();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Raw cursor position in canvas CSS-pixel coordinates (not snapped to a cell) —
  // used for the free-angle line preview during a 'line' tool drag.
  function pxAt(e: React.MouseEvent<HTMLCanvasElement>): [number, number] {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  function cellAt(e: React.MouseEvent<HTMLCanvasElement>): [number, number] | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cs = cellSizeRef.current;
    // Use CSS pixel coordinates — ML/MT/cs are all in CSS pixels
    const col = Math.floor(((e.clientX - rect.left) - ML) / cs);
    const row = Math.floor(((e.clientY - rect.top)  - MT) / cs);
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
      const existing = selRef.current;
      if (existing) {
        const rMin = Math.min(existing.r0, existing.r1), rMax = Math.max(existing.r0, existing.r1);
        const cMin = Math.min(existing.c0, existing.c1), cMax = Math.max(existing.c0, existing.c1);
        if (cell[0] < rMin || cell[0] > rMax || cell[1] < cMin || cell[1] > cMax) {
          selRef.current = null;
          draw();
          onSelectionChange?.(null);
          return;
        }
      }
      drawing.current = true;
      startCell.current = cell;
      const sel = { r0: cell[0], c0: cell[1], r1: cell[0], c1: cell[1] };
      selRef.current = sel;
      draw();
      onSelectionChange?.(sel);
      return;
    }
    if (activeTool === 'mark') {
      const g = gridRef.current;
      if (g[cell[0]][cell[1]] < 0) return; // empty cells aren't stitchable
      const key = `${cell[0]},${cell[1]}`;
      const willMark = !(stitchedRef.current?.has(key) ?? false);
      markTargetRef.current = willMark;
      drawing.current = true;
      onMarkCell?.(cell[0], cell[1], willMark);
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
      // Shape tool (line/rect/ellipse) — record start, show raw pixel-precise preview
      drawing.current = true;
      startCell.current = cell;
      const [px, py] = pxAt(e);
      rawShapeRef.current = { x0: px, y0: py, x1: px, y1: py };
      lastPxRef.current = [px, py];
      previewRef.current = [];
      draw();
    }
  }

  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    // Track hover cell for pen/eraser width-preview even when not drawing
    if (editable && activeTool === 'pencil' && penWidth > 1) {
      const cell = cellAt(e);
      const prev = hoverCellRef.current;
      if (cell && (prev?.[0] !== cell[0] || prev?.[1] !== cell[1])) {
        hoverCellRef.current = cell;
        draw();
      }
    } else if (hoverCellRef.current) {
      hoverCellRef.current = null;
      draw();
    }
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
    if (activeTool === 'mark') {
      const g = gridRef.current;
      if (g[cell[0]][cell[1]] < 0) return;
      onMarkCell?.(cell[0], cell[1], markTargetRef.current);
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
    } else if (startCell.current && rawShapeRef.current) {
      lastCellRef.current = cell;
      const [rawPx, rawPy] = pxAt(e);
      lastPxRef.current = [rawPx, rawPy];
      let [x1, y1] = [rawPx, rawPy];
      if (e.shiftKey && drawMode !== 'line') {
        [x1, y1] = constrainToSquarePx(rawShapeRef.current.x0, rawShapeRef.current.y0, rawPx, rawPy);
      }
      rawShapeRef.current = { ...rawShapeRef.current, x1, y1 };
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
    if (activeTool === 'mark') {
      onMarkStrokeEnd?.();
      return;
    }
    if (activeTool === 'pencil' && drawMode !== 'point' && startCell.current) {
      const cell = cellAt(e);
      const [r0, c0] = startCell.current;
      let [r1, c1]: [number, number] = cell ?? [r0, c0];
      if (e.shiftKey && drawMode !== 'line') [r1, c1] = constrainToSquare(r0, c0, r1, c1);
      const cells = expandCells(shapeCells(drawMode, r0, c0, r1, c1), penWidthRef.current);
      previewRef.current = [];
      rawShapeRef.current = null;
      lastPxRef.current = null;
      startCell.current = null;
      lastCellRef.current = null;
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
    if (hoverCellRef.current) { hoverCellRef.current = null; draw(); }
    if (!drawing.current) return;
    if (activeTool === 'select') {
      drawing.current = false;
      startCell.current = null;
      return;
    }
    if (activeTool === 'mark') {
      drawing.current = false;
      onMarkStrokeEnd?.();
      return;
    }
    // Cancel shape preview on leave; stroke continues if mouse re-enters
    if (drawMode !== 'point') {
      drawing.current = false;
      previewRef.current = [];
      rawShapeRef.current = null;
      lastPxRef.current = null;
      startCell.current = null;
      lastCellRef.current = null;
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

  useImperativeHandle(ref, () => ({
    async capturePreview(): Promise<string | null> {
      const g   = gridRef.current;
      const pal = paletteRef.current;
      if (!g.length || !pal.length) return null;

      // Wait out the (usually sub-frame) window before Canvas.png's onload
      // fires — without this, a capture requested immediately on mount would
      // silently fall back to the flat placeholder fill below instead of the
      // real texture, even though this is the "live capture" path that's
      // supposed to always be correct (see 2026-08-08 incident: this flat
      // fill leaking into a stored preview was indistinguishable from the
      // separate server-side-fallback bug it was originally written to guard).
      if (!aidaImgRef.current && aidaImgLoadRef.current) {
        await aidaImgLoadRef.current;
      }

      const rows = g.length, cols = g[0].length;
      const cs = Math.max(6, Math.min(20, Math.floor(1200 / Math.max(rows, cols))));
      const w = cols * cs, h = rows * cs;

      const offscreen = document.createElement('canvas');
      offscreen.width = w; offscreen.height = h;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return null;

      // Aida background — flat linen-color fill only survives as a last
      // resort now, for a genuine load failure (see onerror above), not the
      // ordinary timing race.
      if (aidaImgRef.current) {
        const img = aidaImgRef.current;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            ctx.drawImage(img, 0, 0, 16, 16, c * cs, r * cs, cs, cs);
          }
        }
      } else {
        ctx.fillStyle = '#EDE0C4';
        ctx.fillRect(0, 0, w, h);
      }

      // Per-color cross cache, same as the live canvas
      const shadowBlur = Math.max(1, cs * 0.15);
      const shadowOff  = Math.max(0.5, cs * 0.08);
      const simpleMask = buildTaperedSimpleCrossMask(cs);
      const colorCache = pal.map(col => stampSimpleCross(cs, col, simpleMask, shadowBlur, shadowOff));

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const ci = g[r][c];
          if (ci >= 0 && colorCache[ci]) ctx.drawImage(colorCache[ci], c * cs, r * cs);
        }
      }

      // Holes overlay — fabric-hole dots drawn only where actually stitched.
      // 2026-08-10: the live canvas draw loop above moved to a different
      // "outline dots outside the design, palette-contrast color" scheme
      // (Olga's ask); this export path was not part of that change and
      // still uses the original inside-stitching / fixed dark-brown look.
      const isStitchedForHole = (rr: number, cc: number): boolean =>
        rr >= 0 && rr < rows && cc >= 0 && cc < cols && g[rr][cc] >= 0;
      const hr = Math.max(0.5, cs * 0.11);
      ctx.fillStyle = 'rgba(40,25,8,0.70)';
      ctx.beginPath();
      for (let r = 0; r <= rows; r++) {
        for (let c = 0; c <= cols; c++) {
          if (!isStitchedForHole(r - 1, c - 1) && !isStitchedForHole(r - 1, c) && !isStitchedForHole(r, c - 1) && !isStitchedForHole(r, c)) continue;
          ctx.moveTo(c * cs + hr, r * cs);
          ctx.arc(c * cs, r * cs, hr, 0, Math.PI * 2);
        }
      }
      ctx.fill();

      return offscreen.toDataURL('image/jpeg', 0.88);
    },
  }));

  const isEraser = activeTool === 'pencil' && activeColorIndex === -1;
  const activeColor = palette[activeColorIndex ?? 0];
  const threadHex = activeColor
    ? `#${activeColor.r.toString(16).padStart(2,'0')}${activeColor.g.toString(16).padStart(2,'0')}${activeColor.b.toString(16).padStart(2,'0')}`
    : '#DC2626';
  const cursor = !editable ? 'default'
    : activeTool === 'erase-fill' ? ERASE_FILL_CURSOR
    : activeTool === 'fill' ? floodCursor(threadHex)
    : activeTool === 'select' ? 'crosshair'
    : isEraser ? ERASER_CURSOR
    : penCursor(threadHex);

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
});

export default PatternCanvas;
