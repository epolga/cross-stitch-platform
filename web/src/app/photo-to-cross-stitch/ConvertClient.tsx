'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import PatternCanvas, { type DrawMode, type SelectionRect } from '@/app/components/PatternCanvas';
import PaletteBar from '@/app/components/PaletteBar';
import MenuBar, { type MenuDef } from '@/app/components/MenuBar';
import ResizeDialog, { type ResizeMode, type ResizeAnchor } from '@/app/components/ResizeDialog';
import HelpDialog, { type HelpTab } from '@/app/components/HelpDialog';
import ImportFromPhotoDialog from '@/app/components/ImportFromPhotoDialog';
import SymbolPickerDialog from '@/app/components/SymbolPickerDialog';
import ColorPickerDialog from '@/app/components/ColorPickerDialog';
import PickPaletteEntryDialog from '@/app/components/PickPaletteEntryDialog';
import type { ConvertedPattern, PatternPalette, DmcColor } from '@/lib/pattern-converter';
import { SYMBOLS } from '@/lib/symbols';
import dmcColors from '@/data/dmc-colors.json';

const DEFAULT_PALETTE_NUMBERS = [
  'blanc', '310', '3371', '321', '666', '3716', '208',
  '701', '996', '825', '725', '743', '433', '938', '945', 'ecru',
];
const DEFAULT_PALETTE: PatternPalette[] = (() => {
  const dmc = dmcColors as { number: string; name: string; r: number; g: number; b: number }[];
  return DEFAULT_PALETTE_NUMBERS.flatMap((num, i) => {
    const c = dmc.find(d => d.number === num);
    return c ? [{ ...c, symbol: SYMBOLS[i] ?? SYMBOLS[0], stitchCount: 0 }] : [];
  });
})();

type Tool = 'pencil' | 'eraser' | 'fill' | 'select';
type Snapshot = { grid: number[][], palette: PatternPalette[] };
type FillMode = 'flood' | 'erase';
type ViewMode = 'color' | 'symbol' | 'both' | 'simulation';

const VIEW_MODES: { id: ViewMode; label: string; title: string }[] = [
  { id: 'simulation', label: 'Preview', title: 'Preview — approximates how the finished embroidery will look when stitched' },
  { id: 'color',      label: 'Color',   title: 'Color view — shows stitches as colored squares' },
  { id: 'symbol',     label: 'Symbol',  title: 'Symbol view — shows stitches as chart symbols (same as in the printed PDF)' },
  { id: 'both',       label: 'Both',    title: 'Color + Symbol — see both at once, useful when editing' },
];

// Ensure every colored cell has at least one 8-neighbor of the same color.
// Isolated cells are replaced with the most common adjacent color.
// Iterates until stable (max 8 passes).
function enforceNeighborConnectivity(grid: number[][]): number[][] {
  const rows = grid.length;
  if (!rows) return grid;
  const cols = grid[0].length;
  const DIRS: [number, number][] = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const g = grid.map(r => [...r]);

  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ci = g[r][c];
        if (ci < 0) continue;
        const hasNeighbor = DIRS.some(([dr, dc]) => {
          const nr = r + dr, nc = c + dc;
          return nr >= 0 && nr < rows && nc >= 0 && nc < cols && g[nr][nc] === ci;
        });
        if (hasNeighbor) continue;
        // Isolated — replace with most common 8-neighbor color
        const freq: Record<number, number> = {};
        for (const [dr, dc] of DIRS) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && g[nr][nc] >= 0)
            freq[g[nr][nc]] = (freq[g[nr][nc]] ?? 0) + 1;
        }
        const best = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
        if (best) { g[r][c] = Number(best[0]); changed = true; }
      }
    }
    if (!changed) break;
  }
  return g;
}

// Trim grid to content bounding box + exactly 1 empty border on each side.
function sizeToDesign(grid: number[][]): number[][] | null {
  const rows = grid.length;
  if (!rows) return null;
  const cols = grid[0].length;
  let minRow = rows, maxRow = -1, minCol = cols, maxCol = -1;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (grid[r][c] >= 0) {
        if (r < minRow) minRow = r;
        if (r > maxRow) maxRow = r;
        if (c < minCol) minCol = c;
        if (c > maxCol) maxCol = c;
      }
  if (maxRow === -1) return null;
  const rStart = minRow - 1; // may be negative → empty row added via -1 fill
  const cStart = minCol - 1;
  const newRows = maxRow - minRow + 3; // content + 2 margins
  const newCols = maxCol - minCol + 3;
  return Array.from({ length: newRows }, (_, dr) =>
    Array.from({ length: newCols }, (_, dc) => {
      const or = rStart + dr, oc = cStart + dc;
      return (or >= 0 && or < rows && oc >= 0 && oc < cols) ? grid[or][oc] : -1;
    })
  );
}

function floodFill(grid: number[][], row: number, col: number, newColor: number): number[][] {
  const rows = grid.length, cols = grid[0].length;
  const target = grid[row][col];
  if (target === newColor) return grid;
  const next = grid.map(r => [...r]);
  const stack: [number, number][] = [[row, col]];
  while (stack.length) {
    const [r, c] = stack.pop()!;
    if (r < 0 || r >= rows || c < 0 || c >= cols || next[r][c] !== target) continue;
    next[r][c] = newColor;
    stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
  }
  return next;
}

