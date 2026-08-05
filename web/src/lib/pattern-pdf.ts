import { PDFDocument, rgb, StandardFonts, PDFString, degrees } from 'pdf-lib';
import { randomUUID } from 'crypto';
import type { PDFPage, PDFFont, PDFImage } from 'pdf-lib';
import type { PatternPalette } from '@/lib/pattern-converter';
import { renderSymbolToPng } from '@/lib/server-symbol-renderer';
import { renderCoverThumbnailPng } from '@/lib/server-cover-thumbnail';

// A4 portrait
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 36;

// Chart page layout
const CHART_CELL = 10;   // pt per stitch cell
const LABEL_LEFT = 24;   // row-number gutter
const LABEL_TOP = 14;    // col-number gutter
const HEADER_H = 20;     // section info header
const FOOTER_H = 14;     // page number footer

const CHART_W = PAGE_W - MARGIN * 2 - LABEL_LEFT;
const CHART_H = PAGE_H - MARGIN * 2 - HEADER_H - LABEL_TOP - FOOTER_H;
const COLS_PER = Math.floor(CHART_W / CHART_CELL);
const ROWS_PER = Math.floor(CHART_H / CHART_CELL);

// Stitches of repeated context between adjacent chart pages (a "few stitches
// of overlap" so a color band that needs shifting across a page boundary can
// be aligned by eye, per user feedback 60cedb04-d36e-4938-a8f5-574d191e5c6a).
const OVERLAP = 3;

// Page start offsets along one axis: pages tile with stride < window size so
// consecutive pages repeat OVERLAP cells of the same content at their shared edge.
function tileOffsets(total: number, windowSize: number, overlap: number): number[] {
  if (total <= windowSize) return [0];
  const stride = Math.max(1, windowSize - overlap);
  const offsets: number[] = [];
  let offset = 0;
  for (;;) {
    offsets.push(offset);
    if (offset + windowSize >= total) break;
    offset += stride;
  }
  return offsets;
}

// Color key layout
const KEY_ROW_H = 18;          // row height
const KEY_HDR_BLOCK = 66;      // title + column headers + divider
const KEY_ROWS_PER_PAGE = Math.floor((PAGE_H - MARGIN * 2 - KEY_HDR_BLOCK) / KEY_ROW_H);
const SWATCH_W = 12;
const SWATCH_H = KEY_ROW_H - 4;

// Key column X positions — each wide enough for its header text at 7pt bold
const KX_COLOR = MARGIN;           // "Color" ~22pt wide
const KX_SYM   = MARGIN + 34;     // "Symbol" ~25pt wide
const KX_CATNO = MARGIN + 74;     // "Cat No." ~27pt; values right-aligned +50
const KX_BRAND = MARGIN + 130;    // "Brand" / "D.M.C."
const KX_TYPE  = MARGIN + 195;    // "Type" / "Stranded Cotton" ~53pt
const KX_ST    = MARGIN + 340;    // "Stitches"; values right-aligned +48
const KX_SK    = MARGIN + 400;    // "Skeins"; values right-aligned +40

const NAVY = rgb(0.04, 0.10, 0.30);
const OVERLAP_COLOR = rgb(0.85, 0.35, 0.05); // warm orange — distinct from thread colors and gray gridlines
const NOTES_BROWN = rgb(0.55, 0.27, 0.07); // matches the info-block color in the existing catalog kit PDFs

function col(r: number, g: number, b: number) { return rgb(r / 255, g / 255, b / 255); }

// Outlines a repeated-content band (drawn on top of cell fills/symbols so it stays
// visible in every chart mode) with a short rotated/horizontal "OVERLAP" caption.
function drawOverlapBand(p: PDFPage, x: number, y: number, width: number, height: number, font: PDFFont, vertical: boolean) {
  p.drawRectangle({ x, y, width, height, borderColor: OVERLAP_COLOR, borderWidth: 1.3 });
  const label = 'OVERLAP';
  const size = 6;
  const labelW = font.widthOfTextAtSize(label, size);
  if (vertical) {
    p.drawText(label, {
      x: x + width / 2 - size * 0.32,
      y: y + (height - labelW) / 2,
      size, font, color: OVERLAP_COLOR, rotate: degrees(90),
    });
  } else {
    p.drawText(label, {
      x: x + (width - labelW) / 2,
      y: y + height / 2 - size * 0.35,
      size, font, color: OVERLAP_COLOR,
    });
  }
}

