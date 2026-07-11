# Runbook — cross-stitch-platform

**Status:** Draft, built from procedures verified this session (the `/review-ip` skill, the
AdSense-decline investigation walked live in this session's history, the deploy scripts) —
not invented incident procedures.
**Date:** 2026-07-11
**Audience:** The site operator, or an AI agent (Claude Code) acting under the operator's
direction. Single-operator platform (`00-Overview.md` §4) — there is no on-call rotation or
escalation path beyond "the operator investigates."

## 1. Where to look at logs and status, by component

| Component | Where | How |
|---|---|---|
| Website (EB) | EB environment logs | `eb logs cross-stitch-com-env-clone` from `web/`; `eb status cross-stitch-com-env-clone` for Health |
| Website (app-level errors) | Operator's own inbox | Client-side errors are proactively emailed via `POST /api/log-client-error` (throttled to 1/60s) — see `06-API-Specification.md` §8 |
| pinterest-agent (Lambda) | AWS CloudWatch Logs | Log group for `cross-stitch-daily-pipeline`; also `aws lambda invoke ... out.json` for a manual on-demand run's immediate output |
| pinterest-agent (business state) | DynamoDB `CrossStitchBusinessHistory` | Query directly, or via the scratch `_check_*.ts` scripts pattern established this session (see `automation/pinterest-agent/scripts/`) |
| ALB access logs (raw traffic) | S3 bucket `cross-stitch-logs` | `alb-logs/AWSLogs/{account}/elasticloadbalancing/{region}/{y}/{m}/{d}/`, read by `analyze-ip.ts`/`suspiciousIpDetector.ts` |
| autopinner | Wherever it's actually hosted (undocumented — see `11-Deployment-Guide.md` §4) | Unknown — resolve this gap before relying on this row |
| Uploader | In-app status log (`txtStatus` in `MainWindow.xaml`) | Visible only while the app is open; not persisted anywhere after the window closes |
| Notifications (fast) | Telegram | All pinterest-agent alerts (token refresh, suspicious IPs, anomalies, recommendation changes, holiday reminders) |
| Notifications (digest + records) | Operator's email (SES) | Daily KPI digest, anomaly batch, editor-usage summary, autopinner operational alerts |

## 2. Incident: Website is down or unhealthy

1. `eb status cross-stitch-com-env-clone` — check Health.
2. If not Green: `eb logs cross-stitch-com-env-clone` and look for the actual error (deploy
   failure, app crash, resource exhaustion).
3. **If this followed a recent deploy**: the most likely cause is a contaminated production
   build (see `11-Deployment-Guide.md` §2.1 steps 4/6 — a `next dev` server running during
   or after the build). Re-run the full `/deploy-web` procedure from a clean state rather
   than patching around the symptom.
4. **If this followed a recent Uploader publish**: the Uploader restarts the EB environment
   after every publish (`04-LLD-Uploader.md` §3) — check whether the timing correlates. A
   restart failing mid-flight is a plausible cause distinct from a bad code deploy.
5. If the cause isn't a recent deploy or restart, check for a traffic/abuse spike as the
   cause (§4 below) before assuming an application bug — this platform has real, repeated
   history of scraping/bot surges causing load-related symptoms this session alone.

## 3. Incident: Daily digest email/Telegram message didn't arrive

1. Check CloudWatch Logs for the most recent `cross-stitch-daily-pipeline` invocation
   (should have fired at 02:00 UTC per the EventBridge schedule).
2. **If the invocation didn't happen at all**: check the EventBridge rule
   `cross-stitch-daily-5am` is still `ENABLED` and correctly targets the function (a
   redeploy via `deploy.ps1` re-wires this every time, so this is unlikely unless something
   was changed manually outside the script).
3. **If the invocation happened but errored**: per `03-LLD-Pinterest-Automation.md` §3
   ("Non-critical step isolation"), only the WAF-sync and suspicious-IP-detection steps are
   failure-isolated — an error in any other step (business report, promoted-ads report,
   landing-page report, pin-attribution, anomaly detection, AI trend analysis) **stops the
   rest of that run**, including the digest send at step 10. Find which step actually threw
   and fix that, rather than assuming the digest logic itself is broken.
4. **If the invocation succeeded with no errors but the digest still didn't arrive**: check
   SES sending status/quota and the Telegram bot token/chat ID are still valid — these are
   the last step, so a healthy run with a silently-failing final send is the remaining
   explanation.
5. Trigger a manual re-run once the cause is fixed:
   `aws lambda invoke --function-name cross-stitch-daily-pipeline --payload '{}' --region us-east-1 out.json`.

## 4. Incident: Suspicious traffic / suspected scraping or abuse

This is the platform's most-exercised runbook procedure — use the `/review-ip` skill
directly rather than improvising:

1. Gather the IP list (from the Telegram suspicious-IP alert, or from `npm run watch-ip`
   entries whose watch period just expired).
2. Run evidence-gathering: `analyze-ip.ts` (reverse DNS, method/status/path breakdown) —
   read-only, mutates nothing.
3. **Before recommending anything**, check whether each IP is already known: currently
   active `BLOCKED_IP`/`WATCHED_IP`, **and** the permanent `IP_HISTORY` record (which
   survives past an expired block/watch — see `03-LLD-Pinterest-Automation.md` §4). A
   repeat offender with an escalating pattern is stronger evidence for a block than an
   isolated first appearance.
4. Classify each IP: known legitimate crawler → no action; CGNAT/mobile with no
   scan-pattern → usually no action; scanner/exploit-probe pattern → recommend block;
   heavy-but-plausible real user → no action; ambiguous → recommend watch, not block.
5. **Never block or watch without the operator's explicit per-IP confirmation** — this is a
   hard rule (`03-SRS-Pinterest-Automation.md` FR-IP-3), not a default that can be
   overridden for convenience.
6. After confirmation: `npm run block-ip -- <ip> "<reason>"` or
   `npm run watch-ip -- <ip> "<reason>"`.
7. **A fresh block does not take effect immediately** — it's enforced at the network edge
   only on the next scheduled pipeline run's WAF-sync step (or an explicit manual sync — see
   §4.1 below if the situation is urgent enough to not wait for the next 05:00 run).

