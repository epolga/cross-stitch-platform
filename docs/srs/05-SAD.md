# Software Architecture Document — cross-stitch-platform

**Date:** 2026-07-11

**Related documents:** `00-Overview.md` (requirements-level component map), `01`–`04`
component SRS documents, `use-cases/` (scenario-level detail)

## 1. Introduction

### 1.1 Purpose

This document describes how the cross-stitch-platform monorepo is architecturally put
together — components, their technology stacks, how they communicate, how the system is
deployed, and the cross-cutting concerns (security, data consistency, observability) that
span more than one component. It complements the SRS set: the SRS specifies *what* the
system does; this document specifies *how* it is built to do it.

Like the SRS set, this is an **as-built** architecture document, derived from reading the
current codebase — not a target-state design. Sections that describe a weakness or a
technical-debt item are marked explicitly, not silently normalized into "the way it should
be."

### 1.2 Architectural style summary

The platform is not one application but a **loosely coupled set of independently deployed
components sharing a common data layer** (primarily AWS DynamoDB), stitched together by
convention (shared config files, shared library code, well-known S3 key prefixes) rather
than by a service mesh, message queue, or shared API gateway. There is no central
orchestrator; each component runs on its own schedule or trigger and reads/writes the
shared store directly.

## 2. Stakeholders and concerns

