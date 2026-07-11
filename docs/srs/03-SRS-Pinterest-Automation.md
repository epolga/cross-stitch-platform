# Software Requirements Specification — Pinterest Automation

**Components:** `automation/pinterest-agent/` (Node/TypeScript, AWS Lambda), `automation/autopinner/`
(.NET 8 worker), `shared/src/CrossStitch.Shared/` (shared library)
**Part of:** cross-stitch-platform — see `00-Overview.md` for cross-component context
**Status:** Draft, reverse-engineered from the current implementation
**Date:** 2026-07-11

## 1. Introduction

### 1.1 Purpose

This document specifies the requirements of the platform's automated Pinterest
promotion and business-intelligence backend: creating Pinterest pins for new designs,
measuring the resulting traffic/revenue, defending the site against automated abuse, and
alerting the operator to anomalies and decisions that need a human.

### 1.2 Scope

In scope: `automation/pinterest-agent`'s daily Lambda pipeline and its individual services;
`automation/autopinner`'s pin-creation worker; the shared Pinterest/email library they both
depend on. Out of scope: the Uploader's own (separate) use of the shared library
(`04-SRS-Uploader.md`), the website (`01-SRS-Website.md`) except as a data source
(GA4/AdSense) or enforcement target (WAF).

### 1.3 Definitions

- **Pin** — a Pinterest post linking to a design or album page on the site.
- **Attribution** — estimating which pins/ads produced which site sessions and, ultimately,
  which revenue.
- **Watch** — a time-boxed probation marker on an IP address, not a block.
- **Block** — an active entry that is synced into an AWS WAF IP set, denying that IP at the
  edge.

## 2. Overall description

### 2.1 Product perspective

Two independently deployed components cooperate around one shared data model:

- **pinterest-agent** is read/report/defense-only — a scheduled Lambda that never creates a
  Pinterest pin. It pulls Pinterest ad, GA4, and AdSense metrics, runs AI trend analysis,
  detects and helps a human respond to abusive traffic, and sends the operator a daily
  digest.
- **autopinner** is the platform's only pin-creation engine — a .NET worker that claims
  newly-published, not-yet-pinned designs from DynamoDB and posts them to Pinterest.

Both depend on `CrossStitch.Shared` for Pinterest API access and SES email, and both act on
the `CrossStitchItems` design table; pinterest-agent additionally owns its own
`CrossStitchBusinessHistory` table.

### 2.2 User classes

- **Site operator** — receives all Telegram/email output from this subsystem; is the human
  decision-maker for every IP block/watch action (never automated — see FR-IP-3).
- **AI agent (Claude, via `/review-ip`)** — gathers evidence and recommends a
  block/watch/no-action classification, but does not act without operator confirmation.
- **Scheduler** (Lambda cron trigger, OS task scheduler / daemon loop for autopinner) — the
  non-human actor that triggers each pipeline run.

### 2.3 Constraints

- pinterest-agent's Lambda execution has no persistent local disk beyond `/tmp`; the rolling
  business-history trend file is rebuilt each run rather than incrementally maintained
  across invocations in a durable store.
- Pinterest's v5 Ads API silently ignores batched `ad_ids` — per-ad metrics must be fetched
  one call at a time (a documented API limitation this component works around, not a
  self-imposed constraint).
- No inter-service transaction: a design can end up "pinned but not marked so," or "marked
  posted but the pin call actually failed," if a mid-flow crash occurs (see
  `00-Overview.md` §6.2).

## 3. Functional requirements

### 3.1 Daily pipeline (pinterest-agent)

- **FR-PIPE-1.** The system shall run a fixed, ordered sequence of steps once per day for
  the previous day's data: token maintenance, WAF sync, suspicious-IP detection, business
  reporting (ad spend/GA4/AdSense), business-history rebuild, promoted-ad reporting,
  landing-page reporting, pin-attribution reporting, anomaly detection and notification, AI
  trend analysis and recommendation-change notification, daily summary email/Telegram,
  holiday reminder, and editor-usage summary email.
