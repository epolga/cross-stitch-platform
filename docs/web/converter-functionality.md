# Photo-to-Cross-Stitch Converter — Current Functionality

**Route:** `/photo-to-cross-stitch`  
**Branch:** `worktree-s7-converter`  
**Status:** Phase 1 + Phase 2 complete (as of 2026-06-25)

---

## User flow

Three steps on a single page:

### Step 1 — Upload photo
- Drag-and-drop or click-to-browse
- Accepted formats: JPEG, PNG, WebP
- Max size: 5 MB
- Preview shown after selection; "Remove photo" clears it

### Step 2 — Choose options
- **Width** and **Height** in stitches (10–500, free numeric input)
- **DMC colors**: fixed palette sizes — 10 / 15 / 20 / 25
- "Generate pattern" triggers the server conversion

### Step 3 — Edit your pattern
Full visual editor appears after conversion. See [Editor](#editor) below.

---

## Server-side conversion pipeline

### `POST /api/convert` — image → pattern JSON

1. Decode uploaded image via `sharp`
2. Resize to user-specified width × height (`fit: fill`)
3. Extract one RGB value per pixel
4. Map each pixel to the nearest DMC color (Euclidean distance in RGB space) from 454 standard DMC colors
5. Compact unique colors into a palette index
6. Merge the rarest colors into their nearest neighbor until palette ≤ N colors
7. Sort palette by stitch count descending; assign symbols (A–Z, then ①–⑳, then lowercase, then punctuation)
8. Return `{ grid: number[][], palette: PatternPalette[], width, height }`

`grid[y][x]` = palette index (0-based). `-1` = blank/erased cell.

### `POST /api/convert/pdf` — pattern JSON → PDF bytes

Accepts `{ grid, palette }` from the client (the current edited state, not the original).

Generates a 3-page PDF using `pdf-lib`:
- **Page 1:** Colored grid — each cell filled with its DMC thread color
- **Page 2+:** Symbol grid — B&W symbols for printing without color ink
- **Final page:** Color key table — symbol | DMC number | color name | stitch count

Returns PDF bytes for immediate browser download.

---

## Editor

### Layout
```
[Header: "3. Edit your pattern"          ↓ Download PDF]
[Left sidebar 64px] [Canvas — flex-1, overflow-auto    ]
[Palette bar — full width below canvas                  ]
```

### Left toolbar (top to bottom)
| Control | Function |
|---------|----------|
| ↩ Undo (N) | Restore previous grid state; N = available steps |
| ↪ Redo (N) | Re-apply undone change |
| — separator — | |
| ✏ Pencil | Click and drag to paint cells with the selected color |
| 🪣 Fill | Click to flood-fill a connected region with the selected color |
| ⬜ Erase Fill | Click to flood-fill a connected region with blank (white/no-stitch) |
| — separator — | |
| Color | View mode: cells shown in DMC color, no symbols |
| Symbol | View mode: B&W symbols only (as in the printable PDF) |
| Both | View mode: symbols drawn inside colored cells (like PC Stitch) |

### Canvas
- Rendered on an HTML `<canvas>` element
- Left margin (30 px): row numbers every 5 rows
- Top margin (18 px): column numbers every 5 columns
- Bold grid lines every 10 cells
- Blank cells (index -1) render white
- Cursor: crosshair for pencil, cell for fill/erase-fill

### Palette bar
- Active color preview (large swatch + symbol + DMC number) on the left
- All palette swatches in a row; selected swatch highlighted with a rose ring
- Click any swatch to set the active paint color
- The palette bar also shows DMC number and name on hover (title tooltip)

### Undo / Redo
- Up to 50 undo steps
- Pencil strokes are committed as one undo entry on mouse-up
- Fill and Erase Fill commit immediately on click
- Redo stack is cleared whenever a new edit is made

---

## File structure

| File | Purpose |
|------|---------|
| `web/src/app/photo-to-cross-stitch/page.tsx` | Server component — Next.js metadata, JSON-LD structured data, static FAQ + how-it-works HTML for crawlers |
| `web/src/app/photo-to-cross-stitch/ConvertClient.tsx` | Client component — all interactive state: upload, convert, editor tools, undo/redo, download |
| `web/src/app/components/PatternCanvas.tsx` | Canvas renderer + mouse event handler for painting |
| `web/src/app/components/PaletteBar.tsx` | Palette swatch strip with active color preview |
| `web/src/app/api/convert/route.ts` | Image → pattern JSON API route |
| `web/src/app/api/convert/pdf/route.ts` | Pattern JSON → PDF API route |
| `web/src/lib/pattern-converter.ts` | Core algorithms: resize, DMC mapping, palette reduction |
| `web/src/data/dmc-colors.json` | 454 DMC floss colors with RGB values, number, and name |

### Key dependencies
- `sharp` — image resize and per-pixel color extraction
- `pdf-lib` — pure-JS PDF generation (no native deps)

---

## Known limitations / deferred

| Feature | Status |
|---------|--------|
| Pencil eraser (single cell) | Not implemented |
| Zoom in / out | Deferred (Phase 2 decision) |
| Cell size control | Fixed at 12 px; scrollable for large patterns |
| 8-neighbor continuity rule | Documented in plan, not yet implemented |
| Save pattern to account | Phase 3 |
| Share pattern via URL | Phase 3 |
| Max grid size cap | None — performance degrades above ~300×300 |
