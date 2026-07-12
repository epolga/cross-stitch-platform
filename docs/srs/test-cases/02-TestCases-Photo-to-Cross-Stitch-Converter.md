# Test Cases — Photo-to-Cross-Stitch Converter

**Derived from:** `../use-cases/02-UseCases-Photo-to-Cross-Stitch-Converter.md`

**Status:** Draft. "Automated?" column verified against `../09-Test-Plan.md` §2.1.

## TC set for UC-C-01 — Convert a photo into a pattern

| ID | Title | Priority | Steps (condensed) | Expected result | Automated? |
|---|---|---|---|---|---|
| TC-C-01-01 | Valid photo converts successfully | High | 1. POST `/api/convert` with a valid JPEG, width=100, height=100, colors=20, mode=`auto`. | 200 with `grid`/`palette` matching requested dimensions; distinct DMC colors ≤ 20. | No — the conversion route and `convertImage()` itself have no test file |
| TC-C-01-02 | Oversized file is rejected | Medium | 1. POST `/api/convert` with a 6MB image. | 400 `{error:"Image too large (max 5 MB)"}`. | No |
| TC-C-01-03 | Out-of-range dimensions are rejected | Medium | 1. POST with `width=501`. | 400 `{error:"Width must be 10–500"}`. | No |
| TC-C-01-04 | Invalid color count is rejected | Low | 1. POST with `colors=7` (not in the fixed set). | 400 `{error:"Colors must be 5, 10, 20, 30, 40, 50, or 100"}` (note: message text should be re-verified against the current fixed set, which also includes 2/3/4 per `06-API-Specification.md`). | No |
| TC-C-01-05 | Same image produces identical output across repeated conversions | High | 1. Convert the same image bytes twice with identical params. | Identical `grid`/`palette` both times (verifies the seeded-PRNG determinism claimed in `../lld/02-LLD-Photo-to-Cross-Stitch-Converter.md` §4.2 step 3). | No |
| TC-C-01-06 | `analyzeImage` routes high-confidence line-art to the line-art pipeline | High | 1. Call `imageTypeToMode('line-art', 'high')`. | Returns `'line-art'`. | **Yes** — `src/lib/image-analysis.test.ts` |
| TC-C-01-07 | Medium-confidence line-art does NOT force the line-art pipeline | High | 1. Call `imageTypeToMode('line-art', 'medium')`. | Returns `'photo'` (per the documented false-positive-avoidance rule). | **Yes** — same file |
| TC-C-01-08 | Illustration routes to illustration regardless of confidence | Medium | 1. Call `imageTypeToMode('illustration', <any>)`. | Returns `'illustration'`. | **Yes** — same file |

## TC set for UC-C-02 — Edit and refine a pattern

| ID | Title | Priority | Steps (condensed) | Expected result | Automated? |
|---|---|---|---|---|---|
| TC-C-02-01 | Line/rectangle/ellipse draw with free-angle preview, snap-on-release | Medium | 1. Drag a line tool at a non-grid-aligned angle. 2. Release. | Preview follows the free angle during drag; final placement snaps to grid cells only on release. | No (client-side canvas interaction, no test found) |
| TC-C-02-02 | Mirror tool reflects edits across the configured axis | Medium | 1. Enable horizontal mirror. 2. Draw a stitch on one side. | A mirrored stitch appears on the opposite side automatically. | No |
| TC-C-02-03 | Undo/redo restores prior grid state | Medium | 1. Make an edit. 2. Undo. 3. Redo. | Grid matches pre-edit state after undo, post-edit state after redo. | No |
| TC-C-02-04 | Resize preserves overlapping stitches | High | 1. Resize a pattern larger, anchored top-left. | Original stitches remain in place; new cells are empty. | No |

## TC set for UC-C-03 — Save a pattern to an account

