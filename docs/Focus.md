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

## Pending for next session

0. **AdSense decline — re-check against a full month, not 5 days**, before
   drawing any conclusion about an ad-side (RPM/CTR) problem. Pull
   `ESTIMATED_EARNINGS`/`IMPRESSIONS`/`CLICKS` by `DATE` for the last ~30
   days and see whether 2026-07-06→09 sits inside normal fluctuation or is
   a genuine break from trend. If still looks like a real decline, look at
   the AdSense dashboard's ad-unit/page breakdown (not available via this
   API integration) before proposing any fix.
1. **Send the Announcement email** — open Uploader → "Reload Email Template"
   → "Test Announcement Email" to admin first → review → "Send Announcement
   Emails". Not sent yet, waiting on Olga.
2. **Send the blog teaser** for `why-i-built-this` (excerpt + "read more"
   link, not full text — decided so the click-through/traffic goal is
   actually served) — send *after* the Announcement email, per the
   established trust-before-vulnerability order in `Email_Content_Plan.md`.
3. Newsletter cadence going forward: recommended **every 2-4 weeks**,
   sent when there's real content, not on a rigid calendar.
4. **Distributed scraping mitigation — do this next session, explicitly
   deferred from 2026-07-09 (confirmed still-open, chronic, ≥2 days old).**
   Per-IP blocking does not scale against this pattern (hundreds of
   residential IPs, ~1 request each, never repeat) — options discussed,
   none yet decided or built:
   - **Cheapest first step:** keep monitoring via `/review-ip` a few more
     days to see if it's steady-state or growing before spending money.
   - **AWS WAF Bot Control** (managed rule group, paid per-request) — ML/
     heuristic bot detection beyond UA/IP matching; the closest thing to a
     purpose-built fix for exactly this pattern.
   - **CAPTCHA/JS challenge** on the specific hot paths (e.g.
     `/photo-to-cross-stitch`, which got disproportionate hits) — cheaper
     and more targeted than site-wide Bot Control; filters simple HTTP
     scrapers (no JS execution) without a full managed-rules bill.
   - Likely motive (not confirmed): scraping of the design/pattern catalog
     content (images + descriptions), possibly for a competing catalog or
     AI training data — the site's structure (thousands of individually
     downloadable, described items) is a generically attractive scrape
     target regardless of the site's size, not a sign of being specifically
     targeted.
   - Possible connection (unconfirmed, worth keeping in mind, not stated as
     fact): if this traffic renders ads, Google's own invalid-traffic
     detection could in principle notice the same pattern we did.
5. Bianca's fabric-merge idea and Céline's PDF-quarter-overlap idea remain
   `nice-to-have`, unscheduled.

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
