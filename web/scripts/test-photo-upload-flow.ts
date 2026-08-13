// Reusable end-to-end test of the real "upload a photo -> save a design"
// flow a site visitor goes through — NOT the AI-draft pipeline
// (save-ai-draft.ts), which is a different admin tool with its own extra
// steps (background erasure, Size to Design) that a real photo import does
// NOT run automatically. This script only replicates what actually runs
// automatically for a real upload:
//   1. POST /api/convert against a real (possibly deployed) site — same
//      endpoint, same multipart fields ImportFromPhotoDialog.tsx sends.
//   2. Aspect-ratio padding into the requested width x height box, ported
//      verbatim from ImportFromPhotoDialog.tsx's convert().
//   3. removeConfetti(), ported verbatim from ConvertClient.tsx (also
//      duplicated in save-ai-draft.ts for the same reason: it's a local
//      function in a 'use client' component, not importable).
//   4. Thumbnail generation matching pattern-thumbnail.ts's
//      generatePatternThumbnail() exactly (canvas-based, browser-only) —
//      reimplemented here with sharp against a raw RGB buffer instead of
//      canvas, same cellSize/background/JPEG-quality math.
//   5. POST /api/converter/patterns with a real session cookie — same as
//      clicking Save.
// Deliberately does NOT run sizeToDesign(), background erasure, or Remove
// Unused — those are manual editor actions a real photo upload never
// triggers on its own; running them here would test something other than
// what actually happens on import.
//
// Requires SESSION_SECRET in the environment (matches whatever site you
// point --site at — pull the deployed value with
// `eb printenv cross-stitch-com-env-clone` if testing against the live
// clone) so it can mint a session cookie via createSessionToken(), the
// same helper _mint-owner-session.ts uses.
import { readFileSync } from 'fs';
import { extname } from 'path';
import sharp from 'sharp';
import { createSessionToken, SESSION_COOKIE } from '../src/lib/session';
import type { ConvertedPattern, PatternPalette } from '../src/lib/pattern-converter';

interface Args {
  imagePath: string;
  ownerID: string;
  name: string;
  width: number;
  height: number;
  colors: number;
  mode: string;
  site: string;
}

function parseArgs(): Args {
  const [imagePath, ownerID, name] = process.argv.slice(2);
  if (!imagePath || !ownerID) {
    console.error('Usage: npx tsx scripts/test-photo-upload-flow.ts <image> <ownerID> [name] [width=100] [height=100] [colors=30] [mode=auto] [site=http://cross-stitch-com-clone.us-east-1.elasticbeanstalk.com]');
    process.exit(1);
  }
  return {
    imagePath,
    ownerID,
    name: name || 'Upload-flow test',
    width: Number(process.argv[5] ?? 100),
    height: Number(process.argv[6] ?? 100),
    colors: Number(process.argv[7] ?? 30),
    mode: process.argv[8] ?? 'auto',
    site: process.argv[9] ?? 'http://cross-stitch-com-clone.us-east-1.elasticbeanstalk.com',
  };
}

// Ported verbatim from ConvertClient.tsx's removeConfetti().
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

// Server-side equivalent of pattern-thumbnail.ts's generatePatternThumbnail()
// (canvas-only, browser-side) — same cellSize/background/JPEG-quality math,
// built from a raw RGB buffer instead of a <canvas>.
async function generateThumbnail(grid: number[][], palette: PatternPalette[], maxW = 240, maxH = 160): Promise<string> {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (!rows || !cols) return '';
  const cellSize = Math.max(1, Math.min(Math.floor(maxW / cols), Math.floor(maxH / rows)));
  const w = cols * cellSize, h = rows * cellSize;

  const BG: [number, number, number] = [0xf5, 0xf0, 0xeb];
  const rgb = Buffer.alloc(w * h * 3);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ci = grid[r][c];
      const color = ci >= 0 && ci < palette.length ? palette[ci] : null;
      const [pr, pg, pb] = color ? [color.r, color.g, color.b] : BG;
      for (let dy = 0; dy < cellSize; dy++) {
        for (let dx = 0; dx < cellSize; dx++) {
          const x = c * cellSize + dx, y = r * cellSize + dy;
          const idx = (y * w + x) * 3;
          rgb[idx] = pr; rgb[idx + 1] = pg; rgb[idx + 2] = pb;
        }
      }
    }
  }
  const jpeg = await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 65 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

