# Focus

Session-start guide — current goal, active work, and genuinely open items
only. Resolved narrative lives in `docs/session-log/2026-07.md` (detailed
history) and git log (what changed, when). Longer-term ideas with no
urgency live in `web/plan/Cross-Stitch.com — Nice-to-Have Ideas.md`.
Big-picture roadmap lives in `web/plan/Pinterest AI Agent — Milestones and
Roadmap.md` and `web/plan/Cross-Stitch.com — Site Technology Milestones.md`.
Split into these four files on 2026-07-26 — this file had grown to ~430
lines of mostly-resolved history.

## Current goal

Build out Ann as a recurring blog persona: flesh out her backstory/life
(building on `web/plan/Ann_Persona_and_Newsletter_Content.md`), start writing
blog posts in her voice, use the existing reactions feature
(`CrossStitchBlogReactions`, shipped 2026-07-08, 0 items so far) for
engagement. Full public comments deliberately deferred (see Nice-to-Have
Ideas). The `why-i-built-this` blog teaser email is the immediate next send
once there's Ann-voiced content to point it at.

## Active work

Three mass sends so far: the design-spotlight newsletter ("Lady of
Perpetual Love") on 2026-07-24 (841/841, one complaint handled, SES
suppression + message-id logging added; follow-up checked 2026-07-27,
healthy — see Open item #8), the Announcement email ("You spoke, I
listened") confirmed sent 2026-07-25 (real send was actually ~2 weeks
before that; exact original send date not recorded, follow-up
unverifiable), and a new Announcement send 2026-07-27 — "Every pattern in
the catalog can now open right in the editor" (announces the Step 2 work
above), sent to 723/723 eligible recipients, 0 errors, via a new
`UploaderCli send-announcement` CLI command (the GUI's mass-send button
had no headless equivalent). One address bounced via the SES account
suppression list (`benoit_stb@yahoo.com`, pre-existing complaint from the
07-24 newsletter, not a new complaint). Found+fixed a real bug while
reviewing that bounce notice: a literal `<br/>` tag in the Announcement
HTML template's Unsubscribe section was rendering as visible text instead
of a line break (`HtmlEncode` runs before newline→`<br/>` conversion, so a
raw tag in the template leaks through escaped) — fixed for future sends,
already-sent copies can't be recalled. Per-campaign send/entry tracking
(`EmailEntryEvents` + `EmailSendLog`, built 2026-07-26) now exists for
future sends to answer "who did we send X to, who clicked" precisely; the
07-27 Announcement send is the first real exercise of `EmailSendLog` via
this new CLI path (see Open item #9).

## Next session — pick up here first

Nothing queued yet. S5 is done; S6's baseline is measured (see Shipped
below) — the next S6 step would be the actual prefetch/`content-visibility`
work itself (`web/plan/Cross-Stitch.com — Site Technology Milestones.md`),
not yet started. Otherwise pull from Open items below.

**Shipped 2026-08-03:**
- [x] **Milestone S5 — differentiated personalization shipped.**
  `/api/personalized` now tags each recommendation `simpler` / `larger` /
  `smaller` / `similar-palette` relative to the viewed design, reusing
  existing `colorBucket`/`sizeCategory`/`subject` facets (no new
  computation). `PersonalizedSection.tsx` shows the tag as a label on the
  thumbnail. Verified against real data (DesignID 4217). Commit `f47ede8`,
  deployed, Health: Green.
- [x] **Milestone S6 first step — real navigation-performance baseline
  measured**, via a live Chromium tab (Playwright) reading Performance-API
  entries directly on `cross-stitch.com` (PageSpeed Insights' anonymous
  quota was exhausted for the day). Homepage LCP 832ms, design page LCP
  896ms, `/albums` LCP 276ms; CLS ~0 everywhere — no urgent problem in this
  baseline. Single unthrottled desktop run per page, not Lighthouse/CrUX —
  full numbers and caveats in the milestone doc's new "Baseline" section.
  Noted in passing, not investigated: 33 console errors on the design page
  and 18 on `/albums` during the run (vs. 0-10 on homepage).
