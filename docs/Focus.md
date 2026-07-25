# Focus

## Current goal

Build out Ann as a recurring blog persona: flesh out her backstory/life
(building on `web/plan/Ann_Persona_and_Newsletter_Content.md`), start writing
blog posts in her voice, use the existing reactions feature for engagement.
Full public comments deliberately deferred (see Pending #21). The
`why-i-built-this` blog teaser email is still the immediate next send once
there's Ann-voiced content to point it at.

## Active work

Design-spotlight newsletter ("Lady of Perpetual Love") sent 2026-07-24 —
841/841, see Pending #18 (one complaint handled, SES suppression added,
message-id logging added for next time). The **Announcement email**
("You spoke, I listened") has now been **sent** (confirmed by Olga
2026-07-25) — Pending #1 closed. Download-count tracking (3 tiers, Pending
#17) was live for the send, so its newsletter-attributed downloads should be
checkable now.

## Session history

Detailed session-by-session narrative (what was investigated/built/decided,
with evidence) moved to `docs/session-log/2026-07.md` on 2026-07-12 to keep
this file lean — read it before re-investigating something that looks like
it might already have been settled. The most recent addition there covers
the AdSense-revenue-drop-after-Pinterest-cutoff investigation from
2026-07-12 (full writeup: `docs/plan/web/AdSense Revenue Drop - Pinterest
Cutoff Analysis.md`, follow-up due 2026-07-14) — also found AutoPinner
(organic pinning) had silently stopped posting 2026-07-10 08:17 → 2026-07-12
(fixed via a directory junction, not yet a durable code fix), though Olga
correctly noted this is too small (~40-50 missed pins vs. thousands already
live) to actually explain the revenue/traffic dip.

## Pending for next session

1. ~~**Send the Announcement email**~~ — **SENT, 2026-07-25** (confirmed by
   Olga). Follow-up numbers (newsletter-attributed downloads, GA4
   click-throughs, SES bounce/complaint rate) not yet checked.
2. **Send the blog teaser** for `why-i-built-this` (excerpt + "read more"
   link, not full text — decided so the click-through/traffic goal is
   actually served) — send *after* the Announcement email, per the
   established trust-before-vulnerability order in `Email_Content_Plan.md`.
3. Newsletter cadence going forward: recommended **every 2-4 weeks**,
   sent when there's real content, not on a rigid calendar.
