# Use Cases — Photo-to-Cross-Stitch Converter

**Corresponds to:** `../02-SRS-Photo-to-Cross-Stitch-Converter.md`

**Date:** 2026-07-11

This document covers the key, non-trivial user journeys in the converter/editor — the
scenarios with real branching logic, not every FR item individually. Each use case
references the SRS requirement IDs it realizes.

## Index

| ID | Name | Primary actor |
|---|---|---|
| UC-C-01 | Convert a photo into a pattern | Visitor / Registered user |
| UC-C-02 | Edit and refine a pattern | Visitor / Registered user |
| UC-C-03 | Save a pattern to an account | Registered user |
| UC-C-04 | Export a pattern as a print-ready PDF | Registered user |
| UC-C-05 | Resume an interrupted editing session | Visitor / Registered user |
| UC-C-06 | Import an image dragged from another website | Visitor / Registered user |
| UC-C-07 | Review editor usage analytics | Site operator |

---

## UC-C-01 — Convert a photo into a pattern

**Primary actor:** Visitor or Registered user (no login required to start).

**Related requirements:** FR-CVT-1 … FR-CVT-7.

**Trigger:** Actor opens `/photo-to-cross-stitch` and uploads a photo (or, see UC-C-06, drags
one in from elsewhere).

**Main flow:**
1. Actor uploads an image (JPEG/PNG/WebP/GIF, ≤5 MB).
2. System analyzes the image server-side to propose sensible default conversion settings.
3. Actor reviews/adjusts grid width and height (10–500 stitches), color count (from a fixed
   set of options), and conversion mode (auto/photo/illustration/line-art).
4. Actor confirms; system converts the image into a stitch grid with an associated DMC
   palette matching the chosen settings.
5. System opens the resulting pattern in the canvas editor (see UC-C-02).

**Exception flow (oversized or unsupported file):** System rejects the upload with a clear
error before attempting conversion; no partial/truncated conversion is produced.

**Postconditions:** An in-memory (and auto-saved draft, see UC-C-05) pattern exists, ready
for editing; no account or save action has occurred yet.

---

## UC-C-02 — Edit and refine a pattern

**Primary actor:** Visitor or Registered user.

**Related requirements:** FR-EDT-1 … FR-EDT-9.

**Trigger:** Actor has a pattern open (from conversion, UC-C-01, or from opening a saved
pattern, UC-C-03).

**Main flow:**
1. Actor selects a tool (pencil, eraser, fill, select, or a draw mode: point/line/rectangle/
   ellipse) and edits grid cells directly on the canvas.
2. For line/rectangle/ellipse, the actor sees a free-angle preview while dragging, which
   snaps to the grid only when the actor releases the mouse/touch.
3. Actor manages the color palette as needed: picks a color/symbol, merges or moves palette
   entries, or hides colors they don't want visible for now.
4. Actor can undo/redo any editing action.
5. Actor toggles between the colored ("simulation") view and the symbol view at any time.
6. Actor can resize the grid (choosing a resize mode and anchor point) mid-edit without
   losing existing stitches outside the resized bounds' overlap.

**Alternate flow (mirror tool):** Actor enables horizontal/vertical/axis mirroring (with an
optional resize) so subsequent edits are mirrored automatically across the pattern.

**Alternate flow (highlight a color):** Actor selects a palette color to highlight every
stitch of that color on the canvas, to spot-check placement.

**Postconditions:** The canvas reflects the actor's edits; the auto-saved draft (UC-C-05) is
updated to match.

---

## UC-C-03 — Save a pattern to an account

**Primary actor:** Registered user.

**Related requirements:** FR-SAV-1, FR-SAV-2, FR-SAV-3.

**Trigger:** Actor clicks Save (or the Ctrl/Cmd+S shortcut) while editing a pattern.

**Main flow:**
1. If not logged in, system prompts the actor to log in or register (see
   `01-UseCases-Website.md` UC-W-03), preserving the in-progress pattern across that
   interruption.
