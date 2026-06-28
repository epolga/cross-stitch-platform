# Editor Analytics & Owner Notifications — Implementation Plan

**Source spec:** `docs/plan/web/Editor_Analytics_and_Notifications.md`  
**Status:** Ready to implement. Start from Part 1.

---

## Architecture decisions

| Concern | Decision | Reason |
|---|---|---|
| Client-side events | GA4 (`window.gtag`) | Already installed (`G-J63NFLQTD1`). Free funnel + session analysis. |
| Server-side log | New `EditorEvents` DDB table | Needed for owner email and admin page. Not available in GA4 without BigQuery. |
| Email | Existing SES via `ses.sendEmail` | Already used by Lambda daily pipeline. No new infra. |
| Admin protection | Existing `isUserLoggedIn` check (same as `/admin/feature-requests`) | Consistent with current pattern. |
| Daily summary | New Lambda step 14 in existing pipeline | Follows same pattern as daily business report. |

---

## Part 1 — GA4 events in the editor (1 session)

**File:** `web/src/app/photo-to-cross-stitch/ConvertClient.tsx`

Add a thin helper at the top of the file:

```ts
function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', name, params);
  }
}
```

### Events to add

| Event | Where to fire | Key params |
|---|---|---|
| `editor_opened` | `useEffect([], [])` — on mount | `{ source: referrer/URL param }` |
| `design_loaded` | after `loadPattern()` succeeds | `{ patternId, patternWidth, patternHeight, colorCount }` |
| `image_uploaded` | in `handleImport` after file selected | `{ fileType }` |
| `pattern_generation_started` | start of conversion request | `{ width, height, colorCount }` |
| `pattern_generated` | after `convertImage` response received | `{ width, height, colorCount, durationMs }` |
| `manual_editing_started` | first `onPaint` / `onFill` call (fire once per session, use a ref flag) | `{ tool: 'pencil' \| 'fill' \| 'erase' }` |
| `manual_editing_action` | every `onPaint` / `onFill` / `onStrokeEnd` — throttled: max 1 per 10 s | `{ tool }` |
| `palette_changed` | color picker confirm | `{ changeType: 'replace' \| 'merge' \| 'add' }` |
| `pattern_size_changed` | ResizeDialog confirm | `{ newWidth, newHeight }` |
| `pdf_exported` | after PDF download completes | `{ width, height, colorCount }` |
| `project_saved` | after save API returns 200 | `{ patternId }` |
| `project_reopened` | when editor loads an existing saved pattern | `{ patternId }` |
| `feedback_submitted` | after feature-request POST returns 200 | `{ importance }` |
| `editor_error` | in catch blocks of convert / PDF / save | `{ errorCode, step }` |

### Source tracking

On `editor_opened`, read the `source` URL param (to be added by CTAs in Part 5) and include it in the event. Also read `document.referrer` as fallback.

---

## Part 2 — Server-side EditorEvents DDB table + API (1 session)

Track a subset of events server-side so they are available for the daily email and admin page without depending on GA4 export.

### DDB table: `EditorEvents`

| Field | Type | Notes |
|---|---|---|
| `id` | String (PK) | `randomUUID()` |
| `eventType` | String | e.g. `pattern_generated`, `pdf_exported` |
| `ts` | String | ISO timestamp |
| `date` | String | `YYYY-MM-DD` — used for daily aggregation |
| `sessionId` | String | UUID generated on editor mount, stored in sessionStorage |
| `userId` | String? | If logged in |
| `patternId` | String? | If saved pattern |
| `patternWidth` | Number? | |
| `patternHeight` | Number? | |
| `colorCount` | Number? | |
| `source` | String? | `design_page`, `album_page`, `direct` |
| `ttl` | Number | Unix epoch + 90 days (DDB TTL) |

GSI: `date-eventType-index` on `date` + `eventType` — for daily aggregation queries.

### Events tracked server-side (subset)

Only events that matter for the owner summary:

- `editor_opened`
- `pattern_generated`
- `pdf_exported`
- `feedback_submitted`
- `editor_error`

### New files

**`web/src/lib/editor-events.ts`**
- `logEditorEvent(event)` — PutItem to DDB
- `getEditorEventsByDate(date)` — Query by date GSI
- `getEditorEventCounts(date)` — aggregate counts by eventType for one date
- `ensureTable()` — auto-create if missing (same pattern as `feature-requests.ts`)

**`web/src/app/api/analytics/editor-event/route.ts`**
- `POST` — accepts `{ eventType, sessionId, ...params }`, calls `logEditorEvent`
- No auth required (public endpoint, no PII written)
- Rate-limit: one write per `sessionId + eventType` per minute (simple in-memory map, good enough)

### Client-side call

In `ConvertClient.tsx`, after firing `gtag`, also POST to `/api/analytics/editor-event` for the subset events above.

---

## Part 3 — Email notifications (1 session)

### Immediate notifications

Use a `EditorMilestones` DDB item (single row, key `MILESTONES`) to store boolean flags:

```
{
  firstEditorUsage: boolean,
  firstPdfExport: boolean,
  firstFeedback: boolean,
}
```

