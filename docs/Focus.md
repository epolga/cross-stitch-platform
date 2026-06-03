# Focus

## Current goal

Milestone 7 — deploy Lambda pipeline and disable Windows Task Scheduler task.

## Active work

### Milestone 7 — Lambda deployment
Lambda infrastructure is built. Steps to go live:

1. `cd automation/pinterest-agent && npm run build:lambda` (already done — produces `lambda/dist/handler.js`)
2. Run `.\lambda\deploy.ps1` to create IAM role + Lambda function + EventBridge rule
3. Set all env vars in Lambda console (see `lambda/env-vars.md`)
4. Test manually: `aws lambda invoke --function-name cross-stitch-daily-pipeline --payload '{}' --region us-east-1 out.json`
5. Verify email arrives and DDB looks correct
6. Disable Windows Task Scheduler: `schtasks /Change /TN PinterestDailyReport /Disable`
7. Mark Milestone 7 complete in this file and milestones doc

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
