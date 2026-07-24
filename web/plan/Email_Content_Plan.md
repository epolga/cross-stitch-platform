# Email content plan — periodic "Ann" newsletter

Tracks what's been sent, to whom, and what's queued next. Companion to
`Ann_Persona_and_Newsletter_Content.md` (Ann's backstory/voice — read that first
when drafting anything personal).

## Standing rule: send order

Practical/trust-building content before personal/vulnerable content. Established
2026-07-08: a "we listened and fixed things" email should land before a personal
backstory post, so trust is built first. Don't reorder without a reason.

## Other email systems (not tracked in detail here)

- **Weekly design-spotlight newsletter** — a separate, pre-existing recurring
  send (one featured design per email, `src=newsletter medium=email` in GA4
  with a per-campaign `eid`), running at least since May 2026, roughly
  weekly. Not built/managed via the plan below — discovered 2026-07-13 while
  investigating email-channel GA4 traffic. Generates ~5-15 click-throughs per
  send. Out of scope for this doc until it needs a content decision.

## Sent (mass sends via the Announcement template)

| Date | What | Evidence |
|---|---|---|
| 2026-06-29/30 | "Test the new editor" announcement (original template, pre-2026-07-08 rewrite) — sent to the user list around the `photo-to-cross-stitch` site-integration launch (`1a906dc`, 2026-06-28) and the "Uploader: announcement email blast" commit (`d88e8cb`, 2026-06-29 17:35). | GA4: 25 sessions on 2026-06-30 from `src=newsletter medium=email`, 19 landing directly on `/photo-to-cross-stitch`, plus a trailing tail of clicks through 07-09. This is the send Jacky/Leisa/Sarah/Bianca/Céline replied to (logged below, 07-08). |
| 2026-07-08/09 | "You spoke, I listened" rewrite — **test send only**, not the full list. | GA4: only 2 sessions on 07-09 landing on `/short-stories/editor-updates-july-2026` (the rewrite's `<changelog_url>`) — volume consistent with an admin-only "Test Announcement Email" send, not a blast to the full ~672-person recipient list. |

## Sent (individual replies, not the periodic newsletter)

These were one-off replies to specific users who wrote in, not part of the
periodic newsletter — logged here for completeness / to avoid re-contacting.

| Date | To | Topic |
|---|---|---|
| 2026-07-08 | leisacastle@yahoo.com | Thank-you: mobile PDF button overlap fixed |
| 2026-07-08 | safety.proofs884@passmail.net (Sarah) | Thank-you: diagonal line drawing tool |
| 2026-07-08 | pupsrock7@gmail.com (Bianca) | Thank-you: drag-and-drop import from Google fixed; fabric-merge idea acknowledged as in-progress |
| 2026-07-08 | celinewolff@holycross-pri.essex.sch.uk (Céline) | Save-pattern button location (with mobile screenshot); PDF quarter-overlap idea acknowledged as in-progress |
| — | hadenmaiden@gmail.com (Jacky Cooper) | Draft only — Olga sends manually via Reply, not sent by Claude |

## Periodic newsletter — queue

Not yet sent. Planned order:

1. **"You spoke, I listened" — changelog + thank-you to feedback-givers**
   ("friends" framing collectively, no individual names — mass email, naming
   specific people without consent felt wrong). Built into the existing
   **Announcement** email slot in the Uploader (same template that originally
   asked people to test the editor — Jacky/Leisa/Sarah/Bianca/Céline all
   replied to that one) rather than a new button — this is the natural
   continuation of that same thread.
   - Templates: `Uploader/Templates/AnnouncementEmailText.txt` +
     `AnnouncementEmailHtml.txt` — rewritten 2026-07-08.
   - Recipient filter: verified + subscribed + not BotSuspect (existing) +
     **new**: `LastSeenAt` within the last 3 months (added 2026-07-08 via
     `minLastSeenAtUtc` param on `FetchAllUserEmailsAsync`) — excludes people
     who registered once and never came back, per Olga's request.
   - Links included: `<editor_url>` (photo-to-cross-stitch) +
     `<changelog_url>` → `/short-stories/editor-updates-july-2026` (added
     2026-07-08, both tokens live in the `[EditorLink]` section — that's the
     only section where token substitution + HTML both work reliably, see
     `email-template-usage` skill).
   - Status: **built and compiles clean; not yet sent**. Before a real send:
     open Uploader → "Reload Email Template" → "Test Announcement Email" to
     admin first, review, then "Send Announcement Emails".
2. **Blog teaser: "The real reason I built this site"** — excerpt (first
   2-3 paragraphs) + "Read the rest on the site →" link to
   `/short-stories/why-i-built-this`. Distribution format decided 2026-07-08:
   teaser + link, not full text, so the goal (site traffic + on-site
   reaction) actually gets served. Status: **post is live on site, email not
   yet sent**.

## Blog posts (live on `/short-stories`)

| Slug | Title | Date | Notes |
|---|---|---|---|
| `editor-updates-july-2026` | Everything that changed, in detail | 2026-07-08 | Full changelog (diagonal-line tool, drag-and-drop Google import, mobile Save/Download overlap, saved hidden-colors, PDF download button feedback) — linked from the Announcement email's `<changelog_url>` |
| `why-i-built-this` | The real reason I built this site | 2026-07-08 | Ann's origin story (hands/arthritis) — see persona doc |
| `let-cross-stitch-remain-for-generations` | Let cross stitch remain for generations | 2026-05-01 | Pre-existing fictional short story (Eleanor/Lydia), migrated into the new multi-post blog structure unchanged |

Each post has a lightweight anonymous reaction button (🧵 "This resonates with
me" — no login, rate-limited by IP) instead of open comments. Comments were
considered and deliberately deferred — see reasoning in the reference memory
for this file.