2. Actor names the pattern.
3. System writes the pattern (grid, palette, hidden-color state, dimensions, thumbnail) to
   the actor's account.
4. Pattern becomes visible in the actor's saved-pattern list (`/profile/patterns`) and is
   reachable later via a shareable link, private to the owner by default.

**Alternate flow (open an existing saved pattern):**
1. Actor opens `/profile/patterns` and selects a previously saved pattern.
2. System loads its grid/palette/hidden-color state back into the editor, resuming editing
   from UC-C-02.

**Postconditions:** The pattern persists across sessions and devices for the owning
account.

---

## UC-C-04 — Export a pattern as a print-ready PDF

**Primary actor:** Registered user.

**Related requirements:** FR-SAV-1, FR-SAV-4.

**Trigger:** Actor clicks Download/Export PDF on a pattern.

**Preconditions:** Actor is logged in (per FR-SAV-1, the same login gate as saving).

**Main flow:**
1. System generates a three-part PDF: a colored grid view, a black-and-white symbol grid
   view, and a thread/color-key table (DMC number, name, symbol, stitch count per color).
2. Actor downloads the generated PDF.

**Alternate flow (on-screen use, no PDF):** Actor instead uses the colored/symbol toggle
directly in the browser as a stitching aid on their phone or tablet, without ever exporting
a PDF (FR-SAV-5) — this is a valid end state for this use case, not just an alternate path
to the same output.

**Postconditions:** A downloadable PDF artifact exists reflecting the pattern's state at
export time; later edits to the saved pattern do not retroactively change an already
downloaded PDF.

---

## UC-C-05 — Resume an interrupted editing session

**Primary actor:** Visitor or Registered user.

**Related requirements:** FR-EDT-9.

**Trigger:** Actor closes the tab, loses connectivity, or navigates away mid-edit without
explicitly saving.

**Main flow:**
1. While editing (UC-C-02), the system silently auto-saves a draft on a debounced interval
   — no actor action required.
2. Actor returns to the editor later (same browser/session).
3. System detects the unsaved draft and restores it, so the actor's edits since their last
   explicit save are not lost.

**Postconditions:** The actor continues from where they left off; an explicit Save
(UC-C-03) is still required to persist the pattern to their account permanently — the draft
alone is not equivalent to a saved pattern.

---

## UC-C-06 — Import an image dragged from another website

**Primary actor:** Visitor or Registered user.

**Related requirements:** FR-CVT-2.

**Trigger:** Actor drags an image from another browser tab/website directly onto the
converter.

**Main flow:**
1. Browser hands the converter only the image's URL (cross-origin drag does not expose file
   bytes).
2. System fetches that URL server-side on the actor's behalf.
3. System proceeds with conversion as in UC-C-01 main flow, step 2 onward, using the
   fetched image.

**Exception flow (unreachable or invalid URL):** System reports a fetch failure rather than
silently falling back to a blank/placeholder pattern.

**Postconditions:** Same as UC-C-01 — a converted pattern is ready for editing.

---

## UC-C-07 — Review editor usage analytics

**Primary actor:** Site operator.

**Related requirements:** FR-ANL-1, FR-ANL-2, FR-ANL-3.

**Trigger:** Operator opens `/admin/editor-analytics`, or receives the daily editor-usage
summary email.

**Main flow:**
1. System has been recording editor events (opens, conversions, PDF exports, entry source,
   errors) throughout the day as actors use the tool (UC-C-01 through UC-C-06 each
   contribute events).
2. Operator reviews the open→convert→export funnel, entry-source breakdown, error rate, and
   feedback volume (cross-referencing UC-W-06/UC-W-08 submissions made from the editor) for
   a chosen date range.
3. Operator uses this to spot regressions (e.g., a conversion-error spike after a deploy) or
   to gauge feature adoption.

**Alternate flow (daily email digest):** Operator instead passively receives a same-day
summary email; if there were zero editor sessions that day, the system suppresses the email
rather than sending an empty report.

**Postconditions:** None — this is a read-only reporting use case.
