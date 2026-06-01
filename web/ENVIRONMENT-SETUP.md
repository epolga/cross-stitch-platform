# ENVIRONMENT-SETUP.md

## Purpose
This document describes how to recreate the production Elastic Beanstalk environment and verify security, HTTPS, and operational posture.

## AWS Account / Region
- Account ID: 358174257684
- Region: us-east-1

## Application / Environment
- Elastic Beanstalk Application: cross-stitch
- Current production environment: cross-stitch-com-env-clone
- Platform: 64bit Amazon Linux 2023 running Node.js 20
- Environment type: Load balanced (Application Load Balancer)

## Source of truth
- Application code and configuration in this repository
- Elastic Beanstalk saved configuration:
  .elasticbeanstalk/saved_configs/eb-configuration-2025-12-12.cfg.yml

---

## Creating a new environment from the saved configuration

### Prerequisites
- AWS CLI configured
- EB CLI installed
- You are in the repository root (folder contains .elasticbeanstalk)

### Commands (PowerShell)
```powershell
eb init
eb config list
eb create <new-environment-name> --cfg eb-configuration-2025-12-12
```

Check status:
```powershell
eb status
eb health
```

---

## DNS configuration (Route 53)

### Hosted zones
- cross-stitch-pattern.net
- cross-stitch.com

### Required records
Point DNS to the Application Load Balancer DNS name created by the environment:

- cross-stitch-pattern.net      → A (ALIAS) → <ALB-DNS>
- www.cross-stitch-pattern.net  → CNAME     → <ALB-DNS>
- cross-stitch.com              → A (ALIAS) → <ALB-DNS>
- www.cross-stitch.com          → CNAME     → <ALB-DNS>

### Verification
- http://<domain> redirects to https://<domain>
- HTTPS works for both apex and www

---

## TLS / SSL configuration

### Load Balancer listener
- HTTPS : 443
- Security policy:
  ELBSecurityPolicy-TLS13-1-2-2021-06

### Certificate
- Managed by AWS ACM (us-east-1)
- SANs:
  - cross-stitch.com
  - www.cross-stitch.com
  - cross-stitch-pattern.net
  - www.cross-stitch-pattern.net

### SSL Labs expectations
- TLS 1.3: Yes
- TLS 1.2: Yes
- TLS 1.1: No
- TLS 1.0: No
- Expected grade: A or A+

---

## HSTS (HTTP Strict Transport Security)

Configured at application level (Next.js middleware).

Current header:
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload

Verification:
- Chrome DevTools → Network → Response Headers

---

## Health checks

- Health endpoint: GET /api/health
- ALB target group health check path: /api/health

Environment should remain Green.

---

## Instance access (no SSH)

- Inbound SSH (22) must NOT exist in instance security group
- Instance access via AWS SSM Session Manager only

### Instance IAM role must include:
- AmazonSSMManagedInstanceCore

### Session Manager logging
- Enabled to CloudWatch Logs
- Log group: /aws/ssm/session-logs

---

## Security Groups (expected)

### Load Balancer SG (inbound)
- 80  from 0.0.0.0/0
- 443 from 0.0.0.0/0

### Instance SG (inbound)
- Application port (3000) from Load Balancer SG only
- No SSH (22)

### Outbound
- Allow all (default)

---

## Logging

### Elastic Beanstalk logs
- Stored in S3 bucket:
  elasticbeanstalk-us-east-1-358174257684

### SSM session logs
- CloudWatch log group: /aws/ssm/session-logs

---

## Post-deploy verification checklist

1. DNS resolves to correct ALB
2. HTTP → HTTPS redirect works
3. TLS policy is TLS13-1-2-2021-06
4. HSTS header present
5. EB environment Green
6. Target group Healthy
7. No inbound SSH
8. SSM Session Manager works

---

## Secrets and environment variables

Do NOT store secrets in Git.

Use:
- Elastic Beanstalk environment variables
- AWS SSM Parameter Store

Required variable names (values stored outside Git):
- DATABASE_URL
- AWS_REGION
- SES_FROM_EMAIL
- SESSION_SECRET
