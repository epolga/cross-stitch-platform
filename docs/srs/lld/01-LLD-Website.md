# Low-Level Design — Website (cross-stitch.com)

**Corresponds to:** `../01-SRS-Website.md`, `../use-cases/01-UseCases-Website.md`, `../05-SAD.md`
**Status:** Draft, reverse-engineered from the current implementation
**Date:** 2026-07-11

## 1. Scope

This document adds implementation-level detail beyond the SAD: full data attribute lists,
API request/response shapes, sequence diagrams for the most complex flows, and the specific
logic of algorithms that the SRS only names (rate limiting, download-mode gating, legacy
URL resolution).

## 2. Data dictionary

### 2.1 `CrossStitchItems` — `DESIGN` rows (read-only from this component)

| Attribute | Type | Notes |
|---|---|---|
| `ID` | S (PK) | `ALB#<albumId:D4>` |
| `NPage` | S (SK) | zero-padded 5-digit page number |
| `EntityType` | S | `"DESIGN"` |
| `AlbumID` | N | |
| `DesignID` | N | |
| `Caption` | S | |
| `Description` | S | |
| `Notes` | S | |
| `NColors` | N | |
| `Width`, `Height` | N | in stitches |
| `NDownloaded` | N | incremented by FR-DL-7 |
| `NGlobalPage` | N | global ordering across all albums |
| `PinID` (+ 5 legacy spellings) | S | see `00-Overview.md` §5 |
| `SeoTitle`, `SeoDescription` | S | optional, LLM-generated (Uploader) |
| *(computed, not stored)* `subject`, `orientation`, `sizeCategory`, `colorBucket`, `isBeginnerFriendly` | — | derived at read time from `Width`/`Height`/`NColors`/`Caption` for filter matching |

### 2.2 `CrossStitchUsers` (PK `ID` only)

| Attribute | Type | Notes |
|---|---|---|
| `ID` | S (PK) | |
| `Email` | S | |
| `FirstName` | S | |
| `Password` | S | **plaintext — see NFR-7** |
| `CreatedAt` | S (ISO) | |
| `ReceiveUpdates` | BOOL | newsletter opt-in |
| `UnsubscribeToken` | S | |
| `Unsubscribed` | BOOL | |
| `cid` | S | newsletter click-tracking identifier |
| `VerificationToken`, `VerificationTokenExpiresAt` | S | |
| `Verified`, `VerifiedAt` | BOOL / S | |
| `SubscriptionId`, `SubscriptionActive`, `SubscriptionStartedAt`, `SubscriptionStatusUpdatedAt` | — | PayPal state |
| `TrialStartedAt`, `TrialEndsAt`, `TrialDownloadLimit`, `TrialDownloadsUsed`, `TrialDownloadedDesignIds` | — | free-trial state (`TrialDownloadedDesignIds` is a list, used to prevent double-counting a re-download of the same design) |
| `LastSeenAt`, `LastSeenCount` | S / N | engagement heartbeat |
| `LastEmailDate`, `LastEmailEntry` | — | last-emailed bookkeeping, read by Uploader's recency filter |
| `BotSuspect`, `BotSuspectReason`, `BotSuspectAt` | BOOL / S / S | manually set, no automated writer |

### 2.3 `PasswordResetTokens` (PK `Token`)

| Attribute | Type | Notes |
|---|---|---|
| `Token` | S (PK) | |
| `Email` | S | |
| `CreatedAt` | S | |
| `ExpiresAtEpoch` | N | default now + 7200s |

### 2.4 `SubscriptionEvents` (PK `ID`)

| Attribute | Type | Notes |
|---|---|---|
| `ID` | S (PK) | `SEVT#<iso>#<uuid>` |
| `Source` | S | e.g. `"paypal_webhook"` |
| `EventType` | S | |
| `Status`, `PreviousStatus` | S | |
| `SubscriptionId`, `UserId`, `Email` | S | |

### 2.5 Code-only entities (not in the formal schema doc — confirm live before treating as final)

| Entity | Key fields |
|---|---|
| Saved pattern | owner, name, width, height, palette, grid, hiddenColors, thumbnail — see `02-LLD-Photo-to-Cross-Stitch-Converter.md` |
| Design like/vote | designId, userId/IP, direction (up/down), timestamp |
| Feature request | text, importance, email, pageUrl, status, (editor-only: patternWidth/Height/Colors, editorTimeMs, stitchesChanged) |
| Blog reaction | slug, IP, reactionType, timestamp |
| Search log | query (raw + parsed filters), timestamp |

## 3. API contracts (selected — full route list in SRS §4)

### 3.1 `POST /api/ai-search`

```
Request:  { "query": string }
Response: { "filters": { subject?, minWidth?, maxWidth?, minColors?, maxColors?,
                          sizeCategory?, orientation?, beginnerFriendly? },
            "matchedDesignIds"?: number[] }
```
Internally: sends `query` to Claude with a system prompt constraining output to the known
filter schema; parses the model's JSON response; falls back to an empty filter set (i.e.
unfiltered browse) on a parse failure rather than erroring the request.

### 3.2 `POST /api/designs/[designId]/like`

```
Request:  { "direction": "up" | "down" }
Response: { "upvotes": number, "downvotes": number, "userVote": "up"|"down"|null }
```
`GET` returns the current tallies + the caller's own vote (if identifiable); `DELETE`
removes the caller's vote. Rate-limited 20 req/min/IP (in-memory sliding window, see §5.1).

