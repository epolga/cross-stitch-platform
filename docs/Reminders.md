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
| 2026-11-24 (evening) | 1-week report for the Christmas email (eid=261117). Windows Task `AnnouncementReport-261117-1week` emails it to Olga at ~18:41 by itself. | Run `automation/pinterest-agent/scripts/announcement-report.ts --eid 261117 --since <date> --sent-at <ISO> --label 1-week --no-email` (copy args from the 1-day task), interpret for Olga in chat. Compare with 1-day: 127 distinct recipients, GA4 121 sessions, SES 1 bounce + 1 complaint. |
| 2026-11-24 | Google Nov 2026 core update expected to end. Homepage lost ~20-25% of page views and ~half its AdSense revenue after 2026-11-10/12 (generic head queries `cross stitch patterns`, `cross stitch`; GSC impressions 3200-3650/day vs 4500-5000). Cause unknown. | Do not change the site before ~2026-12-01. Olga agreed to wait (2026-11-20). Until then only observe GSC (`gsc-explore.ts` / `gsc-compare.ts`) and AdSense homepage by day. |
| 2026-11-26 .. 12-03 | Register-to-download funnel (Focus.md item 34). GA4 events live since 2026-11-19: `register_modal_opened`, `register_modal_dismissed`, `register_submitted`, `design_pdf_download`. | Build the funnel from GA4. Compare `register_submitted` with new `CrossStitchUsers` rows (CreatedAt) to estimate GA4 undercount. Then discuss with Olga: log events in her own DB (needs an IAM grant, ask first) and whether to test `DOWNLOAD_MODE=free` (only after 12-01, only with her "да"). |
| 2026-12-01 | Homepage / Google decision and image-domain migration. | Review GSC + AdSense homepage first. Plan: `docs/plan/web/Image_Domain_Migration_Plan.md`; Part A needs Olga's "да". Note: no evidence that images caused the drop; the migration is planned for other reasons. |

## Open offers (no date, Olga has not decided)

- `recordEmailEntryEvent`: add an entry record for editor links and/or reduce admin "Notification: Access from Email" emails per entry.
- EB autoscaling thrash (min 1 / max 4 t2.small, NetworkOut/CPU alarms): recommendation is leave as is, optionally shorten deregistration delay later. No change without her "да".
- Prepare a lawyer-ready description of her design process and a per-design "what to keep" list (copyright of AI-assisted designs). Not requested yet.
- Small deferred items: `designs/[designId]/page.tsx:26` 403 `default.jpg` fallback; www to non-www redirect; second sitemap in robots.txt; stale lastmod.
