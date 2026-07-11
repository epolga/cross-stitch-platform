# Software Requirements Specification — Photo-to-Cross-Stitch Converter

**Component:** `web/src/app/photo-to-cross-stitch/*` and its supporting `/api/convert*`,
`/api/analyze`, `/api/converter/*`, `/api/import-image-url`, `/api/analytics/editor-*` routes
(same Next.js codebase as the website, distinct product surface)
**Part of:** cross-stitch-platform — see `00-Overview.md` for cross-component context
**Status:** Draft, reverse-engineered from the current implementation
**Date:** 2026-07-11

## 1. Introduction

### 1.1 Purpose

This document specifies the requirements of the in-browser tool that lets a visitor turn
their own photo into an editable, printable/on-screen cross-stitch pattern, distinct from
browsing the pre-made catalog specified in `01-SRS-Website.md`.

### 1.2 Scope

In scope: photo import and conversion, the canvas-based pattern editor (drawing tools,
palette, resize), saving/loading patterns, PDF export, and the editor's own usage-analytics
and feedback capture. Out of scope: account/auth mechanics (see `01-SRS-Website.md`
§3.3 — the converter reuses website authentication), monetization mechanics (reused
unchanged), the rest of the website.

### 1.3 Definitions

- **Pattern** — a saved grid of stitches with an associated color palette, produced either
  by converting a photo or by editing from scratch.
- **Stitch grid** — the width × height matrix of cells, each holding a palette color/symbol
  or being empty.
- **Draft** — an auto-saved, not-yet-explicitly-saved in-progress pattern.

## 2. Overall description

### 2.1 Product perspective

The converter is a standalone tool entered at `/photo-to-cross-stitch`; it does not require
having browsed the catalog first. It shares the website's authentication, DynamoDB access
patterns, and hosting, but its core value (image → editable stitch grid, in-browser editing,
PDF export) is functionally independent of the catalog.

### 2.2 User classes

- **Anonymous visitor** — can open the editor, import a photo, and edit; cannot save a
  pattern or download a PDF without logging in.
- **Registered/logged-in user** — can save patterns to their account (`/profile/patterns`)
  and export PDFs.

### 2.3 Constraints

- Login is required to save or download, but not to explore the editor itself — this is a
  deliberate try-before-signup design, not a bug.
- Server-side conversion (`/api/convert`) is synchronous per request; there is no queued/
  background conversion pipeline.

## 3. Functional requirements

### 3.1 Photo import and conversion

- **FR-CVT-1.** The system shall accept an uploaded image (JPEG, PNG, WebP, or GIF, up to
  5 MB) as the source for pattern conversion.
- **FR-CVT-2.** The system shall accept an image dragged from another website (a URL, not
  file bytes) by fetching it server-side before conversion, to support cross-origin drag-
  and-drop where the browser only exposes a URL.
- **FR-CVT-3.** The system shall let the user configure the target grid width and height
  (10–500 stitches) before conversion.
- **FR-CVT-4.** The system shall let the user choose a target color count from a fixed set
  of options (2, 3, 4, 5, 10, 20, 30, 40, 50, 100).
- **FR-CVT-5.** The system shall let the user choose a conversion mode: automatic,
  photo-optimized, illustration-optimized, or line-art-optimized.
- **FR-CVT-6.** The system shall analyze the uploaded image server-side to inform default
  conversion parameters before the user finalizes settings.
- **FR-CVT-7.** The system shall convert the image into a stitch grid with an associated DMC
  color palette (drawn from a 454-shade reference set) matching the user's chosen
  width/height/color-count/mode.

### 3.2 Pattern editing

- **FR-EDT-1.** The system shall provide pencil, eraser, flood-fill, and select tools for
  editing individual grid cells.
- **FR-EDT-2.** The system shall provide point, line, rectangle, and ellipse draw modes with
  a free-angle drag preview that snaps to the grid only on release (not during the drag).
- **FR-EDT-3.** The system shall provide a configurable pen width and a mirror tool
  (horizontal/vertical/axis, with an option to resize on mirror).
- **FR-EDT-4.** The system shall provide palette management: viewing/selecting the current
  palette, a color picker, a symbol picker, picking an existing palette entry to reuse,
  merging or moving palette colors, and hiding/showing individual colors (with hidden-state
  persisted on save).
