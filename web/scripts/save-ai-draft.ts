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
// assumed "harmless no-op for a real-alpha source, since convertImage()
// already blanked the border cells this flood-fill starts from."
//
// 2026-08-09: that assumption is WRONG for a real no-alpha, sparse
// line-art source — found live (Olga's catch: a saved "Minimalist Line
// Art Face" draft rendered almost entirely empty on the site). Root
// cause traced step-by-step: `hasAlpha: false` on this particular OpenAI
// output (unlike other rounds' images, which did have real alpha), so
// the flood-fill fallback actually ran for real, not a no-op. It erased
// 9765/10000 cells (97.65%) — the tolerance-30 flood fill chained through
// several intermediate anti-aliased grey shades along the thin line's
// soft edges (the palette had 5 distinct greys) and tunneled from the
// white border all the way through to touch nearly everything, despite
// black and white themselves being far outside any single tolerance
// hop. `mode` was also hardcoded to `'illustration'` here regardless of
// actual image content — `image-analysis.ts`'s `analyzeImage()` already
// exists for exactly this and was never wired in. Both fixed below: mode
// is now chosen from a real classification, and the flood-fill fallback
// is skipped entirely when that classification is line-art/typography —
// content that's mostly-background-by-design and specifically vulnerable
// to this gradient-tunneling failure mode.
import { readFileSync } from 'fs';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { convertImage } from '../src/lib/pattern-converter';
import { savePattern, updatePattern } from '../src/lib/pattern-storage';
import { renderCoverThumbnailPng } from '../src/lib/server-cover-thumbnail';
import { createGeneration, attachDraft } from '../src/lib/ai-design-generations';
import { analyzeImage, imageTypeToMode } from '../src/lib/image-analysis';
import type { ConversionMode } from '../src/lib/image-analysis';
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
// 2026-08-09: for a plain manual image import (no detectTrend() research
// behind it — e.g. Olga's own source photos), there was previously no
// way to pick a target width without inventing a fake GenerationMeta
// just to carry targetWidth, which would wrongly pollute
// AiDesignGenerations with a record that isn't actually AI-trend-sourced.
// Optional 7th arg overrides the width directly instead.
const TARGET_WIDTH_OVERRIDE = process.argv[7] ? Number(process.argv[7]) : undefined;
// 2026-08-09: found live — analyzeImage() misclassified a genuinely flat
// cel-shaded illustration (bold flat color regions + white keyline
// separators, exactly what the outline-preservation system was built
// for) as 'typography' instead of 'illustration' — likely confused by
// the crisp bold outline/whisker strokes reading as text-like features
// to the heuristic. Since 'illustration' is only ever chosen when
// analyzeImage() itself returns that type (imageTypeToMode() has no
// confidence-based path INTO illustration, only into line-art), a
// type-level misclassification can't be worked around by a confidence
// threshold — needs a real manual override.
const MODE_OVERRIDE = process.argv[8] as ConversionMode | undefined;

