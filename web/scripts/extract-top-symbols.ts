// Finds the N most-used stitch symbols (by total stitch count) across the
// most-recent M catalog designs, and renders each one to a PNG.
//
// "Symbol" here is the vendor chart program's own vector glyph, drawn as a
// tiny Form XObject inside the kit PDF (see docs/plan/web/Catalog
// PDF-to-Editable Conversion — Feasibility Findings.md and
// src/lib/pdf-pattern-extractor.ts for the format background). The numeric
// ID a symbol gets ("/N Do") is assigned fresh per design by the external
// chart program — confirmed by inspection that the same ID draws different
// shapes in different PDFs — so symbols can't be compared by ID across
// designs. Instead each symbol's own content-stream bytes are canonicalized
// and hashed into a "shape fingerprint", and fingerprints are tallied across
// all sampled designs.
//
// Usage:
//   npx tsx scripts/extract-top-symbols.ts [--designs=1000] [--top=50] [--out=dir]
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { createHash } from 'crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const PDF_BASE = 'https://d2o1uvvg91z7o4.cloudfront.net/pdfs';

function arg(name: string, def: string): string {
  const found = process.argv.find(a => a.startsWith(`--${name}=`));
  return found ? found.split('=')[1] : def;
}

const NUM_DESIGNS = parseInt(arg('designs', '1000'), 10);
const TOP_N = parseInt(arg('top', '50'), 10);
const OUT_DIR = arg('out', 'top-symbols-out');
const CONCURRENCY = parseInt(arg('concurrency', '6'), 10);

// ── PDF text-stream helpers (same approach as pdf-pattern-extractor.ts) ────

// Always take the LAST occurrence of "N 0 obj" — incremental updates can
// leave stale earlier copies of the same object number in the byte stream.
function getObjectBody(pdfText: string, objNum: number): string | null {
  const re = new RegExp('(^|\\D)' + objNum + '\\s+0\\s+obj([\\s\\S]*?)endobj', 'gm');
  const matches = [...pdfText.matchAll(re)];
  if (!matches.length) return null;
  return matches[matches.length - 1][2];
}

function getStreamFromBody(body: string): string | null {
  const m = body.match(/stream\r?\n([\s\S]*?)endstream/);
  return m ? m[1] : null;
}

function listPageContentObjNums(pdfText: string): number[] {
  const pageObjRe = /(\d+)\s+0\s+obj\s*<<[^>]*?\/Type\s*\/Page\b[\s\S]*?\/Contents\s+(\d+)\s+0\s+R[\s\S]*?>>/g;
  const byPageNum = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = pageObjRe.exec(pdfText)) !== null) byPageNum.set(m[1], parseInt(m[2], 10));
  return [...byPageNum.values()];
}

function getStream(pdfText: string, objNum: number): string | null {
  const body = getObjectBody(pdfText, objNum);
  return body ? getStreamFromBody(body) : null;
}

// Maps a chart page's "/N" resource name -> underlying object number, for
// XObject dicts that look like a symbol table (>3 plain-numeric keys, to
// skip the small `/im1` cover-photo dict and named `/Im1`/`/Im2` raster
// thumbnail dicts seen on notes/page-map pages).
function findSymbolObjectMap(pdfText: string): Map<number, number> {
  const xoRe = /\/XObject\s*<<([^>]*)>>/g;
  const map = new Map<number, number>();
  let m: RegExpExecArray | null;
  while ((m = xoRe.exec(pdfText))) {
    // Plain-numeric keys ("/1", "/2", ...) only match the symbol table —
    // the cover-photo dict uses "/im1" and notes/page-map thumbnails use
    // "/Im1", "/Im2", both excluded by \d+ requiring digits right after
    // the slash. No minimum-count guard: a 2-3 color design legitimately
    // has only 2-3 entries here, and one was previously (wrongly) dropped
    // by a "> 3" threshold that existed for no real reason.
    const entries = [...m[1].matchAll(/\/(\d+)\s+(\d+)\s+0\s+R/g)];
    for (const e of entries) map.set(parseInt(e[1], 10), parseInt(e[2], 10));
  }
  return map;
}

