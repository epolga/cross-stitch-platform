# Low-Level Design — Uploader

**Corresponds to:** `../04-SRS-Uploader.md`, `../use-cases/04-UseCases-Uploader.md`,
`../05-SAD.md`
**Status:** Draft, reverse-engineered from the current implementation
**Date:** 2026-07-11

## 1. Scope

Implementation-level detail for the Uploader: the publish-sequence call order, the PDF
metadata-scraping approach and its fragility, the recipient-selection query logic, and the
email-template contract enforcement.

## 2. Data dictionary (write paths only — read paths are the same tables documented in
`01-LLD-Website.md` §2)

### 2.1 `CrossStitchItems` — DESIGN row written by `InsertItemIntoDynamoDbAsync`

Full column list on insert: `ID`, `NPage`, `AlbumID`, `DesignID`, `EntityType="DESIGN"`,
`Caption`, `Description`, `Notes`, `NColors`, `Width`, `Height`, `NDownloaded` (initialized),
`NGlobalPage`, `PinID`. A raw `PutItemAsync` call with no prior `GetItem`/conditional
check — a colliding `ID`/`NPage` key silently overwrites the existing row rather than
failing.

### 2.2 `CrossStitchUsers` — fields touched by hygiene helpers (§5.4)

`cid`, `Verified`/`VerifiedAt`, `Unsubscribed`, `UnsubscribeToken`, `LastEmailDate`,
`SubscriptionStartedAt` — each hygiene action targets a specific subset of these via
`UpdateItemAsync`, not a full-row rewrite.

## 3. Publish sequence — exact call order (`RunFullUploadFlowAsync`)

```
1. Query DesignsByID-index (max DesignID) → next DesignID = max + 1
2. Query Designs-index    (max NGlobalPage) → next NGlobalPage = max + 1
3. ConvertPdfForUploadAsync: shell out to external Converter.exe against 1.pdf/3.pdf/5.pdf
     → produces <name>.converted.pdf per input
4. S3 upload (AmazonS3Client + TransferUtility, bucket cross-stitch-designs):
     - charts/{designId:D5}_{title}.scc
     - pdfs/{albumId}/Stitch{designId}_Kit.pdf                    (primary/legacy key)
     - pdfs/{albumId}/{designId}/Stitch{designId}_{1,3,5}_Kit.pdf (per-variant keys)
     - photos/... (JPG preview(s))
5. PinterestUploader.UploadPinForPatternAsync (shared lib) — titleOverride = operator's
   selected AI suggestion if one was chosen (§5.1), else the extracted title.
     → ABORT the whole flow if no pin ID is returned (no DynamoDB write happens downstream)
6. SeoTextGenerator.GenerateAsync (Claude Haiku) — best-effort, failure does not abort
7. InsertItemIntoDynamoDbAsync — see §2.1 (this is the point of no return for "the design
   now exists in the catalog," though S3 objects and the Pinterest pin already exist from
   steps 4–5 regardless of whether step 7 succeeds)
8. ElasticBeanstalkHelper.RestartEnvironmentAsync
9. status log: "Done. Use Send Emails when you're ready to notify." — no automatic
   transition into any send flow
```

No step has a compensating action if a later step fails — e.g. if step 7 throws, steps 4–5
have already created real S3 objects and a real Pinterest pin with nothing in
`CrossStitchItems` pointing at them (the orphan risk documented in `00-Overview.md` §6.2 and
`04-SRS-Uploader.md` NFR-1).

## 4. PDF metadata extraction (`PatternInfo.cs`)

Not a structured PDF parse — a fixed-marker byte-string scrape of `1.pdf`'s internal
PostScript/text content stream:

