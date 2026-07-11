# Software Requirements Specification — Website (cross-stitch.com)

**Component:** `web/` (Next.js App Router)
**Part of:** cross-stitch-platform — see `00-Overview.md` for cross-component context
**Status:** Draft, reverse-engineered from the current implementation
**Date:** 2026-07-11

## 1. Introduction

### 1.1 Purpose

This document specifies the functional and non-functional requirements of the public
cross-stitch.com website: the design catalog, search, user accounts, download/monetization
flows, and supporting content (blog, admin tools). The in-browser photo-to-pattern editor
that also lives in this codebase is specified separately in
`02-SRS-Photo-to-Cross-Stitch-Converter.md`.

### 1.2 Scope

In scope: every page and API route under `web/src/app/` except `photo-to-cross-stitch/*`
and its supporting `/api/convert*`, `/api/analyze`, `/api/converter/*` routes (covered by
the converter SRS). Out of scope: the Uploader and Pinterest-automation subsystems (their
own SRS documents), infrastructure/deployment configuration.

### 1.3 Definitions

- **Design** — one purchasable/downloadable cross-stitch chart, belonging to an Album.
- **Album** — a thematic category of designs (e.g. "Free Animals Charts").
- **Download mode** — a site-wide switch (`free` / `register` / `paid`) controlling what a
  visitor must do before downloading a design's PDF.
- **Trial** — in `paid` mode, a configurable grace period/download allowance before a
  subscription is required.

## 2. Overall description

### 2.1 Product perspective

The website is the platform's storefront: it is read-heavy (browsing/searching a static-ish
catalog) with a thin write surface (accounts, votes, feature requests, PayPal events). The
catalog itself is populated exclusively by the Uploader (see `04-SRS-Uploader.md`); the
website never creates Design or Album rows. Legacy `.aspx`-style URLs are preserved for SEO
continuity from a prior (pre-Next.js) version of the site.

### 2.2 User classes

See `00-Overview.md` §4. This document additionally distinguishes, within "registered
user," the three download-mode-dependent states: unauthenticated visitor, registered/free
user, and paying/trial subscriber (mode-dependent — see FR-DL series).

### 2.3 Constraints

- Single-instance deployment assumed by the rate limiter (§NFR-3) — no shared cache/store
  for rate-limit state across multiple instances.
- No CAPTCHA; bot mitigation relies on heuristics, rate limiting, and manual flags
  (§NFR-4).

## 3. Functional requirements

### 3.1 Catalog browsing and navigation

- **FR-CAT-1.** The system shall display a paginated, filterable grid of designs on the
  homepage, filterable by free-text search, subject, width/height range, color-count range,
  size category, orientation, and a beginner-friendly flag.
- **FR-CAT-2.** The system shall list all albums (categories) at `/albums`, and display each
  album's designs at `/albums/{albumId}` with previous/next album navigation and pagination.
- **FR-CAT-3.** The system shall provide an individual page per design showing its image,
  stitch count, color count, download count, description/notes, previous/next navigation
  within the album, related-album links, and a "similar designs" section.
- **FR-CAT-4.** The system shall preserve legacy `.aspx`-style URLs (e.g.
  `/Free-<Album>-Charts.aspx`, `/<Caption>-<AlbumID>-<NPage>-Free-Design.aspx`) via a
  catch-all route that resolves them to the equivalent modern album/design page, for SEO
  continuity with the site's pre-Next.js URL scheme.

### 3.2 Search and recommendations

- **FR-SRCH-1.** The system shall support structured filter search (subject, size,
  orientation, color count, beginner flag) against the design catalog.
- **FR-SRCH-2.** The system shall support natural-language search: free-text queries are
  parsed into structured filters using an LLM (Anthropic Claude) before querying the
  catalog.
- **FR-SRCH-3.** The system shall support semantic (embedding-based) search over designs.
- **FR-SRCH-4.** The system shall support image-based search: an uploaded photo is described
  by an LLM (Claude Haiku), and the description is used as input to semantic search.
- **FR-SRCH-5.** The system shall suggest related search terms/albums for a given query.
- **FR-SRCH-6.** The system shall show a personalized "you may also like" section based on
  the visitor's recently viewed designs (no login required — tracked client-side/session).

### 3.3 Authentication and accounts

- **FR-AUTH-1.** The system shall support email+password registration and login.
- **FR-AUTH-2.** The system shall support magic-link login: a link containing an encoded
  identifier (`eid`/`cid` query parameters) automatically authenticates the visitor when
  opened, without a password prompt. This is the mechanism by which newsletter links log a
  returning subscriber back in.
