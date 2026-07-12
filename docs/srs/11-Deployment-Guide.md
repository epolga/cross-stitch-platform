# Deployment Guide — cross-stitch-platform

**Status:** Draft, verified against `.claude/commands/deploy-web.md`, `lambda/deploy.ps1`,
and the root `README.md` — not inferred.

**Date:** 2026-07-11

**Related:** `05-SAD.md` §7 (deployment view), `10-Deferred-Items.md` (no CI/CD exists —
everything here is a manual procedure)

## 1. Overview

Every deployment in this platform is **manual**, triggered by the operator (or an assisting
AI agent under the operator's instruction) — there is no CI/CD pipeline (`10-Deferred-Items.md`).
Four components deploy independently, on four different mechanisms:

| Component | Target | Trigger | Automated by |
|---|---|---|---|
| Website (`web/`) | AWS Elastic Beanstalk | Manual | `/deploy-web` skill (`.claude/commands/deploy-web.md`) |
| pinterest-agent (`automation/pinterest-agent/`) | AWS Lambda + EventBridge | Manual | `lambda/deploy.ps1` |
| autopinner (`automation/autopinner/`) | Not a managed AWS deploy target — runs as a long-lived or scheduled process wherever it's hosted | Manual | None found — no deploy script in the repo |
| Uploader (`uploader/`) | Operator's own machine | Manual (build in Visual Studio) | None — not a "deployment" in the usual sense |

## 2. Website (`web/`) → Elastic Beanstalk

**Environment name:** `cross-stitch-com-env-clone`

### 2.1 Procedure (verbatim from `.claude/commands/deploy-web.md` — do not skip steps)

1. **Kill the dev server first.** A running `next dev` process contaminates the production
   build's webpack module IDs, causing homepage 500s. Confirm port 3000 is no longer
   listening before continuing.
2. **Clean** `web/.next/` to avoid stale/mixed artifacts.
3. **Build**: `npm run build` from `web/`. Stop and report on failure.
4. **Verify the production manifest**: `web/.next/build-manifest.json`'s `lowPriorityFiles`
   must reference a hashed `static/<hash>/` path, **not** `static/development/` — the
   latter means a dev server contaminated the build after the fact.
5. **Local smoke test**: kill anything on port 3001, start `npm start -- -p 3001` in the
   background, wait for it to come up, then curl `/`, `/albums`, and a known design page
   (e.g. `/designs/4217`) — all must return 200. Cross-check the `buildId` in `/`'s response
   against `web/.next/BUILD_ID` to confirm you're hitting the freshly built server, not a
   stale one. **Stop and debug before deploying if anything fails here.**
6. **Re-verify the manifest** (step 4's check again) — a dev server can be started by the
   operator at any point between build and deploy.
7. **Deploy**: `eb deploy cross-stitch-com-env-clone` from `web/`.
8. **Check status**: `eb status cross-stitch-com-env-clone` — Health must be Green. If not,
   fetch `eb logs cross-stitch-com-env-clone` and diagnose before considering the deploy
   done.

### 2.2 Notes

- The Uploader also triggers an Elastic Beanstalk **restart** (not a code deploy) after
  every design publish, via `ElasticBeanstalkHelper.RestartEnvironmentAsync` — this refreshes
  the running instance's in-memory design cache, it does not deploy new code
  (`04-LLD-Uploader.md` §3).
- This is the only component with an explicit, documented smoke-test step baked into its
  deploy procedure — none of the other three components have an equivalent pre-deploy
  verification gate today.

## 3. pinterest-agent (`automation/pinterest-agent/`) → AWS Lambda

**Function name:** `cross-stitch-daily-pipeline` | **Region:** `us-east-1` | **Runtime:**
`nodejs22.x` | **Timeout:** 900s (Lambda's maximum) | **Memory:** 1024 MB

**Trigger:** EventBridge rule `cross-stitch-daily-5am`, `cron(0 2 * * ? *)` — 02:00 UTC
(05:00 local, UTC+3)

**Execution role:** `cross-stitch-lambda-pipeline`

### 3.1 Procedure (`lambda\deploy.ps1`, run from `automation/pinterest-agent/`)

```powershell
.\lambda\deploy.ps1
```

The script is idempotent and does all of the following on every run:

1. `npm run build:lambda` — esbuild bundles `lambda/handler.ts` → `lambda/dist/handler.js`
   (minified, single file, Node 22 target).
2. Ensures the IAM execution role exists (creates it on first run only), then **on every
   run** re-applies four inline policies so a role created before a feature existed still
   picks up new permissions as they're added:
   - `AWSLambdaBasicExecutionRole` (managed policy, log write)
   - `CrossStitchDynamoDB` — full CRUD on `CrossStitchBusinessHistory`; `Scan`/`Query` only
     (read-only) on `CrossStitchItems` and its indexes
   - `CrossStitchS3` — `PutObject`/`GetObject` on `cross-stitch-ai-reports/*`
   - `CrossStitchSES` — `ses:SendEmail`, restricted to `FromAddress = ann@cross-stitch.com`
   - `CrossStitchWAF` — `GetIPSet`/`UpdateIPSet` scoped to the `AutoBlockedIPs` IP set ARN
     (looked up dynamically; if the IP set doesn't exist yet, the script warns and skips —
     the WAF sync step will then no-op at runtime rather than fail)
   - `CrossStitchLogsRead` — `ListBucket`/`GetObject` on `cross-stitch-logs` (ALB access
     logs, read by the suspicious-IP detector)
3. Zips `lambda/dist/handler.js` → `lambda/dist/handler.zip`.
4. `aws lambda create-function` (first deploy) or `aws lambda update-function-code` +
   `update-function-configuration` (subsequent deploys).
5. Creates/updates the EventBridge rule and wires it to the function (removes and re-adds
   the `AllowEventBridge` invoke permission each time, to avoid a duplicate-statement
   error).

### 3.2 Post-deploy manual verification

The script prints a suggested test invocation at the end:

```
aws lambda invoke --function-name cross-stitch-daily-pipeline --payload '{}' --region us-east-1 out.json
```

There is no automated post-deploy smoke test (unlike the Website) — run the above manually
and check `out.json` plus CloudWatch Logs for the invocation before trusting a fresh deploy
to run unattended at the next scheduled 05:00 firing.

### 3.3 Environment variables required at runtime

Not consolidated in a single reference file in the repo (a stray comment in `handler.ts`
references an `env-vars.md` that does not actually exist as a separate file — treat that
reference as stale). Known required variables, compiled from source across this session's
research: `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET`, `PINTEREST_ACCESS_TOKEN`
(bootstrap fallback only, §3.1 of `03-LLD-Pinterest-Automation.md`), `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID`, `ANTHROPIC_API_KEY`, Google OAuth credentials for GA4/AdSense access,
`AWS_REGION`, `HISTORY_TABLE_NAME` (defaults to `CrossStitchBusinessHistory`),
`SUSPICIOUS_IP_THRESHOLD` (optional, default 800), `WAF_AUTO_BLOCK_IP_SET_NAME`/
`WAF_AUTO_BLOCK_IP_SET_ID`. **This list should be treated as a starting point, not
authoritative** — confirm the full set against the Lambda console's current environment
variable configuration before relying on it to provision a new environment from scratch.

## 4. autopinner (`automation/autopinner/`) — no deploy script found

The root `README.md` gives only the local dev-run command:

```
cd automation/autopinner && dotnet run --project src/AutoPinner
```

No packaging, publishing, or deployment automation (script, Dockerfile, systemd unit,
scheduled-task definition) was found anywhere in `automation/autopinner/`. `05-SAD.md` §7
already flagged this as "deployment target not fully pinned down in the codebase examined."
**This is a genuine gap in the deployment story**, not an oversight in this guide — if
autopinner runs somewhere persistently today, how it got there and how to redeploy an
update to it is undocumented. Confirm with the operator where/how this process is actually
kept running before this section can be completed accurately.

## 5. shared library (`shared/`)

Not deployed independently — `shared/src/CrossStitch.Shared` is consumed as a project
reference by Uploader and autopinner's own build (`dotnet build shared/src/CrossStitch.Shared`
per the root README, or transitively when building either consuming project). A change here
only takes effect once whichever consumer references it is rebuilt and (for autopinner)
redeployed per §4's caveat, or (for Uploader) rebuilt per §6.

## 6. Uploader (`uploader/`)

Not a deployment in the server sense — a WPF desktop application built and run directly on
the operator's own machine via Visual Studio (`uploader/Uploader.sln`). "Updating" it means
pulling the latest source and rebuilding locally; there is no distribution/installer step
since there is exactly one user, on one machine.

## 7. Order of operations when multiple components change together

No dependency-ordering documentation exists today. Based on what each component actually
depends on (`05-SAD.md` §6):

- A change to `shared/` that affects Pinterest upload behavior should be verified against
  **both** Uploader and autopinner before either is considered done, since both consume the
  same code.
- A Website schema change (new DynamoDB attribute) should deploy the Website **before**
  relying on Uploader or autopinner to populate that attribute correctly, or vice versa,
  depending on which side is the writer — check `08-Data-Dictionary.md` for who owns each
  table before assuming an order.
- pinterest-agent has no hard deploy-order dependency on the other three components — it
  only reads their output (GA4/AdSense externally, `CrossStitchItems` internally) and can be
  redeployed independently at any time.