### 3.3 `POST /api/subscription/download-access`

```
Request:  { "designId": number }
Response: { "granted": boolean, "reason"?: "no_subscription"|"trial_exhausted",
            "trialDownloadsRemaining"?: number }
```
Side effect on `granted: true` while on trial: increments `TrialDownloadsUsed` and appends
`designId` to `TrialDownloadedDesignIds` (idempotent — a design already in that list does
not consume another unit if re-downloaded).

### 3.4 `POST /api/paypal-webhook`

```
Request:  PayPal event envelope (verified via header signature check against PayPal's
          public key/cert, skippable via an env flag for local testing)
Response: 200 (ack) or 4xx (signature/parse failure)
```
On a recognized subscription-lifecycle event type, updates `CrossStitchUsers`
(`SubscriptionActive`, `SubscriptionStatusUpdatedAt`) and appends a `SubscriptionEvents` row
before acknowledging.

## 4. Sequence diagrams

### 4.1 UC-W-01 (download in `paid` mode, trial path)

```
Visitor          Website(API)          CrossStitchUsers        SES
  │  click Download   │                        │                │
  │───────────────────▶│                        │                │
  │                    │ GET /api/config/download-mode           │
  │                    │──────(returns "paid")──▶                │
  │                    │ POST /api/subscription/download-access  │
  │                    │────────────────────────▶│ check active subscription
  │                    │                        │  → none
  │                    │                        │ check trial: TrialEndsAt > now
  │                    │                        │  AND TrialDownloadsUsed < Limit
  │                    │                        │  → granted
  │                    │◀──granted:true─────────│ increment TrialDownloadsUsed
  │                    │                        │ append designId to
  │                    │                        │  TrialDownloadedDesignIds
  │◀──serve PDF────────│                        │                │
  │                    │ POST /api/designs/[id] (increments NDownloaded)
  │                    │────────────────────────▶ CrossStitchItems
```

### 4.2 UC-W-03 (registration + verification)

```
Visitor            Website(API)         CrossStitchUsers        SES
  │ submit form        │                     │                    │
  │────────────────────▶│ score HumanLikelihood (client-side,
  │                    │  sent as part of the notify-admin call)
  │                    │ POST /api/register-only                 │
  │                    │─────────────────────▶│ create row,
  │                    │                     │  Verified=false,
  │                    │                     │  VerificationToken=<uuid>
  │                    │◀────────────────────│                    │
  │                    │──────────send verification email─────────▶│
  │                    │                     │                    │
  │ click email link    │                     │                    │
  │────────────────────▶│ GET /api/register-only/verify?token=…    │
  │                    │─────────────────────▶│ token matches & not
  │                    │                     │  expired → Verified=true
  │◀───logged in────────│                     │                    │
```

## 5. Key algorithm detail

### 5.1 Rate limiter (`src/lib/rateLimit.ts`)

In-memory sliding window, keyed by `x-forwarded-for` (falls back to `x-real-ip`):
`Map<ip, timestamp[]>`; on each request, prune entries older than the window, then check
`entries.length < limit` before allowing and pushing the new timestamp. **Known limitation**
(documented in code): correctness depends on a single running instance — if the site is
ever scaled horizontally, each instance has its own independent map and the effective limit
becomes `limit × instanceCount`.

### 5.2 Download-mode gating decision table

| Mode | Not logged in | Logged in, no sub/trial | Logged in, active trial (unexhausted) | Logged in, active subscription |
|---|---|---|---|---|
| `free` | serve | serve | serve | serve |
| `register` | prompt registration (remember pending download) | serve (registration alone is sufficient) | serve | serve |
| `paid` | prompt registration → then paywall | prompt paywall/trial-start | serve, consume 1 trial unit | serve |
| any mode + allow-listed referrer | serve (bypass) | serve (bypass) | serve (bypass, no trial unit consumed) | serve |

### 5.3 Legacy `.aspx` URL resolution (`[slug]` catch-all)

1. Incoming path matched against the catch-all route.
2. Slug parsed against known legacy patterns:
   `Free-<Album>-Charts.aspx` → album detail; `<Caption>-<AlbumID>-<NPage>-Free-Design.aspx`
   → design detail (album ID and page number extracted directly from the slug, caption used
   only for the human-readable portion of the URL, not for lookup).
3. If a pattern matches, the corresponding modern page is server-rendered directly (no
   client-side redirect) at the legacy URL — search engines see 200, not a redirect chain,
   preserving the original URL's accumulated ranking signal.
4. If a `cid` query parameter is present, fires the admin-notification side effect (FR-AUTH-3)
   independent of which legacy pattern matched.

## 6. Error handling notes

- `POST /api/paypal-webhook`: a failed signature check returns a 4xx and performs no
  DynamoDB write — PayPal's own retry mechanism is relied upon for redelivery, there is no
  local dead-letter queue.
- `/api/ai-search`, `/api/image-search`: an LLM call failure or malformed JSON response
  degrades to an unfiltered/empty-filter search rather than surfacing an error to the
  visitor — treated as a UX-quality issue, not a hard failure.
- Client-side errors are proactively reported to the operator via `POST /api/log-client-error`
  rather than only being visible in browser consoles.
