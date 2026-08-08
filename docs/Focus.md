# Focus

Session-start guide — current goal, active work, and genuinely open items
only. Resolved narrative lives in `docs/session-log/2026-07.md` and
`docs/session-log/2026-08.md` (detailed history) and git log (what
changed, when). Longer-term ideas with no urgency live in
`web/plan/Cross-Stitch.com — Nice-to-Have Ideas.md`. Big-picture roadmap
lives in `web/plan/Pinterest AI Agent — Milestones and Roadmap.md` and
`web/plan/Cross-Stitch.com — Site Technology Milestones.md`. Split into
these four files on 2026-07-26; archived again on 2026-08-03 after
growing back to ~510 lines.

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
comments deliberately deferred (see Nice-to-Have Ideas). The `why-i-built-this`
blog teaser email has already gone out as a full send (confirmed by Olga
2026-08-05, exact date not recorded — see `Email_Content_Plan.md`); no email
currently queued for this persona work.

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

**2026-08-08 (tomorrow): walk through `search-service/app/evaluation.py`
line by line with Olga.** Requested 2026-08-07 explicitly for tomorrow —
the goal is the real Phase 1 milestone per `ROADMAP.md` ("Olga can
independently read, modify, and debug this Python code herself"), not
just that the code exists. Cover `evaluation.py` and its dependency
`app/metrics.py` (both pure, no I/O — good for a first walkthrough).
Explain in detail, not tersely — this is the GenAI learning track (see
`feedback_genai_track_explain_in_detail` memory).

**Real catalog gap found 2026-08-08, via a live customer email (Linda):**
no Fawn design lands close to the common 5x7"/8x10" print sizes (all
existing Fawn designs are square ~10"x10" or too tall/narrow, e.g.
108x187, 97x171 stitches — see reply draft
`web/plan/_draft_email_linda_2026-08-08.md` for the full sizing
analysis). This is a real, customer-driven candidate theme for Track 2's
design-generation pipeline (`detectTrend()` currently auto-picks a
trending theme via web_search — a Fawn sized to ~70x98 or ~112x140
stitches would be a good manual-override test case, bypassing trend
detection for once since the demand signal is already real and specific).

~~Send the "milenas-tin" Announcement mass-send.~~ — **done 2026-08-06**,
733 recipients, `eid=260806`, sent 13:09 UTC (16:09 Israel time, on
schedule). Logged in `web/plan/Email_Content_Plan.md`'s Sent table. Not
yet checked: GA4/SES follow-up metrics (same pattern as Open item #13 for
the 07-27 send) — add as a new Open item if picking this up.

~~Start GenAI Phase 0~~ — **done 2026-08-06** (`ARCHITECTURE_SUMMARY.md`),
plus real progress on both parallel tracks the same day: Track 1 (Python
`search-service/`) built AND deployed as a real Lambda behind API Gateway
(live at `https://c9mkmhf9bi.execute-api.us-east-1.amazonaws.com`, see
`ADR-008`); Track 2 (Opportunity 9, design generation) scoped, not yet
started. Full detail: `docs/genai-growth/PROGRESS.md`. **Next session, pick
up from `PROGRESS.md`'s Next Actions:** Track 1 Step 3 (retrieval
evaluation needs a logged post-search engagement signal — currently
missing, see `ARCHITECTURE_SUMMARY.md` §1) or Track 2 (start with trend
detection, reusing `aiToolsScan.ts`'s pattern). Olga's call which track to
pick up first. Reminder: Olga has **no prior Python experience** (C#/.NET
background) — teach Python as a contrast to C#/.NET, not basic programming
concepts (`Learning.md` § Python Background).

"Publish to Catalog" (see 2026-08-04/05 Shipped entry below) shipped and
verified live (DesignID 5461 "Giraffes") — no known open follow-up on it.
Otherwise: S6's next step (prefetch/`content-visibility` work,
`web/plan/Cross-Stitch.com — Site Technology Milestones.md`) or Open items
below.

**Shipped 2026-08-04/05** (full detail: `docs/session-log/2026-08.md`,
new contract doc: `docs/integration/publish-to-catalog-web.md`):
- [x] Editor fullscreen mode added; two real layout bugs found+fixed (menu/
  toolbar row compression, canvas overflow past the screen) — both from a
  `flex flex-col` + `overflow-x-auto` interaction removing flex items'
  automatic min-height protection.
- [x] Palette panel width-clipping bug found+fixed (missing `flex-none`,
  stale `minWidth` from before the stitch-count column existed).
