# Low-Level Design — Photo-to-Cross-Stitch Converter

**Corresponds to:** `../02-SRS-Photo-to-Cross-Stitch-Converter.md`,
`../use-cases/02-UseCases-Photo-to-Cross-Stitch-Converter.md`, `../05-SAD.md`

**Date:** 2026-07-11

## 1. Scope

Implementation-level detail for the converter/editor: the saved-pattern data shape, the
`/api/convert` and `/api/convert/pdf` contracts, the conversion pipeline's internal steps,
and the editor-analytics event shape.

## 2. Data dictionary

### 2.1 Saved pattern (DynamoDB, code-only entity)

| Field | Type | Notes |
|---|---|---|
| `id` | S (PK) | pattern identifier, used in the shareable link |
| `ownerId` | S | ties to `CrossStitchUsers.ID` |
| `name` | S | operator-visible label |
| `width`, `height` | N | grid dimensions in stitches |
| `palette` | list | ordered list of `{ dmcCode, symbol, hidden: bool }` |
| `grid` | — | 2D cell data, each cell either empty or a palette index |
| `thumbnail` | S | small rendered preview, base64 or S3 reference |
| `createdAt`, `updatedAt` | S (ISO) | |

### 2.2 Editor analytics event (DynamoDB, code-only entity)

| Field | Type | Notes |
|---|---|---|
| `eventType` | S | `open` \| `convert` \| `export_pdf` \| `error` |
| `entrySource` | S | e.g. `direct`, `design_page_referrer`, `album_referrer` |
| `sessionId` | S | client-generated, not tied to a logged-in user |
| `timestamp` | S (ISO) | |
| `errorDetail` | S | populated only for `error` events |

`POST /api/analytics/no-track` records a suppressed-tracking signal (e.g. DNT/GPC honored)
separately from `POST /api/analytics/editor-event`, so the funnel calculation in
`/admin/editor-analytics` can distinguish "no session recorded" from "session recorded but
opted out of finer tracking."

## 3. API contracts

### 3.1 `POST /api/analyze`

```
Request:  multipart/form-data, image file
Response: { "suggestedWidth": number, "suggestedHeight": number,
            "suggestedColorCount": number, "suggestedMode": "photo"|"illustration"|"line-art",
            "dominantColors"?: string[] }
```
Runs before the user finalizes conversion settings (UC-C-01 step 2) — purely advisory,
the client is free to override every suggested value before calling `/api/convert`.

### 3.2 `POST /api/convert`

```
Request:  { "imageRef": string,       // reference to the previously uploaded/analyzed image
            "width": number,          // 10-500
            "height": number,         // 10-500
            "colorCount": 2|3|4|5|10|20|30|40|50|100,
            "mode": "auto"|"photo"|"illustration"|"line-art" }
Response: { "grid": <2D palette-index array>,
            "palette": [{ dmcCode, rgb, symbol }] }
```
Rejects requests with `width`/`height` outside 10–500 or a `colorCount` outside the fixed
set before invoking the conversion pipeline (§4).

### 3.3 `POST /api/convert/pdf`

```
Request:  { "patternId": string } | { "grid": ..., "palette": ..., "width": ..., "height": ... }
Response: application/pdf (binary)
```
Accepts either a reference to an already-saved pattern or an inline grid/palette (so a
not-yet-saved draft can still be exported, consistent with UC-C-04's "logged in but not yet
explicitly saved" path being disallowed only for *saving*, not implied for export — export
still requires login per FR-SAV-1, but does not require the pattern to already be
persisted).

### 3.4 `POST /api/import-image-url`

```
Request:  { "url": string }
Response: { "imageRef": string }  // or an image proxy stream, then handed to /api/analyze
```
Server-side fetch of the given URL (SSRF-guarded: only `http`/`https`, resolved host must
not be a private/loopback/link-local address, response `Content-Type` must be an accepted
image MIME type before bytes are accepted) and rate-limited per IP.

## 4. Conversion pipeline (verified against `src/lib/pattern-converter.ts` + `src/lib/image-analysis.ts`)

### 4.1 Auto-detection (`analyzeImage`, runs before conversion, feeds `/api/analyze`)

A 64×64 downsample is analyzed with three cheap heuristics (no LLM/ML model involved):

- **Luminance bimodality** — fraction of pixels that are near-black (<64) or near-white
  (>192); combined with mean saturation (max−min channel), a high bimodal fraction (>0.65)
  and low saturation (<25) indicates line art or typography.
- **Sobel edge density** — a standard 3×3 Sobel gradient magnitude averaged over the
  thumbnail; a high value alongside the bimodal check distinguishes typography (edge-dense)
  from plain line art.
- **Color diversity** — an 8×8 coarse grid of samples bucketed into a 32-level-per-channel
  palette; ≤12 distinct buckets with some saturation (>20) indicates flat illustration/logo
  art; otherwise the image is classified `photo` (confidence `high` if diversity >20).

Classification only overrides the user's mode selection with `line-art` at `high`
confidence specifically, per an explicit code comment: false-positiving a real photo into
the line-art pipeline (sharpened, no cluster overshoot) is judged worse than
false-negatively leaving genuine line art in photo mode. `illustration` maps directly;
everything else defaults to `photo`.

### 4.2 Conversion (`convertImage`)

