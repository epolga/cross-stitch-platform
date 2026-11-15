# Focus

Session-start guide — current goal, active work, and genuinely open items
only. Resolved narrative lives in `docs/session-log/2026-07.md`,
`docs/session-log/2026-08.md`, and `docs/session-log/2026-09.md`
(detailed history) and git log (what changed, when); a running one-line-ish
shipped changelog lives in `docs/session-log/SHIPPED.md`. Longer-term ideas
with no urgency live in `web/plan/Cross-Stitch.com — Nice-to-Have Ideas.md`.
Big-picture roadmap lives in `web/plan/Pinterest AI Agent — Milestones and
Roadmap.md` and `web/plan/Cross-Stitch.com — Site Technology Milestones.md`.
Split into these four files on 2026-07-26; archived again on 2026-08-03
(~510 lines), 2026-08-12 (~554 lines), 2026-09-03 (~660 lines), and
2026-09-07 (~520 lines, Shipped entries moved to `SHIPPED.md`) to stay
lean.

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

**Open check — GCP crawler User-Agent (set 2026-10-11):** rotating
Google Cloud crawler (`*.bc.googleusercontent.com`, GET+HEAD sweeps of
design pages; blocked `23.251.146.115`, `34.122.173.216`, earlier watched
`35.198.113.100`). Whether it is one actor is unverified. Next time such a
sweep is active, within 3 hours run `aws wafv2 get-sampled-requests` with
`--rule-metric-name BotControlCommonCount` (see `.claude/commands/review-ip.md`)
and read its User-Agent and `RuleNameWithinRuleGroup`. Then decide: switch a
Bot Control category to Block, add a custom rule, or do nothing. Delete this
paragraph if it stops showing up in the daily alert.

## Next session — pick up here first

