# API Specification — cross-stitch.com Web App

**Covers:** every route under `web/src/app/api/` — spans both `01-SRS-Website.md` and
`02-SRS-Photo-to-Cross-Stitch-Converter.md`, since both live in the same Next.js app and
share the same auth/rate-limit infrastructure. No other component in the platform exposes
an HTTP API of its own (Pinterest-automation and Uploader are consumers/schedulers, not API
providers — see `00-Overview.md`).
**Status:** Draft, verified against route source files (not inferred)
**Date:** 2026-07-11
**Base URL:** `https://cross-stitch.com/api`

## 1. Shared infrastructure

| Mechanism | Implementation | Notes |
|---|---|---|
| Session | `web/src/lib/session.ts` — JWT (HS256, `jose`), httpOnly cookie `cs_session`, 30-day expiry, secret from `SESSION_SECRET` | `getSession(request)` → `{userId, email}` or `null` |
| Admin check | `web/src/lib/admin-auth.ts` `requireAdmin(request)` | 401 if no session, 403 if `session.email` not in comma-separated `ADMIN_EMAILS` env |
| Rate limiting | `web/src/lib/rateLimit.ts` `createRateLimiter(windowMs, max)` | In-memory sliding window, keyed by IP (`x-forwarded-for` → `x-real-ip`); **per-process only**, does not hold across multiple Elastic Beanstalk instances |
| Error envelope | Every route returns `{ error: string }` (or a route-specific field, e.g. `{ ok: false, error }`) on failure | No platform-wide standardized error schema — each route defines its own field name |

## 2. Auth, registration, and subscription

| Route | Method | Auth | Rate limit |
|---|---|---|---|
| `/auth/login` | POST | none | — |
| `/auth/logout` | POST | none | — |
| `/auth/forgot-password` | POST | none | — |
| `/auth/request-password-reset` | POST | none | — |
| `/auth/reset-password` | POST | none | — |
| `/auth/last-seen` | POST | none | — |
| `/auth/login-from-email` | POST | `cid` token in body | — |
| `/register-only` | POST | none | — |
| `/register-only/verify` | GET | token in query | — |
| `/trial/start` | POST | none (email in body) | — |
| `/subscription/status` | POST | none (email in body) | — |
| `/subscription/confirm` | POST | none | — |
| `/subscription/download-access` | POST | none (email in body) | — |
| `/subscription/plan` | POST | none | — |
| `/paypal-webhook` | POST | PayPal signature (skippable via env for local testing) | — |

### POST `/auth/login`
```
Request:  { email: string, password: string }
200:      { success: true, email, firstName }  — sets cs_session cookie
400:      { error }                              — missing fields
401:      { error: "Invalid email or password" }
500:      { error }
```
Side effect: updates `LastSeenAt` (best-effort). If the email is in `ADMIN_EMAILS`, also
sets a 10-year non-httpOnly `no_track` cookie.

### POST `/auth/request-password-reset`
```
Request:  { email: string }
200:      { ok: true, message: "If this email is registered..." }
400:      { error: "Email is required" }
```
**Deliberately returns 200 with the same message whether or not the email exists** — even
on an internal error — to avoid leaking account existence. Side effect (only if the account
exists): creates a reset token and emails a reset link.

### POST `/auth/reset-password`
```
Request:  { token: string, password: string, confirmPassword: string }
200:      { ok: true, message: "Password has been updated." }
400:      { error }  — missing token / mismatch / password < 6 chars / token invalid-or-expired
500:      { error: "Unexpected server error" }
```
Token is single-use — `consumePasswordResetToken` invalidates it on a successful reset.

### POST `/register-only`
```
Request:  { email, firstName, password, sourceInfo?: { source?, designUrl?, designCaption? } }
200:      { ok: true, message: "Please check your email to verify your address." }
400:      { error: "Missing required fields" }
409:      { error: "Email already registered" }
```
Creates the user with a 48h-expiry `verificationToken` and `startTrial: true`; emails a
verification link to `GET /register-only/verify`.

