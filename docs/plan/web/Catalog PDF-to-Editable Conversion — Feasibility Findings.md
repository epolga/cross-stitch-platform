# Catalog PDF-to-Editable Conversion — Feasibility Findings

**Status as of 2026-07-26: built and tested.** The parser described below is
implemented at `web/src/lib/pdf-pattern-extractor.ts` (pure parsing,
`extractPatternFromPdf(pdfBytes) -> { pattern, warnings }`) with a CLI
wrapper at `web/scripts/extract-catalog-pattern.ts` (`npx tsx
scripts/extract-catalog-pattern.ts <designId> [outFile]` — looks up
AlbumID/Caption in DynamoDB, fetches the kit PDF from CloudFront, extracts,
writes the `ConvertedPattern`-shaped JSON). See "What was built" below for
what's tested and what's still open — not yet wired into any web UI/API
route, so nothing user-facing changed.

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

## What was asked about first, and why that step got skipped

Step 1 of the original plan was to ask Olga whether original `.scc` source
files still exist (to shortcut PDF parsing entirely). She confirmed the
`.scc` chart file *is* uploaded to S3 for every design
(`charts/{DesignID:D5}_{Title}.scc`, from the Uploader's own
`UploadChartToS3Async`), but a real sample turned out to be a **compact
proprietary binary format** (`CraftedSoftware 3.30.33`, ~2KB for a small
design) with no documented structure — only the DMC catalog numbers are
readable as literal ASCII substrings inside the binary. Reverse-engineering
that format from scratch was judged higher-risk than continuing with the
already-understood PDF text format, so the PDF route was chosen instead.

## What was built and tested (2026-07-26)

`web/src/lib/pdf-pattern-extractor.ts` implements the algorithm above:

1. Lists page objects via the `/Type /Page` + `/Contents` refs, taking the
   **last** occurrence of any duplicated object number — real catalog PDFs
   can carry stale objects from incremental updates (same reasoning as
   `Converter.exe`'s own `TrailerRegex.LastOrDefault()`).
2. Classifies each page's content stream as a color-key page (contains
   `(Cat No.)`) or a chart page (many `/N Do` calls).
3. Color key: **can span multiple pages** for high-color designs (e.g. 100
   colors → 3 key pages, 42+42+16) — column blocks (Color/Symbol/Cat
   No./Brand/Type/Stitches/Skeins) are parsed per page and concatenated.
   DMC lookups against `dmc-colors.json` are case-insensitive (named
   colors like "Blanc"/"Ecru" appear capitalized in the PDF but lowercase
   in the data file).
4. Chart: **can span multiple pages** too. Each chart page carries a
   `(Page N of M     Position A:1)` text label (same `A:1`/`B:1` convention
   `web/src/app/api/convert/pdf/route.ts` already uses for its own
   multi-page output) — except single-page designs, which have no label at
   all (treated as the implicit "page 1 of 1 at A:1"). Each page's own
   window size comes from its background-fill rect; absolute placement in
   the merged grid is the cumulative sum of window sizes per row/column
   (handles the narrower/shorter "leftover" tile at the right/bottom edge
   without assuming uniform page sizes).
5. Each palette entry gets a real symbol from `web/src/lib/symbols.ts`'s
   `SYMBOLS[]` array (same fallback-to-`'?'` convention already used by
   `pattern-converter.ts`'s photo-conversion path if a design ever exceeds
   `SYMBOLS.length`, currently ~150) — **not** a synthesized codepoint. An
   earlier scratch prototype used fake PUA codepoints past `E(20)`, which
   is what caused garbled/undefined glyphs to appear for any color beyond
   the 20th on higher-color designs; using the real array fixed it.

**Tested end-to-end** (parse → feed into the existing
`/api/convert/pdf/route.ts` → regenerate a PDF → visually compare) on 3
samples spanning the size range found in the catalog scan:

| Design | Size (reconstructed) | Colors | Chart pages | Key pages | Result |
|---|---|---|---|---|---|
| 4217 "Horseshoe" | 26×29 | 5 | 1 (no label) | 1 | Exact match incl. stitch counts per color |
| 26 "Evening Lake" | 339×224 | 50 | 36 | 2 | Exact match, zero cell collisions |
| 28 "Sunset Above the Sea" | 239×159 | 100 | 8 | 3 | Exact match, zero cell collisions |

Note: DynamoDB's `Width`/`Height` fields were **not reliable** for any of
the 3 — reconstructed width matched but height didn't (design 4217:
26×26 in DB vs actual 26×29; design 26: 339×339 in DB vs actual 339×224
landscape; design 28: 239×239 in DB vs actual 239×159). The PDF's own
background-rect size is authoritative, not the DB fields.

## Open items (not yet done)

- **Not wired into any UI or API route yet** — this is a backend
  parsing library + CLI script only. Turning it into an actual "open this
  catalog design in the editor" feature needs a route (or reuse of
  `/api/converter/patterns`) plus a UI entry point.
- **Batching across all ~5271 designs** — deliberately not attempted yet;
  should run the CLI across a larger sample (not just 3) and check the
  `warnings` array before considering a full-catalog pass.
- **Vintage spot-check** — still only tested on designs that happened to
  turn up in one DynamoDB scan; haven't deliberately sampled the oldest
  (lowest DesignID) catalog entries to confirm the format holds all the way
  back.
- **>~150-color designs** — untested (none found yet in the samples
  checked); would hit the `SYMBOLS[]` overflow fallback (`'?'` symbol,
  shared across multiple colors) same as the photo-conversion path already
  does.

## Sample files

Test PDFs were downloaded to the session scratchpad (ephemeral, not
persisted) — re-download via the URL pattern above, or just re-run
`extract-catalog-pattern.ts <designId>` which does the fetch itself.
