# AdSense Revenue Drop — Pinterest Cutoff Analysis

Date: 2026-07-12
Follow-up due: 2026-07-14

## Major confound found and fixed (2026-07-12, same day, later)

**AutoPinner (the organic/free Pinterest pin-publishing automation, unrelated
to paid ad spend) silently stopped posting any new pins for ~48 hours,
2026-07-10 08:17 → 2026-07-12 morning** — every hourly cron tick failed with
`FileNotFoundException: Could not locate platform-config.json`. Last
successful post before the outage: 07-10 07:17.

**Root cause:** the docs restructuring that consolidated the old standalone
`cross-stitch-platform-docs` repo into this monorepo's `docs/` folder (dated
~2026-07-10/11) removed the sibling folder that `PlatformConfig.LocateConfigFile()`
(`shared/src/CrossStitch.Shared/PlatformConfig.cs`) depends on to find
`platform-config.json` and, via its relative path values, the real Pinterest
token file (`D:\ann\Git\Uploader\secrets\pinterest_tokens.json` — still the
live one, never migrated into the monorepo) and `AlbumBoards.csv`.

**Fix applied:** recreated the missing sibling folder as a directory junction
— `D:\ann\Git\cross-stitch-platform-docs` → `D:\ann\Git\cross-stitch-platform\docs`
— which restores the old path-resolution behavior with no code or config
changes (all relative paths in `platform-config.json` still resolve to the
same real files as before, verified). Confirmed fixed by manually running
`AutoPinner.dll --once`: posted a pin successfully. **Not a fully durable
fix** — a junction is filesystem-level and easy to lose again (e.g. on a
fresh clone/machine); the durable fix would be updating
`PlatformConfig.LocateConfigFile()` to look for `docs/platform-config.json`
inside the monorepo directly, not yet done.

**Relevance to the analysis below, revised:** this outage's window
(2026-07-10 morning → 2026-07-12) does overlap the Pinterest paid-spend
cutoff and the observed dip, but **Olga correctly pushed back on treating it
as a real confound** — at most ~24 pins/day were missed (dailyCap), i.e.
~40-50 pins over the outage, against a base of thousands of already-published
pins already driving whatever organic Pinterest reach exists. A couple of
missed new pins is very unlikely to move site-wide traffic by the ~16-37%
seen here. Worth fixing regardless (it's supposed to run continuously and
compounds over time if left broken), but **not treated as an explanation for
the revenue/traffic dip** — the Pinterest-paid-cutoff-vs-noise question from
the sections below stands on its own, unaffected by this.

## Context

- Olga cut Pinterest ad spend to **$0 on 2026-07-11**, deliberately — Pinterest paid traffic was unprofitable. A prior 29-day ROI estimate (`_check_pinterest_roi.ts`) showed Pinterest-ads-only profit of roughly **₪-315**, even though paid sessions were ~45% of total tracked sessions.
- A first, partial spend cut had already happened on **2026-06-19** (~$11-12/day → ~$5/day). That cut did **not** hurt revenue — in the weeks after it, revenue rose to the month's peak (week 3-4 average $18.35-$20.70/day vs. $10.01-$11.25/day in weeks 1-2).
- The full cutoff to $0 on 2026-07-10/07-11 coincides with a reversal down from that peak.

## Data findings (as of 2026-07-12)