- [x] Simulation-mode cross stitch thickness increased per Olga's request.
- [x] **New admin feature: "Publish to Catalog"** — full new-design-
  onboarding pipeline (NPage/DesignID allocation, kit PDFs, S3 upload, real
  Pinterest pin, AI SEO description, DynamoDB insert, editor-pattern stamp,
  cache refresh) now available as a button in the web editor itself, no
  desktop Uploader app or `.scc` file needed. First live design (5461
  "Giraffes") published and verified; found+fixed a `Description`-field
  bug from that first run. Required a real production IAM fix (EB role was
  missing `CrossStitchBusinessHistory` access for the Pinterest token).

**Shipped 2026-08-04** (commits `38e1cea`, `c7a73fb`, deployed & health-checked Green):

Reworked outline/stroke preservation (illustration/line-art mode,
`web/src/lib/pattern-converter.ts`) after Olga flagged two real bugs in the
2026-08-03 version: it assumed every outline was white and force-wrote pure
white onto anything it flagged, and it treated any sharp edge — including
ordinary boundaries between two flat color regions — as an "outline."
- **Detection**: replaced the brightness-gated Sobel edge detector with a
  brightness-agnostic morphological top-hat (white top-hat + black top-hat,
  structuring-element radius 2px, `OUTLINE_STROKE_RADIUS`). This finds any
  feature narrower than the structuring element regardless of whether it's
  lighter or darker than its surroundings — a black ink line and a white
  keyline are found the same way. Top-hat threshold `OUTLINE_TOPHAT_THRESHOLD`
  ended at **50** (luminance units) after tuning: 25 caught genuine strokes
  but also caught soft internal shading as false positives (see below); 50
  is the current best trade-off.
- **Color**: instead of always forcing detected strokes to white, each
  stroke is now force-written to the DMC nearest its own averaged sampled
  color from the source (`resolveOutlineComponents`).
