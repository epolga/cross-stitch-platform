# Low-Level Design — Pinterest Automation

**Corresponds to:** `../03-SRS-Pinterest-Automation.md`,
`../use-cases/03-UseCases-Pinterest-Automation.md`, `../05-SAD.md`
**Status:** Draft, reverse-engineered from the current implementation
**Date:** 2026-07-11

## 1. Scope

Implementation-level detail for pinterest-agent and autopinner: the full
`CrossStitchBusinessHistory` item shapes, the IP-defense state machine, the pin-selection
and claiming algorithm, the anomaly-detection formula, and the daily pipeline's exact step
ordering and failure isolation.

## 2. Data dictionary — `CrossStitchBusinessHistory` (PK `EntityType`, SK `SortKey`)

| EntityType | SortKey | Key attributes |
|---|---|---|
| `DAILY_BUSINESS` | `date` (`YYYY-MM-DD`) | `spend`, `impressions`, `clicks`, `ctr`, `cpc`, `outboundClicks`, `ga4Sessions` (Pinterest-only, paid+organic+referral), `ga4PaidSessions`, `ga4OrganicSessions`, `ga4ReferralSessions`, `ga4TotalAllSessions` (site-wide, correct attribution denominator), `adsenseRevenue`, `revenuePerHundredSessions`, `profit`, `usdIlsRate` |
| `AI_ANALYSIS` | `generatedAt#type` (`type` = `trend`\|`design`) | `analysisType`, `forDate`, `reasoning`, `markdownS3Key`, plus trend-only: `recommendedAction` (`hold_budget`\|`increase_budget`\|`decrease_budget`), `sourceHistoryRange`, `totalDaysAnalyzed`; design-only: `topAlbums`, `underperformingAlbums`, `designDirectionsToCreate` |
| `DESIGN_PIN_MAP` | `designId` (5-digit padded) | linkage between a design and its Pinterest pin |
| `DESIGN_PERFORMANCE` | `snapshotDate#designId` | rolling 30-day impressions/clicks/saves, normalized `savesPerDay`/`impressionsPerDay` |
| `ANOMALY_EVENT` | `detectedAt#metric` | `metric` (`ctr`\|`revenuePerHundredSessions`\|`profit`\|`ga4Sessions`), observed value, trailing mean, standard deviation, `notified: bool` |
| `PROMOTED_AD_STATS` | `date#adId` | per-ad spend/impressions/clicks/CTR |
| `LANDING_PAGE_STATS` | `date#page` | per-landing-page Pinterest session counts |
| `PIN_ATTRIBUTION` | `date#adId` | estimated per-pin revenue/profit |
| `PINTEREST_TOKEN` | `"CURRENT"` (singleton) | `access_token`, `refresh_token`, `expires_at_utc`, `scope`, `writtenAt`, `refreshedAt` |
| `BLOCKED_IP` | `ip` | `reason`, `blockedAt`, `ttl` (epoch seconds, native DDB TTL attribute) |
| `WATCHED_IP` | `ip` | `reason`, `watchedAt`, `ttl` (epoch seconds, native DDB TTL attribute) |
| `IP_HISTORY` | `ip#at` (ISO timestamp) | `action` (`"blocked"`\|`"watched"`), `reason`, `at` — **no TTL attribute, never expires** |

## 3. Pipeline detail (`lambda/handler.ts`)

Ordered, mostly-sequential; steps marked (non-critical) catch and log their own errors
without aborting the run:

```
[init] Pinterest token refresh-if-needed         → §5.1
[init] WAF auto-block IP sync            (non-critical) → §5.2
[init] suspicious IP detection           (non-critical) → §5.3
1  daily-business-report.ts
2  build-business-history.ts        (rebuilds business-history.json, /tmp-local per invocation)
3  build-promoted-ads-report.ts
4  build-landing-page-report.ts
5  build-pin-attribution-report.ts
6  anomalyDetector.ts                → §5.4
7  anomalyNotifier.ts
8  test-ai-trend-analysis.ts (npm alias ai:trend)
9  recommendationChangeNotifier.ts
10 dailySummary.ts (+ inline Saturday Google-token reminder)
11 holidayReminder.ts
12 editorDailySummary.ts
13-14  (disabled — design-pin-map / design-performance / ai-design-analysis; output not
        surfaced anywhere yet, per an inline comment in handler.ts)
```

Steps 3→4→5 are order-dependent (each reads a table written by the previous); a failure in
any of steps 1–12 (not marked non-critical) may abort the remainder of that invocation —
there is no per-step retry or checkpoint/resume within a single Lambda run.

## 4. IP-defense state machine

