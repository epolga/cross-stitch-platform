# Monitoring and Alerting Specification — cross-stitch-platform

**Status:** Draft, verified against `03-LLD-Pinterest-Automation.md`, `03-SRS-Pinterest-Automation.md`,
and `05-SAD.md` §8.2 — consolidates what's already established elsewhere into one
monitoring-focused reference; introduces no new claims.
**Date:** 2026-07-11

## 1. Philosophy (as-built, not prescribed)

There is no centralized metrics/APM platform (no Datadog, no CloudWatch dashboards-as-code,
no equivalent) anywhere in this repo. Monitoring is achieved entirely through **purpose-
built, push-based notifications** fired by pinterest-agent's daily pipeline, plus two
pull-based dashboards on the Website. This spec documents that reality — see §5 for the
gaps this leaves.

## 2. What's measured

| Metric | Source | Computed by | Stored in |
|---|---|---|---|
| Ad spend, impressions, clicks, CTR, CPC | Pinterest Ads API | `daily-business-report.ts` | `DAILY_BUSINESS` |
| GA4 sessions (Pinterest paid/organic/referral, and true site-wide total) | GA4 Data API | `daily-business-report.ts` | `DAILY_BUSINESS` |
| AdSense estimated revenue | AdSense API | `daily-business-report.ts` | `DAILY_BUSINESS` |
| Revenue-per-100-sessions, profit | Derived (revenue/spend/sessions) | `daily-business-report.ts` | `DAILY_BUSINESS` |
| Per-ad spend/impressions/clicks/CTR | Pinterest Ads API | `build-promoted-ads-report.ts` | `PROMOTED_AD_STATS` |
| Per-landing-page Pinterest sessions | GA4 Data API | `build-landing-page-report.ts` | `LANDING_PAGE_STATS` |
| Per-pin attributed revenue/profit | Derived (joins the above) | `build-pin-attribution-report.ts` | `PIN_ATTRIBUTION` |
| Per-design Pinterest performance (impressions/clicks/saves) | Pinterest pin analytics | `build-design-performance.ts` | `DESIGN_PERFORMANCE` (not on the automated daily pipeline — see `03-LLD-Pinterest-Automation.md` §3, disabled steps) |
| Request volume per source IP | ALB access logs (S3) | `suspiciousIpDetector.ts` | Not stored — alert-only |
| Editor usage (opens, conversions, PDF exports, errors) | Website's own event logging | `POST /api/analytics/editor-event` | Code-only DDB table, see `08-Data-Dictionary.md` §9 |
| Feature-request/feedback volume | Website submissions | `saveFeatureRequest` | Code-only DDB table, see `08-Data-Dictionary.md` §7 |
| Pinterest OAuth token freshness | `PINTEREST_TOKEN` record | `pinterestTokenManager.ts` | `CrossStitchBusinessHistory` |

**Nothing here monitors application health directly** (no uptime check, no error-rate
metric on the Website's own API routes, no Lambda invocation-failure metric surfaced
anywhere other than raw CloudWatch Logs) — every measured value above is a **business**
metric, not an **operational** one. See §5.

## 3. Alert rules

