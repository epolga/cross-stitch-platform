# Editor Feedback Fixes — July 2026

## Source

User feedback from **Leisa** (also the source of the mobile PDF button-overlap
fix in the 2026-07-08 session, see `docs/Focus.md`), via email, forwarded by
Olga 2026-07-10. Surfaced while
investigating an unrelated "big activity on the editor page" question (see
`docs/Focus.md`, 2026-07-10 session — that turned out to be search-crawler
traffic in server logs, unrelated to this feedback).

Feedback, verbatim:

> Hi ann, please make this an app. Every time I hit the back button it takes
> me back to my email and I have to start over. Also, when u size ur pattern
> in the beginning is fine but if u make a mistake and choose resize from the
> editor menu it won't let u clear the previous number. Ex. I had 100x100 but
> went to change to 200x200 and It let me erase 0 but left the 10 (10 0) and
> I couldn't resize it without starting over. Also, when u begin, u give it a
> title and it's supposed to save it. When I had to start over for the 3rd
> time, I chose open and it asks for a link. It didn't save my first one and
> this is even more frustrating because there shouldn't be a link it should
> just save to ur phone or computer to pull up when needed. Going to try
> again. Wish me luck

## Root causes (confirmed in code)

### 1. Resize dialog won't let you clear the field to retype

- File: `web/src/app/components/ResizeDialog.tsx:30-39`
- Cause: `changeW`/`changeH` clamp on every keystroke via
  `Math.max(10, Math.min(500, val || 10))`. Clearing the input →
  `parseInt('') = NaN` → `NaN || 10` evaluates to `10`, snapping the field
  back to 10 before the user can type a new value — explains the observed
  "10 0" (new digits landing on top of the snapped-back value).
- Fix: track the raw text the user is typing as separate string state,
  independent of the clamped numeric value used for the actual resize.
  Clamp only on blur or on the "Resize" click.
