'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import PatternCanvas, { type DrawMode, type SelectionRect, type PatternCanvasHandle } from '@/app/components/PatternCanvas';
import PaletteBar, { type PaletteBarHandle } from '@/app/components/PaletteBar';
import MenuBar, { type MenuDef } from '@/app/components/MenuBar';
import ResizeDialog, { type ResizeMode, type ResizeAnchor } from '@/app/components/ResizeDialog';
import HelpDialog, { type HelpTab } from '@/app/components/HelpDialog';
import ImportFromPhotoDialog from '@/app/components/ImportFromPhotoDialog';
import PublishToCatalogDialog from '@/app/components/PublishToCatalogDialog';
import SymbolPickerDialog from '@/app/components/SymbolPickerDialog';
import ColorPickerDialog from '@/app/components/ColorPickerDialog';
import PickPaletteEntryDialog from '@/app/components/PickPaletteEntryDialog';
import SavePatternDialog from '@/app/components/SavePatternDialog';
import OpenPatternDialog from '@/app/components/OpenPatternDialog';
import FeatureRequestDialog from '@/app/components/FeatureRequestDialog';
import PatternQualityWidget from '@/app/components/PatternQualityWidget';
import MirrorDialog, { type MirrorDirection, type MirrorAxis, type MirrorResize } from '@/app/components/MirrorDialog';
import { isUserLoggedIn } from '@/app/components/AuthControl';
import { generatePatternThumbnail } from '@/lib/pattern-thumbnail';
import type { ConvertedPattern, PatternPalette, DmcColor } from '@/lib/pattern-converter';
import { SYMBOLS } from '@/lib/symbols';
import dmcColors from '@/data/dmc-colors.json';
import { rleEncode, rleDecode } from '@/lib/rle';

import { trackEvent, postEditorEvent, checkReturnPatternGeneration } from '@/lib/track-event';

const DRAFT_KEY = 'converterDraft';

interface ConverterDraft {
  name: string;
  grid: number[][];
  palette: PatternPalette[];
  hiddenColors: number[];
  savedAt: number;
}

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
  { id: 'simulation', label: 'Stitched', title: 'Stitched — a realistic simulation of the finished embroidery (fabric texture and thread crosses), not just a flat color preview' },
  { id: 'color',      label: 'Color',   title: 'Color view — shows stitches as colored squares' },
  { id: 'symbol',     label: 'Symbol',  title: 'Symbol view — shows stitches as chart symbols (same as in the printed PDF)' },
  { id: 'both',       label: 'Both',    title: 'Color + Symbol — see both at once, useful when editing' },
];