```
                new IP appears in ALB logs, ≥ threshold req/day
                                │
                                ▼
                    suspiciousIpDetector.ts
                 (Telegram alert only — no state write)
                                │
                                ▼
              operator/AI pastes IP(s) into analyze-ip.ts
           (reverse DNS + method/status/path breakdown for
            the target day — read-only, no state write)
                                │
                                ▼
                    human decision (block / watch / none)
                    ┌───────────┴────────────┐
                    ▼                         ▼
          npm run block-ip -- <ip>   npm run watch-ip -- <ip>
                    │                         │
                    ▼                         ▼
       putBlockedIp() writes:        putWatchedIp() writes:
       BLOCKED_IP (ttl=+30d default)  WATCHED_IP (ttl=+3d default)
       IP_HISTORY (action=blocked,    IP_HISTORY (action=watched,
                   no ttl)                        no ttl)
                    │
                    ▼
     wafIpSync.ts, next pipeline run (or manual trigger):
     queryRange("BLOCKED_IP") → filter ttl > now (defensive,
     DDB native TTL deletion can lag) → addresses = ip/32 list
     → GetIPSetCommand (fetch LockToken) → UpdateIPSetCommand
     (full-set replace, not incremental) on WAF "AutoBlockedIPs"
                    │
                    ▼
       IP denied at the edge until its BLOCKED_IP row's ttl
       passes and the *next* sync runs (no explicit "unblock"
       action exists — expiry is entirely TTL-driven)
```

Re-appearance after expiry: `getIpHistory(ip)` (`queryRange("IP_HISTORY")` filtered by
`ip`, no TTL on this entity type) returns every prior decision regardless of whether the
corresponding `BLOCKED_IP`/`WATCHED_IP` row has since been deleted — this is the only
history-preserving read path in the whole state machine.

## 5. Algorithm detail

### 5.1 Pinterest token refresh (`pinterestTokenManager.ts`)

```
on Lambda cold start (module-level cachedToken = null):
  1. read PINTEREST_TOKEN (SortKey="CURRENT") from CrossStitchBusinessHistory
  2. if absent → fall back to PINTEREST_ACCESS_TOKEN env var (bootstrap path;
     operator must run `npm run seed-pinterest-token` to establish a durable record)
  3. if present and expires_at_utc > now + 7 days → use as-is
  4. else → POST https://api.pinterest.com/v5/oauth/token
             (grant_type=refresh_token, Basic auth = PINTEREST_CLIENT_ID:SECRET)
           → write new access+refresh token + expiry back to DDB
           → Telegram-notify the refresh
  5. cache token in a module-level variable for the remainder of this invocation,
     served to every subsequent pipeline step via getPinterestAccessToken()
```

### 5.2 WAF sync (`wafIpSync.ts`)

Full-set replace, not incremental — every sync recomputes the entire desired address list
from scratch and calls `UpdateIPSetCommand` once with that complete list (requires the
current `LockToken` from a preceding `GetIPSetCommand`, standard WAFv2 optimistic-locking
pattern). No diffing against the WAF set's current contents is performed; a sync is a no-op
in effect only if the computed address list happens to be identical to what's already
there.

### 5.3 Suspicious-IP detection (`suspiciousIpDetector.ts`)

```
1. list S3 keys under alb-logs/AWSLogs/{account}/elasticloadbalancing/{region}/{y}/{m}/{d}/
   for yesterday (UTC)
2. for each gzipped log file: gunzip, split lines, extract client IP from the fixed ALB
   log field position (space-delimited, 4th field, IP:port)
3. tally request count per IP across all files
4. filter: count >= SUSPICIOUS_IP_THRESHOLD (env, default 800) AND ip not in current
   BLOCKED_IP set
5. sort descending by count, Telegram-alert the top 10 with a suggested block-ip command
```
No reverse DNS, no path/status breakdown at this stage — that detail is deliberately
deferred to the separate, human-triggered `analyze-ip.ts` investigation step, keeping the
automated/always-running detection step cheap (a single count-by-IP pass).

### 5.4 Anomaly detection (`anomalyDetector.ts`)

For each tracked metric (`ctr`, `revenuePerHundredSessions`, `profit`, `ga4Sessions`):
compute the trailing 7-day mean and standard deviation from `DAILY_BUSINESS` history, then
flag today's value if `|today − mean| > 2 × stddev`. Each flagged metric becomes one
`ANOMALY_EVENT` row (`notified: false` initially); `anomalyNotifier.ts` batches every
not-yet-notified row into a single email+Telegram message per run, then flips `notified`
to prevent re-alerting the same event on a later run.

### 5.5 autopinner design selection and claiming (`DynamoDbDesignRepository.cs`)

