# Reminders (dated, session-independent)

Read this at the start of every session (Focus.md points here). Items live
here instead of in session crons, because crons die with the session. At
session start: compare today's date with the "When" column; anything due or
overdue, tell Olga first. When an item is done, delete the row (history is in
git log and `docs/session-log/`).

Standing rules for all items: address Olga as "Вы"; never commit/push unless
she says so ("кп" = commit+push, "кпд" = commit+push+deploy); never mass-email
without her explicit "пошли"; ask before sensitive AWS/prod changes; no change
to the site or DOWNLOAD_MODE without her "да".

| When | What | How |
|---|---|---|
| 2026-11-26 .. 12-03 | Register-to-download funnel (Focus.md item 34). GA4 events live since 2026-11-19: `register_modal_opened`, `register_modal_dismissed`, `register_submitted`, `design_pdf_download`. | Build the funnel from GA4. Compare `register_submitted` with new `CrossStitchUsers` rows (CreatedAt) to estimate GA4 undercount. Then discuss with Olga: log events in her own DB (needs an IAM grant, ask first) and whether to test `DOWNLOAD_MODE=free` (only after 12-01, only with her "да"). |
| 2026-12-04 (was 12-01; Olga moved it) | Homepage / Google decision and image-domain migration. Background: after 2026-11-10/12 the homepage lost ~35-40% of impressions (3-11 Nov 2640-3410/day -> 17-22 Nov 1740-1940), concentrated in head queries without "free": `cross stitch` pos 7.7 -> 10.8 (imps/day 299 -> 91), `cross stitch pattern` pos 5.5 -> 8.0 (131 -> 85), `cross stitch patterns` pos 8.5 (619 -> 425); "free ..." queries ~flat. Cause unknown. Google Nov 2026 core update: started 2026-11-10 (verified via Search Status Dashboard reports, SEJ/SERoundtable); homepage/site impressions were steady 4100-5200/day from Oct 12 to Nov 11 and fell from Nov 12. "Up to 2 weeks", expected end ~Nov 24, completion NOT confirmed as of 2026-11-24: check Google's ranking release history first. AdSense revenue since 11-19 is not a recovery signal: US CPC doubled (0.77 -> 1.50 ₪), likely pre-Black-Friday, views/clicks did not recover. Olga agreed 2026-11-20 to wait: no site changes before this date. | Review GSC (`gsc-explore.ts --dimensions query --page https://cross-stitch.com/`, compare per day) + AdSense homepage first. ALSO raise the paid-tier question (Focus.md "Session-start check", Olga's 2026-08-07 rule): GSC weekly clicks went 587 (Jul 5) -> 1034 (Aug 23) -> ~1500-2010 (Sep 6 - Nov 8, plateau since mid-Sep) -> 1610 (Nov 15-21, with a 25-30% impressions dip). Decide with Olga whether that is a plateau/new level (then propose discussing a paid tier, no implementation) or a recovery (then drop it). Olga and I agreed 2026-11-24 not to discuss it before this date. Plan: `docs/plan/web/Image_Domain_Migration_Plan.md`; Part A needs Olga's "да". Note: no evidence that images caused the drop; the migration is planned for other reasons. |

## Already set up (do not create again)

- Windows Task `Reminder20261201` emails Olga on Fri 2026-12-04 07:00 (StartWhenAvailable). Moved from 12-01 10:00 at Olga's request (2026-11-28); the task/file names keep "1201".
  Files in `automation/pinterest-agent/`: `scripts/reminder-2026-12-01.ts`,
  `install-reminder-2026-12-01.ps1`, log `reminder-2026-12-01.log`. Deliberately NOT
  committed (Olga: one-shot, no need to keep). After it fires: delete the task
  (`schtasks /Delete /TN Reminder20261201 /F`) and those files.

## Open offers (no date, Olga has not decided)

- `recordEmailEntryEvent`: add an entry record for editor links and/or reduce admin "Notification: Access from Email" emails per entry.
- EB autoscaling thrash (min 1 / max 4 t2.small, NetworkOut/CPU alarms): recommendation is leave as is, optionally shorten deregistration delay later. No change without her "да".
- Prepare a lawyer-ready description of her design process and a per-design "what to keep" list (copyright of AI-assisted designs). Not requested yet.
- Small deferred items: `designs/[designId]/page.tsx:26` 403 `default.jpg` fallback; www to non-www redirect; second sitemap in robots.txt; stale lastmod.