function centerText(page: PDFPage, text: string, y: number, size: number, font: PDFFont, color = rgb(0, 0, 0)) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (PAGE_W - w) / 2, y, size, font, color });
}

export interface BuildPatternPdfInput {
  grid: number[][];
  palette: PatternPalette[];
  title?: string;
  author?: string | null;
  chartMode?: 'symbol' | 'color-symbol' | 'color';
  previewImage?: string | null;
}

// Builds the full print-ready PDF (cover, color key, notes/page-map, tiled
// chart pages) as a Buffer. Used by the /api/convert/pdf route (one call per
// download) and by the publish-to-catalog pipeline (3 calls in-process, one
// per kit variant: color+symbol / symbol / color) — kept out of route.ts
// because Next.js route files may only export the specific handler/config
// names it recognizes, not arbitrary helper functions.
export async function buildPatternPdf(input: BuildPatternPdfInput): Promise<Buffer> {
  const { grid, palette, title = 'Cross-Stitch Pattern', author = null, chartMode = 'symbol', previewImage = null } = input;

  if (!grid?.length || !palette?.length) {
    throw new Error('Invalid pattern data');
  }

  // Forensic-only fingerprint (not DRM) so a leaked/shared chart page can be
  // traced back to which download produced it.
  const downloadId = randomUUID().slice(0, 8);
  const fingerprint = `cross-stitch.com · ${title} · dl-${downloadId}`;

  const rows = grid.length;
  const cols = grid[0].length;

  // Count actual usage from the grid (don't trust stitchCount — may be stale after load)
  const usageCounts = new Array(palette.length).fill(0);
  for (const row of grid) for (const ci of row) if (ci >= 0 && ci < palette.length) usageCounts[ci]++;
  const usedPalette = palette
    .map((c, i) => ({ ...c, stitchCount: usageCounts[i] }))
    .filter(c => c.stitchCount > 0);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  // Cover title/attribution match the look of the existing catalog kit PDFs
  // (Times New Roman), which is a different face from the Helvetica used
  // for the rest of this document (key/chart pages) — left as-is for now.
  const titleFont = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const titleFontRegular = await pdf.embedFont(StandardFonts.TimesRoman);

  // Forensic-only fingerprint, tucked in the bottom-right corner of every
  // page (cover, key, notes, and every chart page) — not just the chart
  // pages — so a leaked/screenshotted page of any kind can be traced back
  // to which download produced it.
  function drawFingerprint(p: PDFPage) {
    const fpw = font.widthOfTextAtSize(fingerprint, 6);
    p.drawText(fingerprint, {
      x: PAGE_W - MARGIN - fpw, y: MARGIN / 2 + 2,
      size: 6, font, color: rgb(0.75, 0.75, 0.75),
    });
  }

  // Rasterize every unique symbol — black always, white only for color-symbol mode
  const uniqueSymbols = [...new Set(usedPalette.map(c => c.symbol))];
  const symbolImages      = new Map<string, PDFImage>();
  const symbolImagesWhite = new Map<string, PDFImage>();
  for (const sym of uniqueSymbols) {
    symbolImages.set(sym, await pdf.embedPng(renderSymbolToPng(sym)));
    if (chartMode === 'color-symbol') {
      symbolImagesWhite.set(sym, await pdf.embedPng(renderSymbolToPng(sym, '#ffffff')));
    }
  }

  // Pre-compute tiling dimensions so we know page numbers before adding pages
  const rowOffsets = tileOffsets(rows, ROWS_PER, OVERLAP);
  const colOffsets = tileOffsets(cols, COLS_PER, OVERLAP);
  const pageRows = rowOffsets.length;
  const pageCols = colOffsets.length;
  const totalChartPages = pageCols * pageRows;
  const keyPagesCount = Math.ceil(usedPalette.length / KEY_ROWS_PER_PAGE);

  // PDF page order: 1 cover · 2..1+keyPagesCount color key · 2+keyPagesCount page map · then chart pages
  const firstChartPageNum = 3 + keyPagesCount;

  // ── Page 1: Cover ──────────────────────────────────────────────────────────
  {
    const p = pdf.addPage([PAGE_W, PAGE_H]);
    drawFingerprint(p);

    // Title — Times New Roman Bold, matching the existing catalog kit PDFs
    // (e.g. https://d2o1uvvg91z7o4.cloudfront.net/pdfs/8/Stitch26_Kit.pdf:
    // 30pt title, 12pt "by", 20pt designer name, all Times New Roman).
    let y = PAGE_H - MARGIN - 44;
    const titleSize = title.length > 30 ? 20 : title.length > 20 ? 24 : 30;
    centerText(p, title, y, titleSize, titleFont, rgb(0.05, 0.05, 0.05));

    if (author) {
      y -= 18;
      centerText(p, 'by', y, 12, titleFontRegular, rgb(0.05, 0.05, 0.05));
      y -= 22;
      centerText(p, author, y, 20, titleFontRegular, rgb(0.05, 0.05, 0.05));
    }

    y -= 20;
    const siteUrl = 'https://cross-stitch.com';
    const siteSize = 11;
    const siteW = font.widthOfTextAtSize(siteUrl, siteSize);
    const siteX = (PAGE_W - siteW) / 2;
    const siteY = y;
    p.drawText(siteUrl, { x: siteX, y: siteY, size: siteSize, font, color: rgb(0.1, 0.3, 0.75) });
    const linkAnnot = pdf.context.obj({
      Type: 'Annot', Subtype: 'Link',
      Rect: [siteX, siteY - 2, siteX + siteW, siteY + siteSize],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(siteUrl) },
    });
    p.node.addAnnot(pdf.context.register(linkAnnot));

    // Stitch count line
    y -= 16;
    const stitchLine = `${cols} × ${rows} stitches · ${usedPalette.length} colors`;
    centerText(p, stitchLine, y, 9, font, rgb(0.55, 0.55, 0.55));

    // Cover image box — sized/positioned to match the existing catalog kit
    // PDFs (a modest ~40%-of-page-height box roughly centered in the lower
    // half, not a nearly-full-page image touching the bottom margin).
    const coverImgBoxW = Math.min(453, PAGE_W - MARGIN * 2);
    const coverImgBoxH = PAGE_H * 0.40;
    const coverImgTopY = PAGE_H * 0.69;

    if (previewImage) {
      // Embed the canvas capture (aida + crosses + shadows) as the cover image
      const b64 = previewImage.replace(/^data:image\/(jpeg|png|webp);base64,/, '');
      const imgBytes = Buffer.from(b64, 'base64');
      const embedded = previewImage.startsWith('data:image/png')
        ? await pdf.embedPng(imgBytes)
        : await pdf.embedJpg(imgBytes);
      const { width: iw, height: ih } = embedded.scale(1);
      const scale = Math.min(coverImgBoxW / iw, coverImgBoxH / ih);
      const imgW = iw * scale, imgH = ih * scale;
      p.drawImage(embedded, {
        x: (PAGE_W - imgW) / 2,
        y: coverImgTopY - imgH,
        width: imgW,
        height: imgH,
      });
    } else {
      // Fallback: the same Aida + shadowed-cross + fabric-hole recipe
      // PatternCanvas.tsx's capturePreview() uses client-side (ported to
      // @napi-rs/canvas), for when there's no live capture to embed — e.g.
      // batch-regenerating catalog PDFs from the extractor. Rendered at a
      // fixed 6-20px/cell resolution independent of the print box, same as
      // the client; large designs' texture just shrinks past the point of
      // being visible once scaled to fit, rather than needing a cutoff.
      const thumbPng = renderCoverThumbnailPng(grid, palette);
      const thumbImg = await pdf.embedPng(thumbPng);
      const { width: iw, height: ih } = thumbImg.scale(1);
      const scale = Math.min(coverImgBoxW / iw, coverImgBoxH / ih);
      const thumbW = iw * scale, thumbH = ih * scale;
      const tx = (PAGE_W - thumbW) / 2;
      const ty = coverImgTopY - thumbH;
      p.drawImage(thumbImg, { x: tx, y: ty, width: thumbW, height: thumbH });
      p.drawRectangle({ x: tx, y: ty, width: thumbW, height: thumbH, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 });
    }
  }

  // ── Pages 2-N: Color key ────────────────────────────────────────────────
  const KEY_ROW_START_Y = PAGE_H - MARGIN - KEY_HDR_BLOCK;

  for (let pageIdx = 0; pageIdx < keyPagesCount; pageIdx++) {
    const p = pdf.addPage([PAGE_W, PAGE_H]);
    drawFingerprint(p);

    // "Key" title — centered, large navy
    const keyTitleW = fontBold.widthOfTextAtSize('Key', 20);
    p.drawText('Key', {
      x: (PAGE_W - keyTitleW) / 2, y: PAGE_H - MARGIN - 22,
      size: 20, font: fontBold, color: NAVY,
    });
    if (keyPagesCount > 1) {
      const sub = `Page ${pageIdx + 1} of ${keyPagesCount}`;
      const subW = font.widthOfTextAtSize(sub, 7);
      p.drawText(sub, {
        x: (PAGE_W - subW) / 2, y: PAGE_H - MARGIN - 34,
        size: 7, font, color: rgb(0.5, 0.5, 0.5),
      });
    }

    // Column headers
    const hdrY = PAGE_H - MARGIN - 50;
    for (const [x, label] of [
      [KX_COLOR, 'Color'], [KX_SYM, 'Symbol'],
      [KX_CATNO, 'Cat No.'], [KX_BRAND, 'Brand'], [KX_TYPE, 'Type'],
      [KX_ST, 'Stitches'], [KX_SK, 'Skeins'],
    ] as [number, string][]) {
      p.drawText(label, { x, y: hdrY, size: 7, font: fontBold, color: NAVY });
    }

    // Divider below headers
    p.drawLine({
      start: { x: MARGIN, y: PAGE_H - MARGIN - 56 },
      end: { x: PAGE_W - MARGIN, y: PAGE_H - MARGIN - 56 },
      thickness: 0.4, color: rgb(0.72, 0.72, 0.72),
    });

    const baseIdx = pageIdx * KEY_ROWS_PER_PAGE;

    for (let slot = 0; slot < KEY_ROWS_PER_PAGE; slot++) {
      const i = baseIdx + slot;
      if (i >= usedPalette.length) break;

      const c = usedPalette[i];
      const rowBottom = KEY_ROW_START_Y - (slot + 1) * KEY_ROW_H;
      const swatchY   = rowBottom + 2;
      const textY     = rowBottom + KEY_ROW_H / 2 - 3;

      // Colour swatch
      p.drawRectangle({
        x: KX_COLOR, y: swatchY, width: SWATCH_W, height: SWATCH_H,
        color: col(c.r, c.g, c.b),
        borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 0.4,
      });

      // Symbol box (white with coloured border)
      p.drawRectangle({
        x: KX_SYM, y: swatchY, width: SWATCH_W, height: SWATCH_H,
        color: rgb(1, 1, 1),
        borderColor: col(c.r, c.g, c.b), borderWidth: 1,
      });
      const img = symbolImages.get(c.symbol);
      if (img) p.drawImage(img, { x: KX_SYM + 1, y: swatchY + 1, width: SWATCH_W - 2, height: SWATCH_H - 2 });

      // Cat No.
      p.drawText(c.number, { x: KX_CATNO, y: textY, size: 7, font, color: NAVY });

      // Brand
      p.drawText('D.M.C.', { x: KX_BRAND, y: textY, size: 7, font, color: NAVY });

      // Type
      p.drawText('Stranded Cotton', { x: KX_TYPE, y: textY, size: 7, font, color: NAVY });

      // Stitches
      p.drawText(String(c.stitchCount), { x: KX_ST, y: textY, size: 7, font, color: NAVY });

      // Skeins (approx 1800 stitches per DMC skein)
      const skeins = Math.max(0.1, Math.round(c.stitchCount / 1800 * 10) / 10);
      p.drawText(skeins.toFixed(1), { x: KX_SK, y: textY, size: 7, font, color: NAVY });
    }
  }

  // ── Notes + Page map ──────────────────────────────────────────────────────
  // Layout/colors matched to the existing catalog kit PDFs (Times New Roman
  // throughout, brown info block, blue "how pages fit together" note) —
  // e.g. https://d2o1uvvg91z7o4.cloudfront.net/pdfs/8/Stitch26_Kit.pdf.
  // The only content here with no equivalent in those PDFs is the overlap
  // explanation, since the original chart pages don't share stitches at
  // their edges — kept, but as its own small caption under the map instead
  // of mixed into the borrowed intro text.
  {
    const p = pdf.addPage([PAGE_W, PAGE_H]);
    drawFingerprint(p);

    // Title — regular weight in the original, not bold (unlike the cover title)
    centerText(p, 'Notes', PAGE_H - MARGIN - 20, 20, titleFontRegular, NAVY);

    // Info block — 14-count Aida measurements
    const COUNT = 14;
    const wIn  = (cols / COUNT).toFixed(1);
    const hIn  = (rows / COUNT).toFixed(1);
    const wMm  = Math.round(cols / COUNT * 25.4);
    const hMm  = Math.round(rows / COUNT * 25.4);
    const swIn = ((cols / COUNT) + 4).toFixed(1);
    const shIn = ((rows / COUNT) + 4).toFixed(1);
    const swMm = Math.round((cols / COUNT + 4) * 25.4);
    const shMm = Math.round((rows / COUNT + 4) * 25.4);

    const infoLines = [
      'Material Type:  Aida Generic White',
      'Sewing Count:  14/inch   or   55/100mm',
      `Design Size:  ${cols} x ${rows} stitches`,
      `Sewn Design Size:  ${wIn} x ${hIn} inches   or   ${wMm} x ${hMm} mm`,
      `Suggested Material Size:  ${swIn} x ${shIn} inches   or   ${swMm} x ${shMm} mm`,
      'Stitch Style:  Cross-stitch Using 2 strands',
    ];

    const infoLineH = 16;
    const infoStartY = PAGE_H - MARGIN - 48;
    const maxInfoW = Math.max(...infoLines.map(l => titleFontRegular.widthOfTextAtSize(l, 12)));
    const infoX = (PAGE_W - maxInfoW) / 2;
    for (let i = 0; i < infoLines.length; i++) {
      p.drawText(infoLines[i], {
        x: infoX, y: infoStartY - i * infoLineH,
        size: 12, font: titleFontRegular, color: NOTES_BROWN,
      });
    }

    // A single-page design has nothing to map — the original catalog PDFs
    // skip the "how pages fit together" text and the page-map grid
    // entirely in that case rather than showing a pointless 1x1 box, so
    // this whole section (intro text, grid, overlap note) only renders
    // when there's an actual multi-page layout to explain.
    const hasOverlap = pageCols > 1 || pageRows > 1;
    if (hasOverlap) {
      const introY = infoStartY - infoLines.length * infoLineH - 28;
      const introLines = [
        'Below is a plan showing how the chart pages fit together.',
        'The page number is shown at the top left of each chart page.',
      ];
      const introX = (PAGE_W - Math.max(...introLines.map(l => titleFontRegular.widthOfTextAtSize(l, 9)))) / 2;
      introLines.forEach((line, i) => p.drawText(line, { x: introX, y: introY - i * 14, size: 9, font: titleFontRegular, color: NAVY }));

      // Grid — cells labeled A:1, B:1, A:2, B:2 …
      const gridTopY   = introY - (introLines.length - 1) * 14 - 18;
      const gridAvailH = gridTopY - MARGIN;
      const gridAvailW = PAGE_W - MARGIN * 2;
      // Capped well below gridAvailH/gridAvailW — those spans nearly the whole
      // rest of the page, which stretched the map into a huge block. The
      // original catalog PDFs use a compact ~53.5x71pt-per-cell map with room
      // to spare below it; matched here instead of filling all available space.
      const cellW = Math.min(60, gridAvailW / pageCols);
      const cellH = Math.min(75, gridAvailH / pageRows);
      const gridTotalW = cellW * pageCols;
      const gridX = MARGIN + (gridAvailW - gridTotalW) / 2;

      for (let pr = 0; pr < pageRows; pr++) {
        for (let pc = 0; pc < pageCols; pc++) {
          const mx = gridX + pc * cellW;
          const my = gridTopY - (pr + 1) * cellH;
          const label = `${String.fromCharCode(65 + pc)}:${pr + 1}`;

          p.drawRectangle({
            x: mx, y: my, width: cellW, height: cellH,
            color: rgb(1, 1, 1),
            borderColor: rgb(0.15, 0.15, 0.15), borderWidth: 1,
          });

          const lw = titleFontRegular.widthOfTextAtSize(label, 11);
          p.drawText(label, {
            x: mx + (cellW - lw) / 2, y: my + cellH / 2 - 5,
            size: 11, font: titleFontRegular, color: NAVY,
          });
        }
      }

      // Our own addition, with no equivalent in the original catalog PDFs:
      // a small caption under the map explaining the overlap bands, styled
      // like the footer legend repeated on every chart page rather than
      // blended into the borrowed intro text above.
      const gridBottomY = gridTopY - pageRows * cellH;
      const overlapNoteLines = [
        `Orange bands mark a ${OVERLAP}-stitch overlap at touching page edges —`,
        'those stitches repeat exactly on the neighboring page.',
      ];
      const overlapX = (PAGE_W - Math.max(...overlapNoteLines.map(l => font.widthOfTextAtSize(l, 8)))) / 2;
      overlapNoteLines.forEach((line, i) => p.drawText(line, {
        x: overlapX, y: gridBottomY - 18 - i * 11, size: 8, font, color: OVERLAP_COLOR,
      }));
    }
  }

  // ── Chart pages ────────────────────────────────────────────────────────────
  for (let pr = 0; pr < pageRows; pr++) {
    for (let pc = 0; pc < pageCols; pc++) {
      const r0 = rowOffsets[pr];
      const r1 = Math.min(r0 + ROWS_PER, rows);
      const c0 = colOffsets[pc];
      const c1 = Math.min(c0 + COLS_PER, cols);
      const pageNum = firstChartPageNum + pr * pageCols + pc;

      const p = pdf.addPage([PAGE_W, PAGE_H]);

      // Header — A:1 label top-left, title top-right
      const chartLabel = `${String.fromCharCode(65 + pc)}:${pr + 1}`;
      p.drawText(chartLabel, {
        x: MARGIN, y: PAGE_H - MARGIN - 14,
        size: 9, font: fontBold, color: NAVY,
      });
      p.drawText(title, {
        x: PAGE_W - MARGIN - fontBold.widthOfTextAtSize(title, 8),
        y: PAGE_H - MARGIN - 14,
        size: 8, font: fontBold, color: rgb(0.3, 0.3, 0.3),
      });

      // Grid position: the original catalog PDFs center the chart on the
      // page (checked against Fox1.scc's single chart page — background
      // rect margins came out to 86.3pt top / 86.31pt bottom, 65.3pt left /
      // 65.1pt right, i.e. centered both ways) rather than anchoring it to
      // the top-left corner, which left a large empty gap below/right of
      // small designs. Only safe to do when there's a single page —
      // independently centering each tile of a multi-page design would
      // throw off the physical alignment between adjacent printed pages.
      const isSinglePage = pageCols === 1 && pageRows === 1;
      // Cell size: fixed CHART_CELL keeps the pagination math (COLS_PER/
      // ROWS_PER, tile offsets) correct for multi-page designs, but the
      // original catalog PDFs actually size cells per design to fill the
      // page — Fox1.scc (single page, 27x36) comes out to ~17.2pt/cell,
      // noticeably bigger than our fixed 10pt. Safe to enlarge only for a
      // single page: it's already guaranteed to fit at 10pt, so making
      // cells bigger (up to a sane cap, and never past what still fits)
      // can't push it onto a second page.
      const availW = PAGE_W - MARGIN * 2 - LABEL_LEFT;
      const availH = (PAGE_H - MARGIN - HEADER_H - LABEL_TOP) - (MARGIN + FOOTER_H);
      const idealCs = Math.min(availW / (c1 - c0), availH / (r1 - r0));
      const cs = isSinglePage ? Math.max(CHART_CELL, Math.min(30, idealCs)) : CHART_CELL;
      const gridW = (c1 - c0) * cs;
      const gridH = (r1 - r0) * cs;
      const gx = isSinglePage
        ? MARGIN + LABEL_LEFT + (PAGE_W - MARGIN * 2 - LABEL_LEFT - gridW) / 2
        : MARGIN + LABEL_LEFT;                                // grid left edge
      const availTopY = PAGE_H - MARGIN - HEADER_H - LABEL_TOP;
      const availBottomY = MARGIN + FOOTER_H;
      const gy = isSinglePage
        ? availTopY - (availTopY - availBottomY - gridH) / 2
        : availTopY;                                          // grid top edge

      // Column number labels (every 10, 1-indexed)
      for (let c = c0; c < c1; c++) {
        if ((c + 1) % 10 === 0) {
          const label = String(c + 1);
          const lw = font.widthOfTextAtSize(label, 6);
          p.drawText(label, {
            x: gx + (c - c0) * cs + (cs - lw) / 2,
            y: gy + 2,
            size: 6, font, color: rgb(0.35, 0.35, 0.35),
          });
        }
      }

      // Row number labels (every 10, 1-indexed)
      for (let r = r0; r < r1; r++) {
        if ((r + 1) % 10 === 0) {
          const label = String(r + 1);
          const lw = font.widthOfTextAtSize(label, 6);
          p.drawText(label, {
            x: MARGIN + LABEL_LEFT - lw - 3,
            y: gy - (r - r0 + 1) * cs + 2,
            size: 6, font, color: rgb(0.35, 0.35, 0.35),
          });
        }
      }

      // Cell contents
      for (let r = r0; r < r1; r++) {
        for (let c = c0; c < c1; c++) {
          const ci = grid[r][c];
          const pal = palette[ci];
          if (!pal) continue;
          const cx = gx + (c - c0) * cs;
          const cy = gy - (r - r0 + 1) * cs;
          if (chartMode === 'color' || chartMode === 'color-symbol') {
            p.drawRectangle({ x: cx, y: cy, width: cs, height: cs, color: col(pal.r, pal.g, pal.b) });
          }
          if (chartMode !== 'color') {
            const lum = (pal.r * 299 + pal.g * 587 + pal.b * 114) / 1000;
            const imgMap = (chartMode === 'color-symbol' && lum < 128) ? symbolImagesWhite : symbolImages;
            const img = imgMap.get(pal.symbol);
            if (img) p.drawImage(img, { x: cx + 1, y: cy + 1, width: cs - 2, height: cs - 2 });
          }
        }
      }

      // Thin cell grid lines
      const thinGray = rgb(0.78, 0.78, 0.78);
      const thickGray = rgb(0.4, 0.4, 0.4);

      // Vertical lines
      for (let c = c0; c <= c1; c++) {
        const lx = gx + (c - c0) * cs;
        const isBold = (c - c0) % 10 === 0 || c === c1;
        p.drawLine({
          start: { x: lx, y: gy },
          end: { x: lx, y: gy - gridH },
          thickness: isBold ? 0.7 : 0.25,
          color: isBold ? thickGray : thinGray,
        });
      }

      // Horizontal lines
      for (let r = r0; r <= r1; r++) {
        const ly = gy - (r - r0) * cs;
        const isBold = (r - r0) % 10 === 0 || r === r1;
        p.drawLine({
          start: { x: gx, y: ly },
          end: { x: gx + gridW, y: ly },
          thickness: isBold ? 0.7 : 0.25,
          color: isBold ? thickGray : thinGray,
        });
      }

      // Overlap bands — mark the OVERLAP-stitch strips shared with a neighboring
      // page (drawn on top of cells/gridlines so they stay visible in every mode)
      if (pc > 0) {
        drawOverlapBand(p, gx, gy - gridH, OVERLAP * cs, gridH, font, true);
      }
      if (pc < pageCols - 1) {
        drawOverlapBand(p, gx + gridW - OVERLAP * cs, gy - gridH, OVERLAP * cs, gridH, font, true);
      }
      if (pr > 0) {
        drawOverlapBand(p, gx, gy - OVERLAP * cs, gridW, OVERLAP * cs, font, false);
      }
      if (pr < pageRows - 1) {
        drawOverlapBand(p, gx, gy - gridH, gridW, OVERLAP * cs, font, false);
      }

      // Footer — page number
      const footer = `Page ${pageNum} of ${firstChartPageNum + totalChartPages - 1}`;
      const fw = font.widthOfTextAtSize(footer, 8);
      p.drawText(footer, {
        x: (PAGE_W - fw) / 2, y: MARGIN / 2 + 2,
        size: 8, font, color: rgb(0.5, 0.5, 0.5),
      });

      drawFingerprint(p);

      // Footer legend, repeated on every chart page (not just the Notes page)
      // so the reminder is right where the orange band actually appears.
      // On its own centered line above the page number (not squeezed next
      // to it on the same row) so it can be a genuinely legible size
      // without any risk of the two touching.
      if (pageCols > 1 || pageRows > 1) {
        const legendText = `Orange = ${OVERLAP}-stitch overlap with the neighboring page — stitch it once`;
        centerText(p, legendText, MARGIN / 2 + 13, 9, font, OVERLAP_COLOR);
      }
    }
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
