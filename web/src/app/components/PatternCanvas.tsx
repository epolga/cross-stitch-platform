'use client';

import { useEffect, useRef } from 'react';
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

// Flood fill cursor — watering can with blue drops, hotspot at rose head
const FLOOD_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 28 28">' +
  '<path d="M5 3 Q8 0 11 3" fill="none" stroke="#334155" stroke-width="2" stroke-linecap="round"/>' +
  '<rect x="2" y="3" width="12" height="11" rx="3" fill="#475569" stroke="#cbd5e1" stroke-width="1.2"/>' +
  '<path d="M14 10 Q20 10 22 15" stroke="#334155" stroke-width="2.5" stroke-linecap="round" fill="none"/>' +
  '<ellipse cx="22" cy="16" rx="3" ry="2" fill="#94a3b8" stroke="#cbd5e1" stroke-width="1"/>' +
  '<line x1="20" y1="19" x2="19" y2="23" stroke="#60a5fa" stroke-width="1.5" stroke-linecap="round"/>' +
  '<line x1="22" y1="19" x2="22" y2="24" stroke="#60a5fa" stroke-width="1.5" stroke-linecap="round"/>' +
  '<line x1="24" y1="19" x2="25" y2="23" stroke="#60a5fa" stroke-width="1.5" stroke-linecap="round"/>' +
  '</svg>'
)}") 25 18, cell`;

// Erase-fill cursor — outlined watering can (no fill) with grey drops
const ERASE_FILL_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 28 28">' +
  '<path d="M5 3 Q8 0 11 3" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round"/>' +
  '<rect x="2" y="3" width="12" height="11" rx="3" fill="none" stroke="#64748b" stroke-width="1.5"/>' +
  '<path d="M14 10 Q20 10 22 15" stroke="#64748b" stroke-width="2" stroke-linecap="round" fill="none"/>' +
  '<ellipse cx="22" cy="16" rx="3" ry="2" fill="none" stroke="#64748b" stroke-width="1.5"/>' +
  '<line x1="20" y1="19" x2="19" y2="23" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round"/>' +
  '<line x1="22" y1="19" x2="22" y2="24" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round"/>' +
  '<line x1="24" y1="19" x2="25" y2="23" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round"/>' +
  '</svg>'
)}") 25 18, cell`;
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
  activeTool?: 'pencil' | 'fill' | 'erase-fill' | 'select';
  drawMode?: DrawMode;
  activeColorIndex?: number;
  penWidth?: number;
  blinkColorIndex?: number | null;
  hiddenColors?: Set<number>;
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

// ── Cross stitch mask — generated at exact cell size so lines hit the corner holes precisely ──
function buildCrossMask(ecs: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = ecs; c.height = ecs;
  const ctx = c.getContext('2d')!;
  const lw = Math.max(2.5, ecs * 0.32);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  // Bottom stitch first (/ diagonal), top stitch on top (\ diagonal)
  ctx.beginPath(); ctx.moveTo(0, ecs); ctx.lineTo(ecs, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0);   ctx.lineTo(ecs, ecs); ctx.stroke();
  return c;
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

  return c;
}

// ── Component ────────────────────────────────────────────────────

