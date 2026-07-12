# Use Cases — Uploader

**Corresponds to:** `../04-SRS-Uploader.md`

**Date:** 2026-07-11

This document covers the key, non-trivial workflows in the Uploader — the scenarios with
real branching logic, not every FR item individually. Each use case references the SRS
requirement IDs it realizes.

## Index

| ID | Name | Primary actor |
|---|---|---|
| UC-U-01 | Publish a new design batch | Site operator |
| UC-U-02 | Notify subscribers about a new design | Site operator |
| UC-U-03 | Send an announcement email | Site operator |
| UC-U-04 | Get AI-assisted pin-title suggestions | Site operator |
| UC-U-05 | Maintain mailing-list hygiene | Site operator |
| UC-U-06 | Update and hot-reload an email template | Site operator |
| UC-U-07 | Create or rename Pinterest boards for albums | Site operator |

---

## UC-U-01 — Publish a new design batch

**Primary actor:** Site operator.

**Related requirements:** FR-PUB-1 … FR-PUB-9.

**Trigger:** Operator has a finished design batch (chart file, PDF kit variants, preview
images) in a folder and opens the Uploader to publish it.

**Main flow:**
1. Operator selects the batch folder.
2. System validates that the required PDF kit variants are present, then extracts title,
   notes, dimensions, and color count from the PDF content and displays them for review.
3. In parallel, the system requests AI pin-title suggestions (see UC-U-04) without blocking
   the operator from proceeding.
4. Operator reviews the extracted metadata (correcting anything the extraction got wrong is
   out of scope of this system — there is no in-app edit for extracted fields beyond title
   selection) and clicks Upload.
5. System determines the next design ID and global page number from the existing catalog.
6. System converts the PDF kit variants via the external converter tool and uploads the
   converted PDFs, chart file, and preview images to cloud storage.
7. System creates a Pinterest pin for the design (using the operator-selected AI-suggested
   title if one was chosen).
8. System generates an SEO description via an LLM (best-effort — a failure here does not
   stop the flow).
9. System writes the new design's full record to the catalog datastore.
10. System restarts the website's hosting environment so the new design becomes visible.
11. System displays a status log confirming completion and reminding the operator that
    subscriber notification is a separate, explicit next step (see UC-U-02).

**Exception flow (missing required PDFs):** System stops at step 2 with a clear message;
no upload/publish action is attempted.

**Exception flow (Pinterest pin creation fails):** System aborts the flow at step 7 without
writing the catalog record — the operator sees a failure and can retry, but should first
check for orphaned S3 objects from step 6 (see `00-Overview.md` §6.2, no automated
rollback exists).

**Postconditions (success path):** A new `DESIGN` row exists in the catalog with a valid
Pinterest pin ID; the website reflects the new design after the environment restart; no
subscriber email has been sent yet.

---

## UC-U-02 — Notify subscribers about a new design

**Primary actor:** Site operator.

**Related requirements:** FR-MAIL-1, FR-MAIL-2, FR-MAIL-6, FR-MAIL-7, FR-MAIL-8.

**Trigger:** Operator has just published a design (UC-U-01) and is ready to tell
subscribers.

**Main flow:**
1. Operator clicks "Send Emails" (HTML) or "Send Text Emails" (plain-text variant).
2. System selects recipients: verified, subscribed accounts active within the configured
   recency window, excluding any bot-suspect account.
3. System renders each recipient's email from the currently loaded template (see
   UC-U-06 for how templates get updated), substituting the recipient's name and the new
   design's link/image.
4. System attaches a working one-click unsubscribe header and body link, derived from the
   recipient's stored unsubscribe token; a recipient with no such token is skipped.
5. System sends via SES and updates the status log with progress/results.

**Exception flow (malformed template):** If the loaded template is missing a required
section, the send fails immediately (before any email goes out) rather than sending
malformed content to some recipients and not others.

**Exception flow (double-click guard):** While a send is in progress, the triggering button
is disabled, preventing a second concurrent send of the same batch.

**Postconditions:** Subscribers matching the recipient criteria receive the notification;
recipients without a valid unsubscribe token receive nothing (protecting compliance rather
than maximizing reach).

---

## UC-U-03 — Send an announcement email

**Primary actor:** Site operator.

**Related requirements:** FR-MAIL-1, FR-MAIL-3, FR-MAIL-4.

**Trigger:** Operator has a broader announcement to make (not tied to a single new design)
and opens the Announcement send action.

**Main flow:**
1. Operator clicks "Test Announcement Email" first and reviews the admin-only test send.
2. Operator clicks "Send Announcement Emails."
3. System shows a confirmation dialog stating the exact recipient criteria (verified,
   non-unsubscribed, active within the configured recency window) and asks Yes/No.
4. Operator confirms.
5. System selects recipients per the stated criteria and sends, following the same
   template-validation and unsubscribe-token rules as UC-U-02.

**Exception flow (operator declines):** If the operator answers No at step 4, no email is
sent and no recipient list is even materialized.

