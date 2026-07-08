# Focus

## Current goal

Newsletter relaunch: send the "You spoke, I listened" changelog/thank-you email
to recently-active subscribers, then follow up with the Ann-persona blog teaser.

## Active work

Nothing in flight. Everything below is built, built and deployed, or drafted and
waiting on Olga to trigger the actual send from the Uploader (Claude does not
send mass emails without an explicit go-ahead per send).

## What was done in the 2026-07-08 session

### Feedback backlog (FeatureRequests table) — all 4 items resolved or triaged

- **Leisa** (mobile PDF button overlap) — fixed, deployed, thanked, marked `done`.
- **Sarah** (`safety.proofs884@passmail.net`, diagonal-line drawing) — fixed
  (line/rect/ellipse tools now show a free-angle drag preview instead of a
  grid-snapped staircase, snapping to stitches only on release), deployed,
  thanked, marked `done`.
- **Bianca** (`pupsrock7@gmail.com`) — two-part request:
  - Drag-and-drop photo import from Google: fixed (new
    `/api/import-image-url` proxy route, SSRF-guarded + rate-limited, since a
    cross-origin drag only hands the browser a URL, not file bytes). Deployed,
    thanked.
  - Merge two designs by fabric size: researched (not standard even in
    paid desktop tools like WinStitch/PCStitch), **deferred as nice-to-have**,
    not built.
- **Céline** — confirmed hidden-colors state correctly persists on
  save/reload (verified live with a throwaway test account), sent her a
  mobile screenshot showing the Save button. PDF-quarter-overlap idea
  **deferred as nice-to-have**, not built.
- **Jacky Cooper** (`hadenmaiden@gmail.com`) — positive unsolicited reply to
  Olga's original "please test the editor" email. Reply drafted but **not
  sent by Claude** — Olga sends manually via Reply.

### Editor fixes (deployed)

- Free-angle drag preview for Line/Rectangle/Ellipse tools (`PatternCanvas.tsx`).
- Drag-and-drop photo import from external sites (`/api/import-image-url`).
- Mobile header overlap (Save/Download buttons) — fixed earlier same session.
- Confirmed (not a bug): hidden-colors-while-stitching state already survives
  save/reload correctly.

### SEO / traffic investigation (all resolved as "not a real problem" except one real find)

- AdSense revenue "drop": partial-day comparison artifact — real trend is
  **up** (see GSC numbers below). Not caused by IP bans.
- "No US visitors" panic: GA4 Realtime showing 0-3 active users in a given
  5-30 min window is normal statistical noise at ~85-90 sessions/day baseline.
- Google reindexing (sitemap resubmitted ~June 2): confirmed working —
  average position went from ~55 (page 6) to ~13 (page 2) over the following
  month; distinct design pages with search impressions grew from 137 → 498
  (of 5385 in the sitemap). Still far from "thousands," trend is positive.
- **Real find:** large-scale distributed scraping — 563 unique IPs in a
  30-minute ALB log window, ~75% making exactly one request each, no
  CSS/JS/asset follow-up, systematically enumerating individual design pages,
  search queries, and `robots.txt` across both `cross-stitch.com` and
  `cross-stitch-pattern.net`. **Not yet mitigated** — per-IP blocking doesn't
  scale against this pattern; would need a different approach (rate-based WAF
  rule, bot-challenge, or similar). Flagged, not actioned.
- Fixed a real gap: `/admin/*`, `/profile`, `/etsy-uploader`,
  `/pinterest-agent` now correctly `noindex` (were previously indexable by
  default / explicitly `index`). Deployed and verified live.

### New: blog + newsletter infrastructure (built this session)

- **Blog is now real** (was a single hardcoded story before): `/short-stories`
  list page + `/short-stories/[slug]` post pages, backed by
  `web/src/lib/blog-posts.ts`.
- **Lightweight reaction button** instead of open comments (comments
  deliberately deferred — moderation burden not sustainable solo, and the
  scraping/bot findings above are a live reminder why). New DDB table
  `CrossStitchBlogReactions`; required an IAM policy fix on the EB instance
  role (`CrossStitchDynamoDBAccessPolicy` is an explicit table whitelist —
  new tables must be added there or the app gets silent AccessDenied in prod
  even though it works locally).
- **Two new posts live:**
  - `why-i-built-this` — Ann's origin story (age 60, mild arthritis — see
    persona doc). Not yet emailed.
  - `editor-updates-july-2026` — full detailed changelog, linked from the
    Announcement email as `<changelog_url>`.
- **Reference docs created** (see Memory index for pointers):
  - `web/plan/Ann_Persona_and_Newsletter_Content.md` — Ann's backstory/voice,
    recurring story threads for future emails.
  - `web/plan/Email_Content_Plan.md` — sent/planned newsletter log, keep
    updated after every send.

### Uploader (WPF) changes — compiles clean, not yet sent

- Rewrote the existing **Announcement** email template pair
  (`AnnouncementEmailText.txt` / `AnnouncementEmailHtml.txt`) — was the
  original "please test my editor" ask, now "You spoke, I listened" with the
  4-item changelog + link to the detailed post + invitation to keep sending
  feedback.
- Added a **3-month recency filter**: `FetchAllUserEmailsAsync` now takes
  `minLastSeenAtUtc`; `SendAnnouncementEmailsAsync` applies it so mail only
  goes to verified, subscribed, non-BotSuspect users who visited in the last
  3 months (previously no recency filter on this send at all).
- Wired a second link (`<changelog_url>`) into the `[EditorLink]` section
  alongside the existing editor link (only section where token substitution
  + HTML both render correctly — `Body1`/`Body2` don't get token-substituted,
  learned this while implementing).
- `dotnet build Uploader.sln` — 0 errors.

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
4. Distributed scraping mitigation — not started, needs its own investigation
   (rate-based WAF rule vs. bot-challenge vs. something else).
5. Bianca's fabric-merge idea and Céline's PDF-quarter-overlap idea remain
   `nice-to-have`, unscheduled.

## Done when

- [x] Feedback backlog (4 items) triaged — 2026-07-08
- [x] Diagonal-line/rect/ellipse free-angle preview shipped — 2026-07-08
- [x] Drag-and-drop Google photo import shipped — 2026-07-08
- [x] `noindex` gaps closed on admin/profile/etsy-uploader/pinterest-agent — 2026-07-08
- [x] Blog rebuilt as real multi-post system with reactions — 2026-07-08
- [x] Ann persona + email content plan docs written — 2026-07-08
- [x] Announcement email template rewritten + recency filter + changelog link — 2026-07-08
- [ ] Announcement email actually sent (test, then real)
- [ ] Blog teaser email sent
- [ ] Distributed scraping mitigation designed
