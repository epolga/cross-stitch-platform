# Configuration Reference — cross-stitch-platform

**Status:** Draft. The Website/pinterest-agent list is verified by grepping every
`process.env.*` reference in `web/src`, `automation/pinterest-agent/src`,
`automation/pinterest-agent/scripts`, and `automation/pinterest-agent/lambda` — not
inferred. The Uploader/autopinner lists are carried over from the config-key inventories
already established in `04-SRS-Uploader.md` §2.3 and `03-LLD-Pinterest-Automation.md` §3,
not independently re-grepped for this document.

**Date:** 2026-07-11

**Purpose:** Closes the gap flagged in `11-Deployment-Guide.md` §3.3 — no single file in the
repo lists every configuration variable a component needs. This is that file. Values are
**not** included (secrets); only names, purpose, and default/fallback behavior where known
from source.

## 1. Website (`web/`) — Next.js, Elastic Beanstalk env vars

Generic AWS SDK / Node.js / cloud-provider auto-detection variables (`AWS_ACCESS_KEY_ID`,
`AWS_REGION`, `NODE_ENV`, `GOOGLE_APPLICATION_CREDENTIALS`, etc.) are omitted — this table
covers only application-specific configuration.

### 1.1 Core / auth

| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | HS256 signing secret for the `cs_session` JWT cookie (`06-API-Specification.md` §1). Compromise = every session forgeable. |
| `ADMIN_EMAIL`, `ADMIN_EMAILS` | Comma-separated admin email allow-list, checked by `requireAdmin`. Two variable names found — confirm which is actually read where before assuming they're interchangeable. |
| `PASSWORD_RESET_TTL_SECONDS` | Overrides the default 7200s (2h) password-reset token expiry. |
| `DEBUG_AUTH` | Diagnostic flag affecting auth-path logging (exact behavior not independently traced). |

### 1.2 Download mode / trial / subscription

| Variable | Purpose |
|---|---|
| `DOWNLOAD_MODE`, `NEXT_PUBLIC_DOWNLOAD_MODE` | Site-wide `free`/`register`/`paid` switch (`01-LLD-Website.md` §5.2). Server var takes precedence when both are set. |
| `TRIAL_DOWNLOAD_LIMIT`, `TRIAL_DOWNLOAD_LIMIT_ENABLED` | Free-trial download allowance and whether the limit is enforced at all. |
| `TRIAL_DURATION_DAYS`, `NEXT_PUBLIC_TRIAL_DURATION_DAYS` | Free-trial length; public variant presumably feeds client-side copy ("14-day trial" text) rather than the server-side entitlement check. |

### 1.3 PayPal

| Variable | Purpose |
|---|---|
| `PAYPAL_CLIENT_ID`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Server/client PayPal app credentials. |
| `PAYPAL_CLIENT_SECRET` | Server-only — never exposed to the client. |
| `PAYPAL_MONTHLY_PLAN_ID`, `PAYPAL_YEARLY_PLAN_ID`, `NEXT_PUBLIC_PAYPAL_MONTHLY_PLAN_ID`, `NEXT_PUBLIC_PAYPAL_YEARLY_PLAN_ID` | Subscription plan IDs (`06-API-Specification.md` §2 also notes hardcoded fallback defaults exist in code). |
| `PAYPAL_MONTHLY_PRICE`, `PAYPAL_YEARLY_PRICE`, `NEXT_PUBLIC_PAYPAL_MONTHLY_PRICE`, `NEXT_PUBLIC_PAYPAL_YEARLY_PRICE` | Display/billing price values. |
| `PAYPAL_WEBHOOK_ID` | Expected webhook ID for signature verification. |
| `PAYPAL_WEBHOOK_SKIP_SIGNATURE_VERIFICATION` | **Security-relevant** — bypasses signature verification entirely when set. Intended for local testing only; see `15-Security-and-Threat-Model.md` §3 threat T-6. Must be confirmed **unset** in production. |