- Status: [x] done 2026-07-10 — `ResizeDialog.tsx` now tracks `wText`/`hText`
  separately from the clamped `w`/`h`; clamp runs on blur (which fires
  before the Resize button's click, so a left-empty field is still handled)
  and on valid keystrokes only. Typecheck clean.

### 2. "Open" is a raw `prompt()` asking for a link/ID

- File: `web/src/app/photo-to-cross-stitch/ConvertClient.tsx:1375-1385`
- Cause: the "Open from link…" menu item calls
  `prompt('Paste a pattern link or ID:')` instead of listing the user's own
  saved patterns.
- Reusable pieces already in the codebase:
  - `GET /api/converter/patterns/my`
    (`web/src/app/api/converter/patterns/my/route.ts`) — already returns the
    logged-in user's saved patterns (401 if not logged in).
  - `ProfilePatternsPageClient.tsx` already renders a very similar list
    (thumbnail + name + date) on `/profile/patterns`.
- Fix: new `OpenPatternDialog` component modeled on the existing
  `SavePatternDialog`, fetching `/api/converter/patterns/my` and listing
  results; clicking one loads it (reuse the existing load code currently
  wired to the `prompt()` result at `ConvertClient.tsx:1383`). If not logged
  in, show "Log in to see your saved patterns" instead of surfacing the 401.
- Status: [x] done 2026-07-10 — new `web/src/app/components/OpenPatternDialog.tsx`
  (thumbnail + name + width×height + date, reusing the same `PatternSummary`
  shape and `unoptimized` `next/image` pattern already used on
  `/profile/patterns`). Replaced the "Open from link…" menu item's
  `prompt()`/`alert()` flow with `Open…` → dialog → `loadPatternById(id)`
  (existing loader, now also syncs `?pattern=` into the URL on load, which
  the old inline handler did but `loadPatternById` didn't). Typecheck + lint
  clean (same one pre-existing unrelated warning).

### 3. Naming a pattern feels like saving it, but isn't — and there's no autosave

- File: `web/src/app/photo-to-cross-stitch/ConvertClient.tsx`
  (pattern-name field ~line 1296; `handleSavePattern` ~line 594, login
  required at line 597; `handleSave` ~line 570)
- Cause: the name field is local-only UI state. Only an explicit Save
  (button or Ctrl+S) persists anything, and only works if the user is
  logged in. Confirmed via grep: no `localStorage` persistence and no
  `beforeunload` guard exist for pattern data anywhere in this file — only
  an unrelated `localStorage` flag for a one-time UI hint. Any navigation
  away before an explicit, logged-in Save (including a mobile mail app's
  in-app browser exiting on "back") loses all work.
- Fix: debounced autosave of grid/palette/name to `localStorage`,
  independent of login. On landing on `/photo-to-cross-stitch` with no
  `?pattern=` param, if a draft exists in `localStorage`, offer "Resume your
  last pattern" instead of starting blank.
- Status: [x] done 2026-07-10 — `ConvertClient.tsx`: 800ms-debounced
  autosave to `localStorage` key `converterDraft` whenever there's design
  content and no account-saved `savedPatternId` yet; a "Resume/Discard"
  prompt appears on fresh landing (no `?pattern=`) if a draft with content
  is found. Draft is cleared on a successful account save and on explicit
  "New pattern". Typecheck + lint clean (one pre-existing unrelated
  warning).
- **Follow-up 2026-07-10 (same day):** Olga reported the original small
  top-of-page banner got lost on a large desktop display. Changed it to a
  centered modal dialog with a dark backdrop (`bg-black/40`), matching the
  visual weight of the existing Save/Resize/Open dialogs — same component,
  same `resumeDraft`/`applyResumeDraft`/`discardResumeDraft` state, just a
  different container. Re-verified live: modal is unmissable at any
  viewport size, Resume still restores the exact prior draft.

## Deferred — not doing now

**"Make it an app" (native Windows `setup.exe`, or a PWA).** The actual
complaint (back button from a mail app's in-app browser exits to the mail
app) is very likely a mobile scenario — a Windows-only installer would not
even reach the person who wrote in, and Olga can currently only test on
Windows anyway. A cross-platform installable PWA (manifest + icons +
service worker) would address the underlying complaint more directly, but
is a materially bigger lift, and iOS only supports it via a manual "Add to
Home Screen" in Safari, not an install prompt. No `manifest.json` exists in
the project today — confirmed nothing PWA-related is set up yet.

**Decision:** ship the autosave fix (#3) first — it removes the actual pain
(lost work) without needing an installer or a PWA at all. Revisit "make it
an app" only if the back-button complaint keeps recurring after that.

## Verification (2026-07-10)

Verified live in a real browser (Next.js dev server + Playwright), not just
typecheck/lint:

- **Resize:** cleared the Width field to empty (confirmed DOM value `""`,
  not stuck at "10"), typed "200" cleanly, confirmed Resize applied it
  (header showed "200 × 100 stitches"). Typed "9999" and tabbed away →
  clamped to "500" on blur, not fought mid-typing.
- **Autosave/resume:** generated a pattern, waited for the 800ms debounce,
  read `localStorage.converterDraft` directly (200×100, 30 colors). Reloaded
  the page fresh — "We found unsaved work from last time" banner appeared;
  clicked Resume — editor restored to the exact same 200×100/30-color state.
- **Open dialog:** File → "Open…" opens the new dialog, not `prompt()`. Dev
  session had a stale client-side login flag with no real server session,
  so the dialog's fetch got a 401 — it correctly rendered "Log in to see
  your saved patterns" instead of crashing. Clicking "Log in" closed the
  dialog and fired the same `openRegisterModal` event the pre-existing Save
  button already uses (confirmed via the app's own debug log).

## Deployed

2026-07-10, `eb deploy cross-stitch-com-env-clone` — build clean, local
smoke test (/, /albums, /designs/4217 all 200, buildId verified), deployed,
`eb status` confirms Health: Green. Next: thank Leisa once her email is on
hand.

## Order of work

1. Resize field fix (#1) — smallest, most self-contained.
2. Autosave draft + resume (#3) — fixes the main complaint (lost work).
3. Open-patterns list (#2) — reuses existing API, medium size.
4. PWA / native app — deferred, revisit only if still needed.