- **Sessions**: total dropped 345 → 269 (-22%) from 07-10 to 07-11, driven almost entirely by Paid Social: 25 → 0.
- **AdSense revenue**: $16.93 → $10.65 (-37%) over the same period. ~22% of that is explained by the session loss; the remaining ~19% is a per-session monetization drop.
- **Country mix**: US share of ad impressions dropped from 39% (07-10) to 31% (07-11). Pinterest paid traffic was US-concentrated (confirmed: US Paid Social sessions went 24 → 0), so removing it shifted the geo mix toward lower-RPM countries.
- **Possible halo effect on US Organic Search**: 58 → 43 sessions (-26%) the same day, more than the all-country Organic Search drop (-15%). **Not confirmed as causal** — the 56-day spend-vs-organic-sessions correlation (`_check_halo_effect.ts`, r≈0.5) does not show the lag-decay pattern expected of true causation (same magnitude at lag 0, 1, 2, 3 days), which is more consistent with both metrics simply trending together over the period than one driving the other. US Organic Search is also naturally noisy day to day (37-61 range across 5 days).
- **Fill rate** stayed stable (~0.81-0.84) throughout — this is not an ad-inventory or ad-serving problem.
- **Full-month trend**: revenue grew steadily through the month (week 1 avg $11.25/day → week 4 avg $20.70/day, peak $29.40 on 07-02) before this pullback. Current daily figures are back near the weeks-1-2 baseline, not below the month's overall floor.

## Follow-up: check again on 2026-07-14

### If revenue/traffic has stabilized at the new (post-Pinterest) level:

1. Confirm the net financial outcome: compare AdSense revenue lost vs. the ~$5/day Pinterest spend saved. Given Pinterest was already net-negative, removing it should be a net win even with somewhat lower gross AdSense revenue — verify this actually holds now that there's more data.
2. Check whether US Organic Search recovered to its pre-cutoff level (~55-60 sessions/day) or stayed suppressed (~40-45).
   - Recovered → the halo-effect theory is disproven (was noise/coincidence), no action needed.
   - Stayed low → Pinterest (even at reduced paid spend) may have been feeding US brand-search demand. Consider replacing it with organic (unpaid) Pinterest pinning targeted at the US market.
3. Otherwise, no urgent action — the new plateau is the expected result of an already-justified decision.

### If revenue/traffic keeps declining further (no stabilization):

Pinterest spend is already at $0, so it can no longer be the lever — continued decline points to a separate or compounding cause. Investigate:

1. **Google Search Console** — check for a ranking/impression drop in organic search independent of the Pinterest cutoff (possible algorithm update or indexing issue).
2. **AdSense account** — check for policy warnings, ad-serving restrictions, or ads.txt issues that could suppress fill/RPM regardless of traffic.
3. **Per-channel trend** — determine whether Direct, Referral, and Email sessions are also declining, or only Organic Search/Social, to distinguish a site-wide problem from a channel-specific one.
4. **Technical/site regressions** — rule out a recent deploy affecting page load speed or ad placement rendering.

## Update 2026-07-13: first day back at $5/day (campaign 626757628727)

Olga restarted Pinterest spend at $5/day on 2026-07-12 (see Focus.md Pending #9). Checked same-day (partial data) on 07-12 and again 07-13 once GA4 finished processing 07-12:

- **Same-day check (07-12, partial GA4 data) was misleading — flagged and re-checked, not acted on.** Pinterest reported 21 clicks/$2.89 spend, but GA4 showed only 1 Paid Social session site-wide. Looked like a tracking break; turned out to be GA4's same-day processing lag.
- **07-13 re-check (07-12 data now final):** Pinterest 22 clicks/$2.89 spend → GA4 11 Paid Social sessions (10 US, 1 Turkmenistan) = 50% click-to-session ratio, in line with the pre-cutoff 07-07..07-10 baseline (50-70%). **No tracking problem — same-day GA4 numbers are not reliable and shouldn't be used for same-day conclusions again.**
- **US share of total sessions, one day in:** 29.6% (07-11, $0) → 33.1% (07-12, first day at $5). Pre-cutoff baseline was 35-41%. US Organic Search: 43 (07-11) → 43 (07-12) — flat, not yet recovering.
- **Conclusion: too early to call.** One day of restored spend shows a small US-share uptick but no Organic Search recovery yet. Holding the original plan — re-check `_check_channel_country.ts` / `_check_pinterest_roi.ts` around 2026-07-16/17 (4-5 days post-restart) before drawing conclusions.
