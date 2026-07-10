# Focus

## Current goal

Newsletter relaunch: send the "You spoke, I listened" changelog/thank-you email
to recently-active subscribers, then follow up with the Ann-persona blog teaser.

## Active work

Nothing in flight. Everything below is built, built and deployed, or drafted and
waiting on Olga to trigger the actual send from the Uploader (Claude does not
send mass emails without an explicit go-ahead per send).

## What was done in the 2026-07-08 session

### Feedback backlog (FeatureRequests table) — all 4 items resolved or triaged

- **Leisa** (mobile PDF button overlap) — fixed, deployed, thanked, marked `done`.
- **Sarah** (`safety.proofs884@passmail.net`, diagonal-line drawing) — fixed
  (line/rect/ellipse tools now show a free-angle drag preview instead of a
  grid-snapped staircase, snapping to stitches only on release), deployed,
  thanked, marked `done`.
- **Bianca** (`pupsrock7@gmail.com`) — two-part request:
  - Drag-and-drop photo import from Google: fixed (new
    `/api/import-image-url` proxy route, SSRF-guarded + rate-limited, since a
    cross-origin drag only hands the browser a URL, not file bytes). Deployed,
    thanked.
  - Merge two designs by fabric size: researched (not standard even in
    paid desktop tools like WinStitch/PCStitch), **deferred as nice-to-have**,
    not built.
- **Céline** — confirmed hidden-colors state correctly persists on
  save/reload (verified live with a throwaway test account), sent her a
  mobile screenshot showing the Save button. PDF-quarter-overlap idea
  **deferred as nice-to-have**, not built.
- **Jacky Cooper** (`hadenmaiden@gmail.com`) — positive unsolicited reply to
  Olga's original "please test the editor" email. Reply drafted but **not
  sent by Claude** — Olga sends manually via Reply.

### Editor fixes (deployed)

- Free-angle drag preview for Line/Rectangle/Ellipse tools (`PatternCanvas.tsx`).
- Drag-and-drop photo import from external sites (`/api/import-image-url`).
- Mobile header overlap (Save/Download buttons) — fixed earlier same session.
- Confirmed (not a bug): hidden-colors-while-stitching state already survives
  save/reload correctly.

### SEO / traffic investigation (all resolved as "not a real problem" except one real find)

- AdSense revenue "drop": partial-day comparison artifact — real trend is
  **up** (see GSC numbers below). Not caused by IP bans.
- "No US visitors" panic: GA4 Realtime showing 0-3 active users in a given
  5-30 min window is normal statistical noise at ~85-90 sessions/day baseline.
- Google reindexing (sitemap resubmitted ~June 2): confirmed working —
  average position went from ~55 (page 6) to ~13 (page 2) over the following
  month; distinct design pages with search impressions grew from 137 → 498
  (of 5385 in the sitemap). Still far from "thousands," trend is positive.
- **Real find:** large-scale distributed scraping — 563 unique IPs in a
  30-minute ALB log window, ~75% making exactly one request each, no
  CSS/JS/asset follow-up, systematically enumerating individual design pages,
  search queries, and `robots.txt` across both `cross-stitch.com` and
  `cross-stitch-pattern.net`. **Not yet mitigated** — per-IP blocking doesn't
  scale against this pattern; would need a different approach (rate-based WAF
  rule, bot-challenge, or similar). Flagged, not actioned.
- Fixed a real gap: `/admin/*`, `/profile`, `/etsy-uploader`,
  `/pinterest-agent` now correctly `noindex` (were previously indexable by
  default / explicitly `index`). Deployed and verified live.

### New: blog + newsletter infrastructure (built this session)

- **Blog is now real** (was a single hardcoded story before): `/short-stories`
  list page + `/short-stories/[slug]` post pages, backed by
  `web/src/lib/blog-posts.ts`.
- **Lightweight reaction button** instead of open comments (comments
  deliberately deferred — moderation burden not sustainable solo, and the
  scraping/bot findings above are a live reminder why). New DDB table
  `CrossStitchBlogReactions`; required an IAM policy fix on the EB instance
  role (`CrossStitchDynamoDBAccessPolicy` is an explicit table whitelist —
  new tables must be added there or the app gets silent AccessDenied in prod
  even though it works locally).