### GET `/register-only/verify?token=…&redirect=…`
```
200:      { ok: true, message: "Email verified" }               — if no cid on the account
302:      redirect to `redirect` (or site root) + ?cid=<cid>&eid=verified  — if cid present
400:      { error: "Missing verification token" } / { error: "Invalid or expired token" }
```

### POST `/trial/start`
```
Request:  { email, password?, firstName?, username?, receiveUpdates?, registrationSource? }
200:      { outcome: StartTrialOutcome, trial: UserTrialStatus | null, subscription: UserSubscriptionStatus | null }
400:      { error: "Email is required" } / { error: "Password and first name are required..." }
```
Trial parameters (`TRIAL_DOWNLOAD_LIMIT` default 10, `TRIAL_DURATION_DAYS` default 30) are
env-configured.

### POST `/subscription/status`
```
Request:  { email: string }
200:      { active, status: 'NONE'|'INACTIVE_RECORDED'|'ACTIVE_RECORDED', canDownload,
            subscription: { id, active, startedAt? }, trial: UserTrialStatus & { durationDays } }
```

### POST `/subscription/download-access`
```
Request:  { email, designId?, consume?: boolean }
200:      DownloadAccessResult = { allowed, reason: DownloadAccessReason, subscriptionActive, counted, trial }
400:      { error: "Email is required" } / { error: "Valid designId is required" }
```
With `consume: true` and `designId`, increments the trial's used-download counter as a side
effect (idempotent per design — see `01-LLD-Website.md` §2.2 `TrialDownloadedDesignIds`).

### POST `/subscription/plan`
```
200: { monthlyPlanId, yearlyPlanId }   — from PAYPAL_MONTHLY_PLAN_ID / PAYPAL_YEARLY_PLAN_ID
                                          env, or hardcoded defaults if unset
```

### POST `/paypal-webhook`
```
Request:  raw PayPal event JSON (event_type, resource.id, ...)
200:      { status: "success" }
400:      { error: "Invalid webhook signature" }
500:      { error: "Server configuration error" } / { error: "Authentication failed" } / { error: "Internal server error" }
```
Handles `BILLING.SUBSCRIPTION.ACTIVATED`/`RE-ACTIVATED` (activate) and
`CANCELLED`/`SUSPENDED`/`EXPIRED` (deactivate). Every webhook received — plus every status
change — also triggers an internal POST to `/notify-admin`.

## 3. Designs and albums

| Route | Method | Auth | Rate limit |
|---|---|---|---|
| `/designs` | GET | none | — |
| `/designs/[designId]` | GET | none | — |
| `/designs/[designId]` | POST | none | 20/min/IP |
| `/designs/[designId]/like` | GET/POST/DELETE | none¹ | 20/min/IP (shared bucket) |
| `/albums/[albumId]` | GET | none | — |

¹ If a caller supplies both a session cookie *and* an email, they must match (403 on
mismatch) — otherwise no authentication is required (email is the identity key, not the
session).

### GET `/designs?pageSize=10&nPage=1`
```
200: { designs: Design[], entryCount, page, pageSize, totalPages }
500: { error: "Failed to fetch designs: ..." }
```
`Design` fields: `DesignID, AlbumID, Caption, Description, NColors, NDownloaded, Width,
Height, Notes, Text, NPage, ImageUrl?, PdfUrl?, PinterestPinId?, PinterestPinUrl?,
NGlobalPage, SeoDescription?, SeoTitle?, subject?, orientation?, sizeCategory?,
colorBucket?, isBeginnerFriendly?`. Backed by an in-memory cache, sorted by `NGlobalPage`
descending.

### GET `/designs/[designId]`
```
200: Design
400: { error: "Invalid designId" }
404: { error: "Design not found" }
```

### POST `/designs/[designId]`  (download-count increment)
```
200: { ok: true }
400: { error: "Invalid designId" }
429: { error: "Too many requests" }
500: { error: "Failed to update download count" }
```