| ID | Title | Priority | Steps (condensed) | Expected result | Automated? |
|---|---|---|---|---|---|
| TC-C-03-01 | Save requires login | High | 1. POST `/api/converter/patterns` with no session. | 401 `{error:"Login required"}`. | **Yes** — `src/app/api/converter/patterns/route.test.ts` |
| TC-C-03-02 | Missing grid is rejected | Medium | 1. POST with no `grid` field. | 400 `{error:"Invalid pattern data"}`. | **Yes** — same file |
| TC-C-03-03 | Grid/dimension mismatch is rejected | Medium | 1. POST with `grid` whose row/column count doesn't match `width`/`height`. | 400 `{error:"Grid dimensions mismatch"}`. | **Yes** — same file |
| TC-C-03-04 | Zero width is rejected | Low | 1. POST with `width:0`. | 400 `{error:"Invalid dimensions"}`. | **Yes** — same file |
| TC-C-03-05 | Valid save returns a new pattern ID | High | 1. POST with valid, matching grid/palette/dimensions. | 200 `{id}`; DDB item written with correct fields. | **Yes** — same file |
| TC-C-03-06 | Thumbnail is passed through when provided | Low | 1. POST with a `thumbnail` value. | Stored item includes the thumbnail. | **Yes** — same file |
| TC-C-03-07 | Oversized compressed grid is rejected | Medium | 1. POST a pattern whose RLE-encoded grid exceeds 350KB. | 500 `{error:"Pattern too large to save (grid exceeds 350 KB compressed)"}`. | No — cap exists in `savePattern` but no test exercises the over-cap path specifically |
| TC-C-03-08 | Listing requires login | High | 1. GET `/api/converter/patterns/my` with no session. | 401 `{error:"Login required"}`. | **Yes** — `src/app/api/converter/patterns/my/route.test.ts` |
| TC-C-03-09 | Listing returns the owner's patterns, empty list handled | Medium | 1. GET as an owner with 0 and then 2+ saved patterns. | Empty array when none; correct list when present. | **Yes** — same file |
| TC-C-03-10 | Opening a public pattern needs no session | Medium | 1. GET `/api/converter/patterns/[id]` for a pattern with no `ownerID`, no session cookie. | 200 with pattern data. | **Yes** — `.../[id]/route.test.ts` |
| TC-C-03-11 | Opening another user's owned pattern is denied | High | 1. GET `/api/converter/patterns/[id]` for a pattern owned by user A, session is user B. | 403 `{error:"Access denied"}`. | **Yes** — same file |
| TC-C-03-12 | Invalid pattern ID format is rejected | Low | 1. GET with an id not matching `/^[0-9a-f-]{36}$/`. | 400 `{error:"Invalid pattern ID"}`. | **Yes** — same file |
| TC-C-03-13 | Update requires ownership | High | 1. PUT `/api/converter/patterns/[id]` as a non-owner. | 403 `{error:"Access denied"}`. | **Yes** — same file |
| TC-C-03-14 | RLE encode/decode round-trips correctly | Medium | 1. Encode a grid, decode it back. | Output matches original, including edge cases (uniform grid, empty cells, empty grid). | **Yes** — `src/lib/pattern-storage.test.ts` |
| TC-C-03-15 | `listPatternsByOwner` queries the correct GSI and sorts newest-first | Medium | 1. Call `listPatternsByOwner` for an owner with multiple patterns. | Query uses `ownerID-index`; results sorted newest-first, mapped to `PatternSummary`. | **Yes** — same file |

## TC set for UC-C-04 — Export a pattern as a print-ready PDF

| ID | Title | Priority | Steps (condensed) | Expected result | Automated? |
|---|---|---|---|---|---|
| TC-C-04-01 | Valid grid/palette produces a PDF | High | 1. POST `/api/convert/pdf` with a valid grid/palette. | 200, `Content-Type: application/pdf`, non-empty body. | No |
| TC-C-04-02 | Empty grid/palette is rejected | Medium | 1. POST with empty `grid`/`palette`. | 400 `{error:"Invalid pattern data"}`. | No |
| TC-C-04-03 | Page count scales with grid size and chosen page-tiling constants | Medium | 1. Generate a PDF for a grid large enough to require 4 chart-tile pages. | Chart section has exactly 4 pages, each labeled per the page-map's column-letter/row-number scheme. | No |
| TC-C-04-04 | `chartMode` selects the correct chart rendering | Medium | 1. Generate with `chartMode:'color'`, then `'symbol'`, then `'color-symbol'`. | Chart pages visually differ per mode (color fill only / symbols only / both); cover, color-key, and page-map pages are present in all three regardless of mode. | No |
| TC-C-04-05 | Stitch counts in the color-key match actual grid usage, not stale `stitchCount` | Medium | 1. Load a pattern whose stored `stitchCount` per color is stale (edited since last save). 2. Export. | Color-key counts reflect the current grid's actual cell usage, recounted at export time. | No |

