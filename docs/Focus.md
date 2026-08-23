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

**Fix the pattern-save DynamoDB item-size bug (see Open item #25) —
detailed write-up, real repro, real users exposed too, not just a
script.** Found 2026-08-12 saving a real design ("Black Cat with Magic
Cauldron") to Olga's own account; she explicitly asked this be written up
in full detail for tomorrow.

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
7. **GSC average position — new decline found 2026-08-12, watching.**
   Previous softening (peaked 14.8 on 07-23) had fully resolved by
   08-07 (recovered to 9.9-14.4 range through 08-05). But a fresh,
   real 3-day worsening trend: 08-09 (11.0) → 08-10 (13.3) → 08-11
   (16.3) — a new 3+ week high, clicks/impressions also dipped on 08-11.
   Checked and ruled out on our side: server 5xx rate (stayed low all
   week, 0.08-0.32%), Googlebot-specific error rate (also low), response
   latency (no degradation, fastest on 08-12), recent deploys (none
   touched redirects/canonical/sitemap/middleware). Page-level pattern is
   broad/mixed, not isolated to one template (homepage 11.6→13.6, several
   category pages worse, a few better). Cross-checked against external
   reports: real, unconfirmed industry-wide Google ranking volatility
   ("Google dance") reported since ~2026-08-01, no official update
   confirmed by Google, possibly a delayed-effect tail of the June 2026
   spam update. Same-day follow-up: sliced by country=USA specifically —
   real (non-bot) GSC click data shows the decline is sharper there than
   site-wide (pos 11.9 on 08-09 → 16.5 on 08-10 → 20.1 on 08-11, clicks
   45→29), and this is what's actually behind Olga's "no live US
   visitors" observation the same day — real people seeing the site
   lower in US search results, not a traffic-tracking mystery. Olga
   checked the GSC UI directly for Manual Actions and Security Issues —
   **both clean**, ruling out a penalty/policy flag as the cause. **Decided:
   not urgent (likely industry-wide noise, not a site problem, and not a
   policy violation), re-check position in a couple of days.**
   **2026-08-23 update:** Olga found she'd cut the Pinterest daily budget
   to ~$4.5 around 08-07 (matches this item's decline window) and raised
   it back to ~$6.5 on 08-17. US-filtered GSC position improved 15.2→13.4
   avg and clicks +37% (35→48/day) comparing 08-07..16 vs 08-17..21;
   cross-checked independently via GA4 US Organic Search sessions, which
   moved the same direction (+32%, 62.9→83.3/day) while Direct-channel
   sessions stayed flat (32.7→31.8) — rules out "people typing the URL
   after seeing a pin" as the mechanism, points to it landing as organic
   search lift specifically. Whole-history Pearson correlation (spend vs
   GA4 organic sessions, 97 days, `_check_halo_effect.ts`): r=0.567
   same-day, r≈0.51-0.53 at 1-3 day lag; a prior natural experiment (the
   2026-06-19 cut from $11.84→$4.89/day) showed the same direction
   (-26.5% organic). **This is a second, independent candidate cause for
   the same 08-12 decline this item already attributes to industry-wide
   "Google dance" — not a replacement for that explanation, a confound.**
   Both may be partially true. **Next check: ~2026-09-06**, once ~3 weeks
   of data exist at the $6.5 budget (matches the 10-day low-budget sample
   size) — re-run `_check_halo_effect.ts` and compare US position/GA4
   organic against the 08-07..16 baseline again. Also worth checking then
   whether the broader Google-ranking volatility mentioned above has
   independently settled, to help separate the two candidate causes.
   **2026-08-23, same day, web search confirms a third candidate cause,
   found AFTER the Pinterest-spend comparison above was already written:**
   a **confirmed** (not just tracker-inferred) Google spam update ran
   2026-08-18 12:30pm ET → 2026-08-21 4:50am ET (~2.5 days, third of 2026
   after March/June, announced by Google Search Central), landing almost
   exactly on the budget-raise date (08-17) and the sharp position jump
   (08-18: 18.6→10.8). This makes the 08-07..16 vs 08-17..21 before/after
   comparison above **confounded** — can't cleanly separate "budget
   raised" from "global spam update reshuffled rankings" using that short
   window alone. Separately, the earlier 08-01..13 unconfirmed volatility
   (the original "Google dance" theory this item started from) stays
   unconfirmed by Google's own status dashboard — third-party trackers
   disagreed on its severity even at the time (e.g. one composite tracker
   called it "a wobble, not a storm" for 08-12/13).
   The whole-history r=0.567 correlation (97 days, predates this one
   update) is NOT affected by this confound and remains the stronger
   piece of evidence. **Revised guidance for the 2026-09-06 check:** by
   then the spam update's effects should be fully settled (it completed
   08-21), so if US position/organic stays elevated well past that
   settling point, that's much cleaner evidence for the budget effect
   than the 08-23 same-day comparison was.
   **2026-08-23, later same day: direct ROI check run** (last 21 days,
   `_check_pinterest_roi.ts`) — Pinterest spend $107.33, proportionally-
   attributed revenue only ₪134.46 vs ₪321.79 spend in ILS = -₪187.34
   over 21 days; whole-site profit near breakeven (-₪5.83). Based on this,
   **Olga set the Pinterest daily budget to $5.5/day (down from $6.5)**
   — a deliberate mid-point between the $4.5 (low, pre-08-17) and $6.5
   (high, 08-17 to 08-22, confounded by the spam update) levels. This is
   now the baseline for the 2026-09-06 check above — compare US GSC
   position / GA4 organic at $5.5 against both prior periods once the
   spam update's effects are fully settled.
   **2026-08-23, Olga's own catch: a third candidate cause, connecting
   back to Open item #6.** `GSC_INDEX_SAMPLE` history shows estimated
   indexed pages rose from ~1000-1300 (~20-25%) in mid-July to ~1800-2240
   (~33-41%) by mid-August — a real multi-week trend (noisy per-day,
   ±7-8pp margin of error on a 150-URL sample, but the direction holds),
   driven by item #6's own canonicalization/lastmod work, not by anything
   external. Newly-indexed pages almost always start with weak positions
   (no accumulated authority yet), so adding several hundred of them to
   the indexed pool mechanically drags the site-wide *average* position
   down — no external Google volatility needed to explain at least part
   of the 08-11..17 dip. This doesn't rule out the spam-update or
   Pinterest-spend candidates, but is a more direct, evidence-grounded
   mechanism than "unconfirmed industry chatter" alone. **2026-09-06
   check should also look at whether indexed-page growth has leveled off
   by then** — if position stays depressed even after both the spam
   update settles AND indexed-count growth plateaus, that would point
   more toward the Pinterest-budget explanation; if position recovers
   in step with indexed-count leveling off, that favors this mechanism
   instead.
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
25. **Real bug found 2026-08-12: saving a detailed/colorful pattern can
    fail outright with a raw DynamoDB `ValidationException` ("Item size to
    update has exceeded the maximum allowed size") — affects real users
    too, not just scripts.**

    **Root cause:** `updatePattern()`/`savePattern()`
    (`web/src/lib/pattern-storage.ts`) only guard the *grid* field size
    (`rle.length > 350_000` throws a friendly custom error) before writing
    to DynamoDB. They never check the size of the **`thumbnail`** field,
    or the total item size — but `thumbnail` is a full base64 PNG data URI
    and is by far the biggest field in the item. DynamoDB's real hard
    limit is 400 KB (409,600 bytes) per item, so a pattern with a small
    grid can still blow the limit purely because of its thumbnail, and the
    failure surfaces as a raw unhandled AWS SDK exception with a stack
    trace — not a friendly message a real user would ever understand.

    **Concrete measured evidence** (pattern `c72e3387-6892-455e-870f-6f8304cbcfca`,
    "Black Cat with Magic Cauldron", saved from `TestImages/BlackCat.png`
    via `save-ai-draft.ts` into Olga's own account,
    ownerID/cid `0419f4ba-8c84-4bfe-a318-4cc90f7fd934`):
    - First save (68×71 stitches, 40 colors, line-art mode — a
      misclassification, see below) succeeded: **348,187 bytes total**,
      of which **`thumbnail` alone was 341,162 bytes (98%)**. `grid` was
      only 2,921 bytes, `palette` 3,831 bytes — nowhere near the 350 KB
      grid guard.
    - Re-save at the same ~68×71 scale but in (correct) illustration mode
      (67×69, 31→31 colors) **failed** — item size exceeded DynamoDB's
      real limit even though grid size was fine.
    - Re-save at 56×57 (31→30 colors) **also failed**, same error.
    - Re-save at 52×54 (31→29 colors) succeeded.
    - Re-save at 48×49 (27→25 colors) succeeded.
    So the real ceiling for this specific image's color complexity sits
    somewhere around 55-56 stitches wide — found only by manual trial and
    error shrinking `TARGET_WIDTH_OVERRIDE`, which is not a real fix and
    isn't available to a real user in the actual editor UI anyway. Olga
    noticed and flagged the resulting design as "too small"
    (`Уж больно маленький получился дизайн`) — that's a direct, real,
    user-visible symptom of this bug, not a separate complaint.

    **Why the thumbnail is so large:** `renderCoverThumbnailPng()`
    (`web/src/lib/server-cover-thumbnail.ts`) renders a full simulated-
    fabric preview — real Aida weave texture tiled under every cell, a
    drop shadow per stitch (alpha scaled by thread lightness, tuned
    2026-08-10), and fabric holes at every grid intersection, at up to
    ~1200px on the long side. All of that fine per-cell texture/shadow
    noise is exactly what makes a PNG compress badly — flat, simple
    illustrations still produce reasonably small files, but a busy,
    many-colored, detailed pattern (like this cat) does not, regardless of
    the underlying design's actual stitch count.

    **This is not just a script problem — real users are exposed too.**
    Confirmed by reading the real save API routes
    (`web/src/app/api/converter/patterns/route.ts` and
    `.../patterns/[id]/route.ts`): both accept `thumbnail` directly from
    the client request body and pass it straight into the same
    `savePattern()`/`updatePattern()` functions with the same inadequate
    guard. The client-side thumbnail is generated by
    `canvasHandle.current.capturePreview()` in `ConvertClient.tsx` — per
    `server-cover-thumbnail.ts`'s own file header, this server-side
    renderer was deliberately built "to produce the same look, not an
    approximation" as that exact client capture, meaning a real user
    saving a big, detailed, colorful pattern through the actual editor UI
    is likely at risk of hitting this exact same raw, confusing
    `ValidationException` failure, with no useful error message and no
    way for them to know why.

    **Not yet fixed — needs a considered fix, not a rushed one**, since
    `server-cover-thumbnail.ts` has a lot of deliberately-tuned visual
    behavior Olga cares about (shadow alpha per thread lightness, hole
    visibility — see that file's inline history comments) and is shared
    between this script's fallback path and (in spirit, via
    `capturePreview()`) the live editor's real save path. Real directions
    worth considering next session, not yet decided:
    - Add a real total-item-size guard (not just grid) that fails with a
      clear, friendly message *before* attempting the DynamoDB write, on
      both the client and server save paths.
    - Store the thumbnail in S3 (like source images already are) instead
      of inline in DynamoDB, and keep only a short S3 key/URL in the item
      — this sidesteps the 400 KB item limit entirely rather than fighting
      it, and 300+ KB of binary image data arguably doesn't belong inline
      in a DynamoDB item regardless of the size limit.
    - Separately, compressing the PNG harder or capping its resolution
      lower would help but doesn't fully solve it for a big enough/
      colorful enough design — likely worth doing anyway, but not a
      substitute for the item-size guard.

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

## Done when

- [ ] Pattern-save DynamoDB item-size bug fixed (thumbnail not size-guarded, real users exposed — see Open item #25)
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
