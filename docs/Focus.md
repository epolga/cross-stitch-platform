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

**New idea from Olga (2026-07-26), investigated but not built, paused mid-thought
to work on something else — resume this before the numbered Open items below:**
convert the existing ~5271 catalog PDFs into the editable grid+palette format
the `/photo-to-cross-stitch` editor uses, so users can customize existing
catalog designs, not just their own photos. Feasibility already checked
against a real sample (Design 4217) — turned out to be a **text-parsing**
problem, not computer vision (PDFs are uncompressed, readable text; color-key
page gives exact DMC numbers as literal text; chart page is a walkable
sequence of cursor-move + symbol-draw operators). Full findings, exact
operator patterns, and recommended next steps (ask Olga if original `.scc`
source files still exist; then prototype on one sample; only then consider
batching all 5271):
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
8. **Newsletter/Announcement send follow-up** — GA4 newsletter-attributed
   clicks, `LastEmailEntry` updates, SES bounce/complaint rate vs. baseline,
   for both the 07-24 newsletter and the Announcement email. (Newsletter-
   attributed downloads already checked 2026-07-26: 41 downloads / 34
   distinct users since 07-24.)
9. **`EmailSendLog` real-send verification** — built and deployed
   2026-07-26 (UploaderCli side), but not yet exercised by an actual
   newsletter send. Verify end-to-end (via
   `check-email-campaign.ts`/`check-email-recipient.ts`) once the next
   newsletter goes out.
10. **AI-tools-scan first real trigger** — built and deployed 2026-07-26
    to the daily Lambda pipeline, gated on day-of-month === 26. Verified
    via manual local test runs only so far; first real scheduled trigger is
    **2026-08-26**.

## Done when

- [ ] Blog teaser email sent
- [ ] Distributed scraping mitigation — decide + implement if volume keeps growing (see Open item #2)
- [ ] Thank-you reply sent to Leisa — waiting on her email address
- [ ] Olga has read through the `docs/srs/` documentation set
- [ ] Automated tests built for the priority-1 area (`09-Test-Plan.md` §4.2, starting with PayPal webhook)
- [ ] GSC indexed-rate re-checked after Gap 3 canonicalization and after subject-blurb/lastmod changes
- [ ] GSC position softening check-back (~2026-08-07)
- [ ] Newsletter/Announcement follow-up metrics checked (GA4 clicks, LastEmailEntry, SES bounce/complaint rate)
- [ ] `EmailSendLog` exercised by a real send and verified end-to-end
- [ ] First real AI-tools-scan trigger observed via the actual scheduled pipeline (2026-08-26)