- **FR-AUTH-3.** The system shall notify the site operator by email whenever a `cid`-tagged
  link (i.e., a newsletter-tracked link) is opened, for engagement visibility.
- **FR-AUTH-4.** The system shall support password reset via a time-limited, single-use
  token (default 2-hour expiry) emailed to the account's address.
- **FR-AUTH-5.** The system shall support logout, clearing the client-held session state.
- **FR-AUTH-6.** The system shall gate `/admin/*` pages and APIs behind an admin-status
  check on the current session.
- **FR-AUTH-7.** The system shall reject password login and magic-link login for any account
  flagged `BotSuspect = true`.
- **FR-AUTH-8.** In `register` or `paid` download mode, the system shall require email
  verification (a token-based confirmation link) before granting full account privileges.

### 3.4 Downloads and access gating

- **FR-DL-1.** The system shall operate in exactly one of three site-wide download modes at
  a time, readable at runtime via a config endpoint: `free` (no gate), `register` (must
  register, no payment), `paid` (must have an active subscription or unexpired/unexhausted
  trial).
- **FR-DL-2.** In `free` mode, the system shall let any visitor download a design's PDF
  without authentication.
- **FR-DL-3.** In `register` mode, the system shall require an account (registered and, per
  FR-AUTH-8, verified) before allowing a download, prompting registration inline if the
  visitor is not authenticated.
- **FR-DL-4.** In `paid` mode, the system shall grant download access only to users with an
  active PayPal subscription or an active, unexhausted free trial; each such download shall
  consume one unit of the trial allowance if the user is on a trial.
- **FR-DL-5.** The system shall let a visitor choose among available chart format variants
  (Color & Symbol / Symbol Chart / Color Chart) for the same design.
- **FR-DL-6.** The system shall fall back to a legacy single-PDF URL for any design that does
  not yet have the newer per-format PDF files.
- **FR-DL-7.** The system shall increment a design's download counter on each successful
  download.
- **FR-DL-8.** The system shall remember a pending download across a registration/login/
  payment interruption and resume it automatically once access is granted.
- **FR-DL-9.** The system shall allow specific allow-listed referrer domains to bypass the
  register/paid gate (a documented exception for a partner content site).

### 3.5 Monetization

- **FR-MON-1.** The system shall display Google AdSense ad units on the homepage, album
  listing, album detail, and design pages.
- **FR-MON-2.** The system shall suppress ad display when the visitor has Do-Not-Track or
  Global Privacy Control signaled, in `paid` download mode, and on `/admin` and converter
  pages.
- **FR-MON-3.** The system shall offer monthly and annual PayPal subscription plans (in
  `paid` download mode) with configurable plan IDs and pricing.
- **FR-MON-4.** The system shall process PayPal subscription lifecycle events via a
  signature-verified webhook and update the corresponding user's subscription state.
- **FR-MON-5.** The system shall record every subscription lifecycle event to an audit trail
  (event type, previous/new status, subscription ID, user, timestamp).
- **FR-MON-6.** In `paid` mode, the system shall grant new users a configurable free trial
  (default: 30 days or 10 downloads, whichever comes first).

### 3.6 Engagement features

- **FR-ENG-1.** The system shall let a logged-in user cast an up or down vote on a design,
  view/change/remove their own vote, and shall rate-limit this endpoint per IP.
- **FR-ENG-2.** A logged-in user shall be able to view their own vote history at
  `/profile/votes`.
- **FR-ENG-3.** The system shall let any visitor (no login required) react to a blog post
  with a lightweight reaction (not a threaded comment), rate-limited per IP.
- **FR-ENG-4.** The system shall let a visitor save a design to their own Pinterest account
  via a share link (opening the existing pin if known, or Pinterest's create-pin dialog
  otherwise).
- **FR-ENG-5.** The system shall let a visitor opt into email updates during registration
  (defaulted on), and shall let a subscriber unsubscribe via a token-based link that
  requires no login.
- **FR-ENG-6.** The system shall provide an in-context feedback mechanism (feature-request
  form) capturing the visitor's message, an importance rating, and relevant page/pattern
  context, reviewable by the operator at `/admin/feature-requests`.

### 3.7 Content pages

- **FR-CONT-1.** The system shall serve a blog ("My thoughts") with individual post pages;
  post content is maintained as source-controlled content, not database-driven.
- **FR-CONT-2.** The system shall serve static informational pages (why-cross-stitch,
  cross-stitch tips, embroidery history, stitching-related health/ergonomics tips, privacy
  policy, terms of service).
