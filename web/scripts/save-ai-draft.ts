// Track 2 (Opportunity 9) — the reusable pipeline script: takes an
// AI-generated source image through the same conversion the editor's
// "Save" button uses, and saves it to an account as a normal
// ConverterPattern — NOT the "Publish to Catalog" flow (no Pinterest
// pin, no live catalog entry, no public indexing). This mirrors exactly
// what an admin does by hand in the editor: import an image, convert it,
// click Save.
//
// Renamed from save-capybara-draft.ts (2026-08-08) once it was reused for
// a second design — it was never actually capybara-specific, only the
// filename and default --name were. See git history on this file for the
// capybara run's original commit.
//
// v3: smaller target size, plus removeConfetti and sizeToDesign ported
// verbatim from ConvertClient.tsx (both client-only, not part of
// pattern-converter.ts, so this script duplicates them rather than
// importing a 'use client' React component).
//
// 2026-08-08: stopped pre-flattening the source image to white before
// calling convertImage() — pattern-converter.ts is now alpha-aware itself
// (see its file header) and does a better job of it directly from real
// alpha data than this script's own flood-fill guess ever could.
// detectBackgroundByFloodFill()/eraseBackground() below are kept as a
// fallback for sources with NO alpha channel (e.g. Stability's output) —
// harmless no-op for a real-alpha source, since convertImage() already
// blanked the border cells this flood-fill starts from.
import { readFileSync } from 'fs';
import sharp from 'sharp';
import { convertImage } from '../src/lib/pattern-converter';
import { savePattern, updatePattern } from '../src/lib/pattern-storage';
import { renderCoverThumbnailPng } from '../src/lib/server-cover-thumbnail';
import { createGeneration, attachDraft } from '../src/lib/ai-design-generations';
import type { GroundingAssessment } from '../src/lib/trend-detection';

const IMAGE_PATH = process.argv[2];
const OWNER_ID = process.argv[3];
const NAME = process.argv[4] || 'AI-generated draft';
const EXISTING_PATTERN_ID = process.argv[5]; // if given, update in place instead of creating a new row
// Optional: path to a JSON file {theme, imagePrompt, signalSource,
// reasoning, imageProvider, grounding, targetWidth?, targetHeight?,
// colorPalette?} — output of detectTrend() plus which image provider
// generated IMAGE_PATH. When given, this run gets tracked in
// AiDesignGenerations (see docs/genai-growth/DESIGN_FEEDBACK_LOOP.md
// "Data store and provenance tracking"). Omit for a manual/non-AI-trend
// save (e.g. the Fawn design test, which explicitly skips detectTrend()).
const GENERATION_META_PATH = process.argv[6];

if (!IMAGE_PATH || !OWNER_ID) {
  console.error('Usage: save-ai-draft.ts <image.png> <ownerID> [name] [existingPatternId] [generationMetaPath]');
  process.exit(1);
}

interface GenerationMeta {
  theme: string;
  imagePrompt: string;
  signalSource: string;
  reasoning: string;
  imageProvider: string;
  grounding: GroundingAssessment;
  // Added 2026-08-08 (Olga's ask): detectTrend()'s researched popular size
  // and color combination, not just the theme. Optional — older
  // generation-meta files or hand-run generations may not have them.
  targetWidth?: number;
  targetHeight?: number;
  colorPalette?: string;
}

// Fallback when no generation-meta (and thus no researched targetWidth) is
// given — was previously a hardcoded constant used unconditionally.
const DEFAULT_TARGET_WIDTH = 80;
const MAX_COLORS = 25;