export default function PatternCanvas({
  grid, palette, mode, cellSize = 12,
  editable, activeTool, drawMode = 'point',
  activeColorIndex = 0, penWidth = 1, blinkColorIndex = null, hiddenColors, selection = null,
  onPaint, onFill, onStrokeStart, onStrokeEnd, onShapePaint, onRightClick, onSelectionChange,
}: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const drawing     = useRef(false);
  const startCell   = useRef<[number, number] | null>(null);
  const previewRef  = useRef<[number, number][]>([]);

  // Simulation mode assets
  const aidaCellCache   = useRef<{ cs: number; dpr: number; canvas: HTMLCanvasElement } | null>(null);
  const aidaLayerRef    = useRef<HTMLCanvasElement | null>(null); // persistent Aida background
  const crossLayerRef   = useRef<HTMLCanvasElement | null>(null); // persistent cross layer (incremental)
  const prevGridRef     = useRef<number[][] | null>(null);        // last rendered grid for diff
  const prevPaletteRef  = useRef<PatternPalette[] | null>(null);
  const prevHiddenRef   = useRef<Set<number> | undefined>(undefined);
  const isSimStrokeRef   = useRef(false); // true during sim pencil stroke → suppress draw()
  const strokeCellsRef   = useRef<Set<string>>(new Set()); // accumulated cells (sim stroke)
  const lastStrokePosRef = useRef<[number, number] | null>(null);
  // Per-color pre-rendered cross canvases (shadow baked in) — rebuilt when palette or cs changes
  const colorCellCacheRef = useRef<HTMLCanvasElement[]>([]);
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
  const lastCellRef    = useRef<[number, number] | null>(null); // last mouse cell during shape drag
  const hoverCellRef   = useRef<[number, number] | null>(null); // for eraser width > 1 preview
  const shiftRef       = useRef(false);
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
        if (!aidaLayerRef.current || aidaLayerRef.current.width !== w * dpr || aidaLayerRef.current.height !== h * dpr) {
          if (!aidaCellCache.current || aidaCellCache.current.cs !== cs || aidaCellCache.current.dpr !== dpr)
            aidaCellCache.current = { cs, dpr, canvas: buildAidaCell(cs * dpr) };
          const al = document.createElement('canvas');
          al.width = w * dpr; al.height = h * dpr;
          const alCtx = al.getContext('2d')!;
          const pat = alCtx.createPattern(aidaCellCache.current.canvas, 'repeat');
          if (pat) { alCtx.fillStyle = pat; alCtx.fillRect(0, 0, w * dpr, h * dpr); }
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

        // Per-color cache: pre-render each color's cross with shadow baked in once.
        // Hot loop then becomes a simple drawImage blit — no clip/shadow per cell.
        const cacheKey = `${ecs}|${pal.map(p => `${p.r},${p.g},${p.b}`).join('|')}`;
        if (colorCacheKeyRef.current !== cacheKey) {
          // Build cross mask at this exact cell size — corner-to-corner so it aligns with Aida holes
          const crossMask = buildCrossMask(ecs);
          colorCellCacheRef.current = pal.map(col => {
            // colored cross masked to cross shape
            const tmp = document.createElement('canvas');
            tmp.width = ecs; tmp.height = ecs;
            const tc = tmp.getContext('2d')!;
            tc.fillStyle = `rgb(${col.r},${col.g},${col.b})`;
            tc.fillRect(0, 0, ecs, ecs);
            tc.globalCompositeOperation = 'destination-in';
            tc.drawImage(crossMask, 0, 0); // 1:1 — already ecs×ecs, no scaling
            // shadow baked and clipped to cell bounds
            const out = document.createElement('canvas');
            out.width = ecs; out.height = ecs;
            const oc = out.getContext('2d')!;
            oc.save();
            oc.beginPath(); oc.rect(0, 0, ecs, ecs); oc.clip();
            oc.shadowColor = 'rgba(0,0,0,0.45)';
            oc.shadowBlur = shadowBlur;
            oc.shadowOffsetX = shadowOff;
            oc.shadowOffsetY = shadowOff;
            oc.drawImage(tmp, 0, 0);
            oc.restore();
            return out;
          });
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
            if (effectiveCi >= 0 && colorCellCacheRef.current[effectiveCi]) {
              clCtx.drawImage(colorCellCacheRef.current[effectiveCi], c * ecs, r * ecs);
            }
          }
        }

        prevGridRef.current = g;

        // Composite Aida + crosses onto main canvas
        ctx.drawImage(aidaLayerRef.current!, ML, MT, w, h);
        ctx.drawImage(crossLayerRef.current!, ML, MT, w, h);

        // Holes overlay — always on top of stitches so thread ends visibly enter the cloth
        {
          const hr = Math.max(0.5, cs * 0.11);
          ctx.fillStyle = 'rgba(40,25,8,0.70)';
          ctx.beginPath();
          for (let r = 0; r <= rows; r++) {
            for (let c = 0; c <= cols; c++) {
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

  useEffect(() => { draw(); }, [grid, palette, mode, cellSize, hiddenColors]);

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
      if (!drawing.current || !startCell.current || !lastCellRef.current) return;
      if (dm === 'point' || dm === 'line') return;
      const [r0, c0] = startCell.current;
      let [r1, c1] = lastCellRef.current;
      if (shiftRef.current) [r1, c1] = constrainToSquare(r0, c0, r1, c1);
      previewRef.current = expandCells(shapeCells(dm, r0, c0, r1, c1), penWidthRef.current);
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
      lastCellRef.current = cell;
      const [r0, c0] = startCell.current;
      let [r1, c1]: [number, number] = [cell[0], cell[1]];
      if (e.shiftKey && drawMode !== 'line') [r1, c1] = constrainToSquare(r0, c0, r1, c1);
      previewRef.current = expandCells(shapeCells(drawMode, r0, c0, r1, c1), penWidthRef.current);
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
      let [r1, c1]: [number, number] = cell ?? [r0, c0];
      if (e.shiftKey && drawMode !== 'line') [r1, c1] = constrainToSquare(r0, c0, r1, c1);
      const cells = expandCells(shapeCells(drawMode, r0, c0, r1, c1), penWidthRef.current);
      previewRef.current = [];
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
    // Cancel shape preview on leave; stroke continues if mouse re-enters
    if (drawMode !== 'point') {
      drawing.current = false;
      previewRef.current = [];
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

  const isEraser = activeTool === 'pencil' && activeColorIndex === -1;
  const activeColor = palette[activeColorIndex ?? 0];
  const threadHex = activeColor
    ? `#${activeColor.r.toString(16).padStart(2,'0')}${activeColor.g.toString(16).padStart(2,'0')}${activeColor.b.toString(16).padStart(2,'0')}`
    : '#DC2626';
  const cursor = !editable ? 'default'
    : activeTool === 'erase-fill' ? ERASE_FILL_CURSOR
    : activeTool === 'fill' ? FLOOD_CURSOR
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
}
