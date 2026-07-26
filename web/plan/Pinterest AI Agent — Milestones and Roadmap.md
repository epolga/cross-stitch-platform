# Pinterest AI Agent — Milestones and Roadmap

## Purpose

This document extracts and centralizes:

* milestones

* implementation phases

* strategic roadmap

* timing estimates

* next planned work

from the larger master planning document.

The goal is to reduce master-document size and begin modularizing the project documentation.

---

# Milestone 0 — External Platform API Access

## Status

Substantially completed.

## Goal

Establish developer access to external marketing/analytics APIs early so technical work isn't blocked on platform approvals.

## Completed platform infrastructure

```text

✔ Pinterest developer infrastructure
✔ Google developer infrastructure
✔ Anthropic AI infrastructure
✔ Meta developer infrastructure

```

### Meta details

Completed:

* Meta for Developers access

* clean Meta app creation

* Marketing API use case selection

* development-mode app setup

* future Facebook/Instagram integration path established

The Meta app currently acts as internal/private infrastructure and is intentionally kept in Development mode. Only the owner/business uses it; no public distribution is planned, so Tech Provider status and advanced Meta reviews are NOT currently required.

This reflects the broader architectural goal: a private intelligent business tool, not a public SaaS platform for external users.

## Deferred / lower-priority platforms

Currently deferred — not blockers for the intelligence architecture:

* Reddit

* TikTok

* X / Twitter

* Google Ads (lower priority while AdSense + Pinterest Ads cover monetization signal)

Priority remains: Pinterest, Google, AI reasoning, historical memory system.

## Important understanding

API approvals can take days, weeks, or longer. Approval processes should run in parallel with development rather than gating it.

---

# Milestone 1 — Google Integrations

## Status

Completed.

## Completed work

* Google OAuth working

* GA4 API integration

* AdSense API integration

* Unified Google reporting

* Daily Google JSON reports

---

# Milestone 2 — Pinterest Integrations

## Status

Completed.

## Completed work

* Pinterest Ads API access

* Pinterest OAuth/token usage

* Ad account reporting

* Pinterest metrics retrieval

## Verified account

```text

Ad Account ID: 549769986352

Name: Cross Stitch Patterns

```

---

# Milestone 3 — Unified Business Reporting

## Status

Completed.

## Completed work

Combined reporting for:

* Pinterest spend

* Pinterest clicks

* GA4 Pinterest sessions

* AdSense estimated earnings

* Rough profitability estimation

## Current outputs

Example:

```text

Pinterest spend

GA4 sessions

AdSense revenue

Profit estimate

```

---

# Milestone 4 — Initial AI Reasoning Layer

## Status

Completed.

## Completed work

* Anthropic API integration

* Claude Sonnet reasoning

* AI recommendation generation

* Operational interpretation of metrics

## Important understanding

The AI currently reasons mostly from:

```text

short-term profitability

```

Future versions should also reason about:

* long-term audience value

* returning visitors

* newsletter growth

* retention quality

---

# Milestone 5 — Historical Memory System

## Status

Partially completed (local JSON layer + anomaly detection done; DynamoDB
historical-memory layer still planned). **Updated 2026-07-26** — anomaly
detection was previously listed as remaining work here; it has since been
built and is running live as pipeline steps 6-7 (`anomalyDetector.ts` /
`anomalyNotifier.ts`, notifications per Milestone 8).

## Completed work

* aggregate historical reports (`build-business-history.ts` → `reports/business-history.json`)

* trend calculations

* moving averages (3-day, 7-day windows)

* anomaly detection — flags metrics deviating >N standard deviations from a
  trailing-7-row mean, one `ANOMALY_EVENT` row per flagged metric, emailed
  via the daily pipeline

## Remaining work

* historical memory DynamoDB layer (currently lives in local JSON)

## Estimated effort

```text

1–2 focused development days remaining (DynamoDB layer)

```

---

# Milestone 6 — Multi-Day AI Trend Reasoning

## Status

Completed (Version 1). See the matching completion section in Memory and Trend Analysis.

## Completed work

* multi-day AI analysis (`test-ai-trend-analysis.ts`)

* trend interpretation across 3-day and 7-day windows

