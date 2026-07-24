# scripts/

## Naming convention

- Files **without** a leading underscore (`gsc-report.ts`, `analyze-ip.ts`,
  `search-analytics.ts`, ...) are committed, permanent tools. Add a matching
  `npm run` alias in `package.json` if it's used often.
- Files **with** a leading underscore (`_check_*.ts`, `_list_*.ts`, ...) are
  scratch/one-off investigation scripts — untracked, never committed, safe to
  delete any time. They usually hardcode a specific date range or filter for
  whatever was being investigated that session.

## Analytics exploration tools

Built 2026-07-24 out of a GSC-position/AdSense-revenue investigation that
needed the same kind of ad-hoc querying repeatedly (see
`docs/session-log/2026-07.md` and `docs/Focus.md` pending #16 for that
specific investigation). Unlike the `_check_*.ts` scratch scripts, these take
CLI arguments instead of hardcoded dates, so the next investigation can reuse
them directly.

### `gsc-explore.ts` — flexible Search Console query

One query against `searchanalytics.query`, any dimension combination, any
date range.

```
npx tsx scripts/gsc-explore.ts --start 2026-07-20 --end 2026-07-24 --dataState all
npx tsx scripts/gsc-explore.ts --start 2026-06-01 --end 2026-07-21 --bucket week
npx tsx scripts/gsc-explore.ts --start 2026-07-15 --end 2026-07-23 --dimensions query --page https://cross-stitch.com/
```

Key flags:
- `--dimensions date,page,query,country,device` (comma list, default `date`)
- `--dataState all|final` — **`all` includes the still-processing last 1-3
  days** that a plain query silently omits/undercounts. Use this whenever
  you're looking at "today" or "yesterday" — GSC has a real processing lag,
  and a day's numbers can look worse than they'll finalize to.
- `--bucket week` — only meaningful with `--dimensions date`; aggregates
  client-side into Sunday-start weeks (matches how AdSense's own `WEEK`
  dimension buckets, for side-by-side comparison).
- `--page` / `--query` / `--country` — filter to one value.
- `--site` — defaults to `$GSC_SITE_URL` env or `sc-domain:cross-stitch.com`.

Run with `--help` for the full list.

### `gsc-compare.ts` — baseline vs. recent, by page or query

Answers "did this change everywhere, or is it concentrated on a few
pages/queries?" — pulls two date ranges for the same dimension and lines
them up per-day-averaged so different-length windows are comparable.

```
npx tsx scripts/gsc-compare.ts --dimension page \
  --baseline-start 2026-07-15 --baseline-end 2026-07-21 \
  --recent-start 2026-07-22 --recent-end 2026-07-23

npx tsx scripts/gsc-compare.ts --dimension query --filter-page https://cross-stitch.com/ \
  --baseline-start 2026-07-15 --baseline-end 2026-07-21 \
  --recent-start 2026-07-22 --recent-end 2026-07-23
```

Defaults to `--dataState all` (recent ranges are usually the still-processing
days you actually care about). Sorted by baseline impressions/day; `--top N`
controls how many rows print (default 20).

### `ga4-explore.ts` — flexible GA4 query, with cumulative-by-hour mode

```
npx tsx scripts/ga4-explore.ts --start 7daysAgo --end today --dimensions date,channel --metrics sessions

npx tsx scripts/ga4-explore.ts --start 3daysAgo --end today \
  --dimensions date,hour --metrics sessions,pageviews --cumulative
```

`--cumulative` (needs `date` and `hour` both in `--dimensions`) pivots into
one column per date, each row a running total by hour — the "is today's pace
behind yesterday's at the same time" view. Dimension/metric names are
short aliases (`channel`, `device`, `page`, `pageviews`, `users`...); see
`--help` for the full alias table.

Dates accept GA4 relative strings (`7daysAgo`, `today`) or literal
`YYYY-MM-DD`.

### Not built: hourly AdSense

The AdSense Management API (`reports.generate`) only supports `DATE`/`WEEK`/
`MONTH` dimensions — there is no hour-level breakdown available via API at
all (only in the AdSense UI's "Today" real-time chart). Don't spend time on
this again; use `ga4-explore.ts --cumulative` to check traffic pace instead,
and treat AdSense RPM/CPC day-to-day as something you can only compare once
the day is a finalized `DATE` row.

### When investigating a ranking/revenue dip

Rough order that worked well:
1. `gsc-explore.ts --dataState all` for the last ~2 weeks, site-wide, to see
   if a "bad" day is real or still processing (position should stop moving
   as more of the day's impressions land, over the next 1-2 days — if it
   holds steady instead of correcting, it's more likely real).
2. `ga4-explore.ts` (sessions/pageviews by date) for the same window, to
   rule in/out a traffic-volume explanation.
3. `gsc-explore.ts --dimensions date` for AdSense-side questions — actually
   use the existing `_check_adsense_rpm_trend.ts`/`daily-google-report.ts`
   equivalents for that; GSC and AdSense are separate APIs/services.
4. `gsc-compare.ts --dimension page` to see whether the movement is
   concentrated (one page/section) or spread across the whole site.
5. If concentrated on one page, `gsc-compare.ts --dimension query
   --filter-page <url>` to see whether it's one query cratering or a broad,
   small softening across many queries (the latter looks more like normal
   SERP volatility than a technical/indexing problem).