- **FR-CONT-3.** The system shall serve two operational disclosure pages
  (`/etsy-uploader`, `/pinterest-agent`) required for third-party API developer review;
  these are not customer-facing features and shall be excluded from search indexing.

### 3.8 Admin

- **FR-ADM-1.** The system shall let the operator list and triage submitted feature
  requests at `/admin/feature-requests`.
- **FR-ADM-2.** The system shall provide an editor-usage analytics dashboard at
  `/admin/editor-analytics` (see `02-SRS-Photo-to-Cross-Stitch-Converter.md` for the
  underlying event model).
- **FR-ADM-3.** The system shall log client-side errors to the operator via an error-
  reporting endpoint.

## 4. External interface requirements

| Interface | Direction | Purpose |
|---|---|---|
| AWS DynamoDB | Read/write | Primary datastore — see §5 |
| AWS S3 / CloudFront | Read | Design images, PDFs; cached sitemap |
| AWS SES | Send | Verification, password reset, admin notification emails |
| PayPal (`@paypal/react-paypal-js` + webhook) | Both | Subscription checkout and lifecycle events |
| Google Analytics 4 | Send (client) | Usage analytics, respects DNT/GPC |
| Google AdSense | Send (client) | Ad serving/revenue |
| Anthropic Claude API | Send | NL search parsing, image-search description |
| Pinterest (outbound link only) | Send (client) | "Save to Pinterest" share action; no inbound API call from this component |

## 5. Data model

Primary tables (see `00-Overview.md` §5 for the full cross-component list):

- **`CrossStitchItems`** — `DESIGN` and `ALBUM` rows (read-only from this component); legacy
  `USER` rows (read/write for backward compatibility).
- **`CrossStitchUsers`** — the modern user table: identity, verification, subscription,
  trial, engagement (`LastSeenAt`), and bot-suspicion fields. Read/write.
- **`PasswordResetTokens`** — single-use reset tokens, default 2h expiry. Write on request,
  read+delete on use.
- **`SubscriptionEvents`** — append-only audit log of PayPal events.
- **Additional entities present in code but not yet reflected in the formal schema
  document** (`docs/integration/dynamodb-schema.md`): saved editor patterns, design
  likes/votes, feature requests, blog reactions, editor analytics events, and search query
  logs. These should be confirmed against the live DynamoDB console and folded into the
  formal schema doc as a follow-up — this SRS notes their existence and purpose but does
  not assert exact table/attribute names as authoritative.

## 6. Non-functional requirements

- **NFR-1 (SEO).** The system shall generate a sitemap (cached, refreshed hourly) covering
  static pages, albums, and every design; shall emit canonical URLs on every page; shall
  apply `noindex` to search-result pages with a query, near-duplicate converter-referrer
  URLs, the unsubscribe page, and the two disclosure pages; and shall emit structured data
  (JSON-LD) appropriate to each page type.
- **NFR-2 (Legacy compatibility).** The system shall 308-redirect the legacy domain to the
  canonical domain and shall continue resolving legacy `.aspx` URL patterns indefinitely
  (no announced sunset).
- **NFR-3 (Rate limiting — known limitation).** The system shall rate-limit the design-vote
  endpoint (20 req/min/IP) and the blog-reaction endpoint (5 req/min/IP). This limiter is
  in-memory and **does not function correctly across multiple deployed instances**; scaling
  the site horizontally requires migrating to a shared store before this protection remains
  effective.
- **NFR-4 (Bot mitigation — no CAPTCHA).** The system shall not use CAPTCHA. Bot mitigation
  shall instead rely on: a client-side behavioral heuristic (mouse/keyboard/touch/scroll
  signals) surfaced to the operator on registration attempts; the `BotSuspect` account flag
  (manually set today, blocking login per FR-AUTH-7); and IP-level rate limiting/blocking
  (delegated to the Pinterest-automation subsystem's WAF integration — see
  `03-SRS-Pinterest-Automation.md`).
- **NFR-5 (Mobile responsiveness).** All pages, including the design catalog and account
  flows, shall be usable on mobile viewport widths.
- **NFR-6 (Security header baseline).** The system shall set HSTS on all HTTPS responses.
- **NFR-7 (Known risk — plaintext passwords).** `CrossStitchUsers.Password` and the legacy
  `CrossStitchItems` `USER.OpenPwd` are currently stored **unhashed**. This SRS records this
  as a known security gap requiring remediation (hash+salt migration), not as an accepted
  target-state requirement.
- **NFR-8 (Known risk — credential logging).** The current login-verification code path logs
  the submitted email and password to stdout. This is a known gap, not a target-state
  requirement.