```
GetLatestUnpinnedAsync():
  Query DesignsByID-index (PK=EntityType="DESIGN", SK=DesignID) ScanIndexForward=false
  for each candidate (newest DesignID first):
    skip if any of the 6 historical pin-ID attribute spellings is present and non-empty
    skip if PinterestStatus in {POSTING, POSTED, EXHAUSTED}
    → first surviving candidate is the selection

TryClaimAsync(design):
  UpdateItem with ConditionExpression:
    attribute_not_exists(PinterestStatus) OR PinterestStatus IN {"NEW","FAILED"}
    AND attribute_not_exists(<all 6 pin-ID attribute names>)
  SET PinterestStatus = "POSTING"
  → ConditionalCheckFailedException means another concurrent run already claimed it;
    treated as "move to next candidate," not an error

MarkPostedAsync(design, pinId):
  UpdateItem SET PinID = pinId, PinterestStatus = "POSTED"

on repeated transient failure (429/5xx, up to MaxPinterestAttempts):
  UpdateItem SET PinterestStatus = "EXHAUSTED", PinterestLastError = <message>
```

### 5.6 Theme detection and SEO text (`PinterestUploader.cs`)

Keyword-scored classification: the design's caption/album name is matched (case-
insensitive substring/keyword scoring, not an LLM call) against a fixed set of themes
(cats, dogs, flowers, Christmas, etc.); the highest-scoring theme drives the SEO title
template and hashtag selection. Description is capped at 500 characters with hashtags
appended after the human-readable text, and alt text is generated from the same theme +
caption inputs. This differs from the Uploader's own AI pin-suggestion feature (see
`04-LLD-Uploader.md` §5.1), which does call an LLM — the two are separate, non-shared
implementations of a similar goal (better pin titles), one keyword-based (this component,
used for every autopinner-created pin), one LLM-based (Uploader only, operator-in-the-loop).

### 5.7 Retry policy (`AutoPinner/Utils/RetryPolicy.cs`)

Retries only when the Pinterest API exception is marked transient (HTTP 429/5xx, carried on
`PinterestApiException.IsTransient`); a non-transient error (e.g. 400 validation failure)
is not retried and fails the attempt immediately. Default 5 attempts before autopinner's
own `MaxPinterestAttempts`-driven `EXHAUSTED` marking (§5.5) takes over as the outer limit.

## 6. Sequence diagram — UC-P-03 (suspicious-IP review, detail level)

```
Scheduler        S3(ALB logs)    Telegram      AI agent         DynamoDB          WAF
   │ daily run       │                │             │                │              │
   │─────────────────▶ count/IP        │             │                │              │
   │                 │                │             │                │              │
   │──flagged IPs────────────────────▶│             │                │              │
   │                 │                │─────alert───▶(operator sees Telegram)         │
   │                                              (operator pastes IPs into /review-ip) │
   │                                              │                │              │
   │                                              │◀───reverse DNS + log breakdown─│  (S3 read,
   │                                              │    for target IP(s), target day │   direct)
   │                                              │──queryRange(BLOCKED_IP,          │
   │                                              │   WATCHED_IP, IP_HISTORY)───────▶│
   │                                              │◀──current + historical state────│
   │                                              │ classify + recommend            │
   │                                    (operator confirms block/watch per IP)       │
   │                                              │──putBlockedIp()/putWatchedIp()──▶│
   │                                              │  (writes BLOCKED_IP/WATCHED_IP  │
   │                                              │   + IP_HISTORY, no ttl on latter)│
   │  (next scheduled run, or an out-of-band manual trigger)                        │
   │─────────────────────────────────────────────────────────────────syncBlockedIpsToWaf()─▶
   │                                                                                  │ IP now denied
```

## 7. Error handling notes

- **Non-critical step isolation**: only the WAF sync and suspicious-IP detection steps are
  wrapped to swallow their own errors (per an explicit code comment: "Non-critical: don't
  let a WAF hiccup take down the daily business report"). Every other pipeline step's
  failure mode is "the run stops there" — there is no per-step try/catch/continue for the
  reporting chain.
- **Pinterest Ads API batching limitation**: the promoted-ads report fetches metrics one ad
  at a time because Pinterest's v5 Ads API silently ignores a batched `ad_ids` parameter —
  this is a workaround for an external API limitation, not a self-imposed design choice, and
  should not be "optimized" back to a batched call without re-verifying Pinterest's current
  behavior first.
- **DDB TTL lag**: `wafIpSync.ts` re-filters by `ttl > now` at read time rather than trusting
  that DynamoDB has already physically deleted expired rows (native TTL deletion can lag up
  to ~48 hours past the attribute's value) — this defensive filter is the only thing
  preventing a just-expired block from remaining enforced for up to two extra days.