### 4.1 Urgent block — don't want to wait for the next scheduled sync

If a block genuinely can't wait for the next daily pipeline run, sync WAF directly and
immediately rather than invoking the whole Lambda: call `syncBlockedIpsToWaf()`
(`src/services/wafIpSync.ts`) from a local script with `WAF_AUTO_BLOCK_IP_SET_ID` set (look
up via `aws wafv2 list-ip-sets --scope REGIONAL`, filter to `Name=='AutoBlockedIPs'`, if not
already in the local `.env`). This was done successfully mid-session on 2026-07-11 for
IP `45.127.44.48` — see that session's history for the exact working command shape.

## 5. Incident: A business metric (revenue, sessions, CTR) looks wrong

**Don't jump to conclusions from a short window.** This exact scenario played out in this
session's history (an apparent AdSense decline on 2026-07-10/11) and the lesson is directly
applicable as a runbook step:

1. Pull the metric over a full 30-day window, not just the last few days — a short window
   can make normal reversion-to-mean look like a trend (compute mean/median/stddev, not
   just eyeball the numbers).
2. If the recent days are still below the monthly mean even after that check, look at the
   composition, not just the total: break the metric down by sub-dimension (country, page,
   click type, etc.) — the 2026-07-11 session found the real signal (a click-mix shift
   toward near-zero-value clicks from a specific country, correlated with known suspicious
   IP activity that same day) only appeared at that finer level, not in the daily total.
3. Cross-reference against IP-abuse activity for the same date range (§4) — degraded
   traffic quality from bot/scraper activity can suppress ad value without showing up as an
   outright traffic-volume drop.
4. Check the `ANOMALY_EVENT` table (`CrossStitchBusinessHistory`) for whether the automated
   2σ detector already flagged this date — if not, the deviation may be within normal
   variance even if it "looks" off to a human glancing at raw numbers.
5. If a real, unexplained decline is confirmed (not noise, not traffic-quality-explained),
   treat it as a genuine incident worth deeper investigation (ad account health, policy
   flags in the AdSense UI, which this platform's own tooling cannot see — `05-SAD.md` §8.2
   already notes there's no automated visibility into AdSense's own Ad Review /
   Policy Center).

## 6. Incident: A design publish left orphaned state

Per `04-LLD-Uploader.md` §7, the publish sequence has two hard-abort points (Pinterest pin
creation failure, DynamoDB write failure) with no automatic rollback:

1. **If Pinterest pin creation failed**: S3 objects from the earlier upload step already
   exist with nothing referencing them yet. Either retry the publish for the same batch
   (accepting the now-orphaned first attempt's S3 objects as unused waste) or manually clean
   up the orphaned S3 keys under `charts/`, `pdfs/{albumId}/...`, `photos/...` for that
   design ID before retrying, to avoid confusing a future manual S3 audit.
2. **If the DynamoDB write failed** (pin created, S3 uploaded, catalog row missing): the
   Pinterest pin now points at a design with no catalog entry. Either manually construct and
   write the missing `CrossStitchItems` row (using the pin ID that was actually returned,
   visible in the Uploader's status log) or delete the orphaned pin and S3 objects and
   restart the publish from scratch. Don't leave it half-done — a design page link from that
   pin would 404 until resolved either way.
3. There is no automated detection for this failure mode — it surfaces only via the
   operator noticing (a failed publish attempt, or a design missing from the site that the
   Uploader's log shows as "successfully" pinned). Treat any publish failure as needing a
   manual state check, not just a retry.

## 7. Incident: Pinterest OAuth token refresh failing

1. Check the Telegram channel for the weekly (Saturday) Google-token reminder vs. an actual
   Pinterest refresh failure — these are two different credentials with two different
   refresh mechanisms (`03-LLD-Pinterest-Automation.md` §5.1); don't conflate them.
2. If the Pinterest token itself is the problem: `PINTEREST_TOKEN` (singleton row in
   `CrossStitchBusinessHistory`) holds the current state — check `expires_at_utc`.
3. If the stored refresh token itself has been revoked/invalidated (not just expired), the
   automated refresh will fail regardless of the 7-day threshold logic — this requires a
   manual OAuth re-authorization. The Uploader has a **"Pinterest Re-Authorize"** button
   (`04-SRS-Uploader.md` FR-ADM-3) for exactly this; there is no equivalent button for
   pinterest-agent/autopinner — re-seed via `npm run seed-pinterest-token` after
   re-authorizing through the Uploader, since both consume the same shared token file/record
   per `05-SAD.md` §4.4.

## 8. Non-incidents (don't over-react)

- Small-sample realtime metrics (2–8 concurrent users, a single day's traffic dip) fluctuate
  normally — don't chase deploy/scraping/day-of-week explanations without a concrete
  triggering signal first (established as a standing practice this session).
- A watch entry expiring with no follow-up action is expected — it's a probation marker, not
  an alert requiring immediate response; review it whenever convenient within its window,
  not necessarily the moment it expires.