- **FR-PIPE-2.** A failure in the WAF-sync or suspicious-IP-detection steps shall not abort
  the remainder of the pipeline (they are explicitly non-critical); a failure elsewhere may
  abort remaining steps.
- **FR-PIPE-3.** Design-pin-map, design-performance, and AI-design-analysis generation shall
  be runnable as standalone/manual scripts but shall not be part of the automated daily
  pipeline (their output is not yet surfaced to the operator on a schedule).

### 3.2 Pin creation (autopinner)

- **FR-PIN-1.** The system shall select the next design to pin by querying unpinned designs
  in descending design-ID order (newest first), excluding designs already carrying a pin ID
  (checked across all historically-used pin-ID attribute spellings — see `00-Overview.md`
  §5) or already marked posting/posted/exhausted.
- **FR-PIN-2.** The system shall atomically claim a design before pinning it (a conditional
  update that fails if another concurrent run has already claimed it), preventing duplicate
  pins for the same design.
- **FR-PIN-3.** The system shall determine the destination Pinterest board for a design from
  a per-album board mapping, falling back to a configured default board, and shall fail the
  pin attempt if neither is available.
- **FR-PIN-4.** The system shall auto-detect a thematic category for the design (from a set
  of keyword-scored themes) and generate an SEO-oriented pin title, description (with
  hashtags, capped length), and alt text.
- **FR-PIN-5.** The system shall support an A/B split between linking a pin to the design
  page vs. the album page, tracked so the split ratio stays consistent across concurrent
  runs.
- **FR-PIN-6.** The system shall enforce a configurable daily pin cap and a configurable
  maximum batch size per run.
- **FR-PIN-7.** The system shall retry a failed pin attempt only for transient errors (HTTP
  429/5xx), up to a configurable attempt limit, after which the design shall be marked
  exhausted and excluded from further automatic attempts.
- **FR-PIN-8.** The system shall record the outcome of every pin attempt (posted + pin ID,
  failed + error, or exhausted) back onto the design's DynamoDB row.
- **FR-PIN-9.** The system shall support running as a one-shot batch or as an hourly-looping
  daemon.
- **FR-PIN-10.** The system shall provide a maintenance mode that strips HTML from the live
  Pinterest description of already-pinned designs and updates the pin in place, with a
  dry-run option.
- **FR-PIN-11.** The system shall provide a read-only export of what each pinned design's
  composed description would currently be, for manual review, without calling the Pinterest
  API to change anything.

### 3.3 Analytics and reporting

- **FR-RPT-1.** The system shall compute, for each reporting day: Pinterest ad spend/
  impressions/clicks/CTR/CPC, GA4 sessions attributable to Pinterest (split
  paid/organic/referral) plus true site-wide total sessions, AdSense estimated revenue, a
  revenue-per-100-sessions metric, and a rough profit figure (revenue minus spend, currency-
  normalized).
- **FR-RPT-2.** The system shall maintain a rolling multi-day business-history series used as
  input to trend analysis.
- **FR-RPT-3.** The system shall report per-ad Pinterest spend/impressions/clicks/CTR.
- **FR-RPT-4.** The system shall report Pinterest-attributable GA4 sessions broken down by
  landing page.
- **FR-RPT-5.** The system shall estimate per-pin attributed revenue and profit by combining
  ad stats, landing-page stats, and daily business totals, using true site-wide sessions
  (not just Pinterest-tagged sessions) as the correct attribution denominator.
- **FR-RPT-6.** The system shall report per-design Pinterest performance (impressions,
  clicks, saves) over a rolling 30-day window, normalized to a per-day rate.
- **FR-RPT-7.** The system shall maintain a mapping of design ↔ Pinterest pin ID derived
  from the catalog table.
- **FR-RPT-8.** The system shall convert USD figures to ILS using a fetched exchange rate,
  with a cached fallback if the rate source is unavailable.

### 3.4 AI-assisted analysis

