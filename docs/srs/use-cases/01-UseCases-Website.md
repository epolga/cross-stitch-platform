# Use Cases — Website (cross-stitch.com)

**Corresponds to:** `../01-SRS-Website.md`

**Date:** 2026-07-11

This document covers the key, non-trivial user journeys on the website — the scenarios
with real branching logic, not every FR item from the SRS individually. Each use case
references the SRS requirement IDs it realizes.

## Index

| ID | Name | Primary actor |
|---|---|---|
| UC-W-01 | Download a design | Visitor / Registered user |
| UC-W-02 | Discover a design via AI-powered search | Visitor |
| UC-W-03 | Register and verify a new account | Visitor |
| UC-W-04 | Subscribe to a paid plan | Registered user |
| UC-W-05 | Vote on a design | Registered user |
| UC-W-06 | Submit in-context feedback | Visitor / Registered user |
| UC-W-07 | Reset a forgotten password | Registered user |
| UC-W-08 | Triage feature requests | Site operator |

---

## UC-W-01 — Download a design

**Primary actor:** Visitor (unauthenticated), Registered user, or Subscriber, depending on
site-wide download mode.

**Related requirements:** FR-DL-1 … FR-DL-9.

**Trigger:** The actor clicks the download button on a design page.

**Preconditions:** The site is running in one of three modes: `free`, `register`, or
`paid`.

**Main flow (mode = `free`):**
1. Actor opens a design page and clicks Download.
2. System serves the chosen chart-format PDF directly.
3. System increments the design's download counter.

**Alternate flow A (mode = `register`, actor not logged in):**
1. Actor clicks Download.
2. System detects no session and opens the registration dialog, remembering the pending
   download.
3. Actor registers (see UC-W-03) and, if required, verifies their email.
4. On successful login, system automatically resumes the pending download (step 2–3 of the
   main flow).

**Alternate flow B (mode = `paid`, actor not logged in or has no access):**
1. Actor clicks Download.
2. System checks for an active subscription or an active, unexhausted trial.
3. If neither exists, system redirects the actor to the plan-selection/checkout page
   (PayPal) or offers to start a free trial.
4. Once access is confirmed (subscription active or trial has remaining allowance), system
   consumes one trial download unit (if on trial) and serves the PDF, then resumes as in the
   main flow.

**Alternate flow C (referrer bypass):** If the request's referrer matches an allow-listed
partner domain, the system skips the register/paid gate entirely and serves the file as in
the `free` main flow, regardless of the site's configured mode.

**Alternate flow D (missing new-format PDF):** If the requested chart-format PDF does not
exist for this design, the system falls back to the design's legacy single-PDF file instead
of failing the download.

**Postconditions:** The design's download counter is incremented; if on a trial, the trial's
used-download count is incremented; a pending-download marker, if any, is cleared.

**Exception:** If the actor abandons the registration/payment step, the pending-download
marker persists client-side so the download resumes automatically on a later visit once
access is granted.

---

## UC-W-02 — Discover a design via AI-powered search

**Primary actor:** Visitor.

**Related requirements:** FR-SRCH-1 … FR-SRCH-6.

**Trigger:** The actor enters a free-text query or uploads a photo into the homepage search
bar.

**Main flow (text query):**
1. Actor types a natural-language query (e.g., "a small beginner-friendly cat pattern").
2. System sends the query to an LLM, which returns structured filters (subject, size,
   color-count range, beginner flag, etc.).
3. System queries the catalog with the derived filters and displays matching designs.
4. System also surfaces related-search suggestions the actor can click to refine further.

**Alternate flow (image query):**
1. Actor uploads a reference photo instead of typing text.
2. System sends the photo to an LLM for a textual description.
3. System runs semantic search using that description in place of a typed query, then
   continues as step 3 of the main flow.

**Alternate flow (personalized section, no explicit query):**
1. Actor browses the homepage without searching.
2. System reads the actor's recently-viewed design IDs (tracked client-side, no login
   required) and shows a "you may also like" section using precomputed similar-design
   neighbor lists.

**Postconditions:** The actor sees a set of candidate designs relevant to their query or
recent browsing, with no account required at any point in this use case.

---

## UC-W-03 — Register and verify a new account

**Primary actor:** Visitor.

**Related requirements:** FR-AUTH-1, FR-AUTH-2, FR-AUTH-3, FR-AUTH-7, FR-AUTH-8.

**Trigger:** The actor opens the registration form (directly, or as part of UC-W-01
alternate flow A/B).

**Main flow:**
1. Actor enters email, password, first name; the "receive updates" (newsletter) checkbox
   is pre-checked.
2. System's client-side behavioral heuristic scores the interaction (mouse/keyboard/touch/
   scroll signals) as an aid for later abuse triage, and includes this score in the
   admin-notification email sent when the form opens.
