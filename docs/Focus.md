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

Two mass sends went out recently: the design-spotlight newsletter ("Lady of
Perpetual Love") on 2026-07-24 (841/841, one complaint handled, SES
suppression + message-id logging added), and the Announcement email ("You
spoke, I listened") confirmed sent 2026-07-25 (real send was actually ~2
weeks before that — 2026-07-25 was when Olga confirmed it to Claude, not
the send date; exact original send date not recorded). Both need follow-up
metrics checked (see Open items below). Per-campaign send/entry tracking
(`EmailEntryEvents` + `EmailSendLog`, built 2026-07-26) now exists for
future sends to answer "who did we send X to, who clicked" precisely.

## Next session — pick up here first

**Catalog PDF-to-editable conversion (Olga's idea, 2026-07-26): built and
tested, not yet wired into any UI.** Parser at
`web/src/lib/pdf-pattern-extractor.ts` + CLI at
`web/scripts/extract-catalog-pattern.ts <designId>` reverse-parses a
catalog kit PDF into the same grid+palette format `/photo-to-cross-stitch`
uses. Tested end-to-end (parse → regenerate PDF via the existing
`/api/convert/pdf` → visually compare) on 3 samples spanning the size range
(5/50/100 colors, single-page and 8/36-page charts) — all exact matches.
Full details, algorithm, and open items (not yet wired into a UI/route,
not yet batched across the catalog, not yet spot-checked on the oldest
designs, `SYMBOLS[]` overflow untested for >~150-color designs):
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
9. **`EmailSendLog` real-send verification** — built and deployed
   2026-07-26 (UploaderCli side), but not yet exercised by an actual
   newsletter send. Verify end-to-end (via
   `check-email-campaign.ts`/`check-email-recipient.ts`) once the next
   newsletter goes out.
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