- [x] **Password-reset end-to-end — confirmed working, one follow-on bug found
  and fixed.** Verified the 2026-07-28 IAM fix holds: a direct DynamoDB
  write→immediate-consume round-trip through the real `/api/auth/reset-password`
  endpoint succeeded cleanly. Olga's own first real attempt hit "The reset
  link is invalid or has expired" — root cause not conclusively pinned down
  (table was already empty by the time it was investigated; CloudWatch log
  streaming for this environment was found to be stalled, ~80+ min behind
  real traffic, a separate infra issue not yet followed up on), most likely
  a stale/pre-fix link. A second real attempt through the actual site UI
  succeeded. While testing, found and fixed a real UX bug: `ResetPasswordForm.tsx`
  showed a static "Password has been updated" message with no next step —
  now redirects to `/` two seconds after success. Commit `93855f3`, deployed
  same day, `eb status` Health: Green post-deploy.
- [x] **Ann persona — Nitka already introduced, no new work needed.** Item 1
  below (carried from 2026-07-28) was stale: `blog-posts.ts`'s
  `the-story-behind-black-cat` post (dated 2026-08-01) already names and
  introduces Nitka in-depth (origin story, name meaning, present-day
  behavior). Confirmed via grep, not re-written.

**Shipped 2026-07-28** (all 6 quick-wins from the 2026-07-27 ChatGPT-doc
mining, plus same-day follow-ups — full detail in git log / commit messages,
condensed here per Focus.md's own size-management rule):
- Pattern-quality feedback widget (Yes/Mostly/No + reason) after generation,
  logged via `editor-events.ts`; surfaced in `/admin/editor-analytics`.
- Return-visit pattern-generation analytics event — changed same day from a
  one-time milestone alert to firing (and emailing) every occurrence, after
  the first trigger turned out to be Olga's own testing.
- `web/plan/ann_story_timeline.md` created (dated log of published vs.
  not-yet-mentioned Ann persona facts).
- PDF forensic fingerprint — initially only landed on chart pages, fixed
  same day to appear on every page (cover/key/notes/chart) via a shared
  `drawFingerprint()` helper.
- Catalog metadata consistency-check: `web/scripts/check-catalog-metadata-consistency.ts`
  found 54 mismatches across 32 designs (DB Width/Height/NColors vs. actual
  PDF content); `fix-catalog-metadata-mismatches.ts` applied all 32
  (Olga: treat PDF as ground truth throughout), re-verified at 0 mismatches.
- AI-decision framework folded into `Cross-Stitch.com — Site Technology
  Milestones.md` as a standing "Standing protocol" section.
- Homepage notice banner announcing the online editor (links to
  `/photo-to-cross-stitch` for internal-link SEO).
- New Ann blog post `how-to-turn-a-photo-into-a-cross-stitch-pattern`
  (SEO-oriented); fixed two pre-existing blog bugs found while writing it —
  paragraph spacing (missing `@tailwindcss/typography`) and blog posts
  never being in `sitemap.xml` (only the `/short-stories` index was).
- **Real bug found via a live user report (Christa,** `christabythesea@yahoo.co.uk`,
  **"goes in circles back to the registration form") and fixed same day:**
  `register-only/verify/route.ts` marked email `Verified` but never
  created a session cookie, so verifying left the visitor logged out — the
  next login-gated action bounced them back to registration. Now logs the
  user in via the same mechanism `/api/auth/login` uses. Deployed; reply
  sent to Christa suggesting a plain login (account was already verified
  with a working password) rather than re-registering.

Source note: these came from reviewing 7 untracked `web/plan/*_ChatGPT.md`
files (ChatGPT-generated recommendations, not yet acted on). Their
own priority-1 recommendation ("save/reopen projects" and "customize an
existing catalog design") turned out to already be built (shipped
2026-07-27, see Step 2 below) — those docs are partially stale. A
Pinterest-pin-format suggestion in the same docs was skipped as
out-of-scope per the 2026-07-27 Pinterest deprioritization (see
`Pinterest AI Agent — Milestones and Roadmap.md`, Milestones 5/6b/11).
Bigger items from the same docs
(competitor benchmark, stitch-progress tracker, OXS import/export,
backstitch/special stitches, anti-scraping S3/CloudFront migration, new
SEO landing pages, retention-analytics overhaul, text-to-pattern) were
judged too large for one session — noted but not scheduled.

The catalog PDF-to-editable conversion (Steps 1 and 2 below) is complete
and shipped (batch run finished, announcement sent) — remaining follow-ups
(134 hard failures, DMC-data warnings, Announcement send metrics) are
optional cleanup, not gating.

**Catalog PDF-to-editable conversion (Olga's idea, 2026-07-26) — agreed plan, 2026-07-27:**

1. **Step 1: get the editor's own PDF output (`/api/convert/pdf`) to a
   quality Olga is happy with. Signed off 2026-07-27** — Olga confirmed
   "будем считать, что сделано" after reviewing the full cycle of fixes
   below, tested against `Stitch26_Kit.pdf`/"Evening Lake" and
   `Stitch744_Kit.pdf`/"Fox" as references, across 1, 2, 4, 6, and 36-page
   designs. **Next session should start on Step 2.**
   What shipped: cover title Helvetica→Times New Roman Bold 30pt +
   optional "by {author}" line; cover image resized from ~84%-of-page-
   height to a contained ~40% box; Notes page recolored/refonted to match
   (Times New Roman, brown info block, blue page-map intro), overlap
   explanation moved to its own caption; page-map grid cells capped at a
   fixed ~60×75pt instead of stretching to fill the page; per-chart-page
   overlap footer reworded ("stitch it once") and enlarged to 9pt on its
   own line. Single-page designs (Fox) specifically: chart cell size now
   adapts to fill the page (10-30pt, was fixed 10pt) and centers both ways
   instead of top-left-anchored; the page-map/intro-text section is
   skipped entirely (matches the original, which shows nothing there for
   a single page). Fallback cover thumbnail (no live `previewImage`) now
   ports the client's own Aida+shadow+fabric-hole recipe from
   `PatternCanvas.tsx`'s `capturePreview()`, as a tiled canvas pattern
   (a naive per-cell/per-intersection version took 5+ minutes on a large
   design — fixed). **Decided 2026-07-27: keep the live site's converter
   sending a client-captured `previewImage` as the primary path — this
   richer server-side fallback stays fallback-only** (used when no
   capture is sent, e.g. future batch regeneration), not switched to
   the default for live users: server-side render costs ~20s for a large
   design, unacceptable as an always-on tax on every live PDF download
   when the client already does this work for free.
2. **Step 2, clarified 2026-07-27 — narrower than earlier drafts of this
   plan: the batch run does NOT generate or regenerate any PDFs.** It
   only needs to: (a) run the extractor across all 5000+ catalog designs
   to produce each one's grid+palette JSON, (b) save those JSON files to
   a separate S3 bucket, (c) add a link/button on each design's page that
   opens that saved representation in the editor. Actual PDF
   generation/export happens later, on demand, only if/when a user opens
   a design in the editor and chooses to save or download it — not
   preemptively for all 5000+ designs as part of the batch job.
   **Built and tested end-to-end 2026-07-27** (not yet run at scale — only
   design 744/"Fox" processed for real so far, plus a 3-design dry-run):
   - S3 bucket `cross-stitch-editor-designs` created (us-east-1), **fully
     private** (Block Public Access on) — Olga's call: unlike the public
     kit-PDF bucket, this one is reachable only through the site's own
     server. No extra IAM policy needed — the EB EC2 role
     (`aws-elasticbeanstalk-ec2-role`) already has `AmazonS3FullAccess`.
   - `web/scripts/batch-extract-catalog-patterns.ts` — loops
     `DesignsByID-index` with `ScanIndexForward: false` (newest DesignID
     first, per Olga's request), skips designs that already have
     `EditorPatternKey` (marker attribute) unless `--force`, uploads
     `patterns/{designId}.json` to the bucket, stamps
     `EditorPatternKey`/`LastModifiedAt`. Flags: `--report`,
     `--designIds=`, `--limit`, `--all`, `--dry-run`, `--force`,
     `--concurrency` (default 3) — same shape as
     `automation/pinterest-agent/scripts/backfill-visual-seo.ts`. Needed a
     `withRetry` wrapper (4 attempts, exponential backoff) around every
     DDB/S3/fetch call after two transient `ETIMEDOUT`s killed early test
     runs — a full-catalog run makes thousands of sequential network
     calls, so a single blip can't be allowed to abort the whole thing.
   - New route `web/src/app/api/converter/catalog-pattern/[designId]/route.ts`
     — the only way to read a catalog pattern's JSON: looks up the
     design's `EditorPatternKey` via `getDesignById`, fetches it from S3
     server-side with the app's own credentials, re-serves it to the
     client. No direct/public S3 or CloudFront URL exists for these files.
   - `web/src/app/types/design.ts` + `web/src/lib/data-access.ts` —
     `Design.EditorPatternKey?: string`, mapped from the DDB attribute in
     the same cache-building scan `SeoSubjectBlurb`/`CanonicalDesignId`
     already go through.
   - `ConvertClient.tsx` — new `?catalogPatternId=<designId>` URL param
     (parallel to the existing `?pattern=<uuid>` for a user's own saved
     patterns), fetches from the new route and loads `grid`/`palette`/
     `title` into the editor. Deliberately does NOT set `savedPatternId`
     — this is a read-only starting point, so hitting Save creates a new
     pattern owned by the current user rather than overwriting the
     catalog source.
   - `web/src/app/designs/[designId]/page.tsx` — a second CTA button,
     "Open this pattern in the editor", shown only when
     `design.EditorPatternKey` is set (cloned from the existing "Turn
     your own photo into a pattern" `EditorCTAButton`).
   - Verified end-to-end in the browser: design 744 ("Fox") page → new
     button → editor loads the actual 27×36/9-color pattern from S3
     through the new route, no console errors.
   - **Full batch run completed 2026-07-27** (`--all`, 5271 designs,
     descending DesignID): 5136 ok / 134 failed / 364 warnings. Failure/
     warning breakdown written to
     `docs/web/catalog-pattern-extraction-issues.md` (commit `532bcad`).
     Not yet investigated: the 134 hard failures (72 no-color-key-page, 44
     no-chart-page, 17 HTTP 403, 1 HTTP 503) or the dominant warning cause
     (3 missing DMC numbers — 779, 967, 505 — would resolve ~96% of the
     364 warnings, per code inspection; not yet fixed or re-run).
   - Daily editor-analytics summary now also tracks `catalog_pattern_opens`
     (`editor_opened` events with `source=design_page_catalog`) — commit
     `832fe15`.

Parser at `web/src/lib/pdf-pattern-extractor.ts` + CLI at
`web/scripts/extract-catalog-pattern.ts <designId>` reverse-parses a
catalog kit PDF into the same grid+palette format `/photo-to-cross-stitch`
uses. Tested end-to-end (parse → regenerate PDF via `/api/convert/pdf` →
visually compare) on 3 samples spanning the size range (5/50/100 colors,
single-page and 8/36-page charts) — all exact matches. Two debug/visual-
check CLI scripts added 2026-07-27: `web/scripts/preview-pattern.ts`
(renders a pattern JSON straight to PNG) and
`web/scripts/render-pdf-from-pattern.ts` (calls the real `/api/convert/pdf`
route handler directly, no dev server needed).

**Found and fixed 2026-07-27** (deployed, commit `538a78c`): `SYMBOLS[]`
(`web/src/lib/symbols.ts`) only has 151 distinct glyphs — any palette past
that index used to collapse every overflow color onto a shared `'?'`
glyph, making them indistinguishable on the chart. Added
`symbolForIndex()`, falling back to unique plain numbers instead; fixed in
both `pdf-pattern-extractor.ts` and `pattern-converter.ts`. Note: no
catalog design currently in the DB actually exceeds 100 colors, so this
specific bug couldn't be reproduced live — fixed from code inspection +
Olga's description, not a confirmed live repro.

**Found and fixed 2026-07-27** (commit `29a6cc0`, pushed+deployed):
`parseChartPage`'s cumulative step-cursor regex didn't track PDF `q`/`Q`
graphics-state nesting, so backstitch decoration markers (French-knot/
direction indicators, drawn via their own "cm ... Do" inside a nested
q/Q) were mistaken for extra grid steps and corrupted the cursor for
every real cell after them. Confirmed via Fox1.scc: its one "black"
cross-stitch cell was actually one of these markers — the original only
ever uses black for backstitch there (which this converter still doesn't
render — separate, not-yet-built feature). Fixed by tracking q/Q depth
and only accumulating steps at the same depth as the first real one; this
also silently resolved the unrelated-looking "N cell(s) had conflicting
values" warning seen on the same design — same root cause.

**Found and fixed 2026-07-27** (same session, following up on the "Zebra"
DesignID 406/AlbumID 37 anomaly found while looking for 6-page test
designs): extraction warned `PDF declares 4 chart pages but only 2 were
found/parsed` and reconstructed at 134×91 instead of the true 134×103.
Root cause: the loop deciding which content streams are chart pages
gated on `doCount > 100` ("/N Do" placement count) alone — Zebra's last
two of four chart pages (the mostly-blank bottom row) only had 39 and 58
Do calls, below the threshold, so they were silently skipped even though
each one carries an unambiguous `(Page N of M Position X:Y)` label. Fixed
by checking for that label first, falling back to doCount > 100 only for
the single-page case where no label exists at all to check. Verified: Zebra
now reconstructs at the correct 134×103 with no warnings; Fox and Evening
Lake re-checked clean (no regression).

Full background/algorithm:
`docs/plan/web/Catalog PDF-to-Editable Conversion — Feasibility Findings.md`.

## Open items

1. **Blog teaser email** for `why-i-built-this` (excerpt + "read more" link,
   not full text) — send after Ann-voiced blog content exists, per the
   established trust-before-vulnerability order in
   `web/plan/Email_Content_Plan.md`.
2. **Distributed scraping mitigation** — keep monitoring via `/review-ip`
   (decision 2026-07-10, status confirmed 2026-07-24: 0 watched, 25
   blocked). Revisit the "keep monitoring vs. build WAF Bot Control" call
   if volume keeps growing — several current blocks are download-counter
   inflation bots exploiting the no-auth email-in-body pattern (see
   Nice-to-Have Ideas).
3. **Singapore/bot-traffic GA4 anomaly** — confirmed bot traffic
   2026-07-10 (0.7% engagement, 99% direct/none, same signature as ALB
   scrapers). Not yet done: add a session-quality filter to the Milestone 9
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
7. **GSC average position monitoring** — softened ~11-12 → ~15-17 since
   2026-07-22/23 (all other causes already ruled out: deploys, Manual
   Actions, Security Issues, AdSense RPM). Check back ~2026-08-07. Reusable
   tools from this investigation: `gsc-explore.ts`, `gsc-compare.ts`,
   `ga4-explore.ts` in `automation/pinterest-agent/scripts/`.
8. **Newsletter/Announcement send follow-up** — newsletter side ("Lady of
   Perpetual Love", 07-24) checked 2026-07-27 and looks healthy: ~47 GA4
   sessions with `src=newsletter&medium=email` landing on the design page
   over 07-24→07-26 (+~16 more newsletter-sourced sessions on other pages),
   83 `LastEmailEntry` updates since the send, SES complaint rate ~0.12%
   (1 complaint / 848 delivery attempts, `benoit_stb@yahoo.com` suppressed
   2026-07-24), 0 bounces from this batch. Matches the previously logged
   downloads figure (41 downloads / 34 distinct users since 07-24).
   **Announcement email ("You spoke, I listened") remains unverifiable** —
   GA4 shows no detectable spike on the changelog page in the plausible
   send window, and SES `get-send-statistics` only covers a 14-day trailing
   window (07-13→07-27), too late to catch a ~07-11/13 send. Root cause:
   exact send date was never recorded and the new EmailSendLog tracking
   postdates it. Not worth further digging unless the exact send date
   surfaces some other way.
9. **`EmailSendLog` real-send verification** — built 2026-07-26, first
   exercised for real by the 2026-07-27 Announcement send (723 rows via the
   new `send-announcement` CLI path). Not yet verified end-to-end — run
   `check-email-campaign.ts`/`check-email-recipient.ts` against that send's
   `eid` to confirm the rows look right, still also pending for an actual
   newsletter send.
10. **AI-tools-scan first real trigger** — built and deployed 2026-07-26
    to the daily Lambda pipeline, gated on day-of-month === 26. Verified
    via manual local test runs only so far; first real scheduled trigger is
    **2026-08-26**.
11. **Switch photo converter's DMC matching from CIE76 to CIEDE2000**
    (`web/src/lib/pattern-converter.ts:32-61` — `rgbToLab`/`labDist2`/
    `nearestDmcLab` currently do plain Euclidean distance in Lab space,
    i.e. CIE76) — CIEDE2000 is a more perceptually accurate color-distance
    formula (weights hue/chroma/lightness differences unevenly, unlike the
    naive CIE76 Euclidean version). Prompted by the 2026-07-26 AI-tools-scan
    flagging competitor Xstitchify's "Delta-E/CIELAB matching" as a
    differentiator — we already do the Lab-space part, this closes the gap
    on formula accuracy. Affects both `convertImage`'s clustering
    (`labDist2` is also used for k-means++ init/assignment, not just final
    DMC snapping) and `nearestDmcLab`'s final snap step.
12. **Adopt DINOHash for near-duplicate catalog image detection** — found
    via the 2026-07-26 AI-tools-scan. Current pipeline
    (`automation/pinterest-agent/scripts/find-duplicate-designs.ts` +
    `verify-duplicate-designs-visual.ts`) does a metadata-candidate pass
    then verifies with SHA-256 (exact-byte matches only, zero false
    positives) + a 64-bit dHash (Hamming distance) — and dHash has a
    **confirmed false-positive mode**: the "99 Names of Allah" series (8
    designs, same border/font/layout, different Arabic text each time)
    landed at the same Hamming distance (4-8) as true duplicates, because
    dHash compares raw pixel differences, not semantic content. DINOHash
    (built on DINOv2 self-supervised features, adversarially trained —
    https://github.com/proteus-photos/dinohash-perceptual-hash) compares
    learned visual features instead of pixel deltas, which should
    distinguish "same template, different content" from "actually the same
    image" — directly targets this known failure mode. Also much cheaper/
    faster than a Claude-vision call per candidate pair (20x smaller than
    CLIP, 100x shorter hash, per its own benchmarks). Next step: prototype
    it against the known confirmed/false-positive pairs already on file in
    `reports/duplicate-designs-visual.json` before rewiring the real
    pipeline on it.
13. **2026-07-27 Announcement send follow-up** — sent to 723/723, 0 errors
    (see Active work above). Not yet checked: GA4 traffic to
    `/XStitch-Charts.aspx` and `catalog_pattern_opens` in the daily editor
    summary for a post-send bump; SES complaint/bounce rate for this batch
    specifically (only the one pre-existing suppression seen so far).
14. **Design-vote "Previous vote: none" mystery — check for recurrence.**
    Olga forwarded 3 separate real "New design vote" admin-email incidents
    (designs 5460/4987/3592, different users/IPs/dates) all showing the
    identical signature: a user's rapid up/down/up toggle (0.8-3.3s apart)
    where every single request reports `Previous vote: none`, even though
    the prior request in the same burst had just written a real vote.
    Confirmed NOT explained by: multiple EB instances (this environment
    runs exactly one EC2 instance), an app-level cache (none exists on this
    path), or a duplicate/mismatched DynamoDB key (only one item exists per
    voter+design, with the correct final value). Also confirmed the
    `setDesignVote` "switch" branch (`design-likes.ts`) never actually fires
    in these incidents — every request takes the "no prior vote" branch,
    meaning `getUserDesignVote`'s read is what's failing to see a write from
    1-3+ seconds earlier, longer than normal DynamoDB eventual-consistency
    lag. **Fix applied 2026-08-01**, checked 2026-08-03 (via Olga's own
    Gmail — CloudWatch couldn't be used, see infra item below): "New design
    vote" emails since 08-01 look normal, no "Previous vote: none" seen in a
    suspicious rapid-toggle context. **No recurrence in the ~2 days since
    the fix** — promising, but that's a short window against 3 prior
    incidents spread out over longer, so keep the temporary diagnostic
    `console.log`s in `getUserDesignVote`/`putDesignVote` in place for now
    rather than removing them yet. Re-check again in another week or two of
    silence before calling this resolved and pulling the logging.
    Separately (not a bug, a product question for Olga): `DesignLikeButton.tsx`
    and the backend both currently treat clicking the *opposite* arrow while
    already voted as "clear my vote," not "switch my vote" — this is
    internally consistent between client and server, so left as-is pending
    an explicit decision on whether the wanted behavior is a direct switch
    instead.
15. **CloudWatch log streaming for `cross-stitch-com-env-clone` appears
    stalled.** Found 2026-08-03 while investigating the password-reset and
    design-vote items above: the environment's live EC2 instance
    (`i-0ba24e0fa016ebe9f`, running since 2026-08-01) has a
    `/aws/elasticbeanstalk/.../var/log/web.stdout.log` log stream whose
    *last* event is ~7.5 hours stale despite substantial real traffic since
    (manual test requests, a real user's password-reset attempts, a full
    `eb deploy`). An even older, already-terminated instance
    (`i-03f413f56baca37c2`) has a separate stream that's similarly stuck
    (~2+ hours stale at time of check). Effectively no one can currently use
    `eb logs`/CloudWatch to debug anything happening on this environment in
    close to real time — this blocked confirming the password-reset root
    cause today and blocks tracing any future `[design-likes]` recurrence
    (Open item #14) via logs, leaving Gmail-forwarding as the only working
    signal. Not yet investigated: whether the CloudWatch agent
    (`amazon-cloudwatch-agent.service`, seen in `eb-engine.log`) is actually
    running on the current instance, or needs a restart/reconfig.

## Done when

- [ ] Blog teaser email sent
- [ ] Distributed scraping mitigation — decide + implement if volume keeps growing (see Open item #2)
- [ ] Thank-you reply sent to Leisa — waiting on her email address
- [ ] Olga has read through the `docs/srs/` documentation set
- [ ] Automated tests built for the priority-1 area (`09-Test-Plan.md` §4.2, starting with PayPal webhook)
- [ ] GSC indexed-rate re-checked after Gap 3 canonicalization and after subject-blurb/lastmod changes
- [ ] GSC position softening check-back (~2026-08-07)
- [x] Newsletter follow-up metrics checked (07-27: healthy — see Open item #8) — [ ] Announcement email follow-up unverifiable, exact send date unknown
- [ ] `EmailSendLog` exercised by a real send and verified end-to-end
- [ ] First real AI-tools-scan trigger observed via the actual scheduled pipeline (2026-08-26)
- [ ] Photo converter's DMC color matching switched from CIE76 to CIEDE2000
- [ ] DINOHash prototyped against known duplicate-designs test pairs, then wired into the real pipeline if it resolves the dHash false-positive mode
- [ ] 2026-07-27 Announcement send follow-up metrics checked (GA4 + SES, see Open item #13)
- [ ] Design-vote "Previous vote: none" recurrence checked after the `ConsistentRead` fix (see Open item #14) — first check 08-03 clean (no recurrence in ~2 days), re-check in another week or two before removing temp diagnostic logging
- [ ] CloudWatch log streaming for `cross-stitch-com-env-clone` fixed/confirmed live again (see Open item #15)
