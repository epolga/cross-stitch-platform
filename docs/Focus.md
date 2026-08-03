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
- [x] Photo converter's DMC color matching: public "Thread color accuracy" picker shipped 08-03, `cie76` stays the default
- [ ] DINOHash prototyped against known duplicate-designs test pairs, then wired into the real pipeline if it resolves the dHash false-positive mode
- [ ] 2026-07-27 Announcement send follow-up metrics checked (GA4 + SES, see Open item #13)
- [ ] Design-vote "Previous vote: none" recurrence checked after the `ConsistentRead` fix (see Open item #14) — first check 08-03 clean (no recurrence in ~2 days), re-check in another week or two before removing temp diagnostic logging
- [ ] CloudWatch log streaming for `cross-stitch-com-env-clone` fixed/confirmed live again (see Open item #15)
