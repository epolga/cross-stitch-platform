# Test Cases — Uploader

**Derived from:** `../use-cases/04-UseCases-Uploader.md`

**Status:** Draft. Per `../09-Test-Plan.md` §2, no .NET test project exists for the Uploader
— every test case below is currently manual-only (verified by the operator clicking through
the UI) or unexercised. Several rows note the operator's own existing manual-verification
habits (test-send buttons) as the *current* substitute for automated coverage, per
`04-SRS-Uploader.md` NFR-3.

## TC set for UC-U-01 — Publish a new design batch

| ID | Title | Priority | Steps (condensed) | Expected result |
|---|---|---|---|---|
| TC-U-01-01 | Missing required PDFs blocks folder selection | High | 1. Select a folder missing `3.pdf`. | Flow stops at validation; no upload/publish action attempted. |
| TC-U-01-02 | Metadata extraction populates the review panel | High | 1. Select a valid batch folder. | Title/Notes/Width/Height/Colors panel populated from `1.pdf` content. |
| TC-U-01-03 | Metadata extraction degrades silently on a template mismatch | High | 1. Select a batch whose `1.pdf` uses altered marker text (simulating an upstream export-template change). | Fields show empty/zero values with no hard error — confirms the fragility documented in `04-LLD-Uploader.md` §4; operator must catch this visually since there's no validation gate. |
| TC-U-01-04 | DesignID/NGlobalPage are computed as max+1 | High | 1. Seed the catalog with a known max `DesignID`/`NGlobalPage`. 2. Publish a new design. | New design's IDs are exactly max+1 in each case. |
| TC-U-01-05 | Pin-creation failure aborts before the DynamoDB write | High | 1. Mock the Pinterest upload call to fail. 2. Attempt publish. | No `DESIGN` row written; S3 objects from the earlier step remain (documented orphan risk, not remediated by this test — the test's purpose is to confirm the *abort point*, not to fix the gap). |
| TC-U-01-06 | SEO text generation failure does not abort the flow | Medium | 1. Mock the SEO-generation call to fail. 2. Attempt publish. | Publish completes; `SeoDescription` left unset/blank rather than blocking the whole sequence. |
| TC-U-01-07 | Successful publish writes the full DESIGN row | High | 1. Complete a full publish with all dependencies succeeding. | `CrossStitchItems` row contains all documented fields (`04-LLD-Uploader.md` §2.1), including the pin ID under the canonical `PinID` attribute. |
| TC-U-01-08 | Environment restart is triggered after every successful publish | Medium | 1. Complete a publish. | Elastic Beanstalk restart call is made exactly once. |
| TC-U-01-09 | Colliding key silently overwrites | Medium | 1. Publish a design whose computed `ID`/`NPage` collides with an existing row (contrived test setup). | Existing row is overwritten with no warning — confirms the documented no-existence-check gap (`04-LLD-Uploader.md` §2.1), not a desired behavior to preserve going forward without flagging it. |

## TC set for UC-U-02 — Notify subscribers about a new design

| ID | Title | Priority | Steps (condensed) | Expected result |
|---|---|---|---|---|
| TC-U-02-01 | Recipient filter excludes bot-suspect accounts | High | 1. Seed a `BotSuspect:true` account that otherwise matches all criteria. 2. Send. | That account receives nothing. |
| TC-U-02-02 | Recipient filter requires verified + subscribed + recent | High | 1. Seed accounts each failing exactly one criterion (unverified / unsubscribed / stale `LastEmailEntry`). 2. Send. | None of the three receive the email. |
| TC-U-02-03 | Recipients without an unsubscribe token are skipped | High | 1. Seed an otherwise-eligible account with `UnsubscribeToken` empty/missing. 2. Send. | That account is excluded, not sent an email lacking a working unsubscribe link. |
| TC-U-02-04 | Malformed template aborts before any send | High | 1. Corrupt `HtmlEmailTemplate.txt` (remove a required section header). 2. Trigger a send. | Send fails immediately with a section-parsing error; zero emails go out (not a partial send). |
| TC-U-02-05 | Double-click is guarded | Medium | 1. Click Send Emails twice in rapid succession. | Second click is a no-op while the first send is in progress (button disabled). |
| TC-U-02-06 | Text-only send uses the text template's own section set | Medium | 1. Trigger the text-only send. | Renders against `TextEmailTemplate.txt`'s required sections, not the HTML template's. |

## TC set for UC-U-03 — Send an announcement email

| ID | Title | Priority | Steps (condensed) | Expected result |
|---|---|---|---|---|
| TC-U-03-01 | Confirmation dialog blocks the send until answered | High | 1. Click Send Announcement Emails. | Send does not proceed until Yes/No is answered; No aborts with zero emails sent. |
| TC-U-03-02 | Recipient criteria differ from the new-design send (3-month site-visit recency, not 2-month email recency) | High | 1. Seed a user active by `LastSeenAt` within 3 months but with a stale `LastEmailEntry`. 2. Send announcement. | User is included (announcement uses `LastSeenAt`, per `04-LLD-Uploader.md` §5.2), even though the same user would be excluded from a new-design send. |
| TC-U-03-03 | Test-announcement send reaches only the admin | Medium | 1. Click "Test Announcement Email." | Only the configured admin address receives it, regardless of the real recipient list size. |

## TC set for UC-U-04 — Get AI-assisted pin-title suggestions

| ID | Title | Priority | Steps (condensed) | Expected result |
|---|---|---|---|---|
| TC-U-04-01 | Suggestions appear after folder selection without blocking metadata review | Medium | 1. Select a batch folder. | Extracted-metadata panel is usable immediately; suggestions panel appears once the (async) LLM call returns. |
| TC-U-04-02 | Failed/malformed LLM response hides the panel without erroring the flow | High | 1. Mock the Anthropic call to fail or return malformed JSON. 2. Select a folder. | No suggestions panel shown; publish flow proceeds normally using the extracted title. |
| TC-U-04-03 | Selected suggestion flows into the actual pin title | High | 1. Select a suggested title. 2. Publish. | The created Pinterest pin's title matches the selected suggestion, not the originally extracted title. |
| TC-U-04-04 | Suggested board name does not affect actual board selection | Medium | 1. Select a folder where the suggested board differs from the `AlbumBoards.csv` mapping. 2. Publish. | Pin is created on the `AlbumBoards.csv`-mapped board, not the suggested one. |

## TC set for UC-U-05 — Maintain mailing-list hygiene

| ID | Title | Priority | Steps (condensed) | Expected result |
|---|---|---|---|---|
| TC-U-05-01 | Suppressed addresses are removed | Medium | 1. Add a test address to `list-suppressed.txt`. 2. Run "Remove Suppressed Users." | Matching `CrossStitchUsers` row is deleted. |
| TC-U-05-02 | Non-matching addresses are untouched | Low | 1. Run the same action with an address not in the suppression list. | That row is unaffected. |
| TC-U-05-03 | Back-fill actions only touch the targeted field | Medium | 1. Run "Initialize User Unsubscribe" on an account missing `UnsubscribeToken`. | Only `UnsubscribeToken` is set; other fields unchanged. |

## TC set for UC-U-06 — Update and hot-reload an email template

| ID | Title | Priority | Steps (condensed) | Expected result |
|---|---|---|---|---|
| TC-U-06-01 | Reload replaces the in-memory cache without a restart | High | 1. Edit a template file on disk. 2. Click "Reload Email Template." 3. Trigger a test send. | Test send reflects the edited content. |
| TC-U-06-02 | Reload does not validate structure | Medium | 1. Introduce a missing required section. 2. Click Reload. | Reload itself succeeds with no error; the structural problem only surfaces on the next actual send attempt (confirms the documented gap — reload ≠ validate). |
| TC-U-06-03 | Mid-send reload only affects subsequently-processed recipients | Low | 1. Start a large send. 2. Reload the template partway through (requires a large enough recipient batch to make this timing-observable). | Recipients already processed keep the old content; later recipients in the same run get the new content. |
| TC-U-06-04 | Non-`[ImageWithLink]` sections render tags literally | Medium | 1. Add an `<b>` tag inside `[Greeting]`. 2. Send a test email. | Recipient sees the literal tag text, not bold formatting. |

## TC set for UC-U-07 — Create or rename Pinterest boards for albums

| ID | Title | Priority | Steps (condensed) | Expected result |
|---|---|---|---|---|
| TC-U-07-01 | Create-boards skips albums that already have a board | Medium | 1. Run "Create Pinterest Boards" with a mix of mapped and unmapped albums. | Only unmapped albums get new boards created. |
| TC-U-07-02 | Rename applies the CSV-configured name | Medium | 1. Update `AlbumBoards.csv` with a new name for a board. 2. Run "Rename Pinterest Boards." | The corresponding Pinterest board's name is updated to match. |
| TC-U-07-03 | Newly created board ID is available to the next publish | High | 1. Create a board for a previously-unmapped album. 2. Publish a design in that album. | Pin creation succeeds and lands on the new board — confirms the mapping used by `UC-U-01` reads the up-to-date CSV. |