3. System creates the account. In `register` or `paid` mode, the account starts unverified
   and the system emails a verification link.
4. Actor clicks the verification link; system marks the account verified.
5. Actor is now logged in.

**Alternate flow (returning subscriber via magic link):**
1. Actor clicks a newsletter link containing an encoded identifier.
2. System recognizes the identifier, logs the actor in without a password prompt, and
   notifies the operator by email that this tracked link was opened.

**Exception flow (bot-suspect account):** If the account (or the email address matches one)
is flagged `BotSuspect`, both password login and magic-link login are rejected regardless of
verification status.

**Postconditions:** A new `CrossStitchUsers` row exists; the actor is authenticated; if
`receiveUpdates` was checked, the account is eligible for future subscriber emails sent from
the Uploader.

---

## UC-W-04 — Subscribe to a paid plan

**Primary actor:** Registered user (site in `paid` download mode).

**Related requirements:** FR-MON-3, FR-MON-4, FR-MON-5, FR-MON-6, FR-DL-4.

**Trigger:** The actor reaches the plan-selection step (directly, or via UC-W-01 alternate
flow B).

**Main flow:**
1. Actor chooses monthly or annual plan and completes checkout through the embedded PayPal
   flow.
2. PayPal sends a subscription-lifecycle event to the site's webhook.
3. System verifies the webhook signature, updates the user's subscription state to active,
   and records the event to the subscription audit trail.
4. System confirms the subscription client-side and grants download access.

**Alternate flow (trial instead of immediate purchase):**
1. Actor chooses to start a free trial instead of paying immediately.
2. System grants a trial with a configured expiry date and download allowance, tracked on
   the user's record.
3. Actor downloads under the trial (see UC-W-01 alternate flow B) until the trial expires or
   its download allowance is exhausted, at which point the actor is routed back into this
   use case's main flow.

**Postconditions:** The user's subscription/trial state accurately reflects PayPal's record
of truth; every state transition is captured in the subscription audit trail regardless of
which flow was taken.

---

## UC-W-05 — Vote on a design

**Primary actor:** Registered user.

**Related requirements:** FR-ENG-1, FR-ENG-2, NFR-3 (rate limiting).

**Main flow:**
1. Actor (logged in) clicks up-vote or down-vote on a design page.
2. System records or updates the actor's vote for that design.
3. Actor can later view their full vote history at `/profile/votes`.

**Exception flow (rate limit):** If the actor's IP has exceeded 20 vote-related requests in
the past minute, the system rejects the request without recording a vote.

**Postconditions:** The design's aggregate vote tally reflects the change; the actor's own
vote state is idempotent (re-clicking the same vote removes it; clicking the opposite vote
replaces it).

---

## UC-W-06 — Submit in-context feedback

**Primary actor:** Visitor or Registered user, anywhere on the site (most commonly from the
pattern editor).

**Related requirements:** FR-ENG-6 (site-wide); FR-FBK-1 (editor-specific fields — see
`02-UseCases-Photo-to-Cross-Stitch-Converter.md`).

**Main flow:**
1. Actor opens the feedback widget and writes a message, optionally rating its importance.
2. System captures the message together with contextual metadata (current page URL, and,
   if submitted from the editor, pattern dimensions/color count/time spent/stitches
   changed).
3. System stores the submission for operator review (see UC-W-08).

**Postconditions:** A new feature-request record exists with status "new," visible to the
operator.

---

## UC-W-07 — Reset a forgotten password

**Primary actor:** Registered user.

**Related requirements:** FR-AUTH-4.

**Main flow:**
1. Actor requests a password reset by email address.
2. System generates a single-use token (default 2-hour expiry) and emails a reset link.
3. Actor opens the link before it expires and sets a new password.
4. System invalidates the token after use.

**Exception flow (expired or reused token):** System rejects the reset attempt and prompts
the actor to request a new link.

**Postconditions:** The account's password is updated; the used token can no longer be
replayed.

---

## UC-W-08 — Triage feature requests

**Primary actor:** Site operator.

**Related requirements:** FR-ADM-1.

**Trigger:** Operator opens `/admin/feature-requests`.

**Main flow:**
1. System lists submitted feedback (from UC-W-06), most recent first, with the captured
   context for each.
2. Operator reviews an item and updates its status (e.g., acknowledged, done, deferred).
3. Operator may act outside the system on the feedback (e.g., ship a fix, reply by email)
   — this system does not itself close the loop with the submitter.

**Precondition:** Operator's session passes the admin-status check (FR-AUTH-6).

**Postconditions:** The feature request's status reflects the operator's triage decision,
providing a record of what has and hasn't been addressed.
