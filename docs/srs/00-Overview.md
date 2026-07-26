# Software Requirements Specification — Overview

**Product:** cross-stitch.com platform

**Document set:** This overview plus four component SRS documents (see §3)

**Status:** Draft, derived from the current implementation (reverse-engineered SRS)

**Date:** 2026-07-11

## 1. Purpose

This document set specifies the requirements for the cross-stitch-platform monorepo: a
public cross-stitch pattern website plus the internal tools that publish content to it,
promote it on Pinterest, and monitor its business performance.

This set serves as a baseline for future requirements work and gap analysis
— not as a description of an idealized future system. Sections describing known weaknesses
or gaps are marked explicitly.

## 2. Product overview

The platform's business is: publish free/paid cross-stitch pattern charts, drive traffic to
them (organic search, Pinterest, and direct/referral being the largest channels — the exact
mix is a live analysis subject, not a fixed fact, and shifts over time), monetize that
traffic (ads, subscriptions), and let visitors convert their own photos into custom
cross-stitch patterns. One person (the site owner) operates the internal tooling; there is
no team of end-user-facing customer support.

```
                    ┌──────────────────────────┐
                    │  Uploader (WPF, desktop) │  operator: publishes new designs,
                    │                          │  sends subscriber emails
                    └───────────┬──────────────┘
                                │ writes designs, creates pins
                                ▼
   ┌────────────────────────────────────────────────────┐
   │        CrossStitchItems / CrossStitchUsers         │   AWS DynamoDB
   │              (catalog + user data)                 │
   └───────────┬───────────────────────────┬────────────┘
               │ reads/writes              │ reads
               ▼                           ▼
   ┌───────────────────────┐      ┌────────────────────────────┐
   │   Website (Next.js)   │      │  autopinner (.NET worker)  │
   │   cross-stitch.com    │      │  backfills Pinterest pins  │
   │   + photo-to-cross-   │      └──────────────┬─────────────┘
   │     stitch converter  │                     │
   └───────────┬───────────┘                     │ pins, ads, GA4, AdSense
               │ ad revenue, GA4 events          ▼
               ▼                       ┌──────────────────────────────┐
   ┌────────────────────────┐          │  pinterest-agent (Lambda,    │
   │  Visitors / Pinterest  │◀──────── │  cron): analytics, AI trend │
   │  users                 │  pins    │  analysis, IP-abuse defense, │
   └────────────────────────┘          │  alerting                    │
                                       └──────────────────────────────┘
```

## 3. Document set

