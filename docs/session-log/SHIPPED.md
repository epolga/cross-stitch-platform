# Shipped — running changelog

One-line-ish pointers to what shipped each session, newest first. Full
narrative for each lives in the matching `docs/session-log/<year-month>.md`
file (linked per entry) — this file exists so `Focus.md` doesn't have to
carry the summaries inline. Moved out of `Focus.md` 2026-09-07 per Olga's
ask to pack "Shipped" entries into an external file.

**2026-09-07** — found and fixed a structural bug: `DAILY_BUSINESS`'s
`ga4TotalAllSessions` was undercounted 22-100% for recent days (and
missing entirely mid-May to mid-July) because the daily pipeline queried
GA4 only ~24-25h after each day, before Google always finishes processing.
New rolling `backfillDailyBusiness()` re-corrects a 14-day window every
pipeline run; ran a one-time 120-day historical backfill over the full
`DAILY_BUSINESS` table. Deployed to the Lambda pipeline same day. Also
fixed 2 bugs in `checkpoint-2026-09-06.ts` found while reviewing its
digest. Full detail: `docs/session-log/2026-09.md`.

**2026-08-04/05** — editor fullscreen mode (+ 2 layout bugs found and
fixed), palette panel width-clipping bug, simulation-mode cross
thickness, "Publish to Catalog" admin feature (incl. a production IAM
fix), outline/stroke preservation reworked (hysteresis threshold +
k-means quantization pre-pass). Full detail: `docs/session-log/2026-08.md`.

**2026-08-03** — editor "Whole Chart" zoom default, CIE76→CIEDE2000
public picker, editor mobile scroll affordances, Milestone S5, S6 first
step (nav-performance baseline), password-reset fix, Ann/Nitka check,
design-vote first clean recurrence check. Full detail:
`docs/session-log/2026-08.md`.

**2026-07-27/07-28** — catalog PDF-to-editable conversion end to end, 3
parser bugs fixed, 6 quick-wins from a ChatGPT-doc review, a real
live-user bug fix (Christa — verify-email login). Full detail:
`docs/session-log/2026-07.md`.