* confidence estimation (structured JSON output)

* pattern recognition

* longitudinal reasoning

* persisted AI outputs (`reports/ai-analysis/*.md/json`, `reports/ai-recommendations-history.json`)

## Example reasoning the system now produces

```text

CTR improving for 5 days

Revenue/session declining

Possible low-quality traffic increase

```

---

# Milestone 6b — Design-Level Intelligence V1

## Status

Completed (Version 1). See the matching "Design-Level Intelligence Layer" section in Memory and Trend Analysis for the architectural framing.

## Completed work

* per-pin Pinterest analytics (impressions, clicks, outboundClicks, ctr, saves) over a rolling 30-day window

* design ↔ pin map sourced from DynamoDB (`export-design-pin-map.ts`)

* per-pin metrics enrichment (`build-design-performance.ts`)

* AI design analysis identifying strongest themes, underperforming albums, and design directions to create (`test-ai-design-analysis.ts`)

* operational outputs: `reports/design-pin-map.json`, `reports/design-performance.json`, `reports/design-insights.{md,json}`, dated archive under `reports/ai-analysis/`, append to `reports/ai-recommendations-history.json`

* wired into `daily-run.bat` after the existing trend-analysis chain

## Initial categorization

Album caption is used as the temporary theme/category field. Richer per-design metadata (theme, style, subject, colors) is deferred to a future iteration.

## Remaining work for V2

* **surface AI design analysis in the daily email** — the analysis runs and saves to S3/DDB but is never shown to the user; add a section to the daily summary email (or a separate weekly digest) with top albums, underperforming albums, and design directions to create

* richer design categorization beyond album captions

* DynamoDB persistence (see Milestone 8 in Memory and Trend Analysis)

> Note: originally all three of steps 11–13 (design pin map, design performance, AI design analysis) were disabled because the output wasn't surfaced anywhere. **Updated 2026-07-26 — partially re-enabled since:** the design pin map export (step 13, `export-design-pin-map.ts`) was turned back on 2026-07-19 for an unrelated reason — the GSC indexed-rate sample (a later pipeline step) reads its output DynamoDB table live, so it needs daily refreshing regardless of whether design analysis is ever surfaced. Design performance (`build-design-performance.ts`) and AI design analysis (`test-ai-design-analysis.ts`) remain disabled/uncalled — the "surface it in the email" work above still hasn't happened, so there's still nothing to re-enable them for.
>
> **Why originally disabled (2026-06-09):** Step 12 fetches Pinterest analytics for all 957 organically pinned designs one-by-one. The Pinterest API rate-limits heavily (HTTP 429), and at ~0.8s/pin the step regularly consumed the entire 15-minute Lambda budget — causing the daily summary email (step 10) to never be sent. Since the analysis output was invisible to the user anyway, steps 11–13 were commented out. Commit `37f95e1`.

---

# Milestone 7 — Automated Scheduling

## Status

Complete — 2026-06-03.

## Completed work

* AWS Lambda `cross-stitch-daily-pipeline` deployed, EventBridge at 02:00 UTC (05:00 local)
* Node.js 20 → 22 everywhere (Lambda runtime, esbuild target, EB platform, local nvm)
* Windows Tasks `\PinterestDailyReport` and `\GoogleTokenRefreshReminder` disabled 2026-06-05, deleted 2026-06-11

**Pipeline step list — corrected 2026-07-26** (the original 13-step list
above was stale; the pipeline has grown and reordered significantly since
2026-06-03). Current order per `automation/pinterest-agent/lambda/handler.ts`:

* init: Pinterest token refresh, WAF auto-block IP sync, suspicious IP detection
* 1. daily business report → 2. build business history → 3. promoted ads report → 4. landing page report → 5. pin attribution → 6. anomaly detection → 7. anomaly notifications → 8. AI trend analysis → 9. recommendation change alert → **10. daily summary email**
* (non-numbered) Google token refresh reminder if due
* 11. holiday reminder → 12. editor daily summary email
* (non-numbered, monthly) AI-tools-scan if due (gated day-of-month === 26, added 2026-07-26)
* 13. design pin map export (re-enabled 2026-07-19) → 14. GSC sitemap indexed-rate sample
* 15. design performance — still disabled/commented out (see Milestone 6b)