### GET/POST/DELETE `/designs/[designId]/like`
```
GET  200: { designId, count: number, currentUserVote: 'up'|'down'|null }
POST Request: { email?: string, direction: 'up'|'down' }  (email may also come from query/header)
POST 200: { designId, count, currentUserVote }
     400: { error: "Vote direction is required" }
     401: { error: "Email is required" }
     403: { error: "Email does not match session" }
     404: { error: "Design not found" }
DELETE Request: { email? }; 200: { designId, count, currentUserVote }
All:  429: { error: "Too many requests" }
      500: { error: "Likes table not found" } / { error: "Failed to update vote" }
```
Backed by a dedicated `CrossStitchLikes` DynamoDB table (GSI `GSI1`). A changed vote fires a
best-effort admin-notification email including the caller's IP.

### GET `/albums/[albumId]?pageSize=10&nPage=1`
```
200: DesignsResponse (as GET /designs) + { albumCaption, albumSeoDescription }, filtered to AlbumID
```

## 4. Search and recommendations

| Route | Method | Auth | External call |
|---|---|---|---|
| `/ai-search` | POST | none | Anthropic `claude-opus-4-8` |
| `/semantic-search` | POST | none | — |
| `/image-search` | POST | none | Anthropic `claude-haiku-4-5-20251001` |
| `/related-searches` | POST | none | — |
| `/personalized` | POST | none | — |

### POST `/ai-search`
```
Request:  { query: string }   (truncated to 500 chars before sending to the model)
200:      { searchText, widthFrom, widthTo, heightFrom, heightTo, ncolorsFrom, ncolorsTo }
400:      { error: "Query is required" }
500:      { error: "No response from AI" } / { error: "Could not parse AI response" } / { error: "Search failed" }
```
Side effect: `logSearch({ query, source: 'text', hasResults, filters })`.

### POST `/semantic-search`
```
Request: { query: string }
200:     { designIds: number[] }   — top ~60 matches
```

### POST `/image-search`
```
Request:  multipart/form-data, field "image" (jpeg/png/gif/webp, ≤5MB)
200:      { designIds: number[], description: string }
400:      { error: "No image provided" } / { error: "Unsupported image type" } / { error: "Image too large (max 5 MB)" }
500:      { error: "Could not analyse image" }
```

### POST `/related-searches`
```
Request: { semanticIds: number[], currentQuery?: string }
200:     { suggestions: string[] }   — up to 6, derived from album captions of the first
                                         30 semanticIds; never returns a non-200 status
                                         (all failure paths degrade to { suggestions: [] })
```

### POST `/personalized`
```
Request: { viewedIds: number[] }
200:     { designs: Design[] }   — up to 12, round-robin over similar-design neighbor
                                     lists for the last 5 viewed IDs, excluding already-viewed
```

## 5. Photo-to-cross-stitch converter

| Route | Method | Auth |
|---|---|---|
| `/analyze` | POST | none |
| `/convert` | POST | none |
| `/convert/pdf` | POST | none |
| `/converter/patterns` | POST | session required |
| `/converter/patterns/my` | GET | session required |
| `/converter/patterns/[id]` | GET | session required only if the pattern has an owner |
| `/converter/patterns/[id]` | PUT | session required, must match owner |
| `/import-image-url` | GET | none | 10/min/IP |

### POST `/analyze`
```
Request:  multipart, field "image"
200:      { type: 'photo'|'line-art'|'typography'|'illustration',
            confidence: 'high'|'medium'|'low', warnings: string[], suggestedMinWidth: number|null }
```

### POST `/convert`
```
Request:  multipart: image, width (10-500), height (10-500),
          colors (2|3|4|5|10|20|30|40|50|100), mode ('auto'|'photo'|'illustration'|'line-art', default 'auto')
200:      { grid: number[][], palette: PatternPalette[], width, height, imageType?, warnings?, mode }
400:      { error }  — one message per invalid field (see 01-LLD-Website.md / 02-LLD... for the exact list)
```
`PatternPalette = DmcColor & { symbol, stitchCount }`; `DmcColor = { number, name, r, g, b }`.
See `02-LLD-Photo-to-Cross-Stitch-Converter.md` §4 for the k-means/LAB conversion algorithm.

### POST `/convert/pdf`
```
Request:  { grid, palette, title?, chartMode?: 'symbol'|'color-symbol'|'color', previewImage?: string|null }
200:      application/pdf (binary), Content-Disposition: attachment
400:      { error: "Invalid pattern data" }
```
See `02-LLD-Photo-to-Cross-Stitch-Converter.md` §5 for the page structure (cover → color
key → page map → tiled chart pages).