export default function ConvertPage() {
  // Palette + blank canvas
  const [palette, setPalette] = useState<PatternPalette[]>(DEFAULT_PALETTE);
  const paletteRef = useRef<PatternPalette[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Pattern + editor state
  const blankGrid = (): number[][] => Array.from({ length: 80 }, () => Array(80).fill(-1));
  const [grid, setGrid] = useState<number[][]>(blankGrid);
  const gridRef = useRef<number[][]>(grid);
  const hasDesign = useMemo(() => grid.some(row => row.some(c => c !== -1)), [grid]);
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [redoStack, setRedoStack] = useState<Snapshot[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('simulation');
  const [activeTool, setActiveTool] = useState<Tool>('pencil');
  const [drawMode, setDrawMode] = useState<DrawMode>('point');
  const [penWidth, setPenWidth] = useState(1);
  const [fillMode, setFillMode] = useState<FillMode>('flood');
  const [showPencilMenu, setShowPencilMenu] = useState(false);
  const [showFillMenu, setShowFillMenu] = useState(false);
  const pencilBtnRef = useRef<HTMLDivElement>(null);
  const fillBtnRef = useRef<HTMLDivElement>(null);
  const [selectedColor, setSelectedColor] = useState(0);
  const strokeSnapshot = useRef<number[][] | null>(null);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [clipboard, setClipboard] = useState<number[][] | null>(null);

  useEffect(() => {
    if (!showPencilMenu) return;
    function onOut(e: MouseEvent) {
      if (!pencilBtnRef.current?.contains(e.target as Node)) setShowPencilMenu(false);
    }
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, [showPencilMenu]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
      if (key === 'c') { e.preventDefault(); handleCopy(); }
      if (key === 'x') { e.preventDefault(); handleCut(); }
      if (key === 'v') { e.preventDefault(); handlePaste(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [undoStack, redoStack, selection, clipboard]);

  useEffect(() => {
    if (!showFillMenu) return;
    function onClickOutside(e: MouseEvent) {
      if (!fillBtnRef.current?.contains(e.target as Node)) setShowFillMenu(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showFillMenu]);
  const [showResizeDialog, setShowResizeDialog] = useState(false);
  const [helpTab, setHelpTab] = useState<HelpTab | null>(null);
  const [hiddenColors, setHiddenColors] = useState<Set<number>>(new Set());
  const [blinkSwatch, setBlinkSwatch] = useState<number | null>(null);
  const [blinkCells, setBlinkCells] = useState<number | null>(null);
  const [symbolPickerIndex, setSymbolPickerIndex] = useState<number | null>(null);
  const [colorPickerIndex, setColorPickerIndex] = useState<number | null>(null);
  const [addColorPickerOpen, setAddColorPickerOpen] = useState(false);
  const [moveToIndex, setMoveToIndex] = useState<number | null>(null);
  const [mergeIntoIndex, setMergeIntoIndex] = useState<number | null>(null);
  const blinkSwatchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blinkCellsTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateGrid(g: number[][]) {
    gridRef.current = g;
    setGrid(g);
  }

  function updatePalette(p: PatternPalette[]) {
    paletteRef.current = p;
    setPalette(p);
  }

  function snap(): Snapshot { return { grid: gridRef.current, palette: paletteRef.current }; }

  // Import from photo (called by ImportFromPhotoDialog on success)
  function handleImport(data: ConvertedPattern, paddedGrid: number[][]) {
    updatePalette(data.palette);
    updateGrid(enforceNeighborConnectivity(paddedGrid));
    setUndoStack([]);
    setRedoStack([]);
    setSelectedColor(0);
    setSelection(null);
    setHiddenColors(new Set());
    setShowImportDialog(false);
  }

  // Download PDF from current (edited) grid
  async function downloadPdf() {
    setDownloading(true);
    try {
      const resp = await fetch('/api/convert/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grid: gridRef.current, palette }),
      });
      if (!resp.ok) throw new Error('PDF generation failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cross-stitch-pattern.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }

  // Editor: stroke (pencil drag)
  function handleStrokeStart() {
    strokeSnapshot.current = gridRef.current;
  }

  function handlePaint(row: number, col: number) {
    const g = gridRef.current;
    const paintColor = activeTool === 'eraser' ? -1 : selectedColor;
    if (!g.length || g[row][col] === paintColor) return;
    const newRow = [...g[row]];
    newRow[col] = paintColor;
    const newGrid = [...g];
    newGrid[row] = newRow;
    updateGrid(newGrid);
  }

  function handleStrokeEnd() {
    const before = strokeSnapshot.current;
    strokeSnapshot.current = null;
    if (!before || before === gridRef.current) return; // nothing changed
    setUndoStack(s => [...s.slice(-49), { grid: before, palette: paletteRef.current }]);
    setRedoStack([]);
  }

  // Editor: shape paint (line / rect / ellipse) — one undo entry
  function handleShapePaint(cells: [number, number][]) {
    const g = gridRef.current;
    if (!g.length || !cells.length) return;
    const snapshot = g;
    const paintColor = activeTool === 'eraser' ? -1 : selectedColor;
    const newGrid = g.map(r => [...r]);
    for (const [r, c] of cells) {
      if (r >= 0 && r < newGrid.length && c >= 0 && c < newGrid[0].length)
        newGrid[r][c] = paintColor;
    }
    setUndoStack(s => [...s.slice(-49), { grid: snapshot, palette: paletteRef.current }]);
    setRedoStack([]);
    updateGrid(newGrid);
  }

  // Editor: fill bucket
  function handleFill(row: number, col: number) {
    const g = gridRef.current;
    if (!g.length) return;
    const next = floodFill(g, row, col, selectedColor);
    if (next === g) return;
    setUndoStack(s => [...s.slice(-49), { grid: g, palette: paletteRef.current }]);
    setRedoStack([]);
    updateGrid(next);
  }

  // Editor: erase fill (flood fill with blank / -1)
  function handleEraseFill(row: number, col: number) {
    const g = gridRef.current;
    if (!g.length || g[row][col] === -1) return;
    const next = floodFill(g, row, col, -1);
    if (next === g) return;
    setUndoStack(s => [...s.slice(-49), { grid: g, palette: paletteRef.current }]);
    setRedoStack([]);
    updateGrid(next);
  }

  // Clear selection when switching away from select tool
  useEffect(() => {
    if (activeTool !== 'select') setSelection(null);
  }, [activeTool]);

  function selectionBounds() {
    if (!selection) return null;
    return {
      rMin: Math.min(selection.r0, selection.r1), rMax: Math.max(selection.r0, selection.r1),
      cMin: Math.min(selection.c0, selection.c1), cMax: Math.max(selection.c0, selection.c1),
    };
  }

  function handleCopy() {
    const b = selectionBounds();
    if (!b) return;
    const g = gridRef.current;
    const copied: number[][] = [];
    for (let r = b.rMin; r <= b.rMax; r++) {
      const row: number[] = [];
      for (let c = b.cMin; c <= b.cMax; c++) row.push(g[r]?.[c] ?? -1);
      copied.push(row);
    }
    setClipboard(copied);
  }

  function handleCut() {
    const b = selectionBounds();
    if (!b) return;
    const g = gridRef.current;
    if (!g.length) return;
    // Copy first
    const copied: number[][] = [];
    for (let r = b.rMin; r <= b.rMax; r++) {
      const row: number[] = [];
      for (let c = b.cMin; c <= b.cMax; c++) row.push(g[r]?.[c] ?? -1);
      copied.push(row);
    }
    setClipboard(copied);
    // Then erase
    const newGrid = g.map(r => [...r]);
    for (let r = b.rMin; r <= b.rMax; r++)
      for (let c = b.cMin; c <= b.cMax; c++)
        newGrid[r][c] = -1;
    setUndoStack(s => [...s.slice(-49), { grid: g, palette: paletteRef.current }]);
    setRedoStack([]);
    updateGrid(newGrid);
    setSelection(null);
  }

  function handlePaste() {
    if (!clipboard || !clipboard.length) return;
    const g = gridRef.current;
    if (!g.length) return;
    const rows = g.length, cols = g[0].length;
    const b = selectionBounds();
    const rStart = b ? b.rMin : 0;
    const cStart = b ? b.cMin : 0;
    const ph = clipboard.length, pw = clipboard[0].length;
    const newGrid = g.map(r => [...r]);
    for (let dr = 0; dr < ph; dr++)
      for (let dc = 0; dc < pw; dc++) {
        const r = rStart + dr, c = cStart + dc;
        if (r < rows && c < cols) newGrid[r][c] = clipboard[dr][dc];
      }
    setUndoStack(s => [...s.slice(-49), { grid: g, palette: paletteRef.current }]);
    setRedoStack([]);
    updateGrid(newGrid);
    // Move selection to cover the pasted area
    setSelection({
      r0: rStart, c0: cStart,
      r1: Math.min(rStart + ph - 1, rows - 1),
      c1: Math.min(cStart + pw - 1, cols - 1),
    });
  }

  function handleCrop() {
    const b = selectionBounds();
    if (!b) return;
    const g = gridRef.current;
    if (!g.length) return;
    const newGrid: number[][] = [];
    for (let r = b.rMin; r <= b.rMax; r++) {
      const row: number[] = [];
      for (let c = b.cMin; c <= b.cMax; c++) row.push(g[r]?.[c] ?? -1);
      newGrid.push(row);
    }
    setUndoStack(s => [...s.slice(-49), { grid: g, palette: paletteRef.current }]);
    setRedoStack([]);
    updateGrid(newGrid);
    setSelection(null);
  }

  function handleFlipH() {
    const g = gridRef.current;
    if (!g.length) return;
    const b = selectionBounds();
    const newGrid = g.map(r => [...r]);
    if (b) {
      for (let r = b.rMin; r <= b.rMax; r++) {
        const seg = newGrid[r].slice(b.cMin, b.cMax + 1).reverse();
        for (let i = 0; i < seg.length; i++) newGrid[r][b.cMin + i] = seg[i];
      }
    } else {
      for (const row of newGrid) row.reverse();
    }
    setUndoStack(s => [...s.slice(-49), { grid: g, palette: paletteRef.current }]);
    setRedoStack([]);
    updateGrid(newGrid);
  }

  function handleFlipV() {
    const g = gridRef.current;
    if (!g.length) return;
    const b = selectionBounds();
    const newGrid = g.map(r => [...r]);
    if (b) {
      const half = Math.floor((b.rMax - b.rMin + 1) / 2);
      for (let i = 0; i < half; i++) {
        const r1 = b.rMin + i, r2 = b.rMax - i;
        for (let c = b.cMin; c <= b.cMax; c++)
          [newGrid[r1][c], newGrid[r2][c]] = [newGrid[r2][c], newGrid[r1][c]];
      }
    } else {
      newGrid.reverse();
    }
    setUndoStack(s => [...s.slice(-49), { grid: g, palette: paletteRef.current }]);
    setRedoStack([]);
    updateGrid(newGrid);
  }

  // ── Mirror (always whole grid — doubles one dimension) ──────────
  function handleMirrorRight() {
    const g = gridRef.current;
    if (!g.length) return;
    const newGrid = g.map(r => [...r, ...[...r].reverse()]);
    setUndoStack(s => [...s.slice(-49), { grid: g, palette: paletteRef.current }]); setRedoStack([]);
    updateGrid(newGrid);
  }
  function handleMirrorLeft() {
    const g = gridRef.current;
    if (!g.length) return;
    const newGrid = g.map(r => [[...r].reverse(), ...r].flat() as number[]);
    setUndoStack(s => [...s.slice(-49), { grid: g, palette: paletteRef.current }]); setRedoStack([]);
    updateGrid(newGrid);
  }
  function handleMirrorBottom() {
    const g = gridRef.current;
    if (!g.length) return;
    const flipped = [...g].reverse().map(r => [...r]);
    setUndoStack(s => [...s.slice(-49), { grid: g, palette: paletteRef.current }]); setRedoStack([]);
    updateGrid([...g.map(r => [...r]), ...flipped]);
  }
  function handleMirrorTop() {
    const g = gridRef.current;
    if (!g.length) return;
    const flipped = [...g].reverse().map(r => [...r]);
    setUndoStack(s => [...s.slice(-49), { grid: g, palette: paletteRef.current }]); setRedoStack([]);
    updateGrid([...flipped, ...g.map(r => [...r])]);
  }

  // ── Rotate helpers ───────────────────────────────────────────────
  function rot90CW(src: number[][]): number[][] {
    const rows = src.length, cols = src[0].length;
    const out: number[][] = Array.from({length: cols}, () => Array(rows).fill(-1));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        out[c][rows - 1 - r] = src[r][c];
    return out;
  }
  function rot90CCW(src: number[][]): number[][] {
    const rows = src.length, cols = src[0].length;
    const out: number[][] = Array.from({length: cols}, () => Array(rows).fill(-1));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        out[cols - 1 - c][r] = src[r][c];
    return out;
  }
  function rot180(src: number[][]): number[][] {
    return [...src].reverse().map(r => [...r].reverse());
  }

  function applyRotation(fn: (s: number[][]) => number[][]) {
    const g = gridRef.current;
    if (!g.length) return;
    const b = selectionBounds();
    if (!b) {
      setUndoStack(s => [...s.slice(-49), { grid: g, palette: paletteRef.current }]); setRedoStack([]);
      updateGrid(fn(g));
      return;
    }
    // Extract selection, rotate it, clear old area, paste rotated at (rMin, cMin)
    const sub: number[][] = [];
    for (let r = b.rMin; r <= b.rMax; r++)
      sub.push(g[r].slice(b.cMin, b.cMax + 1));
    const rotated = fn(sub);
    const newGrid = g.map(r => [...r]);
    // Clear old selection area
    for (let r = b.rMin; r <= b.rMax; r++)
      for (let c = b.cMin; c <= b.cMax; c++)
        newGrid[r][c] = -1;
    // Paste rotated (clip to grid bounds)
    const rows = g.length, cols = g[0].length;
    for (let dr = 0; dr < rotated.length; dr++)
      for (let dc = 0; dc < rotated[0].length; dc++) {
        const r = b.rMin + dr, c = b.cMin + dc;
        if (r < rows && c < cols) newGrid[r][c] = rotated[dr][dc];
      }
    setUndoStack(s => [...s.slice(-49), { grid: g, palette: paletteRef.current }]); setRedoStack([]);
    updateGrid(newGrid);
    setSelection({ r0: b.rMin, c0: b.cMin,
      r1: Math.min(b.rMin + rotated.length - 1, rows - 1),
      c1: Math.min(b.cMin + rotated[0].length - 1, cols - 1) });
  }

  // Right-click: cell → blink its swatch; swatch → blink its cells on canvas
  function handleRightClickCell(row: number, col: number) {
    const ci = gridRef.current[row]?.[col];
    if (ci == null || ci < 0) return;
    setSelectedColor(ci);
    if (blinkSwatchTimer.current) clearTimeout(blinkSwatchTimer.current);
    setBlinkSwatch(ci);
    blinkSwatchTimer.current = setTimeout(() => setBlinkSwatch(null), 1680);
  }

  function handleRightClickSwatch(index: number) {
    if (blinkCellsTimer.current) clearTimeout(blinkCellsTimer.current);
    setBlinkCells(index);
    blinkCellsTimer.current = setTimeout(() => setBlinkCells(null), 1680);
  }

  function handleSymbolPick(symbol: string) {
    const idx = symbolPickerIndex;
    if (idx === null) return;
    const alreadyUsed = paletteRef.current.some((p, i) => i !== idx && p.symbol === symbol);
    if (alreadyUsed) return;
    setUndoStack(s => [...s.slice(-49), snap()]);
    setRedoStack([]);
    updatePalette(paletteRef.current.map((p, i) => i === idx ? { ...p, symbol } : p));
    setSymbolPickerIndex(null);
  }

  function handleChangeColor(dmcColor: DmcColor) {
    const idx = colorPickerIndex;
    if (idx === null) return;
    setUndoStack(s => [...s.slice(-49), snap()]);
    setRedoStack([]);
    updatePalette(paletteRef.current.map((p, i) =>
      i === idx ? { ...p, ...dmcColor } : p
    ));
    setColorPickerIndex(null);
  }

  function handleAddColor(dmcColor: DmcColor) {
    const pal = paletteRef.current;
    const usedSymbols = new Set(pal.map(p => p.symbol));
    const symbol = SYMBOLS.find(s => !usedSymbols.has(s)) ?? '?';
    const newEntry: PatternPalette = { ...dmcColor, symbol, stitchCount: 0 };
    setUndoStack(s => [...s.slice(-49), snap()]);
    setRedoStack([]);
    updatePalette([...pal, newEntry]);
    setSelectedColor(pal.length);
    setAddColorPickerOpen(false);
  }

  function handleMoveTo(targetOriginalIdx: number) {
    const sourceIdx = moveToIndex;
    if (sourceIdx === null) return;
    const pal = paletteRef.current;
    const reduced = pal.map((_, i) => i).filter(i => i !== sourceIdx);
    // Find insertion position in reduced array: insert BEFORE targetOriginalIdx
    const insertionPos = reduced.indexOf(targetOriginalIdx);
    if (insertionPos === -1) return;
    applyMove(sourceIdx, insertionPos, pal);
    setMoveToIndex(null);
  }

  function handleMoveToEnd() {
    const sourceIdx = moveToIndex;
    if (sourceIdx === null) return;
    const pal = paletteRef.current;
    applyMove(sourceIdx, pal.length - 1, pal);
    setMoveToIndex(null);
  }

  function applyMove(sourceIdx: number, insertionPos: number, pal: PatternPalette[]) {
    // Build permutation: reduce array (remove source), then insert source at insertionPos
    const reduced = pal.map((_, i) => i).filter(i => i !== sourceIdx);
    const perm = [
      ...reduced.slice(0, insertionPos),
      sourceIdx,
      ...reduced.slice(insertionPos),
    ];
    // perm[newIdx] = oldIdx → build oldIdx → newIdx map
    const oldToNew = new Array(pal.length);
    perm.forEach((oldIdx, newIdx) => { oldToNew[oldIdx] = newIdx; });

    const newPal = perm.map(oldIdx => pal[oldIdx]);
    const newGrid = gridRef.current.map(row =>
      row.map(ci => (ci < 0 ? ci : oldToNew[ci]))
    );

    setUndoStack(s => [...s.slice(-49), snap()]);
    setRedoStack([]);
    updatePalette(newPal);
    updateGrid(newGrid);
    setSelectedColor(c => oldToNew[c] ?? 0);
    setHiddenColors(prev => {
      const next = new Set<number>();
      prev.forEach(ci => { if (oldToNew[ci] != null) next.add(oldToNew[ci]); });
      return next;
    });
  }

  function handleMergeInto(targetIdx: number) {
    const sourceIdx = mergeIntoIndex;
    if (sourceIdx === null || targetIdx === sourceIdx) return;
    const pal = paletteRef.current;
    const g = gridRef.current;

    // Step 1: remap source cells to target
    const step1 = g.map(row => row.map(ci => (ci === sourceIdx ? targetIdx : ci)));

    // Step 2: remove source from palette; compact grid indices
    const newPal = pal.filter((_, i) => i !== sourceIdx);
    const finalGrid = step1.map(row =>
      row.map(ci => {
        if (ci < 0) return ci;
        if (ci > sourceIdx) return ci - 1;
        return ci;
      })
    );

    // Recount stitches
    const counts = new Array(newPal.length).fill(0);
    for (const row of finalGrid) for (const ci of row) if (ci >= 0) counts[ci]++;
    const finalPal = newPal.map((p, i) => ({ ...p, stitchCount: counts[i] }));

    // Update selectedColor
    let newSel = selectedColor;
    if (newSel === sourceIdx) newSel = targetIdx > sourceIdx ? targetIdx - 1 : targetIdx;
    else if (newSel > sourceIdx) newSel--;

    // Update hiddenColors
    const newHidden = new Set<number>();
    for (const ci of hiddenColors) {
      if (ci === sourceIdx) continue;
      newHidden.add(ci > sourceIdx ? ci - 1 : ci);
    }

    setUndoStack(s => [...s.slice(-49), snap()]);
    setRedoStack([]);
    updatePalette(finalPal);
    updateGrid(finalGrid);
    setSelectedColor(newSel);
    setHiddenColors(newHidden);
    setMergeIntoIndex(null);
  }

  function clearAll() {
    const g = gridRef.current;
    if (!g.length) return;
    const blank = g.map(r => r.map(() => -1));
    setUndoStack(s => [...s.slice(-49), { grid: g, palette: paletteRef.current }]);
    setRedoStack([]);
    updateGrid(blank);
  }

  function handleResize(newW: number, newH: number, mode: ResizeMode, anchor: ResizeAnchor) {
    const g = gridRef.current;
    if (!g.length) return;
    const srcH = g.length, srcW = g[0].length;
    let newGrid: number[][];
    if (mode === 'scale') {
      newGrid = Array.from({ length: newH }, (_, r) =>
        Array.from({ length: newW }, (_, c) =>
          g[Math.floor(r * srcH / newH)]?.[Math.floor(c * srcW / newW)] ?? -1
        )
      );
    } else {
      const offR = anchor === 'center' ? Math.floor((newH - srcH) / 2) : 0;
      const offC = anchor === 'center' ? Math.floor((newW - srcW) / 2) : 0;
      newGrid = Array.from({ length: newH }, (_, r) =>
        Array.from({ length: newW }, (_, c) => {
          const sr = r - offR, sc = c - offC;
          return sr >= 0 && sr < srcH && sc >= 0 && sc < srcW ? g[sr][sc] : -1;
        })
      );
    }
    setUndoStack(s => [...s.slice(-49), { grid: g, palette: paletteRef.current }]);
    setRedoStack([]);
    updateGrid(newGrid);
    setSelection(null);
    setShowResizeDialog(false);
  }

  // Undo / Redo
  function undo() {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(s => [...s, snap()]);
    updateGrid(prev.grid);
    updatePalette(prev.palette);
    setUndoStack(s => s.slice(0, -1));
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(s => [...s, snap()]);
    updateGrid(next.grid);
    updatePalette(next.palette);
    setRedoStack(s => s.slice(0, -1));
  }

  return (
    <div className="space-y-6">

      {/* Editor */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">

          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">Cross-Stitch Pattern Editor</h2>
                <button type="button" onClick={() => setHelpTab('howto')}
                  title="How to use this editor"
                  className="w-5 h-5 rounded-full border border-gray-300 text-xs text-gray-400 hover:text-rose-500 hover:border-rose-400 transition-colors leading-none flex items-center justify-center flex-none"
                >?</button>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {grid[0]?.length ?? 0} × {grid.length} stitches{hasDesign ? ` · ${palette.length} DMC colors` : ' · import a photo to begin'}
              </p>
            </div>
            <button
              type="button" onClick={downloadPdf} disabled={downloading || !hasDesign}
              className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 transition-colors"
              title={!hasDesign ? 'Import a photo first, then download as PDF' : 'Download the current pattern as a print-ready PDF'}
            >
              {downloading ? 'Generating…' : '↓ Download PDF'}
            </button>
          </div>
          {downloadError && <p className="mt-1 text-xs text-red-600">{downloadError}</p>}

          {/* Menu bar */}
          {(() => {
            const noop = () => {};
            const menus: MenuDef[] = [
              {
                label: 'File',
                items: [
                  { type: 'item', label: 'Download PDF', shortcut: '', onClick: downloadPdf, disabled: downloading || !hasDesign },
                  { type: 'separator' },
                  { type: 'item', label: 'New', onClick: () => { setUndoStack(s => [...s.slice(-49), snap()]); setRedoStack([]); updateGrid(blankGrid()); updatePalette(DEFAULT_PALETTE); setSelection(null); setSelectedColor(0); setHiddenColors(new Set()); } },
                  { type: 'item', label: 'Open…', disabled: true, onClick: noop },
                  { type: 'item', label: 'Save', disabled: true, onClick: noop },
                ],
              },
              {
                label: 'Edit',
                items: [
                  { type: 'item', label: 'Undo', shortcut: 'Ctrl+Z', disabled: !undoStack.length, onClick: undo },
                  { type: 'item', label: 'Redo', shortcut: 'Ctrl+Y', disabled: !redoStack.length, onClick: redo },
                  { type: 'separator' },
                  { type: 'item', label: 'Clear All', onClick: clearAll },
                  { type: 'separator' },
                  { type: 'item', label: 'Copy', shortcut: '⌘C', disabled: !selection, onClick: handleCopy },
                  { type: 'item', label: 'Cut', shortcut: '⌘X', disabled: !selection, onClick: handleCut },
                  { type: 'item', label: 'Paste', shortcut: '⌘V', disabled: !clipboard, onClick: handlePaste },
                  { type: 'separator' },
                  { type: 'item', label: 'Crop to Selection', disabled: !selection, onClick: handleCrop },
                  { type: 'separator' },
                  { type: 'submenu', label: 'Flip', items: [
                    { type: 'item', label: 'Horizontal', onClick: handleFlipH },
                    { type: 'item', label: 'Vertical', onClick: handleFlipV },
                  ]},
                  { type: 'submenu', label: 'Mirror', items: [
                    { type: 'item', label: 'Right',  onClick: handleMirrorRight  },
                    { type: 'item', label: 'Left',   onClick: handleMirrorLeft   },
                    { type: 'item', label: 'Top',    onClick: handleMirrorTop    },
                    { type: 'item', label: 'Bottom', onClick: handleMirrorBottom },
                  ]},
                  { type: 'submenu', label: 'Rotate', items: [
                    { type: 'item', label: '90° Right', onClick: () => applyRotation(rot90CW)  },
                    { type: 'item', label: '90° Left',  onClick: () => applyRotation(rot90CCW) },
                    { type: 'item', label: '180°',      onClick: () => applyRotation(rot180)   },
                  ]},
                ],
              },
              {
                label: 'View',
                items: [
                  { type: 'item', label: 'Color', checked: viewMode === 'color', onClick: () => setViewMode('color') },
                  { type: 'item', label: 'Symbol', checked: viewMode === 'symbol', onClick: () => setViewMode('symbol') },
                  { type: 'item', label: 'Both', checked: viewMode === 'both', onClick: () => setViewMode('both') },
                  { type: 'item', label: 'Simulation', checked: viewMode === 'simulation', onClick: () => setViewMode('simulation') },
                  { type: 'separator' },
                  { type: 'item', label: 'Zoom In', disabled: true, onClick: noop },
                  { type: 'item', label: 'Zoom Out', disabled: true, onClick: noop },
                ],
              },
              {
                label: 'Chart',
                items: [
                  { type: 'item', label: 'Properties…', disabled: true, onClick: noop },
                  { type: 'item', label: 'Resize…', onClick: () => setShowResizeDialog(true) },
                  { type: 'item', label: 'Size to Design', onClick: () => {
                    const g = gridRef.current;
                    const next = sizeToDesign(g);
                    if (!next) return;
                    setUndoStack(s => [...s.slice(-49), { grid: g, palette: paletteRef.current }]);
                    setRedoStack([]);
                    updateGrid(next);
                    setSelection(null);
                  }},
                  { type: 'item', label: 'Crop to Selection', disabled: !selection, onClick: handleCrop },
                ],
              },
              {
                label: 'Palette',
                items: [
                  { type: 'item', label: 'Add Color…', onClick: () => setAddColorPickerOpen(true) },
                  { type: 'item', label: 'Remove Unused', disabled: !hasDesign, onClick: () => {
                    const g = gridRef.current;
                    const used = new Set<number>();
                    for (const row of g) for (const ci of row) if (ci >= 0) used.add(ci);
                    if (used.size === palette.length) return; // nothing to remove
                    const newPalette = palette.filter((_, i) => used.has(i));
                    const remap: Record<number, number> = {};
                    let ni = 0;
                    for (let i = 0; i < palette.length; i++) if (used.has(i)) remap[i] = ni++;
                    const newGrid = g.map(row => row.map(ci => (ci >= 0 ? remap[ci] ?? -1 : -1)));
                    setUndoStack(s => [...s.slice(-49), { grid: g, palette: paletteRef.current }]);
                    setRedoStack([]);
                    updatePalette(newPalette);
                    updateGrid(newGrid);
                    setSelectedColor(c => remap[c] ?? 0);
                    setHiddenColors(prev => {
                      const next = new Set<number>();
                      prev.forEach(i => { if (remap[i] != null) next.add(remap[i]); });
                      return next;
                    });
                  }},
                  { type: 'item', label: 'Sort by Count', disabled: true, onClick: noop },
                ],
              },
              {
                label: 'Tools',
                items: [
                  { type: 'item', label: 'Pen', checked: activeTool === 'pencil', onClick: () => setActiveTool('pencil') },
                  { type: 'item', label: 'Pen Eraser', checked: activeTool === 'eraser', onClick: () => setActiveTool('eraser') },
                  { type: 'item', label: 'Fill', checked: activeTool === 'fill' && fillMode === 'flood', onClick: () => { setActiveTool('fill'); setFillMode('flood'); } },
                  { type: 'item', label: 'Erase Fill', checked: activeTool === 'fill' && fillMode === 'erase', onClick: () => { setActiveTool('fill'); setFillMode('erase'); } },
                ],
              },
              {
                label: 'Import',
                items: [
                  { type: 'item', label: 'From Photo…', onClick: () => setShowImportDialog(true) },
                ],
              },
              {
                label: 'Help',
                items: [
                  { type: 'item', label: 'How to use…', onClick: () => setHelpTab('howto') },
                  { type: 'item', label: 'About…', onClick: () => setHelpTab('about') },
                ],
              },
            ];
            return <MenuBar menus={menus} />;
          })()}

          <div className="mb-4" />

          {/* Editor: sidebar + canvas */}
          <div className="flex gap-3">

            {/* Left toolbar */}
            <div className="flex flex-col gap-1 flex-none w-16">
              {/* Undo / Redo */}
              <button type="button" onClick={undo} disabled={!undoStack.length}
                className="flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                title={`Undo (${undoStack.length})`}
              >
                <span className="text-base leading-none">↩</span>
                <span>Undo</span>
                {undoStack.length > 0 && <span className="text-gray-400">{undoStack.length}</span>}
              </button>
              <button type="button" onClick={redo} disabled={!redoStack.length}
                className="flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                title={`Redo (${redoStack.length})`}
              >
                <span className="text-base leading-none">↪</span>
                <span>Redo</span>
                {redoStack.length > 0 && <span className="text-gray-400">{redoStack.length}</span>}
              </button>

              <div className="h-px bg-gray-200 my-1" />
              <p className="text-[9px] uppercase tracking-wider text-gray-400 text-center leading-none select-none">Draw</p>

              {/* Tools */}
              {/* Pen — draw-mode + eraser submenu */}
              {(() => {
                const DRAW_MODES: { id: DrawMode; icon: string; label: string }[] = [
                  { id: 'point',        icon: '✕', label: 'Stitch'              },
                  { id: 'line',         icon: '╱', label: 'Line'                },
                  { id: 'rect',         icon: '▭', label: 'Rectangle (⇧=□)'    },
                  { id: 'rect-fill',    icon: '▬', label: 'Rect Fill (⇧=□)'    },
                  { id: 'ellipse',      icon: '◯', label: 'Ellipse (⇧=○)'      },
                  { id: 'ellipse-fill', icon: '⬤', label: 'Ellipse Fill (⇧=○)' },
                ];
                const penActive = activeTool === 'pencil' || activeTool === 'eraser';
                const cur = activeTool === 'eraser'
                  ? { icon: '⌫', label: 'Erase' }
                  : DRAW_MODES.find(m => m.id === drawMode)!;
                return (
                  <div ref={pencilBtnRef} className="relative">
                    <button
                      type="button"
                      onClick={() => { if (!penActive) setActiveTool('pencil'); setShowPencilMenu(s => !s); }}
                      title="Draw stitches on the canvas — click ▾ to switch between point, line, rectangle, and ellipse shapes"
                      className={`flex flex-col items-center gap-0.5 px-1 py-2 w-full rounded-lg border text-xs font-medium transition-colors ${
                        penActive
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                      }`}
                    >
                      <span className="text-base leading-none">{cur.icon}</span>
                      <span>{cur.label}</span>
                      <span className={`leading-none ${penActive ? 'opacity-60' : 'opacity-40'}`}>Pen ▾</span>
                    </button>
                    {showPencilMenu && (
                      <div className="absolute left-full top-0 ml-2 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-36">
                        {DRAW_MODES.map(({ id, icon, label }) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => { setDrawMode(id); setActiveTool('pencil'); setShowPencilMenu(false); }}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
                          >
                            <span className="w-3 text-center">{activeTool === 'pencil' && drawMode === id ? '✓' : ''}</span>
                            <span className="w-4 text-center font-mono">{icon}</span>
                            <span>{label}</span>
                          </button>
                        ))}
                        <div className="h-px bg-gray-100 my-1 mx-2" />
                        <button
                          type="button"
                          onClick={() => { setActiveTool('eraser'); setShowPencilMenu(false); }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
                        >
                          <span className="w-3 text-center">{activeTool === 'eraser' ? '✓' : ''}</span>
                          <span className="w-4 text-center font-mono">⌫</span>
                          <span>Erase</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Fill — single button, dropdown submenu on click */}
              <div ref={fillBtnRef} className="relative">
                <button
                  type="button"
                  onClick={() => { setActiveTool('fill'); setShowFillMenu(s => !s); }}
                  title="Flood fill — click a cell to fill the whole connected area with the active color — click ▾ to switch to Erase Fill"
                  className={`flex flex-col items-center gap-0.5 px-1 py-2 w-full rounded-lg border text-xs font-medium transition-colors ${
                    activeTool === 'fill'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                  }`}
                >
                  <span className="text-base leading-none">{fillMode === 'erase' ? '⬜' : '🪣'}</span>
                  <span>{fillMode === 'erase' ? 'Erase' : 'Flood'}</span>
                  <span className={`leading-none ${activeTool === 'fill' ? 'opacity-60' : 'opacity-40'}`}>Fill ▾</span>
                </button>

                {showFillMenu && (
                  <div className="absolute left-full top-0 ml-2 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-28">
                    {([
                      { mode: 'flood' as FillMode, icon: '🪣', label: 'Flood Fill' },
                      { mode: 'erase' as FillMode, icon: '⬜', label: 'Erase Fill' },
                    ]).map(({ mode, icon, label }) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => { setFillMode(mode); setShowFillMenu(false); }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
                      >
                        <span className="w-3 text-center">{fillMode === mode ? '✓' : ''}</span>
                        <span>{icon}</span>
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="h-px bg-gray-200 my-1" />

              {/* Pen size control */}
              <div className="flex flex-col items-center gap-1 px-1 py-1" title={`Pen size: paints a ${penWidth}×${penWidth} block of stitches at once`}>
                <span className="text-xs text-gray-500">Pen size</span>
                <span className="text-sm font-mono font-bold text-gray-800">{penWidth}</span>
                <input
                  type="range" min={1} max={9} value={penWidth}
                  onChange={e => setPenWidth(parseInt(e.target.value))}
                  className="w-full accent-rose-500"
                  title={`Size ${penWidth} — paints a ${penWidth}×${penWidth} block of stitches at once`}
                />
              </div>

              <div className="h-px bg-gray-200 my-1" />
              <p className="text-[9px] uppercase tracking-wider text-gray-400 text-center leading-none select-none">View</p>

              {/* View mode */}
              {VIEW_MODES.map(({ id, label, title }) => (
                <button key={id} type="button" onClick={() => setViewMode(id)} title={title}
                  className={`px-1 py-2 rounded-lg border text-xs transition-colors ${
                    viewMode === id
                      ? 'bg-rose-500 text-white border-rose-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {label}
                </button>
              ))}

              <div className="h-px bg-gray-200 my-1" />
              <p className="text-[9px] uppercase tracking-wider text-gray-400 text-center leading-none select-none">Select</p>

              {/* Select tool */}
              <button type="button" onClick={() => setActiveTool('select')}
                className={`flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-xs font-medium transition-colors ${
                  activeTool === 'select'
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                }`}
                title="Select — drag on the canvas to select a rectangular area, then copy, cut, or crop it"
              >
                <span className="text-base leading-none">▦</span>
                <span>Select</span>
              </button>

              {/* Cut selected region */}
              <button type="button" onClick={handleCut} disabled={!selection}
                className="flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Cut — copies the selected area and erases it (select a region first)"
              >
                <span className="text-base leading-none">✂</span>
                <span>Cut</span>
              </button>

              {/* Crop to selection */}
              <button type="button" onClick={handleCrop} disabled={!selection}
                className="flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Crop — trims the canvas to the selected area and discards the rest (select a region first)"
              >
                <span className="text-base leading-none">⊡</span>
                <span>Crop</span>
              </button>

              <div className="h-px bg-gray-200 my-1" />
              <p className="text-[9px] uppercase tracking-wider text-gray-400 text-center leading-none select-none">Transform</p>

              {/* Flip horizontal */}
              <button type="button" onClick={handleFlipH}
                className="flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-300 hover:border-gray-500"
                title="Flip H — mirrors the design left-to-right (applies to selection if one exists, otherwise whole design)"
              >
                <span className="text-base leading-none">↔</span>
                <span>Flip H</span>
              </button>

              {/* Flip vertical */}
              <button type="button" onClick={handleFlipV}
                className="flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-300 hover:border-gray-500"
                title="Flip V — mirrors the design top-to-bottom (applies to selection if one exists, otherwise whole design)"
              >
                <span className="text-base leading-none">↕</span>
                <span>Flip V</span>
              </button>

              {/* Rotate 90° clockwise */}
              <button type="button" onClick={() => applyRotation(rot90CW)}
                className="flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-300 hover:border-gray-500"
                title="Rotate 90° clockwise — turns the design to the right (applies to selection if one exists, otherwise whole design)"
              >
                <span className="text-base leading-none">↻</span>
                <span>Rot R</span>
              </button>

              {/* Rotate 90° counter-clockwise */}
              <button type="button" onClick={() => applyRotation(rot90CCW)}
                className="flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-300 hover:border-gray-500"
                title="Rotate 90° counter-clockwise — turns the design to the left (applies to selection if one exists, otherwise whole design)"
              >
                <span className="text-base leading-none">↺</span>
                <span>Rot L</span>
              </button>

              {/* Rotate 180° */}
              <button type="button" onClick={() => applyRotation(rot180)}
                className="flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-300 hover:border-gray-500"
                title="Rotate 180° — flips the design upside down (applies to selection if one exists, otherwise whole design)"
              >
                <span className="text-base leading-none">⟳</span>
                <span>180°</span>
              </button>
            </div>

            {/* Canvas */}
            <div className="flex-1 overflow-auto border border-gray-200 rounded-lg bg-gray-50 min-w-0 relative">
              {!hasDesign && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none z-10 select-none">
                  <span className="text-5xl mb-4">📷</span>
                  <p className="text-sm font-semibold text-gray-500">No pattern loaded</p>
                  <p className="text-xs text-gray-400 mt-2 max-w-[200px] leading-relaxed">
                    Click <span className="font-semibold text-gray-600">Import → From Photo…</span> in the menu above to convert a photo into a cross-stitch pattern
                  </p>
                </div>
              )}
              <PatternCanvas
                grid={grid}
                palette={palette}
                mode={viewMode}
                editable
                activeTool={activeTool === 'eraser' ? 'pencil' : activeTool === 'fill' && fillMode === 'erase' ? 'erase-fill' : activeTool}
                drawMode={drawMode}
                activeColorIndex={activeTool === 'eraser' ? -1 : selectedColor}
                penWidth={penWidth}
                blinkColorIndex={blinkCells}
                hiddenColors={hiddenColors}
                selection={selection}
                onPaint={handlePaint}
                onFill={fillMode === 'erase' ? handleEraseFill : handleFill}
                onStrokeStart={handleStrokeStart}
                onStrokeEnd={handleStrokeEnd}
                onShapePaint={handleShapePaint}
                onRightClick={handleRightClickCell}
                onSelectionChange={setSelection}
              />
            </div>

            {/* Palette column — right of canvas */}
            <PaletteBar
              palette={palette}
              selectedIndex={selectedColor}
              blinkIndex={blinkSwatch}
              hiddenColors={hiddenColors}
              onSelect={setSelectedColor}
              onBlink={handleRightClickSwatch}
              onToggleColor={i => setHiddenColors(prev => {
                const next = new Set(prev);
                if (next.has(i)) next.delete(i); else next.add(i);
                return next;
              })}
              onToggleAll={showAll => setHiddenColors(showAll ? new Set() : new Set(palette.map((_, i) => i)))}
              onChangeColor={setColorPickerIndex}
              onChangeSymbol={setSymbolPickerIndex}
              onMoveTo={setMoveToIndex}
              onMergeInto={setMergeIntoIndex}
              onAddColor={() => setAddColorPickerOpen(true)}
            />
          </div>

        </section>

      <ResizeDialog
        open={showResizeDialog}
        currentW={grid[0]?.length ?? 80}
        currentH={grid.length || 80}
        onConfirm={handleResize}
        onClose={() => setShowResizeDialog(false)}
      />

      <ImportFromPhotoDialog
        open={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImport={handleImport}
      />

      <HelpDialog
        open={helpTab !== null}
        initialTab={helpTab ?? 'howto'}
        onClose={() => setHelpTab(null)}
      />
      <SymbolPickerDialog
        open={symbolPickerIndex !== null}
        paletteIndex={symbolPickerIndex ?? -1}
        palette={palette}
        onPick={handleSymbolPick}
        onClose={() => setSymbolPickerIndex(null)}
      />
      <ColorPickerDialog
        open={colorPickerIndex !== null || addColorPickerOpen}
        addMode={addColorPickerOpen}
        paletteIndex={colorPickerIndex ?? -1}
        palette={palette}
        onPick={addColorPickerOpen ? handleAddColor : handleChangeColor}
        onClose={() => { setColorPickerIndex(null); setAddColorPickerOpen(false); }}
      />
      <PickPaletteEntryDialog
        open={moveToIndex !== null}
        mode="moveTo"
        sourceIndex={moveToIndex ?? -1}
        palette={palette}
        onPick={handleMoveTo}
        onPickEnd={handleMoveToEnd}
        onClose={() => setMoveToIndex(null)}
      />
      <PickPaletteEntryDialog
        open={mergeIntoIndex !== null}
        mode="mergeInto"
        sourceIndex={mergeIntoIndex ?? -1}
        palette={palette}
        onPick={handleMergeInto}
        onClose={() => setMergeIntoIndex(null)}
      />
    </div>
  );
}
