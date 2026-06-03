# Focus

## Current goal

Verify tomorrow's Lambda scheduled run (02:00 UTC / 05:00 local), then disable Windows Task Scheduler and mark Milestone 7 complete.

## Active work

### Milestone 7 — Lambda deployed, pending first scheduled run

**Lambda is live.** Function `cross-stitch-daily-pipeline`, EventBridge rule `cross-stitch-daily-5am` (02:00 UTC). All env vars set.

**What was tested (2026-06-03):** Manual invocations confirmed steps 1–7 pass. Steps 8 (AI design analysis) and 9 (daily summary email) were not reached because Pinterest rate limiting on step 7 consumed most of the 15-minute Lambda timeout.

**Bug fixes applied during Lambda migration:**
- All 7 pipeline scripts had bare `main()` call at module top level → wrapped with `if (!process.env.AWS_LAMBDA_FUNCTION_NAME)`
- `build-design-performance.ts` had `process.exit(0)` inside `run()` → removed
- `test-ai-trend-analysis.ts` and `test-ai-design-analysis.ts` had top-level `process.exit(1)` for missing API key → guarded same way
- `readPinterestToken.ts` read token from file only → now checks `PINTEREST_ACCESS_TOKEN` env var first
- `deploy.ps1` passed JSON inline to AWS CLI → PowerShell 5.1 adds UTF-8 BOM which AWS CLI rejects as invalid JSON → fixed by writing temp files via `[System.IO.File]::WriteAllText`

**Analytics cache added to `build-design-performance.ts`:**
- Before fetching, queries DDB for pins already written for today's `snapshotDate`
- Skips cached pins → zero API calls on re-runs the same day
- Writes each pin to DDB immediately after fetch (checkpoint pattern) → Lambda auto-retries resume from where a timeout left off

**Tomorrow morning — what to check:**
1. CloudWatch Logs → `/aws/lambda/cross-stitch-daily-pipeline` — look for `[pipeline] complete for date=2026-06-03`
2. Inbox (olga.epstein@gmail.com) — daily summary email should arrive
3. If both green: `schtasks /Change /TN PinterestDailyReport /Disable` and tick the Done when item
4. If step 7 still times out: the cache means the Lambda auto-retry will complete steps 8–9

## Session 2026-06-01 — completed housekeeping

- Fixed website dev server: replaced hardcoded `localhost:3000` API fetches
  with direct `getDesignById` / `getDesignsByAlbumId` calls in
  `designs/[designId]/page.tsx` and `albums/[albumId]/page.tsx`
- Added `suppressHydrationWarning` to `<html>` in `layout.tsx` (browser extension interference)
- Created `web/.env.local` (copied from old `cross-stitch` repo)
- Renamed branch `master` → `main`
- Renamed `docs/plan/cross-stitch/` → `docs/plan/web/`
- Updated `docs/CLAUDE.md`, `docs/cross-stitch.code-workspace`,
  `docs/integration/README.md` — replaced old `../cross-stitch/` paths with `../web/`
- Pointed all three bat files and all four Task Scheduler tasks to monorepo paths:
  - AutoPinner: `automation/autopinner/autopinner-run.bat` (interval 30 → 20 min, cap 50 → 75)
  - PinterestDailyReport: `automation/pinterest-agent/daily-run.bat`
- Built Release binary for AutoPinner at monorepo path
- Added `uploader/.claude/skills/email-template-usage/SKILL.md`

## Pending / lower priority

- Milestone 8 remainder: AI recommendation change alerts, Telegram bot for phone notifications

## Out of scope (do not touch)

- Uploader WPF app (Milestone 10 — planned, not started)
- Meta / Reddit / TikTok expansion (Milestone 11 — future)
- Controlled automation (Milestone 13 — long-term)

## Done when

- [x] SOAK-WINDOW.md days 1–8 all ✓ (completed 2026-06-03)
- [x] Read cutover: historyBuilder reads from DDB, not local JSON (2026-06-03)
- [x] JSON writes stripped from daily pipeline scripts (2026-06-03)
- [x] Daily summary email sent and verified end-to-end via SES (2026-06-03)
- [ ] Lambda deployed, EventBridge rule active, Windows task disabled
