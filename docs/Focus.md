# Focus

## Current goal

Newsletter relaunch: send the "You spoke, I listened" changelog/thank-you email
to recently-active subscribers, then follow up with the Ann-persona blog teaser.

## Active work

Nothing in flight. Everything below is built, built and deployed, or drafted and
waiting on Olga to trigger the actual send from the Uploader (Claude does not
send mass emails without an explicit go-ahead per send).

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
   `docs/session-log/2026-07.md`). 6 IPs were watched/blocked 2026-07-10
   (`45.127.44.48`, `199.38.125.98`, `74.7.227.179`, `99.107.137.100`,
   `5.29.18.71`, `186.151.100.235` watched; `62.60.130.210` blocked) —
   **re-review via `/review-ip` around 2026-07-13** (watch TTL expiry) and
   decide block vs. release. Also reconsider whether "keep monitoring"
   still holds given the pattern was growing (755 IPs/25min vs. 563/30min
   baseline) as of 2026-07-10.
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
9. **AdSense revenue drop after Pinterest cutoff — check back 2026-07-14.**
   Pinterest ad spend hit $0 on 2026-07-11 (Olga's deliberate decision,
   confirmed executed). Revenue/traffic dropped sharply the same day; full
   analysis and the two-branch action plan (stabilizes vs. keeps
   declining) is in `docs/plan/web/AdSense Revenue Drop - Pinterest Cutoff
   Analysis.md`. **Note the confound below (#10) overlaps this window.**

   **Update 2026-07-12 (2 days of post-cutoff data + corrected ROI window):**
   - US Organic Search (unpaid) still suppressed both days: ~52/day
     pre-cutoff baseline → 43 (07-11) → ~40 full-day-equivalent pace
     (07-12, partial day). Not recovering yet.
   - AdSense revenue still trending down, not flattening: $16.93 (07-10)
     → $10.65 (07-11) → ~$4-5 full-day-equivalent pace (07-12, partial).
   - **ROI figure correction:** the -₪315/29-day estimate in the analysis
     doc mixed the pre-06-19 higher-spend period (~$11-12/day) with the
     reduced-spend period. Re-run over the correct 21-day window
     (2026-06-20 → 2026-07-11, matching when spend actually dropped to
     ~$5/day) via `_check_pinterest_roi.ts` (edited in place, day offset
     29→21, untracked scratch file) shows: **total site profit was
     +₪91.36** over those 21 days (spend already netted out), while the
     rough Pinterest-only attribution estimate was -₪149.62 — a real but
     much smaller loss than -₪315 implied, and a conservative estimate
     (assumes Pinterest sessions monetize at the average rate, gives no
     credit for any halo effect).
   - **Recommendation: restart Pinterest ads at ~$5/day (the already-
     tested reduced rate, not the original ~$11-12/day), run 4-5 days,
     then re-check** `_check_channel_country.ts` (did US Organic Search
     recover to ~52/day?) and `_check_pinterest_roi.ts` 21-day window (is
     total site profit still positive?). Cheap to test (~$20-25) and
     fully reversible. If both hold, keep it running; if not, this
     confirms the cutoff was right and the dip needs a different
     explanation (GSC/technical, per the analysis doc's fallback branch).
     **Actioned 2026-07-12: Olga restarted the Pinterest campaign.**
     Next: re-check `_check_channel_country.ts` and `_check_pinterest_roi.ts`
     around 2026-07-16/17 (4-5 days after restart) for US Organic Search
     recovery and site profit.
10. **AutoPinner config-path fix is a stopgap, not durable (2026-07-12).**
    Fixed the ~48h organic-pinning outage (2026-07-10 08:17 → 07-12) by
    recreating `D:\ann\Git\cross-stitch-platform-docs` as a directory
    junction to `docs/`. This works but is fragile (lost on a fresh
    clone/machine). Durable fix: update
    `shared/src/CrossStitch.Shared/PlatformConfig.cs`
    (`LocateConfigFile()`) to look for `docs/platform-config.json` inside
    the monorepo directly instead of a sibling `cross-stitch-platform-docs`
    repo. Also worth migrating the still-external secrets
    (`D:\ann\Git\Uploader\secrets\pinterest_tokens.json`,
    `pin-ab-stats.json`) into the monorepo's `uploader/` folder while
    touching this, so nothing depends on paths outside
    `cross-stitch-platform` at all.
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
      table + TTL on first use).
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

    **Follow-up (not yet done):** run `aws dynamodb describe-table` (or
    check the Console) for all six to confirm real table names (env-var
    overrides may differ from the code defaults) and key schema match
    the code; check EB env vars for overrides; then add a §4.x section
    for each to `docs/integration/dynamodb-schema.md`, following the
    existing `PasswordResetTokens`/`SubscriptionEvents` pattern.
    Prioritize the two non-self-provisioning tables first.

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
- [ ] AdSense/traffic follow-up after Pinterest cutoff resolved (see Pending #9, due 2026-07-14)
