// Reverse-parses a catalog kit PDF (produced by the external chart program +
// Converter.exe, see docs/integration/pdf-structure.md) back into the same
// grid+palette shape the photo-to-cross-stitch editor uses, so an existing
// catalog design can be opened and customized in the editor.
//
// The PDF is uncompressed PDF-1.3 (plain-text content streams), so this is
// text parsing, not OCR/vision. See
// docs/plan/web/Catalog PDF-to-Editable Conversion — Feasibility Findings.md
// for the original investigation this is based on.
import dmcColors from '@/data/dmc-colors.json';
import { SYMBOLS, symbolForIndex } from '@/lib/symbols';
import type { ConvertedPattern, DmcColor, PatternPalette } from '@/lib/pattern-converter';

const dmcByNumber = new Map<string, DmcColor>(
  (dmcColors as DmcColor[]).map(d => [d.number.toLowerCase(), d])
);

interface RawPaletteEntry {
  symbol: number;   // the PDF's own /N Do symbol index — not the editor's SYMBOLS[] glyph
  dmcNumber: string;
  r: number; g: number; b: number;
}

interface ChartPageData {
  pageN: number;
  pageM: number;
  pageCol: number;
  pageRow: number;
  winCols: number;
  winRows: number;
  cells: { col: number; row: number; symbol: number }[];
}

// Always take the LAST occurrence of "N 0 obj" for a given object number: PDFs
// with incremental updates can leave stale earlier copies of the same object
// number in the byte stream (observed on real catalog samples), and the last
// one is the canonical one (same reasoning as Converter.exe's own
// `TrailerRegex.Matches(pdf).Cast<Match>().LastOrDefault()`).
function getStream(pdfText: string, objNum: number): string | null {
  const re = new RegExp('(^|\\D)' + objNum + '\\s+0\\s+obj([\\s\\S]{0,300}?)stream\\r?\\n([\\s\\S]*?)endstream', 'gm');
  const matches = [...pdfText.matchAll(re)];
  if (!matches.length) return null;
  return matches[matches.length - 1][3];
}

// Page objects can also be duplicated across incremental updates; keep only
// the last "N 0 obj" per page object number, in encounter (= reading) order.
function listPageContentObjNums(pdfText: string): number[] {
  const pageObjRe = /(\d+)\s+0\s+obj\s*<<[^>]*?\/Type\s*\/Page\b[\s\S]*?\/Contents\s+(\d+)\s+0\s+R[\s\S]*?>>/g;
  const byPageNum = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = pageObjRe.exec(pdfText)) !== null) byPageNum.set(m[1], parseInt(m[2], 10));
  return [...byPageNum.values()];
}

function extractColumn(stream: string, headerLabel: string, nextLabel: string | null): string | null {
  const headerToken = `(${headerLabel}) Tj`;
  const startIdx = stream.indexOf(headerToken);
  if (startIdx < 0) return null;
  const contentStart = startIdx + headerToken.length;
  const endIdx = nextLabel ? stream.indexOf(`(${nextLabel}) Tj`, contentStart) : stream.length;
  return stream.slice(contentStart, endIdx < 0 ? stream.length : endIdx);
}

