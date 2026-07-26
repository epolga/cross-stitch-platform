# Software Requirements Specification — Uploader

**Component:** `uploader/` (WPF desktop application)

**Part of:** cross-stitch-platform — see `00-Overview.md` for cross-component context

**Date:** 2026-07-11

## 1. Introduction

### 1.1 Purpose

This document specifies the requirements of the Uploader: the desktop tool the site
operator uses to publish new cross-stitch designs and to send subscriber emails. It is the
platform's sole entry point for new catalog content.

### 1.2 Scope

In scope: the design-publishing workflow, the email-sending workflows (new-design
notification, text-only, announcement), AI-assisted pin-title suggestions, and the
supporting administrative/maintenance utilities in the "More actions" panel. Out of scope:
the actual Pinterest pin-posting *engine* used for catalog backfill (`autopinner`, specified
in `03-SRS-Pinterest-Automation.md`) — the Uploader creates a pin only for the design it is
actively publishing, via the same shared library.

### 1.3 Definitions

- **Batch** — a folder containing one finished design's source files (chart file, PDF kit
  variants, preview images) ready to publish.
- **Recipient segmentation** — the set of filters (verified, subscribed, recently active,
  not bot-suspect) applied to decide who receives a given email send.

## 2. Overall description

### 2.1 Product perspective

The Uploader is a single-window, single-operator desktop application. It is the only
component in the platform that writes new `DESIGN` rows to `CrossStitchItems`, and the only
component that sends bulk subscriber email (autonomous Telegram/SES alerts from
Pinterest-automation are operational alerts to the operator, not subscriber-facing).

### 2.2 User classes

- **Site operator (Olga)** — the sole user. All actions are manual, operator-initiated
  button clicks; there is no scheduled/unattended mode.

### 2.3 Constraints

- Depends on a separate console app (`Converter.exe`, built from `uploader/Converter` —
  same monorepo, not part of `Uploader.sln`) for PDF format conversion during publishing;
  this dependency is out of scope for this SRS (see `00-Overview.md` §7).
- Relies on the default AWS SDK credential chain on the operator's machine; no in-app
  credential management.
- PDF metadata extraction (title/size/colors) is implemented as fixed-marker text scraping
  of the PDF's internal PostScript text, not a structured PDF-metadata read — a change to
  the upstream PDF export template can silently break extraction (see NFR-4).

## 3. Functional requirements

### 3.1 Design publishing

- **FR-PUB-1.** The system shall let the operator select a folder containing a design batch
  and shall validate that the required PDF kit variants are present before allowing further
  action.
- **FR-PUB-2.** The system shall extract the design's title, notes, dimensions (width ×
  height in stitches), and color count from the batch's PDF content, and shall display the
  extracted values to the operator for review before publishing.
- **FR-PUB-3.** The system shall determine the next sequential design ID and global page
  number by querying the existing catalog before publishing a new design.
- **FR-PUB-4.** The system shall convert the batch's PDF kit variants into their published
  form via an external conversion tool and upload the converted PDFs, the chart source file,
  and the preview image(s) to cloud storage under the platform's established path
  convention.
- **FR-PUB-5.** The system shall create a Pinterest pin for the new design as part of
  publishing, using the shared Pinterest-upload capability (§3.3, and see
  `03-SRS-Pinterest-Automation.md` for the shared pin-creation logic), and shall abort the
  publish action if pin creation does not return a pin ID.
- **FR-PUB-6.** The system shall generate an SEO-oriented description for the design via an
  LLM as part of publishing; a failure of this step shall not block the rest of the publish
  flow.
- **FR-PUB-7.** The system shall write the new design's full catalog row (identifiers,
  caption, description, notes, dimensions, color count, pin ID) to the catalog datastore as
  the final step of publishing.
- **FR-PUB-8.** The system shall restart the website's hosting environment after each
  publish so the newly published design becomes visible without a separate deploy, and shall
  also expose this restart as a standalone action independent of publishing.
- **FR-PUB-9.** The system shall not automatically notify subscribers on publish; sending a
  notification email shall be a separate, explicitly operator-triggered action (§3.2).

### 3.2 Subscriber email sending

- **FR-MAIL-1.** The system shall provide three distinct, independently-triggered send
  actions: an HTML "new design" notification, a text-only equivalent, and an announcement
  send.
- **FR-MAIL-2.** Recipient selection for the new-design notification (both HTML and
  text-only variants) shall include only verified, subscribed accounts that have been active
  (by email interaction or verification) within a configurable recency window (currently
  2 months), and shall always exclude accounts flagged bot-suspect.
- **FR-MAIL-3.** Recipient selection for the announcement send shall include verified,
  non-unsubscribed users who have visited the site within a configurable recency window
  (currently 3 months).
- **FR-MAIL-4.** The announcement send shall require an explicit operator confirmation
  (a yes/no prompt stating the recipient criteria) immediately before sending, and shall
  provide a "send test to admin only" action to be used before the real send.
- **FR-MAIL-5.** The new-design and text-only send actions shall not require a confirmation
  dialog beyond the operator's initial button click, and shall be guarded against accidental
  double-sends by disabling the triggering control while a send is in progress.
- **FR-MAIL-6.** Every subscriber email shall carry a valid unsubscribe mechanism (a
  one-click unsubscribe header plus an in-body link) derived from a per-user token; a
  recipient with no stored unsubscribe token shall be excluded from the send rather than
  sent an email without a working unsubscribe path.
- **FR-MAIL-7.** Email content shall be sourced from editable template files loaded from
  disk, with a required, enforced section structure per template type (new-design HTML,
  new-design text, announcement HTML, announcement text); a template missing a required
  section shall fail loudly (a runtime error) rather than send malformed content.