| Stakeholder | Primary concern |
|---|---|
| Site operator (Olga) | Can she publish content and reach subscribers reliably, with a manageable manual workload? |
| Visitors/subscribers | Is the site fast, findable, and safe to give an email/payment to? |
| AI coding agent (this project's ongoing development mode) | Is the system's structure legible enough to reason about safely (e.g., before recommending an IP block, or before touching a shared table)? |
| Search engines / Pinterest | Is content correctly structured, indexable, and not artificially inflated by bot traffic? |

## 3. System context

```
                              ┌──────────────────────┐
                              │   Site operator      │
                              │   (Olga, sole admin) │
                              └──────────┬───────────┘
                                         │ operates
                     ┌───────────────────┼───────────────────┐
                     ▼                   ▼                   ▼
           ┌───────────────────┐ ┌─────────────────┐ ┌───────────────────────┐
           │  Uploader (WPF)   │ │  /admin pages   │ │  /review-ip workflow  │
           │  desktop app      │ │  (Website)      │ │  (Claude Code + ops)  │
           └────────┬──────────┘ └───────┬─────────┘ └──────────┬────────────┘
                    │ publish/email      │ triage/analytics     │ block/watch IP
                    ▼                    ▼                      ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                        AWS DynamoDB (shared data layer)                 │
    │   CrossStitchItems · CrossStitchUsers · PasswordResetTokens·            │
    │   SubscriptionEvents · CrossStitchBusinessHistory                       │
    └───────┬────────────────────────┬─────────────────────────┬──────────────┘
            │ read/write             │ read (pins) / write     │ read/write
            ▼                        │ (pin status)            ▼
  ┌──────────────────┐               ▼                   ┌──────────────────────────┐
  │  Website         │       ┌────────────────────┐      │  pinterest-agent (Lambda)│
  │  (Next.js, EB)   │       │  autopinner (.NET) │      │  daily cron: analytics,  │
  │  + converter     │       │  worker: creates   │      │  AI trend, IP defense,   │
  └──────┬───────────┘       │  Pinterest pins    │      │  notifications           │
         │                   └──────────┬─────────┘      └────────────┬─────────────┘
         │ AdSense, GA4, PayPal         │ Pinterest API v5            │ GA4, AdSense,
         ▼                              ▼                             │ Pinterest Ads API,
  ┌────────────────────┐      ┌────────────────────────┐              │ Anthropic API,
  │ Visitors / Google /│      │  Pinterest platform    │              │ Telegram, WAF
  │ PayPal             │      │  (pins, boards)        │◀────────────┘
  └────────────────────┘      └────────────────────────┘
```

`CrossStitch.Shared` (.NET library) is not shown as a node — it is compiled into both
Uploader and autopinner, providing their common Pinterest-upload and SES-email logic (see
§5.3).

## 4. Component architecture

### 4.1 Website (`web/`)

| Aspect | Detail |
|---|---|
| Framework | Next.js, App Router (`web/src/app/`) |
| Hosting | AWS Elastic Beanstalk (restarted by Uploader after each publish, per `04-SRS-Uploader.md` FR-PUB-8) |
| Rendering | Server-rendered pages + API routes co-located in the same app (`src/app/api/*`) |
| State/session | No server-side session store observed for the primary email+password login path — client holds `isLoggedIn`/`userEmail` in `localStorage`; a separate lighter session mechanism (`src/lib/session.ts`) backs converter/pattern APIs |
| Static assets / media | AWS S3 + CloudFront CDN for design images and PDFs |
| Internal structure | `src/app/` (routes + colocated API routes), `src/lib/` (data-access, business logic, one file per concern — `users.ts`, `design-likes.ts`, `pattern-storage.ts`, etc.), `src/app/components/` (UI), `src/data/` (static reference data, e.g. DMC color table) |
| Key architectural pattern | Legacy-URL compatibility shim: a catch-all `[slug]` route parses old ASP.NET-style URLs and re-dispatches to modern album/design pages, preserving 15+ years of SEO equity without a URL-rewrite layer at the infrastructure level |

**Sub-component: Photo-to-cross-stitch converter.** Architecturally part of the same
Next.js app (same deploy unit, same hosting), but functionally a separate module: its own
route tree (`src/app/photo-to-cross-stitch/`), its own API routes (`/api/convert*`,
`/api/analyze`, `/api/converter/*`), and its own canvas-rendering client code
(`PatternCanvas.tsx`, ~1000 lines) that has no dependency on the catalog-browsing code
paths. See `02-SRS-Photo-to-Cross-Stitch-Converter.md`.

### 4.2 Pinterest Automation

Two independently deployed runtimes sharing one data model and one library:

| Aspect | pinterest-agent | autopinner |
|---|---|---|
| Language/runtime | Node.js / TypeScript | .NET 8 |
| Deployment | AWS Lambda, cron-triggered (daily) | Long-running process (`--daemon`, hourly loop) or scheduled one-shot (`--once`); not deployed as Lambda |
| Role | Read-only analytics, AI analysis, IP-abuse defense, notifications — **never writes a Pinterest pin** | The platform's only automated Pinterest **pin-creation** engine |
| Internal structure | `lambda/handler.ts` (orchestrates a fixed step sequence) → `src/services/*.ts` (one file per concern: `historyStore.ts`, `wafIpSync.ts`, `pinterestClient.ts`, `googleAnalytics.ts`, etc.) → `scripts/*.ts` (both Lambda-invoked and manual/standalone CLI entry points, `npm run <alias>`) | `Program.cs` (mode dispatch) → `DynamoDbDesignRepository.cs` (design selection/claiming) → `Config.cs` (typed env-var config) → calls into `CrossStitch.Shared` for the actual Pinterest write |
| Own data store | `CrossStitchBusinessHistory` (single DynamoDB table, `EntityType`/`SortKey` design — see §5.1) | None of its own; reads/writes `CrossStitchItems` |

**Architectural rationale for the split** (inferred from the code, not documented
elsewhere): keeping the write-capable pin-creation engine (autopinner) separate from the
read/analytics/defense engine (pinterest-agent) means a bug or runaway loop in the
analytics/AI side cannot accidentally spam Pinterest with pins, and vice versa — a stuck
autopinner daemon cannot silently corrupt the daily business report. The cost of this split
is duplicated OAuth-client and Pinterest-upload logic, mitigated by both consuming the same
`CrossStitch.Shared` implementation rather than reimplementing it.

### 4.3 Uploader (`uploader/`)

| Aspect | Detail |
|---|---|
| Framework | WPF (.NET), single-window desktop application |
| Deployment | Runs on the operator's own machine (Visual Studio-built, no server deployment) |
| Internal structure | `MainWindow.xaml(.cs)` (UI + orchestration — the design intentionally centralizes the publish/send workflows in the code-behind rather than a separate service layer), `Helpers/*.cs` (one class per integration concern: `PinSuggestionsGenerator`, `SeoTextGenerator`, `PinterestBoardCreator`/`Renamer`, `ElasticBeanstalkHelper`, `S3Helper`), `PatternInfo.cs` (PDF metadata scraper), `Templates/*.txt` (email content, loaded at runtime, not compiled in) |
| External process dependency | Shells out to `Converter.exe`, built from a separate console app at `uploader/Converter` (same monorepo, not part of `Uploader.sln`), for PDF format conversion during publish (see `04-SRS-Uploader.md` §2.3) |

### 4.4 Shared library (`shared/src/CrossStitch.Shared/`)

A .NET class library, the platform's only genuine code-sharing mechanism (there is no
equivalent shared package between the Node/TypeScript components and anything else).