- **Grouping bug found and fixed**: connected candidate cells are grouped
  into components (flood fill) BEFORE the distinctness check and DMC snap,
  not judged pixel-by-pixel. Pixel-by-pixel judging had a real bug: two
  adjacent dark candidate cells (e.g. both part of the baby's eye outline in
  the "Lady of Perpetual Love" design) would suppress each other as "not
  distinct" since each read as close to its neighbor — backwards, since
  mutual agreement between candidates is evidence FOR a stroke. Grouping
  first, then comparing the group's average color against its true
  (non-candidate) bordering neighbors, fixed this — confirmed via direct
  pipeline tracing (`resolveOutlineComponents`'s component/border logic).
  This also incidentally fixed a bull test-image regression (34 colors →
  20-21) caused by an earlier, wrong attempt at this same fix (excluding
  candidate neighbors from comparison entirely, which weakened the filter
  exactly where dense noise needed it strongest).
- **Verified against 3 real illustrations**: puppy (white keyline strokes +
  white eye-highlight dots), a stitched-bull test asset (wavy white
  keylines, deliberately textured), and "Lady of Perpetual Love" (white
  keylines + a dark hairline + a small gold star + the baby's face). At
  target width 100 stitches, the baby's eyebrow/eye were initially invisible
  (too small/low-contrast to survive); raising the top-hat threshold to 50
  fixed this AND shrank an over-thick eyebrow blob down to ~2 stitches each
  for eyebrow and eye, which Olga confirmed as sufficient. Confirmed via
  both the standalone converter (with `removeConfetti` replicated in the
  test script, matching the client's automatic post-conversion cleanup) and
  the real `/photo-to-cross-stitch` browser flow end-to-end.
- **Known remaining minor issue, not fixed, not blocking**: Olga noticed a
  handful of small (1-4 stitch) stray-color patches inside otherwise
  visually-flat regions on the puppy (the orange ear, a paw) — e.g. DMC 3776
  "Light Mahogany" (198,113,54) scattered inside a field of DMC 922 "Light
  Copper" (221,117,63). Investigated in depth: the source PNG looks
  perfectly flat there to the eye, but direct pixel sampling shows real
  (if subtle) local variation. **Median-filter denoising was tried and
  rejected**: tested radius 3, 5, and 7 (`sharp().median(n)`) applied only to
  the outline-detection input (not the color-clustering input, so a
  preserved stroke's color stays true to source) — none of the three
  changed the ear/paw speckle pattern AT ALL (pixel-identical output),
  while radius 7 was already destructive enough to erase the Lady's
  eyebrow entirely. Since even a 15×15 median window didn't touch it, this
  is probably NOT simple per-pixel noise/dithering — more likely a
  compression-artifact-like pattern (e.g. JPEG blockiness baked into the
  PNG at export) that's structured rather than random, which a median
  filter doesn't reliably remove.
  - **Proposed next step (not implemented)**: instead of denoising, run a
    coarse k-means color quantization (~16-20 colors — much finer than the
    final stitch grid, but coarse enough to collapse compression noise into
    its nearest real color) on the FULL-resolution image, and run
    `detectOutlineMask` on that quantized copy instead of the raw source.
    Genuine strokes would survive as their own cluster; sub-visible
    compression noise should disappear since it'd almost always cluster
    into its dominant surrounding color. More expensive (an extra full-res
    k-means pass) — not started, needs Olga's go-ahead given the cost/risk,
    and should be verified against all 3 test images again before shipping.
  - **Test images and what to check in each, if picking this back up:**
    - **Puppy** — `D:\Stitch Craft\Charts\ReadyCharts\2026_07_04\Puppy.png`.
      Convert at illustration mode, ~150 wide, ~20 colors. Check: the white
      keyline strokes separating body/ear/head color regions stay white and
      continuous (not broken into dots); both eyes keep their white
      specular-highlight dot; no stray 1-2 stitch confetti after the
      client's automatic cleanup. Known cosmetic issue (Open item #16): a
      few small stray-color patches (DMC 3776 inside DMC 922) in the ear and
      a paw — real but very subtle source pixel variation, not visible to
      the eye in the source PNG, survives median-filter denoising up to
      radius 7. Not fixed; not blocking.
    - **Lady of Perpetual Love** —
      `D:\Stitch Craft\Charts\ReadyCharts\2026_06_26\Lady of Perpetual
      Love.png`. Convert at illustration mode, width 100 (the specific case
      Olga tested). Check: white keylines between mantle/robe/halo regions
      stay crisp; the small gold 8-point star charm on the mantle keeps its
      shape and color; the dark hairline separating Mary's hair from her
      face is preserved in its own dark brown (NOT forced white — this was
      the original bug); the baby's eyebrow and eye each render as a small
      (~2 stitch) distinct patch rather than disappearing into the skin
      tone (top-hat threshold 50 was tuned specifically to make this work
      without over-thickening the eyebrow — see above).
    - **Bull ("Style3")** — no stable source file. This was a synthetic
      test asset built earlier in the same session (a "smoothed"/stitched
      version of an image Olga calls "Style3.png"), created via ad hoc
      image-editing steps and saved only to the session's scratchpad
      (`.../scratchpad/Style3-smooth.png`), which is NOT persistent across
      sessions. Searching `D:\Stitch Craft` for "Style3" or "bull" turns up
      nothing (only an unrelated `BULLDOG.SCC`). **To retest this case,
      either ask Olga for the bull image again, or substitute any other
      flat illustration that uses wavy/curved white keyline strokes** — the
      case this asset exercised was specifically: do continuous curved
      white strokes survive intact, and does texture/noise in the fill stay
      low (this synthetic file had deliberately baked-in dot texture from
      earlier testing, so some speckle in the body fill is an expected
      baseline for THIS file, not a regression — judge by whether the white
      strokes themselves stay continuous and by total color count staying
      in the ~20 range, not by fill-texture alone).

**Shipped 2026-08-04, second pass** (Open item #16, the k-means
quantization idea above — implemented, hit a real regression, fixed):

- Added `kmeansQuantize` (`pattern-converter.ts`) — quantizes the
  full-resolution source to `OUTLINE_QUANTIZE_COLORS` colors via k-means
  before `detectOutlineMask` runs, instead of feeding it the raw source.
  Fits centroids on the sample across `KMEANS_RUNS` runs but assigns the
  full pixel set only once (not once per run, unlike `kmeansLab`) — full-res
  assignment is the expensive part. Color fidelity is untouched:
  `downsampleOutlineMask` still samples the ORIGINAL buffer for a stroke's
  actual color; quantization only decides where the mask fires.
- **First attempt used 18 colors and had a real regression**, caught by
  Olga from a rendered comparison: the baby's eyebrow/eye in "Lady of
  Perpetual Love" — which survive via this SAME outline/stroke path as
  keylines, not via normal color clustering, per the 2026-08-03 tuning note
  above — blurred into the skin tone instead of staying a distinct ~2-stitch
  patch. Root cause: the eyebrow's contrast against skin is subtle, similar
  in magnitude to the noise this pass exists to erase, so at 18 clusters it
  lost the fight for cluster budget against the image's larger flat regions.
  **Fixed by raising `OUTLINE_QUANTIZE_COLORS` to 30** — re-verified the
  puppy noise fix and the eyebrow/eye together; both hold at this value.
- Also caught (separately, in the verification script, not production
  code): the script forced height = width for both test images. The puppy
  source is square (1254×1254) so it didn't show, but "Lady of Perpetual
  Love" is 1024×1536 (2:3 portrait) — forcing 100×100 squashed it
  vertically by 1.5×. Fixed by deriving height from each source's real
  aspect ratio, same as `ImportFromPhotoDialog.tsx`'s aspect-lock already
  does for real users; the production conversion path was never affected.
- **Re-verified against all 3 test images** (puppy, Lady of Perpetual
  Love, bull/Style3 — Olga recovered the bull file from a prior session's
  scratchpad): puppy ear/leg noise stays fixed, Lady's keylines/star/
  hairline/eyebrow/eye all intact at correct 100×150 proportions, bull's
  wavy white keylines stay continuous (24→27 colors, +3, not a concern —
  the body's baked-in speckle texture is this synthetic file's own known
  baseline, unchanged either way). 61/61 Vitest suite passes.

**Shipped 2026-08-03** (full detail: `docs/session-log/2026-08.md`):
- [x] Editor defaults to "Whole Chart" zoom on every load path (commit `3fdf9e6`).
- [x] Open item #11 (CIE76 → CIEDE2000) shipped as a public "Thread color
  accuracy" picker on `/photo-to-cross-stitch`, plus matching SEO content
  (FAQ, structured data, `/compare/*` table rows) — commits `a93f1b5`, `3c9011c`.
- [x] Editor mobile scroll affordances (canvas + palette panel) — found via
  Olga's live phone testing; also fixed a landscape-viewport edge case —
  commits `b6fa808`, `79d9cd1`.
- [x] Milestone S5 — differentiated homepage personalization tags (commit `f47ede8`).
- [x] Milestone S6 first step — real navigation-performance baseline measured (no urgent issues found).
- [x] Password-reset end-to-end confirmed working; found+fixed a UX bug (no post-success redirect) — commit `93855f3`.
- [x] Ann persona — confirmed Nitka already introduced (no new writing needed).
- [x] Design-vote "Previous vote: none" — first clean recurrence check (no recurrence in ~2 days), re-check in a week or two.
- Also found: CloudWatch log streaming for `cross-stitch-com-env-clone` appears stalled — see Open item #15.

**Shipped 2026-07-27/07-28** (full detail: `docs/session-log/2026-07.md`):
catalog PDF-to-editable conversion end to end (PDF-quality signoff, S3
batch extraction of all 5271 designs, "Open in editor" button on design
pages), three parser bugs found and fixed along the way (symbol overflow,
backstitch-marker miscount, Zebra chart-page miscount), and 6 quick-wins
from a ChatGPT-doc review (pattern-quality feedback widget, return-visit
analytics, Ann story-timeline doc, PDF fingerprint on every page, catalog
metadata consistency fix across 32 designs, homepage editor banner, new
SEO blog post) plus a real live-user bug fix (Christa — verify-email
didn't log the user in).

## Open items

1. ~~Blog teaser email for `why-i-built-this`~~ — **already sent** (full
   send, confirmed by Olga 2026-08-05; exact date not recorded, see
   `web/plan/Email_Content_Plan.md`).
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
7. ~~GSC average position monitoring~~ — **resolved, confirmed 2026-08-07**.
   Softening was transient: peaked at 14.8 on 07-23, recovered to 10.9-11.6
   by 07-25/26, and has stayed in the healthy 9.9-14.4 range through 08-05
   (latest finalized day; 08-06/07 not yet processed by GSC). Impressions
   and clicks both trended up over the same window (1531→2590 impr.,
   80→117 clicks), confirming no real degradation. Reusable tools from this
   investigation: `gsc-explore.ts`, `gsc-compare.ts`, `ga4-explore.ts` in
   `automation/pinterest-agent/scripts/`.
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
11. ~~Switch photo converter's DMC matching from CIE76 to CIEDE2000~~ —
    **done 2026-08-03**, see Shipped block above / `docs/session-log/2026-08.md`.
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
16. ~~Outline-preservation: stray small-patch noise in visually-flat
    regions~~ — **done 2026-08-04** (second pass), see the "Shipped
    2026-08-04, second pass" entry above / `docs/session-log/2026-08.md`.
    K-means quantization pre-pass (`OUTLINE_QUANTIZE_COLORS = 30`) fixed the
    puppy ear/leg noise; verified against all 3 test images with no
    regression.
17. **Track 2 grounding-gate fix — needs a real `detectTrend()` run to
    confirm.** 2026-08-08: Round 2 live run (theme "kawaii cottagecore
    frog") hit a real grounding-gate failure — 15 real search queries, 0
    cited URLs (`distinctCitedUrls: 0`). Suspected cause: `buildPrompt()`'s
    old "respond with ONLY a JSON object, no other text" instruction left
    no room for citation markup to attach. Changed `buildPrompt()`
    (`web/src/lib/trend-detection.ts`) to ask for a short cited paragraph
    before the JSON — **not yet verified against a real API call**. Next
    time `detectTrend()` runs for real, check whether `grounding.
    distinctCitedUrls`/`passesGate` actually improves. Full detail:
    `docs/genai-growth/PROGRESS.md`, `docs/genai-growth/
    IMAGE_GENERATION_PREFERENCES.md` Round 2.
18. ~~Real product bug: `pattern-converter.ts`'s `convertImage()` gave
    transparent-PNG uploads a BLACK background instead of white~~ —
    **fixed and deployed 2026-08-08.** Found while investigating the
    Track 2 image pipeline (Open item #17's context): `.removeAlpha()`
    doesn't composite onto any background, it just drops the alpha channel
    and keeps whatever RGB was stored under transparent pixels (often
    black). `convertImage()` is called directly from the public
    `/api/convert` route ("Import from Photo") with no pre-flatten step —
    any real user who ever uploaded a PNG with real transparency (clipart,
    sticker, screenshot) got this. Fixed: alpha now composited onto white
    properly, transparent cells become empty stitches instead of a
    background color. Verified against a real transparent image and a
    real opaque image (zero regression), then a real end-to-end save (the
    "Kawaii Cottagecore Frog" draft, pattern
    `039afa9b-4bef-4b15-9db7-c884b232733a`) with a visually-confirmed clean
    thumbnail. **Deployed to `cross-stitch-com-env-clone`, Health: Green,
    live site verified (`/`, `/photo-to-cross-stitch`, `/albums`,
    `/designs/4217` all 200).** Full detail: `docs/genai-growth/PROGRESS.md`,
    `docs/genai-growth/OPPORTUNITIES.md` Opportunity 9 "Cause A".

## Done when

- [x] Blog teaser email sent (confirmed by Olga 2026-08-05, exact date not recorded)
- [ ] Distributed scraping mitigation — decide + implement if volume keeps growing (see Open item #2)
- [ ] Thank-you reply sent to Leisa — waiting on her email address
- [ ] Olga has read through the `docs/srs/` documentation set
- [ ] Automated tests built for the priority-1 area (`09-Test-Plan.md` §4.2, starting with PayPal webhook)
- [ ] GSC indexed-rate re-checked after Gap 3 canonicalization and after subject-blurb/lastmod changes
- [x] GSC position softening check-back — resolved 2026-08-07, transient dip, recovered
- [x] Newsletter follow-up metrics checked (07-27: healthy — see Open item #8) — [ ] Announcement email follow-up unverifiable, exact send date unknown
- [ ] `EmailSendLog` exercised by a real send and verified end-to-end
- [ ] First real AI-tools-scan trigger observed via the actual scheduled pipeline (2026-08-26)
- [x] Photo converter's DMC color matching: public "Thread color accuracy" picker shipped 08-03, `cie76` stays the default
- [ ] DINOHash prototyped against known duplicate-designs test pairs, then wired into the real pipeline if it resolves the dHash false-positive mode
- [ ] 2026-07-27 Announcement send follow-up metrics checked (GA4 + SES, see Open item #13)
- [ ] Design-vote "Previous vote: none" recurrence checked after the `ConsistentRead` fix (see Open item #14) — first check 08-03 clean (no recurrence in ~2 days), re-check in another week or two before removing temp diagnostic logging
- [ ] CloudWatch log streaming for `cross-stitch-com-env-clone` fixed/confirmed live again (see Open item #15)
- [ ] Track 2 grounding-gate `buildPrompt()` fix confirmed against a real `detectTrend()` run (see Open item #17)
- [x] Transparent-PNG black-background fix (`pattern-converter.ts`) deployed to the live site (see Open item #18) — deployed 2026-08-08, Health Green, verified
