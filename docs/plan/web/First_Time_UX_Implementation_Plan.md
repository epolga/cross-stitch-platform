# First-Time User Experience — Implementation Plan

Companion to: `Improve_First_Time_User_Experience.md`
Codebase entry points: `web/src/app/photo-to-cross-stitch/page.tsx`, `ConvertClient.tsx`

---

## Current state (as of 2026-06-29)

- **Page layout**: H1 + description → 3 feature cards → `<ConvertClient />` → FAQ → tips
- **How to import a photo**: MenuBar → Import → From Photo… (buried; not visible without scrolling into the editor)
- **Canvas empty state** (lines 1585–1601 in ConvertClient): 📷 icon + "Drop a photo to start / use Import → From Photo… in the menu above" — exists but sits inside the canvas area, below all toolbar chrome
- **Drag-and-drop**: works on the canvas wrapper; already opens `ImportFromPhotoDialog`
- **No "Try a Sample Image"** feature
- **Analytics already firing**: `editor_opened`, `image_uploaded`, `pattern_generated`, `pdf_exported`, `project_saved`, `manual_editing_started`
- **Analytics missing**: `editor_landing_viewed`, `upload_cta_clicked`, `sample_image_clicked`, `image_drop_started`

---

## Steps

### Step 1 — Hero section with Upload button

**File**: `web/src/app/photo-to-cross-stitch/page.tsx`

Add a hero block between the description paragraph and the feature cards.

Content:
```
Turn any photo into a cross-stitch pattern

[ Upload Your Photo ]   Try a Sample Image
```

- "Upload Your Photo" button: dispatch a custom DOM event `openImportFromPhoto` — ConvertClient will listen for it (same pattern as the existing `openRegisterModal` event).
- "Try a Sample Image": dispatch `openSampleImage` — handled in Step 2.
- The button should be the strongest visual element: large, rose-colored, full-width on mobile.
- Track `upload_cta_clicked` on click (before dispatching the event).
- Track `editor_landing_viewed` in a `useEffect` on mount (page.tsx must become `'use client'`, OR move tracking into ConvertClient's existing mount effect).

**Simplest path**: keep `page.tsx` as a server component. Add a thin `HeroCta` client component that owns the two buttons and event dispatch. `ConvertClient` listens for both events.

**Analytics note**: `editor_opened` already fires on ConvertClient mount. `editor_landing_viewed` is the same moment — just add it to the same `useEffect` in ConvertClient (line 505–511) rather than creating a new event.

---

### Step 2 — "Try a Sample Image"

**Files**: `web/src/app/photo-to-cross-stitch/ConvertClient.tsx`, plus a sample image asset.

- Add a bundled sample image at `web/public/sample-pattern-photo.jpg` (a simple flower or butterfly — clear subject, plain background, good contrast; ≤ 200 KB).
- In ConvertClient: listen for `openSampleImage` event → fetch `/sample-pattern-photo.jpg` → create a `File` object → set `importInitialFile` + `setShowImportDialog(true)`.
- Track `sample_image_clicked` before opening the dialog.
- The import dialog opens pre-loaded with the sample, just like a drag-and-drop would.

**Why a fetch + File object**: `ImportFromPhotoDialog` already accepts `initialFile?: File | null`. Reusing it means no new dialog code.

---

### Step 3 — Move feature cards below the editor

**File**: `web/src/app/photo-to-cross-stitch/page.tsx`

Move the 3-card grid (`Built-in cross-stitch editor` section, lines 141–164) to just *after* `<ConvertClient />` and *before* the FAQ.

No content changes — just position. Cards stay as-is; they provide value after the user has generated something, not before.

---

### Step 4 — Update empty canvas state

**File**: `web/src/app/photo-to-cross-stitch/ConvertClient.tsx` (lines 1585–1601)

- Change the empty-state hint text from `"use Import → From Photo… in the menu above"` to `"or click Upload Photo above"` — matches the new hero button.
- Add `image_drop_started` tracking inside the `onDragOver` handler (lines 1573–1576), fired once per drag session (use a ref flag, reset on `onDragLeave` / `onDrop`).

---

### Step 5 — CTA on design pages

**File**: `web/src/app/designs/[slug]/page.tsx` (or wherever individual design pages live — check)

- Add an "Open in Editor" button near the design title or action bar.
- Link: `/photo-to-cross-stitch` (the editor is for photos, not for loading existing designs — the CTA here is just discovery, not deep-linking a pattern).
- Track `design_editor_cta_clicked` with `{ designId, designTitle, pageUrl, source: 'design_page' }`.
- Button style: secondary (outline), not competing with the main "Download" action.

**Check first**: look at `web/src/app/designs/` and `web/src/app/[slug]/` to find where design pages are rendered.

---

### Step 6 — CTA on album / category pages

**File**: `web/src/app/albums/[slug]/page.tsx` or similar — check exact location.

- Add a "Create your own pattern" banner or card within the album page layout.
- Link: `/photo-to-cross-stitch`
- Track `album_editor_cta_clicked` with `{ albumId, albumTitle, categorySlug, pageUrl, source: 'album_page' }`.

---

## Order of implementation

1. Step 1 (hero + upload button) — highest impact, one file change
2. Step 2 (sample image) — needs an asset; do after Step 1 is working
3. Step 3 (move feature cards) — trivial move, do at same time as Step 1 or 2
4. Step 4 (empty state text + drop tracking) — small polish
5. Step 5 (design page CTA) — requires finding the right file first
6. Step 6 (album page CTA) — same

## Done when

- [x] Step 1: Hero section live with Upload button that opens import dialog — 2026-06-29
- [x] Step 2: "Try a Sample Image" works end-to-end (dialog opens pre-loaded) — 2026-06-29
- [x] Step 3: Feature cards made compact (smaller padding, text, no shadow) — 2026-06-29
- [x] Step 4: Empty-state text updated; `image_drop_started` fires on drag — 2026-06-29
- [ ] Step 5: "Open in Editor" button on design pages, event tracked
- [ ] Step 6: "Create your own pattern" CTA on album pages, event tracked
