# S7 Converter — Photo to Cross-Stitch Pattern

## Status

In progress — Phase 1 (worktree: `s7-converter`, branch: `worktree-s7-converter`).

---

## Vision

A user uploads any photo and gets back a stitchable cross-stitch pattern — initially as a PDF download, later as an interactive browser-based editor where individual cells can be repainted before exporting.

---

## Phase 1 — Browser preview + PDF export

### Page: `/photo-to-cross-stitch`

Four steps on a single page:

1. **Upload** — drag-drop or click; JPEG / PNG / WebP, max 5 MB
2. **Options** — width (stitches), height (stitches), color count (fixed: 10 / 15 / 20 / 25 DMC colors)
3. **Pattern preview** — canvas rendered in the browser, scrollable, toggle between:
   - **Colored view** — each cell filled with its DMC thread color
   - **Symbol view** — B&W symbols (for printing without color ink)
4. **Download PDF** — colored grid + symbol grid + color key table

### Server pipeline

**`POST /api/convert`** — image → pattern JSON

1. Decode uploaded image
2. Resize to user-specified width × height using `sharp`
3. Extract one RGB color per pixel
4. Map each pixel to the nearest DMC color (Euclidean distance in RGB space)
5. Merge smallest palette clusters until ≤ N colors
6. Assign each color a unique symbol (A–Z, then ①–⑳ …)
7. Return `{ grid: number[][], palette: DmcColor[] }` as JSON

**`POST /api/convert/pdf`** — pattern JSON → PDF bytes

- Accepts `{ grid, palette }` from the client (client sends its current canvas state)
- Builds PDF using `pdf-lib`:
  - Page 1: colored grid
  - Page 2+: symbol grid
  - Final page: color key table (symbol | DMC # | color name | stitch count)
- Returns PDF bytes for download

### New files

| File | Purpose |
|------|---------|
| `web/src/data/dmc-colors.json` | ~500 DMC colors with RGB, number, name |
| `web/src/lib/pattern-converter.ts` | resize, DMC mapping, palette reduction |
| `web/src/app/api/convert/route.ts` | image → pattern JSON endpoint |
| `web/src/app/api/convert/pdf/route.ts` | pattern JSON → PDF endpoint |
| `web/src/app/photo-to-cross-stitch/page.tsx` | server component (SEO metadata, JSON-LD, static HTML) |
| `web/src/app/photo-to-cross-stitch/ConvertClient.tsx` | client component (interactive UI) |
| `web/src/app/components/PatternCanvas.tsx` | canvas renderer (colored + symbol modes) |

### New dependencies

- `sharp` — image resize and per-pixel color extraction
- `pdf-lib` — pure-JS PDF generation (no native deps, works in Node/Lambda)

---

## Algorithm improvements *(documented, not yet scheduled)*

### 1. Simpler "how it works" copy

The current page explanation uses technical terms ("Euclidean distance", "RGB color space") that are meaningless to most users. Before or during Phase 2, rewrite the prose to plain language:

> "Each pixel in the resized image is matched to the closest DMC thread color from a library of 454 standard colors. When the palette needs to be reduced, the least-used colors are swapped for the nearest alternative until the target count is reached."

No jargon, same accuracy.

### 2. 8-neighbor continuity rule *(feasible, medium complexity)*

**Requirement:** every colored cell in the final pattern must have at least one of its 8 surrounding neighbors (including diagonals) that is the same color. No fully isolated single-stitch islands.

**Why it matters:** isolated single cells are very hard to stitch — you have to thread a needle, make one cross, then cut and tie off. Real pattern software always enforces a minimum cluster size of at least 2.

**How to implement (post-processing pass after palette reduction):**

1. Scan the grid for isolated cells — cells where none of the 8 neighbors share the same color.
2. For each isolated cell, change its color to the most common color among its 8 neighbors.
3. Repeat until no isolated cells remain.

Convergence is guaranteed: each pass either eliminates an isolated cell or the cell merges into an existing cluster. In practice 2–3 passes are enough. The cost is a small accuracy loss on very fine details (thin lines, single-pixel dots) — acceptable because those features are unstitchable anyway.

**Feasibility:** yes, straightforward. Adds ~50 lines to `pattern-converter.ts`. No new dependencies.

---

## Phase 2 — Visual editor *(discuss before starting)*

Allow users to edit the pattern in the browser before exporting.

**Planned tools:**
- Pencil — click/drag to paint a cell with the selected color
- Fill bucket — flood-fill a region with the selected color
- Eraser — set cells to background (white / no stitch)
- Color picker — select a color from the current palette or full DMC library
- Undo / redo — useReducer history stack

**To discuss:**
- Which tools are most important to ship first?
- Should the color picker show the current palette only, or all ~500 DMC colors?
- How many undo steps to keep in memory?

---

## Phase 3 — Advanced *(discuss later)*

- PDF export from the **edited** state (client sends modified grid + palette)
- Save pattern to user account (DDB) — return to editing later
- Share a pattern via URL (encode state or store in DDB)
- Import an existing pattern image and extract its palette automatically

---

## Deferred decisions *(discuss before Phase 2)*

| Decision | Current choice | Revisit when |
|----------|---------------|--------------|
| Color count control | Fixed: 10 / 15 / 20 / 25 | After seeing real usage patterns |
| Cell size / zoom | Fixed size, scrollable | Phase 2 — add zoom in/out |
| PDF page layout | 1 colored + 1 symbol + key | After seeing first PDF output |
| PDF page size | TBD (A4 or Letter) | After seeing first PDF output |
| Max grid size cap | None yet | After performance testing |
| Symbol set for large palettes | A–Z then ①–⑳ | If palette > 46 colors needed |
| Width/height presets | Free input only | After user feedback |

---

## Return to S8 analytics

After ~2–4 weeks of live traffic, run `npm run search-analytics` in
`automation/pinterest-agent/` to review:

- Zero-result queries → add missing designs or improve search
- Top queries → inform Pinterest pinning strategy
- Daily volume → measure impact of search improvements
