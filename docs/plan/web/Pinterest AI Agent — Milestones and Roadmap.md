# Pinterest AI Agent — Milestones and Roadmap

(Migrated from cross-stitch/plan/)

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

Status: Substantially completed.

Goal: Establish developer access to external marketing/analytics APIs early so technical work isn't blocked on platform approvals.

Completed platform infrastructure:
✔ Pinterest developer infrastructure
✔ Google developer infrastructure
✔ Anthropic AI infrastructure
✔ Meta developer infrastructure

Meta details:
Completed:
* Meta for Developers access
* clean Meta app creation
* Marketing API use case selection
* development-mode app setup
* future Facebook/Instagram integration path established

The Meta app currently acts as internal/private infrastructure and is intentionally kept in Development mode. Only the owner/business uses it; no public distribution is planned, so Tech Provider status and advanced Meta reviews are NOT currently required.

This reflects the broader architectural goal: a private intelligent business tool, not a public SaaS platform for external users.

Deferred / lower-priority platforms:
Currently deferred — not blockers for the intelligence architecture:
* Reddit
* TikTok
* X / Twitter
* Google Ads (lower priority while AdSense + Pinterest Ads cover monetization signal)

Priority remains: Pinterest, Google, AI reasoning, historical memory system.

Important understanding:
API approvals can take days, weeks, or longer. Approval processes should run in parallel with development rather than gating it.

---

# Milestone 1 — Google Integrations

Status: Completed.

Completed work:
* Google OAuth working
* GA4 API integration
* AdSense API integration
* Unified Google reporting
* Daily Google JSON reports

---

# Milestone 2 — Pinterest Integrations

Status: Completed.

Completed work:
* Pinterest Ads API access
* Pinterest OAuth/token usage
* Ad account reporting
* Pinterest metrics retrieval

Verified account:
Ad Account ID: 549769986352
Name: Cross Stitch Patterns

---

# Milestone 3 — Unified Business Reporting

Status: Completed.

Completed work:
Combined reporting for:
* Pinterest spend
* Pinterest clicks
* GA4 Pinterest sessions
* AdSense estimated earnings
* Rough profitability estimation

Current outputs:
Pinterest spend
GA4 sessions
AdSense revenue
Profit estimate

---

# Milestone 4 — Initial AI Reasoning Layer

Status: Completed.

Completed work:
* Anthropic API integration
* Claude Sonnet reasoning
* AI recommendation generation
* Operational interpretation of metrics

Important understanding:
The AI currently reasons mostly from:
short-term profitability

Future versions should also reason about:
* long-term audience value
* returning visitors
* newsletter growth
* retention quality

---

# Milestone 5 — Historical Memory System

Status: **Completed 2026-06-03.** All dual-write, soak, read cutover, and JSON write removal steps done.

Completed work:
* aggregate historical reports (`build-business-history.ts` → `reports/business-history.json`)
* trend calculations
* moving averages (3-day, 7-day windows)

Remaining work (full DynamoDB persistence — every report family currently in `reports/`):
* daily business reports → DDB
* AI recommendation history → DDB (markdown bodies to S3)
* AI trend-analysis artifacts → DDB + S3
* design ↔ pin map → DDB (canonical schema name `DesignPinMap`)
* per-design performance → DDB (`DesignPerformance`)
* AI design insights → DDB + S3 (`AIDesignInsight`)
* anomaly detection → new `ANOMALY_EVENT` rows
* delete local JSON writes after a parity-verified dual-write window

Estimated effort:
3–4 focused development days (revised up from original 1–2 estimate, which only covered the daily-business slice).

## Storage layout

Single new table: **`CrossStitchBusinessHistory`** (matches the `CrossStitchItems` single-table style — discriminator-driven, `PAY_PER_REQUEST`, same account/region).

* PK `EntityType` (S) — values: `DAILY_BUSINESS`, `DAILY_GOOGLE`, `AI_RECOMMENDATION`, `AI_ANALYSIS`, `DESIGN_PIN_MAP`, `DESIGN_PERFORMANCE`, `AI_DESIGN_INSIGHT`, `ANOMALY_EVENT`
* SK `SortKey` (S) — date (`YYYY-MM-DD`), ISO timestamp, or `date#designId` depending on entity
* No GSIs in v1 (add only when a real query demands one)

New S3 bucket: **`cross-stitch-ai-reports`** for AI markdown bodies. DDB items hold the `S3Key` pointer; bodies live at `analysis/{YYYY-MM-DD}/{timestamp}.md`.

`business-history.json` becomes a *derived* artifact — recomputed on read from `DAILY_BUSINESS` rows rather than persisted.

## Implementation steps

