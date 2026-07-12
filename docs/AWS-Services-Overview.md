# AWS Services Overview

A plain-English inventory of every AWS service the Cross-Stitch platform uses, why each one was chosen, and how it fits into the system. This is a reference document for Olga (single operator of the whole platform) — not a formal contract. For exact attribute names, ARNs, and probe commands, see the detailed contracts under `docs/integration/` (`aws-deployment.md`, `dynamodb-schema.md`, `s3-paths.md`).

**Account:** `358174257684`, single-tenant, region `us-east-1` for everything.

---

## 1. Elastic Beanstalk — hosts the web app

**Why:** The public site (`cross-stitch.com` / `cross-stitch-pattern.net`) is a Next.js app that needs a server to run on, but there's no dedicated ops team — EB gives a managed environment (load balancer, health checks, auto-provisioned EC2) without hand-building that infrastructure or running a CI/CD pipeline.

**How:** Application `cross-stitch-com`, environment `cross-stitch-com-env-clone`. Deploys are manual — Olga runs `eb deploy` from her workstation; there is no CI. `.ebextensions/*.config` files (checked into the `web` repo) configure the instance: install step, port 3000, swap space, health-check path, CloudWatch log shipping. One EC2 instance (`t2.small`) behind an Application Load Balancer; deploys are `AllAtOnce`, so the site briefly goes offline on every deploy.

## 2. EC2 — the compute behind Elastic Beanstalk

**Why:** EB provisions EC2 instances automatically; they're only touched directly when a restart doesn't fully clear a stuck process.

**How:** Instances are tagged `Name = cross-stitch-com-env-clone`. The Uploader app has a lower-level "reboot by tag" helper (`EC2Helper.cs`) as an escape hatch, separate from the normal EB restart button. SSH is disabled by policy — access is via SSM Session Manager only, no inbound port 22.

## 3. S3 — file storage, four separate buckets by purpose

**Why:** Different data has different access patterns and lifecycles, so it's split across buckets rather than one shared one.

**How:**
- `cross-stitch-designs` — the actual design assets (chart images, PDFs, photos). Written by the Uploader (WPF app), read publicly through CloudFront — the web app never talks to this bucket directly.
- `cross-stitch-sitemap-cache` — sitemap XML cache and the design-embeddings vector file used for semantic/image search.
- `cross-stitch-ai-reports` — AI-generated analytics artifacts written by the Pinterest-agent Lambda pipeline.
- `cross-stitch-logs` — ALB access logs, read by the suspicious-IP detector to spot scraping/bot traffic.

## 4. CloudFront — CDN in front of the design bucket

**Why:** Serving thousands of design photos/PDFs straight from S3 would be slower and costlier than fronting them with a CDN; it also gives every design a stable public URL independent of the app server.

**How:** Distribution `d2o1uvvg91z7o4.cloudfront.net`, origin is `cross-stitch-designs`. URLs are unsigned/public-read (`/photos/{AlbumID}/{DesignID}/...`, `/pdfs/{AlbumID}/...`) — anyone with an Album/Design ID can fetch the file. `eb deploy` does not invalidate the cache, so edge objects can lag behind an S3 update until TTL expires.

## 5. DynamoDB — the primary database

**Why:** A simple, serverless, pay-per-request NoSQL store fits a catalog + user store maintained by one person with no dedicated DBA — no servers to patch, scales automatically.

**How:** Five tables in play:
- `CrossStitchItems` — the main catalog (single-table design: `EntityType = DESIGN | ALBUM | USER`), written by the Uploader, read by the web app. Three GSIs support pagination and lookup by design ID.
- `CrossStitchUsers` — the newer, cleaner user table (registration, password reset, subscriptions).
- `PasswordResetTokens`, `SubscriptionEvents` — auxiliary tables for the web app's auth/billing flows.
- `CrossStitchBusinessHistory` — daily analytics history written by the Pinterest-agent Lambda pipeline (also stores `BLOCKED_IP` rows with a native TTL, which double as the WAF block-list source of truth — see §9).

## 6. SES (Simple Email Service) — all outbound email

**Why:** Cheap, reliable transactional + bulk email without running a mail server; scoped by a `FromAddress` condition so the Lambda role can only send as the one address it needs.

**How:** Two senders — `ann@cross-stitch-pattern.net` for the web app's transactional mail (password reset, etc.) and Uploader's newsletter blasts; `ann@cross-stitch.com` for the Pinterest-agent Lambda's daily summary/anomaly emails, all landing at `olga.epstein@gmail.com` as admin recipient.