- **FR-EDT-5.** The system shall provide a "highlight all stitches of a selected color"
  feature.
- **FR-EDT-6.** The system shall support undo/redo of editing actions and a save keyboard
  shortcut.
- **FR-EDT-7.** The system shall support resizing the stitch grid, with a choice of resize
  mode and anchor point.
- **FR-EDT-8.** The system shall provide both a colored ("simulation") view and a black-and-
  white symbol view of the pattern.
- **FR-EDT-9.** The system shall auto-save an in-progress draft (debounced) so unsaved
  editing work can be resumed after an interruption, independent of explicit save.

### 3.3 Save, load, and export

- **FR-SAV-1.** The system shall require the user to be logged in to save a pattern or
  export a PDF.
- **FR-SAV-2.** The system shall let a logged-in user save a named pattern (grid, palette,
  hidden-colors state, dimensions, thumbnail) to their account, and list, open, update, and
  delete their own saved patterns.
- **FR-SAV-3.** Saved patterns shall be private to their owner by default and accessible via
  a shareable link.
- **FR-SAV-4.** The system shall generate a print-ready PDF containing a cover page, a
  thread/color-key table (DMC number, name, symbol, stitch count per color), a page-tiling
  map, and the chart itself, tiled across multiple physical pages as needed; the chart
  pages shall render in one of three selectable modes (symbol only, color only, or color
  with symbol overlay).
- **FR-SAV-5.** The system shall support using the editor as an on-screen stitching aid
  (colored/symbol toggle) without requiring the PDF to be printed, on phone, tablet, and
  desktop viewports.

### 3.4 Feedback and analytics

- **FR-FBK-1.** The system shall provide an in-editor feedback mechanism (shared with the
  website's feature-request flow, §FR-ENG-6 in `01-SRS-Website.md`), additionally capturing
  editor-specific context: current pattern width/height/color count, time spent in the
  editor, and number of stitches changed.
- **FR-ANL-1.** The system shall record editor usage events (opens, conversions, PDF
  exports, entry source, errors) for operator review.
- **FR-ANL-2.** The system shall provide an operator-facing analytics dashboard
  (`/admin/editor-analytics`, specified in `01-SRS-Website.md` FR-ADM-2) summarizing the
  open→convert→export funnel, entry sources, error rate, and feedback volume.
- **FR-ANL-3.** The system shall send the operator a daily summary email of editor usage
  (sessions, PDF exports), suppressed when there were zero sessions that day.

## 4. External interface requirements

| Interface | Direction | Purpose |
|---|---|---|
| AWS DynamoDB | Read/write | Saved patterns, editor analytics events |
| PDF generation library (server-side) | N/A (internal) | Renders the 3-part export PDF |
| Third-party site (drag source) | Read | Fetches an image URL dragged in from another page |
| AWS SES | Send | Daily editor-usage summary email to the operator |

## 5. Data model

- **Saved pattern** (DynamoDB, code-only entity — see caveat in `01-SRS-Website.md` §5):
  owner, name, width, height, palette, grid data, hidden-color state, thumbnail, timestamps.
- **Editor analytics event** (DynamoDB, code-only entity): event type (open/convert/export/
  error), session/entry-source context, timestamp.
- **Feature request** (shared with website, see `01-SRS-Website.md` §5): editor-specific
  fields (pattern dimensions, color count, editor time, stitches-changed count) are
  populated only when submitted from within the editor.

## 6. Non-functional requirements

- **NFR-1 (SEO de-duplication).** Converter URLs carrying a `designId`/`albumId` referrer
  parameter (i.e., "try the converter from this design page" links) shall be excluded from
  search indexing to avoid near-duplicate-content penalties; the bare converter URL and a
  `source`-only-tagged variant shall remain indexable.
- **NFR-2 (No ads on the converter).** Ad units shall not be shown on converter pages (see
  `01-SRS-Website.md` FR-MON-2).
- **NFR-3 (Responsiveness).** The editor shall be usable on mobile, tablet, and desktop
  viewports without requiring a desktop-only interaction (per FR-SAV-5).
- **NFR-4 (Upload limits).** Uploaded images shall be capped at 5 MB and restricted to
  JPEG/PNG/WebP/GIF; requests outside these limits shall be rejected with a clear error
  rather than silently truncated or degraded.