Priority-ordered pointer list, written 2026-09-03, item 1 closed and
renumbered 2026-09-07 (was item #1, 09-02 spike); items 5 (Singapore GA4
anomaly, was Open item #3) and 10 (CloudWatch log gap, was Open item #15)
closed and renumbered 2026-09-08 — both root-caused and resolved, see
session-log. Full context for each lives in the matching Open item
below — this list only adds the first concrete step, not a restatement.

1. **`docs/srs/`** (the SRS doc set, built 2026-07-11 — a full requirements/
   test-plan spec for the site) — ask Olga directly whether she's read it
   yet (state once, don't nudge repeatedly). Yes → item 2.
2. **Automated test coverage — Open item #4.** No tests exist yet for
   `web/` beyond CI's build check; only after #1 is a yes. Start with the
   **PayPal webhook** per `09-Test-Plan.md` §4.2, priority order after that:
   auth/session → conversion algorithm → autopinner claim/pin logic →
   download-mode gating → Uploader publish sequence.
3. **Legacy IAM cruft — Open item #31.** Dead pre-EB-hosting-era IAM
   roles/policies found during the 2026-09-02 IAM allowlist audit,
   documented but nothing deleted. Just needs a yes/no from Olga — list
   already written in `docs/web/iam-legacy-amplify-cruft-2026-09.md`.
4. **Ownerless-pattern auth gap — Open item #32 remainder.** `GET`/`PUT`/
   `DELETE` on converter patterns only check ownership `if (pattern.ownerID)`
   — a row with no owner has no check at all. Verified dormant (all 14
   ownerless rows predate `sourceImageKey`; new rows always get an owner),
   so **only implement if Olga asks** — she deliberately deferred this
   2026-09-03 ("запиши на будущее"). Fix: in
   `web/src/app/api/converter/patterns/[id]/route.ts` (GET/PUT/DELETE) and
   `.../[id]/source-image/route.ts`, replace
   ```ts
   if (pattern.ownerID) {
     const session = await getSession(request);
     if (!session || session.userId !== pattern.ownerID)
       return NextResponse.json({ error: 'Access denied' }, { status: 403 });
   }
   ```
   with an unconditional check, all four spots.
5. **GSC indexed-rate re-checks — Open item #6.** Two pending comparisons:
   current indexed rate vs. the ~21-22% baseline after the Gap 3
   canonicalization fix, and vs. after the 2026-07-25 subject-blurb/lastmod
   changes. Also directly confirm in the GSC UI (not just the API) whether
   the original 2026-07-09 "Crawled – currently not indexed" Validate Fix
   ever actually passed — due 07-23, never explicitly confirmed.
6. **`EmailSendLog` end-to-end verification — Open item #9.** Built
   2026-07-26, first real exercise was the 2026-07-27 Announcement send
   (723 rows via `send-announcement`) — never verified it actually worked.
   Run `check-email-campaign.ts`/`check-email-recipient.ts` against that
   send's `eid`.
7. **DINOHash prototype — Open item #12.** Not started. Current dedup
   pipeline (SHA-256 exact-match + 64-bit dHash) has a confirmed
   false-positive mode (the "99 Names of Allah" series — same layout,
   different text, flagged as duplicates). First step: clone
   https://github.com/proteus-photos/dinohash-perceptual-hash and test it
   against the known pairs in `reports/duplicate-designs-visual.json`; only
   wire into the real pipeline if it actually distinguishes better than
   dHash.
8. **2026-07-27 Announcement send follow-up — Open item #13.** Sent to
    723/723, 0 errors, never checked since. Look at GA4 traffic to
    `/XStitch-Charts.aspx` and the `catalog_pattern_opens` event for a
    post-send bump, plus SES complaint/bounce rate for this batch.
9. **Design-vote "Previous vote: none" mystery — Open item #14.** A rare
    user-reported bug where a repeat vote doesn't register the prior
    choice. One real example (2026-08-08) checked clean (no bug); a second
    and third real example (2026-08-12, 2026-09-08) are permanently
    unreachable now (CloudWatch retention had already expired that data —
    root-caused and fixed forward 2026-09-08, see session-log). Don't
    remove the diagnostic `console.log`s in `design-likes.ts` yet — still
    no broad statistical confirmation either way.
10. **S3 archiving in `save-ai-draft.ts` — Open item #24.** 2026-08-11
    decision (always archive the source image to S3, admin-only) is
    explicitly "in effect at least through 2026-09-30" — not due before
    then, skip until that date.
11. **2026-09-26 — confirm the AI-tools-scan/Competitor-scan retry
    actually succeeds — Open item #10.** Both failed 2026-08-26 (Anthropic
    API credit balance too low); `SEND_DAY_OF_MONTH = 26` means both retry
    automatically on the 26th of each month. `pipelineAlert.ts` (added
    2026-09-03) now sends a Telegram alert on any pipeline-step failure, so
    a repeat failure should no longer go silent — but still worth
    explicitly checking CloudWatch/Telegram around that date to confirm an
    actual *success*, not just the absence of a visible failure.

**2026-09-06 checkpoint — ran, reviewed 2026-09-07, 2 real bugs found in
the checkpoint script itself and fixed (see session-log).** Item #27 got
its first real fair-groups data (+6.6pp, opposite direction from the old
confounded number); item #28 got its first real recrawl data (65%
indexed) after fixing a URL bug; item #7 got refreshed correlation data,
still inconclusive. The two watched IPs resolved (no action, watch
lapsed). **Still open**: item #26's GSC Validate Fix status (GSC-UI-only,
never automated) — still needs a manual look.

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

**Recently shipped** — running changelog, newest first:
`docs/session-log/SHIPPED.md`.

## Open items

4. **Automated test coverage** — `docs/srs/` built 2026-07-11, Olga hasn't
   read through it yet. CI exists for `web/` (build+Vitest). Next: build
   tests for the priority-1 area, `09-Test-Plan.md` §4.2 — start with the
   **PayPal webhook**, then auth/session → conversion algorithm → autopinner
   claim/pin logic → download-mode gating → Uploader publish sequence. Add a
   CI job for pinterest-agent/autopinner/Uploader once each gets its first
   real test.
6. **GSC indexed-rate re-checks** — two pending: after the Gap 3
   canonicalization fix (baseline ~21-22% avg, noisy) and after the
   2026-07-25 subject-blurb/lastmod changes (too early to attribute as of
   07-26). Also worth directly confirming in the GSC UI whether the
   original 2026-07-09 "Crawled – currently not indexed" Validate Fix
   actually passed (checkpoint was due 07-23, never explicitly confirmed).