4. **Distributed scraping mitigation** — decision 2026-07-10: keep
   monitoring, not building WAF Challenge/Bot Control yet (full reasoning,
   cost/risk analysis, and confirmed-legitimate-crawler exceptions in
   `docs/session-log/2026-07.md`). **Status confirmed current as of
   2026-07-24: 0 watched, 25 blocked** — `/review-ip` has been running
   routinely since 07-10 (see session-log for the full current list and the
   original 6 IPs' resolution). Several current blocks are download-counter
   inflation bots, direct evidence the email-in-body-no-auth pattern
   (Pending #12) is already being abused — worth weighing when that
   decision gets made. Volume (25 active blocks) is worth revisiting against
   the "keep monitoring, don't build WAF Bot Control" call whenever that
   decision comes up again — not re-opened here, just flagged.
5. Bianca's fabric-merge idea and Céline's PDF-quarter-overlap idea remain
   `nice-to-have`, unscheduled.
6. **Singapore GA4 traffic anomaly — confirmed bot traffic 2026-07-10** (0.7%
   engagement, 99% direct/none, 99.7% desktop/Chrome, same hot-path
   signature as the ALB scrapers, 83% of month's volume in one 5-day burst
   — detail in `docs/session-log/2026-07.md`). **Not yet done:** add a
   session-quality filter to the Milestone 9 pin-attribution pipeline (or
   at least re-run recent numbers with Singapore/China/Russia excluded) to
   see how much this bot volume is understating real traffic's revenue
   attribution.
7. **SRS docs + test coverage** — `docs/srs/` built 2026-07-11 (Olga hasn't
   read through it yet — see Done when). CI now exists for `web/`
   (build+Vitest, 2026-07-12). Next: build automated tests for the
   priority-1 area, `09-Test-Plan.md` §4.2 — start with the **PayPal
   webhook**, then auth/session → conversion algorithm → autopinner
   claim/pin logic → download-mode gating → Uploader publish sequence. Add
   a CI job for pinterest-agent/autopinner/Uploader the moment each gets
   its first real test.
8. **Idea, not committed: an MCP server for platform data + IP-review
   actions** (raised 2026-07-12, detail in `docs/session-log/2026-07.md`) —
   would replace ~30 one-off `_check_*.ts` scratch scripts with typed
   tools. Revisit only if the scratch-script pattern keeps recurring
   session after session.
9. **AdSense revenue drop after Pinterest cutoff — RESOLVED 2026-07-24, no
   further action.** Keep Pinterest ads running at ~$5/day. Full arc:
   `docs/session-log/2026-07.md` ("AdSense/Pinterest cutoff — resolved
   2026-07-24") and `docs/plan/web/AdSense Revenue Drop - Pinterest Cutoff
   Analysis.md`.
10. **AutoPinner config-path fix — DONE, durable, 2026-07-24.** Config
    resolution now walks up for `docs/platform-config.json` inside this
    monorepo instead of a sibling repo/junction; nothing left depends on
    paths outside `cross-stitch-platform`. Full detail:
    `docs/session-log/2026-07.md`.
11. **DynamoDB schema doc gap (6 entities) — RESOLVED 2026-07-25.** All six
    (`ConverterPatterns`, `CrossStitchLikes`, `FeatureRequests`,
    `CrossStitchBlogReactions`, `EditorEvents`, `SearchQueries`) live-verified
    and documented in `dynamodb-schema.md` §4.9-4.14. Found and fixed a real
    bug along the way: `EditorEvents`/`SearchQueries` write a TTL-intended
    `ttl` attribute but DynamoDB TTL was disabled — enabled now via
    `aws dynamodb update-time-to-live`. Also built+deployed the
    `ConverterPatterns` `createdAt`/`modifiedAt` split (resaves no longer
    overwrite creation date). Full detail: `docs/session-log/2026-07.md`.
    **Still open (low priority):** `ConverterPatterns`' own `expiresAt`/TTL
    gap is different (code never writes the attribute at all) and needs a
    code change, not just an infra toggle — deferred, only 23 items.
12. **Unauthenticated email-in-body endpoints — consider rate-limit or
    verification (found 2026-07-12, `docs/srs/06-API-Specification.md`
    §2).** `/api/trial/start`, `/api/subscription/status`, and
    `/api/subscription/download-access` take a plain `email` field in
    the JSON body with no session, password, or token proving the
    requester owns that email (`Auth: none (email in body)` in the API
    spec). Confirmed in code: `/api/subscription/status`
    (`route.ts:15-21`) returns subscription/trial entitlement status
    (active/inactive, downloads remaining) for **any** email passed in —
    no rate limit on this route today (`—` in the spec's rate-limit
    column). Likely intentional (called right after PayPal
    redirect/registration before a session cookie exists), not flagged
    as a bug — but worth a deliberate decision: add rate-limiting at
    least on `/subscription/status` (info-disclosure of subscription
    state by email), or accept the trade-off as-is. Not yet actioned.

13. **SEO uniqueness gaps found 2026-07-19 (during GSC indexed-rate
    investigation).** Context: Google's June 24 2026 spam update (targets
    "scaled content abuse") likely explains the indexed-page dip Olga saw
    in GSC (1249 on 06-12 → 729 on 06-30 → 989 on 07-19, recovering post
    the 2026-07-09 visual-SEO fix). Three concrete follow-up gaps
    identified in `web/src/app/designs/[designId]/page.tsx`:
    - **Gap 1 — image `alt` text still templated — FIXED, deployed, and
      committed** (was raw `Caption`, 65% of designs share one, e.g.
      "Cushion Cover" ×160 — now `SeoTitle || Caption`; confirmed live on
      `/designs/4217`). Full detail: `docs/session-log/2026-07.md`
      ("2026-07-19 session").
    - **Gap 2 — JSON-LD schema thinness — downgraded to minor/optional**,
      not a real fix for the indexing problem (Olga correctly pushed back
      on the original proposal). Full detail: `docs/session-log/2026-07.md`.
    - **Gap 3 — near-duplicate designs, canonicalized — BUILT, APPLIED,
      DEPLOYED 2026-07-25.** New `CanonicalDesignId` field + two-pass
      detection (metadata candidates → SHA-256 byte-identity + dHash
      visual confirmation, since dHash alone false-positived on template
      series like "99 Names of Allah"). **59 designs across 54 groups**
      canonicalized (43 byte-identical + 16 Olga-visually-confirmed).
      Color-variant designs (Whale/Wolf/Cushion Cover/Cat) checked and
      found **already differentiated** by existing vision-SEO text, no
      action needed. Template-series case fixed via a new `visibleText`
      field in `backfill-visual-seo.ts` (transcribes on-image text so
      same-template designs stop reading as duplicates) — applied to all
      8 "99 Names of Allah" designs; found+fixed a mislabeled `Caption` on
      design 3366 along the way (was actually Quran surahs). Sitemap
      resubmitted to GSC afterward (manually — API hit a read-only-OAuth-
      scope 403, see memory [[project_gsc_oauth_readonly_scope]]).
      Deployed twice same day, Health Green both times, canonical tags
      confirmed live. Full arc: `docs/session-log/2026-07.md`.
      **Still open:** "99 Names of Allah", 2× Cushion Cover, 2× Cat,
      Sunflower, Bookmark deliberately deferred (need individual review,
      not the same fix); GSC indexed-rate (~21-22% avg, flat/noisy
      pre-fix) worth re-checking in the coming days for any post-fix
      movement; whether to invest in the broader GSC OAuth scope for
      future programmatic sitemap resubmission, not decided.

14. **GSC indexed-rate tracking deployed to the daily Lambda pipeline —
    2026-07-19, verified working.** Only one dated row existed as of 07-19 —
    **check back for a real multi-point trend** (now checkable via
    `gsc-explore.ts`). Full detail: `docs/session-log/2026-07.md`.

15. **Editor report added to Telegram; anomaly-alert "missing email"
    concern resolved as a non-issue — 2026-07-19, deployed.** Full detail:
    `docs/session-log/2026-07.md`.

16. **GSC average position softened ~11-12 → ~15-17 since 2026-07-22/23 —
    monitoring, check back ~2026-08-07.** Overnight 07-24/25 a same-day GA4
    snapshot (85 organic sessions) looked like a genuine traffic drop and
    briefly escalated this to "investigate now" — resolved as a false alarm
    the morning of 07-25: settled data showed 07-24 at 121 organic sessions
    (normal band) and 337 total (highest of the window). De-escalated back
    to the original 08-07 check-back plan; all other causes (deploys, Manual
    Actions, Security Issues, AdSense RPM) already ruled out. Reusable tools
    built out of this investigation: `gsc-explore.ts`, `gsc-compare.ts`,
    `ga4-explore.ts` in `automation/pinterest-agent/scripts/` (see that
    folder's `README.md`). Full detail: `docs/session-log/2026-07.md`.

17. **Download-count tracking (3 tiers) — built, deployed, committed
    2026-07-24** (`f64bf7c`), ahead of the Announcement-email send. Measures
    downloads specifically from newsletter click-throughs (`eid`/`cid` →
    `fromNewsletter` flag → `TotalNewsletterDownloadsCount`). Still pending:
    check the numbers once the Announcement email actually sends (#1), and
    decide the email-in-body-no-auth question (#12) after seeing them. Full
    build detail: `docs/session-log/2026-07.md`.

18. **First real design-spotlight newsletter send via `UploaderCli` —
    2026-07-24, needs follow-up monitoring.** "Lady of Perpetual Love"
    (DesignID 5459) sent to **841/841** real recipients + 1 admin copy, zero
    failures. One complaint handled (SES suppression + message-id logging
    added). **Check back in a few days:** GA4 newsletter-attributed clicks,
    `LastEmailEntry` updates, SES bounce/complaint rate vs. baseline. Full
    build/send detail: `docs/session-log/2026-07.md`.

19. **`eb health`/`eb status` showed Red 2026-07-25 04:22 → 06:07 UTC
    (~1h45m) — self-resolved to Green, root cause of the initial trigger
    still unidentified.** Predates and unrelated to that day's deploys (a
    real, small, fluctuating 5xx rate, not code/infra-shaped); two
    restart/deploy actions taken *during* the investigation each briefly
    re-extended the cycle rather than fixing it. **Wrong turn worth
    remembering:** initially blamed "low real traffic" on EB's own
    `RequestCount` reading 0 — Olga correctly pushed back; GA4 and DNS both
    confirmed real traffic and that this is genuinely the production load
    balancer, so that metric is simply unreliable (see memory
    [[project_eb_health_unreliable_metric]] and
    [[feedback_verify_metrics_before_diagnosing]]). Full detail:
    `docs/session-log/2026-07.md`. **Not yet done:** identify the original
    04:22 UTC trigger — moot for now since fully resolved, but genuinely
    unexplained. Don't panic on a bare "Red" alone next time — cross-check
    `aws elbv2 describe-target-health` and real ALB/GA4 data first.

20. **SEO content-depth work: subject blurbs, checklist variety, sitemap
    lastmod fix — DONE, deployed, committed 2026-07-25.** Follows on from
    Pending #13 (Gap 3 canonicalization, same day). Four pieces:
    - **`SeoSubjectBlurb`** backfilled catalog-wide (vision-classifies each
      design's real subject and writes a grounded fact/story, replacing the
      generic "About this pattern" text with "Did you know?"). Full run hit
      Anthropic API credit exhaustion partway through (561 designs failed
      with a literal "credit balance too low" error, not a code bug) —
      resumed successfully once Olga added credits. **5211/5271 designs now
      have it; ~60 permanently missing** (pre-existing missing-source-image
      gap, same 9-13 designs as the original visual-SEO backfill plus a
      handful more found this round).
    - **Stitch planning checklist + finishing tips** (previously identical
      84-word boilerplate on all 5271 pages) now vary by each design's real
      `NColors`/`Width`/`Height`/skill-level facts (`web/src/lib/pattern-
      tips.ts`), wrapped in `<aside>` as secondary content. Measured result:
      **86% of designs (4534/5271) now have a fully unique 7-bullet
      combination**, largest exact-duplicate group down to 11 designs (was
      100% identical everywhere).
    - **Sitemap `<lastmod>` bug fixed** — was stamping every URL with
      `new Date()` on every hourly S3-cache regen regardless of real change,
      a signal Google discounts entirely. Now: designs/albums use a real
      `LastModifiedAt` DDB field (stamped by every script that writes design
      content), static pages use a hand-maintained per-route date keyed to
      **deploy day, not commit day** (see `web/CLAUDE.md` "Sitemap lastmod
      for static pages" + `.claude/commands/deploy-web.md` step 2b). Albums
      have no content-edit path of their own yet, so album lastmod = the max
      `LastModifiedAt` across that album's own designs. Verified live via
      forced S3-cache invalidation + direct sitemap fetch. Sitemap resubmitted
      to GSC afterward — meaningfully different from the earlier same-day
      resubmit, which happened *before* this fix (so carried no real signal).
    - **New `POST /api/admin/refresh-cache`** endpoint + button on `/admin` —
      refreshes the in-memory design cache (`data-access.ts` `designCache`)
      without a full `eb deploy`.
    - Committed/pushed in two commits: `c7f3329` (subject blurbs, tips,
      lastmod field + static dates, admin button), `4af3a98` (album lastmod
      derivation).
    - **Not yet done:** GSC indexed-rate sample taken today (26% ± 7pp) is
      within noise of the ~21-22% baseline — too early to attribute to
      anything, Google hasn't had time to recrawl today's changes yet. Check
      back in a few days. Also worth directly checking the GSC UI for the
      actual outcome of the original 2026-07-09 "Crawled – currently not
      indexed" Validate Fix (checkpoint was due 2026-07-23, already passed,
      never explicitly confirmed) — see Pending #13.

21. **Ann-persona blog + engagement — scope decided 2026-07-25, not yet
    built.** Olga's original idea was a full FB-page-style presence: Ann's
    life story, a blog in her voice, and a comment section. Discussed and
    scoped down:
    - **Fake seed comments — rejected.** Considered and explicitly rejected,
      even "just a couple" to prime real engagement: fabricated reader
      comments are deceptive regardless of scale, and the discovery risk
      (one spotted fake undermines trust in the whole "real voice of Ann"
      project) outweighs solving the empty-room problem.
    - **"Old embroidery forums all died" concern — addressed.** Those forums
      failed because they *were* the community, competing for network effect
      against FB/Reddit. A comment section under Ann's posts isn't a
      standalone destination — it rides traffic the site already gets from
      SEO/newsletter, so it doesn't need its own network effect to be worth
      having. Bar for success is much lower.
    - **Decision: start with posts + the existing reactions feature only**
      (`CrossStitchBlogReactions`, shipped 2026-07-08, 0 items so far — see
      `dynamodb-schema.md` §4.12). No new comments infrastructure yet.
    - **Full public comments — deferred, not abandoned.** Add only once
      organic demand actually shows up (readers asking to comment, replying
      enthusiastically to emails, etc.), not speculatively upfront. When it
      happens: DynamoDB confirmed suitable (discussed 2026-07-25) — new
      self-provisioning table (same pattern as `blog-reactions.ts`/
      `editor-events.ts`), PK `slug` / SK `commentId` for per-post ordered
      retrieval, moderation status attribute + GSI (same shape as
      `FeatureRequests`), comments tied to the existing login/session rather
      than anonymous, to avoid becoming a new spam target.
    - **Immediate next step:** flesh out Ann's backstory/life beyond what's
      in `web/plan/Ann_Persona_and_Newsletter_Content.md`, then start writing
      blog posts in her voice.

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
- [x] Announcement email actually sent (test, then real) — 2026-07-25
- [ ] Blog teaser email sent
- [ ] **Distributed scraping mitigation — decide + implement (see Pending #4)**
- [x] Editor fix: ResizeDialog clear-to-retype bug — 2026-07-10
- [x] Editor fix: localStorage autosave + resume draft — 2026-07-10
- [x] Editor fix: "Open" saved-patterns list (replace prompt()) — 2026-07-10
- [x] Editor fixes deployed to production (eb deploy, Health Green) — 2026-07-10
- [ ] Thank-you reply sent to Leisa (feedback source for these 3 fixes) — waiting on her email address
- [ ] Olga has read through the `docs/srs/` documentation set (see Pending #7)
- [x] CI workflow built for `web/` (build + Vitest) — 2026-07-12
- [ ] Automated tests built for at least the priority-1 area in `09-Test-Plan.md` §4.2 (PayPal webhook)
- [x] Pinterest ad spend stopped ($0 confirmed 2026-07-11)
- [x] AdSense/traffic follow-up after Pinterest cutoff resolved (see Pending #9) — 2026-07-24
- [x] GSC indexed-rate tracking (gsc-report.ts fix) built, tested against real APIs, deployed to Lambda pipeline — 2026-07-19
- [x] First scheduled Lambda run verified in CloudWatch Logs (see Pending #14) — 2026-07-19
- [x] Editor report added to Telegram, deployed — 2026-07-19
- [x] SEO Gap 1 (alt text → SeoTitle) fixed, deployed, verified live — 2026-07-19
- [x] SEO Gap 3 (canonicalize near-duplicate designs) — mechanism built, 59 designs (54 groups) canonicalized — 2026-07-25 (see Pending #13)
- [x] SEO Gap 3 code deployed to production, Health Green, canonical tag confirmed live — 2026-07-25
- [x] SEO Gap 3's 22 "worth-a-look" groups manually reviewed by Olga — 2026-07-25 (15 more confirmed, rest deferred — see Pending #13)
- [x] "Explain to Google" approach: color-variant case already solved (existing vision SEO text), template-series case fixed via backfill-visual-seo.ts visibleText field — 2026-07-25
- [x] Design 3366 Caption fixed (mislabeled as Names of Allah, actually Quran surahs), deployed, live — 2026-07-25
- [x] sitemap.xml resubmitted to GSC (manually, after API attempt hit a read-only-scope 403) — 2026-07-25, confirmed via listSitemaps
- [ ] GSC indexed-rate re-checked in the coming days to see if today's canonical/content fixes move the needle (baseline: ~21-22% avg, noisy, flat pre-fix)
- [x] 3-tier download-count tracking (total/logged-in/newsletter) built, deployed, Health Green — 2026-07-24
- [x] Download-count feature's 4 changed files committed — 2026-07-24 (`f64bf7c`)
- [ ] Tonight's Announcement-email numbers checked (newsletter-attributed downloads + email-in-body auth decision, see Pending #17)
- [x] First design-spotlight newsletter sent via `send-newsletter` — 841/841, 2026-07-24 (see Pending #18)
- [ ] Follow-up check on that send (GA4 clicks, LastEmailEntry, SES bounce/complaint rate — see Pending #18)
- [x] ConverterPatterns createdAt/modifiedAt split built, tested, deployed — 2026-07-25 (see Pending #11)
- [x] `eb health` Red status (04:22-06:07 UTC) self-resolved, confirmed Green — 2026-07-25
- [ ] Original 04:22 UTC trigger for that Red status identified (see Pending #19) — moot for now, but unexplained
- [x] SeoSubjectBlurb backfilled catalog-wide (5211/5271) — 2026-07-25 (see Pending #20; paused once by Anthropic credit exhaustion, resumed after Olga added credits)
- [x] Stitch planning checklist / finishing tips varied by real per-design facts, wrapped in `<aside>` — 2026-07-25 (86% of designs now fully unique, see Pending #20)
- [x] `POST /api/admin/refresh-cache` + admin button built, deployed — 2026-07-25
- [x] Sitemap `<lastmod>` bug fixed for designs, albums, and static pages; verified live — 2026-07-25 (see Pending #20)
- [x] Sitemap resubmitted to GSC after the lastmod fix — 2026-07-25
- [x] Today's remaining work committed + pushed — 2026-07-25 (`c7f3329`, `4af3a98`)
- [ ] GSC indexed-rate re-checked once Google has had time to recrawl today's subject-blurb/lastmod changes (see Pending #20)