1. Write schema contract [plan/integration/business-history-schema.md](../integration/business-history-schema.md) (12-section template) — gates everything else.
2. `scripts/init-history-storage.ts` — idempotent `CreateTable` + `CreateBucket`. Not part of daily run.
3. `src/services/historyStore.ts` — DDB wrapper with `putDailyBusiness`, `putAiRecommendation`, `putDesignPinMap`, `putDesignPerformance`, `putAiDesignInsight`, `putAnomaly`, `queryRange`.
4. `src/services/aiArtifactStore.ts` — S3 wrapper, `putMarkdown(date, ts, body) → s3Key`.
5. Dual-write — add DDB write next to every existing `fs.writeFileSync`:
   * [x] `daily-business-report.ts` → `putDailyBusiness` (2026-05-22)
   * [x] `export-design-pin-map.ts` → `batchPutDesignPinMap` (2026-05-23)
   * [x] `build-design-performance.ts` → `batchPutDesignPerformance` (2026-05-23)
   * [x] `test-ai-trend-analysis.ts` → `putMarkdown` + `putAiAnalysis` (2026-05-23)
   * [x] `test-ai-design-analysis.ts` → `putMarkdown` + `putAiAnalysis` (2026-05-23)
   * [x] `build-recommendation-history.ts` — confirmed pure read-only summarizer (2026-05-23); no dual-write needed. To be repointed at `queryRange("AI_ANALYSIS")` as part of the post-soak read cutover (step 8).
6. `scripts/backfill-history.ts` — one-shot walk of every existing `reports/*.json` + AI markdown into DDB/S3. Idempotent. **(Done 2026-05-23; 6 DAILY_BUSINESS + 3 AI_ANALYSIS rows backfilled.)**
7. `scripts/verify-history-parity.ts` — daily diff between DDB-reconstructed JSON and on-disk JSON during the soak window; fail-fast on diff. **(Done 2026-05-23; wired into `daily-run.bat` as the final step. Soak window log: [SOAK-WINDOW.md](../../../web/SOAK-WINDOW.md).)**
8. ~~Switch reads in `historyBuilder.ts` (`loadReports`) and the analysis scripts from `fs.readdirSync` to `historyStore.queryRange`.~~ **(Done 2026-06-03)**
9. ~~One-week dual-write soak with daily parity check.~~ **(Done 2026-06-03; 8 days all ✓)**
10. ~~Delete JSON writes — strip `fs.writeFileSync` calls; stop generating `reports/` content; markdown lives in S3 only.~~ **(Done 2026-06-03)**
11. `src/services/anomalyDetector.ts` — query last 30 `DAILY_BUSINESS` rows, flag >2σ deviations from trailing-7-day mean (CTR, revenue/session, profit, sessions), write `ANOMALY_EVENT` rows. Wire into `daily-run.bat` after `npm run history`. Notifications deferred to Milestone 8. **(Done 2026-05-23; first real detection runs once ≥8 DAILY_BUSINESS rows exist — expected 2026-05-30.)**
12. IAM — add `dynamodb:PutItem/GetItem/Query/BatchWriteItem` on `CrossStitchBusinessHistory` and `s3:PutObject/GetObject` on `cross-stitch-ai-reports/*`. Becomes a Lambda role in Milestone 7.
13. Update this section to "Completed" once steps 1–12 ship.

---

# Milestone 6 — Multi-Day AI Trend Reasoning

Status: Completed (Version 1). See the matching completion section in Memory and Trend Analysis.

Completed work:
* multi-day AI analysis (`test-ai-trend-analysis.ts`)
* trend interpretation across 3-day and 7-day windows
* confidence estimation (structured JSON output)
* pattern recognition
* longitudinal reasoning
* persisted AI outputs (`reports/ai-analysis/*.md/json`, `reports/ai-recommendations-history.json`)

Example reasoning the system now produces:
CTR improving for 5 days
Revenue/session declining
Possible low-quality traffic increase

---

# Milestone 6b — Design-Level Intelligence V1

Status: Completed (Version 1). See the matching "Design-Level Intelligence Layer" section in Memory and Trend Analysis for the architectural framing.

Completed work:
* per-pin Pinterest analytics (impressions, clicks, outboundClicks, ctr, saves) over a rolling 30-day window
* design ↔ pin map sourced from DynamoDB (`export-design-pin-map.ts`)
* per-pin metrics enrichment (`build-design-performance.ts`)
* AI design analysis identifying strongest themes, underperforming albums, and design directions to create (`test-ai-design-analysis.ts`)
* operational outputs: `reports/design-pin-map.json`, `reports/design-performance.json`, `reports/design-insights.{md,json}`, dated archive under `reports/ai-analysis/`, append to `reports/ai-recommendations-history.json`
* wired into `daily-run.bat` after the existing trend-analysis chain

Initial categorization:
Album caption is used as the temporary theme/category field. Richer per-design metadata (theme, style, subject, colors) is deferred to a future iteration.

Remaining work for V2:
* richer design categorization beyond album captions
* DynamoDB persistence — folded into Milestone 5 (`DESIGN_PIN_MAP`, `DESIGN_PERFORMANCE`, `AI_DESIGN_INSIGHT` rows in `CrossStitchBusinessHistory`)

---

# Milestone 7 — Automated Scheduling

Status: **Completed 2026-06-04.** Lambda + EventBridge running; Windows Task Scheduler disabled.