7. **GSC average position decline (found 2026-08-12) — full write-up in
   `docs/web/gsc-indexing-investigation-2026-08.md` § 2, read that first.**
   Three non-exclusive candidate causes tracked there: Pinterest ad-spend
   halo effect, a confirmed Google spam update (2026-08-18 to 08-21), and
   mechanical drag from rising indexed-page-count (item #6's
   canonicalization work). Site-side causes (5xx rate, Googlebot errors,
   latency, deploys, Manual Actions/Security) already ruled out.
   **Latest data (2026-09-07)**: same-day spend/organic correlation
   r=0.513, lagged r≈0.46-0.47, ~29% organic-session drop after the ~56%
   spend cut. Still no firm conclusion — all three causes remain
   non-exclusive. Standing watch, no fixed next check-back date; re-run
   `_check_halo_effect.ts` whenever revisited.
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
10. **AI-tools-scan first real trigger — fired 2026-08-26 as scheduled,
    but failed.** Found 2026-09-03 checking real CloudWatch logs
    (`/aws/lambda/cross-stitch-daily-pipeline`): both AI-tools-scan and
    Competitor scan (same day, both call the Anthropic API) failed with
    "Your credit balance is too low to access the Anthropic API" — a
    real billing issue, not a code bug. Correctly logged via
    `console.error`, but **nothing surfaced it anywhere Olga would see**,
    so it went unnoticed for a week. No recurrence found since 08-26
    (checked through 09-03), so credits appear to have been topped up —
    but neither August monthly report actually went out. **Fixed the
    visibility gap same day**: new `src/services/pipelineAlert.ts`
    (`alertPipelineStepFailure()`) sends a Telegram alert — reuses the
    same already-working client `aiToolsScan.ts` uses on success, no new
    infra — wired into all 6 of `lambda/handler.ts`'s existing try/catch
    blocks (WAF sync, suspicious-IP detection, AI tools scan, Competitor
    scan, design pin map export, GSC report). Verified live end-to-end
    (real test Telegram message sent and received). **Committed and
    deployed 2026-09-03.** Next real scheduled trigger to actually confirm
    success: **2026-09-26**.
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
    `86.182.135.45`) **could not be checked** — same-day the CloudWatch
    log group appeared to have no data past ~11:17 UTC.
    A third real example (Olga forwarded 2026-09-08, DesignID 5470 "Cute
    Ghost with Mushroom Basket", `phoenixlyn@hotmail.com`,
    `78.146.25.70`, event at 2026-08-13T08:25:59Z) **also could not be
    checked — root-caused 2026-09-08: CloudWatch retention on this
    account's EB log groups is 7 days, so that ~27-day-old data was
    already permanently deleted by the time it was looked up**, not a
    live ingestion problem (likely explains the second example's
    unreachability too, though that can no longer be verified either
    way — full root-cause writeup in `docs/session-log/2026-09.md`).
    **Fixed forward-looking**: retention raised to 30 days on
    `cross-stitch-com-env-clone`'s log groups same day, negligible cost
    (~$0.0004/mo at current volume) — future examples need to be checked
    within that window, not whenever convenient. Bottom line: one clean
    real example, no broad statistical confirmation yet, and two more
    examples permanently unreachable. Do **not** remove the temporary
    diagnostic `console.log`s yet.

    (Separately, not part of this mystery: whether clicking the opposite
    arrow should "switch" the vote instead of "clearing" it was an open
    product question — resolved 2026-09-03, Olga confirmed "clears" is the
    intended design. See `docs/session-log/2026-09.md`.)
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
    **Still not checked as of 2026-09-07** — this is GSC-UI-only (not
    cleanly API-accessible for a one-off 6-URL set), the checkpoint digest
    flagged it as a manual step and it hasn't been done yet.

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
    **Checked 2026-09-07** (the checkpoint script itself was found to be
    re-running the old confounded comparison, not this real one — fixed,
    new script `_check_backfill_ab_test_groups.ts`): **Treatment (new AI
    text) 43.7% indexed (31/71) vs Control (old text) 37.0% (20/54),
    +6.6pp in favor of the new text** — opposite direction from the
    confounded number the checkpoint email showed. Caveat: only 54/150 and
    71/150 designIds resolved to URLs via the Pinterest pin map (doesn't
    cover the full catalog), so the real sample is smaller/noisier than
    the intended 150/150. **The revert step above is still not done.**

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
    **Checked 2026-09-07** — the checkpoint script itself had a bug
    (passed relative URLs to the GSC Inspection API, all 20 checks 403'd);
    fixed and reran: **13/20 (65%) already "Submitted and indexed"** as of
    their 08-24 crawl — much stronger than the general stale-page
    baseline. It worked. **Scale-up decision to more of the ~4702 pool is
    still not made.**

    **2026-09-03: a reminder is now scheduled** so this checkpoint cluster
    (items #7, #26, #27, #28, plus the two IPs watched the same day) isn't
    forgotten — Windows Scheduled Task `Checkpoint20260906` (one-shot,
    2026-09-06 09:00 local) emails a raw data digest (no verdicts) via
    `scripts/checkpoint-2026-09-06.ts`. GSC Validate Fix status (#26) isn't
    automated — flagged in the email as a manual check. Full detail:
    `docs/session-log/2026-09.md`.
31. **Legacy IAM cruft from the pre-EB Amplify hosting era** — found while
    checking the IAM-allowlist audit (`docs/session-log/2026-09.md`),
    documented, nothing deleted. Full list:
    `docs/web/iam-legacy-amplify-cruft-2026-09.md`. **Still needs Olga's
    explicit go-ahead before anything is deleted.**

32. **Ownerless-pattern auth gap** (source-image-key sharing/S3-orphans
    investigation itself is closed — see
    `docs/web/source-image-key-sharing-and-orphans-2026-09.md` and
    `docs/session-log/2026-09.md` — only this remnant is still open):
    `GET`/`PUT`/`DELETE`
    (`api/converter/patterns/[id]/route.ts`) and `source-image/route.ts`
    only check ownership `if (pattern.ownerID)` — a row with no owner has
    no check at all. Verified dormant (the 14 ownerless rows all predate
    the `sourceImageKey` field; `POST` always requires a session and sets
    `ownerID`, so no new ownerless row can appear). **Deliberately
    deferred, not fixed** — Olga's explicit "запиши на будущее"
    2026-09-03, not a live risk today.

33. **Homepage Google drop (from 2026-11-12) — thumbnails / image domain.**
    Fixes deployed 2026-11-14 (htmlLimitedBots, CloudFront `/robots.txt`);
    homepage impressions ~3500/day vs ~4500-5000 baseline, effect unproven.
    **Decision ~2026-11-22 to 11-25:** thumbnails not back in the SERP for
    `cross stitch patterns` (gl=us) -> move images to `img.cross-stitch.com`
    per `docs/plan/web/Image_Domain_Migration_Plan.md`. Deliberately NOT
    switching earlier (new image URLs = re-indexing, and it would mask
    which fix helped). Part A (ACM cert, alias, DNS) needs Olga's "да".

## Done when

- [x] IAM allowlist audited for other missing self-provisioning tables — done 2026-09-02, `SubscriptionEvents` found+fixed (see `docs/session-log/2026-09.md`)
- [ ] Legacy pre-EB Amplify-era IAM cruft cleaned up or explicitly deferred — full list in `docs/web/iam-legacy-amplify-cruft-2026-09.md`, nothing deleted yet, needs Olga's go-ahead
- [x] Pattern-save DynamoDB item-size bug fixed — thumbnail moved to S3, all 113 legacy rows backfilled, deployed and verified live 2026-09-03 (see `docs/web/pattern-save-item-size-bug-2026-08.md`)
- [ ] GSC "Duplicate without user-selected canonical" cleanup validated — re-check ~2026-09-06, Validate Fix clicked 2026-08-23 (see Open item #26)
- [x] Backfill-vs-control A/B test checked — 2026-09-07, fair-groups result +6.6pp favoring new AI text (see Open item #27) — [ ] revert control group's 150 designs back to new AI text still not done
- [x] Caption-rename recrawl-trigger batch checked — 2026-09-07, 65% indexed, worked (see Open item #28) — [ ] scale-up decision to more of the pool still not made
- [x] Blog teaser email sent (confirmed by Olga 2026-08-05, exact date not recorded)
- [x] Distributed scraping mitigation decision made — AWS WAF Bot Control (Common, Count mode) enabled 2026-08-13 (see `docs/session-log/2026-08.md`) — [x] reviewed 2026-09-03 with real 22-day data, decided against a wholesale category flip (SignalNonBrowserUserAgent confirmed genuinely mixed with wanted crawlers); shipped a narrow BlockSeoCrawlerUserAgents rule (AhrefsBot/Sogou) instead, verified live (see `docs/session-log/2026-09.md`)
- [x] Thank-you reply sent to Leisa (see `docs/session-log/2026-09.md`)
- [ ] Olga has read through the `docs/srs/` documentation set
- [ ] Automated tests built for the priority-1 area (`09-Test-Plan.md` §4.2, starting with PayPal webhook)
- [ ] GSC indexed-rate re-checked after Gap 3 canonicalization and after subject-blurb/lastmod changes
- [ ] GSC average position — data refreshed 2026-09-07 (r=0.513 same-day, see Open item #7), still inconclusive; Pinterest-spend correlation remains a candidate cause alongside the original "Google dance" theory, need more data to separate the two
- [x] Newsletter follow-up metrics checked (07-27: healthy — see Open item #8) — [ ] Announcement email follow-up unverifiable, exact send date unknown
- [ ] `EmailSendLog` exercised by a real send and verified end-to-end
- [x] First real AI-tools-scan trigger observed (2026-08-26) — fired but failed (Anthropic API credit balance), found 2026-09-03; failure-alerting added same day (see Open item #10) — [ ] next real trigger (2026-09-26) to confirm an actual success
- [x] Photo converter's DMC color matching: public "Thread color accuracy" picker shipped 08-03, `cie76` stays the default
- [ ] DINOHash prototyped against known duplicate-designs test pairs, then wired into the real pipeline if it resolves the dHash false-positive mode
- [ ] Revisit unconditional S3 archiving in `save-ai-draft.ts` by 2026-09-30 (see Open item #24) — keep as-is or scope back to `GenerationMeta`-only runs
- [ ] 2026-07-27 Announcement send follow-up metrics checked (GA4 + SES, see Open item #13)
- [ ] Design-vote "Previous vote: none" — one real example (08-08) checked clean, but no broad statistical confirmation yet and a second example (08-12) is currently unreachable due to the CloudWatch gap (see Open item #14) — keep diagnostic logging in place
- [ ] CloudWatch log ingestion for `cross-stitch-com-env-clone` fixed/confirmed working again — both the `FilterLogEvents` issue AND a total gap since ~11:17 UTC 2026-08-12 (see Open item #15)
- [x] Track 2 grounding-gate fix confirmed against a real `detectTrend()` run (see `docs/genai-growth/PROGRESS.md`)
- [x] Track 2 `search_catalog` dedup tool confirmed against a real `detectTrend()` run (see `docs/genai-growth/PROGRESS.md`)
- [x] Transparent-PNG black-background fix (`pattern-converter.ts`) deployed to the live site (see `docs/genai-growth/PROGRESS.md`)
- [x] `/photo-to-cross-stitch` + `/api/convert*` CPU-saturation root cause fixed — worker threads + CPU-based Auto Scaling deployed, confirmed live 2026-09-03 (found 2026-09-01, caused a real ~60% GA4 session drop on 08-31 — see `docs/web/photo-converter-cpu-saturation-2026-09.md`) — [ ] optional hardening (concurrency limit, algorithmic cost reduction, background queue) still undone
- [x] `newPattern()` image-key reset bug fixed, committed, and deployed 2026-09-03 (see `docs/web/source-image-key-sharing-and-orphans-2026-09.md`)
- [x] Delete-time S3 cleanup (Track A) shipped 2026-09-03, unconditional — thumbnail/sourceImageKey/researchImageKey/sourceImageMaskKey all deleted alongside the pattern (see `docs/web/source-image-key-sharing-and-orphans-2026-09.md`)
- [x] Existing S3 orphan backlog cleared (Track B) 2026-09-03 via real cross-reference (not age-based) — 697 objects deleted, ~457 MiB, 0 failures (see `docs/web/source-image-key-sharing-and-orphans-2026-09.md`)
- [x] S3 orphan leak closed at the source (Track D) 2026-09-03 — upload deferred from convert-time to Save-time (new api/converter/upload-source-photo/route.ts), verified an unsaved conversion no longer touches S3 (see `docs/web/source-image-key-sharing-and-orphans-2026-09.md`)
- [ ] Ownerless-pattern auth gap in patterns/source-image routes fixed — deliberately deferred 2026-09-03, currently dormant/not exploitable (see Open item #32)