- **FR-AI-1.** The system shall send the rolling business-history series to an LLM and
  receive back a narrative analysis plus a structured budget recommendation (hold/increase/
  decrease, with confidence and reasoning), storing both the narrative and the structured
  result.
- **FR-AI-2.** The system shall notify the operator only when the AI's latest budget
  recommendation differs from its immediately prior recommendation (not on every run), to
  avoid alert fatigue.
- **FR-AI-3.** The system shall (when enabled) send aggregated per-album design-performance
  data to an LLM and receive back an analysis of top/underperforming themes and suggested
  new design directions.

### 3.5 Anomaly detection and notification

- **FR-ANOM-1.** The system shall flag any tracked metric whose latest value deviates more
  than a statistical threshold (2 standard deviations) from its trailing 7-day mean.
- **FR-ANOM-2.** The system shall notify the operator (email and Telegram) of all not-yet-
  notified anomalies in a single batched message per run, and mark each as notified to avoid
  repeat alerts.

### 3.6 IP-based abuse detection and response

- **FR-IP-1.** The system shall scan the previous day's edge access logs, count requests per
  source IP, and alert the operator (Telegram) with the top offenders whenever an IP's daily
  request count meets or exceeds a configurable threshold (default 800) and is not already
  blocked. This detection step shall not, by itself, block any traffic.
- **FR-IP-2.** The system shall provide a read-only investigation tool that, given one or
  more IPs, returns reverse-DNS, HTTP method mix, response status-code distribution, and top
  requested paths for that IP over a given day — without mutating any block/watch state.
- **FR-IP-3.** The system shall not block or place an IP on watch automatically; every
  block/watch action shall require an explicit human (operator) decision, recorded with a
  human-readable reason.
- **FR-IP-4.** The system shall support placing an IP on time-boxed watch (default 3 days) as
  a non-blocking probation marker, and placing an IP on a time-boxed block (default 30 days)
  that is enforced at the network edge.
- **FR-IP-5.** The system shall synchronize the current set of active (non-expired) blocked
  IPs into the site's WAF IP set on every pipeline run, deriving the enforced set solely from
  the current block records (i.e., an expired block record shall stop being enforced on the
  next sync, with no separate "unblock" action required).
- **FR-IP-6.** The system shall retain a permanent, non-expiring history of every block/watch
  decision ever made for an IP, independent of the time-boxed block/watch record's own
  expiry, so that a repeat offender is recognizable even after its earlier block or watch
  period has lapsed.
- **FR-IP-7.** When evaluating a newly-flagged IP, the decision process shall consult both
  the currently-active block/watch state and the permanent history for that IP before
  recommending an action.

### 3.7 Token and credential maintenance

- **FR-TOK-1.** The system shall maintain a Pinterest OAuth token, automatically refreshing
  it via the refresh-token grant when it is within a configurable threshold (default 7 days)
  of expiry, and shall notify the operator (Telegram) on each successful refresh.
- **FR-TOK-2.** The system shall persist the current Pinterest token (access, refresh,
  expiry) to durable storage so it survives across pipeline runs, with a documented manual
  bootstrap path if no stored token exists yet.
- **FR-TOK-3.** The system shall remind the operator, on a fixed weekly cadence, to manually
  refresh the Google API token used for GA4/AdSense access, since that credential does not
  support automated refresh in its current mode.

### 3.8 Notifications

- **FR-NOTIF-1.** The system shall send a daily KPI digest (spend, clicks, sessions, revenue,
  profit, 7-day trend, latest AI recommendation, top pins by profit) via both email and
  Telegram.
- **FR-NOTIF-2.** The system shall send holiday-related reminders on a fixed lead time (14/28
  days) before configured holidays.
- **FR-NOTIF-3.** autopinner shall send an operational alert email on configuration failure,
  on a per-operation failure (deduplicated with a cooldown to avoid alert storms), and after
  a configurable number of consecutive failures or exhausted retry attempts.