- **Two new posts live:**
  - `why-i-built-this` — Ann's origin story (age 60, mild arthritis — see
    persona doc). Not yet emailed.
  - `editor-updates-july-2026` — full detailed changelog, linked from the
    Announcement email as `<changelog_url>`.
- **Reference docs created** (see Memory index for pointers):
  - `web/plan/Ann_Persona_and_Newsletter_Content.md` — Ann's backstory/voice,
    recurring story threads for future emails.
  - `web/plan/Email_Content_Plan.md` — sent/planned newsletter log, keep
    updated after every send.

### Uploader (WPF) changes — compiles clean, not yet sent

- Rewrote the existing **Announcement** email template pair
  (`AnnouncementEmailText.txt` / `AnnouncementEmailHtml.txt`) — was the
  original "please test my editor" ask, now "You spoke, I listened" with the
  4-item changelog + link to the detailed post + invitation to keep sending
  feedback.
- Added a **3-month recency filter**: `FetchAllUserEmailsAsync` now takes
  `minLastSeenAtUtc`; `SendAnnouncementEmailsAsync` applies it so mail only
  goes to verified, subscribed, non-BotSuspect users who visited in the last
  3 months (previously no recency filter on this send at all).
- Wired a second link (`<changelog_url>`) into the `[EditorLink]` section
  alongside the existing editor link (only section where token substitution
  + HTML both render correctly — `Body1`/`Body2` don't get token-substituted,
  learned this while implementing).
- `dotnet build Uploader.sln` — 0 errors.

## What was done in the 2026-07-09 session

### Visual SEO backfill (Milestone 9 continuation) — done + deployed

- **Root cause found:** 65% of designs (3447/5270) shared a generic `Caption`
  with other designs (e.g. "Cushion Cover" ×160), so `<title>`/`<h1>` were
  identical except for a meaningless DesignID number. Original
  `SeoDescription` text was also metadata-only (never looked at the image),
  one fixed 2-paragraph template for all 5270 designs. Both look like
  Google's "scaled content abuse" pattern regardless of intent.
- **Fix:** new `automation/pinterest-agent/scripts/backfill-visual-seo.ts` —
  sends each design's actual photo to Claude Haiku 4.5 (vision), generates a
  short visually-grounded title + SEO text with genuinely randomized
  structure (1-3 paragraphs, paragraph count picked in code and enforced via
  a merge-fallback, since the model wouldn't reliably self-vary on its own —
  observed 0/1990 single-paragraph outputs before this fix).
- **5261/5270 designs done** (9 skipped — missing source images on
  CloudFront, pre-existing catalog gap). Web app updated
  (`SeoTitle` field, `data-access.ts`, design page template) to use the new
  title with `Caption` fallback for not-yet-backfilled designs.
- **Risk mitigation:** reverted the 269 designs that already had GSC
  impressions/clicks back to their pre-backfill title/text (backup was kept
  in `SeoDescriptionPrevious`), to protect already-performing pages and
  incidentally recreate a control group for comparison (we'd lost this the
  first time SeoDescription was rolled out to 100% with no holdout).
- New tooling: `npm run seo:visual -- --report` (coverage %), `--album=`,
  `--designIds=`, `--force` flags. `SeoTitle` field presence = done marker.
- **Side fixes shipped in the same deploys:**
  - `?searchText=` on the homepage now `noindex, follow` (was unconditional
    `index, follow`) — the homepage's `SearchAction` JSON-LD schema was
    advertising that URL pattern to crawlers, causing arbitrary query pages
    to get crawled.
  - `sitemap.xml` was building its base URL from the incoming request's
    `Host` header (`resolveBaseUrl`) instead of the fixed
    `getSiteBaseUrl()` — a bot hitting the raw EC2 IP directly poisoned the
    whole sitemap with `https://72.44.35.24/...` URLs for the ~1hr S3 cache
    window. Fixed to always use the fixed canonical domain; old poisoned S3
    cache object deleted after the fix deployed.
  - `/photo-to-cross-stitch?source=design_page&designId=N` /
    `?source=album_page&albumId=N` were showing in GSC as "Duplicate without
    user-selected canonical" (~5270+114 unique crawlable variants — every
    design/album page links a distinct one). Olga wanted to **keep** the
    `designId`/`albumId` params (real analytics value), so fixed via
    conditional `noindex` on the converter page's `generateMetadata` instead
    of stripping the params — bare URL and `?source=`-only stay indexable,
    only the numbered-referrer variants get `noindex`.