// Ensure every colored cell has at least one 8-neighbor of the same color
// ("confetti" — isolated single stitches). Isolated cells are replaced with
// the most common adjacent color. Iterates until stable (max 8 passes).
function removeConfetti(grid: number[][]): { grid: number[][]; changed: boolean } {
  const rows = grid.length;
  if (!rows) return { grid, changed: false };
  const cols = grid[0].length;
  const DIRS: [number, number][] = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const g = grid.map(r => [...r]);
  let anyChanged = false;

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
    if (changed) anyChanged = true;
    if (!changed) break;
  }
  return { grid: g, changed: anyChanged };
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
  const paletteRef = useRef<PatternPalette[]>(DEFAULT_PALETTE);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importInitialFile, setImportInitialFile] = useState<File | null>(null);
  const [dragOverCanvas, setDragOverCanvas] = useState(false);
  const [showFeatureRequest, setShowFeatureRequest] = useState(false);
  const [showWishHint, setShowWishHint] = useState(false);
  const [showQualityFeedback, setShowQualityFeedback] = useState(false);
  const qualityFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorStartRef = useRef(Date.now());
  const editCountRef = useRef(0);
  const hasExportedPdfRef = useRef(false);
  const hasTrackedEditingStartRef = useRef(false);
  const lastEditingActionRef = useRef(0);

  // Pattern + editor state
  const blankGrid = (): number[][] => Array.from({ length: 80 }, () => Array(80).fill(-1));
  const [grid, setGrid] = useState<number[][]>(blankGrid);
  const gridRef = useRef<number[][]>(grid);
  const hasDesign = useMemo(() => grid.some(row => row.some(c => c !== -1)), [grid]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [publishPreviewImage, setPublishPreviewImage] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [redoStack, setRedoStack] = useState<Snapshot[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('simulation');
  const [activeTool, setActiveTool] = useState<Tool>('pencil');
  const [drawMode, setDrawMode] = useState<DrawMode>('point');
  const [penWidth, setPenWidth] = useState(1);
  const [cellSize, setCellSize] = useState(12);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const preFullscreenCellSize = useRef<number | null>(null);
  const canvasHandle    = useRef<PatternCanvasHandle>(null);
  const paletteBarRef = useRef<PaletteBarHandle>(null);
  const [paletteMaxHeight, setPaletteMaxHeight] = useState<number | undefined>(undefined);
  const [fillMode, setFillMode] = useState<FillMode>('flood');
  const [showPencilMenu, setShowPencilMenu] = useState(false);
  const pencilBtnRef = useRef<HTMLDivElement>(null);
  const [showTransformMenu, setShowTransformMenu] = useState(false);
  const transformBtnRef = useRef<HTMLDivElement>(null);
  const [selectedColor, setSelectedColor] = useState(0);
  const strokeSnapshot = useRef<number[][] | null>(null);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [clipboard, setClipboard] = useState<number[][] | null>(null);

  // Native scrollbars are invisible-until-scrolling on mobile (iOS/Android
  // both do this by design), so a canvas wider/taller than the screen gives
  // no visual hint it's scrollable at all. These edge fades are our own
  // always-checkable affordance, independent of OS scrollbar behavior.
  const [scrollHint, setScrollHint] = useState({ left: false, right: false, top: false, bottom: false });

  useEffect(() => {
    const el = canvasWrapperRef.current;
    if (!el) return;
    function updateScrollHint() {
      if (!el) return;
      setScrollHint({
        left: el.scrollLeft > 1,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
        top: el.scrollTop > 1,
        bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
      });
    }
    updateScrollHint();
    el.addEventListener('scroll', updateScrollHint, { passive: true });
    const ro = new ResizeObserver(updateScrollHint);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollHint);
      ro.disconnect();
    };
  }, [grid, cellSize]);

  useEffect(() => {
    const el = canvasWrapperRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      changeZoom(s => Math.max(4, Math.min(40, s + (e.deltaY < 0 ? 1 : -1))));
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('wishHintSeen')) return;
    const t = setTimeout(() => setShowWishHint(true), 5000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!showWishHint) return;
    const t = setTimeout(() => setShowWishHint(false), 14000);
    return () => clearTimeout(t);
  }, [showWishHint]);

  useEffect(() => {
    return () => {
      if (qualityFeedbackTimerRef.current) clearTimeout(qualityFeedbackTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const applyPaletteHeight = () => {
      // Below md (768px, matches the `md:flex-row` breakpoint below) the
      // canvas and palette stack vertically instead of sitting side by
      // side, so the palette shouldn't claim close to the full viewport
      // height the way it does on desktop — that made a large palette push
      // total page height to roughly 2x the viewport (canvas + palette,
      // both sized off innerHeight). It gets a smaller, capped,
      // internally-scrolling area instead (see the scroll-hint indicators
      // in PaletteBar.tsx).
      const isStacked = window.innerWidth < 768;
      const raw = isStacked
        ? Math.round(window.innerHeight * 0.45)
        : Math.max(400, window.innerHeight - 150);
      // The 400px desktop floor assumes a viewport tall enough to spare it
      // (true for virtually any desktop window) — a phone in landscape can
      // have less than 400px of height to begin with, so the floor alone
      // could make the panel taller than the screen itself. Never claim
      // more than the viewport actually has.
      setPaletteMaxHeight(Math.min(raw, window.innerHeight - 40));
    };
    applyPaletteHeight();
    window.addEventListener('resize', applyPaletteHeight);
    return () => window.removeEventListener('resize', applyPaletteHeight);
  }, []);

  useEffect(() => {
    if (!showPencilMenu) return;
    function onOut(e: MouseEvent) {
      if (!pencilBtnRef.current?.contains(e.target as Node)) setShowPencilMenu(false);
    }
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, [showPencilMenu]);

  useEffect(() => {
    if (!showTransformMenu) return;
    function onOut(e: MouseEvent) {
      if (!transformBtnRef.current?.contains(e.target as Node)) setShowTransformMenu(false);
    }
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, [showTransformMenu]);

  const handleSaveRef = useRef<() => void>(() => {});

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      // e.key reflects the active keyboard layout (e.g. a Cyrillic letter
      // instead of 'c'/'v'/... when typing in Russian), so it stops matching
      // these comparisons entirely on a non-English layout. e.code reports
      // the physical key position and is layout-independent.
      const code = e.code;
      if (code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (code === 'KeyY' || (code === 'KeyZ' && e.shiftKey)) { e.preventDefault(); redo(); }
      if (code === 'KeyC') { e.preventDefault(); handleCopy(); }
      if (code === 'KeyX') { e.preventDefault(); handleCut(); }
      // KeyV (paste) is deliberately NOT handled here — see the 'paste'
      // event listener below. preventDefault() on this keydown would
      // suppress the browser's native paste action entirely, which means
      // the 'paste' ClipboardEvent (needed to read an OS-clipboard image)
      // would never fire.
      if (code === 'KeyS') { e.preventDefault(); handleSaveRef.current(); }
      if (code === 'KeyA') {
        e.preventDefault();
        const g = gridRef.current;
        if (g.length && g[0].length) {
          setActiveTool('select');
          setSelection({ r0: 0, c0: 0, r1: g.length - 1, c1: g[0].length - 1 });
        }
      }
      if (e.key === 'ArrowUp')   { e.preventDefault(); changeZoom(s => Math.min(40, s + 2)); }
      if (e.key === 'ArrowDown') { e.preventDefault(); changeZoom(s => Math.max(4,  s - 2)); }
    }
    document.addEventListener('keydown', onKey, { capture: true });
    return () => document.removeEventListener('keydown', onKey, { capture: true });
  }, [undoStack, redoStack, selection, clipboard]);

  useEffect(() => {
    if (!fullscreen) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setFullscreen(false);
    }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [fullscreen]);

  // Fullscreen fixes the editor to the viewport, but the canvas itself still
  // rendered at whatever pixel size fit the old (much narrower) in-page
  // layout — nothing recomputed it, so most of the newly available space
  // just sat empty. Re-fit to the now-much-bigger wrapper on entry, restore
  // whatever zoom the user had on exit. Double rAF: the wrapper's new
  // fixed-inset-0 size isn't in the layout yet on the same frame as the
  // state update that triggered this effect.
  useEffect(() => {
    if (fullscreen) {
      preFullscreenCellSize.current = cellSize;
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setCellSize(fitCellSizeToWholeChart()));
      });
      return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
    }
    if (preFullscreenCellSize.current != null) {
      setCellSize(preFullscreenCellSize.current);
      preFullscreenCellSize.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]);

  // Handles Ctrl/Cmd+V for both cases — an image from the OS clipboard
  // (screenshot, copied photo, etc.), which goes to the import dialog same
  // as drag-and-drop/Upload Your Photo, and the in-app stitch-selection
  // clipboard (Select → Ctrl+C → Ctrl+V), which was previously handled from
  // the keydown effect above. Both live here, on the native 'paste' event,
  // rather than a keydown check, for two reasons: (1) it makes image-paste
  // work identically on Windows/Linux (Ctrl+V) and macOS (Cmd+V) — the
  // browser normalizes both into the same ClipboardEvent — and (2) calling
  // preventDefault() on the KEYDOWN event (as the old handler did) actually
  // suppresses the browser's native paste action, so the 'paste' event
  // (needed to read clipboard image data at all) would never fire.
  //
  // The in-app stitch clipboard takes priority over an OS-clipboard image
  // when both are present: the OS clipboard can hold a stale image from any
  // earlier copy (a screenshot from ages ago, "Copy image" on some other
  // page) and just sits there indefinitely, whereas `clipboard` only gets
  // set by an explicit Ctrl+C/Ctrl+X the user just did on this page — so
  // it's the far more likely thing they mean by "paste" right now.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      const inTextField = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (!inTextField && clipboard && clipboard.length) {
        e.preventDefault();
        handlePaste();
        return;
      }

      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (!file) continue;
            e.preventDefault();
            if (hasDesign && !window.confirm('Replace your current design with a new photo?')) return;
            trackEvent('image_paste_started', {});
            setImportInitialFile(file);
            setShowImportDialog(true);
            return;
          }
        }
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [clipboard, selection, hasDesign]);

  const [showResizeDialog, setShowResizeDialog] = useState(false);
  const [mirrorDialog, setMirrorDialog] = useState<MirrorDirection | null>(null);
  const [helpTab, setHelpTab] = useState<HelpTab | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [openDialogOpen, setOpenDialogOpen] = useState(false);
  const [afterSaveAction, setAfterSaveAction] = useState<'copyLink' | null>(null);
  const [savedPatternId, setSavedPatternId] = useState<string | null>(null);
  // Set when the pattern came from ?catalogPatternId= — a read-only catalog
  // design, not yet the user's own saved copy. Lets Stitch Mode work
  // immediately (progress tracked separately, see catalog-progress-storage)
  // without forcing an explicit Save first.
  const [catalogDesignId, setCatalogDesignId] = useState<number | null>(null);
  const catalogDesignIdRef = useRef<number | null>(null);
  // Snapshot of the grid/palette exactly as loaded from the catalog, so a
  // later Save can tell whether the user actually changed anything before
  // deciding to create a personal copy.
  const catalogOriginalRef = useRef<{ grid: number[][]; palette: PatternPalette[] } | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(() => isUserLoggedIn());
  const [patternName, setPatternName] = useState('');
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const saveToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [showModeDialog, setShowModeDialog] = useState(false);
  const [pendingPdfTitle, setPendingPdfTitle] = useState('');
  const [patternLoadError, setPatternLoadError] = useState('');
  const [patternLoading, setPatternLoading] = useState(false);
  const [resumeDraft, setResumeDraft] = useState<ConverterDraft | null>(null);
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Stitch progress tracking ("keep place while stitching")
  const [stitchMode, setStitchMode] = useState(false);
  const [stitchedCells, setStitchedCells] = useState<Set<string>>(new Set());
  const stitchedRef = useRef<Set<string>>(new Set());
  const [focusColorIndex, setFocusColorIndex] = useState<number | null>(null);
  const progressSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedPatternIdRef = useRef<string | null>(null);
  const stitchModeTrackedRef = useRef(false);

  function updateGrid(g: number[][]) {
    gridRef.current = g;
    setGrid(g);
  }

  function updatePalette(p: PatternPalette[]) {
    paletteRef.current = p;
    setPalette(p);
  }

  function updateStitched(s: Set<string>) {
    stitchedRef.current = s;
    setStitchedCells(s);
  }

  function snap(): Snapshot { return { grid: gridRef.current, palette: paletteRef.current }; }

  // Import from photo (called by ImportFromPhotoDialog on success)
  function handleImport(data: ConvertedPattern, paddedGrid: number[][]) {
    setPatternName('');
    setNameInput('');
    setEditingName(true);
    updatePalette(data.palette);
    const confettiResult = removeConfetti(paddedGrid);
    updateGrid(confettiResult.grid);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedColor(0);
    setSelection(null);
    setHiddenColors(new Set());
    setCellSize(fitCellSizeToWholeChart());
    setShowImportDialog(false);
    // Only worth a toast when it actually found stray stitches to clean —
    // silent otherwise, so this doesn't become noise on every conversion.
    if (confettiResult.changed) showToast('Cleaned up stray stitches ✓');
    hasTrackedEditingStartRef.current = false;
    trackEvent('image_uploaded', {});
    trackEvent('pattern_generated', {
      patternWidth: paddedGrid[0]?.length,
      patternHeight: paddedGrid.length,
      colorCount: data.palette.length,
    });
    postEditorEvent('pattern_generated', {
      patternWidth: paddedGrid[0]?.length,
      patternHeight: paddedGrid.length,
      colorCount: data.palette.length,
    });
    const returnCheck = checkReturnPatternGeneration();
    if (returnCheck.isReturn) {
      trackEvent('pattern_generated_return_visit', { gapHours: returnCheck.gapHours });
      postEditorEvent('pattern_generated_return_visit', { gapHours: returnCheck.gapHours });
    }

    // Ask for a quality rating a few seconds after generation, once the
    // user has had a moment to actually look at the result.
    if (qualityFeedbackTimerRef.current) clearTimeout(qualityFeedbackTimerRef.current);
    setShowQualityFeedback(false);
    qualityFeedbackTimerRef.current = setTimeout(() => setShowQualityFeedback(true), 4000);
  }

  // Download PDF from current (edited) grid
  async function doDownloadPdf(title: string, chartMode: 'symbol' | 'color-symbol' | 'color' = 'symbol') {
    setDownloading(true);
    try {
      const previewImage = (await canvasHandle.current?.capturePreview()) ?? null;
      const resp = await fetch('/api/convert/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grid: gridRef.current, palette, title, chartMode, previewImage }),
      });
      if (!resp.ok) throw new Error('PDF generation failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cross-stitch-pattern.pdf';
      a.click();
      URL.revokeObjectURL(url);
      hasExportedPdfRef.current = true;
      trackEvent('pdf_exported', {
        patternWidth: gridRef.current[0]?.length,
        patternHeight: gridRef.current.length,
        colorCount: palette.length,
      });
      postEditorEvent('pdf_exported', {
        patternWidth: gridRef.current[0]?.length,
        patternHeight: gridRef.current.length,
        colorCount: palette.length,
      });
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Download failed');
      trackEvent('editor_error', { errorCode: 'pdf_failed', step: 'pdf_export' });
      postEditorEvent('editor_error', { errorCode: 'pdf_failed', step: 'pdf_export' });
    } finally {
      setDownloading(false);
    }
  }

  function downloadPdf() {
    if (!isUserLoggedIn()) {
      window.dispatchEvent(new CustomEvent('openRegisterModal', {
        detail: { source: 'converter-download', label: 'Download PDF' },
      }));
      return;
    }
    if (!patternName) {
      setNameInput('');
      setShowNamePrompt(true);
      return;
    }
    setPendingPdfTitle(patternName);
    setShowModeDialog(true);
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
    editCountRef.current++;
    const tool = activeTool === 'eraser' ? 'eraser' : 'pencil';
    if (!hasTrackedEditingStartRef.current) {
      hasTrackedEditingStartRef.current = true;
      trackEvent('manual_editing_started', { tool });
    }
    const now = Date.now();
    if (now - lastEditingActionRef.current >= 10000) {
      lastEditingActionRef.current = now;
      trackEvent('manual_editing_action', { tool });
    }
  }

  function handleStrokeEnd() {
    const before = strokeSnapshot.current;
    strokeSnapshot.current = null;
    if (!before || before === gridRef.current) return; // nothing changed
    setUndoStack(s => [...s.slice(-99), { grid: before, palette: paletteRef.current }]);
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
    setUndoStack(s => [...s.slice(-99), { grid: snapshot, palette: paletteRef.current }]);
    setRedoStack([]);
    updateGrid(newGrid);
    if (!hasTrackedEditingStartRef.current) {
      hasTrackedEditingStartRef.current = true;
      trackEvent('manual_editing_started', { tool: drawMode });
    }
    const now = Date.now();
    if (now - lastEditingActionRef.current >= 10000) {
      lastEditingActionRef.current = now;
      trackEvent('manual_editing_action', { tool: drawMode });
    }
  }

  // Editor: fill bucket
  function handleFill(row: number, col: number) {
    const g = gridRef.current;
    if (!g.length) return;
    const next = floodFill(g, row, col, selectedColor);
    if (next === g) return;
    setUndoStack(s => [...s.slice(-99), { grid: g, palette: paletteRef.current }]);
    setRedoStack([]);
    updateGrid(next);
    if (!hasTrackedEditingStartRef.current) {
      hasTrackedEditingStartRef.current = true;
      trackEvent('manual_editing_started', { tool: 'fill' });
    }
    const now = Date.now();
    if (now - lastEditingActionRef.current >= 10000) {
      lastEditingActionRef.current = now;
      trackEvent('manual_editing_action', { tool: 'fill' });
    }
  }

  // Editor: erase fill (flood fill with blank / -1)
  function handleEraseFill(row: number, col: number) {
    const g = gridRef.current;
    if (!g.length || g[row][col] === -1) return;
    const next = floodFill(g, row, col, -1);
    if (next === g) return;
    setUndoStack(s => [...s.slice(-99), { grid: g, palette: paletteRef.current }]);
    setRedoStack([]);
    updateGrid(next);
    if (!hasTrackedEditingStartRef.current) {
      hasTrackedEditingStartRef.current = true;
      trackEvent('manual_editing_started', { tool: 'fill_erase' });
    }
    const now = Date.now();
    if (now - lastEditingActionRef.current >= 10000) {
      lastEditingActionRef.current = now;
      trackEvent('manual_editing_action', { tool: 'fill_erase' });
    }
  }

  // Keep isLoggedIn in sync with auth state changes (login/logout from header)
  useEffect(() => {
    const handler = () => setIsLoggedIn(isUserLoggedIn());
    window.addEventListener('authStateChange', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('authStateChange', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  // Admin check, for the "Publish to Catalog" button — silently stays false
  // for everyone else, no redirect (unlike /admin, this page is for all users).
  useEffect(() => {
    if (!isLoggedIn) { setIsAdmin(false); return; }
    fetch('/api/admin/me', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: { isAdmin?: boolean }) => setIsAdmin(Boolean(d.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, [isLoggedIn]);

  function loadPatternById(id: string) {
    setPatternLoading(true);
    setPatternLoadError('');
    fetch(`/api/converter/patterns/${id}`)
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
        return data;
      })
      .then(data => {
        if (!Array.isArray(data.grid) || !Array.isArray(data.palette)) {
          throw new Error('Invalid pattern data received');
        }
        if (data.palette.length === 0) {
          throw new Error('Pattern link is broken: palette was not saved. Please re-save the pattern to get a new link.');
        }
        const nonEmpty = (data.grid as number[][]).flat().filter(v => v !== -1).length;
        console.log('[load pattern]', {
          name: data.name, width: data.width, height: data.height,
          paletteColors: data.palette.length, nonEmptyCells: nonEmpty,
          firstRow: (data.grid as number[][])[0]?.slice(0, 8),
        });
        updateGrid(data.grid);
        updatePalette(data.palette);
        setHiddenColors(Array.isArray(data.hiddenColors) && data.hiddenColors.length > 0
          ? new Set<number>(data.hiddenColors)
          : new Set<number>());
        setPatternName(data.name ?? '');
        setSavedPatternId(id);
        setCellSize(typeof data.cellSize === 'number' ? data.cellSize : fitCellSizeToWholeChart());
        if (typeof data.progress === 'string' && data.progress.length > 0) {
          const boolGrid = rleDecode(data.progress, data.width, data.height);
          const next = new Set<string>();
          for (let r = 0; r < boolGrid.length; r++)
            for (let c = 0; c < boolGrid[r].length; c++)
              if (boolGrid[r][c] === 1) next.add(`${r},${c}`);
          updateStitched(next);
        } else {
          updateStitched(new Set());
        }
        window.history.replaceState(null, '', `?pattern=${id}`);
        trackEvent('project_reopened', {
          patternId: id,
          patternWidth: data.width,
          patternHeight: data.height,
          colorCount: data.palette.length,
        });
      })
      .catch(e => {
        console.error('[load pattern]', e);
        setPatternLoadError(e instanceof Error ? e.message : 'Failed to load pattern');
        trackEvent('editor_error', { errorCode: 'load_failed', step: 'pattern_load' });
        postEditorEvent('editor_error', { errorCode: 'load_failed', step: 'pattern_load' });
      })
      .finally(() => setPatternLoading(false));
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get('source') ?? (document.referrer ? 'referrer' : 'direct');
    const patternId = params.get('pattern') ?? undefined;
    trackEvent('editor_landing_viewed', { source, referrer: document.referrer || undefined, patternId });
    trackEvent('editor_opened', { source, referrer: document.referrer || undefined, patternId });
    postEditorEvent('editor_opened', { source, patternId });
  }, []);

  useEffect(() => {
    function handler() { setShowImportDialog(true); }
    window.addEventListener('openImportFromPhoto', handler);
    return () => window.removeEventListener('openImportFromPhoto', handler);
  }, []);

  useEffect(() => {
    async function handler() {
      if (hasDesign && !window.confirm('Replace your current design with a new photo?')) return;
      try {
        const resp = await fetch('/sample-photo.jpg');
        const blob = await resp.blob();
        const file = new File([blob], 'sample-photo.jpg', { type: 'image/jpeg' });
        setImportInitialFile(file);
        setShowImportDialog(true);
      } catch {
        setShowImportDialog(true);
      }
    }
    window.addEventListener('openSampleImage', handler);
    return () => window.removeEventListener('openSampleImage', handler);
  }, [hasDesign]);

  // Auto-load pattern from ?pattern=<id> URL param on mount
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('pattern');
    if (id) loadPatternById(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load a batch-extracted catalog design from ?catalogPatternId=<designId>
  // — a read-only starting point (not a user's own saved pattern), so unlike
  // loadPatternById this deliberately does NOT set savedPatternId: hitting
  // Save should create a new pattern owned by the current user, not overwrite
  // the catalog source.
  useEffect(() => {
    const designId = new URLSearchParams(window.location.search).get('catalogPatternId');
    if (!designId) return;
    setPatternLoading(true);
    setPatternLoadError('');
    fetch(`/api/converter/catalog-pattern/${designId}`)
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
        return data;
      })
      .then(data => {
        if (!Array.isArray(data.grid) || !Array.isArray(data.palette)) {
          throw new Error('Invalid pattern data received');
        }
        updateGrid(data.grid);
        updatePalette(data.palette);
        setHiddenColors(new Set<number>());
        setPatternName(data.title ?? '');
        setCellSize(typeof data.cellSize === 'number' ? data.cellSize : fitCellSizeToWholeChart());
        setCatalogDesignId(parseInt(designId, 10));
        catalogOriginalRef.current = { grid: data.grid, palette: data.palette };
        if (typeof data.progress === 'string' && data.progress.length > 0) {
          const boolGrid = rleDecode(data.progress, data.width, data.height);
          const next = new Set<string>();
          for (let r = 0; r < boolGrid.length; r++)
            for (let c = 0; c < boolGrid[r].length; c++)
              if (boolGrid[r][c] === 1) next.add(`${r},${c}`);
          updateStitched(next);
        } else {
          updateStitched(new Set());
        }
        trackEvent('project_reopened', {
          catalogDesignId: designId,
          patternWidth: data.width,
          patternHeight: data.height,
          colorCount: data.palette.length,
        });
      })
      .catch(e => {
        console.error('[load catalog pattern]', e);
        setPatternLoadError(e instanceof Error ? e.message : 'Failed to load catalog pattern');
        trackEvent('editor_error', { errorCode: 'load_failed', step: 'catalog_pattern_load' });
        postEditorEvent('editor_error', { errorCode: 'load_failed', step: 'catalog_pattern_load' });
      })
      .finally(() => setPatternLoading(false));
  }, []);

  // Offer to resume an unsaved local draft — only when landing fresh (no
  // ?pattern= or ?catalogPatternId=, which load their own state instead)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('pattern') || p.get('catalogPatternId')) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as ConverterDraft;
      const hasContent = Array.isArray(draft.grid) && draft.grid.some(row => row.some(c => c !== -1));
      if (hasContent) setResumeDraft(draft);
    } catch {
      // corrupt draft — ignore
    }
  }, []);

  // Debounced local autosave — independent of login, so work survives a
  // closed tab / a mail app's in-app browser exiting on "back". Stops once
  // the pattern is tied to an account save (savedPatternId set).
  useEffect(() => {
    if (!hasDesign || savedPatternId) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      try {
        const draft: ConverterDraft = {
          name: patternName,
          grid: gridRef.current,
          palette: paletteRef.current,
          hiddenColors: Array.from(hiddenColors),
          savedAt: Date.now(),
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // storage full/unavailable — best-effort only
      }
    }, 800);
    return () => { if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current); };
  }, [grid, palette, patternName, hiddenColors, hasDesign, savedPatternId]);

  function applyResumeDraft() {
    if (!resumeDraft) return;
    updateGrid(resumeDraft.grid);
    updatePalette(resumeDraft.palette);
    setPatternName(resumeDraft.name ?? '');
    setHiddenColors(new Set(resumeDraft.hiddenColors ?? []));
    setCellSize(fitCellSizeToWholeChart());
    setResumeDraft(null);
  }

  function discardResumeDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setResumeDraft(null);
  }

  // Retry loading when user logs in and pattern URL is present but not yet loaded
  useEffect(() => {
    if (!isLoggedIn) return;
    const id = new URLSearchParams(window.location.search).get('pattern');
    if (id && !savedPatternId) loadPatternById(id);
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  handleSaveRef.current = handleSave;

  function showToast(msg: string) {
    if (saveToastTimer.current) clearTimeout(saveToastTimer.current);
    setSaveToast(msg);
    saveToastTimer.current = setTimeout(() => setSaveToast(null), 2000);
  }

  // True if the current grid/palette still match exactly what was loaded
  // from the catalog — i.e. the user hasn't actually edited the design,
  // just (maybe) tracked stitching progress on it.
  function isCatalogUnmodified(): boolean {
    const orig = catalogOriginalRef.current;
    if (!orig) return false;
    const g = gridRef.current;
    if (g.length !== orig.grid.length) return false;
    for (let r = 0; r < g.length; r++) {
      const row = g[r], origRow = orig.grid[r];
      if (row.length !== origRow.length) return false;
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== origRow[c]) return false;
      }
    }
    const pal = paletteRef.current;
    if (pal.length !== orig.palette.length) return false;
    for (let i = 0; i < pal.length; i++) {
      if (pal[i].number !== orig.palette[i].number || pal[i].symbol !== orig.palette[i].symbol) return false;
    }
    return true;
  }

  function handleSave() {
    if (savedPatternId) {
      // Already saved — silent re-save
      if (!isUserLoggedIn()) {
        window.dispatchEvent(new CustomEvent('openRegisterModal', { detail: { source: 'converter-save', label: 'Save pattern' } }));
        return;
      }
      handleSavePattern(patternName || 'Untitled').then(() => showToast('Saved ✓')).catch(() => {});
    } else if (catalogDesignId && isCatalogUnmodified()) {
      // Nothing of the user's own to save yet — the design matches the
      // catalog original, and stitch progress already tracks separately
      // without needing a personal copy.
      showToast("Matches the original design — nothing to save");
    } else {
      setSaveDialogOpen(true);
    }
  }

  function handleCopyLink() {
    if (savedPatternId) {
      const url = `${window.location.origin}/photo-to-cross-stitch?pattern=${savedPatternId}`;
      navigator.clipboard.writeText(url).then(() => showToast('Link copied — opens for your account only ✓'));
    } else {
      setAfterSaveAction('copyLink');
      setSaveDialogOpen(true);
    }
  }

  // Save current pattern, return shareable URL (PUT to update in-place if already saved)
  async function handleSavePattern(name: string): Promise<string> {
    const existingId = savedPatternId;

    if (!existingId && !isUserLoggedIn()) {
      setSaveDialogOpen(false);
      window.dispatchEvent(new CustomEvent('openRegisterModal', {
        detail: { source: 'converter-save', label: 'Save pattern' },
      }));
      throw Object.assign(new Error('login required'), { silent: true });
    }

    const g = gridRef.current;
    const pal = paletteRef.current;
    const thumbnail = generatePatternThumbnail(g, pal);
    const hiddenColorsArr = hiddenColors.size > 0 ? Array.from(hiddenColors) : undefined;
    const body = JSON.stringify({ name, width: g[0]?.length ?? 0, height: g.length, palette: pal, grid: g, thumbnail, hiddenColors: hiddenColorsArr });
    const resp = await fetch(
      existingId ? `/api/converter/patterns/${existingId}` : '/api/converter/patterns',
      { method: existingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body },
    );
    if (!resp.ok) {
      const { error } = await resp.json().catch(() => ({ error: 'Save failed' }));
      if (resp.status === 401) {
        // localStorage's isLoggedIn flag never expires on its own, unlike the
        // 30-day session cookie — a stale flag makes the client think we're
        // logged in right up until a save attempt hits the server's real
        // check. Clear it and prompt to log back in instead of surfacing an
        // opaque "Save failed".
        try { localStorage.removeItem('isLoggedIn'); } catch { /* ignore */ }
        window.dispatchEvent(new Event('authStateChange'));
        setSaveDialogOpen(false);
        window.dispatchEvent(new CustomEvent('openRegisterModal', {
          detail: { source: 'converter-save', label: 'Save pattern' },
        }));
        throw Object.assign(new Error('login required'), { silent: true });
      }
      trackEvent('editor_error', { errorCode: 'save_failed', step: 'pattern_save' });
      postEditorEvent('editor_error', { errorCode: 'save_failed', step: 'pattern_save' });
      throw new Error(error);
    }
    const { id } = await resp.json();
    setPatternName(name);
    setSavedPatternId(id);
    // Was tracking progress against the catalog design directly (no copy
    // yet) — carry those marks over to the new personal copy so nothing
    // is lost now that a stable savedPatternId exists to attach them to.
    if (!existingId && catalogDesignIdRef.current && stitchedRef.current.size > 0) {
      const width = g[0]?.length ?? 0, height = g.length;
      const boolGrid: number[][] = Array.from({ length: height }, (_, r) =>
        Array.from({ length: width }, (_, c) => stitchedRef.current.has(`${r},${c}`) ? 1 : 0)
      );
      fetch(`/api/converter/patterns/${id}/progress`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress: rleEncode(boolGrid) }),
      }).catch(() => {
        postEditorEvent('editor_error', { errorCode: 'progress_save_failed', step: 'stitch_progress_transfer' });
      });
    }
    const url = `${window.location.origin}/photo-to-cross-stitch?pattern=${id}`;
    window.history.replaceState(null, '', `?pattern=${id}`);
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    trackEvent('project_saved', { patternId: id });
    return url;
  }

  useEffect(() => { savedPatternIdRef.current = savedPatternId; }, [savedPatternId]);
  useEffect(() => { catalogDesignIdRef.current = catalogDesignId; }, [catalogDesignId]);

  // ── Stitch progress tracking ("keep place while stitching") ──────────────
  const stitchTotal = useMemo(() => grid.flat().filter(v => v >= 0).length, [grid]);
  const stitchDone  = useMemo(() => {
    let n = 0;
    for (let r = 0; r < grid.length; r++)
      for (let c = 0; c < (grid[r]?.length ?? 0); c++)
        if (grid[r][c] >= 0 && stitchedCells.has(`${r},${c}`)) n++;
    return n;
  }, [grid, stitchedCells]);
  // Live per-color stitch counts, recomputed straight from the grid — unlike
  // palette[i].stitchCount (set once at conversion/palette-edit time), this
  // stays correct after plain pencil/fill/paste edits that touch the grid
  // without going through a palette-restructuring action.
  const liveCounts = useMemo(() => {
    const counts = new Array(palette.length).fill(0);
    for (const row of grid) for (const ci of row) if (ci >= 0 && counts[ci] != null) counts[ci]++;
    return counts;
  }, [grid, palette.length]);
  const remainingCounts = useMemo(() => {
    if (!stitchMode) return undefined;
    const counts = [...liveCounts];
    for (let r = 0; r < grid.length; r++)
      for (let c = 0; c < (grid[r]?.length ?? 0); c++) {
        const ci = grid[r][c];
        if (ci >= 0 && stitchedCells.has(`${r},${c}`) && counts[ci] != null) counts[ci]--;
      }
    return counts;
  }, [stitchMode, grid, liveCounts, stitchedCells]);

  function handleMarkCell(row: number, col: number, marked: boolean) {
    const next = new Set(stitchedRef.current);
    const key = `${row},${col}`;
    if (marked) next.add(key); else next.delete(key);
    updateStitched(next);
  }

  function handleMarkStrokeEnd() {
    if (progressSaveTimer.current) clearTimeout(progressSaveTimer.current);
    progressSaveTimer.current = setTimeout(() => { flushProgressSave(); }, 2000);
  }

  async function flushProgressSave() {
    if (progressSaveTimer.current) { clearTimeout(progressSaveTimer.current); progressSaveTimer.current = null; }
    // Prefer the saved-pattern endpoint once the user has their own copy;
    // fall back to the lightweight catalog-progress endpoint otherwise.
    const id = savedPatternIdRef.current;
    const catalogId = catalogDesignIdRef.current;
    if (!id && !catalogId) return;
    const g = gridRef.current;
    if (!g.length) return;
    const width = g[0].length, height = g.length;
    const boolGrid: number[][] = Array.from({ length: height }, (_, r) =>
      Array.from({ length: width }, (_, c) => stitchedRef.current.has(`${r},${c}`) ? 1 : 0)
    );
    const url = id
      ? `/api/converter/patterns/${id}/progress`
      : `/api/converter/catalog-pattern/${catalogId}/progress`;
    try {
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress: rleEncode(boolGrid) }),
      });
    } catch {
      postEditorEvent('editor_error', { errorCode: 'progress_save_failed', step: 'stitch_progress' });
    }
  }

  // Zoom is a per-user, per-design preference, saved alongside stitch
  // progress (same catalog-progress row / pattern row, a separate lightweight
  // field so a zoom change never re-serializes progress or vice versa).
  // Auto-computed resets (new photo, resumed draft, initial load with no
  // saved value yet) call setCellSize directly and skip this entirely —
  // only an actual user-driven zoom change (slider, hotkeys, Ctrl+scroll)
  // goes through changeZoom and gets persisted.
  const cellSizeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function flushCellSizeSave(size: number) {
    const id = savedPatternIdRef.current;
    const catalogId = catalogDesignIdRef.current;
    if (!id && !catalogId) return;
    const url = id
      ? `/api/converter/patterns/${id}/cell-size`
      : `/api/converter/catalog-pattern/${catalogId}/cell-size`;
    try {
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cellSize: size }),
      });
    } catch {
      // best-effort — a failed save just means next visit recomputes fit-to-width
    }
  }

  function changeZoom(updater: number | ((s: number) => number)) {
    setCellSize(prev => {
      const next = typeof updater === 'function' ? (updater as (s: number) => number)(prev) : updater;
      if (cellSizeSaveTimer.current) clearTimeout(cellSizeSaveTimer.current);
      cellSizeSaveTimer.current = setTimeout(() => flushCellSizeSave(next), 800);
      return next;
    });
  }

  // Fixed zoom presets for the View menu, alongside the free-form slider/hotkeys.
  const LARGE_EDIT_CELL_SIZE = 24;
  const SMALL_EDIT_CELL_SIZE = 10;
  // 96 CSS px/inch is the browser's standard reference pixel density; on
  // 14-count Aida there are 14 stitches per inch, so this is the closest a
  // screen can approximate "life-size" — actual on-screen size still varies
  // with each monitor's real pixel density.
  const AIDA14_TRUE_SIZE_CELL_SIZE = Math.round(96 / 14); // 7

  function fitCellSizeToWidth(): number {
    const gridWidth = gridRef.current[0]?.length ?? 0;
    const wrapperWidth = canvasWrapperRef.current?.clientWidth ?? 0;
    if (gridWidth <= 0 || wrapperWidth <= 0) return cellSize;
    return Math.max(4, Math.min(40, Math.floor(wrapperWidth / gridWidth)));
  }

  function fitCellSizeToWholeChart(): number {
    const g = gridRef.current;
    const gridWidth = g[0]?.length ?? 0;
    const gridHeight = g.length;
    const wrapper = canvasWrapperRef.current;
    const wrapperWidth = wrapper?.clientWidth ?? 0;
    const wrapperHeight = wrapper?.clientHeight ?? 0;
    if (gridWidth <= 0 || gridHeight <= 0 || wrapperWidth <= 0 || wrapperHeight <= 0) return cellSize;
    return Math.max(4, Math.min(40, Math.floor(Math.min(wrapperWidth / gridWidth, wrapperHeight / gridHeight))));
  }

  // Silent — used both by the explicit "Clear progress" button and internally
  // whenever the grid's dimensions/content shift (resize/mirror/size-to-design),
  // since old marks would no longer line up with the right cells.
  function clearStitchProgress() {
    if (stitchedRef.current.size === 0 && focusColorIndex === null) return;
    updateStitched(new Set());
    setFocusColorIndex(null);
    flushProgressSave();
  }

  function handleClearProgressClick() {
    if (!window.confirm('Clear all stitch-progress marks on this pattern?')) return;
    clearStitchProgress();
  }

  function toggleStitchMode() {
    if (stitchMode) {
      setStitchMode(false);
      flushProgressSave();
      return;
    }
    if (!savedPatternIdRef.current && !catalogDesignIdRef.current) return;
    // A catalog design's progress is personal, synced data — same login
    // requirement as saving a pattern, just without forcing a save first.
    if (!savedPatternIdRef.current && catalogDesignIdRef.current && !isUserLoggedIn()) {
      window.dispatchEvent(new CustomEvent('openRegisterModal', { detail: { source: 'converter-stitch-mode', label: 'Stitch Mode' } }));
      return;
    }
    if (!stitchModeTrackedRef.current) {
      stitchModeTrackedRef.current = true;
      trackEvent('stitch_mode_opened', {});
    }
    setStitchMode(true);
  }

  // Flush any pending progress save if the user navigates away mid-debounce.
  useEffect(() => {
    return () => { flushProgressSave(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear selection when switching away from select tool
  useEffect(() => {
    if (activeTool !== 'select') setSelection(null);
  }, [activeTool]);

  function handleSelectionChange(sel: SelectionRect | null) {
    setSelection(sel);
    if (sel === null) {
      setActiveTool('pencil');
      setSelectedColor(0);
    }
  }

  // Clicking outside the canvas while a selection is active exits select mode
  useEffect(() => {
    if (!selection) return;
    function onDocMouseDown(e: MouseEvent) {
      const wrapper = canvasWrapperRef.current;
      if (!wrapper || wrapper.contains(e.target as Node)) return;
      // Skip when clicking toolbar buttons, menus, or dialog form elements — selection must
      // persist through opening the Mirror dialog AND through clicking its radio buttons / OK.
      const t = e.target as HTMLElement;
      if (t.closest('button, input, label, select, [role="menu"], [role="menuitem"], [role="dialog"], dialog')) return;
      setSelection(null);
      setActiveTool('pencil');
      setSelectedColor(0);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [selection]);

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
    setUndoStack(s => [...s.slice(-99), { grid: g, palette: paletteRef.current }]);
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
    setUndoStack(s => [...s.slice(-99), { grid: g, palette: paletteRef.current }]);
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
    clearStitchProgress();
    const newGrid: number[][] = [];
    for (let r = b.rMin; r <= b.rMax; r++) {
      const row: number[] = [];
      for (let c = b.cMin; c <= b.cMax; c++) row.push(g[r]?.[c] ?? -1);
      newGrid.push(row);
    }
    setUndoStack(s => [...s.slice(-99), { grid: g, palette: paletteRef.current }]);
    setRedoStack([]);
    updateGrid(newGrid);
    setSelection(null);
  }

  function handleRemoveConfetti() {
    const g = gridRef.current;
    const result = removeConfetti(g);
    if (!result.changed) return;
    // Grid dimensions and cell coordinates are unchanged (unlike resize/crop) —
    // stitch progress stays valid, no need to clear it.
    setUndoStack(s => [...s.slice(-99), { grid: g, palette: paletteRef.current }]);
    setRedoStack([]);
    updateGrid(result.grid);
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
    setUndoStack(s => [...s.slice(-99), { grid: g, palette: paletteRef.current }]);
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
    setUndoStack(s => [...s.slice(-99), { grid: g, palette: paletteRef.current }]);
    setRedoStack([]);
    updateGrid(newGrid);
  }

  // ── Mirror ───────────────────────────────────────────────────────
  function applyMirror(dir: MirrorDirection, axis: MirrorAxis, resize: MirrorResize) {
    const g = gridRef.current;
    if (!g.length) return;
    clearStitchProgress();
    const rows = g.length, cols = g[0].length;
    const b = selectionBounds();

    setUndoStack(s => [...s.slice(-99), { grid: g, palette: paletteRef.current }]);
    setRedoStack([]);

    if (!b) {
      // ── Whole grid ────────────────────────────────────────────────
      let newGrid: number[][];

      if (resize === 'expand') {
        if (dir === 'right') {
          const ext = axis === 'edge'
            ? g.map(r => [...r].reverse())
            : g.map(r => [...r].reverse().slice(1));
          newGrid = g.map((r, i) => [...r, ...ext[i]]);
        } else if (dir === 'left') {
          const ext = axis === 'edge'
            ? g.map(r => [...r].reverse())
            : g.map(r => [...r].reverse().slice(0, -1));
          newGrid = g.map((r, i) => [...ext[i], ...r]);
        } else if (dir === 'bottom') {
          const rev = [...g].reverse().map(r => [...r]);
          newGrid = [...g.map(r => [...r]), ...(axis === 'edge' ? rev : rev.slice(1))];
        } else {
          const rev = [...g].reverse().map(r => [...r]);
          newGrid = [...(axis === 'edge' ? rev : rev.slice(0, -1)), ...g.map(r => [...r])];
        }
      } else {
        // Symmetrize within existing bounds: fill the opposite half from this half
        newGrid = g.map(r => [...r]);
        if (dir === 'right') {
          const half = Math.floor(cols / 2);
          const startC = axis === 'edge' ? half : half + 1;
          for (let ri = 0; ri < rows; ri++)
            for (let c = startC; c < cols; c++) {
              const src = (axis === 'edge' ? 2 * half - 1 : 2 * half) - c;
              newGrid[ri][c] = src >= 0 ? g[ri][src] : -1;
            }
        } else if (dir === 'left') {
          const rightStart = cols - Math.floor(cols / 2);
          const endC = axis === 'edge' ? rightStart : rightStart - 1;
          for (let ri = 0; ri < rows; ri++)
            for (let c = 0; c < endC; c++) {
              const src = axis === 'edge' ? cols - 1 - c : 2 * rightStart - c;
              newGrid[ri][c] = src < cols ? g[ri][src] : -1;
            }
        } else if (dir === 'bottom') {
          const half = Math.floor(rows / 2);
          const startR = axis === 'edge' ? half : half + 1;
          for (let r = startR; r < rows; r++) {
            const src = (axis === 'edge' ? 2 * half - 1 : 2 * half) - r;
            newGrid[r] = src >= 0 ? [...g[src]] : Array(cols).fill(-1);
          }
        } else {
          const botStart = rows - Math.floor(rows / 2);
          const endR = axis === 'edge' ? botStart : botStart - 1;
          for (let r = 0; r < endR; r++) {
            const src = axis === 'edge' ? rows - 1 - r : 2 * botStart - r;
            newGrid[r] = src < rows ? [...g[src]] : Array(cols).fill(-1);
          }
        }
      }
      updateGrid(newGrid);
      return;
    }

    // ── Selection ────────────────────────────────────────────────────
    const sub: number[][] = [];
    for (let r = b.rMin; r <= b.rMax; r++)
      sub.push(g[r].slice(b.cMin, b.cMax + 1));
    const subRows = sub.length, subCols = sub[0]?.length ?? 0;

    // Build mirror content and compute its dimensions
    let mirrorSub: number[][];
    let mirrorRows = subRows, mirrorCols = subCols;

    if (dir === 'right' || dir === 'left') {
      if (axis === 'edge') {
        mirrorSub = sub.map(r => [...r].reverse());
      } else {
        // center: pivot col is not duplicated
        mirrorSub = dir === 'right'
          ? sub.map(r => [...r].reverse().slice(1))   // drop pivot (last col of original)
          : sub.map(r => [...r].reverse().slice(0, -1)); // drop pivot (first col of original)
        mirrorCols = subCols - 1;
      }
    } else {
      const revRows = [...sub].reverse().map(r => [...r]);
      if (axis === 'edge') {
        mirrorSub = revRows;
      } else {
        mirrorSub = dir === 'bottom'
          ? revRows.slice(1)     // drop pivot (last row of original)
          : revRows.slice(0, -1); // drop pivot (first row of original)
        mirrorRows = subRows - 1;
      }
    }

    if (mirrorCols <= 0 || mirrorRows <= 0) { updateGrid(g); return; }

    // Determine placement origin and whether grid needs expanding
    let newGrid = g.map(r => [...r]);
    let newRows = rows, newCols = cols;
    let placeR = b.rMin, placeC = b.cMin;

    if (dir === 'right') {
      placeC = b.cMax + 1;
      if (resize === 'expand' && placeC + mirrorCols > cols) {
        newCols = placeC + mirrorCols;
        newGrid = newGrid.map(r => [...r, ...Array(newCols - cols).fill(-1)]);
      }
    } else if (dir === 'left') {
      placeC = b.cMin - mirrorCols;
      if (resize === 'expand' && placeC < 0) {
        const shift = -placeC;
        newCols = cols + shift;
        newGrid = newGrid.map(r => [...Array(shift).fill(-1), ...r]);
        placeC = 0;
        // adjust selection bounds for update below
        b.cMin += shift; b.cMax += shift;
      }
    } else if (dir === 'bottom') {
      placeR = b.rMax + 1;
      if (resize === 'expand' && placeR + mirrorRows > rows) {
        newRows = placeR + mirrorRows;
        const emptyRow = Array(newCols).fill(-1);
        while (newGrid.length < newRows) newGrid.push([...emptyRow]);
      }
    } else {
      placeR = b.rMin - mirrorRows;
      if (resize === 'expand' && placeR < 0) {
        const shift = -placeR;
        newRows = rows + shift;
        const emptyRow = Array(newCols).fill(-1);
        newGrid = [...Array(shift).fill(null).map(() => [...emptyRow]), ...newGrid];
        placeR = 0;
      }
    }

    // Place mirror content (clip to new grid bounds)
    for (let dr = 0; dr < mirrorSub.length; dr++)
      for (let dc = 0; dc < mirrorSub[dr].length; dc++) {
        const r = placeR + dr, c = placeC + dc;
        if (r >= 0 && r < newRows && c >= 0 && c < newCols)
          newGrid[r][c] = mirrorSub[dr][dc];
      }

    updateGrid(newGrid);
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
      setUndoStack(s => [...s.slice(-99), { grid: g, palette: paletteRef.current }]); setRedoStack([]);
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
    setUndoStack(s => [...s.slice(-99), { grid: g, palette: paletteRef.current }]); setRedoStack([]);
    updateGrid(newGrid);
    setSelection({ r0: b.rMin, c0: b.cMin,
      r1: Math.min(b.rMin + rotated.length - 1, rows - 1),
      c1: Math.min(b.cMin + rotated[0].length - 1, cols - 1) });
  }

  // Right-click: empty cell → switch to matching eraser; filled cell → pick color + blink swatch
  function handleRightClickCell(row: number, col: number) {
    const ci = gridRef.current[row]?.[col];
    if (ci == null || ci < 0) {
      if (activeTool === 'pencil') setActiveTool('eraser');
      else if (activeTool === 'fill' && fillMode === 'flood') setFillMode('erase');
      return;
    }
    setSelectedColor(ci);
    paletteBarRef.current?.scrollTo(ci);
    if (activeTool === 'eraser') setActiveTool('pencil');
    else if (activeTool === 'fill' && fillMode === 'erase') setFillMode('flood');
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
    setUndoStack(s => [...s.slice(-99), snap()]);
    setRedoStack([]);
    updatePalette(paletteRef.current.map((p, i) => i === idx ? { ...p, symbol } : p));
    setSymbolPickerIndex(null);
  }

  function handleChangeColor(dmcColor: DmcColor) {
    const idx = colorPickerIndex;
    if (idx === null) return;
    setUndoStack(s => [...s.slice(-99), snap()]);
    setRedoStack([]);
    updatePalette(paletteRef.current.map((p, i) =>
      i === idx ? { ...p, ...dmcColor } : p
    ));
    setColorPickerIndex(null);
    trackEvent('palette_changed', { changeType: 'replace' });
  }

  function handleAddColor(dmcColor: DmcColor) {
    const pal = paletteRef.current;
    const usedSymbols = new Set(pal.map(p => p.symbol));
    const symbol = SYMBOLS.find(s => !usedSymbols.has(s)) ?? '?';
    const newEntry: PatternPalette = { ...dmcColor, symbol, stitchCount: 0 };
    setUndoStack(s => [...s.slice(-99), snap()]);
    setRedoStack([]);
    updatePalette([...pal, newEntry]);
    setSelectedColor(pal.length);
    setAddColorPickerOpen(false);
    trackEvent('palette_changed', { changeType: 'add' });
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

    setUndoStack(s => [...s.slice(-99), snap()]);
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

  function handleDeleteColor(index: number) {
    const pal = paletteRef.current;
    const g = gridRef.current;

    // Erase all cells of this color
    const step1 = g.map(row => row.map(ci => (ci === index ? -1 : ci)));

    // Remove from palette; compact grid indices
    const newPal = pal.filter((_, i) => i !== index);
    const finalGrid = step1.map(row =>
      row.map(ci => {
        if (ci < 0) return ci;
        if (ci > index) return ci - 1;
        return ci;
      })
    );

    // Recount stitches
    const counts = new Array(newPal.length).fill(0);
    for (const row of finalGrid) for (const ci of row) if (ci >= 0) counts[ci]++;
    const finalPal = newPal.map((p, i) => ({ ...p, stitchCount: counts[i] }));

    // Update selectedColor
    let newSel = selectedColor;
    if (newSel === index) newSel = Math.max(0, index - 1);
    else if (newSel > index) newSel--;
    newSel = Math.min(newSel, newPal.length - 1);

    // Update hiddenColors
    const newHidden = new Set<number>();
    for (const ci of hiddenColors) {
      if (ci === index) continue;
      newHidden.add(ci > index ? ci - 1 : ci);
    }

    setUndoStack(s => [...s.slice(-99), snap()]);
    setRedoStack([]);
    updatePalette(finalPal);
    updateGrid(finalGrid);
    setSelectedColor(newSel);
    setHiddenColors(newHidden);
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

    setUndoStack(s => [...s.slice(-99), snap()]);
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
    setUndoStack(s => [...s.slice(-99), { grid: g, palette: paletteRef.current }]);
    setRedoStack([]);
    updateGrid(blank);
  }

  function newPattern() {
    if (hasDesign && !window.confirm('Start a new pattern? The current design will be cleared.')) return;
    setUndoStack([]);
    setRedoStack([]);
    updateGrid(blankGrid());
    updatePalette(DEFAULT_PALETTE);
    setSelection(null);
    setSelectedColor(0);
    setHiddenColors(new Set());
    setPatternName('');
    setNameInput('');
    setEditingName(true);
    setSavedPatternId(null);
    setStitchMode(false);
    updateStitched(new Set());
    setFocusColorIndex(null);
    window.history.replaceState(null, '', window.location.pathname);
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  }

  function handleResize(newW: number, newH: number, mode: ResizeMode, anchor: ResizeAnchor) {
    const g = gridRef.current;
    if (!g.length) return;
    clearStitchProgress();
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
    setUndoStack(s => [...s.slice(-99), { grid: g, palette: paletteRef.current }]);
    setRedoStack([]);
    updateGrid(newGrid);
    setSelection(null);
    setShowResizeDialog(false);
    trackEvent('pattern_size_changed', { newWidth: newW, newHeight: newH });
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
      <section className={fullscreen
        ? 'fixed inset-0 z-40 bg-white p-4 overflow-y-auto flex flex-col'
        : 'bg-white rounded-xl border border-gray-200 shadow-sm p-6'}>

          {/* Header */}
          <div className="flex-none flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">Cross-Stitch Pattern Editor</h2>
                <button type="button" onClick={() => setHelpTab('howto')}
                  title="How to use this editor"
                  className="w-5 h-5 rounded-full border border-gray-300 text-xs text-gray-400 hover:text-rose-500 hover:border-rose-400 transition-colors leading-none flex items-center justify-center flex-none"
                >?</button>
              </div>
              <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400">
                {editingName ? (
                  <input
                    autoFocus
                    type="text"
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onBlur={() => { setPatternName(nameInput.trim()); setEditingName(false); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { setPatternName(nameInput.trim()); setEditingName(false); }
                      if (e.key === 'Escape') setEditingName(false);
                    }}
                    placeholder="Pattern name"
                    className="text-xs font-medium text-gray-700 border-b border-rose-300 outline-none bg-transparent w-36"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => { setNameInput(patternName); setEditingName(true); }}
                    title="Click to rename"
                    className="flex items-center gap-0.5 font-medium text-gray-600 hover:text-rose-500 group transition-colors"
                  >
                    {patternName || <span className="text-gray-400 font-normal">Untitled</span>}
                    <span className="opacity-0 group-hover:opacity-60 transition-opacity text-[10px]">✏</span>
                  </button>
                )}
                <span>· {grid[0]?.length ?? 0} × {grid.length} stitches{hasDesign ? ` · ${palette.length} DMC colors` : ' · import a photo to begin'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setFullscreen(f => !f)}
                title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fill the whole screen with the editor'}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {fullscreen ? '⛶ Exit Fullscreen' : '⛶ Fullscreen'}
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowFeatureRequest(true);
                    setShowWishHint(false);
                    if (typeof window !== 'undefined') localStorage.setItem('wishHintSeen', '1');
                  }}
                  className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-500 transition-colors shadow-sm"
                  title="Suggest a feature"
                >
                  💡 I wish I could…
                </button>
                {showWishHint && (
                  <div className="absolute top-full right-0 mt-2.5 z-30 w-60 rounded-xl bg-white border border-amber-300 shadow-xl p-3.5">
                    <div className="absolute -top-2 right-5 w-4 h-4 bg-white border-t border-l border-amber-300 rotate-45" />
                    <button
                      type="button"
                      onClick={() => { setShowWishHint(false); if (typeof window !== 'undefined') localStorage.setItem('wishHintSeen', '1'); }}
                      className="absolute top-2 right-2 text-gray-300 hover:text-gray-500 leading-none"
                      aria-label="Dismiss"
                    >✕</button>
                    <p className="text-sm font-semibold text-amber-700 mb-1">Missing something?</p>
                    <p className="text-xs text-gray-600 leading-relaxed pr-3">Tell me what you wish this editor could do — I read every idea!</p>
                  </div>
                )}
              </div>
              <button
                type="button" onClick={newPattern}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors"
                title="Clear the canvas and start a new pattern"
              >
                New Pattern
              </button>
              <button
                type="button" onClick={handleSave} disabled={!hasDesign}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                title={savedPatternId ? 'Save changes to this pattern' : 'Save this cross-stitch pattern to your free account, so you can come back and keep editing later'}
              >
                {savedPatternId ? '💾 Save' : '💾 Save pattern'}
              </button>
              <button
                type="button" onClick={downloadPdf} disabled={downloading || !hasDesign}
                className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 transition-colors"
                title={!hasDesign ? 'Import a photo first, then download as PDF' : 'Download the current pattern as a print-ready PDF'}
              >
                {downloading ? 'Generating…' : '↓ Download PDF'}
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={async () => {
                    setPublishPreviewImage((await canvasHandle.current?.capturePreview()) ?? null);
                    setShowPublishDialog(true);
                  }}
                  disabled={!hasDesign}
                  className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  title="Admin: publish this design to the live catalog and create a real Pinterest pin"
                >
                  ⬆ Publish to Catalog
                </button>
              )}
            </div>
          </div>
          {!savedPatternId && hasDesign && (
            <p className="flex-none mt-1 text-xs text-gray-400">💾 Save your pattern to a free account to come back and finish editing later.</p>
          )}
          {downloadError && <p className="flex-none mt-1 text-xs text-red-600">{downloadError}</p>}

          {/* Menu bar */}
          {(() => {
            const noop = () => {};
            const menus: MenuDef[] = [
              {
                label: 'File',
                items: [
                  { type: 'item', label: 'Download PDF', shortcut: '', onClick: downloadPdf, disabled: downloading || !hasDesign },
                  { type: 'separator' },
                  { type: 'item', label: 'New Pattern', onClick: newPattern },
                  { type: 'item', label: 'Open…', onClick: () => setOpenDialogOpen(true) },
                  { type: 'item', label: 'Save', shortcut: 'Ctrl+S', onClick: handleSave },
                  { type: 'item', label: 'Copy link (opens for you only)', shortcut: '', onClick: handleCopyLink },
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
                  { type: 'item', label: 'Select All', shortcut: '⌘A', onClick: () => { const g = gridRef.current; if (g.length && g[0].length) { setActiveTool('select'); setSelection({ r0: 0, c0: 0, r1: g.length - 1, c1: g[0].length - 1 }); } } },
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
                    { type: 'item', label: 'Right',  onClick: () => setMirrorDialog('right')  },
                    { type: 'item', label: 'Left',   onClick: () => setMirrorDialog('left')   },
                    { type: 'item', label: 'Top',    onClick: () => setMirrorDialog('top')    },
                    { type: 'item', label: 'Bottom', onClick: () => setMirrorDialog('bottom') },
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
                  { type: 'item', label: 'Zoom In',  shortcut: 'Ctrl+↑', onClick: () => changeZoom(s => Math.min(40, s + 2)) },
                  { type: 'item', label: 'Zoom Out', shortcut: 'Ctrl+↓', onClick: () => changeZoom(s => Math.max(4, s - 2)) },
                  { type: 'separator' },
                  { type: 'item', label: 'Large Edit', onClick: () => changeZoom(LARGE_EDIT_CELL_SIZE) },
                  { type: 'item', label: 'Small Edit', onClick: () => changeZoom(SMALL_EDIT_CELL_SIZE) },
                  { type: 'item', label: 'True Size', onClick: () => changeZoom(AIDA14_TRUE_SIZE_CELL_SIZE) },
                  { type: 'item', label: 'Chart Width', onClick: () => changeZoom(fitCellSizeToWidth()) },
                  { type: 'item', label: 'Whole Chart', onClick: () => changeZoom(fitCellSizeToWholeChart()) },
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
                    clearStitchProgress();
                    setUndoStack(s => [...s.slice(-99), { grid: g, palette: paletteRef.current }]);
                    setRedoStack([]);
                    updateGrid(next);
                    setSelection(null);
                  }},
                  { type: 'item', label: 'Crop to Selection', disabled: !selection, onClick: handleCrop },
                  { type: 'item', label: 'Remove Confetti', disabled: !hasDesign, onClick: handleRemoveConfetti },
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
                    setUndoStack(s => [...s.slice(-99), { grid: g, palette: paletteRef.current }]);
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
                  { type: 'item', label: 'Sort by Count', disabled: !hasDesign, onClick: () => {
                    const pal = paletteRef.current;
                    const g = gridRef.current;
                    const counts = new Array(pal.length).fill(0);
                    for (const row of g) for (const ci of row) if (ci >= 0) counts[ci]++;
                    // Most-used color first — the order stitchers plan thread purchases by.
                    const perm = pal.map((_, i) => i).sort((a, b) => counts[b] - counts[a]);
                    const oldToNew = new Array(pal.length);
                    perm.forEach((oldIdx, newIdx) => { oldToNew[oldIdx] = newIdx; });
                    const newPal = perm.map(oldIdx => ({ ...pal[oldIdx], stitchCount: counts[oldIdx] }));
                    const newGrid = g.map(row => row.map(ci => (ci < 0 ? ci : oldToNew[ci])));
                    setUndoStack(s => [...s.slice(-99), { grid: g, palette: pal }]);
                    setRedoStack([]);
                    updatePalette(newPal);
                    updateGrid(newGrid);
                    setSelectedColor(c => oldToNew[c] ?? 0);
                    setHiddenColors(prev => {
                      const next = new Set<number>();
                      prev.forEach(i => { if (oldToNew[i] != null) next.add(oldToNew[i]); });
                      return next;
                    });
                    trackEvent('palette_changed', { changeType: 'sort_by_count' });
                  }},
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
                  { type: 'item', label: hasDesign ? 'Redo from Photo…' : 'From Photo…', onClick: () => setShowImportDialog(true) },
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
            return <div className="flex-none"><MenuBar menus={menus} /></div>;
          })()}

          <div className="flex-none mb-4" />

          {/* Editor: sidebar + canvas — stacked on narrow screens (palette's
              fixed min-width otherwise squeezes the canvas/toolbar column
              down to almost nothing), side by side from md up.
              flex-1 min-h-0 + overflow-y-auto so, in fullscreen mode, this
              row absorbs extra/deficit vertical space and scrolls internally
              instead of squeezing the header/menu bar rows above it. */}
          <div className={fullscreen ? 'flex flex-col md:flex-row gap-3 flex-1 min-h-0 overflow-y-auto' : 'flex flex-col md:flex-row gap-3'}>

            {/* Canvas column */}
            <div className="flex-1 flex flex-col gap-2 min-w-0 min-h-0">

              {/* Draw toolbar — single row; pen/eraser cell is internally split.
                  Scrolls horizontally on narrow screens instead of clipping. */}
              <div className="flex-none flex items-start flex-nowrap gap-1 px-1 pb-1 border-b border-gray-100 overflow-x-auto">

                {!stitchMode && <>

                {/* Undo / Redo */}
                <button type="button" onClick={undo} disabled={!undoStack.length}
                  title={`Undo (${undoStack.length})`}
                  className="flex items-center gap-1 px-2 py-1.5 rounded border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-200 hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>↩</span><span>Undo</span>
                  {undoStack.length > 0 && <span className="text-gray-400 ml-0.5">{undoStack.length}</span>}
                </button>
                <button type="button" onClick={redo} disabled={!redoStack.length}
                  title={`Redo (${redoStack.length})`}
                  className="flex items-center gap-1 px-2 py-1.5 rounded border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-200 hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>↪</span><span>Redo</span>
                  {redoStack.length > 0 && <span className="text-gray-400 ml-0.5">{redoStack.length}</span>}
                </button>

                <div className="self-stretch w-px bg-gray-200 mx-0.5" />

                {/* Pen + Eraser cell — buttons on top, size slider below */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    {/* Pen with draw-mode dropdown */}
                    {(() => {
                      const DRAW_MODES: { id: DrawMode; icon: string; label: string }[] = [
                        { id: 'point',        icon: '✕', label: 'Stitch'              },
                        { id: 'line',         icon: '╱', label: 'Line'                },
                        { id: 'rect',         icon: '▭', label: 'Rectangle (⇧=□)'    },
                        { id: 'rect-fill',    icon: '▬', label: 'Rect Fill (⇧=□)'    },
                        { id: 'ellipse',      icon: '◯', label: 'Ellipse (⇧=○)'      },
                        { id: 'ellipse-fill', icon: '⬤', label: 'Ellipse Fill (⇧=○)' },
                      ];
                      const cur = DRAW_MODES.find(m => m.id === drawMode) ?? DRAW_MODES[0];
                      const isPenActive = activeTool === 'pencil';
                      return (
                        <div ref={pencilBtnRef} className="relative">
                          <button
                            type="button"
                            onClick={() => { if (!isPenActive) setActiveTool('pencil'); setShowPencilMenu(s => !s); }}
                            title="Draw stitches — click ▾ to switch draw mode"
                            className={`flex items-center gap-1 px-2 py-1.5 rounded border text-xs font-medium transition-colors ${
                              isPenActive
                                ? 'bg-gray-900 text-white border-gray-900'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                            }`}
                          >
                            <span>{cur.icon}</span><span>Pen</span><span className="opacity-60">▾</span>
                          </button>
                          {showPencilMenu && (
                            <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-40">
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
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Eraser */}
                    <button
                      type="button"
                      onClick={() => setActiveTool('eraser')}
                      title="Eraser — click or drag to clear cells"
                      className={`flex items-center gap-1 px-2 py-1.5 rounded border text-xs font-medium transition-colors ${
                        activeTool === 'eraser'
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      <span>⌫</span><span>Eraser</span>
                    </button>
                  </div>

                  {/* Size slider — spans full width of the pen/eraser cell */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500 flex-none">Pen size</span>
                    <span className="text-xs font-mono text-gray-800 w-8 text-center flex-none">{penWidth}×{penWidth}</span>
                    <input
                      type="range" min={1} max={9} value={penWidth}
                      onChange={e => setPenWidth(parseInt(e.target.value))}
                      className="w-24 accent-rose-500"
                      title={`Pen size ${penWidth}×${penWidth} — paints a ${penWidth}×${penWidth} block of stitches at once`}
                    />
                  </div>
                </div>

                <div className="self-stretch w-px bg-gray-200 mx-0.5" />

                {/* Fill / Fill Erase */}
                <button
                  type="button"
                  onClick={() => { setActiveTool('fill'); setFillMode('flood'); }}
                  title="Fill — click any cell to fill its whole connected area with the active color"
                  className={`flex items-center gap-1 px-2 py-1.5 rounded border text-xs font-medium transition-colors ${
                    activeTool === 'fill' && fillMode === 'flood'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <span>🪣</span><span>Fill</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTool('fill'); setFillMode('erase'); }}
                  title="Fill Erase — click a cell to clear the whole connected area"
                  className={`flex items-center gap-1 px-2 py-1.5 rounded border text-xs font-medium transition-colors ${
                    activeTool === 'fill' && fillMode === 'erase'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <span>⬜</span><span>Fill Erase</span>
                </button>
                <button
                  type="button"
                  onClick={handleRemoveConfetti}
                  disabled={!hasDesign}
                  title="Remove Confetti — folds any isolated single stitch into the most common color around it"
                  className="flex items-center gap-1 px-2 py-1.5 rounded border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-200 hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>🧹</span><span>Remove Confetti</span>
                </button>

                <div className="self-stretch w-px bg-gray-200 mx-0.5" />

                {/* Select */}
                <button
                  type="button"
                  onClick={() => setActiveTool('select')}
                  title="Select — drag on the canvas to select a rectangular area, then copy, cut, or crop it"
                  className={`flex items-center gap-1 px-2 py-1.5 rounded border text-xs font-medium transition-colors ${
                    activeTool === 'select'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <span>▦</span><span>Select</span>
                </button>

                {/* Selection-dependent actions — only shown when relevant */}
                {selection && <>
                  <button type="button" onClick={handleCopy}
                    title="Copy selection"
                    className="flex items-center gap-1 px-2 py-1.5 rounded border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                  ><span>⎘</span><span>Copy</span></button>
                  <button type="button" onClick={handleCut}
                    title="Cut selection"
                    className="flex items-center gap-1 px-2 py-1.5 rounded border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                  ><span>✂</span><span>Cut</span></button>
                  <button type="button" onClick={handleCrop}
                    title="Crop canvas to selection"
                    className="flex items-center gap-1 px-2 py-1.5 rounded border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                  ><span>⊡</span><span>Crop</span></button>
                </>}
                {clipboard && (
                  <button type="button" onClick={handlePaste}
                    title="Paste"
                    className="flex items-center gap-1 px-2 py-1.5 rounded border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                  ><span>⎙</span><span>Paste</span></button>
                )}

                {/* Transform — flip/rotate/mirror, previously Edit-menu-only */}
                <div ref={transformBtnRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setShowTransformMenu(s => !s)}
                    disabled={!hasDesign}
                    title="Transform — flip, rotate, or mirror the selection (or whole design if none)"
                    className="flex items-center gap-1 px-2 py-1.5 rounded border text-xs font-medium transition-colors bg-white text-gray-700 border-gray-200 hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>⟳</span><span>Transform</span><span className="opacity-60">▾</span>
                  </button>
                  {showTransformMenu && (
                    <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-40">
                      {[
                        { label: 'Flip Horizontal', onClick: handleFlipH },
                        { label: 'Flip Vertical', onClick: handleFlipV },
                      ].map(({ label, onClick }) => (
                        <button key={label} type="button"
                          onClick={() => { onClick(); setShowTransformMenu(false); }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
                        >{label}</button>
                      ))}
                      <div className="border-t border-gray-100 my-1" />
                      {[
                        { label: 'Rotate 90° Right', onClick: () => applyRotation(rot90CW) },
                        { label: 'Rotate 90° Left', onClick: () => applyRotation(rot90CCW) },
                        { label: 'Rotate 180°', onClick: () => applyRotation(rot180) },
                      ].map(({ label, onClick }) => (
                        <button key={label} type="button"
                          onClick={() => { onClick(); setShowTransformMenu(false); }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
                        >{label}</button>
                      ))}
                      <div className="border-t border-gray-100 my-1" />
                      {([
                        { label: 'Mirror Right', dir: 'right' },
                        { label: 'Mirror Left', dir: 'left' },
                        { label: 'Mirror Top', dir: 'top' },
                        { label: 'Mirror Bottom', dir: 'bottom' },
                      ] as const).map(({ label, dir }) => (
                        <button key={label} type="button"
                          onClick={() => { setMirrorDialog(dir); setShowTransformMenu(false); }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
                        >{label}</button>
                      ))}
                    </div>
                  )}
                </div>

                </>}

                <div className="self-stretch w-px bg-gray-200 mx-0.5" />

                {/* View mode segmented control */}
                <div className="flex items-center self-start rounded border border-gray-200 overflow-hidden">
                  {VIEW_MODES.map(({ id, label, title }) => (
                    <button key={id} type="button" onClick={() => setViewMode(id)} title={title}
                      className={`px-2 py-1.5 text-xs font-medium transition-colors border-r last:border-r-0 border-gray-200 ${
                        viewMode === id
                          ? 'bg-rose-500 text-white'
                          : 'bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="self-stretch w-px bg-gray-200 mx-0.5" />

                {/* Stitch Mode toggle */}
                <button
                  type="button"
                  onClick={toggleStitchMode}
                  disabled={!stitchMode && !savedPatternId && !catalogDesignId}
                  title={
                    stitchMode
                      ? 'Exit Stitch Mode'
                      : savedPatternId || catalogDesignId
                        ? 'Stitch Mode — mark cells as stitched while you work through the chart'
                        : 'Save your pattern first to track stitching progress'
                  }
                  className={`flex items-center gap-1 px-2 py-1.5 rounded border text-xs font-medium transition-colors ${
                    stitchMode
                      ? 'bg-rose-500 text-white border-rose-500'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed'
                  }`}
                >
                  <span>🧵</span><span>{stitchMode ? 'Exit Stitch Mode' : 'Stitch Mode'}</span>
                </button>
              </div>

              {stitchMode && (
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 px-1 py-1.5 border-b border-gray-100 text-xs">
                  <div className="flex items-center gap-2 min-w-0 basis-full sm:basis-auto sm:flex-1">
                    <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden max-w-xs">
                      <div
                        className="h-full bg-rose-500 transition-all"
                        style={{ width: `${stitchTotal > 0 ? Math.round((stitchDone / stitchTotal) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="text-gray-600 font-medium">
                      {stitchDone} / {stitchTotal} stitched{stitchTotal > 0 ? ` (${Math.round((stitchDone / stitchTotal) * 100)}%)` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearProgressClick}
                    disabled={stitchDone === 0}
                    className="text-gray-500 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Clear all stitch-progress marks on this pattern"
                  >
                    Clear progress
                  </button>
                  {focusColorIndex !== null && (
                    <button type="button" onClick={() => setFocusColorIndex(null)} className="text-gray-500 hover:text-gray-800">
                      Clear focus
                    </button>
                  )}
                </div>
              )}

              {/* Zoom bar */}
              <div className="flex items-center gap-3 px-1">
                <span className="text-xs text-gray-500 flex-none">Zoom</span>
                <input
                  type="range" min={4} max={40} value={cellSize}
                  onChange={e => changeZoom(parseInt(e.target.value))}
                  className="flex-1 accent-rose-500"
                  title="Drag to zoom in or out — or hold Ctrl and scroll on the canvas"
                />
                <span className="text-xs font-mono text-gray-600 flex-none w-8 text-right">{cellSize}px</span>
              </div>

            {patternLoadError && (
              <div className="text-xs text-red-600 px-1 flex items-center justify-between gap-2">
                <span>⚠ {patternLoadError}</span>
                <button type="button" onClick={() => setPatternLoadError('')} className="text-gray-400 hover:text-gray-600">×</button>
              </div>
            )}

            {/* Canvas */}
            <div className="relative flex-1 min-w-0 min-h-0 flex">
            <div
              ref={canvasWrapperRef}
              className={`flex-1 min-w-0 overflow-auto border rounded-lg bg-gray-50 relative transition-colors ${fullscreen ? 'min-h-0' : 'max-h-[calc(100vh-150px)]'} ${dragOverCanvas ? 'border-rose-400 bg-rose-50' : 'border-gray-200'}`}
              onDragOver={e => {
                e.preventDefault();
                if (!hasDesign && !dragOverCanvas) trackEvent('image_drop_started', {});
                if (!hasDesign) setDragOverCanvas(true);
              }}
              onDragLeave={() => setDragOverCanvas(false)}
              onDrop={e => {
                e.preventDefault();
                setDragOverCanvas(false);
                if (hasDesign && !window.confirm('Replace your current design with a new photo?')) return;
                const file = e.dataTransfer.files[0];
                if (file?.type.startsWith('image/')) {
                  setImportInitialFile(file);
                  setShowImportDialog(true);
                  return;
                }
                // Dragging an image out of another site (e.g. Google Photos) hands
                // over a URL, not file bytes — the browser never downloads it for a
                // cross-origin drag. Fetch it through our proxy instead.
                const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
                if (!/^https?:\/\//i.test(url)) return;
                setPatternLoadError('');
                setPatternLoading(true);
                fetch(`/api/import-image-url?url=${encodeURIComponent(url)}`)
                  .then(res => {
                    if (!res.ok) throw new Error('fetch failed');
                    return res.blob();
                  })
                  .then(blob => {
                    setImportInitialFile(new File([blob], 'imported-photo.jpg', { type: blob.type || 'image/jpeg' }));
                    setShowImportDialog(true);
                  })
                  .catch(() => {
                    setPatternLoadError("Couldn't import that image — try saving it to your device first, then use Upload Your Photo.");
                  })
                  .finally(() => setPatternLoading(false));
              }}
            >
              {patternLoading && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/85 backdrop-blur-sm">
                  <div className="flex flex-col items-center text-center px-8 py-6">
                    <span className="text-5xl mb-4 animate-spin">⏳</span>
                    <p className="text-base font-semibold text-gray-700">Loading pattern…</p>
                  </div>
                </div>
              )}
              {!hasDesign && (
                <div
                  className="absolute top-0 bottom-0 left-0 flex items-center justify-center z-10 pointer-events-none select-none"
                  style={{ width: (grid[0]?.length ?? 80) * cellSize + 30 }}
                >
                  <div className={`flex flex-col items-center text-center rounded-xl px-8 py-6 transition-colors ${dragOverCanvas ? 'bg-rose-50/80' : 'bg-white/70 backdrop-blur-sm'}`}>
                    <span className="text-5xl mb-4">{dragOverCanvas ? '🖼️' : '📷'}</span>
                    <p className="text-sm font-semibold text-gray-500">{dragOverCanvas ? 'Drop your photo here' : 'Ready when you are'}</p>
                    <p className="text-xs text-gray-400 mt-2 max-w-[220px] leading-relaxed">
                      {dragOverCanvas
                        ? 'Release to open the converter'
                        : <>Drag a photo here, or click <span className="font-semibold text-gray-600">Upload Your Photo</span> above — I&apos;ll do the rest.</>
                      }
                    </p>
                  </div>
                </div>
              )}
              <PatternCanvas
                ref={canvasHandle}
                grid={grid}
                palette={palette}
                mode={viewMode}
                cellSize={cellSize}
                editable
                activeTool={stitchMode ? 'mark' : activeTool === 'eraser' ? 'pencil' : activeTool === 'fill' && fillMode === 'erase' ? 'erase-fill' : activeTool}
                drawMode={drawMode}
                activeColorIndex={activeTool === 'eraser' ? -1 : selectedColor}
                penWidth={penWidth}
                blinkColorIndex={blinkCells}
                hiddenColors={hiddenColors}
                selection={selection}
                stitchedCells={stitchedCells}
                focusColorIndex={focusColorIndex}
                onPaint={handlePaint}
                onFill={fillMode === 'erase' ? handleEraseFill : handleFill}
                onStrokeStart={handleStrokeStart}
                onStrokeEnd={handleStrokeEnd}
                onShapePaint={handleShapePaint}
                onRightClick={handleRightClickCell}
                onSelectionChange={handleSelectionChange}
                onMarkCell={handleMarkCell}
                onMarkStrokeEnd={handleMarkStrokeEnd}
              />
            </div>{/* end canvasWrapperRef (scrollable) */}
            {/*
              A translucent scrim alone isn't reliable here: the canvas
              underneath can be any color, including near-black (e.g. the
              Black Cat design's fur right at the edge) — a dark gradient
              disappears against dark content exactly like a light one
              disappears against light content. So the actual affordance is
              an opaque rose chevron pill (fixed color, always contrasts
              regardless of what's behind it); the gradient stays only as
              a soft, secondary polish for the common light-background case.
            */}
            {scrollHint.left && (
              <>
                <div className="pointer-events-none absolute inset-y-0 left-0 w-8 z-20 rounded-l-lg bg-gradient-to-r from-black/25 to-transparent" />
                <div className="pointer-events-none absolute top-1/2 left-1.5 z-20 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-full bg-rose-500 text-white text-xs shadow-md ring-2 ring-white/80">‹</div>
              </>
            )}
            {scrollHint.right && (
              <>
                <div className="pointer-events-none absolute inset-y-0 right-0 w-8 z-20 rounded-r-lg bg-gradient-to-l from-black/25 to-transparent" />
                <div className="pointer-events-none absolute top-1/2 right-1.5 z-20 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-full bg-rose-500 text-white text-xs shadow-md ring-2 ring-white/80">›</div>
              </>
            )}
            {scrollHint.top && (
              <>
                <div className="pointer-events-none absolute inset-x-0 top-0 h-8 z-20 rounded-t-lg bg-gradient-to-b from-black/25 to-transparent" />
                <div className="pointer-events-none absolute left-1/2 top-1.5 z-20 -translate-x-1/2 flex items-center justify-center w-6 h-6 rounded-full bg-rose-500 text-white text-xs shadow-md ring-2 ring-white/80">︿</div>
              </>
            )}
            {scrollHint.bottom && (
              <>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 z-20 rounded-b-lg bg-gradient-to-t from-black/25 to-transparent" />
                <div className="pointer-events-none absolute left-1/2 bottom-1.5 z-20 -translate-x-1/2 flex items-center justify-center w-6 h-6 rounded-full bg-rose-500 text-white text-xs shadow-md ring-2 ring-white/80">﹀</div>
              </>
            )}
            </div>{/* end relative flex wrapper */}
            </div>{/* end canvas column */}

            {/* Palette column — right of canvas */}
            <PaletteBar
              ref={paletteBarRef}
              palette={palette}
              selectedIndex={selectedColor}
              maxHeight={paletteMaxHeight}
              blinkIndex={blinkSwatch}
              hiddenColors={hiddenColors}
              remainingCounts={remainingCounts}
              totalCounts={liveCounts}
              onSelect={i => {
                if (stitchMode) {
                  setFocusColorIndex(prev => prev === i ? null : i);
                  return;
                }
                setSelectedColor(i);
                if (activeTool === 'eraser') setActiveTool('pencil');
                if (activeTool === 'fill' && fillMode === 'erase') setFillMode('flood');
              }}
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
              onDeleteColor={handleDeleteColor}
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

      {mirrorDialog && (
        <MirrorDialog
          direction={mirrorDialog}
          onConfirm={(axis, resize) => { applyMirror(mirrorDialog, axis, resize); setMirrorDialog(null); }}
          onCancel={() => setMirrorDialog(null)}
        />
      )}

      <ImportFromPhotoDialog
        open={showImportDialog}
        initialFile={importInitialFile}
        onClose={() => setShowImportDialog(false)}
        onImport={handleImport}
        onRemoveFile={() => setImportInitialFile(null)}
        hasExistingDesign={hasDesign}
      />

      {isAdmin && (
        <PublishToCatalogDialog
          open={showPublishDialog}
          onClose={() => setShowPublishDialog(false)}
          title={patternName}
          width={grid[0]?.length ?? 0}
          height={grid.length}
          grid={grid}
          palette={palette}
          previewImage={publishPreviewImage}
        />
      )}

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

      <SavePatternDialog
        open={saveDialogOpen}
        defaultName={patternName}
        onSave={handleSavePattern}
        onSaved={(url) => {
          if (afterSaveAction === 'copyLink') {
            navigator.clipboard.writeText(url).then(() => showToast('Link copied — opens for your account only ✓'));
            setAfterSaveAction(null);
          } else {
            showToast('Saved ✓');
          }
        }}
        onClose={() => { setSaveDialogOpen(false); setAfterSaveAction(null); }}
      />

      <OpenPatternDialog
        open={openDialogOpen}
        onPick={(id) => { setOpenDialogOpen(false); loadPatternById(id); }}
        onClose={() => setOpenDialogOpen(false)}
      />

      {saveToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg pointer-events-none">
          {saveToast}
        </div>
      )}

      {resumeDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[380px] max-w-[90vw] text-center">
            <div className="text-3xl mb-2">💾</div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">Unsaved work from last time</h3>
            <p className="text-sm text-gray-600 mb-5">
              We found a pattern{resumeDraft.name ? ` — "${resumeDraft.name}"` : ''} you didn&apos;t save. Want to pick up where you left off?
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={discardResumeDraft}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >
                Discard
              </button>
              <button type="button" onClick={applyResumeDraft}
                className="flex-1 py-2 rounded-lg bg-rose-500 text-sm font-medium text-white hover:bg-rose-600"
              >
                Resume
              </button>
            </div>
          </div>
        </div>
      )}

      <FeatureRequestDialog
        open={showFeatureRequest}
        onSubmit={(importance) => {
          trackEvent('feedback_submitted', { importance });
          postEditorEvent('feedback_submitted', { importance });
        }}
        context={{
          patternWidth:             grid[0]?.length,
          patternHeight:            grid.length,
          colorsCount:              palette.length,
          editorTimeSeconds:        Math.floor((Date.now() - editorStartRef.current) / 1000),
          userChangedStitchesCount: editCountRef.current,
          exportedPdf:              hasExportedPdfRef.current,
        }}
        onClose={() => setShowFeatureRequest(false)}
      />

      <PatternQualityWidget
        open={showQualityFeedback}
        onSubmit={(rating, reason) => {
          trackEvent('pattern_quality_feedback', { rating, reason });
          postEditorEvent('pattern_quality_feedback', { rating, qualityReason: reason });
        }}
        onClose={() => setShowQualityFeedback(false)}
      />

      {showNamePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowNamePrompt(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-1">Name your pattern</h3>
            <p className="text-xs text-gray-500 mb-3">This name will appear on the PDF cover page.</p>
            <input
              autoFocus
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const name = nameInput.trim() || 'Cross-Stitch Pattern';
                  setPatternName(nameInput.trim());
                  setShowNamePrompt(false);
                  setPendingPdfTitle(name);
                  setShowModeDialog(true);
                }
                if (e.key === 'Escape') setShowNamePrompt(false);
              }}
              placeholder="e.g. Autumn Leaves"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const name = nameInput.trim() || 'Cross-Stitch Pattern';
                  setPatternName(nameInput.trim());
                  setShowNamePrompt(false);
                  setPendingPdfTitle(name);
                  setShowModeDialog(true);
                }}
                className="flex-1 py-2 rounded-lg bg-rose-500 text-sm font-medium text-white hover:bg-rose-600 transition-colors"
              >Set name &amp; continue</button>
              <button
                type="button"
                onClick={() => { setShowNamePrompt(false); setPendingPdfTitle('Cross-Stitch Pattern'); setShowModeDialog(true); }}
                className="py-2 px-3 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >Skip</button>
            </div>
          </div>
        </div>
      )}

      {showModeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModeDialog(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-1">Chart rendering mode</h3>
            <p className="text-xs text-gray-500 mb-3">How should stitches be drawn on chart pages?</p>
            <div className="flex flex-col gap-2">
              {([
                ['symbol',       'Symbols only',   'Black & white symbols — easiest to stitch from'],
                ['color-symbol', 'Color & Symbol', 'Coloured background with symbol overlay'],
                ['color',        'Color only',     'Solid colour fill, no symbols'],
              ] as const).map(([mode, label, desc]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => { setShowModeDialog(false); doDownloadPdf(pendingPdfTitle, mode); }}
                  className="flex flex-col items-start px-4 py-3 rounded-lg border border-gray-200 hover:border-rose-400 hover:bg-rose-50 text-left transition-colors"
                >
                  <span className="text-sm font-medium text-gray-800">{label}</span>
                  <span className="text-xs text-gray-500">{desc}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowModeDialog(false)}
              className="mt-3 w-full py-2 rounded-lg border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
            >Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