## 4. External interface requirements

| Interface | Direction | Purpose |
|---|---|---|
| Pinterest API v5 | Read/write | Pin creation/update, ad and organic pin analytics, OAuth |
| Google Analytics 4 Data API | Read | Session attribution |
| Google AdSense API | Read | Revenue |
| Google Search Console | Read | Standalone/manual scripts only, not in the daily pipeline |
| Anthropic Claude API | Send | Trend analysis, design analysis, editor-summary commentary |
| AWS DynamoDB | Read/write | `CrossStitchItems` (autopinner), `CrossStitchBusinessHistory` (pinterest-agent) |
| AWS S3 | Read | Edge access logs (IP analysis), AI-generated markdown artifacts (write) |
| AWS WAFv2 | Write | Blocked-IP set synchronization |
| AWS SES | Send | Daily summaries, anomaly/recommendation alerts, operational alerts |
| Telegram Bot API | Send | All Telegram notifications |
| Bank of Israel currency API | Read | USD/ILS exchange rate, DynamoDB-cached fallback |

## 5. Data model

`CrossStitchBusinessHistory` (single table, PK `EntityType` / SK `SortKey`):

| Entity type | Purpose |
|---|---|
| `DAILY_BUSINESS` | One row per day: spend, sessions, revenue, profit |
| `AI_ANALYSIS` | Trend or design analysis output (narrative + structured recommendation) |
| `DESIGN_PIN_MAP` | Design ↔ pin ID linkage |
| `DESIGN_PERFORMANCE` | Rolling per-design Pinterest performance snapshot |
| `ANOMALY_EVENT` | A detected statistical anomaly and its notification state |
| `PROMOTED_AD_STATS` | Per-ad daily spend/impressions/clicks |
| `LANDING_PAGE_STATS` | Per-landing-page Pinterest session counts |
| `PIN_ATTRIBUTION` | Estimated per-pin revenue/profit attribution |
| `PINTEREST_TOKEN` | The current Pinterest OAuth token (singleton) |
| `BLOCKED_IP` | An active, time-boxed IP block (TTL-expiring) |
| `WATCHED_IP` | An active, time-boxed IP watch marker (TTL-expiring) |
| `IP_HISTORY` | Permanent (non-expiring) log of every block/watch decision ever made |

`CrossStitchItems` (see `00-Overview.md` §5 and `01-SRS-Website.md` §5): autopinner reads
unpinned `DESIGN` rows and writes back pin status/attempt-count/error/link-type fields.

## 6. Non-functional requirements

- **NFR-1 (No auto-enforcement without a human).** Per FR-IP-3, this is a hard requirement,
  not a tunable default: false positives here (a legitimate high-volume crawler, a corporate
  NAT serving many real users) would silently drop real traffic, so detection is
  deliberately decoupled from enforcement.
- **NFR-2 (Attribution correctness).** Revenue-per-session and pin-attribution calculations
  shall use true site-wide session totals (all traffic sources) as the denominator, not a
  Pinterest-only session count, to avoid overstating Pinterest's measured impact.
- **NFR-3 (Alert-fatigue avoidance).** Recommendation-change and anomaly notifications shall
  be idempotent per underlying event (not re-sent on every pipeline run) to keep the
  operator's alert volume proportional to actual change, not to pipeline cadence.
- **NFR-4 (Non-critical steps must not block the pipeline).** WAF sync and suspicious-IP
  detection failures shall be caught and logged, not allowed to fail the entire daily run.
- **NFR-5 (Known gap — TTL propagation lag).** AWS DynamoDB's native TTL deletion is
  eventually consistent (can lag up to ~48 hours past expiry); the WAF-sync step shall
  defensively re-filter by TTL at read time rather than trusting that expired rows have
  already been removed.
- **NFR-6 (Known gap — no automated account-level remediation).** IP blocking does not, by
  itself, prevent an abusive actor from continuing via an already-registered account from a
  new IP; see `00-Overview.md` §6.3.
