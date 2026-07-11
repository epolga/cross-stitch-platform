# Test Cases — Pinterest Automation

**Derived from:** `../use-cases/03-UseCases-Pinterest-Automation.md`
**Status:** Draft. Per `../09-Test-Plan.md` §2, this subsystem has **zero automated test
coverage** today (no test runner configured for pinterest-agent, no .NET test project for
autopinner) — every test case below is currently manual-only or unexercised. This document
still specifies them concretely so they can be automated incrementally per
`../09-Test-Plan.md` §4.2 priority 4, and so manual verification (e.g. during a `/review-ip`
session) has a checklist to follow in the meantime.

## TC set for UC-P-01 — Run the daily business-and-defense pipeline

| ID | Title | Priority | Steps (condensed) | Expected result |
|---|---|---|---|---|
| TC-P-01-01 | Full pipeline completes and writes one row per report type | High | 1. Trigger the Lambda handler for a known date with fixture upstream data. | One new `DAILY_BUSINESS`, `PROMOTED_AD_STATS`(×N), `LANDING_PAGE_STATS`(×N), `PIN_ATTRIBUTION`(×N) row set written for that date. |
| TC-P-01-02 | WAF-sync failure does not abort the pipeline | High | 1. Force `syncBlockedIpsToWaf()` to throw (e.g. simulate a WAF API error). 2. Run the pipeline. | Error is logged; steps 3–12 still execute and produce their normal output. |
| TC-P-01-03 | Suspicious-IP-detection failure does not abort the pipeline | High | 1. Force `detectSuspiciousIps()` to throw (e.g. simulate an S3 read error). 2. Run the pipeline. | Error is logged; the rest of the pipeline still runs. |
| TC-P-01-04 | A failure in a non-critical-marked step (e.g. `build-promoted-ads-report.ts`) halts the remainder | Medium | 1. Force step 3 to throw. 2. Run the pipeline. | Steps 4+ do not execute in this invocation (per the documented "no per-step try/catch for the reporting chain" behavior); confirms the current failure-isolation boundary is exactly steps `[init]` and nothing else. |
| TC-P-01-05 | Steps 3→4→5 respect data dependency order | Medium | 1. Run the pipeline once from empty state. | `PIN_ATTRIBUTION` computation for that date only succeeds if `PROMOTED_AD_STATS` and `LANDING_PAGE_STATS` for the same date already exist. |

## TC set for UC-P-02 — Post a newly published design to Pinterest