## 7. Lambda — the daily Pinterest/analytics pipeline

**Why:** Replaces a Windows Task Scheduler job (`daily-run.bat`) that needed a machine to be on; running it in Lambda makes the daily report/AI pipeline run unattended in the cloud instead of depending on Olga's workstation being awake.

**How:** Function `cross-stitch-daily-pipeline`, Node.js 22.x, 1024 MB, 15-minute timeout (the Lambda maximum — this pipeline is long enough to need it: 14+ sequential steps covering reports, AI trend/design analysis, anomaly detection, WAF sync, and summary emails). Deployed via `automation/pinterest-agent/lambda/deploy.ps1`, which also provisions its own IAM role and policies (see §8).

## 8. IAM — access control, one role per actor

**Why:** Each component gets only the permissions it needs; the deploy script attaches new inline policies on every run so a role created before a feature existed still picks up the permission it needs later.

**How:**
- `aws-elasticbeanstalk-service-role` / `aws-elasticbeanstalk-ec2-role` — EB's own service role and the EC2 instance profile (grants the running app its DynamoDB/S3/SES access at runtime).
- `cross-stitch-lambda-pipeline` — the Lambda's execution role: basic execution (CloudWatch Logs) plus scoped inline policies for DynamoDB (`CrossStitchBusinessHistory` read/write, `CrossStitchItems` read-only), S3 (`cross-stitch-ai-reports` read/write, `cross-stitch-logs` read), SES (send-as `ann@cross-stitch.com` only), and WAFv2 (get/update the one IP set it manages).
- The Uploader and other AWS SDK clients on Olga's workstation use the default credential chain (`~/.aws/credentials`) rather than an explicit IAM user in code.

## 9. WAF (WAFv2) — automatic IP blocking

**Why:** Scrapers and bots hitting the site need to be blocked at the edge, not just noticed after the fact; doing it by hand doesn't scale.

**How:** A regional IP set called `AutoBlockedIPs`. The Lambda pipeline's suspicious-IP detector writes `BLOCKED_IP` rows (with a TTL) to `CrossStitchBusinessHistory`; each pipeline run then syncs the IP set to match the currently-active (non-expired) rows. DynamoDB's TTL is the actual source of truth for when a block expires — there's no separate "unblock" step, an IP just drops off the next sync after its TTL passes.

## 10. ACM (Certificate Manager) — TLS

**Why:** Free, auto-renewing TLS certificates for the ALB's HTTPS listener, covering both apex domains and their `www` subdomains in one certificate.

**How:** One certificate covering `cross-stitch.com`, `www.cross-stitch.com`, `cross-stitch-pattern.net`, `www.cross-stitch-pattern.net`, attached to the EB environment's ALB HTTPS listener.

## 11. Route 53 — DNS

**Why:** Keeps DNS in the same AWS account as everything else it points at.

**How:** Hosted zones for both domains, with ALIAS/CNAME records pointing at the EB environment's load balancer.

## 12. CloudWatch — logs and monitoring

**Why:** Centralized place to see what the app and the Lambda pipeline are doing without SSH-ing into a box.

**How:** The EB instance ships one custom log stream (`webhook.log`) via the CloudWatch agent installed through `.ebextensions`. The Lambda function gets its logs automatically through the basic-execution IAM policy (every `console.log` in the 14-step pipeline lands there).

---

## Quick map: which service does the web app vs. the Uploader vs. the Lambda pipeline touch?

| Service | Web app (EB) | Uploader (WPF, operator PC) | Pinterest-agent Lambda |
|---|---|---|---|
| Elastic Beanstalk | runs on it | restarts it (button) | — |
| EC2 | (underlying) | can reboot by tag | — |
| S3 | sitemap-cache bucket only | writes designs bucket | ai-reports, logs (read) |
| CloudFront | configures allow-list | — | — |
| DynamoDB | Items, Users, PasswordResetTokens, SubscriptionEvents | Items, Users | BusinessHistory, Items (read) |
| SES | transactional email | newsletter blasts | daily summaries/anomalies |
| Lambda | — | — | is the Lambda |
| WAF | (protected by it) | — | manages the IP set |
| ACM / Route 53 | (fronted by it) | — | — |
| CloudWatch | app logs | — | function logs |