## TC set for UC-C-05 — Resume an interrupted editing session

| ID | Title | Priority | Steps (condensed) | Expected result | Automated? |
|---|---|---|---|---|---|
| TC-C-05-01 | Draft auto-saves during editing | Medium | 1. Make an edit. 2. Wait past the debounce interval. | Draft state updates without an explicit Save click. | No |
| TC-C-05-02 | Returning to the editor restores the unsaved draft | High | 1. Edit without saving. 2. Close/reopen the editor in the same browser session. | Editor restores the draft, not a blank canvas. | No |
| TC-C-05-03 | Thumbnail generation handles an empty grid without erroring | Low | 1. Call `generatePatternThumbnail` with an empty grid. | Returns empty string, no exception. | **Yes** — `src/lib/pattern-thumbnail.test.ts` |
| TC-C-05-04 | Thumbnail caps canvas size for very large grids | Low | 1. Call `generatePatternThumbnail` with a grid whose natural render size exceeds `maxW`. | Cell size is capped so output canvas does not exceed `maxW`. | **Yes** — same file |

## TC set for UC-C-06 — Import an image dragged from another website

| ID | Title | Priority | Steps (condensed) | Expected result | Automated? |
|---|---|---|---|---|---|
| TC-C-06-01 | Valid external image URL is fetched and proxied | High | 1. GET `/api/import-image-url?url=<valid image URL>`. | 200, image bytes returned, `Content-Type` matches upstream. | No |
| TC-C-06-02 | Private/loopback-resolving host is rejected (SSRF guard) | High | 1. GET with a URL resolving to a private IP (e.g. via DNS rebinding or a `10.x`-resolving hostname). | 400 `{error:"URL not allowed"}`. | No |
| TC-C-06-03 | Non-image content type is rejected | Medium | 1. GET with a URL serving `text/html`. | 415 `{error:"URL is not an image"}`. | No |
| TC-C-06-04 | Oversized response is rejected mid-stream | Medium | 1. GET a URL whose body exceeds 8MB. | 413 `{error:"Image too large"}`, aborted before fully buffering. | No |
| TC-C-06-05 | Rate limit applies per IP | Medium | 1. Send 11 requests within 60s from one IP. | 11th request returns 429. | No |
| TC-C-06-06 | Unreachable URL fails cleanly | Low | 1. GET a URL that times out or 5xxs. | 502 `{error:"Failed to fetch image"}` within the 10s timeout, not a hang. | No |

## TC set for UC-C-07 — Review editor usage analytics

| ID | Title | Priority | Steps (condensed) | Expected result | Automated? |
|---|---|---|---|---|---|
| TC-C-07-01 | Only allow-listed event types persist | Medium | 1. POST `/api/analytics/editor-event` with `eventType:'editor_opened'`, then with an arbitrary unlisted type. | First is stored; second returns `{ok:true}` but writes nothing. | No |
| TC-C-07-02 | `no_track` cookie suppresses writes | Medium | 1. POST an event with the `no_track=1` cookie set. | 200 `{ok:true}`, no DDB write. | No |
| TC-C-07-03 | Admin dashboard aggregates correctly | Medium | 1. Seed known events across several days. 2. GET `/api/admin/editor-analytics`. | `dailyCounts`/`topSources`/`recentErrors`/`recentFeedback` match the seeded data. | No |
| TC-C-07-04 | Daily summary email suppressed on zero sessions | Low | 1. Run the editor-summary job for a day with no recorded sessions. | No email sent. | No (Pinterest-automation side — see `03-TestCases-Pinterest-Automation.md`) |