| ID | Title | Priority | Steps (condensed) | Expected result |
|---|---|---|---|---|
| TC-P-02-01 | Newest unpinned design is selected first | High | 1. Seed 3 unpinned designs with different `DesignID`s. 2. Run `GetLatestUnpinnedAsync`. | The highest `DesignID` is returned. |
| TC-P-02-02 | A design already carrying any of the 6 pin-ID spellings is skipped | High | 1. Seed a design with `PinterestPinId` set (a legacy spelling) but no canonical `PinID`. 2. Run selection. | This design is not selected as a candidate. |
| TC-P-02-03 | Concurrent claim conflict is handled without error | High | 1. Simulate two processes calling `TryClaimAsync` on the same design near-simultaneously. | Exactly one claim succeeds; the other receives a `ConditionalCheckFailedException` and moves to the next candidate without failing the run. |
| TC-P-02-04 | Successful pin creation writes `PinID` and `POSTED` status | High | 1. Claim a design. 2. Call the (mocked) Pinterest API successfully. | Design row updated: `PinID` set, `PinterestStatus:"POSTED"`. |
| TC-P-02-05 | Transient failure (429/5xx) retries up to the configured limit | High | 1. Mock the Pinterest client to return 429 on every call. 2. Attempt to pin a design. | Retries exactly `MaxPinterestAttempts` times, then marks the design `EXHAUSTED` with `PinterestLastError` populated. |
| TC-P-02-06 | Non-transient failure (e.g. 400) does not retry | Medium | 1. Mock a 400 validation error from Pinterest. | Attempt fails immediately, no retry loop entered (per `RetryPolicy`'s `IsTransient` check). |
| TC-P-02-07 | Missing board mapping and no default board fails cleanly | Medium | 1. Seed a design in an album with no `AlbumBoards.csv` entry, and no `DefaultBoardId` configured. 2. Attempt to pin. | Attempt fails with a clear board-resolution error; operator alert fires (per `FR-NOTIF-3`); other designs in the same batch are unaffected. |
| TC-P-02-08 | Daily cap stops further posting once reached | Medium | 1. Set `DailyCap=2`. 2. Have 2 designs already posted since midnight UTC. 3. Run a batch. | No further pin attempts made in this run. |

## TC set for UC-P-03 — Detect and respond to a suspicious IP

| ID | Title | Priority | Steps (condensed) | Expected result |
|---|---|---|---|---|
| TC-P-03-01 | IP above threshold and not already blocked triggers a Telegram alert | High | 1. Seed ALB logs with an IP at ≥800 req/day, not in `BLOCKED_IP`. 2. Run detection. | Telegram alert sent listing the IP among the top 10. |
| TC-P-03-02 | Already-blocked IP is excluded from the alert | Medium | 1. Seed the same scenario but with the IP already in `BLOCKED_IP`. | IP is not included in the alert output. |
| TC-P-03-03 | `analyze-ip.ts` returns accurate evidence for a given IP/date | High | 1. Run `analyze-ip.ts` against fixture ALB logs for a known IP. | Reported reverse DNS, method mix, status distribution, and top paths match the fixture data exactly. |
| TC-P-03-04 | `analyze-ip.ts` performs no state mutation | High | 1. Run `analyze-ip.ts`. 2. Check `BLOCKED_IP`/`WATCHED_IP`/`IP_HISTORY` before and after. | No rows added, changed, or removed. |
| TC-P-03-05 | `block-ip` writes both `BLOCKED_IP` and `IP_HISTORY` | High | 1. Run `npm run block-ip -- <ip> "<reason>"`. | `BLOCKED_IP` row created with default 30-day TTL; `IP_HISTORY` row created with `action:"blocked"`, no TTL. |
| TC-P-03-06 | `watch-ip` writes both `WATCHED_IP` and `IP_HISTORY` | High | 1. Run `npm run watch-ip -- <ip> "<reason>"`. | `WATCHED_IP` row created with default 3-day TTL; `IP_HISTORY` row created with `action:"watched"`, no TTL. |
| TC-P-03-07 | Known legitimate crawler is never recommended for blocking | High | 1. Feed an IP with PTR resolving to `*.googlebot.com` and high volume through the classification logic (manual, since this is currently a human/AI judgment call, not code). | Recommendation is "no action" regardless of volume. |
| TC-P-03-08 | WAF sync reflects a freshly blocked IP on the next sync | High | 1. Block an IP. 2. Run `syncBlockedIpsToWaf()`. | The IP (as `/32`) appears in the WAF `AutoBlockedIPs` set. |
| TC-P-03-09 | WAF sync removes an IP whose block has expired | High | 1. Seed a `BLOCKED_IP` row with `ttl` in the past. 2. Run sync. | The IP is excluded from the computed address list sent to `UpdateIPSetCommand`, even if DynamoDB hasn't yet physically deleted the row (defensive `ttl > now` filter). |

## TC set for UC-P-04 — Recognize and escalate a repeat-offender IP

| ID | Title | Priority | Steps (condensed) | Expected result |
|---|---|---|---|---|
| TC-P-04-01 | History persists after the active watch/block record expires | High | 1. Watch an IP. 2. Let/force its `WATCHED_IP` row to expire and be deleted. 3. Call `getIpHistory(ip)`. | The prior watch decision is still returned, with its original reason and timestamp. |
| TC-P-04-02 | `getIpHistory` returns every decision, not just the latest | Medium | 1. Watch an IP, let it expire, then block the same IP. 2. Call `getIpHistory(ip)`. | Both the earlier watch and the later block appear, in chronological order. |
| TC-P-04-03 | An IP with no history returns an empty list, not an error | Low | 1. Call `getIpHistory` for an IP never seen before. | Returns `[]`. |

## TC set for UC-P-05 — Act on an AI budget-recommendation change

| ID | Title | Priority | Steps (condensed) | Expected result |
|---|---|---|---|---|
| TC-P-05-01 | Notification fires only when the recommendation changes | High | 1. Run trend analysis twice with fixture data that produces `hold_budget` both times. | No recommendation-change notification sent (idempotent). |
| TC-P-05-02 | Notification fires on an actual change | High | 1. Run trend analysis where the prior stored recommendation is `hold_budget` and the new one is `increase_budget`. | Notification sent with both old and new values, confidence, and reasoning. |
| TC-P-05-03 | Narrative analysis is stored to S3 alongside the structured result | Medium | 1. Run trend analysis. | `AI_ANALYSIS` row's `markdownS3Key` points to a real object containing the narrative. |

## TC set for UC-P-06 — Investigate a metric anomaly

| ID | Title | Priority | Steps (condensed) | Expected result |
|---|---|---|---|---|
| TC-P-06-01 | A value beyond 2σ from the trailing 7-day mean is flagged | High | 1. Seed 7 days of `DAILY_BUSINESS` with low variance, then a day with `profit` far outside 2σ. 2. Run anomaly detection. | An `ANOMALY_EVENT` row is created for `profit` on that date. |
| TC-P-06-02 | A value within 2σ is not flagged | High | 1. Seed a day with `profit` within normal variance. | No `ANOMALY_EVENT` row created. |
| TC-P-06-03 | Notified anomalies are not re-alerted | Medium | 1. Run the notifier once (marks `notified:true`). 2. Run it again without new anomalies. | Second run sends no message. |
| TC-P-06-04 | All not-yet-notified anomalies batch into one message | Medium | 1. Seed 3 unnotified `ANOMALY_EVENT` rows. 2. Run the notifier. | One email + one Telegram message listing all 3, not 3 separate messages. |

## TC set for UC-P-07 — Auto-refresh the Pinterest OAuth token

| ID | Title | Priority | Steps (condensed) | Expected result |
|---|---|---|---|---|
| TC-P-07-01 | Token with >7 days validity is used as-is | High | 1. Seed `PINTEREST_TOKEN` with `expires_at_utc` 10 days out. 2. Run `initPinterestToken()`. | No refresh call made; existing token cached and returned. |
| TC-P-07-02 | Token within 7 days of expiry triggers a refresh | High | 1. Seed a token expiring in 3 days. 2. Run `initPinterestToken()`. | Refresh-token grant called; new token written to DDB; Telegram notification sent. |
| TC-P-07-03 | Missing token record falls back to the bootstrap env var | Medium | 1. Delete the `PINTEREST_TOKEN` record. 2. Set `PINTEREST_ACCESS_TOKEN` env. 3. Run `initPinterestToken()`. | Bootstrap token used for this invocation; a log/warning indicates the seed script should be run. |
| TC-P-07-04 | Refreshed token is served to every step in the same invocation | Medium | 1. Trigger a refresh at pipeline start. 2. Check the token used by a later step (e.g. pin-analytics fetch). | Same refreshed token used throughout, not re-fetched per step. |