**Postconditions:** Same as UC-U-02, but this is the only one of the three send actions with
a built-in in-app confirmation step immediately before the real send (per NFR-2 — the other
two rely on the operator's deliberate button click as the safety gate).

---

## UC-U-04 — Get AI-assisted pin-title suggestions

**Primary actor:** Site operator.

**Related requirements:** FR-AI-1, FR-AI-2, FR-AI-3.

**Trigger:** Operator has just selected a batch folder (UC-U-01 step 1).

**Main flow:**
1. System sends the extracted title, album caption, size, and color count to an LLM.
2. LLM returns up to three alternative pin titles (each referencing "cross stitch," each
   taking a different angle) and one suggested board name.
3. System displays the suggestions in a collapsible panel, with the first title
   pre-selected.
4. Operator picks a title (or leaves the original extracted title) and, optionally, clicks
   Re-generate for a fresh set of suggestions.
5. The operator's selected title flows into pin creation in UC-U-01 step 7.

**Exception flow (request fails or returns malformed data):** The suggestions panel simply
does not appear; the operator proceeds with the originally extracted title with no error
interrupting the publish flow.

**Postconditions:** The board suggestion is informational only — it does not change which
board the pin actually goes to (that is still determined by the per-album board mapping);
only the title choice has a real effect on the published pin.

---

## UC-U-05 — Maintain mailing-list hygiene

**Primary actor:** Site operator.

**Related requirements:** FR-MAIL-9.

**Trigger:** Operator notices a data-quality issue (e.g., a batch of addresses that should
be suppressed) or is doing routine list maintenance.

**Main flow (remove suppressed users):**
1. Operator maintains a local suppression list file with addresses that should never
   receive mail again (e.g., hard bounces, spam complaints reported by SES).
2. Operator clicks "Remove Suppressed Users."
3. System deletes any matching user records from the datastore.

**Alternate flow (back-fill missing tracking fields):** Operator runs one of the
"Initialize User CIDs" / "Initialize User Unsubscribe" / "Initialize User Subscriptions"
actions to back-fill a tracking/unsubscribe/subscription field that is missing on older
user records, so that future sends (UC-U-02/UC-U-03) can correctly address and unsubscribe
those users.

**Alternate flow (mark verified):** Operator runs "Mark Users Verified" for accounts known
to be legitimate but stuck unverified (e.g., a verification email that never arrived).

**Postconditions:** The user table's data quality improves for the specific gap addressed;
these are one-off, operator-initiated corrections, not continuously running processes.

---

## UC-U-06 — Update and hot-reload an email template

**Primary actor:** Site operator (often assisted by an AI coding agent for drafting content).

**Related requirements:** FR-MAIL-7, FR-MAIL-8.

**Trigger:** Operator wants to change the wording/design of the "new design" notification or
the announcement email ahead of a send (UC-U-02/UC-U-03).

**Main flow:**
1. Operator (or an assisting AI agent, per the platform's authoring skill for this task)
   edits the relevant template file(s) on disk directly — there is no in-app content editor.
2. Editor follows the required section structure for that template type (e.g.
   `[Subject][Greeting][BeforeImage][ImageWithLink][AfterImage][Unsubscribe][Closing]
   [Signature]` for the HTML new-design template), keeping in mind that only the image-link
   section (and the unsubscribe section's fixed link markup) may contain real HTML — any
   other section renders literally, tags and all.
3. Operator clicks "Reload Email Template" in the Uploader.
4. System re-reads the template files from disk and replaces its in-memory cache.
5. Operator sends a test email to themselves (via the relevant test-send action) to
   visually confirm the change before any bulk send.

**Exception flow (malformed section headers):** If the edited template is missing a
required section, the failure surfaces the first time a send is attempted against it
(UC-U-02/UC-U-03's exception flow), not at reload time — reload itself does not validate
structure.

**Postconditions:** Subsequent sends use the updated template; any send already in progress
at the moment of reload continues using whichever template version it had already started
with for recipients not yet processed.

---

## UC-U-07 — Create or rename Pinterest boards for albums

**Primary actor:** Site operator.

**Related requirements:** FR-ADM-1.

**Trigger:** A new album category is introduced, or existing board names need to become
more SEO-friendly.

**Main flow (create):**
1. Operator clicks "Create Pinterest Boards."
2. System reads the current album list and creates a Pinterest board for any album that
   doesn't yet have one, recording the new board ID for use by future pin creation
   (UC-U-01 step 7, and by autopinner — see `03-SRS-Pinterest-Automation.md` FR-PIN-3).

**Alternate flow (rename):**
1. Operator clicks "Rename Pinterest Boards."
2. System reads the maintained album-to-board mapping file and renames each mapped board on
   Pinterest to a more SEO-oriented name.

**Postconditions:** The album-to-board mapping (consumed by both the Uploader's own pin
creation and autopinner's backfill pinning) reflects the current, correctly-named set of
boards.
