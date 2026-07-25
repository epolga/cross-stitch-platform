# Focus

## Current goal

Newsletter relaunch: send the "You spoke, I listened" changelog/thank-you email
to recently-active subscribers, then follow up with the Ann-persona blog teaser.

## Active work

Design-spotlight newsletter ("Lady of Perpetual Love") sent 2026-07-24 —
841/841, see Pending #18 (one complaint handled, SES suppression added,
message-id logging added for next time). The **Announcement email**
("You spoke, I listened") is still separately pending (#1) — not sent yet,
waiting on Olga to trigger it from the Uploader (Claude does not send mass
emails without an explicit go-ahead per send). Download-count tracking (3
tiers, Pending #17) is live so whenever the Announcement send happens, its
newsletter-attributed downloads will be captured.

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

1. **Send the Announcement email** — open Uploader → "Reload Email Template"
   → "Test Announcement Email" to admin first → review → "Send Announcement
   Emails". Not sent yet, waiting on Olga.
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
11. **DynamoDB schema doc gap — 6 entities not yet in the formal contract
    (found 2026-07-12).** `docs/srs/01-SRS-Website.md` §5 flags that
    `docs/integration/dynamodb-schema.md` only formally covers
    `CrossStitchItems`, `CrossStitchUsers`, `PasswordResetTokens`,
    `SubscriptionEvents` — six newer entities exist in code but aren't
    confirmed against the live DynamoDB console or documented as an
    authoritative contract. Identified via code (table names are env-var
    overridable, so these are defaults, not confirmed-live):
    - Saved editor patterns — `ConverterPatterns` (`pattern-storage.ts`),
      PK `patternId`, GSI `ownerID-index`. **Self-provisions** (creates
      table + TTL on first use). Fields: `ownerID` (session userId),
      `name`, `width`/`height`, `palette` (JSON `PatternPalette[]` — DMC
      number/name/RGB/symbol/stitchCount), `grid` (RLE-compressed, capped
      at 350KB compressed), `hiddenColors` (optional, JSON `number[]`),
      `thumbnail` (optional, client-generated JPEG data-URL), `createdAt`
      and `modifiedAt` (ISO-8601). **`createdAt`/`modifiedAt` split — FIXED
      2026-07-25:** `createdAt` was misleading — `updatePattern()` used to
      overwrite it on every resave (full `PutItemCommand`), so the "Open"
      list's sort was really "last modified," not true creation date.
      `updatePattern()` now does a partial `UpdateItemCommand` that never
      touches `createdAt`, plus a new `modifiedAt` field that *does* update
      on every save and is what the UI actually sorts/displays by
      (`OpenPatternDialog.tsx`, `ProfilePatternsPageClient.tsx`) — matches
      the behavior users already expected, just under the correct field
      now. Pre-fix rows fall back to `createdAt` for `modifiedAt` until
      next resave. Vitest clean (10/10 files, 61/61 tests), typecheck clean
      on every changed file, and full `npm run build` completed clean
      (exit 0, `/photo-to-cross-stitch` and `/profile/patterns` both built
      fine). **Deployed 2026-07-25** via `eb deploy cross-stitch-com-env-clone`
      — deploy itself completed successfully, live smoke-checked (`/` and
      `/api/health` both 200). **Notes for the future:**
      - The 350KB compressed-grid cap is the only overflow guard; large
        low-repetition patterns (poor RLE compression) can hit it sooner
        than the grid dimensions alone would suggest.
      - `expiresAt` TTL is **disabled** on the table and no code path
        writes that attribute either — saved drafts never actually expire
        (see Pending #11's dynamodb-schema.md §4.9 for the full TTL gap
        writeup — deliberately not fixed yet, separate from the
        createdAt/modifiedAt split above).
    - Design likes/votes — `CrossStitchLikes` (`design-likes.ts`), PK
      `PK`=`DESIGN#<id>` / SK `SK`=`USER#<email>`, GSI `GSI1`. **Does
      NOT self-provision** — must already exist manually in AWS.
    - Feature requests — `FeatureRequests` (`feature-requests.ts`), PK
      `id`. Self-provisions.
    - Blog reactions — `CrossStitchBlogReactions` (`blog-reactions.ts`),
      PK `slug`. Self-provisions.
    - Editor analytics events — `EditorEvents` (`editor-events.ts`), PK
      `id`, GSI `date-eventType-index`. Self-provisions.
    - Search query logs — `SearchQueries` (`search-log.ts`), PK `date` /
      SK `ts`, 90-day TTL. **Does NOT self-provision** and silently
      swallows write errors if the table is missing.

    **Risk:** the two non-self-provisioning tables (`CrossStitchLikes`,
    `SearchQueries`) can silently drift from what the code assumes —
    same class of problem as the already-documented six-spelling
    `PinID` drift on `CrossStitchItems`.

    **Follow-up — DONE, 2026-07-25 (live-verified + documented, one real bug
    found).** Ran `aws dynamodb describe-table`/`describe-time-to-live` for
    all six and checked the EB environment's env vars for name overrides:
    all six use their code-default names live (only `DDB_SEARCH_QUERIES_TABLE`
    is explicitly set, to the same value as the default — not a real
    override), all six `ACTIVE`, key schemas match code exactly. §4.9-4.14
    added to `docs/integration/dynamodb-schema.md` with full attribute
    tables, following the `PasswordResetTokens`/`SubscriptionEvents` pattern.

    **Real bug found along the way, not just a doc gap:** three tables
    (`ConverterPatterns`, `EditorEvents`, `SearchQueries`) write a
    TTL-intended epoch attribute (`expiresAt`/`ttl`) on every item expecting
    DynamoDB to auto-expire old rows — but **DynamoDB TTL is `DISABLED`** on
    all three live tables today, so nothing ever actually expires.
    `EditorEvents` is the most consequential: **8,221 items and growing**
    (90-day TTL intended, never applied) — `SearchQueries` similarly
    (2,084 items). `ConverterPatterns` (23 items) has a second, independent
    gap on top: even where the code *tries* to enable TTL (only on
    first-ever table creation), no code path ever writes the `expiresAt`
    attribute at all. Root cause for `EditorEvents`/`SearchQueries`: no code
    anywhere calls `UpdateTimeToLiveCommand` for either table. Fix is
    infra-only, no code change needed — a one-off
    `aws dynamodb update-time-to-live --table-name <T> --time-to-live-specification "Enabled=true,AttributeName=<attr>"`
    per table. **Fixed 2026-07-25** — ran
    `aws dynamodb update-time-to-live` for `EditorEvents` and `SearchQueries`
    (attribute `ttl` on both), confirmed `TimeToLiveStatus: ENABLED` on
    both immediately after. DynamoDB's TTL sweep isn't instant (expired
    items typically clear within ~48h of the item's `ttl` timestamp
    passing, per AWS docs) — no need to check back sooner than that.
    `ConverterPatterns` is **not fixed** — its gap is different (code never
    writes `expiresAt` at all, so there's no attribute for TTL to act on
    yet); fixing it needs a code change (write `expiresAt` in `savePattern`/
    `updatePattern`), not just an infra toggle — left as a separate,
    lower-priority follow-up (only 23 items, not urgent).
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
    - **Gap 3 — near-duplicate designs, fix by canonicalizing — BUILT AND
      APPLIED 2026-07-25.** Ties to the previously-deferred near-duplicate-
      design-images issue (e.g. two near-identical Tiger designs, deferred
      as "not a script bug, just cleanup"). Decided approach: rather than
      cleanup/removal, set a canonical tag on the duplicate(s) pointing to
      the primary design so Google's domain-level quality classifier
      doesn't count them as counter-evidence against the rest of the
      catalog's genuine uniqueness.

      **Mechanism built:** new `CanonicalDesignId` (N, optional) attribute
      on the DESIGN row — `web/src/app/types/design.ts` (`Design` interface),
      read in `web/src/lib/data-access.ts`'s cache-load mapping. `web/src/app/
      designs/[designId]/page.tsx`'s `generateMetadata` now looks it up: if
      set, fetches the target design via `getDesignById` and points
      `alternates.canonical`/`openGraph.url` at *that* design's URL instead
      of its own — `robots` stays `index, follow` (standard canonical
      practice, not deindexing). The page's own Pinterest-share/JSON-LD
      logic still references its own image/URL, unaffected — only the SEO
      canonical target changes. Vitest (61/61) and full `npm run build`
      both clean after the change.

      **Duplicate detection, done in two passes because the first pass
      alone wasn't trustworthy enough to act on:**
      1. `find-duplicate-designs.ts` (built 2026-07-19, run then, not
         previously surfaced here) — metadata-candidate pass, groups by
         (Caption, AlbumID, Width, Height, NColors). Found **101 candidate
         groups / 219 designs**. Documented in its own header as
         producing false positives.
      2. `verify-duplicate-designs-visual.ts` (built 2026-07-25) — visual
         confirmation pass. Computes SHA-256 of each design's actual photo
         (byte-identical = zero-false-positive-risk "confirmed-duplicate")
         plus a dHash perceptual-hash Hamming distance (weaker signal,
         "worth-a-look" only, never auto-applied). **Concretely confirmed
         false positive during this pass:** the "99 Names of Allah" group
         (8 designs, same border/font/layout template) — visually inspected
         two of its images directly and confirmed they list *different*
         Arabic names, a real series, not a duplicate — despite dHash
         landing in the same distance range as true duplicates. This is
         why dHash alone was deliberately never treated as sufficient to
         act on.

      **Result — byte-identical pass:** of the 101 candidate groups, **39
      groups (43 designs)** were byte-identical confirmed duplicates,
      applied via `apply-confirmed-canonicals.ts --apply`. **Result —
      manual visual pass (2026-07-25, same session):** Olga reviewed the
      remaining 22 "worth-a-look" groups design-by-design (real page
      screenshots, not just dHash numbers) — **15 more groups (16 designs)
      confirmed as genuine duplicates** (same photo, different crop/
      compression — Peacock ×2, Soccer Ball, Pumpkin, Hummingbird, Pigeon,
      Tulips, Lady, Mushrooms, Owl, Conwy Castle, Lips, Butterfly, Horse,
      Pelican, Butterflies) and applied via `set-canonical-design.ts`.
      **Total: 59 designs across 54 groups now canonicalized.**

      **Explicitly deferred, not touched — a distinct case worth a separate
      decision later, not a "we'll get to it":** "99 Names of Allah" (8
      designs, confirmed genuinely different — same template, different
      Arabic names each), "Cushion Cover" ×2 pairs, "Cat" ×2 pairs,
      "Sunflower" — same-template/different-content false positives, plus
      **Whale** and **Wolf** — a new pattern found this pass: same photo/
      pose, deliberately different **color variant** (re-colored, not
      re-cropped) — Olga wants to find a way to "explain to Google" these
      are genuinely different pictures (not canonicalize them away) rather
      than the same fix as the true duplicates. Full pair-level detail
      (including exact page URLs) in `automation/pinterest-agent/
      reports/duplicate-designs.json` / `reports/duplicate-designs-visual.json`
      and `docs/session-log/2026-07.md`. New reusable tools (all in
      `automation/pinterest-agent/scripts/`): `find-duplicate-designs.ts`,
      `verify-duplicate-designs-visual.ts`, `apply-confirmed-canonicals.ts`
      (batch, union-find clustering), `set-canonical-design.ts` (one-off,
      also supports `--clear`).

      **DEPLOYED 2026-07-25** (`eb deploy cross-stitch-com-env-clone`,
      Health: Green) — confirmed live: `/designs/5422` serves
      `<link rel="canonical" href=".../Tiger-37-309-Free-Design.aspx">`
      (pointing at design 5421). **Not yet done:** decide + implement the
      "explain to Google these are different" approach for the
      Whale/Wolf-style color-variant case, and the template-series case
      (99 Names of Allah etc.) — separate follow-up, not urgent.

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
    (~1h45m), starting before the createdAt/modifiedAt deploy — RESOLVED on
    its own, self-recovered to Green. Root cause of the *initial* 04:22
    trigger still not identified.** `environment-health.log` shows Severe/
    Degraded/Warning cycling from **04:22 UTC** (before `eb deploy` even
    started at 05:20:55 — today's deploy landed on an already-unhealthy-
    per-EB-status environment, didn't cause it) through to a real recovery
    at **06:07:53 UTC** (`"status":"Ok","causes":[]`), confirmed independently
    via `describe-environment-health` and `eb status` both reading Green
    afterward.

    **Wrong turn worth flagging:** initially theorized this was a "low
    real traffic" statistical artifact (EB's own `RequestCount`/`r/sec`
    read 0 throughout) — **Olga correctly pushed back**. Checked GA4 for the
    same hour (04:00-05:00 UTC): 13 sessions, 47 pageviews — real traffic
    was there. Also confirmed `cross-stitch.com`'s DNS A-records resolve to
    the exact same two IPs seen in this environment's ALB access-log
    filenames — this **is** the real production-facing load balancer, not
    some idle secondary. So "low traffic" was never the explanation; EB's
    own `RequestCount` metric is simply unreliable/disconnected from
    reality (it still reads 0 even now, in the confirmed-Green state) —
    don't trust that field for anything.

    **What actually happened, evidenced:** a real, small, fluctuating 5xx
    error rate (specific percentages seen in the log: 2.6%, 1.1%-class
    figures) that started at 04:22 and gradually settled over ~1h45m —
    nothing deploy-shaped (no code/infra change from us at that time). Two
    `restart-app-server`/deploy-triggered blips (05:21 deploy, 05:45 my own
    restart-app-server attempt) each added a fresh short 5xx spike into the
    same rolling window, visibly *extending* the cycle rather than fixing
    it — confirmed by checking `environment-health.log` immediately after
    each action. **Lesson: don't restart/redeploy to "fix" a Red status
    without evidence restarting addresses the actual cause** — it can reset
    the recovery clock instead. Confirmed via a same-day comparison (07-24
    had a similar brief Yellow/Warning blip at 04:53-04:58 that self-cleared
    in ~5 minutes on its own) that this system normally self-heals fast;
    today's unusually long ~1h45m stuck-Red duration is itself something
    worth remembering if it recurs. **Not yet done:** identify what actually
    caused the original 04:22 UTC 5xx uptick (no deploy, no code change
    found at that time) — currently unexplained, though moot for right now
    since it fully resolved and current state is confirmed healthy. Don't
    panic on a bare "Red" from `eb status` alone next time — cross-check
    `aws elbv2 describe-target-health`, real ALB access logs, and GA4/DNS
    before assuming a deploy broke something or reaching for a restart.

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
- [ ] Decide "explain to Google" approach for color-variant (Whale/Wolf) and template-series (99 Names of Allah etc.) cases
- [x] 3-tier download-count tracking (total/logged-in/newsletter) built, deployed, Health Green — 2026-07-24
- [x] Download-count feature's 4 changed files committed — 2026-07-24 (`f64bf7c`)
- [ ] Tonight's Announcement-email numbers checked (newsletter-attributed downloads + email-in-body auth decision, see Pending #17)
- [x] First design-spotlight newsletter sent via `send-newsletter` — 841/841, 2026-07-24 (see Pending #18)
- [ ] Follow-up check on that send (GA4 clicks, LastEmailEntry, SES bounce/complaint rate — see Pending #18)
- [x] ConverterPatterns createdAt/modifiedAt split built, tested, deployed — 2026-07-25 (see Pending #11)
- [x] `eb health` Red status (04:22-06:07 UTC) self-resolved, confirmed Green — 2026-07-25
- [ ] Original 04:22 UTC trigger for that Red status identified (see Pending #19) — moot for now, but unexplained
