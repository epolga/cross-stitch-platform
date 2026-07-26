# Catalog PDF-to-Editable Conversion — Feasibility Findings

**Status as of 2026-07-26: investigated, not yet built. Olga wants to pick
this up later today or tomorrow.** Nothing implemented yet — this doc is
purely the findings from an initial feasibility check, so the next session
doesn't have to re-derive them.

## The idea (Olga, 2026-07-26)

Take the existing ~5271 already-published catalog PDF patterns and convert
them into the same structured format the new `/photo-to-cross-stitch`
editor uses (a stitch grid + DMC palette), so users can **open and
customize an existing catalog design** in the editor — recolor it, resize
it, tweak the layout — not just convert their own photos.

Why now: ties directly into a competitive angle found the same day via the
new monthly AI-tools-scan — Xstitchify (a competitor) differentiates by
giving a full editable chart with real Delta-E/CIELAB DMC color matching,
not just a static image. This idea would put the existing 5271-design
catalog on the same footing, which a photo-converter-only competitor can't
easily match (they don't have a pre-existing catalog).

## Key finding: this is a text-parsing problem, not computer vision

Initial instinct was that this would require OCR/image-parsing of rendered
PDF chart pages — genuinely hard and unreliable. That turned out to be
wrong. Checked directly against a real production sample (Design 4217,
"Horseshoe", downloaded from
`https://d2o1uvvg91z7o4.cloudfront.net/pdfs/16/4217/Stitch4217_1_Kit.pdf` —
general URL pattern: `.../pdfs/{AlbumID}/{DesignID}/Stitch{DesignID}_{formatNumber}_Kit.pdf`,
look up `AlbumID`/`DesignID` via the `DesignsByID-index` GSI on
`CrossStitchItems` if not already known):

- The PDF is **not compressed and not rasterized** — `%PDF-1.3`, content
  streams are plain, readable text (this is exactly why
  `uploader/Uploader/PatternInfo.cs`'s existing `ParsePdf()` can already
  call `File.ReadAllText(filePath)` on it and pattern-match literal PDF
  text operators to extract title/notes/color-count today).
- **Cover page metadata is a strong clue about original provenance:**
  `/Title (Horseshoe.scc)` — the original design predates this PDF and was
  authored in some dedicated cross-stitch pattern-design software (`.scc`
  file extension), not created directly as a PDF.
  **Open question, needs Olga:** do original `.scc` (or equivalent)
  source files still exist anywhere? If yes, parsing those directly would
  likely be far more reliable than reconstructing from the PDF — worth
  asking before investing in a PDF parser.
- **The color-key page is fully parseable and gives exact DMC numbers, no
  RGB guessing needed.** For each color row: `R G B rg` sets the fill
  color, `x y w h re f` draws the swatch rectangle, a form XObject
  (`/N Do`, N = symbol index) draws the symbol glyph, and — critically —
  the real DMC catalog number appears as literal text right in the content
  stream: `(310) Tj` under the "Cat No." column. So the palette can be
  reconstructed with the *actual* original DMC numbers, not a
  nearest-color approximation.
- **The chart page encodes the stitch grid as a sequence of relative
  cursor moves + symbol draws**, e.g.:
  ```
  1 0 0 1 100 1600 cm /5 Do
  1 0 0 1 0 100 cm /5 Do
  1 0 0 1 0 100 cm /1 Do
  1 0 0 1 100 -600 cm /5 Do
  ...
  ```
  Each `dx dy cm /N Do` moves a running cursor by `(dx, dy)` (in a
  100-unit grid before the page's own scale transform) and draws symbol
  `N` (matching the same symbol index from the color-key page) at the
  resulting position. Blank cells are simply skipped via a larger offset
  (no `Do` emitted for them) — column-major iteration (moves down a
  column, then jumps right + up to start the next column). Fully
  reconstructable into a `(row, col) -> symbol/color` grid by tracking the
  cursor and dividing by the cell-size unit.

## What this means practically

No OCR, no image/vision model needed. A parser needs to:
1. Extract the color-key page's RGB + DMC Cat No. + symbol-index rows.
2. Walk the chart page's operator stream, tracking a cursor, converting
   each `/N Do` into a grid cell keyed by symbol N.
3. Map symbol N back to the DMC number/RGB from step 1.
4. Handle multi-page charts for larger designs (this sample was a small
   26×29 design on one chart page — bigger designs will span multiple
   chart pages the same way `/api/convert/pdf` already does for the new
   converter, so the reverse-parse needs to detect page boundaries and
   stitch grids back together, matching against the page's own `NPage`
   grid-position labels for orientation).

## Recommended next steps (not started)

1. **Ask Olga whether original `.scc`/source pattern files still exist**
   anywhere (her own archive, an old backup, wherever the catalog was
   originally sourced from) — if yes, this could shortcut the whole PDF
   -parsing effort.
2. If not, **build a prototype parser for just this one sample** (Design
   4217) — reconstruct its grid + palette, then verify correctness by
   feeding the reconstructed grid/palette back into the existing
   `web/src/app/api/convert/pdf/route.ts` to regenerate a PDF, and
   visually compare against the original.
3. **Only after the prototype is verified**, decide whether/how to batch
   this across all 5271 designs (this is a "reprocess the whole catalog"
   scale decision that shouldn't be made before confirming the parser
   actually works reliably on real samples — test on a handful of designs
   of different sizes/color-counts first, not just this one small
   5-color example).
4. Not yet investigated: whether every catalog PDF was generated by
   *exactly* the same tool/version throughout the catalog's history (Olga
   said yes, one tool the whole time) — worth spot-checking 2-3 more
   samples of different vintage/size before assuming the operator patterns
   above hold universally.

## Sample file

Downloaded to scratchpad during this investigation (session-ephemeral, will
not persist) — re-download via the URL pattern above if needed again.
