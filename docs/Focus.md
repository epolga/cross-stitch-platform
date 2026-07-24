# Focus

## Current goal

Newsletter relaunch: send the "You spoke, I listened" changelog/thank-you email
to recently-active subscribers, then follow up with the Ann-persona blog teaser.

## Active work

Olga plans to send the Announcement email tonight (2026-07-24). Download-count
tracking (3 tiers, see Pending #17) shipped and verified live specifically so
this send's newsletter-attributed downloads get captured — check the numbers
afterward. Everything else below is built, built and deployed, or drafted and
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
9. **AdSense revenue drop after Pinterest cutoff — RESOLVED 2026-07-24.**
   Pinterest ad spend hit $0 on 2026-07-11, restarted at ~$5/day on
   2026-07-12. The planned 2026-07-16/17 re-check was overdue and never
   recorded — caught while auditing Focus.md for stale items. Fresh check
   confirms it worked: US Organic Search fully recovered (49-62/day vs.
   ~52/day baseline), 22-day Pinterest ROI window shows total site profit
   **+₪103.17** (Pinterest-only rough attribution -₪144.53, same
   conservative-estimate caveat as the original check, not worse). Decision
   confirmed: keep running at ~$5/day, no further action. Full numbers and
   arc in `docs/session-log/2026-07.md` ("AdSense/Pinterest cutoff —
   resolved 2026-07-24") and `docs/plan/web/AdSense Revenue Drop - Pinterest
   Cutoff Analysis.md`.
10. **AutoPinner config-path fix — DONE, durable, 2026-07-24.** Originally
    fixed the ~48h organic-pinning outage (2026-07-10 08:17 → 07-12) with a
    fragile stopgap (a `D:\ann\Git\cross-stitch-platform-docs` directory
    junction to `docs/`, lost on a fresh clone/machine — and in fact found
    missing again 2026-07-24). Durable fix landed while building
    `UploaderCli` (see #17): `PlatformConfig.LocateConfigFile()` in
    `shared/src/CrossStitch.Shared/PlatformConfig.cs` now walks up looking
    for a `docs/platform-config.json` **inside this monorepo** instead of a
    sibling `cross-stitch-platform-docs` repo — verified working with no
    env var or junction needed, for any of the three real consumers
    (`Uploader.exe`, `UploaderCli`, `AutoPinner`, all of which call this via
    `HelperFactory`/`PinterestUploader`). `docs/platform-config.json`'s
    three paths updated to their real current locations, both confirmed
    correct by Olga: `pinterestTokenPath` → `automation/pinterest-agent/
    pinterest_tokens.json` (was already inside the monorepo, just not under
    `uploader/` as originally guessed), `albumBoardsCsvPath` →
    `docs/data/AlbumBoards.csv`. `pinAbStatsPath` →
    `automation/pinterest-agent/pin-ab-stats.json` — this one didn't exist
    yet at the new location (only at the old external
    `D:\ann\Git\Uploader_remove\secrets\pin-ab-stats.json`), so copied it
    over and added `pin-ab-stats.json` to the root `.gitignore` (wasn't
    covered by any existing pattern, unlike `*_tokens.json`). Nothing left
    depends on paths outside `cross-stitch-platform`.
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
      (ISO-8601). **Notes for the future:**
      - `createdAt` is misleading — `updatePattern()` overwrites it on
        every resave, so the "Open" list's sort-by-`createdAt` is really
        "last modified," not true creation date. No separate `updatedAt`
        exists; if a real creation date is ever needed, nothing captures
        it today.
      - The 350KB compressed-grid cap is the only overflow guard; large
        low-repetition patterns (poor RLE compression) can hit it sooner
        than the grid dimensions alone would suggest.
      - `expiresAt` TTL is enabled on the table but no code path writes
        that attribute — saved drafts never actually expire despite TTL
        being configured.
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
    - **Gap 3 — near-duplicate designs, fix by canonicalizing.** Ties to the
      previously-deferred near-duplicate-design-images issue (e.g. two
      near-identical Tiger designs, deferred as "not a script bug, just
      cleanup"). Decided approach: rather than just cleanup/removal, set a
      canonical tag on the duplicate(s) pointing to the primary design so
      Google's domain-level quality classifier doesn't count them as
      counter-evidence against the rest of the catalog's genuine
      uniqueness.

14. **GSC indexed-rate tracking deployed to the daily Lambda pipeline —
    2026-07-19, verified working.** Fixed `gsc-report.ts`'s indexed-rate
    calculation (old Sitemaps API field always read 0) with a real sampled
    estimate via the URL Inspection API, persisted to DDB, wired into the
    Lambda pipeline. First scheduled run verified clean in CloudWatch Logs:
    19.3% ± 6.3pp indexed, consistent with the GSC UI's 18.3%. Only one
    dated row existed as of 07-19 (tracking just started) — **check back
    for a real multi-point trend** (now checkable via `gsc-explore.ts`).
    Full detail: `docs/session-log/2026-07.md`.

15. **Editor report added to Telegram; anomaly-alert "missing email"
    concern resolved as a non-issue — 2026-07-19, deployed.** Full detail:
    `docs/session-log/2026-07.md`.

16. **GSC average position softened ~11-12 → 16-17 starting 2026-07-22/23 —
    check back ~2026-08-07.** Olga flagged it from watching GSC directly
    multiple times/day; confirmed via API this isn't just the usual
    last-2-days processing-lag artifact (07-23 held at 17.3 even as more
    data arrived, didn't correct back down). Ruled out as causes: web/
    deploys (none in the window), GA4 traffic (flat 07-21/22/23: 286/315/308
    sessions), AdSense impressions/clicks (normal on 07-23), Manual Actions
    and Security Issues (both clean, checked in GSC UI directly). The
    same-day AdSense revenue dip (07-23, $14.36 vs typical $15-25) was
    RPM/CPC-driven ($10.75/$0.44), not traffic-driven — treated as a
    separate, likely unrelated phenomenon (see the mid-June position-jump
    memory: RPM and position are independent on this site). Leading
    hypothesis (not confirmed): Google announced 2026-07-09 that small core
    updates now roll continuously without public announcement, and 3rd-party
    SERP trackers show elevated volatility most weeks since Jan 2026 —
    fits, but isn't proven specific to this site. **Plan: don't react with
    content/structural changes; check back ~2026-08-07 — reverted to 11-13
    means it was noise, still 16+ means treat as a real sustained loss and
    investigate content/E-E-A-T/competitors next.** The one-off `_check_*.ts`
    scripts from this investigation were generalized into three committed,
    parameterized tools — `gsc-explore.ts`, `gsc-compare.ts`, `ga4-explore.ts`
    in `automation/pinterest-agent/scripts/`, documented in that folder's new
    `README.md` (includes the recommended investigation order for a future
    ranking/revenue dip). AdSense has no hour-level API dimension — don't
    try to build that again, see the README's "Not built" section.

17. **Download-count tracking (3 tiers) — built and deployed 2026-07-24,
    ahead of tonight's Announcement-email send.** Goal: measure how many
    downloads come specifically from tonight's newsletter click-throughs, to
    calibrate a future free-tier download limit. Found the first tier
    (per-design public `NDownloaded`) and a second tier (per-logged-in-user
    lifetime total, `TotalDownloadsCount`/`LastDownloadAt` in `users.ts`)
    already written but sitting **uncommitted and undeployed** from an
    earlier, undocumented session — verified the code was sound, then added
    the third tier and shipped all of it:
    - **Verified first:** newsletter links carry `eid`/`cid` query params,
      and `AuthControl.tsx`'s `AutoLogin` already auto-logs-in on page load
      via `/api/auth/login-from-email` (checks `cid` against
      `getVerifiedUserByCid`) — confirmed this is genuinely automatic, no
      user action needed, before relying on it.
    - **Gap found:** the existing lifetime counter (`incrementUserDownloadCount`)
      had no way to isolate "downloads from tonight's send" — it's a
      lifetime total that would mix in any logged-in user's download from
      any day/source.
    - **Built:** `AuthControl.tsx` now sets `sessionStorage.cameFromNewsletter
      = 'true'` whenever `eid`+`cid` are present in the URL, regardless of
      prior login state (the auto-login network call itself only fires when
      not already logged in, but the newsletter-origin marker needs to apply
      either way). `DownloadPdfLink.tsx` reads that flag and sends
      `fromNewsletter: true` in the download POST body.
      `/api/designs/[designId]` route passes it through to
      `incrementUserDownloadCount(email, fromNewsletter)`, which now also
      bumps `TotalNewsletterDownloadsCount`/`LastNewsletterDownloadAt` on the
      user record when true — a separate counter from the lifetime total,
      not a replacement.
    - **Shipped:** typecheck clean on the 4 changed files, full
      `npm run build`, manifest verified clean (no `static/development/`
      contamination), local smoke test on port 3001 (`/`, `/albums`,
      `/designs/4217` all 200, buildId matched), `eb deploy
      cross-stitch-com-env-clone` — **Health: Green**, confirmed live before
      tonight's send.
    - **Deliberately deferred (Olga's call):** the "email in body, no auth"
      pattern (see #12 below) that this feature's endpoint now also uses —
      decide after seeing tonight's numbers, not before.
    - **Not yet done:** commit the 4 changed files
      (`web/src/lib/users.ts`, `web/src/app/api/designs/[designId]/route.ts`,
      `web/src/app/components/DownloadPdfLink.tsx`,
      `web/src/app/components/AuthControl.tsx`) — deployed via `eb deploy`
      straight from the working copy, same as SEO Gap 1 was before it got
      committed retroactively (see #13 above). Asked Olga 2026-07-24
      whether to commit now that it's deployed and verified — awaiting her
      answer.

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
- [ ] SEO Gap 3 (canonicalize near-duplicate designs) actioned (see Pending #13)
- [x] 3-tier download-count tracking (total/logged-in/newsletter) built, deployed, Health Green — 2026-07-24
- [ ] Download-count feature's 4 changed files committed (see Pending #17)
- [ ] Tonight's Announcement-email numbers checked (newsletter-attributed downloads + email-in-body auth decision, see Pending #17)