// Ported verbatim from ConvertClient.tsx's removeConfetti().
function removeConfetti(grid: number[][]): number[][] {
  const rows = grid.length;
  if (!rows) return grid;
  const cols = grid[0].length;
  const DIRS: [number, number][] = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const g = grid.map((r) => [...r]);

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

// Ported verbatim from ConvertClient.tsx's sizeToDesign(): trim to the
// content bounding box (cells >= 0) plus exactly 1 empty (-1) border cell
// on each side.
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
  const rStart = minRow - 1;
  const cStart = minCol - 1;
  const newRows = maxRow - minRow + 3;
  const newCols = maxCol - minCol + 3;
  return Array.from({ length: newRows }, (_, dr) =>
    Array.from({ length: newCols }, (_, dc) => {
      const or = rStart + dr, oc = cStart + dc;
      return (or >= 0 && or < rows && oc >= 0 && oc < cols) ? grid[or][oc] : -1;
    })
  );
}

// Flood-fills from every grid-border cell inward, following gradually-
// changing neighbor colors (per-channel RGB step <= tolerance) — a
// "magic wand with contiguous tolerance" over the already-quantized
// palette. Marks the reached region as background (true) for erasure.
function detectBackgroundByFloodFill(grid: number[][], palette: { r: number; g: number; b: number }[], tolerance: number): boolean[][] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const colorOf = (ci: number) => (ci >= 0 ? palette[ci] : null);
  const dist = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) =>
    Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));

  const DIRS: [number, number][] = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const stack: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
        if (!visited[r][c]) { visited[r][c] = true; stack.push([r, c]); }
      }
    }
  }

  while (stack.length) {
    const [r, c] = stack.pop()!;
    const cur = colorOf(grid[r][c]);
    if (!cur) continue;
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || visited[nr][nc]) continue;
      const next = colorOf(grid[nr][nc]);
      if (!next) continue;
      if (dist(cur, next) <= tolerance) { visited[nr][nc] = true; stack.push([nr, nc]); }
    }
  }
  return visited;
}

function eraseBackground(grid: number[][], mask: boolean[][]): number[][] {
  return grid.map((row, y) => row.map((ci, x) => (mask[y]?.[x] ? -1 : ci)));
}

// Ported verbatim from ConvertClient.tsx's "Remove Unused" menu action:
// drops palette entries no cell actually references (common after
// erasing background — some colors may have existed only there) and
// remaps grid indices to the shrunk palette.
function removeUnusedColors<P>(grid: number[][], palette: P[]): { grid: number[][]; palette: P[] } {
  const used = new Set<number>();
  for (const row of grid) for (const ci of row) if (ci >= 0) used.add(ci);
  if (used.size === palette.length) return { grid, palette };
  const newPalette = palette.filter((_, i) => used.has(i));
  const remap: Record<number, number> = {};
  let ni = 0;
  for (let i = 0; i < palette.length; i++) if (used.has(i)) remap[i] = ni++;
  const newGrid = grid.map((row) => row.map((ci) => (ci >= 0 ? remap[ci] ?? -1 : -1)));
  return { grid: newGrid, palette: newPalette };
}

