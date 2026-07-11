# Use Cases — Pinterest Automation

**Corresponds to:** `../03-SRS-Pinterest-Automation.md`
**Status:** Draft, reverse-engineered from the current implementation
**Date:** 2026-07-11

This document covers the key, non-trivial workflows in the Pinterest-automation
subsystem — the scenarios with real branching logic, not every FR item individually. Each
use case references the SRS requirement IDs it realizes.

## Index

| ID | Name | Primary actor |
|---|---|---|
| UC-P-01 | Run the daily business-and-defense pipeline | Scheduler |
| UC-P-02 | Post a newly published design to Pinterest | Scheduler (autopinner) |
| UC-P-03 | Detect and respond to a suspicious IP | Scheduler / AI agent / Site operator |
| UC-P-04 | Recognize and escalate a repeat-offender IP | AI agent / Site operator |
| UC-P-05 | Act on an AI budget-recommendation change | Site operator |
| UC-P-06 | Investigate a metric anomaly | Site operator |
| UC-P-07 | Auto-refresh the Pinterest OAuth token | Scheduler |

---

## UC-P-01 — Run the daily business-and-defense pipeline

**Primary actor:** Scheduler (Lambda cron trigger).
**Related requirements:** FR-PIPE-1, FR-PIPE-2, NFR-4.

**Trigger:** The daily scheduled invocation fires.

**Main flow:**
1. Pipeline refreshes/loads the Pinterest OAuth token (see UC-P-07 if refresh is needed).
2. Pipeline syncs currently-active IP blocks into the WAF IP set.
3. Pipeline scans the previous day's access logs for suspicious-volume IPs and alerts the
   operator if any are found (feeds UC-P-03).
4. Pipeline pulls the previous day's ad spend, GA4 sessions, and AdSense revenue and writes
   the daily business report.
5. Pipeline rebuilds the rolling business-history trend series.
6. Pipeline generates the per-ad, per-landing-page, and per-pin-attribution reports in that
   order (each depends on data written by the previous).
7. Pipeline runs anomaly detection against the trend series and notifies the operator of any
   newly-detected, not-yet-notified anomalies (feeds UC-P-06).
8. Pipeline runs AI trend analysis and, only if the recommendation changed since the last
   run, notifies the operator (feeds UC-P-05).
9. Pipeline sends the daily KPI digest (email + Telegram) and the editor-usage summary
   email, and checks whether a holiday reminder is due.

**Exception flow (non-critical step failure):** If step 2 (WAF sync) or step 3 (suspicious-
IP detection) fails, the pipeline logs the error and continues to step 4 onward — these two
steps are explicitly non-critical.

**Exception flow (critical step failure):** A failure in the reporting/analysis steps (4–9)
may abort the remainder of the run; the operator learns of the gap from the absence of the
expected daily digest rather than from an explicit failure alert.

**Postconditions:** The business-history table has a new day's data; the WAF reflects the
current block list; the operator has received (or will shortly receive) the daily digest.

---

## UC-P-02 — Post a newly published design to Pinterest

**Primary actor:** Scheduler (autopinner, one-shot or hourly daemon).
**Related requirements:** FR-PIN-1 … FR-PIN-9.

**Trigger:** A scheduled run of autopinner fires (or the Uploader publishes a design
directly — see `04-SRS-Uploader.md`; this use case covers autopinner's own backfill path).

**Main flow:**
1. autopinner queries for the newest unpinned design not already carrying a pin ID and not
   marked posting/posted/exhausted.
2. autopinner atomically claims the design (a conditional update that fails if another
   concurrent run already claimed it).
3. autopinner resolves the destination board from the per-album mapping (or the default
   board if unmapped).
4. autopinner detects a theme for the design and composes an SEO title, description, and alt
   text.
5. autopinner decides design-page-link vs. album-page-link per the running A/B ratio.
6. autopinner creates the pin via the Pinterest API and writes the resulting pin ID and
   `POSTED` status back to the design's row.
7. If the daily pin cap has not yet been reached and more unpinned designs remain, autopinner
   repeats from step 1 up to the configured batch size.

**Alternate flow (transient failure):** A 429/5xx from Pinterest triggers a retry, up to the
configured attempt limit; if attempts are exhausted, the design is marked `EXHAUSTED` and
skipped in future runs (an operator alert fires per FR-NOTIF-3).

**Alternate flow (concurrent claim conflict):** If the atomic claim in step 2 fails (another
run got there first), this run simply moves on to the next candidate design without treating
it as an error.

**Alternate flow (no board available):** If the design's album has no board mapping and no
default board is configured, autopinner fails this design's attempt and alerts the operator,
without crashing the run for other designs.

**Postconditions:** Either the design carries a new pin ID and `POSTED` status, or it is
marked `FAILED`/`EXHAUSTED` with a recorded error for later investigation.

---

## UC-P-03 — Detect and respond to a suspicious IP

**Primary actor:** Scheduler (detection), AI agent (investigation/recommendation), Site
operator (decision).
**Related requirements:** FR-IP-1 … FR-IP-5.

**Trigger:** The daily suspicious-IP scan (UC-P-01 step 3) finds one or more IPs whose
daily request volume meets or exceeds the alert threshold, or the operator manually pastes a
list of IPs (e.g., from a watch period that just expired) for review.

**Main flow:**
1. System (or operator, ad hoc) supplies a list of candidate IPs.
2. AI agent gathers evidence per IP: reverse DNS, HTTP method mix, status-code distribution,
   and top requested paths for the relevant day, plus whether the IP is already blocked or
   watched (and, per UC-P-04, its permanent history).
3. AI agent classifies each IP against known patterns (legitimate crawler, CGNAT/mobile
   network, scanner/exploit-probe, plausible heavy real user, or ambiguous) and recommends
   block, watch, or no action — citing the specific evidence, not just a verdict.
4. AI agent presents the recommendation per IP to the operator and waits.
5. Operator confirms (or overrides) the recommended action per IP.
6. For each confirmed block or watch, the system writes the corresponding time-boxed record
   and a permanent history entry.
7. Blocks take effect at the network edge on the next WAF sync (UC-P-01 step 2), unless the
   operator explicitly requests immediate enforcement, in which case the sync is triggered
   out-of-band right away.

**Exception flow (known legitimate crawler):** If reverse DNS confirms a documented crawler
(e.g., a search-engine or SEO-tool crawler, or Pinterest's own crawler), the AI agent
recommends no action regardless of request volume, and flags explicitly that blocking it
would harm the site's own SEO/Pinterest-traffic goals.

**Exception flow (ambiguous evidence):** If the evidence doesn't clearly indicate abuse (no
reverse DNS, elevated but not clearly scanning traffic), the AI agent recommends watch, not
block, deferring the harder call to a follow-up review after the watch period.

**Postconditions:** Every reviewed IP has an explicit, human-confirmed outcome (block,
watch, or no action) with a documented reason; nothing is blocked or watched without that
confirmation (per FR-IP-3, this is a hard requirement, not a default).

---

## UC-P-04 — Recognize and escalate a repeat-offender IP

**Primary actor:** AI agent, Site operator.
**Related requirements:** FR-IP-6, FR-IP-7.

**Trigger:** An IP reappears in a new suspicious-activity alert after its earlier block or
watch record has already expired.

**Main flow:**
1. As part of UC-P-03 step 2, the AI agent checks the IP's active block/watch state (likely
   none, since the earlier record expired) **and** its permanent history record.
