'use client';

import { useState, useRef, useEffect } from 'react';
import PatternCanvas, { type DrawMode, type SelectionRect } from '@/app/components/PatternCanvas';
import PaletteBar from '@/app/components/PaletteBar';
import MenuBar, { type MenuDef } from '@/app/components/MenuBar';
import ResizeDialog, { type ResizeMode, type ResizeAnchor } from '@/app/components/ResizeDialog';
import HelpDialog, { type HelpTab } from '@/app/components/HelpDialog';
import ImportFromPhotoDialog from '@/app/components/ImportFromPhotoDialog';
import type { ConvertedPattern, PatternPalette } from '@/lib/pattern-converter';
type Tool = 'pencil' | 'fill' | 'select';
type FillMode = 'flood' | 'erase';
type ViewMode = 'color' | 'symbol' | 'both';

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
  const [palette, setPalette] = useState<PatternPalette[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Pattern + editor state
  const blankGrid = (): number[][] => Array.from({ length: 80 }, () => Array(80).fill(-1));
  const [grid, setGrid] = useState<number[][]>(blankGrid);
  const gridRef = useRef<number[][]>(grid);
  const [undoStack, setUndoStack] = useState<number[][][]>([]);
  const [redoStack, setRedoStack] = useState<number[][][]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('color');
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
  const [blinkSwatch, setBlinkSwatch] = useState<number | null>(null);
  const [blinkCells, setBlinkCells] = useState<number | null>(null);
  const blinkSwatchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blinkCellsTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateGrid(g: number[][]) {
    gridRef.current = g;
    setGrid(g);
  }

  // Import from photo (called by ImportFromPhotoDialog on success)
  function handleImport(data: ConvertedPattern, paddedGrid: number[][]) {
    setPalette(data.palette);
    updateGrid(paddedGrid);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedColor(0);
    setSelection(null);
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
    if (!g.length || g[row][col] === selectedColor) return;
    const newRow = [...g[row]];
    newRow[col] = selectedColor;
    const newGrid = [...g];
    newGrid[row] = newRow;
    updateGrid(newGrid);
  }

  function handleStrokeEnd() {
    const before = strokeSnapshot.current;
    strokeSnapshot.current = null;
    if (!before || before === gridRef.current) return; // nothing changed
    setUndoStack(s => [...s.slice(-49), before]);
    setRedoStack([]);
  }

  // Editor: shape paint (line / rect / ellipse) — one undo entry
  function handleShapePaint(cells: [number, number][]) {
    const g = gridRef.current;
    if (!g.length || !cells.length) return;
    const snapshot = g;
    const newGrid = g.map(r => [...r]);
    for (const [r, c] of cells) {
      if (r >= 0 && r < newGrid.length && c >= 0 && c < newGrid[0].length)
        newGrid[r][c] = selectedColor;
    }
    setUndoStack(s => [...s.slice(-49), snapshot]);
    setRedoStack([]);
    updateGrid(newGrid);
  }

  // Editor: fill bucket
  function handleFill(row: number, col: number) {
    const g = gridRef.current;
    if (!g.length) return;
    const next = floodFill(g, row, col, selectedColor);
    if (next === g) return;
    setUndoStack(s => [...s.slice(-49), g]);
    setRedoStack([]);
    updateGrid(next);
  }

  // Editor: erase fill (flood fill with blank / -1)
  function handleEraseFill(row: number, col: number) {
    const g = gridRef.current;
    if (!g.length || g[row][col] === -1) return;
    const next = floodFill(g, row, col, -1);
    if (next === g) return;
    setUndoStack(s => [...s.slice(-49), g]);
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
    setUndoStack(s => [...s.slice(-49), g]);
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
    setUndoStack(s => [...s.slice(-49), g]);
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
    setUndoStack(s => [...s.slice(-49), g]);
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
    setUndoStack(s => [...s.slice(-49), g]);
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
    setUndoStack(s => [...s.slice(-49), g]);
    setRedoStack([]);
    updateGrid(newGrid);
  }

  // ── Mirror (always whole grid — doubles one dimension) ──────────
  function handleMirrorRight() {
    const g = gridRef.current;
    if (!g.length) return;
    const newGrid = g.map(r => [...r, ...[...r].reverse()]);
    setUndoStack(s => [...s.slice(-49), g]); setRedoStack([]);
    updateGrid(newGrid);
  }
  function handleMirrorLeft() {
    const g = gridRef.current;
    if (!g.length) return;
    const newGrid = g.map(r => [[...r].reverse(), ...r].flat() as number[]);
    setUndoStack(s => [...s.slice(-49), g]); setRedoStack([]);
    updateGrid(newGrid);
  }
  function handleMirrorBottom() {
    const g = gridRef.current;
    if (!g.length) return;
    const flipped = [...g].reverse().map(r => [...r]);
    setUndoStack(s => [...s.slice(-49), g]); setRedoStack([]);
    updateGrid([...g.map(r => [...r]), ...flipped]);
  }
  function handleMirrorTop() {
    const g = gridRef.current;
    if (!g.length) return;
    const flipped = [...g].reverse().map(r => [...r]);
    setUndoStack(s => [...s.slice(-49), g]); setRedoStack([]);
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
      setUndoStack(s => [...s.slice(-49), g]); setRedoStack([]);
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
    setUndoStack(s => [...s.slice(-49), g]); setRedoStack([]);
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

  function clearAll() {
    const g = gridRef.current;
    if (!g.length) return;
    const blank = g.map(r => r.map(() => -1));
    setUndoStack(s => [...s.slice(-49), g]);
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
    setUndoStack(s => [...s.slice(-49), g]);
    setRedoStack([]);
    updateGrid(newGrid);
    setSelection(null);
    setShowResizeDialog(false);
  }

  // Undo / Redo
  function undo() {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    const current = gridRef.current; // capture before updateGrid changes it
    setRedoStack(s => [...s, current]);
    updateGrid(prev);
    setUndoStack(s => s.slice(0, -1));
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    const current = gridRef.current; // capture before updateGrid changes it
    setUndoStack(s => [...s, current]);
    updateGrid(next);
    setRedoStack(s => s.slice(0, -1));
  }

  return (
    <div className="space-y-6">

      {/* Editor */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">

          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Cross-Stitch Pattern Editor</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {grid[0]?.length ?? 0} × {grid.length} stitches{palette.length > 0 ? ` · ${palette.length} DMC colors` : ''}
              </p>
            </div>
            <button
              type="button" onClick={downloadPdf} disabled={downloading || palette.length === 0}
              className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 transition-colors"
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
                  { type: 'item', label: 'Download PDF', shortcut: '', onClick: downloadPdf, disabled: downloading || palette.length === 0 },
                  { type: 'separator' },
                  { type: 'item', label: 'New', onClick: () => { setUndoStack(s => [...s.slice(-49), gridRef.current]); setRedoStack([]); updateGrid(blankGrid()); setPalette([]); setSelection(null); setSelectedColor(0); } },
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
                  { type: 'item', label: 'Crop to Selection', disabled: !selection, onClick: handleCrop },
                ],
              },
              {
                label: 'Palette',
                items: [
                  { type: 'item', label: 'Add Color…', disabled: true, onClick: noop },
                  { type: 'item', label: 'Remove Unused', disabled: true, onClick: noop },
                  { type: 'item', label: 'Sort by Count', disabled: true, onClick: noop },
                ],
              },
              {
                label: 'Tools',
                items: [
                  { type: 'item', label: 'Pencil', checked: activeTool === 'pencil', onClick: () => setActiveTool('pencil') },
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

              {/* Tools */}
              {/* Pencil — with draw-mode submenu */}
              {(() => {
                const DRAW_MODES: { id: DrawMode; icon: string; label: string }[] = [
                  { id: 'point',   icon: '·',  label: 'Point'     },
                  { id: 'line',    icon: '╱',  label: 'Line'      },
                  { id: 'rect',    icon: '▭',  label: 'Rectangle' },
                  { id: 'ellipse', icon: '◯',  label: 'Ellipse'   },
                ];
                const cur = DRAW_MODES.find(m => m.id === drawMode)!;
                return (
                  <div ref={pencilBtnRef} className="relative">
                    <button
                      type="button"
                      onClick={() => { setActiveTool('pencil'); setShowPencilMenu(s => !s); }}
                      className={`flex flex-col items-center gap-0.5 px-1 py-2 w-full rounded-lg border text-xs font-medium transition-colors ${
                        activeTool === 'pencil'
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                      }`}
                    >
                      <span className="text-base leading-none">{cur.icon}</span>
                      <span>{cur.label}</span>
                      <span className={`leading-none ${activeTool === 'pencil' ? 'opacity-60' : 'opacity-40'}`}>Pen ▾</span>
                    </button>
                    {showPencilMenu && (
                      <div className="absolute left-full top-0 ml-2 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-32">
                        {DRAW_MODES.map(({ id, icon, label }) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => { setDrawMode(id); setActiveTool('pencil'); setShowPencilMenu(false); }}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
                          >
                            <span className="w-3 text-center">{drawMode === id ? '✓' : ''}</span>
                            <span className="w-4 text-center font-mono">{icon}</span>
                            <span>{label}</span>
                          </button>
                        ))}
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
              <div className="flex flex-col items-center gap-1 px-1 py-1">
                <span className="text-xs text-gray-500">Pen size</span>
                <span className="text-sm font-mono font-bold text-gray-800">{penWidth}</span>
                <input
                  type="range" min={1} max={9} value={penWidth}
                  onChange={e => setPenWidth(parseInt(e.target.value))}
                  className="w-full accent-rose-500"
                  title={`Pen size: ${penWidth}`}
                />
              </div>

              <div className="h-px bg-gray-200 my-1" />

              {/* View mode */}
              {(['color', 'symbol', 'both'] as ViewMode[]).map(m => (
                <button key={m} type="button" onClick={() => setViewMode(m)}
                  className={`px-1 py-2 rounded-lg border text-xs capitalize transition-colors ${
                    viewMode === m
                      ? 'bg-rose-500 text-white border-rose-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {m}
                </button>
              ))}

              <div className="h-px bg-gray-200 my-1" />

              {/* Select tool */}
              <button type="button" onClick={() => setActiveTool('select')}
                className={`flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-xs font-medium transition-colors ${
                  activeTool === 'select'
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                }`}
                title="Select region"
              >
                <span className="text-base leading-none">▦</span>
                <span>Select</span>
              </button>

              {/* Cut selected region */}
              <button type="button" onClick={handleCut} disabled={!selection}
                className="flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Cut (clear selection)"
              >
                <span className="text-base leading-none">✂</span>
                <span>Cut</span>
              </button>

              {/* Crop to selection */}
              <button type="button" onClick={handleCrop} disabled={!selection}
                className="flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Crop to selection"
              >
                <span className="text-base leading-none">⊡</span>
                <span>Crop</span>
              </button>

              <div className="h-px bg-gray-200 my-1" />

              {/* Flip horizontal */}
              <button type="button" onClick={handleFlipH}
                className="flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-300 hover:border-gray-500"
                title="Flip horizontal (selection or whole design)"
              >
                <span className="text-base leading-none">↔</span>
                <span>Flip H</span>
              </button>

              {/* Flip vertical */}
              <button type="button" onClick={handleFlipV}
                className="flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-300 hover:border-gray-500"
                title="Flip vertical (selection or whole design)"
              >
                <span className="text-base leading-none">↕</span>
                <span>Flip V</span>
              </button>

              <div className="h-px bg-gray-200 my-1" />

              {/* Rotate 90° clockwise */}
              <button type="button" onClick={() => applyRotation(rot90CW)}
                className="flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-300 hover:border-gray-500"
                title="Rotate 90° clockwise"
              >
                <span className="text-base leading-none">↻</span>
                <span>Rot R</span>
              </button>

              {/* Rotate 90° counter-clockwise */}
              <button type="button" onClick={() => applyRotation(rot90CCW)}
                className="flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-300 hover:border-gray-500"
                title="Rotate 90° counter-clockwise"
              >
                <span className="text-base leading-none">↺</span>
                <span>Rot L</span>
              </button>

              {/* Rotate 180° */}
              <button type="button" onClick={() => applyRotation(rot180)}
                className="flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-300 hover:border-gray-500"
                title="Rotate 180°"
              >
                <span className="text-base leading-none">⟳</span>
                <span>180°</span>
              </button>
            </div>

            {/* Canvas */}
            <div className="flex-1 overflow-auto border border-gray-200 rounded-lg bg-gray-50 min-w-0">
              <PatternCanvas
                grid={grid}
                palette={palette}
                mode={viewMode}
                editable
                activeTool={activeTool === 'fill' && fillMode === 'erase' ? 'erase-fill' : activeTool}
                drawMode={drawMode}
                activeColorIndex={selectedColor}
                penWidth={penWidth}
                blinkColorIndex={blinkCells}
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
              onSelect={setSelectedColor}
              onRightClickSwatch={handleRightClickSwatch}
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
    </div>
  );
}