| Document | Covers |
|---|---|
| `01-SRS-Website.md` | The public Next.js site: catalog, search, accounts, downloads, monetization (ads/PayPal), blog, admin pages. |
| `02-SRS-Photo-to-Cross-Stitch-Converter.md` | The in-browser pattern editor at `/photo-to-cross-stitch` — a distinct product surface (own user journey and value proposition) that lives in the same Next.js codebase as the website. |
| `03-SRS-Pinterest-Automation.md` | The backend automation: `automation/pinterest-agent` (Node/Lambda — analytics, AI trend analysis, IP-abuse detection/blocking, notifications) and `automation/autopinner` (.NET — the platform's actual Pinterest pin-creation engine), plus the `CrossStitch.Shared` library they depend on. |
| `04-SRS-Uploader.md` | The WPF desktop application used by the site operator to publish new designs and send subscriber emails. |

**Why the converter has its own document despite sharing a codebase with the website:**
it has a distinct value proposition (turn *your own* photo into a pattern, vs. browsing an
existing catalog), a distinct user journey, and distinct requirements (image processing,
canvas-based editing, PDF generation) that don't meaningfully overlap with catalog
browsing. Splitting them keeps each SRS focused and independently maintainable, at the cost
of some shared infrastructure (auth, DynamoDB access) being referenced from both documents.

**Why Pinterest-automation is one document despite being two runtimes:** `pinterest-agent`
(Node, reporting/analytics/defense only) and `autopinner` (.NET, the only component that
actually creates Pinterest pins) are operationally one subsystem — they read/write the same
DynamoDB tables, share the `CrossStitch.Shared` library, and exist to serve one goal
(get designs onto Pinterest and measure the payoff). Splitting them would duplicate the data
model and integration sections for no benefit.

## 4. Actors

| Actor | Description |
|---|---|
| **Visitor** | Anonymous user browsing/searching the public catalog or using the converter without an account. |
| **Registered user** | Has created an account (email+password or via PayPal subscription); can download gated content, save patterns, vote on designs. |
| **Subscriber** | A registered user who opted in to email updates (`ReceiveUpdates`); receives newsletters sent via the Uploader. |
| **Site operator (Olga)** | The sole administrator. Uses the Uploader to publish designs and send emails, the `/admin` pages to review feedback and analytics, and is the human decision-maker in the IP-abuse review workflow. |
| **AI agent (Claude, via Claude Code)** | Assists the operator with IP-abuse review/response, analytics investigation, and (per project rules) never sends mass email or blocks/watches an IP without explicit operator confirmation. |
| **Automated pipelines** | `pinterest-agent` (scheduled Lambda) and `autopinner` (scheduled/daemon .NET worker) act as non-human actors that read/write the shared data store on a recurring cadence. |

## 5. Cross-cutting data stores

Every component in this platform ultimately reads or writes one of these AWS DynamoDB
tables (see each component SRS for the entities it touches):

| Table | Primary owner(s) | Purpose |
|---|---|---|
| `CrossStitchItems` | Written by Uploader; read by Website, autopinner | Design catalog + albums (+ legacy user rows) |
| `CrossStitchUsers` | Written by Website (registration/subscription) and Uploader (bulk hygiene); read by all | Registered users, auth, subscription/trial state |
| `PasswordResetTokens` | Website | Short-lived password-reset tokens |
| `SubscriptionEvents` | Website (PayPal webhook) | Audit trail of PayPal subscription lifecycle |
| `CrossStitchBusinessHistory` | pinterest-agent | Daily business metrics, AI analyses, IP block/watch state, Pinterest token |
| (unnamed, code-only) pattern/likes/feature-request/blog-reaction/editor-event/search-log tables | Website | Newer features not yet reflected in the formal schema doc — see `01-SRS-Website.md` §Data Model for the caveat |

A known cross-cutting data-quality issue, relevant to every component that touches
Pinterest pin IDs: the pin-ID attribute on a `CrossStitchItems` design row has **six
historical spellings** (`PinID`, `PinId`, `PinterestPinId`, `PinterestPinID`,
`PinterestID`, `PinterestId`). Every reader defensively checks all six; every writer today
writes only the canonical `PinID`. This is documented once here and referenced, not
repeated, in the component SRS documents.

## 6. Known cross-cutting risks

These affect more than one component and are called out here so they aren't lost across
document boundaries. Each is also noted in the relevant component SRS's Non-Functional
Requirements / Known Issues section.

1. **Plaintext password storage.** `CrossStitchUsers.Password` (and the legacy
   `CrossStitchItems` `USER.OpenPwd`) are stored in plaintext, not hashed. Affects the
   Website (writes/reads it) and Uploader (bulk user operations).
2. **No cross-service rollback.** The Uploader's publish flow (S3 → Pinterest → DynamoDB)
   and pinterest-agent/autopinner's data pipelines have no distributed-transaction
   guarantee; a mid-flow failure can leave orphaned S3 objects, an orphaned Pinterest pin,
   or a partially written report row.
3. **No automated bot-account remediation.** IP blocking (pinterest-agent) stops a given IP
   from reaching the WAF-protected origin, but does not revoke or flag an already-registered
   account associated with abusive traffic. The `BotSuspect` flag on `CrossStitchUsers`
   exists but has no automated writer today.
4. **Single point of operation.** All publishing (Uploader) and all IP-abuse
   decision-making (human review via `/review-ip`) depend on one operator. There is no
   multi-operator workflow, approval chain, or handoff process specified.

## 7. Out of scope (for this document set)

- Infrastructure-as-code / deployment pipeline definitions (Elastic Beanstalk, Lambda
  packaging, WAF rule provisioning) — referenced where they affect functional behavior, not
  specified in detail.
- The standalone `Converter.exe` tool invoked by the Uploader (`uploader/Converter` in
  this monorepo, but built and versioned separately from `Uploader.sln`).
- The `etsy-uploader` Etsy integration — present in code only as a disclosure page and a
  scaffolded, unwired helper class (`EtsyHelper.cs`); not a live feature.