| # | Condition | Threshold | Fires from | Channel(s) | Frequency control |
|---|---|---|---|---|---|
| 1 | An IP's daily request count | ≥ `SUSPICIOUS_IP_THRESHOLD` (default 800), and not already in `BLOCKED_IP` | `suspiciousIpDetector.ts`, every pipeline run | Telegram | None — re-fires every day the IP stays above threshold and unblocked (by design, so it isn't silently forgotten) |
| 2 | A tracked metric (`ctr`, `revenuePerHundredSessions`, `profit`, `ga4Sessions`) deviates from its trailing 7-day mean | \| observed − mean \| > 2 × stddev | `anomalyDetector.ts` → `anomalyNotifier.ts` | Email + Telegram | Deduplicated via `ANOMALY_EVENT.notified` flag — each anomaly alerts exactly once |
| 3 | The AI trend analysis's budget recommendation changes | `recommendedAction` differs from the immediately prior run's | `recommendationChangeNotifier.ts` | Email + Telegram | Only fires on an actual change, not every run — the "no change" case produces no alert, only a mention in the next daily digest |
| 4 | Pinterest token nearing expiry | ≤ 7 days (`REFRESH_THRESHOLD_DAYS`) until `expires_at_utc` | `pinterestTokenManager.ts`, every pipeline run | Telegram | Fires on every successful refresh (i.e., roughly weekly in steady state, whenever the threshold is crossed) |
| 5 | Google API token approaching its 7-day "Testing mode" expiry | Fixed weekly cadence | `googleTokenReminder.ts` | Telegram | Saturdays only, unconditional (not threshold-based — this one is a calendar reminder, not a real freshness check) |
| 6 | Upcoming holiday (site-relevant) | 14 or 28 days lead time | `holidayReminder.ts` | Telegram + email | Fixed lead-time windows |
| 7 | autopinner: claim failure, Pinterest API failure, exhausted retries, consecutive-failure streak | Various, see `03-LLD-Pinterest-Automation.md` §5.7 | `AlertDeduplicator` in autopinner's `EmailNotifier` | Email (SES, via shared `EmailHelper`) | Cooldown-based deduplication — repeated identical failures within the cooldown window don't each generate a separate email |
| 8 | Client-side application error reported from the Website | Any `POST /api/log-client-error` call | `log-client-error` route | Email (admin) | Throttled to 1 email per 60 seconds regardless of error volume in that window |
| 9 | Registration form opened | Every open, unless from a Googlebot-range IP | `notify-admin` (default path, no custom subject/message) | Email (admin) | None — fires on every open; includes the client-side `HumanLikelihood` heuristic score |

## 4. Scheduled (non-conditional) notifications

These aren't "alerts" in the threshold sense — they fire on every successful pipeline run
regardless of content:

| Notification | Content | Channel(s) | Suppressed when |
|---|---|---|---|
| Daily KPI digest | Spend, clicks, sessions, revenue, profit, 7-day averages, latest AI recommendation, top-3 pins by 7-day profit | Email + Telegram | Never (always sent on a completed run) |
| Editor daily summary | Sessions, PDF exports | Email | Zero editor sessions that day |

## 5. Dashboards (pull-based)

| Dashboard | Route | Data | Requires |
|---|---|---|---|
| Feature requests | `/admin/feature-requests` | List + status of submitted feedback | Admin session |
| Editor analytics | `/admin/editor-analytics` | 30-day funnel (opens→conversions→exports), error log, top entry sources, recent feedback | Admin session |

**Nothing else in the platform has a pull-based dashboard** — there is no equivalent view
for Pinterest-automation's own health (pipeline success/failure history, IP-block state
over time, anomaly history) beyond querying `CrossStitchBusinessHistory` directly.

## 6. Known monitoring gaps

1. **No application/infrastructure health metrics.** Nothing monitors Website error rates,
   API route latency, Lambda invocation failures/duration, or DynamoDB throttling as a
   *metric* — the only signal for "the pipeline didn't run correctly" is the absence of the
   expected daily digest (`12-Runbook.md` §3), which is a weak, delayed signal.
2. **No uptime monitoring.** Nothing actively checks that the Website is reachable — an
   outage is discovered by the operator noticing, not by an automated check.
3. **No dashboard for Pinterest-automation's own state.** All of its output is push-only
   (§3, §4); there's no equivalent of the two admin pages (§5) for this subsystem, so
   answering "what's the current anomaly/IP-block picture" requires either waiting for the
   next digest or querying DynamoDB directly (as this session's `_check_*.ts` scratch
   scripts did repeatedly).
4. **No deduplication across channels for the same event.** Several alerts (anomalies,
   recommendation changes, holiday reminders) fire on both email and Telegram for the same
   underlying event — this is redundancy, not a gap, but worth noting it's not
   independent coverage (both channels going down simultaneously is a shared-failure risk
   neither redundant path protects against).
5. **AdSense/PayPal account-level health is invisible to this platform.** Neither AdSense's
   own policy/ad-review center nor PayPal's own dispute/risk signals are pulled into any
   alert here — confirmed as a real gap during this session's live AdSense-decline
   investigation (`12-Runbook.md` §5).
6. **No autopinner monitoring beyond its own SES alerts** (§3 row 7) — no visibility into
   how many designs remain unpinned, how close to the daily cap it's running, or whether the
   daemon process is even alive, from any of pinterest-agent's own reporting.