### POST `/converter/patterns`  (save)
```
Request:  { name?, width, height, palette, grid, thumbnail?, hiddenColors? }
200:      { id: string }
401:      { error: "Login required" }
400:      { error: "Invalid pattern data" } / { error: "Invalid dimensions" } / { error: "Grid dimensions mismatch" }
500:      { error: <message> }   — e.g. "Pattern too large to save (grid exceeds 350 KB compressed)"
```
Grid is RLE-encoded before storage; a 350KB-compressed cap is enforced.

### GET `/converter/patterns/my`
```
200: { patterns: PatternSummary[] }   — PatternSummary = { id, name, width, height, createdAt, thumbnail? }
401: { error: "Login required" }
```

### GET `/converter/patterns/[id]`
```
200: SavedPattern = { id, name, width, height, palette, grid, hiddenColors?, createdAt, ownerID? }
400: { error: "Invalid pattern ID" }   — id must match /^[0-9a-f-]{36}$/
403: { error: "Access denied" }        — owned pattern, no/mismatched session
404: { error: "Pattern not found" }
```

### PUT `/converter/patterns/[id]`
```
Request: same shape as POST save
200:     { id }
401:     { error: "Login required" }
403:     { error: "Access denied" }   — session doesn't match existing owner
404:     { error: "Pattern not found" }
```

### GET `/import-image-url?url=…`
```
200: raw image bytes, Content-Type echoed from upstream
400: { error: "Missing url" } / { error: "Invalid url" } / { error: "Unsupported protocol" } / { error: "URL not allowed" } / { error: "Could not resolve host" }
413: { error: "Image too large" }        — streamed 8MB cap, checked by byte count not header
415: { error: "URL is not an image" }
429: { error: "Too many requests" }
502: { error: "Failed to fetch image" }
```
SSRF-guarded: resolves the hostname and rejects private/loopback/link-local addresses;
10-second fetch timeout.

## 6. Blog

| Route | Method | Rate limit |
|---|---|---|
| `/blog/[slug]/react` | GET | — |
| `/blog/[slug]/react` | POST | 5/min/IP |

```
GET  200: { slug, count: number }
     404: { error: "Not found" }
POST 200: { slug, count }   — incremented
     404: { error: "Not found" }
     429: { error: "Too many requests" }
```

## 7. Admin

All routes in this section require `requireAdmin` (401 if no session, 403 if not an admin
email) except `/admin/me` itself.

| Route | Method |
|---|---|
| `/admin/me` | GET |
| `/admin/feature-requests` | GET |
| `/admin/feature-requests/[id]` | PATCH |
| `/admin/editor-analytics` | GET |

### GET `/admin/me`
```
200: { isAdmin: boolean }   — false (not an error) if no session
```

### GET `/admin/feature-requests`
```
200: { requests: FeatureRequest[] }
```
`FeatureRequest = { id, createdAt, text, importance: 'nice-to-have'|'important'|'need-this',
status: 'new'|'reviewed'|'planned'|'done'|'rejected', email?, pageUrl?, patternWidth?,
patternHeight?, colorsCount?, editorTimeSeconds?, userChangedStitchesCount?, exportedPdf?,
userId?, browserLanguage?, userAgent? }`.

### PATCH `/admin/feature-requests/[id]`
```
Request: { status: RequestStatus }
200:     { ok: true }
400:     { error: "Invalid status" }
```

### GET `/admin/editor-analytics`
```
200: { dailyCounts: { date, counts: Record<eventType, number> }[]   (last 30 days),
       recentErrors: EditorEventRecord[]   (top 20 "editor_error"),
       recentFeedback: FeatureRequest[]    (top 20, last 30 days),
       topSources: { source, count }[]     (top 5 "editor_opened") }
```

## 8. Analytics, error logging, and notifications

