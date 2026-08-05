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
| ~2026-07-11/13 (exact date not recorded at the time; Olga confirmed the real send happened 2026-07-26, ~2 weeks before that conversation, but couldn't recall the precise day) | "You spoke, I listened" — **real send to the full list**, not just a test. | Not independently verified here (no GA4/SES cross-check redone as of 2026-07-26) — recorded from Olga's recollection only. If this needs firming up later, check GA4 `src=newsletter medium=email` sessions landing on `/short-stories/editor-updates-july-2026` in the 07-10 to 07-14 window, and SES send stats for that period. |
| 2026-07-27 | "Every pattern in the catalog can now open right in the editor" — announces the catalog-to-editor feature (`EditorPatternKey` CTA button on design pages, built 2026-07-26/27). New content in the same Announcement template slot (`AnnouncementEmailText.txt` / `AnnouncementEmailHtml.txt`, rewritten again). | Sent via a new `UploaderCli send-announcement` CLI command (added this session — the GUI's "Send Announcement Emails" button has no headless equivalent; new command mirrors `MainWindow.xaml.cs`'s `SendAnnouncementEmailsAsync` exactly: same recipient filter, per-recipient unsubscribe token/header, SES send). Admin test copy sent first, reviewed, then real send: 723/723 delivered in 5:08, 0 errors. Per-send log: `uploader/UploaderCli/send-log-announcement.jsonl` + `EmailSendLog` DDB table. Recipient filter used: verified + subscribed + not BotSuspect + visited (`LastSeenAt`) within 3 months (cutoff 2026-04-27) + has unsubscribe token (0 skipped). Note: `editorUrl` in this send still points to `/photo-to-cross-stitch` (old destination, left as-is per Olga's explicit choice 2026-07-27, not `/XStitch-Charts.aspx`). |
| date not recorded (before 2026-08-05, exact day unknown) | Blog teaser: "The real reason I built this site" — excerpt + "Read the rest on the site →" link to `/short-stories/why-i-built-this`. | **Full send to the list**, confirmed by Olga 2026-08-05 — not independently verified via GA4/SES here (recorded from Olga's recollection only, same caveat as the "You spoke, I listened" real-send row above). If this needs firming up later, check GA4 `src=newsletter medium=email` sessions landing on `/short-stories/why-i-built-this`. |

## Sent (individual replies, not the periodic newsletter)

These were one-off replies to specific users who wrote in, not part of the
periodic newsletter — logged here for completeness / to avoid re-contacting.

| Date | To | Topic |
|---|---|---|
| 2026-07-08 | leisacastle@yahoo.com | Thank-you: mobile PDF button overlap fixed |
| 2026-07-08 | safety.proofs884@passmail.net (Sarah) | Thank-you: diagonal line drawing tool |
| 2026-07-08 | pupsrock7@gmail.com (Bianca) | Thank-you: drag-and-drop import from Google fixed; fabric-merge idea acknowledged as in-progress |
| 2026-07-08 | celinewolff@holycross-pri.essex.sch.uk (Céline) | Save-pattern button location (with mobile screenshot); PDF quarter-overlap idea acknowledged as in-progress |
| 2026-07-26 | celinewolff@holycross-pri.essex.sch.uk (Céline) | Follow-up: PDF quarter-overlap idea now shipped (3-stitch overlap, orange OVERLAP outline + label) — sent by Olga manually |
| — | hadenmaiden@gmail.com (Jacky Cooper) | Draft only — Olga sends manually via Reply, not sent by Claude |

## Periodic newsletter — queue

Both items originally planned here (the "You spoke, I listened" changelog
email and the `why-i-built-this` blog teaser) have since gone out as full
sends — see the Sent table above. Nothing currently queued; next content
decision is whatever comes out of the "Ann as recurring blog persona" work
in `docs/Focus.md`.

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