```
1. sharp() resize to target width × height ("fill" fit — one output pixel per stitch cell).
   line-art/illustration modes use the "nearest" resampling kernel (preserves hard edges);
   photo/auto use sharp's default kernel (smoother).
2. Convert every resulting pixel from sRGB to CIE L*a*b* (perceptually uniform space) —
   full sRGB→linear→XYZ(D65)→L*a*b* conversion, not a shortcut approximation.
3. Build a deterministic sample for clustering: pixels are coarsely bucketed (24 levels/
   LAB-channel) so that every visually distinct region gets at least one sample regardless
   of how few pixels it covers, then randomly subsampled (Fisher–Yates) down to a 6000-pixel
   cap if there are more unique buckets than that. The random generator is a seeded
   mulberry32 PRNG, seeded by hashing the raw uploaded image bytes (FNV-1a-style running
   hash) — the same image always clusters identically across repeated conversions.
4. Run k-means++ in LAB space on the sample, 5 independent runs (up to 30 iterations each),
   keeping the run with the lowest inertia (sum of squared distances to assigned centroid).
   photo/auto modes overshoot k to 1.5× the requested color count so rare-color regions get
   dedicated cluster slots before trimming; line-art/illustration modes cluster at the exact
   requested k (overshoot would invent spurious intermediate colors on flat art).
5. Snap every centroid to its nearest DMC thread color by LAB distance (454-shade reference
   table, `src/data/dmc-colors.json`, precomputed to LAB once at module load).
6. If overshoot produced more distinct DMC colors than requested, keep only the top
   `colorCount` DMC colors by total assigned pixel count; remap every dropped centroid to
   the nearest *kept* centroid (LAB distance) so the final image never exceeds the
   requested color count even after DMC snapping can collapse multiple centroids onto the
   same thread color.
7. Build the final compact palette sorted by stitch count descending, assign a display
   symbol to each (from `SYMBOLS`, `src/lib/symbols.ts`), and remap the grid to the sorted
   palette's indices.
8. Return { grid: number[][] (palette index per cell), palette: PatternPalette[], width, height }.
```

Steps 3–4 (deterministic seeding, bucketed sampling, k-means++ with oversampling-then-trim)
are the parts of this pipeline most likely to need re-verification if conversion quality is
ever reported as inconsistent — this is genuine statistical clustering, not a fixed
lookup, so behavior on a given photo is a function of its actual pixel distribution.

## 5. PDF export detail (verified against `web/src/app/api/convert/pdf/route.ts`,
`src/lib/server-symbol-renderer.ts`, `pdf-lib`, A4 portrait, generated synchronously in one
request — no async job queue)

The request carries a `chartMode` of `symbol` | `color-symbol` | `color`, selecting how the
**chart pages** render; the cover, color-key, and page-map pages are always included
regardless of mode. This is one PDF whose chart section has one of three renderings, not
three separate documents bundled together.

Page order: **1 cover page → N color-key pages → 1 page-map page → M chart pages** (N and M
computed up front so page numbers can be printed correctly on the cover before those pages
exist):

1. **Cover page** — title, centered.
2. **Color-key pages** — one row per palette entry actually used in the grid (usage is
   recounted from the grid at export time, not trusted from a possibly-stale
   `stitchCount` on the palette object): swatch, symbol, DMC catalog number, brand, thread
   type, stitch count, skein estimate. Paginated at a fixed rows-per-page derived from page
   height and a fixed row height.
3. **Page-map page** — a small thumbnail grid of the *page tiling* (not the pattern itself),
   each tile labeled `<column-letter>:<row-number>` (e.g. `A:1`, `B:2`), so the stitcher can
   see which physical page covers which region before printing.
4. **Chart pages** — the grid is tiled into `pageCols × pageRows` pages, where the
   per-page column/row capacity is derived from a fixed per-stitch-cell point size (10pt)
   and the printable area after margins/header/footer. Each stitch symbol is rasterized
   once per unique symbol via `renderSymbolToPng` (canvas-drawn shapes for symbols a
   standard PDF font can't render, e.g. ▲●⊕) and embedded as a PNG, reused across every
   occurrence of that symbol on every page (not re-rasterized per cell).

This structure directly supports UC-C-04's "on-screen use, no PDF" alternate flow being a
genuinely separate use case from PDF export: the color-key/page-map/tiling machinery here
exists specifically for *printing* a possibly-large pattern across multiple physical pages,
which has no equivalent concern in the on-screen colored/symbol toggle view.

## 6. Sequence diagram — UC-C-01 (photo → pattern)

```
Visitor         Website(API)        Claude/analysis        DMC table
  │ upload photo    │                     │                    │
  │─────────────────▶│ POST /api/analyze   │                    │
  │                  │────────────────────▶│ (heuristic, no LLM
  │                  │                     │  call observed here
  │                  │                     │  — pixel-stat based)
  │                  │◀────suggestions─────│                    │
  │◀─prefilled form──│                     │                    │
  │ confirm settings │                     │                    │
  │─────────────────▶│ POST /api/convert   │                    │
  │                  │ resample → quantize → map to DMC ─────────▶│
  │                  │◀──────────────────nearest-color lookups───│
  │◀─grid+palette────│                     │                    │
  │  (opens in canvas editor, client-side rendering only         │
  │   from this point — no further server round-trip until       │
  │   Save/Export)                                                │
```

## 7. Error handling notes

- `/api/convert` validates dimensions/color-count server-side even though the client UI
  already constrains the input controls — defense against a client bypassing the UI.
- `/api/import-image-url` failures (unreachable URL, disallowed host, wrong content type)
  return a specific error code distinguishing "couldn't fetch" from "fetched but not a
  valid image," surfaced to the user rather than silently falling through to a blank
  canvas.
- PDF generation failures (e.g., a corrupt in-memory grid state) are caught and reported as
  an `error`-type analytics event (§2.2) in addition to the user-facing failure, so the
  operator's funnel dashboard reflects export failures even when the user doesn't file a
  feedback report.