| Module | Consumed by | Purpose |
|---|---|---|
| `Pinterest/PinterestUploader.cs` | Uploader, autopinner | Pin creation, theme detection, SEO text composition, board-CSV lookup |
| `Pinterest/PinterestOAuthClient.cs` | Uploader, autopinner | OAuth token acquisition/refresh, backed by a shared on-disk token file |
| `Pinterest/PatternLinkHelper.cs` | Uploader, autopinner | Builds design/album/CDN URLs from shared config |
| `Pinterest/PinLinkAbTracker.cs` | Uploader, autopinner | Cross-process A/B ratio consistency via a shared JSON counter file |
| `Email/EmailHelper.cs` | Uploader (autopinner uses its own `SesEmailNotifier` built on the same primitives) | SES sending, including raw MIME for custom headers |
| `PlatformConfig.cs` | Uploader, autopinner | Resolves shared on-disk file paths (Pinterest token, board CSV, A/B stats) via a sibling `cross-stitch-platform-docs` repo or an env-var override |

**Architectural note:** `PlatformConfig.cs`'s file-path resolution is the mechanism that
keeps two independently-deployed .NET processes (Uploader on the operator's desktop,
autopinner wherever it runs) pointed at the same Pinterest token and A/B stats — i.e., a
**shared-filesystem integration pattern**, not a shared database or API. This works because
today both processes run in environments with access to the same file path (or the same
sibling repo checked out locally); it would not survive autopinner being moved to a
container/Lambda deployment without a redesign of this file-sharing mechanism.

## 5. Data architecture

### 5.1 DynamoDB as the integration layer

There is no API layer between components — every component that needs another's data reads
the same DynamoDB tables directly. This is the platform's core integration pattern:
**shared-database integration**, not service-to-service calls. It is simple and has zero
network-hop latency between components, at the cost of every component needing to
understand (and stay compatible with) every other component's write shape for the tables it
shares.

Two single-table-design DynamoDB tables carry most of the platform's state:

- **`CrossStitchItems`** — catalog data (designs, albums) plus legacy user rows, discriminated
  by an `EntityType` attribute, keyed by a composite `ID`/`NPage` primary key with three
  GSIs for different access patterns (by global page order, by design ID, by ID+design ID).
  Written by Uploader (new designs) and autopinner (pin status); read by the Website and
  autopinner.
- **`CrossStitchBusinessHistory`** — pinterest-agent's own table, twelve `EntityType` values
  (see `03-SRS-Pinterest-Automation.md` §5) sharing one `EntityType`/`SortKey` schema, used
  purely as pinterest-agent's private store (no other component reads or writes it).

`CrossStitchUsers` is a second, simpler user table (no composite key, no GSIs observed)
that appears to be the "modern" user store, existing alongside the legacy `USER` rows still
present in `CrossStitchItems` — i.e., there was a migration in progress at some point that
was not fully completed (both are still live and both are still written to by different
code paths).

### 5.2 Known data-architecture debt

1. **Pin-ID attribute drift.** Six historically-used spellings for the same logical
   attribute (`PinID`/`PinId`/`PinterestPinId`/`PinterestPinID`/`PinterestID`/
   `PinterestId`) persist across `CrossStitchItems` rows written at different points in the
   platform's history. Every reader defensively checks all six; no migration has
   normalized existing rows to the canonical spelling.
2. **Dual user tables.** `CrossStitchUsers` (modern) and `CrossStitchItems`'s legacy
   `EntityType="USER"` rows both exist and are both still touched by code (the Uploader's
   cid/unsubscribe back-fill helpers operate on the legacy rows). No single source of truth
   for "who is a user" exists at the data layer.
3. **No schema versioning.** Neither table carries a schema-version attribute; writers
   (Website, Uploader, autopinner) each hard-code their own column list with no shared
   contract enforcement, so a schema change in one writer is only caught by the *readers*
   failing at runtime, not by a build-time or deploy-time check.
4. **Newer Website features have no formal schema doc.** Saved patterns, design likes,
   feature requests, blog reactions, editor-analytics events, and search logs are implemented
   directly in `web/src/lib/*.ts` against DynamoDB tables that are not named in
   `docs/integration/dynamodb-schema.md` — the formal schema document has not kept pace with
   feature development.
5. **No cross-table transactions.** DynamoDB's item-level atomicity (used correctly for
   autopinner's claim-before-pin pattern, §4.2) is not, and structurally cannot be, extended
   across a multi-step, multi-service flow like Uploader's publish sequence (S3 → Pinterest →
   DynamoDB) — see `00-Overview.md` §6.2.

### 5.3 Data flow: publishing a design end to end