When `logEditorEvent` writes an event, check the corresponding flag. If not set, send email + set flag.

**Trigger points (in `editor-events.ts`):**
- `editor_opened` → if `!firstEditorUsage` → send "First editor visitor" email + set flag
- `pdf_exported` → if `!firstPdfExport` → send "First PDF exported" email + set flag
- `feedback_submitted` → if `!firstFeedback` → send "First feedback submitted" email + set flag

**Repeated errors:** if `editor_error` count for today > 5 → send one alert email (guarded by a `errorAlertSentDate` field on the milestones row).

**Email sender:** reuse `ses.sendEmail` from existing infrastructure. Send to `olga.epstein@gmail.com`.

### Daily summary email — Lambda step 14

**New file:** `automation/pinterest-agent/src/steps/editorDailySummary.ts`

Runs after step 13 (existing daily summary email).

Queries `EditorEvents` DDB for today's date:
1. Counts by eventType → fills the "Today" section
2. Calculates funnel conversion rates (uploaded → generated, generated → exported)
3. Fetches today's `feedback_submitted` events → reads full text from `FeatureRequests` table (join on `patternId` / timestamp)
4. Calls Claude Haiku to write 3–5 "Observations" bullets (same pattern as AI trend analysis step)
5. Sends via SES

**Email template:**

```
Subject: Editor Daily Summary — {date}

Today:
  Editor opened:        {n}
  Images uploaded:      {n}
  Patterns generated:   {n}
  PDFs exported:        {n}
  Feedback submitted:   {n}
  Errors:               {n}

Funnel:
  Upload → Generate: {pct}%
  Generate → Export: {pct}%

Feedback today:
  {list of messages, or "None"}

Observations:
  {Claude Haiku 3-5 bullets}

Top source pages:
  {top 3 source values by count}
```

If zero editor events today, skip sending (no-op).

---

## Part 4 — Admin page `/admin/editor-analytics` (0.5 session)

**File:** `web/src/app/admin/editor-analytics/page.tsx`

Follows same pattern as `web/src/app/admin/feature-requests/page.tsx`:
- Client component with `isUserLoggedIn()` guard → redirect to `/` if not admin
- Fetches `/api/admin/editor-analytics` on mount

**API route:** `web/src/app/api/admin/editor-analytics/route.ts`
- Returns last 30 days of daily counts
- Returns last 20 `editor_error` events
- Returns last 20 `feedback_submitted` events (with text from FeatureRequests join)
- Returns top 5 source pages

**Page sections:**
1. **Daily funnel** — table: Date | Opened | Generated | Exported | Feedback | Errors
2. **Recent errors** — list: timestamp, errorCode, step
3. **Recent feedback** — list: timestamp, message, importance
4. **Top sources** — table: source | count

---

## Part 5 — CTAs on design and album pages (0.5 session)

### Design page CTA

**File:** `web/src/app/designs/[designId]/page.tsx` (or client component within)

Add a button below the design image:

```
[ Open in Editor ]
```

- Links to `/photo-to-cross-stitch?source=design_page&designId={id}`
- If design has a loadable pattern, also pass `patternId` so editor auto-loads it
- On click: fire `gtag('event', 'design_editor_cta_clicked', { designId, source: 'design_page' })`

### Album page CTA

**File:** `web/src/app/albums/[...slug]/page.tsx` (or equivalent)

Add a banner/card at the top or bottom:

```
Turn your own photo into a cross stitch pattern →
```

- Links to `/photo-to-cross-stitch?source=album_page&albumId={id}`
- On click: fire `gtag('event', 'album_editor_cta_clicked', { albumId, source: 'album_page' })`

---

## Implementation order

```
Session 1:  Part 1 — GA4 events in ConvertClient (all events)
Session 2:  Part 2 — DDB EditorEvents table + API route + client POST
Session 3:  Part 3 — Immediate emails + Lambda step 14 daily summary
Session 4:  Part 4 — Admin page + Part 5 — CTAs
```

---

## Files created / modified (summary)

| File | Action |
|---|---|
| `web/src/app/photo-to-cross-stitch/ConvertClient.tsx` | Add `trackEvent()` calls |
| `web/src/lib/editor-events.ts` | New — DDB log + milestone flags + SES immediate emails |
| `web/src/app/api/analytics/editor-event/route.ts` | New — POST endpoint |
| `web/src/app/api/admin/editor-analytics/route.ts` | New — admin data API |
| `web/src/app/admin/editor-analytics/page.tsx` | New — admin UI |
| `automation/pinterest-agent/src/steps/editorDailySummary.ts` | New — Lambda step 14 |
| `automation/pinterest-agent/src/pipeline.ts` | Add step 14 |
| `web/src/app/designs/[designId]/page.tsx` | Add CTA button |
| `web/src/app/albums/[...slug]/page.tsx` | Add CTA banner |

---

## Environment variables required (already set)

- `AWS_REGION` — already set
- `DDB_FEATURE_REQUESTS_TABLE` — already set (same pattern for new table)
- SES sender — already configured in Lambda

New variable to add to EB environment and Lambda:
- `DDB_EDITOR_EVENTS_TABLE` — default `EditorEvents` (auto-created on first write)