if (!IMAGE_PATH || !OWNER_ID) {
  console.error('Usage: save-ai-draft.ts <image.png> <ownerID> [name] [existingPatternId] [generationMetaPath] [targetWidth]');
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

// 2026-08-11 (Olga's ask): before this, the AI-generated source image
// itself was never kept anywhere durable — only its text prompt and the
// post-conversion grid survived in AiDesignGenerations. Mirrors
// convert/route.ts's saveResearchCopy(): same bucket, sibling prefix.
// Best-effort, same as that function — a failed upload must not block
// saving the pattern the run was actually launched to produce.
const GENERATED_IMAGE_BUCKET = 'cross-stitch-designs';
const GENERATED_IMAGE_PREFIX = 'ai-generations';
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

async function uploadGeneratedImage(buffer: Buffer, sourcePath: string): Promise<string | undefined> {
  try {
    const ext = extname(sourcePath).replace('.', '') || 'png';
    const key = `${GENERATED_IMAGE_PREFIX}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
    await s3.send(new PutObjectCommand({
      Bucket: GENERATED_IMAGE_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    }));
    return key;
  } catch (e) {
    console.error('[save-ai-draft] generated-image upload failed:', e);
    return undefined;
  }
}

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
//
// 2026-08-09: found live, via a real destroyed line-art draft — the
// border-seeding loop below used to mark EVERY border cell as a
// background seed unconditionally, with no color check at all. Harmless
// for a typical "colorful subject on white" illustration (the border is
// almost always genuinely white), but for a portrait whose outline
// touches the frame edge — very plausible for line-art, and exactly what
// happened here (hairline touching the top edge, neck touching the
// bottom) — a BLACK border cell got seeded as a "background" starting
// point too. From there the flood correctly only walks to color-matching
// neighbors, but since it started ON the black stroke, it walked the
// ENTIRE connected black line, marking most of the outline itself as
// "background" and erasing it — confirmed directly: 557 of 653 black
// cells were getting marked, even at tolerance 0 (exact match), which
// should have made this impossible if the seed itself had been
// color-checked. Fixed: a border cell only seeds the fill if its color
// is itself close to the assumed background color (white, the fixed
// convention every image-generation prompt in this codebase already
// requires) — a real black-touching-the-border case no longer becomes a
// seed, so it can't start a chain through the line at all.
function detectBackgroundByFloodFill(grid: number[][], palette: { r: number; g: number; b: number }[], tolerance: number): boolean[][] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const colorOf = (ci: number) => (ci >= 0 ? palette[ci] : null);
  const dist = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) =>
    Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
  const WHITE = { r: 255, g: 255, b: 255 };
  // Seeding tolerance is deliberately generous (not the caller's
  // possibly-0 propagation tolerance) — a border cell just needs to be
  // "background-ish" to qualify as a seed; the walk itself still only
  // propagates through cells within the real `tolerance`.
  const SEED_TOLERANCE = 40;

  const DIRS: [number, number][] = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const stack: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
        if (visited[r][c]) continue;
        const color = colorOf(grid[r][c]);
        if (!color || dist(color, WHITE) > SEED_TOLERANCE) continue;
        visited[r][c] = true; stack.push([r, c]);
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
  // Read once, up front, so a generation record (if any) can carry the S3
  // key of the exact bytes being converted below rather than a re-read.
  const rawBuffer = readFileSync(IMAGE_PATH);

  let generationId: string | undefined;
  let generationMeta: GenerationMeta | undefined;
  if (GENERATION_META_PATH) {
    generationMeta = JSON.parse(readFileSync(GENERATION_META_PATH, 'utf-8')) as GenerationMeta;
    const generatedImageKey = await uploadGeneratedImage(rawBuffer, IMAGE_PATH);
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
      generatedImageKey,
    });
    console.log(`Generation tracked: ${generationId} (theme: "${generationMeta.theme}", grounding passesGate: ${generationMeta.grounding.passesGate})`);
    console.log(generatedImageKey ? `Source image archived: ${generatedImageKey}` : 'Source image archive FAILED (see error above) — generation record has no generatedImageKey');
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
  const targetWidth = TARGET_WIDTH_OVERRIDE ?? generationMeta?.targetWidth ?? DEFAULT_TARGET_WIDTH;

  const imageMeta = await sharp(rawBuffer).metadata();
  const targetHeight = Math.round(targetWidth * ((imageMeta.height ?? 1) / (imageMeta.width ?? 1)));

  // 2026-08-09: was hardcoded 'illustration' regardless of actual image
  // content — analyzeImage() already exists for exactly this.
  //
  // A `mode === 'photo' ? 'illustration' : mode` override briefly lived
  // here (same day) as a safety net against the classifier saying
  // 'photo' on AI-generated illustration content — reasonable back when
  // this script only ever saw detectTrend()-sourced images, which are
  // always meant to be illustration-style. Removed (Olga's call) once
  // this script started also handling Olga's own arbitrary image
  // imports (e.g. a real photo) — forcing every real photo through the
  // outline-detection pipeline (tuned for flat-color keylines, not
  // photographic noise/texture) risked unpredictable results on genuine
  // photos. Trust the classifier's real verdict everywhere now,
  // including a real 'photo'; if it misclassifies an illustration as a
  // photo, fix the classifier itself (image-analysis.ts) or pass
  // MODE_OVERRIDE explicitly, rather than silently overriding one
  // specific outcome for every caller.
  const analysis = await analyzeImage(rawBuffer);
  const mode = MODE_OVERRIDE ?? imageTypeToMode(analysis.type, analysis.confidence);
  console.log(`Image analysis: type=${analysis.type} confidence=${analysis.confidence} -> mode=${imageTypeToMode(analysis.type, analysis.confidence)}${MODE_OVERRIDE ? ` (overridden to ${MODE_OVERRIDE})` : ''}`, analysis.warnings);

  const converted = await convertImage(
    rawBuffer,
    targetWidth,
    targetHeight,
    MAX_COLORS,
    mode,
    'final-only',
  );

  const cleanedGrid = removeConfetti(converted.grid);
  console.log(`Converted: ${converted.width}x${converted.height}, ${converted.palette.length} colors`);

  // 2026-08-09: found live — the flood-fill fallback (meant to be a
  // no-op for real-alpha sources, see file header) actually ran for real
  // on a no-alpha line-art image and erased 97.65% of it, gradient-
  // tunneling through anti-aliased grey edge pixels along the thin line
  // (tolerance 30 let it chain white -> pale grey -> mid grey -> ... ,
  // each hop within tolerance of the last, even though white and black
  // themselves are nowhere near each other). First fix attempt just
  // skipped this for line-art entirely — safe, but left a real second
  // bug exposed: without ANY erasure, the huge white background survives
  // as a real "White" DMC palette color (Olga caught this too — checked
  // directly: 9175/10404 cells, 88%, all counted as a real color to
  // stitch). Real fix (Olga's proposal): now that
  // mergeGrayscaleTowardBlackWhite() (pattern-converter.ts) snaps
  // anti-aliased edge pixels to pure black/white first, the background
  // is uniformly one exact color with no gradient — tolerance 0 (exact
  // match only) can safely flood-fill just that connected white mass
  // and nothing else, since there's no intermediate shade left for it to
  // tunnel through to reach the line.
  // 2026-08-09: tolerance 30 had a second real bug, found on a mouse
  // illustration with a cream belly patch (DMC 3866, 245/240/229) fully
  // enclosed by fur. Its own anti-aliased edge pixel clustered to pure
  // white (DMC B5200) — same DMC as the real background — so the flood
  // fill reached it via ordinary border-connectivity and, since
  // |255-245| etc. maxes out at 26 <= 30, hopped straight from that edge
  // pixel onto the belly's real DMC 3866, erasing all 330+ of its cells
  // as "background". Traced the actual flood-fill parent chain to
  // confirm this was one direct hop, not a long gradient chain. Lowering
  // to 20 (comfortably under the 26-unit gap) verified empirically
  // against all 4 reference images (mouse, puppy, Lady of Perpetual
  // Love, kitten): erased-cell count is IDENTICAL at every tolerance
  // from 30 down to 5 for the other three — the real background never
  // needed more than a few units of slack — while the mouse's erased
  // count drops sharply once tolerance passes below 26, confirming this
  // was purely the belly bridge, not genuine anti-aliasing variance.
  // 2026-08-10: tolerance 20 had a third real bug — a ghost illustration
  // with NO drawn outline at all between its body and the page background
  // (a cute-flat-art style relying purely on the two being different
  // shades, 16 raw LAB units apart). pattern-converter.ts's
  // splitLargeMergedRegions() now recovers the body as its own DMC even
  // with zero drawn separation, but the two real DMC threads nearest
  // those two very-near-white source colors (blanc 248/248/248 vs 3865
  // 252/251/246) are themselves only 4 units apart — well inside the old
  // 20 tolerance, so erasure re-merged them right back. Lowered to 3:
  // re-verified empirically against all 5 reference images (ghost, mouse,
  // kitten, puppy, Lady of Perpetual Love, elephant) — erased-cell count
  // is unchanged (±7 cells on one image, noise) on every one except the
  // ghost, where the body now survives intact.
  const tolerance = mode === 'line-art' ? 0 : 3;
  const bgMask = detectBackgroundByFloodFill(cleanedGrid, converted.palette, tolerance);
  const erasedGrid = eraseBackground(cleanedGrid, bgMask);
  const erasedCount = bgMask.flat().filter(Boolean).length;
  console.log(`Erased background: ${erasedCount} cells (tolerance ${tolerance})`);

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