- **Operational note (important, cost real time today):** the web app's
  design cache (`data-access.ts`, `ensureCacheReady`/`initializeCache`)
  initializes once per server process and is never auto-refreshed —
  `refreshCache()` exists but nothing calls it. Any bulk DDB write needs a
  real `eb deploy` or `aws elasticbeanstalk restart-app-server` to become
  visible on the live site, not just a data change.
- **GSC follow-up:** Olga started "Validate Fix" in GSC (Indexing → Pages →
  "Crawled - currently not indexed" → filtered by sitemap.xml) on 2026-07-09.
  Check back in ~2 weeks for the result; re-run `npm run gsc` (in
  `automation/pinterest-agent`) around then and compare against the
  `2026-07-08-gsc-indexing-report.json` baseline (this file is the source of
  truth for which 269 designs are the control group — keep it).

### IP review tooling (new) — built for the ongoing scraping problem

- `npm run analyze-ip -- <ip-or-pasted-block>` (or piped via heredoc — `npx`
  is `npx.cmd` on Windows and truncates multi-line quoted CLI args at the
  first newline, so stdin is the robust input path) — reverse DNS + ALB log
  breakdown (methods/status codes/top paths) for one or more IPs.
- `npm run watch-ip -- <ip> "<reason>" [ttlDays=3]` — new `WATCHED_IP` DDB
  entity (mirrors `BLOCKED_IP`), a probation marker with no enforcement,
  for the "not sure yet, keep an eye on it" case that didn't have a home
  before.
- New Claude Code skill **`/review-ip`** (`.claude/commands/review-ip.md`) —
  given a pasted IP list (raw Telegram alert format, any separator),
  classifies each as known-crawler / CGNAT-likely / scanner-pattern /
  plausible-real-user / ambiguous, recommends block/watch/no-action with
  cited evidence, and only acts after Olga confirms. Deliberately not
  autonomous — Olga chose "Claude Code skill, manual" over "built into the
  Lambda pipeline" when asked.
- Blocked `101.53.238.13` today (confirmed platform/API scanner — no rDNS,
  `/graphql` `/products.json` probing, 12827 req/day, high 502/404 rate).
  Takes effect on the next daily Lambda pipeline run (WAF sync is an
  `[init]` step there, not immediate).

### Traffic-drop investigation (this evening — long back-and-forth, worth reading in full before repeating it)