// One color-key page lists its rows column-by-column (Color, Symbol, Cat No.,
// Brand, Type, Stitches, Skeins), each column repeating the same N rows in
// the same top-to-bottom order — so entries are zipped back together by index.
function parsePaletteFromKeyPage(stream: string, warnings: string[]): RawPaletteEntry[] {
  const colorSection = extractColumn(stream, 'Color', 'Symbol');
  const symbolSection = extractColumn(stream, 'Symbol', 'Cat No.');
  const catNoSection = extractColumn(stream, 'Cat No.', 'Brand');
  if (!colorSection || !symbolSection || !catNoSection) {
    warnings.push('Color-key page missing an expected column header');
    return [];
  }

  // Fill color is either "r g b rg" (3-component) or "<gray> g" (1-component,
  // used for pure black/white swatches).
  const rgbMatches = [...colorSection.matchAll(
    /(?:([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg|([\d.]+)\s+g)\s*\n[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+re\s+f/g
  )];
  const symbolMatches = [...symbolSection.matchAll(/\/(\d+)\s+Do/g)];
  const catNoMatches = [...catNoSection.matchAll(/\(([^)]+)\)\s+Tj/g)];

  if (rgbMatches.length !== symbolMatches.length || rgbMatches.length !== catNoMatches.length) {
    warnings.push(
      `Color-key column length mismatch (color=${rgbMatches.length}, symbol=${symbolMatches.length}, catNo=${catNoMatches.length})`
    );
  }

  const n = Math.min(rgbMatches.length, symbolMatches.length, catNoMatches.length);
  const entries: RawPaletteEntry[] = [];
  for (let i = 0; i < n; i++) {
    const m = rgbMatches[i];
    const isGray = m[4] !== undefined;
    const r = isGray ? parseFloat(m[4]) : parseFloat(m[1]);
    const g = isGray ? parseFloat(m[4]) : parseFloat(m[2]);
    const b = isGray ? parseFloat(m[4]) : parseFloat(m[3]);
    entries.push({
      symbol: parseInt(symbolMatches[i][1], 10),
      dmcNumber: catNoMatches[i][1].trim(),
      r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255),
    });
  }
  return entries;
}

// A chart page's stitches are a sequence of "dx dy cm /N Do" — each step moves
// a running cursor by (dx, dy) in a 100-unit grid and draws symbol N at the
// resulting cell; blank cells are simply skipped (no Do emitted for them).
// Column letters follow spreadsheet-style base-26 (A, B, … Z, AA, AB, …).
function parseChartPage(stream: string): ChartPageData | null {
  // Small designs that fit on a single chart page have no "Page N of M
  // Position X:Y" label at all (no pagination needed) — treat that as the
  // (only) page 1 of 1 at position A:1, rather than failing to find it.
  const labelMatch = stream.match(/\(Page\s+(\d+)\s+of\s+(\d+)\s+Position\s+([A-Z]+):(\d+)\)\s*Tj/);
  const [pageN, pageM, colLetters, rowNum] = labelMatch
    ? [parseInt(labelMatch[1], 10), parseInt(labelMatch[2], 10), labelMatch[3], labelMatch[4]]
    : [1, 1, 'A', '1'];

  let pageCol = 0;
  for (const ch of colLetters) pageCol = pageCol * 26 + (ch.charCodeAt(0) - 64);
  pageCol -= 1;
  const pageRow = parseInt(rowNum, 10) - 1;

  const bgMatch = stream.match(/0\.000000\s+0\.000000\s+([\d.]+)\s+([\d.]+)\s+re\s+f/);
  if (!bgMatch) return null;
  const winCols = Math.round(parseFloat(bgMatch[1]) / 100);
  const winRows = Math.round(parseFloat(bgMatch[2]) / 100);

  const stepRe = /([\-\d.]+)\s+([\-\d.]+)\s+cm\s+\/(\d+)\s+Do/g;
  let x = 0, y = 0, m: RegExpExecArray | null;
  const cells: ChartPageData['cells'] = [];
  while ((m = stepRe.exec(stream)) !== null) {
    x += parseFloat(m[1]);
    y += parseFloat(m[2]);
    cells.push({ col: Math.round(x / 100), row: Math.round(y / 100), symbol: parseInt(m[3], 10) });
  }

  return { pageN, pageM, pageCol, pageRow, winCols, winRows, cells };
}

export interface ExtractResult {
  pattern: ConvertedPattern;
  warnings: string[];
}

export function extractPatternFromPdf(pdfBytes: Buffer): ExtractResult {
  const warnings: string[] = [];
  // Latin-1 so bytes map 1:1 to chars — this PDF format is uncompressed text.
  const text = pdfBytes.toString('latin1');

  if (text.includes('/Type/XRef') || text.includes('/XRefStm')) {
    throw new Error('This PDF uses xref streams (compressed/cross-reference streams) — not supported by this text-based extractor.');
  }

  const contentObjNums = listPageContentObjNums(text);

  const rawPalette: RawPaletteEntry[] = [];
  const chartPages: ChartPageData[] = [];
  for (const contentNum of contentObjNums) {
    const stream = getStream(text, contentNum);
    if (!stream) continue;
    if (stream.includes('(Cat No.)')) {
      rawPalette.push(...parsePaletteFromKeyPage(stream, warnings));
      continue;
    }
    const doCount = (stream.match(/\/\d+\s+Do/g) || []).length;
    if (doCount > 100) {
      const page = parseChartPage(stream);
      if (page) chartPages.push(page);
    }
  }

  if (rawPalette.length === 0) throw new Error('No color-key page found (no "Cat No." column detected)');
  if (chartPages.length === 0) throw new Error('No chart page found (no "Position X:Y" page label detected)');

  chartPages.sort((a, b) => a.pageN - b.pageN);
  if (chartPages[0].pageM !== chartPages.length) {
    warnings.push(`PDF declares ${chartPages[0].pageM} chart pages but only ${chartPages.length} were found/parsed`);
  }

  // Absolute per-tile offsets, via cumulative sums of each row/column's own
  // window size — handles the narrower/shorter "leftover" tile at the right
  // and bottom edges without assuming a uniform page size.
  const colWindowByPageCol = new Map<number, number>();
  const rowWindowByPageRow = new Map<number, number>();
  for (const p of chartPages) {
    colWindowByPageCol.set(p.pageCol, Math.max(colWindowByPageCol.get(p.pageCol) ?? 0, p.winCols));
    rowWindowByPageRow.set(p.pageRow, Math.max(rowWindowByPageRow.get(p.pageRow) ?? 0, p.winRows));
  }
  const maxPageCol = Math.max(...chartPages.map(p => p.pageCol));
  const maxPageRow = Math.max(...chartPages.map(p => p.pageRow));
  const colStart: number[] = [0];
  for (let i = 0; i <= maxPageCol; i++) colStart[i + 1] = colStart[i] + (colWindowByPageCol.get(i) ?? 0);
  const rowStart: number[] = [0];
  for (let i = 0; i <= maxPageRow; i++) rowStart[i + 1] = rowStart[i] + (rowWindowByPageRow.get(i) ?? 0);

  const width = colStart[maxPageCol + 1];
  const height = rowStart[maxPageRow + 1];

  // Assign real DMC name/RGB (case-insensitive — the PDF has entries like
  // "Blanc"/"Ecru" that only match dmc-colors.json in lowercase) and a real
  // editor symbol glyph from SYMBOLS. Catalog PDFs (unlike our own converter,
  // capped at 25 colors) can easily exceed SYMBOLS.length — symbolForIndex
  // falls back to plain numbers past that point so every color still gets a
  // distinct symbol, instead of every overflow color colliding on a shared
  // glyph and becoming indistinguishable on the chart.
  const palette: PatternPalette[] = rawPalette.map((p, i) => {
    const dmc = dmcByNumber.get(p.dmcNumber.toLowerCase());
    if (!dmc) warnings.push(`DMC number "${p.dmcNumber}" not found in dmc-colors.json — using PDF's own RGB`);
    return {
      number: dmc?.number ?? p.dmcNumber,
      name: dmc?.name ?? 'Unknown',
      r: dmc?.r ?? p.r,
      g: dmc?.g ?? p.g,
      b: dmc?.b ?? p.b,
      symbol: symbolForIndex(i),
      stitchCount: 0, // filled in below from actual grid usage
    };
  });
  if (palette.length > SYMBOLS.length) {
    warnings.push(`Design has ${palette.length} colors, more than the ${SYMBOLS.length} styled editor symbols — colors past that point use a plain-number fallback instead`);
  }

  const symbolToPaletteIdx = new Map(rawPalette.map((p, i) => [p.symbol, i]));
  const grid: number[][] = Array.from({ length: height }, () => new Array(width).fill(-1));
  let collisions = 0;
  for (const page of chartPages) {
    const baseCol = colStart[page.pageCol];
    const baseRow = rowStart[page.pageRow];
    for (const c of page.cells) {
      const absCol = baseCol + c.col;
      const absRow = baseRow + c.row;
      if (absRow < 0 || absRow >= height || absCol < 0 || absCol >= width) continue;
      const idx = symbolToPaletteIdx.get(c.symbol);
      if (idx === undefined) continue;
      if (grid[absRow][absCol] !== -1 && grid[absRow][absCol] !== idx) collisions++;
      grid[absRow][absCol] = idx;
    }
  }
  if (collisions > 0) warnings.push(`${collisions} cell(s) had conflicting values where chart page tiles overlapped`);

  const stitchCounts = new Array(palette.length).fill(0);
  for (const row of grid) for (const idx of row) if (idx >= 0) stitchCounts[idx]++;
  palette.forEach((p, i) => { p.stitchCount = stitchCounts[i]; });

  return { pattern: { grid, palette, width, height }, warnings };
}
