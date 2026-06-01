# Focus

## Current goal

Finish Milestone 5 soak window (day 7 tomorrow), then build Milestone 8 daily summary email.

## Active work

### Milestone 5 — DynamoDB soak window
Soak restarted from 2026-05-27 after two pipeline failures (5/25 and 5/26)
caused by duplicate DESIGN_PIN_MAP DDB keys. Root cause fixed in AutoPinner
(`GetLatestUnpinnedAsync` now skips DesignIDs already pinned on another row).

Days 1–6 all ✓. **Day 7 runs 2026-06-02 at 5 AM.**

Check `automation/pinterest-agent/daily-run.log` after the 5 AM cron.
If parity passes, proceed to the cutover checklist in SOAK-WINDOW.md:

1. Re-run `npm run verify-parity` manually one last time
2. Read cutover — switch `historyBuilder.ts` `loadReports` from
   `fs.readdirSync(reports/)` to `historyStore.queryRange("DAILY_BUSINESS", ...)`
3. Strip JSON writes from: `daily-business-report.ts`, `export-design-pin-map.ts`,
   `build-design-performance.ts`, `test-ai-trend-analysis.ts`, `test-ai-design-analysis.ts`
4. Clean up: delete `soak-reminder.bat`, remove MilestoneFiveSoakReminder task,
   remove the soak section from `web/CLAUDE.md`, delete `web/SOAK-WINDOW.md`
5. Mark Milestone 5 complete in this file and `docs/plan/web/Pinterest AI Agent — Milestones and Roadmap.md`

### Milestone 8 — Daily summary email (next after soak)
SES is already wired. Build the daily summary email: yesterday's KPIs +
latest AI trend recommendation, sent at the end of every cron run.
Estimated ~1 day of work.

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
  - MilestoneFiveSoakReminder: `automation/pinterest-agent/soak-reminder.bat`
- Built Release binary for AutoPinner at monorepo path
- Added `uploader/.claude/skills/email-template-usage/SKILL.md`

## Pending / lower priority

- Milestone 7: migrate cron agent from Windows Task Scheduler to AWS Lambda + EventBridge (~1 day)
- Milestone 8 remainder: AI recommendation change alerts, Telegram bot for phone notifications

## Out of scope (do not touch)

- Uploader WPF app (Milestone 10 — planned, not started)
- Meta / Reddit / TikTok expansion (Milestone 11 — future)
- Controlled automation (Milestone 13 — long-term)

## Done when

- [ ] SOAK-WINDOW.md days 1–7 all ✓ (target 2026-06-02)
- [ ] Read cutover: historyBuilder reads from DDB, not local JSON
- [ ] JSON writes stripped from daily pipeline scripts
- [ ] Daily summary email sent and verified end-to-end via SES