Olga was worried GA4 showed unusually low traffic and connected it to
today's changes. Walked through and ruled out, in order: site technically
broken (no — all 200s, Health Green throughout); our IP blocks causing it
(no — WAF blocked ~25 req total over 6h, negligible; today's own block
hadn't even synced to WAF yet); Google "reacting" to the rewrite within
hours (mechanically impossible — GSC hadn't even re-crawled the sitemap in
5+ weeks); day-of-week effect (no — last Thursday same hour was normal).

**Real, quantified finding along the way:** the sitemap-fix deploy
(14:49-15:04 UTC) had a genuine ~3.5% 502/460 error rate for ~20 min while
the ALB cycled app versions (other 3 deploys today were <1%) — real but
brief, and by itself too small to explain a whole "day looks low" feeling.

**What actually explained the "provал" feeling:** 2026-07-08 (yesterday)
was itself an anomalous **high** day (53,862 human-like pageviews for
hours 0-19 UTC vs a ~19,700-36,800 range on the other 8 of the last 10
days, median 27,561). Today (24,461 for the same window) was only -11%
vs. median — normal day-to-day variance, not a crash. Olga's instinct that
"yesterday was high, not today low" was correct; my first framing
(blaming the deploy window) overweighted a real-but-minor factor.

**Separately, confirmed real and still open:** the "no US traffic" worry
resolved into a re-discovery of the **same distributed-scraping problem
already flagged 2026-07-08** (see above, 563 unique IPs that session) —
still active, same signature: hundreds of distinct residential-ISP IPs
worldwide (Brazil, Argentina, Mexico, Vietnam, Turkey, many others), ~97%
making exactly one request each, realistic-but-all-different browser UAs
(not simple bot UAs — Meta/Sogou/Scrapy crawlers were separately identified
and excluded from this count), heavily diluting the apparent US share in
raw counts. Confirmed the pattern held 20 min later (164 IPs, 97.6%
single-request, ~3% clearly-US both times) — sustained background
condition, not a one-off spike.

**The actual resolution — real US traffic is fine, just buried:** filtered
further to IPs that fetched `_next/static/*` assets in addition to the HTML
(real browsers do this; simple HTTP scrapers don't) — of 467 page-loading
IPs, only 3 showed real-browser behavior, and **2 of those 3 were US**
(Comcast, Spectrum). The historical ~60% US share is still there in the
genuine-human subset; it's just outnumbered ~150:1 by non-browser scraper
noise in any raw IP count. GA4 Realtime showing few/no US active users at
a glance is also explained separately: the GA4 tag fires browser→Google
directly, never touching our server logs, so ad-blockers/tracking
protection on real (including real US) visitors are invisible to us either
way — a known, unavoidable blind spot, not evidence of a problem.

**Net effect:** no actual traffic crisis today. The distributed-scraping
problem is real, chronic (at least 2 days confirmed, likely longer), and
still unmitigated — see next session.

## What was done in the 2026-07-10 session

### AdSense earnings decline — investigated, not yet root-caused

Olga noticed AdSense earnings looked unusually low this morning and asked
why. Checked `adsense.accounts.reports.generate` — confirmed the API has
no `HOUR` dimension (400 error, `DATE` only), so today's partial-day figure
(3.83 earnings / 311 impressions / 2 clicks as of ~06:53 Israel time) isn't
comparable to prior full days and was set aside correctly per
[[feedback_dont_overinvestigate_realtime_noise]].

**But a real, separate pattern showed up in the last 4 complete days**
(2026-07-06 through 2026-07-09): earnings, impressions, and clicks all
declined every single day (earnings $22.73 → $22.16 → $19.28 → $15.46;
impressions 1471 → 1590 → 1259 → 1069; clicks 31 → 29 → 25 → 16). First
guess (Pinterest ad spend cut) was wrong and Olga corrected it directly —
that cut happened ~2 weeks ago, too early to explain a decline that's still
actively progressing day-by-day now.

Checked GA4 sessions/pageviews/active users for the same 4 dates — traffic
does **not** decline monotonically (300 → 312 → 370 → 273 sessions; 2026-07-08
was actually the highest-traffic day of the four), yet AdSense earnings and
clicks declined every day regardless. **Conclusion so far: this looks like
an ad-side effect (RPM/CPM/CTR), not a traffic-side effect** — but not
confirmed, and the API can't be pushed further (no per-ad-unit or per-page
breakdown available via this integration). Needs a look at the AdSense
dashboard directly (Ads → by ad unit, or Reports → Ad unit/page) — not yet
done.

**Olga's explicit correction for next time:** don't compare against a
5-day window — compare against **a month** instead, to see whether this is
a real multi-day trend or still within normal variance at a longer
baseline.

### AdSense decline — resolved as normal variance (2026-07-10, later same session)

Pulled `ESTIMATED_EARNINGS`/`IMPRESSIONS`/`CLICKS` by `DATE` for the full
30 days 2026-06-10 → 2026-07-09 (new script:
`automation/pinterest-agent/scripts/_check_adsense_month.ts`, not committed —
scratch diagnostic, same pattern as the earlier `_check_*.ts` files).

**Month stats:** mean $16.07/day, median $15.81, stddev $6.25 (~39% of
mean — a genuinely noisy series; day-to-day swings of 2-3x are normal
throughout the month, not unique to early July).

**The 4 "declining" days are not a trend.** 2026-07-06 ($22.73) through
07-09 ($15.46) are all at-or-above the monthly mean except 07-09, which is
only -3.8% vs. mean — well inside normal variance. The real pattern is that
**2026-07-01 → 07-05 was an anomalously strong stretch** ($18.36 → $29.40 →
$22.18 → $21.05 → $25.74, peaking 83% above the monthly mean), and 07-06→09
is a reversion toward the mean from that peak, not a new decline. Same
"yesterday was the anomaly, not today" shape as the 2026-07-09 traffic
investigation above.

**Conclusion: no ad-side (RPM/CTR) problem found.** Pending item #0 closed —
no further action needed unless a future window looks low relative to a
similarly long baseline.

### Distributed scraping — infra check, live surge confirmed, 6 IPs reviewed (2026-07-10)

**WAF infra check:** verified via `aws wafv2 get-web-acl` that `BlockAutoBlockedIPs`
(priority 2, Block) is correctly wired into `CrossStitchBotProtection` against
the `AutoBlockedIPs` IP set — the daily `/review-ip` → `block-ip.ts` →
`wafIpSync.ts` pipeline built 2026-07-09 does work, not a silent no-op.
Evaluated WAF Challenge (silent JS check, ~$1/mo + $0.15/1,000 responses) vs.
WAF Bot Control (managed rule group, ~$10/mo+) as future options — **decided
to keep monitoring for now**, not build either yet. Key risk flagged: both
options could challenge Googlebot on `/designs/*`/`/albums/*` (under active
SEO recovery) or the indexable bare `/photo-to-cross-stitch` URL — see
`web/src/app/photo-to-cross-stitch/page.tsx:33` (only `?designId=`/`?albumId=`
referrer variants are `noindex`, the bare URL is `index, follow`). Needs a
crawler allow-list before enabling either.

**Live surge check (new script, not committed:
`automation/pinterest-agent/scripts/_check_bot_surge_now.ts`):** pulled ALB
logs for the 25 minutes 05:55-06:20 UTC today. **755 unique IPs, 1260
requests, 87.4% made exactly 1 request, only 0.9% fetched `_next/static`**
(real-browser signal). Scaled to a 30-min window this is *larger* than the
2026-07-08 baseline (563 unique IPs/30min) — the pattern looks like it's
**growing, not steady-state**. Top path was `/photo-to-cross-stitch` (137
hits), consistent with prior findings.

**`/review-ip` round 1** — the 5 highest-volume outlier IPs from that same
25-min window (concentrated, not part of the 1-shot pattern):
- `62.60.130.210` — **blocked** (30d): no rDNS, 100% 404, WordPress
  exploit-scanner path pattern (`/images/images/.../cache.php`,
  `/wp-content/plugins/plugins/cache.php`) — site isn't WordPress.
- `45.127.44.48` — **watched** (3d): no rDNS, 521 req/day, 234 distinct
  paths — systematic catalog crawl, not exploit-probe.
- `112.209.162.158` (PLDT Philippines), `161.41.252.202`, `73.34.243.35`
  (Comcast) — **no action**, real-user signals (asset loading, editor
  analytics events, normal path diversity).

**`/review-ip` round 2** — 5 IPs from the daily ≥800req/day Telegram alert
(2026-07-09 data): `199.38.125.98`, `74.7.227.179`, `99.107.137.100`,
`5.29.18.71`, `186.151.100.235` — **all watched** (3d). None matched the
exploit-probe bar (near-zero error rates, only real content paths hit) but
all showed clear automation signatures: 3 of the 5 did near-full-catalog
crawls (1924/1209/763 distinct paths, one visiting ~1900 different URLs in a
day), one hammered `/photo-to-cross-stitch` alone 648 times (43% of its own
traffic), one hit a handful of pages/API routes with suspiciously uniform
~27-35x repeat counts (scripted-navigation signature). Confirms the
catalog-scraping motive already suspected in the 2026-07-09 session notes.

**Net effect: the chronic distributed-scraping problem is confirmed still
active and trending up in raw volume, not resolved.** Decision from earlier
today (keep monitoring, don't build Challenge/Bot Control yet) stands, but
the growth data point argues for revisiting sooner rather than later — see
updated pending item #4.

### Revenue-by-country + Pinterest ad ROI (2026-07-10)

**Country RPM check (GA4, 30 days, prompted by an India traffic spike
Olga noticed):** confirms India monetizes far worse per session than
Olga suspected — $0.0038/session vs. $0.0830 for the US (~22x gap). India
contributed $0.70 of $439 total (top-20-country) ad revenue over 30 days
despite 185 sessions. **Conclusion: not worth investing effort to grow
Hindu-themed/India-targeted content for ad-revenue reasons** — existing
content stays (free, organic-only, no marginal cost), but no active
promotion push.

**Unrelated but important finding surfaced during this check, not yet
investigated:** Singapore shows 5187 sessions/30 days (more than
UK+Canada+Australia combined) but only $0.25 total revenue
($0.0000/session). China and Russia show a similar near-zero-revenue
pattern. Singapore's volume+zero-engagement combination looks like
JS-executing bot traffic (unlike the ALB-log-detected non-JS scrapers,
this would still register in GA4 since it runs the tracking script) —
**flagged, not investigated further this session. Worth a dedicated look
next time**, since if confirmed it would inflate GA4 session counts
site-wide and skew any session-based metric (including the pin-attribution
revenue formula from Milestone 9, which divides by total GA4 sessions).

**Pinterest ad ROI (DAILY_BUSINESS, 29 days):** spend $196.50 (≈₪583),
whole-site AdSense revenue ₪471.88, naive profit (revenue minus spend,
crediting Pinterest with ALL site revenue) = **₪-111.29**. Properly
attributed (revenue weighted by paid-session share of all sessions, same
method as the Milestone 9 pin-attribution formula) = est. Pinterest-only
profit **≈₪-363**. Spend was already cut ~58% around 2026-06-19
($11.84→$4.99/day avg); the naive whole-site profit metric turned mostly
positive after that cut, but that's the spend cut talking, not improved
ROI — the properly-attributed number stays deeply negative throughout.

**Olga's decision: stop Pinterest ad spend.** Data supports it — even at
the already-reduced budget, paid traffic doesn't cover its own cost once
revenue is honestly attributed to it instead of the whole site.

**Halo-effect check (does Pinterest ad spend drive organic traffic
beyond the paid clicks themselves?) — investigated because this would be
the one reason to keep spending despite direct ROI being negative.** Full
54-day history (2026-05-15 → 07-09): same-day correlation spend↔organic
sessions r=0.489 (moderate, r²≈24%), spend↔referral r=-0.635 (negative —
inconsistent with a clean halo story). Before/after the 06-19 spend cut:
organic sessions -24% (48.9→37.2/day), but referral sessions **+106%**
over the same window. **Not treated as evidence of a real halo effect** —
the before/after window overlaps major confounding events (visual SEO
backfill, blog+newsletter launch, sitemap Host-header bug fix, all
2026-07-08/09), and full-period day-to-day organic noise is already 26%
of the mean, similar magnitude to the observed drop. Correlation ≠
causation with only one natural before/after transition point.

**Recommendation recorded for when ads are actually stopped:** run a
clean controlled test — pause Pinterest spend entirely for 1-2 weeks with
no other site changes in that window, compare organic sessions
before/during/after (day-of-week matched) against the 26%-of-mean noise
baseline established above. That's the only way to settle the halo-effect
question properly; the retrospective correlation done today is too
confounded to be conclusive either way.

### Singapore GA4 anomaly — confirmed bot traffic (2026-07-10)

Investigated the Singapore session anomaly flagged earlier today (5187
sessions/30d, ~$0 revenue). Five independent signals, all pointing the
same way — **confirmed JS-executing bot traffic, not real users**:

1. **Engagement:** 0.7% engagement rate, 1.1s avg session duration, 99.3%
   bounce rate, exactly 1.00 pageviews/session (US: 50.2% / 196.4s / 49.8%
   / 3.63 PV — China shows a similar bot-like profile: 5.8% / 12.0s /
   94.2%).
2. **Source/medium:** 5137/5187 (99%) are `(direct) / (none)` — no
   referrer, no campaign.
3. **Device/browser:** 5172/5187 (99.7%) are `desktop / Chrome` — the
   default headless-Chrome fingerprint (Puppeteer/Playwright), far more
   uniform than any real-user population.
4. **Landing pages:** top two are `/` and `/photo-to-cross-stitch` (513
   sessions) — the same "hot paths" already identified in today's non-JS
   ALB-log scraping investigation, plus a long tail of individual design
   pages at 0% engagement (systematic catalog crawl signature).
5. **Daily trend:** not steady background noise — 82.7% of the 30-day
   total (4292/5187 sessions) landed in a single 5-day burst, 2026-06-26
   → 06-30 (peak 1427 on 06-28), then crashed to 1-7 sessions/day for a
   week, small resurgence 07-07→09.

**Conclusion:** this is very likely a headless-browser bot/scraper hosted
on cloud infrastructure GA4 geolocates to Singapore (not necessarily real
Singaporean users) — the same broad scraping problem as the ALB-log
findings, except this one executes JS and therefore also pollutes GA4,
unlike the non-JS scrapers found in the ALB logs earlier today.

**Actionable implication, not yet done:** the Milestone 9 pin-attribution
formula (`pin_revenue = pin_paid_sessions / total_all_sessions *
adsense_revenue`) divides by **total GA4 sessions** — if ~5000 bot
sessions/month are included in that denominator, real paid/organic
traffic's revenue attribution is being systematically understated. Worth
adding a session-quality filter (e.g. exclude sessions with 0 engaged
time + direct/none + single-pageview) to the attribution pipeline, or at
minimum re-running recent attribution numbers with Singapore/China/Russia
excluded to see how much this actually moves the numbers.

## Pending for next session

0. ~~AdSense decline — re-check against a full month~~ **Done 2026-07-10:
   resolved as normal variance, see session notes above. No action needed.**
1. **Send the Announcement email** — open Uploader → "Reload Email Template"
   → "Test Announcement Email" to admin first → review → "Send Announcement
   Emails". Not sent yet, waiting on Olga.
2. **Send the blog teaser** for `why-i-built-this` (excerpt + "read more"
   link, not full text — decided so the click-through/traffic goal is
   actually served) — send *after* the Announcement email, per the
   established trust-before-vulnerability order in `Email_Content_Plan.md`.
3. Newsletter cadence going forward: recommended **every 2-4 weeks**,
   sent when there's real content, not on a rigid calendar.
4. **Distributed scraping mitigation — decision 2026-07-10: keep monitoring,
   revisit sooner rather than later.** Not building WAF Challenge/Bot
   Control yet, but a same-day live check (see session notes above) found
   755 unique IPs / 25 min (87.4% single-request) — scaled to volume this
   is *larger* than the 2026-07-08 baseline (563/30min), i.e. **the pattern
   looks like it's growing, not flat.** 6 IPs reviewed and actioned today:
   1 blocked (`62.60.130.210`, WordPress exploit-scanner pattern), 6 total
   put on watch (`45.127.44.48` from the live check;
   `199.38.125.98`/`74.7.227.179`/`99.107.137.100`/`5.29.18.71`/
   `186.151.100.235` from the daily alert) — all watch entries expire in 3
   days, **re-review them via `/review-ip` around 2026-07-13** and decide
   block vs. release based on whether they're still active.
   - **Infra check done 2026-07-10:** WAF (`CrossStitchBotProtection`) is
     already attached to the production ALB. `BlockAutoBlockedIPs` rule
     (priority 2, Block) confirmed correctly wired to the `AutoBlockedIPs`
     IP set that `wafIpSync.ts` updates daily — the existing per-IP block
     pipeline (`/review-ip` → `block-ip.ts` → daily `[init]` sync) does
     work, was not a silent no-op. It just doesn't scale to this pattern
     (hundreds of residential IPs, ~1 request each, never repeat).
   - **Options evaluated, not yet chosen:**
     - **WAF Challenge action** (silent JS check, not a visible CAPTCHA —
       AWS distinguishes the two; Challenge is normally invisible to real
       users) on specific hot paths (e.g. `/photo-to-cross-stitch`,
       individual `/designs/*`/`/albums/*`) — matches the confirmed
       scraper signature from 2026-07-09 (no JS execution, no
       `_next/static/*` fetch). Cost is small: ~$1/mo new rule + $0.15 per
       1,000 challenge responses (not per visit — token caches) — a few
       $/month at current traffic.
     - **AWS WAF Bot Control** (managed rule group) — broader ML/heuristic
       coverage (TLS fingerprint, header order), ~$10/mo base + $1-10 per
       million requests depending on tier. More expensive, less
       transparent about why something is flagged.
   - **Key risk found 2026-07-10, must handle before enabling either
     option:** Googlebot also may not execute JS on first crawl pass.
     `/designs/*` and `/albums/*` are exactly the pages under active SEO
     recovery (visual SEO backfill, GSC Validate Fix, both 2026-07-09) —
     challenging them risks blocking Googlebot and undoing that work.
     `/photo-to-cross-stitch` bare URL is also `index, follow` (only the
     `?designId=`/`?albumId=`-tagged referrer variants are `noindex` —
     see `web/src/app/photo-to-cross-stitch/page.tsx:33`), so it carries
     the same risk, just smaller blast radius (1 page vs. thousands).
     Any future Challenge/Bot Control rollout needs an explicit allow-list
     for verified search-engine crawler IPs first.
   - Likely motive (not confirmed): scraping of the design/pattern catalog
     content (images + descriptions), possibly for a competing catalog or
     AI training data — the site's structure (thousands of individually
     downloadable, described items) is a generically attractive scrape
     target regardless of the site's size, not a sign of being specifically
     targeted.
   - Possible connection (unconfirmed, worth keeping in mind, not stated as
     fact): if this traffic renders ads, Google's own invalid-traffic
     detection could in principle notice the same pattern we did.
   - **Next session:** (1) re-review the 6 watched IPs above (~2026-07-13,
     when watch expires) via `/review-ip`, block or release each based on
     whether they're still active; (2) given the growth signal found
     2026-07-10 (755 IPs/25min vs. 563/30min baseline), reconsider whether
     "keep monitoring" is still the right call, or whether it's time to
     build the WAF Challenge rule (with a crawler allow-list) on
     non-SEO-critical paths first.
5. Bianca's fabric-merge idea and Céline's PDF-quarter-overlap idea remain
   `nice-to-have`, unscheduled.
6. **Stop Pinterest ad spend** (decision made 2026-07-10, see session notes
   above — properly-attributed ROI is ≈₪-363 over 29 days, halo-effect
   check found nothing conclusive). Not yet executed. **When stopping:
   pause cleanly with no other concurrent site changes for 1-2 weeks and
   compare organic sessions before/during/after** — this is the only way
   to properly settle the halo-effect question, since today's retrospective
   check was confounded by the SEO backfill/blog launch/sitemap fix
   happening in the same window.
7. **Singapore GA4 traffic anomaly — confirmed bot traffic 2026-07-10**
   (see session notes above: 0.7% engagement, 99% direct/none, 99.7%
   desktop/Chrome, same hot-path signature as the ALB scrapers, 83% of
   month's volume in one 5-day burst). **Not yet done:** add a
   session-quality filter to the Milestone 9 pin-attribution pipeline (or
   at least re-run recent numbers with Singapore/China/Russia excluded)
   to see how much this bot volume is understating real traffic's revenue
   attribution.

## Done when

- [x] Feedback backlog (4 items) triaged — 2026-07-08
- [x] Diagonal-line/rect/ellipse free-angle preview shipped — 2026-07-08
- [x] Drag-and-drop Google photo import shipped — 2026-07-08
- [x] `noindex` gaps closed on admin/profile/etsy-uploader/pinterest-agent — 2026-07-08
- [x] Blog rebuilt as real multi-post system with reactions — 2026-07-08
- [x] Ann persona + email content plan docs written — 2026-07-08
- [x] Announcement email template rewritten + recency filter + changelog link — 2026-07-08
- [x] Visual SEO backfill (vision-based title/description, 5261/5270) — 2026-07-09
- [x] noindex fixes: searchText, photo-to-cross-stitch referrer variants — 2026-07-09
- [x] sitemap.xml IP-instead-of-domain bug fixed — 2026-07-09
- [x] IP review tooling built: analyze-ip.ts, watch-ip.ts, /review-ip skill — 2026-07-09
- [x] Traffic-drop scare investigated end-to-end, no real crisis found — 2026-07-09
- [ ] Announcement email actually sent (test, then real)
- [ ] Blog teaser email sent
- [ ] **Distributed scraping mitigation — decide + implement (see Pending #4)**