// Canonicalize a symbol's content stream into a shape fingerprint. Two
// designs can use the exact same contour (e.g. a diamond outline) in two
// different thread colors — those must fingerprint identically. Color-
// setting ops (gray/RGB/CMYK, fill and stroke) are collapsed to a plain
// grayscale luminance value rather than stripped outright: some symbols
// draw a mark over a full-cell backdrop purely for contrast, and that
// light/dark contour pattern is part of the shape, not the color choice —
// reducing to luminance keeps that contrast while discarding hue. This is
// deliberately NOT thresholded to pure black/white here: two colors that
// are both "dark" by an absolute cutoff (e.g. navy backdrop + maroon mark)
// can still differ enough in actual luminance to read as contrast in the
// original — forcing both to "0" would erase a real, visible mark. Binarizing
// only happens later, per-image, when a renderer needs an actual ink/
// background split (see match-symbols.js's adaptive threshold). The actual
// path geometry (re/m/l/c), line width, and fill-vs-stroke choice (f/S/b)
// are left untouched. Remaining numbers are rounded to 2 decimals (float
// formatting differs slightly across designs/renders of the same logical
// shape) and whitespace is collapsed.
// Plain numbered capture groups, not named ones — this repo's tsconfig
// targets ES2017, which predates named capture group support and fails
// `next build`'s type-check step otherwise.
// Group map: 1-4 = rg/RG (r,g,b,op); 5-9 = k/K (c,m,y,k,op); 10-11 = g/G (gray,op).
const COLOR_OP_RE = /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+(rg|RG)\b|([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+(k|K)\b|([-\d.]+)\s+(g|G)\b/g;

function canonicalize(stream: string): string {
  return stream
    .trim()
    .replace(COLOR_OP_RE, (...args) => {
      const [, r, g1, b, rgOp, c, m, y, k, kOp, gray, grayOp] = args as (string | undefined)[];
      if (rgOp) {
        const lum = (parseFloat(r!) + parseFloat(g1!) + parseFloat(b!)) / 3;
        return `${lum.toFixed(2)} ${rgOp === 'rg' ? 'g' : 'G'}`;
      }
      if (kOp) {
        const kVal = parseFloat(k!);
        const light = 1 - Math.min(1, kVal + (parseFloat(c!) + parseFloat(m!) + parseFloat(y!)) / 3);
        return `${light.toFixed(2)} ${kOp === 'k' ? 'g' : 'G'}`;
      }
      // Plain gray op is already a 0-1 luminance value — pass through as-is
      // (still gets the general 2-decimal rounding pass below).
      return `${gray} ${grayOp}`;
    })
    .replace(/-?\d+\.\d+/g, (n) => parseFloat(n).toFixed(2))
    .replace(/\s+/g, ' ')
    .trim();
}

function fingerprint(canonical: string): string {
  return createHash('sha1').update(canonical).digest('hex').slice(0, 16);
}

// ── Extract per-design: symbol usage counts + each used symbol's canonical stream ──

interface DesignSymbolUsage {
  designId: number;
  // fingerprint -> { canonical stream, stitch count in this design }
  usage: Map<string, { canonical: string; count: number }>;
}

function extractSymbolUsage(pdfText: string, designId: number, warnings: string[]): DesignSymbolUsage | null {
  const contentObjNums = listPageContentObjNums(pdfText);
  const symbolObjMap = findSymbolObjectMap(pdfText);
  if (symbolObjMap.size === 0) {
    warnings.push(`design ${designId}: no symbol XObject table found`);
    return null;
  }

  // Resolve each symbol id -> canonical fingerprint (once per design).
  const symbolFingerprint = new Map<number, { fp: string; canonical: string }>();
  for (const [symId, objNum] of symbolObjMap) {
    const stream = getStream(pdfText, objNum);
    if (!stream) continue;
    const canonical = canonicalize(stream);
    symbolFingerprint.set(symId, { fp: fingerprint(canonical), canonical });
  }

  // Walk chart pages, count how many cells use each symbol id (reuses the
  // same "dx dy cm /N Do" cursor walk as pdf-pattern-extractor.ts, but we
  // only need counts here, not absolute grid positions).
  const usage = new Map<string, { canonical: string; count: number }>();
  let anyChartPage = false;
  for (const contentNum of contentObjNums) {
    const stream = getStream(pdfText, contentNum);
    if (!stream) continue;
    if (stream.includes('(Cat No.)')) continue; // color-key page, not a chart page

    const hasPositionLabel = /\(Page\s+\d+\s+of\s+\d+\s+Position\s+[A-Z]+:\d+\)\s*Tj/.test(stream);
    const doCount = (stream.match(/\/\d+\s+Do/g) || []).length;
    if (!hasPositionLabel && doCount <= 100) continue;
    anyChartPage = true;

    // Same q/Q-depth guard as parseChartPage: skip nested backstitch/
    // decoration markers so they don't inflate a real symbol's count.
    const tokenRe = /(q|Q)|([\-\d.]+)\s+([\-\d.]+)\s+cm\s+\/(\d+)\s+Do/g;
    let depth = 0, baselineDepth: number | null = null;
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(stream)) !== null) {
      if (m[1] === 'q') { depth++; continue; }
      if (m[1] === 'Q') { depth--; continue; }
      if (baselineDepth === null) baselineDepth = depth;
      if (depth !== baselineDepth) continue;
      const symId = parseInt(m[4], 10);
      const entry = symbolFingerprint.get(symId);
      if (!entry) continue;
      const existing = usage.get(entry.fp);
      if (existing) existing.count++;
      else usage.set(entry.fp, { canonical: entry.canonical, count: 1 });
    }
  }

  if (!anyChartPage) {
    warnings.push(`design ${designId}: no chart page found`);
    return null;
  }
  return { designId, usage };
}