Note the daily summary email (step 10) now fires well before design pin
map/performance — the original list implied the opposite order.

---

# Milestone 8 — Email / Notification Layer

## Status

Complete — 2026-06-04.

## Completed work

* Daily summary email via SES (HTML + plain text)
* Anomaly detection + email alerts
* Recommendation change alert email
* Telegram bot: daily summary, anomaly alerts, recommendation changes, Google token reminder

---

# Milestone 9 — Better Attribution

## Status

Complete — 2026-06-05 through 2026-06-11.

## What was built

**Per-pin attribution (PIN_ATTRIBUTION DDB entity)**
- Written daily by Lambda step 5
- Fields: date, adId, title, destinationUrl, clicks, outboundClicks, spend (USD), paidSessions, attributedRevenue (ILS), profit (ILS), usdIlsRate
- Attribution formula: `pin_revenue = (pin_paid_sessions / total_all_sessions) × adsense_revenue`

**Currency fix**
- Pinterest spend is USD; AdSense revenue and profit are ILS
- Live USD→ILS rate from Bank of Israel API; fallback: last known rate from DDB
- DAILY_BUSINESS rows now store `usdIlsRate`

**Daily email & Telegram**
- Per-pin 7-day profit trend table in daily email
- Top-3 pins by today's profit in Telegram

**A/B test (DESIGN vs ALBUM pins) — concluded 2026-06-08, dropped**
- ALBUM pins get ₪0 attributed revenue (no AdSense on album landing pages)
- ALBUM vs DESIGN: −34% impressions/pin, −100% clicks, saves, CTR
- 102 album pins still exist on Pinterest but will not be promoted

**Milestone 9b — Mobile Core Web Vitals**
- LCP fix: `priority={true}` on first 4 images in DesignList — 2026-06-06
- LCP fix: `hidden md:block` on top AdSlot (homepage) — 2026-06-10, LCP 1.9s mobile
- CLS fix: `hidden md:block` on top AdSlot for all page types (design, albums, album detail) — 2026-06-11
- AdSlot component restructured: `<ins>` wrapped in `<div class="ad-slot-wrapper">` — AdSense overrides `height` and `max-height` with `!important` on parent elements so CSS-only height capping is not possible; top-ad removal on mobile is the effective fix
- Search Console improvement expected within 1–2 weeks

---

# Milestone 10 — WPF Uploader Integration

## Status

Complete — 2026-06-23.

## Completed work

**SEO Description Generation** — 2026-06-07
- `AnthropicApiKey` added to `App.private.config` (was missing — caused silent failures)
- "Generate SEO Description" button in More Actions; saves `SeoDescription` to DDB

**AI Pin Title Suggestions** — commit `59b3421`, 2026-06-11
- `PinSuggestionsGenerator.cs` — calls `claude-sonnet-4-6`, fires on folder load (fire-and-forget)
- 3 Pinterest-optimized title alternatives shown as radio buttons in WPF Uploader expander
- Board suggestion displayed (informational)
- ↻ Re-generate button
- Selected title injected into upload via `titleOverride` in `UploadPinForPatternAsync`
- Graceful failure: API down / no key → upload unaffected, original title used

**Board suggestion constrained to AlbumBoards.csv** — commit `ca01c00`, 2026-06-12
- AI board suggestion now restricted to actual board names from `AlbumBoards.csv`

## Intentionally dropped

- **Hashtags** — original spec included 12 editable hashtags appended to pin description; removed because hashtags have negligible Pinterest SEO impact

## Intentionally deferred

- Keyword suggestions and UTM recommendations — deferred to future iteration

---

# Milestone 10b — Repo Consolidation Cleanup

## Status

Complete — 2026-06-11.

## Completed work

* Archived 4 standalone GitHub repos: `epolga/cross-stitch`, `epolga/Uploader`, `epolga/AutoPinner`, `epolga/CrossStitch.Shared` (content lives in monorepo)
* `SuppressedListPath` in `MainWindow.xaml.cs`: moved to `uploader/data/list-suppressed.txt` in monorepo
* AutoPinner README: Task Scheduler example paths updated to monorepo paths
* Stale comments and path references in `MainWindow.xaml.cs` updated
* `cross-stitch-platform-docs` left live — Lambda still reads `platform-config.json` and `AlbumBoards.csv` from it