### 1.4 AdSense / GA4 / site identity

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_ADSENSE_CLIENT_ID` | AdSense publisher ID. |
| `NEXT_PUBLIC_AD_SLOT_HOME_TOP`, `..._HOME_BOTTOM`, `..._ALBUMS_TOP`, `..._ALBUMS_BOTTOM`, `..._DESIGN_TOP`, `..._DESIGN_BOTTOM` | Per-placement AdSense ad-unit slot IDs (6 total). |
| `NEXT_PUBLIC_SITE_URL` | Canonical site origin, used in generated absolute URLs (sitemap, structured data, email links). |

### 1.5 AWS resources

| Variable | Purpose |
|---|---|
| `S3_BUCKET_NAME` | Bucket used for the cached sitemap (`01-LLD-Website.md` §5). |
| `ITEMS_TABLE_NAME`, `DYNAMODB_TABLE_NAME` | Override(s) for the `CrossStitchItems` table name — two variable names found; confirm which code path reads which. |
| `DDB_USERS_TABLE` | `CrossStitchUsers` table name override. |
| `DDB_RESET_TOKENS_TABLE` | `PasswordResetTokens` table name override. |
| `DDB_SUBSCRIPTION_EVENTS_TABLE` | `SubscriptionEvents` table name override. |
| `DDB_LIKES_TABLE`, `DDB_LIKES_USER_GSI_NAME` | `CrossStitchLikes` table + its user-scoped GSI name — **this resolves the "table name not independently confirmed" caveat in `08-Data-Dictionary.md` §5**: the table is configurable via this var, confirm the deployed default value separately. |
| `DDB_PATTERNS_TABLE` | Saved-pattern table — resolves the naming caveat in `08-Data-Dictionary.md` §6. |
| `DDB_FEATURE_REQUESTS_TABLE` | Resolves the naming caveat in `08-Data-Dictionary.md` §7. |
| `DDB_BLOG_REACTIONS_TABLE` | Resolves the naming caveat in `08-Data-Dictionary.md` §8. |
| `DDB_EDITOR_EVENTS_TABLE` | Resolves the naming caveat in `08-Data-Dictionary.md` §9. |
| `DDB_SEARCH_QUERIES_TABLE` | Resolves the naming caveat in `08-Data-Dictionary.md` §10. |
| `AWS_SES_FROM_EMAIL`, `SES_FROM_EMAIL`, `SES_SENDER`, `SES_RECIPIENT`, `SES_CONFIGURATION_SET` | Email sending configuration — multiple variable names found across the codebase; do not assume they're all read by the same code path without checking. |

### 1.6 AI

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Used by `/api/ai-search` and `/api/image-search`. |

## 2. pinterest-agent (`automation/pinterest-agent/`) — Node/Lambda env vars

| Variable | Purpose |
|---|---|
| `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET` | OAuth app credentials for token refresh (`03-LLD-Pinterest-Automation.md` §5.1). |
| `PINTEREST_ACCESS_TOKEN` | Bootstrap-only fallback when no `PINTEREST_TOKEN` DDB record exists yet. |
| `PINTEREST_AD_ACCOUNT_ID` | Ad account scoped for spend/analytics pulls. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | All Telegram notifications (`13-Monitoring-and-Alerting-Specification.md`). |
| `ANTHROPIC_API_KEY` | Trend/design AI analysis, editor-summary commentary. |
| `HISTORY_TABLE_NAME` | `CrossStitchBusinessHistory` table name override (default of that name if unset). |
| `SUSPICIOUS_IP_THRESHOLD` | Daily-request-count alert threshold (default 800, `03-LLD-Pinterest-Automation.md` §5.3). |
| `WAF_AUTO_BLOCK_IP_SET_NAME`, `WAF_AUTO_BLOCK_IP_SET_ID` | Target WAF IP set for block enforcement. |
| `AI_ARTIFACT_BUCKET` | S3 bucket for AI-analysis markdown artifacts (`cross-stitch-ai-reports` per `11-Deployment-Guide.md` §3.1's IAM policy — confirm this env var is what actually sets that bucket name at runtime). |
| `REPORTS_DIR` | Local output directory for standalone/manual report scripts. |
| `GSC_SITE_URL`, `GSC_DAYS`, `GSC_INSPECT_LIMIT` | Google Search Console standalone scripts (`gsc-report.ts`, `search-analytics.ts`) — **not** part of the automated daily pipeline (`03-LLD-Pinterest-Automation.md` §3). |

## 3. Uploader (`uploader/`) — App.config / App.private.config

Per `04-SRS-Uploader.md` §2.3 (not independently re-grepped for this reference — carried
over from that document's research):

**`App.config`** (checked in, non-secret): S3 bucket/prefix names, site base URL, DynamoDB
table names + attribute-name overrides, Pinterest OAuth endpoints/client ID/board ID/
scopes/redirect URI, Elastic Beanstalk environment name, unsubscribe base URL, sender/admin
email addresses, SES configuration-set name, `%CROSS_STITCH%`-relative template paths.

**`App.private.config`** (gitignored): `SenderEmail`/`AdminEmail` overrides,
`PinterestClientSecret`, `PinterestAccessToken`, `PinterestTokenStorePath`,
`UnsubscribeSecret` (HMAC signing secret for unsubscribe tokens), `SesConfigurationSetName`
override, `AnthropicApiKey` (referenced in code via `HelperFactory.GetAnthropicApiKey()`,
not present in the checked-in `.example` file).

AWS credentials are **not** configured here at all — resolved via the operator machine's
default AWS SDK credential chain (`04-LLD-Uploader.md` §7).

## 4. autopinner (`automation/autopinner/`) — environment variables

Per `03-LLD-Pinterest-Automation.md` §8 (not independently re-grepped for this reference):

| Variable | Purpose |
|---|---|
| `DAILY_CAP` | Max pins posted per day (default 200). |
| `MAX_BATCH_PER_RUN` | Max pins per single run (default 1). |
| `MAX_PINTEREST_ATTEMPTS` | Retry ceiling before marking a design `EXHAUSTED` (default 10). |
| `DDB_TABLE_NAME` | Catalog table name (default `CrossStitchItems`). |
| `BASE_URL`, `IMAGE_BASE_URL`, `PHOTO_PREFIX`, `ALBUM_URL_TEMPLATE` | URL construction for pin destination/image links. |
| `DEFAULT_BOARD_ID` | Fallback board when an album has no CSV mapping. |
| `ALBUM_LINK_RATIO` | A/B split fraction between design-page and album-page pin links. |
| SES/alerting settings | Shared naming convention with the Uploader's own config (exact variable names not independently re-verified). |

Plus the shared-file-path resolution handled by `PlatformConfig.cs` (`PLATFORM_CONFIG_PATH`
env var, or sibling-repo directory walk) — see `05-SAD.md` §4.4.

## 5. Cross-cutting notes

- **Naming inconsistency is itself worth fixing, not just documenting.** Several config
  concerns have more than one variable name found in the codebase for what appears to be
  the same purpose (`ADMIN_EMAIL` vs. `ADMIN_EMAILS`; `ITEMS_TABLE_NAME` vs.
  `DYNAMODB_TABLE_NAME`; `SES_FROM_EMAIL`/`AWS_SES_FROM_EMAIL`/`SES_SENDER`). This reference
  documents the drift found rather than silently picking one — resolving which is actually
  authoritative per call site is follow-up work, not assumed here.
- **No secrets manager anywhere** (`05-SAD.md` §8.1) — every value in this document lives in
  plain env vars, a `.env` file, or a gitignored `.config` file, never AWS Secrets Manager or
  equivalent.
- This reference should be kept up to date the same way `08-Data-Dictionary.md` should — as
  a living document — since, like the DynamoDB schema doc it was written to compensate for,
  it will drift out of date if not maintained alongside feature work.