// ── Render a symbol's canonical PDF content stream to a small PNG ─────────
// Small vocabulary observed across sampled designs: re (rect), f/S/b (fill/
// stroke/fill+stroke, plus f*/b* even-odd variants), g/G (gray fill/
// stroke), rg/RG (rgb fill/stroke), w (line width), cm (translate/scale
// matrix), m/l (moveto/lineto), c (cubic bezier). Coordinates live on a
// 0-100 unit cell (BBox is 0 0 1000 1000, but real content stays in the
// 0-100 range with a small translate).
function renderSymbolPng(canonical: string, cellPx = 64): Buffer {
  const canvas = createCanvas(cellPx, cellPx);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cellPx, cellPx);

  const scale = cellPx / 100; // content coordinates are on a 0-100 grid
  let fillStyle = '#000000';
  let strokeStyle = '#000000';
  let lineWidth = 1;
  let tx = 0, ty = 0; // cm translate (only translation observed so far)
  let path: { x: number; y: number }[] = [];
  let pathOpen = false;

  const toPx = (x: number, y: number) => [(x + tx) * scale, cellPx - (y + ty) * scale];

  function flushPath(mode: 'f' | 'S' | 'b' | 'n') {
    if (path.length === 0) { pathOpen = false; return; }
    ctx.beginPath();
    const [x0, y0] = toPx(path[0].x, path[0].y);
    ctx.moveTo(x0, y0);
    for (let i = 1; i < path.length; i++) {
      const [x, y] = toPx(path[i].x, path[i].y);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    if (mode === 'f' || mode === 'b') { ctx.fillStyle = fillStyle; ctx.fill(); }
    if (mode === 'S' || mode === 'b') { ctx.strokeStyle = strokeStyle; ctx.lineWidth = Math.max(lineWidth * scale, 1); ctx.stroke(); }
    path = [];
    pathOpen = false;
  }

  const tokenRe = /(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+re\b|(-?[\d.]+)\s+(-?[\d.]+)\s+m\b|(-?[\d.]+)\s+(-?[\d.]+)\s+l\b|1\s+0\s+0\s+1\s+(-?[\d.]+)\s+(-?[\d.]+)\s+cm\b|(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+c\b|([\d.]+)\s+g\b|([\d.]+)\s+G\b|([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg\b|([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+RG\b|([\d.]+)\s+w\b|(f\*?|S|s|b\*?|B\*?|n)\b/g;

  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(canonical)) !== null) {
    if (m[1] !== undefined) {
      // re: x y w h
      const [x, y, w, h] = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])];
      path = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
      pathOpen = true;
    } else if (m[5] !== undefined) {
      // moveto
      if (!pathOpen) path = [];
      path.push({ x: parseFloat(m[5]), y: parseFloat(m[6]) });
      pathOpen = true;
    } else if (m[7] !== undefined) {
      path.push({ x: parseFloat(m[7]), y: parseFloat(m[8]) });
    } else if (m[9] !== undefined) {
      tx = parseFloat(m[9]); ty = parseFloat(m[10]);
    } else if (m[11] !== undefined) {
      // bezier curve — approximate with its endpoint for this small-glyph renderer
      path.push({ x: parseFloat(m[15]), y: parseFloat(m[16]) });
    } else if (m[17] !== undefined) {
      const v = Math.round(parseFloat(m[17]) * 255);
      fillStyle = `rgb(${v},${v},${v})`;
    } else if (m[18] !== undefined) {
      const v = Math.round(parseFloat(m[18]) * 255);
      strokeStyle = `rgb(${v},${v},${v})`;
    } else if (m[19] !== undefined) {
      const [r, g, b] = [m[19], m[20], m[21]].map(v => Math.round(parseFloat(v) * 255));
      fillStyle = `rgb(${r},${g},${b})`;
    } else if (m[22] !== undefined) {
      const [r, g, b] = [m[22], m[23], m[24]].map(v => Math.round(parseFloat(v) * 255));
      strokeStyle = `rgb(${r},${g},${b})`;
    } else if (m[25] !== undefined) {
      lineWidth = parseFloat(m[25]);
    } else if (m[26] !== undefined) {
      const op = m[26];
      if (op === 'f' || op === 'f*') flushPath('f');
      else if (op === 'S' || op === 's') flushPath('S');
      else if (op === 'b' || op === 'b*' || op === 'B' || op === 'B*') flushPath('b');
      else flushPath('n');
    }
  }

  return canvas.toBuffer('image/png');
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
  const doc = DynamoDBDocumentClient.from(client);

  console.log(`Fetching the ${NUM_DESIGNS} highest DesignIDs...`);
  const designs: { DesignID: number; AlbumID: number }[] = [];
  let lastKey: Record<string, unknown> | undefined;
  while (designs.length < NUM_DESIGNS) {
    const res = await doc.send(new QueryCommand({
      TableName: 'CrossStitchItems',
      IndexName: 'DesignsByID-index',
      KeyConditionExpression: 'EntityType = :e',
      ExpressionAttributeValues: { ':e': 'DESIGN' },
      ScanIndexForward: false,
      Limit: Math.min(200, NUM_DESIGNS - designs.length),
      ExclusiveStartKey: lastKey,
    }));
    for (const item of res.Items ?? []) designs.push({ DesignID: item.DesignID, AlbumID: item.AlbumID });
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    if (!lastKey) break;
  }
  console.log(`Got ${designs.length} designs, DesignID range ${designs[designs.length - 1]?.DesignID}-${designs[0]?.DesignID}`);

  // fingerprint -> { canonical, totalCount (stitches), designCount }
  const globalUsage = new Map<string, { canonical: string; totalCount: number; designCount: number }>();
  const warnings: string[] = [];
  let processed = 0, failed = 0;

  async function processOne(d: { DesignID: number; AlbumID: number }) {
    const url = `${PDF_BASE}/${d.AlbumID}/Stitch${d.DesignID}_Kit.pdf`;
    try {
      const r = await fetch(url);
      if (!r.ok) { warnings.push(`design ${d.DesignID}: HTTP ${r.status}`); failed++; return; }
      const buf = Buffer.from(await r.arrayBuffer());
      const text = buf.toString('latin1');
      if (text.includes('/Type/XRef') || text.includes('/XRefStm')) {
        warnings.push(`design ${d.DesignID}: xref-stream PDF, unsupported`); failed++; return;
      }
      const result = extractSymbolUsage(text, d.DesignID, warnings);
      if (!result) { failed++; return; }
      for (const [fp, { canonical, count }] of result.usage) {
        const g = globalUsage.get(fp);
        if (g) { g.totalCount += count; g.designCount++; }
        else globalUsage.set(fp, { canonical, totalCount: count, designCount: 1 });
      }
    } catch (e) {
      warnings.push(`design ${d.DesignID}: ${(e as Error).message}`);
      failed++;
    } finally {
      processed++;
      if (processed % 50 === 0) console.log(`  ${processed}/${designs.length} processed (${failed} failed)...`);
    }
  }

  // Simple concurrency-limited pool.
  let idx = 0;
  async function worker() {
    while (idx < designs.length) {
      const d = designs[idx++];
      await processOne(d);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(`\nProcessed ${processed}, failed ${failed}, ${globalUsage.size} distinct symbol shapes found.`);

  // Full dump of every distinct shape found (not just the top N) — lets a
  // downstream step match each one against an external reference symbol set
  // (e.g. the chart program's own built-in glyph library) independent of
  // how many make the final top-N cut.
  writeFileSync(path.join(OUT_DIR, 'all-shapes.json'), JSON.stringify(
    [...globalUsage.entries()].map(([fp, v]) => ({
      fingerprint: fp,
      canonical: v.canonical,
      totalStitchCount: v.totalCount,
      designCount: v.designCount,
    }))
  ));

  const ranked = [...globalUsage.entries()]
    .sort((a, b) => b[1].designCount - a[1].designCount)
    .slice(0, TOP_N);

  const list = ranked.map(([fp, v], i) => ({
    rank: i + 1,
    fingerprint: fp,
    totalStitchCount: v.totalCount,
    designCount: v.designCount,
    image: `symbol-${String(i + 1).padStart(2, '0')}-${fp}.png`,
  }));

  writeFileSync(path.join(OUT_DIR, 'ranking.json'), JSON.stringify(list, null, 2));
  writeFileSync(path.join(OUT_DIR, 'warnings.txt'), warnings.join('\n'));

  for (const [fp, v] of ranked) {
    const i = list.find(e => e.fingerprint === fp)!.rank;
    const png = renderSymbolPng(v.canonical);
    writeFileSync(path.join(OUT_DIR, `symbol-${String(i).padStart(2, '0')}-${fp}.png`), png);
    if (process.env.DEBUG_SYMBOLS) {
      writeFileSync(path.join(OUT_DIR, `symbol-${String(i).padStart(2, '0')}-${fp}.txt`), v.canonical);
    }
  }

  // Contact sheet: all TOP_N symbols in a grid with rank + counts.
  const cols = 10;
  const rows = Math.ceil(list.length / cols);
  const cell = 90, pad = 10, labelH = 28;
  const sheet = createCanvas(cols * cell, rows * (cell + labelH));
  const sctx = sheet.getContext('2d') as unknown as CanvasRenderingContext2D;
  sctx.fillStyle = '#ffffff';
  sctx.fillRect(0, 0, sheet.width, sheet.height);
  for (const entry of list) {
    const col = (entry.rank - 1) % cols;
    const row = Math.floor((entry.rank - 1) / cols);
    const x = col * cell, y = row * (cell + labelH);
    const v = globalUsage.get(entry.fingerprint)!;
    const png = renderSymbolPng(v.canonical, cell - pad * 2);
    const img = await loadImage(png);
    sctx.drawImage(img as unknown as CanvasImageSource, x + pad, y + pad);
    sctx.fillStyle = '#000000';
    sctx.font = '11px sans-serif';
    sctx.textAlign = 'center';
    sctx.fillText(`#${entry.rank} (${entry.totalStitchCount})`, x + cell / 2, y + cell + 14);
  }
  writeFileSync(path.join(OUT_DIR, 'contact-sheet.png'), sheet.toBuffer('image/png'));

  console.log(`\nTop ${list.length} symbols:`);
  for (const e of list) {
    console.log(`  #${e.rank}: ${e.totalStitchCount} stitches across ${e.designCount} designs -> ${e.image}`);
  }
  console.log(`\nWrote ${OUT_DIR}/ranking.json, contact-sheet.png, and ${list.length} individual PNGs.`);
  if (warnings.length) console.log(`(${warnings.length} warnings — see ${OUT_DIR}/warnings.txt)`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