async function main() {
  const args = parseArgs();
  const secret = process.env.SESSION_SECRET;
  if (!secret) { console.error('SESSION_SECRET not set — see file header'); process.exit(1); }

  const buffer = readFileSync(args.imagePath);
  const ext = extname(args.imagePath).replace('.', '').toLowerCase();
  const contentType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/png';

  // Step 1 — same endpoint, same fields as ImportFromPhotoDialog.tsx's convert().
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(buffer)], { type: contentType }), `upload.${ext}`);
  form.append('width', String(args.width));
  form.append('height', String(args.height));
  form.append('colors', String(args.colors));
  form.append('mode', args.mode);
  form.append('colorDistanceMode', 'cie76');
  form.append('researchConsent', 'false');
  form.append('keepForReuse', 'true');

  const convertResp = await fetch(`${args.site}/api/convert`, { method: 'POST', body: form });
  if (!convertResp.ok) throw new Error(`convert failed: ${convertResp.status} ${await convertResp.text()}`);
  const data = await convertResp.json() as ConvertedPattern;
  console.log(`Converted: ${data.width}x${data.height}, ${data.palette.length} colors`);
  console.log(`sourceImageKey: ${data.sourceImageKey ?? '(none)'}`);
  console.log(`sourceImageMaskKey: ${data.sourceImageMaskKey ?? '(none — no real transparency in source)'}`);

  // Step 2 — aspect-ratio padding into the requested box, ported verbatim
  // from ImportFromPhotoDialog.tsx's convert(). A no-op when the source's
  // aspect ratio already matches width:height.
  const meta = await sharp(buffer).metadata();
  const aspectRatio = (meta.width ?? 1) / (meta.height ?? 1);
  let innerW = args.width, innerH = args.height;
  const fitH = Math.round(args.width / aspectRatio);
  if (fitH <= args.height) { innerH = Math.max(10, fitH); }
  else { innerW = Math.max(10, Math.round(args.height * aspectRatio)); innerH = args.height; }
  const padTop = Math.floor((args.height - innerH) / 2);
  const padLeft = Math.floor((args.width - innerW) / 2);
  const paddedGrid: number[][] = Array.from({ length: args.height }, () => Array(args.width).fill(-1));
  for (let r = 0; r < data.grid.length; r++)
    for (let c = 0; c < data.grid[r].length; c++) {
      const or = padTop + r, oc = padLeft + c;
      if (or < args.height && oc < args.width) paddedGrid[or][oc] = data.grid[r][c];
    }
  console.log(`Padded to ${args.width}x${args.height} (pad top=${padTop} left=${padLeft})`);

  // Step 3 — confetti removal, exactly as handleImport() runs it.
  const confettiResult = removeConfetti(paddedGrid);
  console.log(`Confetti removal: ${confettiResult.changed ? 'cleaned up stray stitches' : 'nothing to clean'}`);

  // Step 4 — thumbnail, matching generatePatternThumbnail() exactly.
  const thumbnail = await generateThumbnail(confettiResult.grid, data.palette);
  console.log(`Thumbnail: ${thumbnail.length} bytes (data URL)`);

  // Step 5 — Save, same as clicking Save (POST, since this is always a
  // first save in this script — no existing-pattern-id support needed for
  // a flow test).
  const token = await createSessionToken({ userId: args.ownerID, email: 'upload-flow-test@example.com' });
  const saveResp = await fetch(`${args.site}/api/converter/patterns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE}=${token}` },
    body: JSON.stringify({
      name: args.name,
      width: args.width, height: args.height,
      palette: data.palette, grid: confettiResult.grid,
      thumbnail,
      sourceImageKey: data.sourceImageKey,
      sourceImageMaskKey: data.sourceImageMaskKey,
    }),
  });
  if (!saveResp.ok) throw new Error(`save failed: ${saveResp.status} ${await saveResp.text()}`);
  const { id } = await saveResp.json() as { id: string };
  console.log(`Saved pattern id: ${id} (owner ${args.ownerID})`);
}

main().catch((e) => { console.error('FAILED -', e instanceof Error ? e.stack : e); process.exit(1); });