async function main() {
  let generationId: string | undefined;
  let generationMeta: GenerationMeta | undefined;
  if (GENERATION_META_PATH) {
    generationMeta = JSON.parse(readFileSync(GENERATION_META_PATH, 'utf-8')) as GenerationMeta;
    generationId = await createGeneration({
      theme: generationMeta.theme,
      imagePrompt: generationMeta.imagePrompt,
      signalSource: generationMeta.signalSource,
      reasoning: generationMeta.reasoning,
      grounding: generationMeta.grounding,
      imageProvider: generationMeta.imageProvider,
      targetWidth: generationMeta.targetWidth,
      targetHeight: generationMeta.targetHeight,
      colorPalette: generationMeta.colorPalette,
    });
    console.log(`Generation tracked: ${generationId} (theme: "${generationMeta.theme}", grounding passesGate: ${generationMeta.grounding.passesGate})`);
  }

  // Researched targetWidth sets the conversion scale when available (small
  // quick-stitch motif vs. large detailed piece). Height is still derived
  // from the actual generated image's own aspect ratio rather than
  // targetHeight directly — this script only ever sees the already-
  // generated IMAGE_PATH, it doesn't call the image-generation API itself.
  // As of 2026-08-08, image-generation.ts's generateImageStability()/
  // generateImageOpenAI() CAN request a non-square aspect ratio matching
  // targetWidth/targetHeight (pickStabilityAspectRatio/pickOpenAiSize) —
  // whichever script actually generates IMAGE_PATH should pass that
  // through, so by the time it reaches here the image's real aspect ratio
  // already matches the research and this derivation just carries it
  // through correctly, with no distortion from convertImage()'s
  // fit:'fill' resize.
  const targetWidth = generationMeta?.targetWidth ?? DEFAULT_TARGET_WIDTH;

  const rawBuffer = readFileSync(IMAGE_PATH);
  const imageMeta = await sharp(rawBuffer).metadata();
  const targetHeight = Math.round(targetWidth * ((imageMeta.height ?? 1) / (imageMeta.width ?? 1)));

  const converted = await convertImage(
    rawBuffer,
    targetWidth,
    targetHeight,
    MAX_COLORS,
    'illustration',
    'final-only',
  );

  const cleanedGrid = removeConfetti(converted.grid);
  console.log(`Converted: ${converted.width}x${converted.height}, ${converted.palette.length} colors`);

  const bgMask = detectBackgroundByFloodFill(cleanedGrid, converted.palette, 30);
  const erasedGrid = eraseBackground(cleanedGrid, bgMask);
  const erasedCount = bgMask.flat().filter(Boolean).length;
  console.log(`Erased background: ${erasedCount} cells`);

  const sized = sizeToDesign(erasedGrid);
  const finalGrid = sized ?? cleanedGrid;
  if (sized) {
    console.log(`Size to Design: ${sized[0].length}x${sized.length} (from ${cleanedGrid[0].length}x${cleanedGrid.length})`);
  } else {
    console.log('Size to Design: no change (grid.length', cleanedGrid.length, ')');
  }

  const { grid: prunedGrid, palette: prunedPalette } = removeUnusedColors(finalGrid, converted.palette);
  console.log(`Remove Unused: ${converted.palette.length} -> ${prunedPalette.length} colors`);

  const finalWidth = prunedGrid[0]?.length ?? converted.width;
  const finalHeight = prunedGrid.length;

  const thumbnailBuffer = await renderCoverThumbnailPng(prunedGrid, prunedPalette);
  const thumbnail = `data:image/png;base64,${thumbnailBuffer.toString('base64')}`;

  let patternId: string;
  if (EXISTING_PATTERN_ID) {
    await updatePattern(EXISTING_PATTERN_ID, NAME, finalWidth, finalHeight, prunedPalette, prunedGrid, OWNER_ID, thumbnail);
    patternId = EXISTING_PATTERN_ID;
    console.log(`Updated pattern id: ${EXISTING_PATTERN_ID} (owner ${OWNER_ID})`);
  } else {
    patternId = await savePattern(NAME, finalWidth, finalHeight, prunedPalette, prunedGrid, OWNER_ID, thumbnail, undefined, generationId);
    console.log(`Saved pattern id: ${patternId} (owner ${OWNER_ID})`);
  }

  // Immutable "as-generated" snapshot, written once, here — before Olga
  // has ever opened this pattern in the editor. Only on the first save:
  // re-running this script against EXISTING_PATTERN_ID would otherwise
  // overwrite the snapshot with an already-edited state.
  if (generationId && !EXISTING_PATTERN_ID) {
    await attachDraft(generationId, { patternId, initialGrid: prunedGrid, initialPalette: prunedPalette });
    console.log(`Snapshot attached to generation ${generationId}`);
  }
}

main().catch((e) => {
  console.error('FAILED -', e instanceof Error ? e.stack : e);
  process.exit(1);
});