| Route | Method | Auth | Rate limit |
|---|---|---|---|
| `/analytics/editor-event` | POST | none, self-filtered | 1/min per `sessionId:eventType` |
| `/analytics/no-track` | GET | session + admin | — |
| `/log-client-error` | POST | none | 1 admin-email/60s (not the request itself) |
| `/notify-admin` | POST | none | — |

### POST `/analytics/editor-event`
```
Request: { eventType: string, sessionId: string, ...params }
200:     { ok: true }
400:     { error: "eventType required" } / { error: "sessionId required" }
```
Only `editor_opened | pattern_generated | pdf_exported | feedback_submitted | editor_error`
are actually persisted; other event types return `{ok:true}` without writing. Also silently
skips the write (still 200) if the `no_track` cookie is set, or if the caller is an admin.

### GET `/analytics/no-track?clear=1`
```
200: { ok: true, noTrack: boolean }
401: { error: "Not authenticated" }
403: { error: "Not authorized" }
```

### POST `/log-client-error`
```
Request: { message?, stack?, digest?, url?, userAgent? }
200:     { ok: true }   — essentially always, except a JSON-parse failure → 500
```

### POST `/notify-admin`
```
Request (optional): { subject?, message?, html? }
200: { success: true }
500: { success: false, error: "Failed to send notification" }
```
Without a custom subject/message, sends a default "Registration Form Opened" notification —
suppressed if the caller's IP starts with `66.249.` (Googlebot's documented range).

## 9. Miscellaneous

| Route | Method | Auth |
|---|---|---|
| `/health` | GET | none |
| `/config/download-mode` | GET | none |
| `/image` | GET | none |
| `/missing-design-pdfs` | GET | none |
| `/profile/votes` | GET | none (email-identified) |
| `/feature-requests` | POST | optional (session, if present) |

### GET `/health`
```
200: { status: "OK" }
```

### GET `/config/download-mode`
```
200: { mode: 'free'|'register'|'paid' }
```
`Cache-Control: no-store, max-age=0`. Defaults to `'register'` if the env var is unset or
invalid.

### GET `/image`
```
200: proxied image bytes, Content-Type/Content-Length forwarded
404: { error: "Invalid slug" } / { error: "Image not found" }
```
Parses a design ID out of the requested image filename slug and resolves it to the actual
CloudFront/S3 URL.

### GET `/missing-design-pdfs`
```
200: raw text/plain content of a local MissingDesignPdfs.txt file
404: { error: "MissingDesignPdfs.txt not found" }
```

### GET `/profile/votes?email=…&includeDesigns=false`
```
200 (default): { email, votesCount, votes: (UserDesignVote & { design: Design })[] }
200 (includeDesigns=false): { email, votesCount }
401: { error: "Email is required" }
```
Identity is resolved from `?email=` or an `x-user-email` header — **not** the session
cookie.

### POST `/feature-requests`
```
Request: { text (5-2000 chars), importance?: 'nice-to-have'|'important'|'need-this',
           email?, pageUrl?, patternWidth?, patternHeight?, colorsCount?,
           editorTimeSeconds?, userChangedStitchesCount?, exportedPdf? }
200:     { ok: true, id: string }
400:     { error: "Please write at least a few words." } / { error: "That's a bit long — please keep it under 2000 characters." }
```
Automatically captures `browserLanguage` (`accept-language` header) and `userAgent`
server-side; attaches `userId` if the caller has a session, but works fully anonymously.

## 10. External integrations invoked from these routes

| External system | Routes | Notes |
|---|---|---|
| Anthropic API | `/ai-search`, `/image-search` | Two separate model choices, no shared client wrapper (see `05-SAD.md` §6) |
| AWS SES | `/auth/forgot-password`, `/auth/request-password-reset`, `/register-only`, `/register-only/verify`, `/notify-admin`, `/log-client-error`, `/designs/[id]/like` (POST), `/subscription/confirm`, `/paypal-webhook` | |
| AWS DynamoDB | Nearly every route with a 200 side effect | See `08-Data-Dictionary.md` for table shapes |
| PayPal | `/subscription/plan`, `/subscription/confirm`, `/paypal-webhook` | |
| Arbitrary external image host | `/import-image-url` | SSRF-guarded, see §5 |
| CloudFront/S3 | `/image` | Proxy only |