2. System returns the full history: every prior block/watch decision, reason, and
   timestamp for that IP, regardless of whether those records have since expired and been
   deleted.
3. AI agent factors the repeat-offense pattern into its recommendation — e.g., a second or
   third appearance with an escalating pattern (more aggressive paths, new abuse type) is
   stronger evidence for a block than a first-time ambiguous signal would be.
4. Operator reviews the escalation rationale alongside the current day's evidence and
   decides (per UC-P-03 steps 4–6).

**Postconditions:** The decision reflects the IP's full history, not just its currently-
active state — a previously-blocked IP whose block lapsed does not look "new" to the review
process.

---

## UC-P-05 — Act on an AI budget-recommendation change

**Primary actor:** Site operator.
**Related requirements:** FR-AI-1, FR-AI-2, FR-NOTIF-1.

**Trigger:** The daily pipeline's AI trend analysis step (UC-P-01 step 8) produces a
recommendation (hold/increase/decrease budget) that differs from the immediately prior run's
recommendation.

**Main flow:**
1. System sends the operator a notification stating the previous recommendation, the new
   recommendation, the AI's confidence, and its reasoning.
2. Operator reads the accompanying narrative analysis (stored alongside the structured
   recommendation) for context.
3. Operator decides whether to act on the recommendation (e.g., adjust Pinterest ad spend
   outside this system) or to leave spend unchanged.

**Alternate flow (no change):** If the day's recommendation matches the prior run's, no
notification is sent — the operator instead sees the (unchanged) recommendation only in the
next daily digest, not as a separate alert.

**Postconditions:** None enforced by the system — budget changes, if any, happen outside
this subsystem (e.g., directly in Pinterest Ads Manager); this use case is advisory only.

---

## UC-P-06 — Investigate a metric anomaly

**Primary actor:** Site operator.
**Related requirements:** FR-ANOM-1, FR-ANOM-2.

**Trigger:** The daily pipeline's anomaly-detection step (UC-P-01 step 7) flags a metric
whose latest value is more than 2 standard deviations from its trailing 7-day mean.

**Main flow:**
1. Operator receives a batched notification (email + Telegram) listing every new anomaly:
   metric, direction, observed value, trailing mean, standard deviation, and an
   explanatory note on how to interpret sigma.
2. Operator investigates the underlying cause manually (e.g., cross-referencing AdSense,
   GA4, or IP-abuse data for the same date, as demonstrated in this platform's own review
   sessions).
3. Operator either identifies an actionable cause (e.g., a burst of low-quality traffic) and
   takes action elsewhere (e.g., UC-P-03), or concludes the anomaly is benign variance and
   takes no action.

**Postconditions:** The anomaly is marked notified so it is not repeated in a future digest;
whether the underlying cause was resolved is tracked outside this system (the anomaly record
itself does not have a resolution/root-cause field).

---

## UC-P-07 — Auto-refresh the Pinterest OAuth token

**Primary actor:** Scheduler.
**Related requirements:** FR-TOK-1, FR-TOK-2.

**Trigger:** Every pipeline run, as its first step (UC-P-01 step 1).

**Main flow:**
1. System reads the currently stored Pinterest token record.
2. If the token has more than 7 days until expiry, the system uses it as-is.
3. If the token is within 7 days of expiry, the system exchanges the refresh token for a new
   access token via Pinterest's OAuth endpoint, writes the new token and expiry back to
   durable storage, and notifies the operator (Telegram) that the refresh succeeded.

**Exception flow (no stored token — cold start):** If no token record exists yet, the system
falls back to a bootstrap token from configuration and logs that the one-time seeding
script should be run to establish a durable record.

**Postconditions:** A valid, non-expiring-soon Pinterest access token is available to every
subsequent step in the same pipeline run.