| Field | Extraction approach |
|---|---|
| Title | Fixed text marker search in the raw PDF content stream |
| Notes | Fixed markers for Material Type / Sewing Count / Design Size / etc., concatenated |
| Width/Height | Regex-style delimiter match against the Notes text: `"Design Size: {w} x {h} stitches<br"` |
| Color count | Count of `(D.M.C.)` occurrences in the content stream (one per thread-color line item in the PDF's own generated key table) |

**Fragility, by construction**: every one of these is a positional/textual assumption about
how the upstream PDF-export template formats its content stream. None of it validates
against a schema or a structured PDF object model — a template change (even a cosmetic
wording change to "Design Size:") breaks extraction silently, degrading to empty/zero
values that are only caught by the operator visually reviewing the pre-upload panel (there
is no hard validation gate forcing a non-empty title before upload proceeds).

## 5. Algorithm / workflow detail

### 5.1 AI pin-suggestion request (`PinSuggestionsGenerator.cs`)

```
POST https://api.anthropic.com/v1/messages
  model: claude-sonnet-4-6, max_tokens: 300
  input: pattern title, album caption, size, color count, (optional) board-name list
         loaded from AlbumBoards.csv via LoadBoardNames()
  requested output: 3 title alternatives (each must include "cross stitch"; different
         angles — keyword-led / size-difficulty-led / emotional) + 1 suggested board name
  on any failure/timeout/malformed JSON → return null (caller shows no suggestions panel,
         does not surface an error to the operator)
```
Fired as `_ = LoadSuggestionsAsync()` (fire-and-forget) immediately after folder selection,
in parallel with the operator reviewing extracted PDF metadata — by the time the operator
reaches the Upload button, suggestions have usually already arrived. The suggested board
name is never consumed by the actual pin-creation call (§3 step 5 resolves the board via
`AlbumBoards.csv` independent of this suggestion) — it exists purely as an operator hint.

### 5.2 Recipient selection (`FetchAllUserEmailsAsync`)

```
Scan CrossStitchUsers (full table scan, config UsersTableName)
  hard cap: nSendingLimit = 220 items scanned  ← NOT 220 recipients necessarily;
            this is a scan-item cap, so filtered-out rows still consume it
  always exclude: BotSuspect == true
  if onlyVerified:   require Verified == true
  if onlySubscribed: require Unsubscribed == false
  if minLastEmailEntryOrVerifiedAtUtc set: require max(LastEmailEntry, VerifiedAt) >= cutoff
  if minLastSeenAtUtc set: require LastSeenAt >= cutoff
  require non-empty UnsubscribeToken (recipients without one are dropped, not sent
         a no-unsubscribe email)
```

| Send action | Filters applied |
|---|---|
| New-design HTML / text-only | `onlyVerified=true`, `onlySubscribed=true`, recency = 2 months (email-activity or verification) |
| Announcement | `onlyVerified=true`, `onlySubscribed=true` (implied by "non-unsubscribed"), recency = 3 months (site-visit-based, `LastSeenAt`) |

**Known limit**: the 220-item scan cap means, on a subscriber base meaningfully larger than
that, a single send action does not necessarily reach every eligible recipient in one run —
this is a current implementation ceiling (`04-SRS-Uploader.md` NFR-6), not a deliberate
segmentation strategy.

### 5.3 Send mechanism and template contract (`EmailHelper.SendEmailAsync`, shared lib)

```
if custom headers needed (List-Unsubscribe, List-Unsubscribe-Post) → build raw MIME:
    base64 multipart/alternative (text + HTML parts), RFC 2047 subject encoding for
    non-ASCII, then AmazonSimpleEmailServiceClient.SendRawEmailAsync
else → plain AmazonSimpleEmailServiceClient.SendEmailAsync
every send: attach SesConfigurationSetName for SES event tracking
```

Template required-section validation happens at **render time**, per template type:

| Template file | Required sections (in order) |
|---|---|
| `HtmlEmailTemplate.txt` | `[Subject][Greeting][BeforeImage][ImageWithLink][AfterImage][Unsubscribe][Closing][Signature]` |
| `TextEmailTemplate.txt` | `[Subject][Greeting][BeforeBody][AfterBody][Unsubscribe][Closing][Signature]` |
| `AnnouncementEmailHtml.txt` / `AnnouncementEmailText.txt` | `[Subject][Greeting][Body1][EditorLink][Body2][Unsubscribe][Closing][Signature]` |

A template missing any required section throws at the first render attempt of a send (not
at "Reload Email Template" time — reload only replaces the in-memory cache, it does not
parse/validate). Only the `[ImageWithLink]` section (and the fixed unsubscribe-link markup
inside `[Unsubscribe]`) is rendered as real HTML; every other section's content is escaped/
rendered literally, so an edited template that includes ad hoc `<b>`/`<a>` tags in, say,
`[Greeting]` will show the literal tag text to recipients, not formatted text.

### 5.4 Mailing-list hygiene actions (button → operation mapping)

| Button | Operation |
|---|---|
| Remove Suppressed Users | Read `uploader/data/list-suppressed.txt` → `DeleteItemAsync` per matching `CrossStitchUsers` row |
| Mark Users Verified | Targeted `UpdateItemAsync` setting `Verified=true`/`VerifiedAt` for specified account(s) |
| Initialize User CIDs | Back-fill missing `cid` values |
| Initialize CrossStitchItems User CIDs | Same back-fill, applied to legacy `EntityType="USER"` rows in `CrossStitchItems` |
| Initialize User Unsubscribe | Back-fill missing `UnsubscribeToken` |
| Initialize User Subscriptions | Back-fill missing `SubscriptionStartedAt`-family fields |

## 6. Sequence diagram — UC-U-01 (publish), failure-path emphasis

```
Operator      Uploader UI       Converter.exe    S3         Pinterest API    DynamoDB      EB
   │ click Upload  │                  │            │              │              │           │
   │───────────────▶│ compute next     │            │              │              │           │
   │                │ DesignID/       │            │              │              │           │
   │                │ NGlobalPage ────────────────────────────────────────────────▶            │
   │                │◀───────────────────────────────────────────────────────────│             │
   │                │──convert 1/3/5.pdf──▶            │              │              │           │
   │                │◀───converted PDFs───│            │              │              │           │
   │                │──upload SCC/PDF/JPG──────────────▶ (S3 objects now exist,      │           │
   │                │                                   regardless of what follows)  │           │
   │                │──create pin──────────────────────────────────▶│              │           │
   │                │   ┌─ if this fails: ABORT here. S3 objects from the previous   │           │
   │                │   │  step are now orphaned — no compensating delete runs.      │           │
   │                │   └─────────────────────────────────────────────────────────  │           │
   │                │◀──pin ID─────────────────────────────────────│              │           │
   │                │──generate SEO text (best-effort)─▶ Claude Haiku               │           │
   │                │──write DESIGN row──────────────────────────────────────────────▶            │
   │                │   ┌─ if THIS fails: S3 objects AND the Pinterest pin now both  │           │
   │                │   │  exist with no catalog row pointing at them.               │           │
   │                │   └──────────────────────────────────────────────────────────│             │
   │                │──restart environment────────────────────────────────────────────────────────▶
   │◀──"Done. Use Send Emails when ready."──│            │              │              │           │
```

## 7. Error handling notes

- The publish flow has exactly two hard-abort points (Pinterest pin creation failure, and —
  implicitly, since it's a direct `PutItemAsync` — a DynamoDB failure at step 7), and one
  best-effort step (SEO text generation) that never aborts. There is no unified
  try/catch/rollback wrapper around the whole sequence.
- `EC2Helper.cs` exists in the codebase (reboot-by-tag) but is never called from
  `MainWindow.xaml.cs` — a dead code path superseded by `ElasticBeanstalkHelper`, worth
  removing rather than maintaining as apparent-but-unused functionality.
- `EtsyHelper.cs` is explicitly commented as an example/scaffold with placeholder
  credentials and is not wired to any UI control — not a live error-handling concern since
  it cannot currently be invoked, but a maintenance trap if someone wires a button to it
  assuming it's production-ready.