---

# Milestone 10c — Homepage AI Search & User Query Analytics

## Status

Complete — 2026-06-12.

## Goal

Replace the plain text search sidebar with an AI-powered hero search bar on the homepage. Let users describe what they want in natural language and collect search data to understand demand.

## Completed work

**AI-powered hero search bar** — commits `ab5f7c0`, `82e88c7`
- `HeroSearch.tsx` — rose/pink gradient card above the design grid; prominent description, free-text input, Search button, suggestion chips
- `/api/ai-search` route — calls `claude-opus-4-8` to parse natural language into structured filters (`searchText`, width, height, ncolors)
- Semantic expansion: genre terms ("floral", "animals") → comma-separated specific subject names that match design titles
- Comma-separated OR support added to `searchText` filter in `data-access.ts`
- Redirects to `/?{filters}#results` after AI parsing

**Search query logging — DynamoDB** — commit `ab5f7c0`
- `SearchQueries` DynamoDB table (PK: `date`, SK: `ts#random`)
- Every `/api/ai-search` call writes: `rawQuery`, `resolvedFilters` (JSON)
- Fire-and-forget — does not slow down the search response
- IAM updated: `aws-elasticbeanstalk-ec2-role` and `claude-dev` user both granted PutItem on `SearchQueries`

**Search query logging — GA4** — commits `ab5f7c0`, `831121a`
- `HeroSearch.tsx` fires `gtag('event', 'ai_search', { search_query, resolved_filters })` after each search
- Fixed `window.gtag` not being defined: changed inline script from `function gtag(){}` to `window.gtag = function(){}` so Next.js Script component exposes it globally
- GA4 respects DNT/GPC headers — tracking is skipped for users who opt out

**Analytics setup note**
- Register `search_query` as a custom dimension in GA4: Admin → Custom definitions → Custom dimensions → Event-scoped → parameter: `search_query`
- Full doc: `docs/plan/web/SEARCH-QUERIES-ANALYTICS.md`

---

# Milestone 11 — Cross-Platform Expansion

## Status

Future.

## Planned platforms

* Meta

* Reddit

* Google Ads

* TikTok (later)

## Goal

```text

Unified multi-platform marketing intelligence

```

---

# Milestone 12 — Semi-Autonomous Assistant

## Status

Future.

## Planned capabilities

* campaign suggestions

* board suggestions

* creative recommendations

* experiment planning

* trend alerts

Human approval remains part of workflow.

---

# Milestone 13 — Controlled Automation

## Status

Long-term future.

## Planned capabilities

* budget adjustments

* ad pausing

* automated experiments

* campaign scaling

## Important understanding

This stage requires:

* rollback logic

* safety systems

* confidence thresholds

* operational safeguards

---

# Current Estimated Project State

## Current completion estimate

```text

~70% toward useful intelligent advisor stage

```

## Remaining estimated effort

```text

~5–10 focused development days

```

to achieve:

```text

persistent intelligent business advisor

```

with:

* memory

* trends

* AI reasoning

* automated reporting

* uploader recommendations

---

# Strategic stance

This roadmap targets AI-assisted business intelligence with controlled automation and human supervision — not fully autonomous marketing. See **AI Reasoning.md → Important Strategic Direction** for the canonical statement of this stance.

---

# Documentation Modularization

## Status

Completed — including the "one remaining target" noted below, which was
stale as of 2026-07-26: dedicated architecture documents now exist
(`docs/plan/integration/ARCHITECTURE-SUMMARY.md`,
`docs/web/platform-architecture-summary.md`, 273 lines, real content
verified — not a placeholder).

The original large planning document has been split into specialized thematic documents (see Documentation Index for the full list).

# Next Planned Milestones

In active priority order:

* **Site Technology** — see `Cross-Stitch.com — Site Technology Milestones.md` (S1–S8)

* Milestone 11 — Cross-platform expansion