```
Uploader (operator publishes)
   │
   ├─▶ S3: chart file, converted PDFs, preview images
   ├─▶ Pinterest API: create pin (via CrossStitch.Shared)
   ├─▶ DynamoDB CrossStitchItems: write DESIGN row (incl. pin ID)
   └─▶ Elastic Beanstalk: restart environment
                │
                ▼
        Website reads the new DESIGN row on next page render
                │
                ▼
   pinterest-agent's daily pipeline later reports on this pin's
   performance (impressions/clicks/saves) once Pinterest has data
                │
                ▼
   autopinner's own selection query naturally skips this design
   going forward (it already carries a pin ID)
```

## 6. Integration architecture (external systems)

| System | Components integrating with it | Direction | Notes |
|---|---|---|---|
| AWS DynamoDB | All | R/W | The de facto integration bus (§5.1) |
| AWS S3 / CloudFront | Website (read), Uploader (write), pinterest-agent (read logs/write AI artifacts) | Both | Media storage + edge-log source |
| AWS SES | Website, pinterest-agent, Uploader, autopinner | Send | All transactional and bulk email, three independent send call sites reimplementing similar raw-MIME logic (Website's own email lib vs. the shared `EmailHelper` vs. autopinner's `SesEmailNotifier`) |
| AWS WAFv2 | pinterest-agent (write) | Write | Sole enforcement point for IP blocking |
| AWS Elastic Beanstalk | Website (hosted on), Uploader (restarts) | Control | Uploader has direct infra-control privileges over the Website's hosting — an operational coupling worth flagging (§8) |
| Pinterest API v5 | autopinner, Uploader (via shared lib), pinterest-agent (read-only ads/analytics) | Both | Split by write-capability as described in §4.2 |
| Google Analytics 4 / AdSense / Search Console APIs | pinterest-agent (read), Website (client-side GA/AdSense tags) | Both | Server-side reads happen only in pinterest-agent; the Website's own GA/AdSense integration is purely client-side tag loading |
| PayPal | Website | Both | Checkout + webhook |
| Anthropic Claude API | Website (search, image search), pinterest-agent (trend/design analysis, editor summary), Uploader (SEO text, pin suggestions) | Send | **Four independent integration points**, each with its own model choice and prompt — no shared "AI client" module across languages/components (expected, since Node and .NET each need their own SDK, but even within the Node codebase there's no single wrapper reused across `ai-search`, `image-search`, trend analysis, and design analysis) |
| Telegram Bot API | pinterest-agent | Send | Sole notification channel outside of email |
| Bank of Israel currency API | pinterest-agent | Read | Single-purpose, DDB-cached fallback |

## 7. Deployment view

```
┌─────────────────────────────┐   ┌───────────────────────────────┐
│  AWS Elastic Beanstalk        │   │  AWS Lambda                    │
│  Website (Next.js)            │   │  pinterest-agent                │
│  - restarted by Uploader       │   │  - EventBridge/cron trigger,    │
│    after each publish           │   │    daily                        │
└─────────────────────────────┘   └───────────────────────────────┘

┌─────────────────────────────┐   ┌───────────────────────────────┐
│  Operator's machine            │   │  autopinner host                │
│  - Uploader (WPF)               │   │  (.NET 8, --daemon or           │
│  - relies on local AWS SDK      │   │   scheduled --once; deployment  │
│    credential chain             │   │   target not fully pinned down  │
│                                  │   │   in the codebase examined)      │
└─────────────────────────────┘   └───────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│  AWS-managed: DynamoDB · S3/CloudFront · SES · WAFv2            │
└───────────────────────────────────────────────────────────────┘
```

The Uploader is the one component with no server deployment at all — it is a developer/
operator-machine-only application, which is consistent with having exactly one operator and
no requirement for remote/concurrent access to the publishing workflow.

## 8. Cross-cutting concerns

### 8.1 Security

- **Authentication is bifurcated**: the Website has its own email+password/magic-link
  scheme with no evidence of password hashing (see `01-SRS-Website.md` NFR-7 — a
  data-layer issue that is really an application-layer/auth-architecture gap: there is no
  shared auth service or library, so this gap exists everywhere the Website reads/writes
  `Password`). Admin access is a simple status check (`requireAdmin`), not a
  role/permission system.
- **No CAPTCHA anywhere in the platform.** Bot mitigation is entirely heuristic
  (behavioral scoring, rate limiting, IP blocking, manual account flags) — an intentional
  architectural choice (per code comments) to avoid CAPTCHA's UX cost, offset by the
  human-in-the-loop IP review workflow (`03-SRS-Pinterest-Automation.md` FR-IP-3).
- **Secrets management is inconsistent by component**: the Website relies on standard
  environment variables (Elastic Beanstalk config); pinterest-agent uses `.env` +
  `dotenv`; the Uploader uses a gitignored `App.private.config`; none of the three share a
  secrets-manager integration (e.g. AWS Secrets Manager) — each component's credential
  handling was built independently.
- **Uploader has infrastructure-control privileges** (Elastic Beanstalk restart, EC2 reboot
  helper — unused but present) beyond what a "publish content" tool strictly needs; this is
  a broader blast radius than the use case requires, worth revisiting if the Uploader's
  credentials were ever compromised.

### 8.2 Observability and alerting

There is no centralized logging/metrics platform referenced anywhere in the codebase (e.g.
no Datadog/CloudWatch-dashboards-as-code, no APM). Observability is achieved through
purpose-built, push-based notifications:

- Telegram (pinterest-agent only) — the fastest-latency channel, used for anything
  time-sensitive (token refresh, suspicious IPs, anomalies).
- SES email — used for the same events plus longer-form daily digests, and as the sole
  channel for autopinner/Uploader alerts (neither has a Telegram integration).
- The `/admin` pages on the Website — the only *pull*-based (dashboard) observability
  surface, limited to feature requests and editor analytics; there is no equivalent
  dashboard for Pinterest-automation's own health (its output is push-only).

This is a workable pattern for a single-operator platform but does not scale to a team —
there is no shared incident/alert history beyond each channel's own message log, and no
deduplication across Telegram and email for the same underlying event (both fire for the
same anomaly, for example).

### 8.3 Consistency and error handling

No component in this platform uses distributed transactions, sagas, or compensating
actions. Consistency is achieved through narrower, targeted mechanisms where it matters
most:

- **Exactly-once pin claiming** (autopinner): a genuine atomic guarantee, via DynamoDB's
  conditional-update support — the one place in the platform where a real concurrency
  problem (two runs racing to pin the same design) is correctly solved.
- **Idempotent notifications** (pinterest-agent): anomaly and recommendation-change alerts
  carry a "notified" flag to avoid re-alerting on every pipeline run — application-level
  idempotency, not transactional.
- **Everything else** (Uploader's publish sequence, pinterest-agent's multi-step reporting
  pipeline) has no rollback and no idempotency guarantee — a mid-flow failure leaves
  partial state that must be manually reconciled. This is the platform's most consistent
  architectural gap, appearing independently in at least three different flows across two
  different components, suggesting it is a systemic pattern (no shared "unit of work"
  abstraction exists anywhere in the codebase) rather than a one-off oversight.

## 9. Key architectural decisions (inferred rationale)

| Decision | Rationale (as evidenced by the code) | Trade-off accepted |
|---|---|---|
| Split pin-creation (autopinner) from analytics/defense (pinterest-agent) | Isolates write-capable Pinterest access from the read-heavy reporting/AI/defense pipeline | Duplicated OAuth/upload logic, mitigated by the shared library |
| Desktop app (WPF), not a web admin panel, for publishing | Single operator, no need for remote/multi-user access; direct local filesystem access to source PDF batches | No remote publishing, no audit trail beyond the status log, single point of failure (one machine) |
| No CAPTCHA; heuristic + human-reviewed IP blocking instead | Avoids UX friction of CAPTCHA on a content site | Requires ongoing manual review effort (mitigated by the `/review-ip` AI-assisted workflow) |
| Shared-database integration (DynamoDB) instead of internal APIs between components | Simplicity for a small, single-operator platform; no need to stand up/secure internal service endpoints | Every component must independently track every other component's write shape; no enforced schema contract (§5.2) |
| Legacy `.aspx` URL preservation via catch-all routing | Preserves 15+ years of accumulated SEO equity through a platform rewrite | Permanent routing complexity with no announced retirement plan |

## 10. Summary of architectural risks

Consolidating risks raised throughout this document (cross-referenced to `00-Overview.md`
§6 where they were first surfaced at the requirements level):

1. Plaintext password storage — an auth-architecture gap, not fixable by any single
   component in isolation (§8.1).
2. No transactional/compensating-action pattern anywhere multi-step, multi-service state is
   written (§8.3) — appears in Uploader's publish flow and in pinterest-agent's reporting
   pipeline independently.
3. Data-layer drift with no enforced schema contract: six pin-ID spellings, two user
   tables, undocumented newer tables (§5.2).
4. Single point of operation: one operator, one desktop machine, for all publishing and all
   IP-abuse decisions (`00-Overview.md` §6.4) — also an architectural single point of
   failure, not just a process one.
5. Inconsistent secrets handling across three different mechanisms with no shared vault
   (§8.1).
6. No centralized observability — alerting is push-only and per-channel, with no
   deduplication or shared incident history (§8.2).