- **FR-MAIL-8.** The system shall let the operator reload email templates from disk without
  restarting the application, and this reload shall affect only recipients processed after
  the reload (mid-send template edits shall not retroactively change already-sent emails).
- **FR-MAIL-9.** The system shall provide mailing-list hygiene actions: removing suppressed
  addresses (from an operator-maintained suppression list), marking users verified, and
  back-filling tracking/unsubscribe/subscription identifiers on existing user records.
- **FR-MAIL-10.** The system shall provide a "send test email to admin" action independent of
  the announcement flow's built-in test action.

### 3.3 AI-assisted pin suggestions

- **FR-AI-1.** The system shall, after a batch folder is selected, request from an LLM up to
  three alternative Pinterest pin title options (each required to reference "cross stitch"
  and to take a different angle — keyword-, difficulty-, or emotion-led) and one suggested
  board name, without blocking the rest of the publish workflow while waiting.
  - The suggested board name shall be informational only; the board actually used for
    publishing is still determined by the per-album board mapping described in
    `03-SRS-Pinterest-Automation.md` FR-PIN-3.
- **FR-AI-2.** The system shall let the operator pick one of the suggested titles (or the
  original extracted title) before publishing, and shall let the operator re-request
  suggestions.
- **FR-AI-3.** A failure or malformed response from the suggestion request shall not block
  publishing; the suggestions panel shall simply not appear.

### 3.4 Administrative and maintenance utilities

- **FR-ADM-1.** The system shall let the operator create Pinterest boards from the album
  list and rename existing boards to more SEO-friendly names using a maintained
  album-to-board mapping file.
- **FR-ADM-2.** The system shall let the operator regenerate a design's SEO description
  on demand, independent of the publish flow.
- **FR-ADM-3.** The system shall let the operator verify Pinterest connectivity and
  re-run the Pinterest OAuth authorization flow on demand.
- **FR-ADM-4.** The system shall let the operator scan the catalog for designs missing
  expected PDF format variants.
- **FR-ADM-5.** The system shall let the operator re-run the Elastic Beanstalk environment
  restart independent of a publish action (see FR-PUB-8).

## 4. External interface requirements

| Interface | Direction | Purpose |
|---|---|---|
| AWS S3 | Write | Chart, PDF, and preview image upload |
| AWS DynamoDB | Read/write | Catalog (`CrossStitchItems`) and user (`CrossStitchUsers`) tables |
| AWS SES | Send | All subscriber and operator email |
| AWS Elastic Beanstalk | Write | Environment restart after publish |
| Pinterest API v5 | Read/write | Pin creation, board creation/rename, OAuth |
| Anthropic Claude API | Send | SEO description generation, pin-title/board suggestions |
| `Converter.exe` (`uploader/Converter`) | Invoke | PDF kit-variant conversion (separate console app, same monorepo — see `00-Overview.md` §7) |

## 5. Data model

- **`CrossStitchItems`** — the Uploader is the sole writer of new `DESIGN` rows (full field
  set: identifiers, caption, description, notes, dimensions, color count, download counter
  initialized, pin ID). Does not create `ALBUM` rows (seeded manually elsewhere). No
  existence check is performed before write — a colliding key will overwrite the existing
  row.
- **`CrossStitchUsers`** — read via full-table scan for recipient selection (§3.2); written
  via targeted updates for the hygiene actions in FR-MAIL-9.
- Both tables are unversioned (no schema-version attribute); the Uploader's write paths use
  a hard-coded column list with no schema validation against a shared contract.

## 6. Non-functional requirements

- **NFR-1 (No safety net for the publish sequence).** Publishing performs cloud upload,
  Pinterest pin creation, and a catalog write as separate, non-transactional steps (per
  FR-PUB-4 through FR-PUB-7); a failure partway through can leave orphaned uploaded files or
  an orphaned Pinterest pin with no matching catalog row. This SRS records this as a known
  risk (see `00-Overview.md` §6.2), not an accepted target state.
- **NFR-2 (Operator-level, not system-level, send safety).** Per FR-MAIL-4/FR-MAIL-5, only
  the announcement send has a built-in confirmation gate; the platform's "no email sent
  without explicit go-ahead" principle is otherwise enforced by requiring the operator to
  physically click a distinct send button, not by a universal in-app confirmation step. Any
  future automation that triggers these sends programmatically must not bypass this
  human-in-the-loop expectation.
- **NFR-3 (Template validation is manual).** There is no automated linting of email template
  files; a malformed section header is only caught at send time as a runtime failure. The
  operator practice (documented via internal Claude Code skills, not enforced by the
  application) is to send a test email to themselves before any bulk send.
- **NFR-4 (Fragile metadata extraction — known risk).** PDF metadata extraction (FR-PUB-2)
  depends on fixed text markers in the PDF's internal content stream; it is not resilient to
  changes in the upstream PDF-export template and degrades silently to empty/zero values on
  a mismatch, surfaced only as an on-screen review step rather than a hard validation error.
- **NFR-5 (No in-app credential management).** AWS access relies entirely on the operator
  machine's default AWS SDK credential resolution; secrets not resolved this way (Pinterest
  client secret/token, Anthropic API key, unsubscribe signing secret) are read from a
  gitignored local configuration file.
- **NFR-6 (Recipient cap).** The user-email scan used for recipient selection is subject to a
  fixed cap on the number of scanned items per send; this SRS records the cap as a current
  implementation limit that should be revisited if the subscriber base grows past it.
