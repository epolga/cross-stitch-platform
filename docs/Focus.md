# Focus

Session-start guide — current goal, active work, and genuinely open items
only. Resolved narrative lives in `docs/session-log/2026-07.md` and
`docs/session-log/2026-08.md` (detailed history) and git log (what
changed, when). Longer-term ideas with no urgency live in
`web/plan/Cross-Stitch.com — Nice-to-Have Ideas.md`. Big-picture roadmap
lives in `web/plan/Pinterest AI Agent — Milestones and Roadmap.md` and
`web/plan/Cross-Stitch.com — Site Technology Milestones.md`. Split into
these four files on 2026-07-26; archived again on 2026-08-03 (~510 lines)
and 2026-08-12 (~554 lines) to stay lean.

## Session-start check — GSC growth (do this every session)

Run a GSC growth check (`automation/pinterest-agent/scripts/gsc-explore.ts`
or `gsc-compare.ts`, dimension=date, last ~2-3 weeks vs. the prior period —
see the 2026-08-07 check-back in Open item #7 below for the exact pattern).
If clicks/impressions growth has genuinely flattened or reversed (not just
normal day-to-day noise — see `feedback_dont_overinvestigate_realtime_noise`),
**propose discussing introducing a paid subscription tier** — don't
implement anything, just raise it. Otherwise report status briefly and move
on. Decided 2026-08-07 (Olga: "если увидишь, что рост прекратился,
предложишь переходить на введение платной версии"); ties to the paywall
deprioritization decision in `project_no_paid_subscription_tier` memory
("revisit if organic growth plateaus").

## Current goal

Build out Ann as a recurring blog persona: flesh out her backstory/life
(building on `web/plan/Ann_Persona_and_Newsletter_Content.md`), start writing
blog posts in her voice, use the existing reactions feature
(`CrossStitchBlogReactions`, shipped 2026-07-08) for engagement. Full public
comments deliberately deferred (see Nice-to-Have Ideas).

## Active work

Three mass sends 2026-07-24 through 2026-08-06 (newsletter + 2
Announcements), new per-campaign tracking (`EmailEntryEvents` +
`EmailSendLog`) built and exercised for real, one real template bug found
and fixed along the way. Full detail: `docs/session-log/2026-08.md`
("Email/Announcement campaigns" section). No email currently queued.

## Next session — pick up here first

**Check whether the 2026-09-02 traffic/AdSense spike (+121% vs 34-day
mean, $39.28) was really newsletter-driven, once GA4 finishes processing
that day** — asked same day, deliberately deferred because GA4's standard
Reporting API lags on the current day (confirmed earlier this same
session — the intraday numbers aren't reliable yet). Three things
launched simultaneously that day (1024-recipient newsletter, 10 new
Pinterest pins, 10 newly-indexed pages), so the spike is confounded
between them — can't attribute it to "these particular designs being
appealing" specifically without the channel breakdown. Also worth
checking then: 2026-08-31 AdSense was $35.34 despite that day's GA4
sessions crashing ~60% from the CPU-saturation incident (Open item #29)
— unexplained, worth a look (revenue not tracking session count as
tightly as expected, or a timezone mismatch between the GA4 and AdSense
reports — not investigated).

~~Decide and implement a fix for the photo-converter CPU saturation~~ —
**core fix deployed 2026-09-01/02 (see Open item #29).** Worker-threads
(Option 1) and CPU-based Auto Scaling (Option 5) are both live in
production, confirmed 2026-09-03. Full write-up in
`docs/web/photo-converter-cpu-saturation-2026-09.md`. Remaining Options
2-4 (concurrency limit, algorithmic cost reduction, background queue) are
optional hardening, not blockers.

~~Fix the pattern-save DynamoDB item-size bug (see Open item #25)~~ —
**fixed and deployed 2026-09-03.** Thumbnail moved to S3, all 113 legacy
rows backfilled and verified live. Full write-up:
`docs/web/pattern-save-item-size-bug-2026-08.md`.

~~Revisit the AWS WAF Bot Control decision (see Open item #2).~~ — **done
2026-08-13.** Real morning-after evidence made the case on its own: 08-12
(the bot-heavy day) had the highest AdSense impressions of the whole
month (2893) but the *lowest* RPM ($5.04 vs. a normal $6.55-$12.73 range)
— real, measured invalid-traffic dilution, not just annoying dashboard
noise. Checked real AWS costs via Cost Explorer before deciding (current
`CrossStitchBotProtection` WAF: ~$8-9/mo measured, not estimated; Bot
Control Common adds ~$10/mo + likely $0 more since normal traffic stays
under the 10M/mo free tier — Olga confirmed "давай попробуем" with real
numbers in hand). **Added `AWSManagedRulesBotControlRuleSet` (Common
inspection level) to `CrossStitchBotProtection` as rule priority 3,
`OverrideAction: Count` (observe-only, blocks nothing yet)** — Capacity
went 2→52 WCU, nowhere near the 1500 limit. **Next: let it run a few days,
review `BotControlCommonCount` CloudWatch metrics + sampled requests,
then decide whether to flip it to actually blocking.** Not yet done.

**Track 2 embeddings/`search_catalog` dedup tool** (discussed and built
2026-08-09, confirmed against a real live run same day — see Open item
#20) — resolved, no further action needed here. Full detail: `DECISIONS.md`
ADR-009, `docs/genai-growth/PROGRESS.md` 2026-08-09 entry.

**Walk through `search-service/app/evaluation.py` line by line with
Olga** — requested 2026-08-07 for "tomorrow" (08-08) as the real Phase 1
milestone per `ROADMAP.md` ("Olga can independently read, modify, and
debug this Python code herself"). Status unclear — an 08-08 PROGRESS.md
entry exists but is about questioning the pipeline's usefulness, not
confirmed as this specific walkthrough. Worth confirming with Olga
whether this still needs to happen. Explain in detail, not tersely — GenAI
learning track (`feedback_genai_track_explain_in_detail`).

**Real catalog gap found 2026-08-08, via a live customer email (Linda):**
no Fawn design lands close to the common 5x7"/8x10" print sizes (all
existing Fawn designs are square ~10"x10" or too tall/narrow — see reply
draft `web/plan/_draft_email_linda_2026-08-08.md` for the full sizing
analysis). Real, customer-driven candidate theme for Track 2's
design-generation pipeline — a manually-sized Fawn (~70x98 or ~112x140
stitches) would be a good manual-override test case. Not yet started.

**GenAI Phase 0** — done 2026-08-06, Track 1 (Python `search-service/`)
deployed as a real Lambda (`https://c9mkmhf9bi.execute-api.us-east-1.amazonaws.com`,
see ADR-008). Current next-actions live in `docs/genai-growth/PROGRESS.md`
itself now — check there rather than here. Olga has no prior Python
experience (C#/.NET background) — teach Python as a contrast to C#/.NET
(`Learning.md` § Python Background).

"Publish to Catalog" (shipped 2026-08-04/05) verified live, no known open
follow-up. Otherwise: S6's next step (prefetch/`content-visibility` work,
`web/plan/Cross-Stitch.com — Site Technology Milestones.md`) or Open items
below.

**Shipped 2026-08-04/05** — editor fullscreen mode (+ 2 layout bugs found
and fixed), palette panel width-clipping bug, simulation-mode cross
thickness, "Publish to Catalog" admin feature (incl. a production IAM
fix), outline/stroke preservation reworked (hysteresis threshold +
k-means quantization pre-pass). Full detail: `docs/session-log/2026-08.md`.

**Shipped 2026-08-03** — editor "Whole Chart" zoom default, CIE76→CIEDE2000
public picker, editor mobile scroll affordances, Milestone S5, S6 first
step (nav-performance baseline), password-reset fix, Ann/Nitka check,
design-vote first clean recurrence check. Full detail:
`docs/session-log/2026-08.md`.

**Shipped 2026-07-27/07-28** — catalog PDF-to-editable conversion end to
end, 3 parser bugs fixed, 6 quick-wins from a ChatGPT-doc review, a real
live-user bug fix (Christa — verify-email login). Full detail:
`docs/session-log/2026-07.md`.

## Open items

1. ~~Blog teaser email for `why-i-built-this`~~ — **already sent** (full
   send, confirmed by Olga 2026-08-05; exact date not recorded, see
   `web/plan/Email_Content_Plan.md`).
2. **Distributed scraping mitigation** — escalated 2026-08-12: found and
   blocked a large Alibaba Cloud Singapore scraper (4 rotating `/24`
   subnets — `43.119.100.0/24`, `43.119.104.0/24`, `47.82.201.0/24`,
   `47.82.202.0/24` — 459+ IPs, 50k+ req/day, breadth-first content scrape,
   no exploit-probe pattern). All 4 confirmed 100% blocked (403) via WAF
   after manual sync. Same day, GA4 realtime showed a second wave — much
   more diffuse (hundreds of low-count IPs across many countries/hosting
   providers, no single dominant subnet) — discussed AWS WAF Bot Control
   (Common tier, Count-mode first) as the real next step since manual
   CIDR blocking doesn't scale against this shape of traffic. **Decided:
   wait a couple of days (confirmed not dangerous — no server strain, no
   exploit patterns, just extra bandwidth/analytics noise) and revisit.**
   **Explicit next-session ask (2026-08-12): come back to the WAF Bot
   Control decision tomorrow — don't let it drop.** Later same day: the
   diffuse wave kept growing (GA4 realtime up to 128 active, Singapore
   35), and a large NEW cluster was found (`57.141.0.0/24`, 70 IPs,
   935 req/hr) — but that one turned out to be legitimate:
   `meta-externalagent/1.1` (Meta's documented crawler, real Facebook
   Inc. IPs, used for link-preview + Meta AI training data collection per
   `developers.facebook.com/docs/sharing/webmasters/crawler`). Doesn't
   run JS so it's invisible in GA4 — not the cause of the elevated
   numbers, not something to block as abuse (though blocking it via
   `robots.txt` for AI-training reasons would be a legitimate separate
   policy question if Olga wants to raise it). The already-blocked
   4 Alibaba subnets stayed 100% blocked all day (9561/9561 req = 403
   in one later hourly check) — confirmed still solid.
   **2026-08-13 morning: AWS WAF Bot Control (Common, Count mode) enabled**
   — see the "Next session" entry above for the full real-cost justification
   (08-12's AdSense RPM dropped to the month's lowest, $5.04, on its
   highest-impression day, 2893) and the technical detail (rule
   `BotControlCommonCount`, priority 3, `OverrideAction: Count`, WebACL
   `CrossStitchBotProtection`, capacity 2→52 WCU). **Observe-only for now
   — not yet switched to actually blocking.** Next: review
   CloudWatch/sampled-requests after a few days, then decide.
   Older context: distinct scraping (download-counter inflation bots
   exploiting the no-auth email-in-body pattern) still monitored via
   `/review-ip`, status 2026-07-24: 0 watched, 25 blocked.
3. **Singapore/bot-traffic GA4 anomaly** — confirmed bot traffic
   2026-07-10 (0.7% engagement, 99% direct/none, same signature as ALB
   scrapers; see Open item #2 for the much larger 2026-08-12 recurrence).
   Not yet done: add a session-quality filter to the Milestone 9
   pin-attribution pipeline (or re-run recent numbers excluding
   Singapore/China/Russia) to see how much this understates real traffic's
   revenue attribution.
4. **Automated test coverage** — `docs/srs/` built 2026-07-11, Olga hasn't
   read through it yet. CI exists for `web/` (build+Vitest). Next: build
   tests for the priority-1 area, `09-Test-Plan.md` §4.2 — start with the
   **PayPal webhook**, then auth/session → conversion algorithm → autopinner
   claim/pin logic → download-mode gating → Uploader publish sequence. Add a
   CI job for pinterest-agent/autopinner/Uploader once each gets its first
   real test.
5. **Thank-you reply to Leisa** (feedback source for 3 editor fixes shipped
   2026-07-10) — waiting on her email address.
6. **GSC indexed-rate re-checks** — two pending: after the Gap 3
   canonicalization fix (baseline ~21-22% avg, noisy) and after the
   2026-07-25 subject-blurb/lastmod changes (too early to attribute as of
   07-26). Also worth directly confirming in the GSC UI whether the
   original 2026-07-09 "Crawled – currently not indexed" Validate Fix
   actually passed (checkpoint was due 07-23, never explicitly confirmed).
7. **GSC average position decline (found 2026-08-12) — full write-up in
   `docs/web/gsc-indexing-investigation-2026-08.md` § 2, read that first.**
   Three non-exclusive candidate causes tracked there: Pinterest ad-spend
   halo effect (whole-history r=0.567 correlation), a confirmed Google
   spam update (2026-08-18 to 08-21), and mechanical drag from rising
   indexed-page-count (item #6's canonicalization work). Site-side causes
   (5xx rate, Googlebot errors, latency, deploys, Manual Actions/Security)
   already checked and ruled out. **Check ~2026-09-06**: re-run
   `_check_halo_effect.ts`, compare US position/GA4 organic at the current
   $5.5/day budget against both prior periods, and check whether the spam
   update has settled and indexed-count growth has plateaued.
8. **Newsletter/Announcement send follow-up** — newsletter side ("Lady of
   Perpetual Love", 07-24) confirmed healthy 2026-07-27. **Announcement
   email ("You spoke, I listened") remains unverifiable** — exact send
   date was never recorded and predates `EmailSendLog`; not worth further
   digging unless the date surfaces some other way. Full detail:
   `docs/session-log/2026-08.md`.
9. **`EmailSendLog` real-send verification** — built 2026-07-26, first
   exercised for real by the 2026-07-27 Announcement send (723 rows via
   `send-announcement`). Not yet verified end-to-end — run
   `check-email-campaign.ts`/`check-email-recipient.ts` against that
   send's `eid`.
10. **AI-tools-scan first real trigger** — built and deployed 2026-07-26
    to the daily Lambda pipeline, gated on day-of-month === 26. Verified
    via manual local test runs only so far; first real scheduled trigger is
    **2026-08-26**.
11. ~~Switch photo converter's DMC matching from CIE76 to CIEDE2000~~ —
    **done 2026-08-03**, public picker shipped, `cie76` stays the default.
    Full detail: `docs/session-log/2026-08.md`.
12. **Adopt DINOHash for near-duplicate catalog image detection** — found
    via the 2026-07-26 AI-tools-scan. Current pipeline (SHA-256 exact-match
    + 64-bit dHash) has a confirmed false-positive mode: the "99 Names of
    Allah" series (8 designs, same border/font/layout, different Arabic
    text) landed at the same Hamming distance as true duplicates, because
    dHash compares raw pixels, not semantic content. DINOHash (DINOv2
    features, https://github.com/proteus-photos/dinohash-perceptual-hash)
    should distinguish "same template, different content" from "actually
    the same image." Next step: prototype against known confirmed/
    false-positive pairs in `reports/duplicate-designs-visual.json` before
    rewiring the real pipeline.
13. **2026-07-27 Announcement send follow-up** — sent to 723/723, 0 errors.
    Not yet checked: GA4 traffic to `/XStitch-Charts.aspx` and
    `catalog_pattern_opens` for a post-send bump; SES complaint/bounce
    rate for this batch specifically.
14. **Design-vote "Previous vote: none" mystery — still not confirmed
    resolved, checked (imperfectly) 2026-08-12.** First attempt at a bulk
    log scan claimed "743 log lines, zero recurrence since 08-01" — this
    was **wrong**, caught by Olga ("откуда сотни голосов, их не было
    столько") — `console.log`'s multi-line object output gets ingested
    by CloudWatch as one event *per physical line*, so 743 lines was
    really only 96 `getUserDesignVote` calls fragmented across ~7-8 lines
    each, and the naive same-line substring search never matched
    anything. Redone correctly (reassembling multi-line blocks): 96 real
    reads, but **zero `putDesignVote` (actual vote-write) calls** turned
    up in that scan window — meaning it couldn't have exercised the bug
    either way. Directly traced one real example Olga forwarded (2026-08-08
    18:15:46, DesignID 5433, `annelinevanschie@hotmail.com`) — clean:
    write immediately followed by a correctly-`found:true` read, no bug.
    A second real example Olga forwarded (2026-08-12 15:59:09, DesignID
    5463 "Kawaii Cottagecore Frog", `dd46@btinternet.com`,
    `86.182.135.45`) **could not be checked** — see Open item #15, the
    CloudWatch log group has no data at all past ~11:17 UTC today.
    Bottom line: one clean real example, no broad statistical confirmation
    yet, and a second example currently unreachable. Do **not** remove
    the temporary diagnostic `console.log`s yet. Separately (not a bug,
    still an open product question): clicking the *opposite* arrow while
    already voted currently "clears" the vote rather than "switching" it,
    consistent client+server — left as-is pending an explicit decision on
    the wanted behavior.
15. **CloudWatch log streaming for `cross-stitch-com-env-clone` — more
    precisely diagnosed 2026-08-12, still unfixed.** Root cause is
    narrower than "logs are stale": the **`FilterLogEvents` API returns
    empty results for this log group even with no filter pattern at all**
    (confirmed: 0 events, 0 streams searched, across multiple time
    windows), while `DescribeLogStreams` and `GetLogEvents` on a specific
    known stream both work fine and return real, near-real-time data. So
    `eb logs`/CloudWatch console search (which use `FilterLogEvents`
    under the hood) looks broken/empty, but the data is actually there —
    it just has to be fetched stream-by-stream via `GetLogEvents`
    instead. Separately noticed: log streams here are unusually
    short-lived (many span only minutes), meaning EC2 instances are
    cycling much more often than expected — not yet investigated why.
    Not yet fixed: whether `FilterLogEvents` can be restored (IAM scope?
    indexing issue?) or this is just how this log group has to be queried
    going forward.
    **Worse than that, found same day (later): actual log ingestion
    appears to have stopped entirely around 11:17 UTC on 2026-08-12.**
    Checked ~5 hours later (16:22 UTC): scanned all 87 log streams that
    currently exist in the group via `GetLogEvents` (the workaround above)
    and the newest content-timestamp found anywhere was `11:17:44Z` — no
    trace of anything since, despite the site clearly being up and serving
    real traffic the whole time (the 748-recipient Announcement send
    completed fine at ~16:05 UTC). This blocked verifying a real
    design-vote example from 15:59 UTC (Open item #14). Not yet
    investigated: whether the CloudWatch agent process died on the
    current instance, disk/buffer issue, or something related to the
    unusually high instance churn noted above (maybe worse under today's
    heavy bot load). Worth checking first thing next session — if it's
    still not flowing, this is now blocking more than just occasional
    debugging.
16. ~~Outline-preservation: stray small-patch noise~~ — **done
    2026-08-04**, k-means quantization pre-pass fixed it. Full detail:
    `docs/session-log/2026-08.md`.
17. ~~Track 2 grounding-gate fix~~ — **fixed 2026-08-09**
    (`allowed_callers: ['direct']` — `web_search` was routing through a
    code-execution intermediary). Full detail: `docs/genai-growth/PROGRESS.md`.
18. ~~Transparent-PNG black-background bug~~ (`pattern-converter.ts`) —
    **fixed and deployed 2026-08-08**, live and verified (Health Green).
    Full detail: `docs/genai-growth/PROGRESS.md`, `OPPORTUNITIES.md`
    Opportunity 9 "Cause A".
19. ~~AI-draft patterns unloadable after admin-review-UI deploy~~ — **found
    and fixed 2026-08-08, live within the hour.** Root cause: EB role's
    DynamoDB policy is a manual per-table allowlist, new tables weren't
    added. **Standing pattern worth remembering: any new self-provisioning
    DynamoDB table needs an explicit IAM grant before its first production
    deploy** — `ensureTable()` alone doesn't grant EB role access. Full
    detail: `docs/genai-growth/PROGRESS.md`.
20. ~~Track 2 catalog-dedup `search_catalog` tool~~ — **confirmed live
    2026-08-09**, after fixing 3 real bugs (a `container_id` 400 error, a
    strict-typeof JSON parsing bug, and an embedding-staleness gap now
    self-healed via `backfillMissingEmbeddings()`). First real successful
    result: theme "luna moth", grounded in real citations and genuine
    catalog awareness. Full detail: `docs/genai-growth/PROGRESS.md`.
21. ~~"Luna Moth" wrongly matching unrelated themes~~ — **found and fixed
    2026-08-09.** Root cause: `backfillMissingEmbeddings()` embedded the
    caption alone (9 chars) instead of caption+description (~1200 chars);
    short text lands in a less discriminative embedding region. Fixed to
    match the batch tool's convention; verified correct matches after.
    Full detail: `docs/genai-growth/PROGRESS.md`.
22. ~~"Minimalist Line Art Face" AI-draft saved almost entirely empty~~ —
    **fixed 2026-08-09, three rounds before it was actually right**
    (background-erasure fallback tunneling through anti-aliased edges,
    then a "blanc White" background-as-real-color bug, then a border-seed
    color-check bug). Final result: full outline intact, no spurious
    background color. Full detail: `docs/genai-growth/PROGRESS.md`.
23. **Converter improvements from a real kitten test image** (2026-08-09) —
    three findings: removed an unconditional photo→illustration mode
    override in `save-ai-draft.ts` (Olga's call — trust the classifier's
    real verdict everywhere); `analyzeImage()` misclassifies some flat
    cel-shaded illustrations as typography (not yet fixed — new
    `MODE_OVERRIDE` CLI arg added as a manual workaround); fixed a real
    outline-detection bug via hysteresis thresholding (single global
    threshold fragmented strokes crossing low-contrast fur/background).
    Full detail: `docs/genai-growth/PROGRESS.md`.
24. **`save-ai-draft.ts` now always archives the source image to S3**
    (`generatedImageKey` + `AiDesignGenerations` row), not only when a real
    `GenerationMeta` file is passed. Olga's ask 2026-08-11: link every
    picture-based design back to its source picture, admin-only. **In
    effect at least through 2026-09-30** — revisit then whether to keep
    unconditional or scope back to `GenerationMeta`-only runs. Known minor
    side effect (extra orphaned `AiDesignGenerations` row on a re-run) is
    now surfaced via an SES alert (`alertExistingPatternRerun()`) rather
    than silent.
25. **Pattern-save DynamoDB item-size bug — FIXED and deployed 2026-09-03,
    full write-up in `docs/web/pattern-save-item-size-bug-2026-08.md`.**
    Found 2026-08-12: saving a detailed/colorful pattern could fail with a
    raw DynamoDB `ValidationException` because `savePattern()`/
    `updatePattern()` only guarded the *grid* field size, never the
    `thumbnail` field (often 98% of item size) or the total item. Fixed by
    moving `thumbnail` to S3 (`photos/converter-patterns/<patternId>.<ext>`,
    reusing the already-whitelisted CloudFront `/photos/**` path — no new
    infra needed): backward-compatible reads shipped first
    (`resolveThumbnailSrc()`), then the write path
    (`storeThumbnail()` in `pattern-storage.ts`), then all 113 existing
    legacy-format rows backfilled and verified live via CloudFront (10
    spot-checked, all valid), then `deletePattern()` simplified to also
    clean up the S3 object, then the now-dead legacy-format read branch
    removed. 104 tests passing, deployed same day.

26. **GSC "Duplicate without user-selected canonical" cleanup — deployed
    2026-08-23, Validate Fix clicked same day.** Olga found several flagged
    URLs (`/photo-to-cross-stitch?catalogPatternId=`, `/?page=59`,
    `/?utm_source=.../?gclid=...`, `/Free-India-Charts.aspx?pageSize=10&nPage=1`,
    `/albums/9`, a malformed `?eid_...` legacy email link). Root cause per
    URL varied (missed param in an existing noindex check, legacy pagination
    param no code recognizes anymore, tracking params never checked at all,
    a redundant-default-params link generated by `PaginationControl.tsx`'s
    "First page" button, numeric vs pretty-slug album URL duplication) — no
    single fix covered all of them. Replaced the per-param enumeration with
    one general rule instead: noindex whenever the actual request URL
    doesn't match its canonical (any search param present, or — for albums
    — access via the numeric `/albums/[id]` route instead of the pretty
    slug). Implemented in `web/src/app/page.tsx`,
    `web/src/app/photo-to-cross-stitch/page.tsx`, new
    `web/src/lib/album-metadata.ts` (shared by `albums/[albumId]/page.tsx`
    and `[slug]/page.tsx`), plus a `?page=` redirect in `middleware.ts`.
    All 6 reported URLs verified noindex/redirect live on production same
    day. **Known behavior change**: `/photo-to-cross-stitch?source=`-only
    (no id) used to stay indexable deliberately — now noindex too, since
    it's not distinct content from the bare URL. **Check back ~2026-09-06
    (Google's validation typically takes ~2 weeks)**: did GSC clear the
    "Duplicate without user-selected canonical" status for these URLs, and
    has anything similar shown up elsewhere on the site that this general
    rule doesn't yet cover (it only touched homepage/albums/converter —
    other route types like individual design pages weren't audited).

27. **"Crawled – currently not indexed" (3.43K design pages) — fair A/B
    test set up 2026-08-23 for the 2026-07-09 visual-SEO AI backfill.**
    Olga showed GSC screenshots of this report (3.43K affected pages,
    mostly individual `-Free-Design.aspx` pages). Checked whether the
    07-09 backfill (new AI-generated title/description per design, vs the
    old generic template) actually improved indexing — the original 07-09
    "control" (269 designs, reverted to old text) turned out to be badly
    confounded: it was selected because those 269 *already had GSC
    traffic* before the backfill, not randomly, so its 83.6% indexed rate
    vs a random backfilled sample's 29.3% mostly reflects that those 269
    were already-successful pages, not an effect of the text itself.
    **Set up a real random A/B test instead**: from the ~5002 backfilled
    designs that were NOT part of the original 269 (i.e. genuinely the
    previously-unindexed long tail), randomly split 150/150 —
    `automation/pinterest-agent/scripts/_setup_backfill_ab_test.ts`
    reverted one 150 back to pre-backfill text (via the `SeoDescriptionPrevious`
    backup each design already had) and left the other 150 with the new AI
    text untouched. Verified live on production (design 4942 "Bear" now
    serves the old generic title/description). Group membership (both
    designId lists) saved to
    `automation/pinterest-agent/reports/ab-test-backfill-groups.json` —
    use that file, not a fresh random sample, when checking back, so the
    same two tracked groups are compared each time. **Check back
    ~2026-09-06** (paired with the other GSC checks above): re-run URL
    Inspection on both saved groups (same method as
    `_check_backfill_vs_control.ts`) and compare indexed% — if treatment
    is meaningfully higher than control, the backfill helps; if similar,
    it doesn't, and the root problem (thin/templated content, or
    something else) needs a different fix. Afterward, revert the 150
    control-group designs back to the new AI text (they're real live
    pages, not meant to stay on old text long-term) via
    `backfill-visual-seo.ts --force --designIds=<the 150 from the JSON>`.

28. **Caption-rename batch (recrawl trigger) — 150 designs, 2026-08-23.**
    For the "crawled long ago, still not indexed" majority (95/125 stale
    30-90d, 28 stale 90+d in a 200-URL sample — see Open item #27's
    sibling finding). Real evidence a lastmod-only bump isn't reliable:
    `Owl-9-201-Free-Design.aspx`'s sitemap lastmod was bumped 07-27, but
    it still hadn't been re-crawled since 2025-12-27 as of 08-23 — a
    genuinely new URL is a stronger signal than another lastmod touch.
    Caption drives the URL (`CreateDesignUrl` uses `Design.Caption`, NOT
    `SeoTitle` — the 07-09 backfill never changed `Caption`, so this
    lever was untried). Mechanically safe: design lookup is by
    albumId+NPage only (caption text is decorative), so old URLs stay
    resolvable (verified: `Flowers-17-337-Free-Design.aspx` still 200s)
    and become orphaned (no internal links point at them once `Caption`
    changes, since links are generated from the live DB value at
    request time) rather than recreating today's duplicate-URL problem
    — that problem needed *sustained* internal linking to a variant,
    which this doesn't have.
    **Scope deliberately incremental** (150 of ~4702 eligible, ~3%), not
    a mass simultaneous rename — avoids a crawl-budget/URL-churn shock
    and keeps the batch small enough to review before scaling further.
    `automation/pinterest-agent/scripts/_rename_stale_captions.ts`
    (text-only Haiku call per design, deriving a short 2-4 word caption
    from the existing SeoTitle/SeoSubjectBlurb — no vision, cheap). First
    dry-run overused stock words badly (19/150 contained "jewel", 2 exact
    duplicate captions) — tightened the prompt to ban generic
    decorative/color-mood filler words and require naming the concrete
    subject; re-run dropped it to 5/150 and 0 duplicates, remaining
    repeats (e.g. "Golden" ×14) all paired with a different concrete
    noun each time, judged acceptable. Executed for real, verified live
    (design 2535: canonical now `Magenta-Petunias-17-337-Free-Design.aspx`,
    old `Flowers-17-337-Free-Design.aspx` still 200s, sitemap.xml will
    catch up within its ~1hr S3 cache TTL). Excludes the Open item #27
    A/B test's 300 tracked designs and the original 269 (kept isolated so
    neither experiment confounds the other). Batch list saved to
    `automation/pinterest-agent/reports/caption-rename-batch.json`.
    **Check back ~2026-09-06** (same checkpoint as items #26/#27): did
    these 150 get (re)crawled faster than the general stale population?
    If yes, scale up gradually to more of the ~4702 pool; if no
    meaningful difference, the crawl-budget-neglect theory needs
    rethinking.

29. **Photo-converter CPU saturation — full write-up at
    `docs/web/photo-converter-cpu-saturation-2026-09.md`, read that first.**
    Found 2026-09-01, starting from Olga noticing GA4 Realtime showing
    0-1 active users when she normally sees several at once. Root cause
    confirmed in code: `/api/convert`, `/api/convert/pdf` (and the
    `/photo-to-cross-stitch` page that calls them) ran pattern generation
    as synchronous JS in the request handler, on a single `next start`
    process with no worker threads/queue/concurrency limit — a normal
    burst of concurrent conversions pegged CPU at 100%, blocked the whole
    process (including the ALB/EB health check), and caused real 502/504s
    for unrelated visitors. Caused a real ~60% GA4 session drop, uniform
    across every channel, on 2026-08-31. **Fixed and deployed**: Option 1
    (worker threads, `31670f4`) moves `convertImage()`/`buildPatternPdf()`
    into a Piscina worker pool; Option 5 (CPU-based Auto Scaling trigger,
    `8ef2099`/`c0a66d1`, `Statistic=Maximum`/`Threshold=65`) is a
    sustained-load backstop. Both confirmed live in production 2026-09-03
    (deploy `app-260902_201907185445`, 2026-09-02 17:23 UTC, postdates
    both commits; CPU alarm confirmed live via `describe-alarms`).
    Remaining Options 2 (concurrency limit), 3 (algorithmic cost
    reduction), 4 (background queue) are optional hardening, not
    implemented, not required to close this out.

30. **IAM allowlist for self-provisioning DynamoDB tables — audited 2026-09-02, same day (Olga's ask, don't defer it).**
    Found live 2026-09-02: `EmailEntryEvents` was missing from
    `CrossStitchDynamoDBAccessPolicy` (the EB EC2 role's manual per-table
    DynamoDB allowlist), so every newsletter click-through silently failed
    to record — real clicks were happening (confirmed in CloudWatch logs,
    `GetLogEvents` workaround since `FilterLogEvents` is still broken for
    this log group, see Open item #15) but the campaign's own tracking
    table showed zero, because the write threw `AccessDeniedException`
    and was swallowed by a best-effort `catch` block. Fixed live by adding
    `EmailEntryEvents` (+ `/index/*`) to the policy's second statement and
    verified end-to-end (a test cid recorded correctly after the change,
    then cleaned up). **This is the second time this exact class of bug
    has hit production** — the first was 2026-08-08, `AiDesignGenerations`
    et al. missing from the same policy, made AI-draft patterns
    unloadable in the admin review UI. Durable rule now written into
    `web/CLAUDE.md` ("New DynamoDB tables need an explicit IAM grant
    before production use").
    **Full audit done same day:** all 16 tables `web/` self-provisions
    (grep for `ensureTable()`/`const TABLE =` across `src/lib/*.ts`)
    checked against both `CrossStitchDynamoDBAccessPolicy` and
    `AmplifyCrossStitchPolicy`. `CrossStitchItems` looked like a gap at
    first (absent from `CrossStitchDynamoDBAccessPolicy`) but is actually
    covered by the separate legacy `AmplifyCrossStitchPolicy` — false
    alarm. **One real second gap found: `SubscriptionEvents`**, used only
    by `/api/subscription/confirm/route.ts` — not actively hit right now
    (paywall is off, all 1574 users free per
    `project_no_paid_subscription_tier` memory) so this wasn't live-broken
    the way `EmailEntryEvents` was, but would have failed identically the
    moment the paywall is ever turned back on. Fixed the same way, same
    session. All 16 tables now correctly granted — nothing left open here.

31. **Legacy IAM cruft from the pre-EB Amplify hosting era — found while
    checking Open item #30, nothing deleted, just documented.** Full list
    (confirmed-dead roles/policies with evidence, the "probably fine"
    list, what's not yet done) moved to
    `docs/web/iam-legacy-amplify-cruft-2026-09.md`. Still needs Olga's
    explicit go-ahead before anything is deleted.

32. **Source-image key sharing, S3 orphans, and an ownerless-pattern auth
    gap — full write-up in
    `docs/web/source-image-key-sharing-and-orphans-2026-09.md`, read that
    first.** Found 2026-09-03 while investigating whether `thumbnail`
    (Open item #25) could move to S3 like `sourceImageKey`/
    `researchImageKey` already do. Three findings:
    - **~506 MiB orphaned S3 objects** (783/827, 94.7%, in
      `pattern-source-images/`+`research-uploads/`) — mostly from
      converter use that never got saved as a pattern, not from
      deletions. Bucket has versioning + a 90-day noncurrent-version
      lifecycle rule already, so any cleanup is recoverable. All four
      tracks **done 2026-09-03**: Track A (delete-time cleanup,
      unconditional — no reference check), Track C (migrate `thumbnail`,
      Open item #25), Track B (real cross-reference cleanup, NOT a
      blind age-based lifecycle rule — that was corrected before
      implementing, since these keys never get rewritten so age alone
      can't distinguish old-but-live from garbage; new
      `web/scripts/cleanup-orphaned-source-images.ts`, kept as a reusable
      script since new orphans keep accumulating from unsaved converter
      use — ran for real, 697/697 deleted, 0 failures, ~457 MiB cleared),
      and **Track D — the actual structural fix**: moved the S3 upload
      itself out of `api/convert/route.ts` (fired on every conversion
      attempt) into a new `api/converter/upload-source-photo/route.ts`,
      called only from `handleSavePattern()` — an abandoned conversion
      now never touches S3 at all, closing the leak at its source rather
      than just cleaning up after it. Verified live (convert-without-save
      left the S3 object count unchanged; the new endpoint uploads
      correctly when called directly).
    - **`newPattern()` didn't reset `sourceImageKey`/`researchImageKey`/
      `sourceImageMaskKey`** (added ~6 weeks after `newPattern()` was
      written, never wired into its reset list) — **fixed, committed, and
      deployed 2026-09-03** (`ConvertClient.tsx`).
    - **Ownerless-pattern auth gap**: `GET`/`PUT`/`DELETE`
      (`api/converter/patterns/[id]/route.ts`) and `source-image/route.ts`
      only check ownership `if (pattern.ownerID)` — a row with no owner
      has no check at all. Verified dormant (the 14 ownerless rows all
      predate the `sourceImageKey` field; `POST` always requires a
      session and always sets `ownerID`, so no new ownerless row can
      appear). **Deliberately deferred, not fixed** — Olga's explicit
      "запиши на будущее" 2026-09-03, not a live risk today.

## Done when

- [x] IAM allowlist audited for other missing self-provisioning tables — done 2026-09-02, `SubscriptionEvents` found+fixed (see Open item #30)
- [ ] Legacy pre-EB Amplify-era IAM cruft cleaned up or explicitly deferred — full list in `docs/web/iam-legacy-amplify-cruft-2026-09.md`, nothing deleted yet, needs Olga's go-ahead
- [x] Pattern-save DynamoDB item-size bug fixed — thumbnail moved to S3, all 113 legacy rows backfilled, deployed and verified live 2026-09-03 (see Open item #25)
- [ ] GSC "Duplicate without user-selected canonical" cleanup validated — re-check ~2026-09-06, Validate Fix clicked 2026-08-23 (see Open item #26)
- [ ] Backfill-vs-control A/B test checked — re-check ~2026-09-06, groups saved in `ab-test-backfill-groups.json` (see Open item #27); afterward restore control group's 150 designs to new AI text
- [ ] Caption-rename recrawl-trigger batch checked — re-check ~2026-09-06, list saved in `caption-rename-batch.json` (see Open item #28); scale up gradually if it worked
- [x] Blog teaser email sent (confirmed by Olga 2026-08-05, exact date not recorded)
- [x] Distributed scraping mitigation decision made — AWS WAF Bot Control (Common, Count mode) enabled 2026-08-13 (see Open item #2) — [ ] switch to actually blocking once reviewed
- [ ] Thank-you reply sent to Leisa — waiting on her email address
- [ ] Olga has read through the `docs/srs/` documentation set
- [ ] Automated tests built for the priority-1 area (`09-Test-Plan.md` §4.2, starting with PayPal webhook)
- [ ] GSC indexed-rate re-checked after Gap 3 canonicalization and after subject-blurb/lastmod changes
- [ ] GSC average position — re-check ~2026-09-06 (see Open item #7; Pinterest-spend correlation found 08-23 as a second candidate cause alongside the original "Google dance" theory, need more data at the restored $6.5 budget to separate the two)
- [x] Newsletter follow-up metrics checked (07-27: healthy — see Open item #8) — [ ] Announcement email follow-up unverifiable, exact send date unknown
- [ ] `EmailSendLog` exercised by a real send and verified end-to-end
- [ ] First real AI-tools-scan trigger observed via the actual scheduled pipeline (2026-08-26)
- [x] Photo converter's DMC color matching: public "Thread color accuracy" picker shipped 08-03, `cie76` stays the default
- [ ] DINOHash prototyped against known duplicate-designs test pairs, then wired into the real pipeline if it resolves the dHash false-positive mode
- [ ] Revisit unconditional S3 archiving in `save-ai-draft.ts` by 2026-09-30 (see Open item #24) — keep as-is or scope back to `GenerationMeta`-only runs
- [ ] 2026-07-27 Announcement send follow-up metrics checked (GA4 + SES, see Open item #13)
- [ ] Design-vote "Previous vote: none" — one real example (08-08) checked clean, but no broad statistical confirmation yet and a second example (08-12) is currently unreachable due to the CloudWatch gap (see Open item #14) — keep diagnostic logging in place
- [ ] CloudWatch log ingestion for `cross-stitch-com-env-clone` fixed/confirmed working again — both the `FilterLogEvents` issue AND a total gap since ~11:17 UTC 2026-08-12 (see Open item #15)
- [x] Track 2 grounding-gate fix confirmed against a real `detectTrend()` run (see Open item #17)
- [x] Track 2 `search_catalog` dedup tool confirmed against a real `detectTrend()` run (see Open item #20)
- [x] Transparent-PNG black-background fix (`pattern-converter.ts`) deployed to the live site (see Open item #18)
- [x] `/photo-to-cross-stitch` + `/api/convert*` CPU-saturation root cause fixed — worker threads + CPU-based Auto Scaling deployed, confirmed live 2026-09-03 (found 2026-09-01, caused a real ~60% GA4 session drop on 08-31 — see Open item #29) — [ ] optional hardening (concurrency limit, algorithmic cost reduction, background queue) still undone
- [x] `newPattern()` image-key reset bug fixed, committed, and deployed 2026-09-03 (see Open item #32)
- [x] Delete-time S3 cleanup (Track A) shipped 2026-09-03, unconditional — thumbnail/sourceImageKey/researchImageKey/sourceImageMaskKey all deleted alongside the pattern (see Open item #32)
- [x] Existing S3 orphan backlog cleared (Track B) 2026-09-03 via real cross-reference (not age-based) — 697 objects deleted, ~457 MiB, 0 failures (see Open item #32)
- [x] S3 orphan leak closed at the source (Track D) 2026-09-03 — upload deferred from convert-time to Save-time (new api/converter/upload-source-photo/route.ts), verified an unsaved conversion no longer touches S3 (see Open item #32)
- [ ] Ownerless-pattern auth gap in patterns/source-image routes fixed — deliberately deferred 2026-09-03, currently dormant/not exploitable (see Open item #32)