Completed work:
* automatic daily execution via Windows Task Scheduler
* `daily-run.bat` orchestrating the full daily pipeline with fail-fast logging to `daily-run.log`
* automated report generation
* AWS Lambda function `cross-stitch-daily-pipeline` (nodejs20.x, 1024 MB, 15 min timeout)
* EventBridge rule `cross-stitch-daily-5am` firing at 02:00 UTC daily
* Lambda retry pattern: first invocation warms Pinterest metrics cache; auto-retry completes in ~2.5 min
* Windows Task Scheduler `PinterestDailyReport` disabled 2026-06-04

---

# Milestone 7b — Elastic Beanstalk Platform Upgrade (cross-stitch.com web app)

Status: Planned (low-priority operational maintenance).

The EB environment `cross-stitch-com-env-clone` currently runs Node.js 20 / Amazon Linux 2023 / 6.9.0, which the AWS console flags as **"Deprecated platform branch"** (still receives maintenance updates but has a scheduled retirement date). Upgrade to the current supported branch before retirement.

Planned work:
* identify the current supported Node.js + Amazon Linux 2023 platform branch (or jump to Node.js 22 / AL2023 if available)
* `eb upgrade` from the deployed ref, OR stand up a parallel environment on the new platform and DNS-swap if a longer soak is warranted (the latter keeps a quick rollback target available)
* smoke-test cross-stitch.com after the swap: homepage, `/terms`, `/privacy-policy`, paid-download flow, GA + AdSense script load

Estimated effort:
~0.5 focused development day (plus a maintenance window).

Note: distinct from Milestone 7. M7 moves the *cron agent* off the developer machine onto Lambda + EventBridge; this milestone upgrades the *web app* platform branch underneath EB, which keeps serving cross-stitch.com regardless of where the agent runs.

---

# Milestone 8 — Email / Notification Layer

Status: **Completed 2026-06-04.**

Completed work:
* SES wiring: `CrossStitch-SES-Send` IAM policy; `src/services/sesClient.ts`; verified sender `ann@cross-stitch.com`.
* Anomaly notifications via SES + Telegram: `src/services/anomalyNotifier.ts`, idempotent, `notified=true` flag in DDB.
* Daily summary email + Telegram digest: `src/services/dailySummary.ts` — KPIs, 7-day averages, AI action — sent at end of every pipeline run (step 10/10).
* AI recommendation change alerts via SES + Telegram: `src/services/recommendationChangeNotifier.ts` — fires when `recommendedAction` flips between consecutive trend runs; `changeNotified=true` flag prevents duplicate sends.
* Telegram bot `@cross_stitch_automation_bot`: `src/services/telegramClient.ts` thin fetch wrapper; credentials in `.env` + Lambda env vars.
* Google OAuth token refresh reminder via Telegram every Saturday: `src/services/googleTokenReminder.ts`; replaces Windows MessageBox popup. `lambda/push-google-token.ps1` updates Lambda env var after local refresh.

Deferred (out of scope for this milestone):
* SES bounce / complaint handling
* `GoogleTokenRefreshReminder` Windows task disable (Telegram covers the notification; task left enabled as fallback)

---

# Milestone 9 — Better Attribution

Status: Planned.

Planned work:
Improve:
traffic quality understanding
including:
* landing-page analysis
* returning users
* monetization depth
* newsletter conversion quality

Estimated effort:
2–3 focused development days

---

# Milestone 10 — WPF Uploader Integration

Status: Planned.

Planned work:
Uploader becomes:
publishing interface for the AI agent

Future features:
* AI title suggestions
* board suggestions
* description suggestions
* keyword suggestions
* UTM recommendations

Recommended architecture:
WPF Uploader
↓
Agent backend
↓
AI recommendations
↓
User approval
↓
Pinterest publishing

Estimated effort:
3–5 focused development days

---

# Milestone 11 — Cross-Platform Expansion

Status: Future.

Planned platforms:
* Meta
* Reddit
* Google Ads
* TikTok (later)

Goal:
Unified multi-platform marketing intelligence

---

# Milestone 12 — Semi-Autonomous Assistant

Status: Future.

Planned capabilities:
* campaign suggestions
* board suggestions
* creative recommendations
* experiment planning
* trend alerts

Human approval remains part of workflow.

---

# Milestone 13 — Controlled Automation

Status: Long-term future.

Planned capabilities:
* budget adjustments
* ad pausing
* automated experiments
* campaign scaling

Important understanding:
This stage requires:
* rollback logic
* safety systems
* confidence thresholds
* operational safeguards

---

# Current Estimated Project State

Current completion estimate:
~70% toward useful intelligent advisor stage

Remaining estimated effort:
~5–10 focused development days

to achieve:
persistent intelligent business advisor

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

Status: Completed.

The original large planning document has been split into specialized thematic documents (see Documentation Index for the full list). A dedicated Architecture document is the one remaining target.

# Next Planned Milestones

In active priority order:
* **Milestone 7b** — EB platform upgrade for cross-stitch.com (~0.5 day)
* **Milestone 9** — Better attribution: landing page analysis, returning users, monetization depth (~2-3 days)
* **Milestone 10** — WPF Uploader integration: AI title/board/keyword suggestions (~3-5 days)
