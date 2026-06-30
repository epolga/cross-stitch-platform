# ENVIRONMENT-SETUP.md

Complete AWS environment reconstruction guide for cross-stitch.com.
Last updated: 2026-06-30.

---

## AWS Account / Region

- Account ID: 358174257684
- Region: us-east-1 (all resources unless noted)

---

## Elastic Beanstalk (web application)

- EB Application: `cross-stitch`
- Production environment: `cross-stitch-com-env-clone`
- Platform: 64bit Amazon Linux 2023 / Node.js 22
- Environment type: Load balanced (Application Load Balancer)
- Instance port: 3000

### Recreating from saved configuration

```powershell
# From the web/ directory
eb init
eb create <new-environment-name> --cfg eb-configuration-2025-12-12
eb status
eb health
```

Saved config: `.elasticbeanstalk/saved_configs/eb-configuration-2025-12-12.cfg.yml`

### Environment variables (set in EB console — not in Git)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AWS_REGION` | us-east-1 |
| `SES_FROM_EMAIL` | Sending address for transactional email |
| `SESSION_SECRET` | Next.js session signing key |

### Deploy procedure

```powershell
# Always build before deploy
npm run build
eb deploy cross-stitch-com-env-clone
```

---

## Application Load Balancer

- Name: `awseb--AWSEB-GZMoCYlIovhH`
- ARN: `arn:aws:elasticloadbalancing:us-east-1:358174257684:loadbalancer/app/awseb--AWSEB-GZMoCYlIovhH/0bc1c1cfec968850`
- DNS: `awseb--AWSEB-GZMoCYlIovhH-630970631.us-east-1.elb.amazonaws.com`

### Listeners

- HTTP 80 → redirect to HTTPS 443
- HTTPS 443 → forward to target group
- Security policy: `ELBSecurityPolicy-TLS13-1-2-2021-06`

### TLS Certificate (ACM)

- ARN: `arn:aws:acm:us-east-1:358174257684:certificate/8c0f050c-8a28-442f-83ed-e496eda2f04f`
- SANs: `cross-stitch.com`, `www.cross-stitch.com`, `cross-stitch-pattern.net`, `www.cross-stitch-pattern.net`

### Access logging

- Enabled: yes
- Bucket: `cross-stitch-logs`
- Prefix: `alb-logs`
- Path pattern: `s3://cross-stitch-logs/alb-logs/AWSLogs/358174257684/elasticloadbalancing/us-east-1/...`

To re-enable after recreating the ALB:
```powershell
aws s3api put-bucket-policy --bucket cross-stitch-logs --policy file://alb-bucket-policy.json
aws elbv2 modify-load-balancer-attributes --load-balancer-arn <ALB-ARN> --attributes \
  "Key=access_logs.s3.enabled,Value=true" \
  "Key=access_logs.s3.bucket,Value=cross-stitch-logs" \
  "Key=access_logs.s3.prefix,Value=alb-logs"
```

Bucket policy grants `arn:aws:iam::127311923021:root` (ELB service account, us-east-1) PutObject on `arn:aws:s3:::cross-stitch-logs/alb-logs/AWSLogs/358174257684/*`.

---

## WAF (Bot Protection)

- Web ACL name: `CrossStitchBotProtection`
- Web ACL ARN: `arn:aws:wafv2:us-east-1:358174257684:regional/webacl/CrossStitchBotProtection/b6dd185d-3dac-4537-aa2f-abfd6c258676`
- Scope: REGIONAL
- Default action: Allow
- Associated with: the production ALB above

### Rules

| Rule | Priority | Action | IP Set |
|------|----------|--------|--------|
| BlockTencentCloud | 1 | Block | TencentCloud-Singapore-Bots |

### IP Set: TencentCloud-Singapore-Bots

- ID: `40a5bc43-325d-4923-98a4-55f9480f573a`
- CIDR: `43.128.0.0/11` (Tencent Cloud Singapore data center)
- Reason: confirmed bot traffic crawling design pages and calling like/config APIs (detected 2026-06-30)

### Recreating WAF after environment rebuild

```powershell
# 1. Create IP set
aws wafv2 create-ip-set --name "TencentCloud-Singapore-Bots" --scope REGIONAL \
  --ip-address-version IPV4 --addresses "43.128.0.0/11"

# 2. Create Web ACL (edit IP set ARN from step 1 output)
aws wafv2 create-web-acl --cli-input-json file://waf-acl.json

# 3. Associate with new ALB
aws wafv2 associate-web-acl --web-acl-arn <WAF-ARN> --resource-arn <ALB-ARN>
```

---

## DNS (Route 53)

### Hosted zones

- `cross-stitch.com`
- `cross-stitch-pattern.net`

### Required records (point to ALB DNS after recreation)

| Record | Type | Value |
|--------|------|-------|
| cross-stitch.com | A (ALIAS) | ALB DNS name |
| www.cross-stitch.com | CNAME | ALB DNS name |
| cross-stitch-pattern.net | A (ALIAS) | ALB DNS name |
| www.cross-stitch-pattern.net | CNAME | ALB DNS name |

---

## CloudFront

- Distribution ID: `E1CZPZ7AHZU26G`
- Domain: `d2o1uvvg91z7o4.cloudfront.net`
- Origin: `cross-stitch-designs-photos.s3.us-east-1.amazonaws.com`
- Purpose: serves design images from S3 (not the web app)

---

## Lambda — Daily Pipeline

- Function name: `cross-stitch-daily-pipeline`
- Runtime: nodejs22.x
- Memory: 1024 MB
- Timeout: 900 seconds (15 minutes)
- Handler: `handler.handler`
- IAM Role: `arn:aws:iam::358174257684:role/cross-stitch-lambda-pipeline`

### Schedule (EventBridge)

- Rule name: `cross-stitch-daily-5am`
- Cron: `cron(0 2 * * ? *)` — fires at 02:00 UTC (05:00 Israel time)
- State: ENABLED

### Pipeline steps (13 steps, run sequentially)

1. Daily business report (GA4 + AdSense data → DDB)
2. Build business history
3. Promoted ads report (Pinterest API)
4. Landing page report (GA4 by landing page)
5. Pin attribution (per-pin profit calculation → DDB)
6. Anomaly detection
7. Anomaly notifications (Telegram)
8. AI trend analysis
9. Recommendation change alert (email if advice changed)
10. Design pin map export
11. Design performance build
12. AI design analysis
13. Daily summary email (SES) + Telegram summary

### Deploying the Lambda

```powershell
# From automation/pinterest-agent/
npm run build
# Then upload the build artifact to Lambda (see deploy.ps1)
```

---

## DynamoDB Tables

All tables use on-demand billing (`PAY_PER_REQUEST`). Region: us-east-1.

### CrossStitchBusinessHistory

Primary analytics store for the daily pipeline.

- Partition key: `EntityType` (String)
- Sort key: `SortKey` (String)

| EntityType | SortKey pattern | Contents |
|------------|----------------|----------|
| `DAILY_BUSINESS` | `YYYY-MM-DD` | GA4 sessions, AdSense revenue, Pinterest spend, profit, usdIlsRate |
| `PROMOTED_AD_STATS` | `YYYY-MM-DD#adId` | Pinterest ad clicks, spend, impressions |
| `LANDING_PAGE_STATS` | `YYYY-MM-DD#url` | GA4 sessions by landing page |
| `PIN_ATTRIBUTION` | `YYYY-MM-DD#adId` | Per-pin revenue attribution and profit |
| `ANOMALY` | `YYYY-MM-DD#metric` | Detected anomalies |
| `AI_ANALYSIS` | `YYYY-MM-DD` | AI trend analysis text |
| `RECOMMENDATION` | `latest` | Current AI recommendation |
| `EXCHANGE_RATE` | `USD` | Latest USD→ILS rate from Bank of Israel |
| `PINTEREST_TOKEN` | `main` | Pinterest OAuth token (auto-refreshed 7 days before expiry) |

### CrossStitchItems

Design catalog. Contains `PinLinkType` field (DESIGN/ALBUM) used for A/B performance analysis.

### CrossStitchUsers

User accounts (email, hashed password, subscription status).

### CrossStitchLikes

User likes on designs.

### ConverterPatterns

Saved patterns from the photo-to-cross-stitch converter.

### EditorEvents

Analytics events from the pattern editor.

### Other tables

`FeatureRequests`, `PasswordResetTokens`, `SearchQueries` — self-explanatory.

---

## S3 Buckets

| Bucket | Purpose |
|--------|---------|
| `cross-stitch-designs` | Design PDF files served to users |
| `cross-stitch-designs-photos` | Design preview images (served via CloudFront) |
| `cross-stitch-designs-backup` | Backup of design files |
| `cross-stitch-ai-reports` | AI analysis reports from the Lambda pipeline |
| `cross-stitch-logs` | ALB access logs (`alb-logs/` prefix) |
| `cross-stitch-sitemap-cache` | Cached sitemap XML |
| `cross-stitch-migration` | One-time migration artifacts |
| `elasticbeanstalk-us-east-1-358174257684` | EB deployment artifacts (managed by AWS) |

---

## SES (Email)

- Region: us-east-1
- Verified domain: `cross-stitch.com`
- Verified email: `olga.epstein@gmail.com`
- Used by: daily summary email, recommendation change alerts, user transactional emails

Complaint handling: `ses-complaint-remove-subscriber` Lambda (nodejs20.x) automatically removes unsubscribed users.

---

## Security Groups

### Load Balancer SG (inbound)
- Port 80 from 0.0.0.0/0
- Port 443 from 0.0.0.0/0

### Instance SG (inbound)
- Port 3000 from Load Balancer SG only
- No SSH (port 22)

### Instance access
- Via AWS SSM Session Manager only
- IAM role must include: `AmazonSSMManagedInstanceCore`

---

## HSTS

Configured in Next.js middleware:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

---

## Health check

- Endpoint: `GET /api/health`
- ALB target group health check path: `/api/health`

---

## Post-rebuild verification checklist

- [ ] EB environment is Green
- [ ] DNS resolves to new ALB
- [ ] HTTP → HTTPS redirect works
- [ ] HTTPS works on all four domains
- [ ] TLS policy is `ELBSecurityPolicy-TLS13-1-2-2021-06`
- [ ] HSTS header present in response
- [ ] No inbound SSH on instance security group
- [ ] SSM Session Manager connects
- [ ] ALB access logging enabled → test file appears in `cross-stitch-logs/alb-logs/`
- [ ] WAF Web ACL associated with new ALB
- [ ] EventBridge rule `cross-stitch-daily-5am` is ENABLED
- [ ] Lambda fires at 02:00 UTC and completes without error
- [ ] Daily summary email arrives at `olga.epstein@gmail.com`
- [ ] Pinterest token present in DDB (`PINTEREST_TOKEN` / `main`) — if missing, run `npm run seed-pinterest-token`
